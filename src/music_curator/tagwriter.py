#!/usr/bin/env python3
"""Copy source songs into the library with clean tags and an embedded front cover.

Originals are never modified. For an MP3 the audio bytes of the source are copied unchanged
(old ID3v2 / ID3v1 / APEv2 tags stripped), a fresh ID3v2.3 tag is prepended (TIT2, TPE1, TALB,
TCON, TYER, COMM = Discogs link, APIC = front cover). FLAC and M4A go through ffmpeg with the
audio stream copied, never re-encoded. Each is written to <library>/<genre>/<Artist> - <Title>,
keeping its file type, and checked packet by packet against the source. One row per track goes
to the log CSV.

Usage: curator write <plan.json> [--dry-run]

plan.json: [{"key","src","artist","title","album","year","genre","discogs","cover","notes"}]
"""
import csv
import datetime
import json
import os
import re
import struct
import subprocess
import sys
import unicodedata

from . import config

FORBIDDEN = {"/": "-", "\\": "-", ":": " -", "*": "", "?": "", '"': "'", "<": "", ">": "", "|": "-"}
LOG_FIELDS = ["date", "status", "src", "src_artist", "src_album", "src_title", "src_secs",
              "dest", "artist", "title", "album", "year", "genre", "discogs", "cover", "notes"]
PADDING = 2048  # spare room so later tag edits don't have to rewrite the file
KINDS = {".mp3": ("mp3",), ".flac": ("flac",), ".m4a": ("aac", "alac")}  # what can go in the library, and the audio each kind of file may hold
REMUX_TIMEOUT_S = 300  # no decoding, so even a long file takes seconds
AUTO_NOTE, PICK_NOTE = "matched automatically", "picked by you"  # in the log's notes of what Curate added with nobody double-checking: the page shows these songs as Auto-matched
TAKEN_BACK = "removed: not right"  # a log status: Curate's match was wrong, so the copy left the library and the song is to be looked at again
NOT_RIGHT = "you said it wasn't right"  # in that row's notes, with whatever you said after it


# ---------------- what the log says ----------------

def written_sources(rows, key=lambda src: src):
    """(the sources the log has written into the library, {source: what you said} for the ones taken back out since because the match was wrong).
    A source goes by its latest word, so one that's added again after being taken back counts as written."""
    done, back = set(), {}
    for r in rows:
        src, status = key(r.get("src") or ""), r.get("status") or ""
        if not src:
            continue
        if status == "ok" or status.startswith("check"):  # "check": written, with something to look at
            done.add(src)
            back.pop(src, None)
        elif status.startswith(TAKEN_BACK):
            done.discard(src)
            said = next((p.strip()[len(NOT_RIGHT):].lstrip(" :") for p in (r.get("notes") or "").split(";") if p.strip().startswith(NOT_RIGHT)), "")
            back[src] = said
    return done, back


# ---------------- filenames ----------------

def safe_filename(name):
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r"[​-‏‪-‮﻿]", "", name)  # invisible marks
    for bad, good in FORBIDDEN.items():
        name = name.replace(bad, good)
    return re.sub(r"\s+", " ", name).strip().rstrip(". ")


def norm_key(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[\W_]", "", s.lower())  # letters of any script: "A - 東京" and "A - 大阪" are different songs


# ---------------- ID3v2.3 writing ----------------

def _syncsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def _enc(s):
    """(encoding byte, encoded text, terminator) — ISO-8859-1 when possible, else UTF-16 with BOM."""
    try:
        return b"\x00", s.encode("latin-1"), b"\x00"
    except UnicodeEncodeError:
        return b"\x01", s.encode("utf-16"), b"\x00\x00"


def _frame(fid, body):
    return fid.encode("ascii") + struct.pack(">I", len(body)) + b"\x00\x00" + body


def text_frame(fid, s):
    e, t, _ = _enc(s)
    return _frame(fid, e + t)


def comm_frame(s):
    e, t, term = _enc(s)
    desc = b"" if e == b"\x00" else "".encode("utf-16")
    return _frame("COMM", e + b"eng" + desc + term + t)


def apic_frame(jpeg):
    return _frame("APIC", b"\x00" + b"image/jpeg\x00" + b"\x03" + b"Cover (front)\x00" + jpeg)


def build_tag(e, cover_bytes):
    frames = text_frame("TIT2", e["title"]) + text_frame("TPE1", e["artist"])
    if e.get("album"):
        frames += text_frame("TALB", e["album"])
    frames += text_frame("TCON", e["genre"])
    if str(e.get("year") or ""):
        frames += text_frame("TYER", str(e["year"]))
    if e.get("discogs"):
        frames += comm_frame(e["discogs"])
    if cover_bytes:
        frames += apic_frame(cover_bytes)
    body = frames + b"\x00" * PADDING
    return b"ID3\x03\x00\x00" + _syncsafe(len(body)) + body


_BITRATES = {  # kbps by (MPEG-1?, layer) for bitrate index 1..14
    (True, 3): [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (True, 2): [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    (True, 1): [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    (False, 3): [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    (False, 2): [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    (False, 1): [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
}
_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}  # by version bits


def _frame_len(data, i):
    """Length of the MPEG audio frame whose header starts at i, or 0 if there is no valid header there."""
    if i + 4 > len(data) or data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
        return 0
    ver, layer_bits = (data[i + 1] >> 3) & 3, (data[i + 1] >> 1) & 3
    br_idx, sr_idx, pad = data[i + 2] >> 4, (data[i + 2] >> 2) & 3, (data[i + 2] >> 1) & 1
    if ver == 1 or layer_bits == 0 or br_idx in (0, 15) or sr_idx == 3:
        return 0
    layer, mpeg1 = 4 - layer_bits, ver == 3
    br, sr = _BITRATES[(mpeg1, layer)][br_idx - 1] * 1000, _RATES[ver][sr_idx]
    if layer == 1:
        return (12 * br // sr + pad) * 4
    return (144 if (mpeg1 or layer == 2) else 72) * br // sr + pad


def _first_frame(data, start, limit=65536):
    """First position at or after start where a valid frame is followed by another valid frame."""
    for i in range(start, min(len(data) - 4, start + limit)):
        n = _frame_len(data, i)
        if n and _frame_len(data, i + n):
            return i
    return None


def audio_payload(data):
    """Return the MPEG audio bytes with every ID3v2 (start), ID3v1 and APEv2 (end) tag removed.
    Bytes before the first confirmed frame (e.g. a partial frame left by an old cut) are dropped;
    decoders skip them anyway, and the writer's audio check confirms nothing audible changed."""
    start = 0
    while data[start:start + 3] == b"ID3" and len(data) >= start + 10:
        flags = data[start + 5]
        size = (data[start + 6] << 21) | (data[start + 7] << 14) | (data[start + 8] << 7) | data[start + 9]
        start += 10 + size + (10 if flags & 0x10 else 0)
    while start < len(data) and data[start] == 0:  # stray padding outside the declared tag size
        start += 1
    end = len(data)
    if end - start >= 128 and data[end - 128:end - 125] == b"TAG":
        end -= 128
    if end - start >= 32 and data[end - 32:end - 24] == b"APETAGEX":
        ape_size = struct.unpack("<I", data[end - 20:end - 16])[0]
        ape_flags = struct.unpack("<I", data[end - 12:end - 8])[0]
        end -= ape_size + (32 if ape_flags & 0x80000000 else 0)
    first = start if (_frame_len(data, start) and _frame_len(data, start + _frame_len(data, start))) else _first_frame(data, start)
    if first is None or first >= end:
        raise ValueError("no MPEG audio frames found after stripping tags")
    return data[first:end]


# ---------------- checks ----------------

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams",
                          "--", path], capture_output=True, text=True, encoding="utf-8").stdout
    d = json.loads(out or "{}")
    tags = {k.lower(): v for k, v in (d.get("format", {}).get("tags") or {}).items()}
    streams = d.get("streams", [])
    return {"tags": tags, "secs": round(float(d.get("format", {}).get("duration", 0) or 0), 2),
            "codec": next((s.get("codec_name") for s in streams if s.get("codec_type") == "audio"), None),
            "pics": [s for s in streams if s.get("codec_type") == "video"]}


def audio_packets(path):
    """MD5 of every audio packet ffmpeg reads from the file (stream copy, nothing decoded)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-map", "0:a:0",
                        "-c", "copy", "-f", "framemd5", "-"], capture_output=True, text=True)
    return [ln.rsplit(",", 1)[-1].strip() for ln in r.stdout.splitlines() if ln and not ln.startswith("#")]


def tail_fragment(payload):
    """Bytes left after the last complete frame when the frames run cleanly to the end (0 = clean ending).
    None when sync is lost earlier, so the ending can't be judged this way."""
    i = 0
    while i < len(payload):
        n = _frame_len(payload, i)
        if not n or i + n > len(payload):
            rest = len(payload) - i
            return rest if rest < 2048 else None
        i += n
    return 0


def compare_audio(dest, audio_src, payload):
    """Does ffmpeg read the same audio from the written file as from its source? Returns (ok, note).
    Old rips often end in a cut-off scrap of a frame followed by an ID3v1 tag. Once that tag is stripped,
    ffmpeg reads the scrap a little differently (at most one 26 ms frame at the very end), so a difference
    confined to the last packet is accepted when the audio really ends in such a scrap. The bytes
    themselves are written unchanged either way."""
    a, b = audio_packets(audio_src), audio_packets(dest)
    if not a or not b:  # ffmpeg read nothing from one of them: it was stopped, or couldn't read the file. Two nothings are equal, and prove nothing
        return False, "the audio couldn't be read back to check it against the source"
    if a == b:
        return True, ""
    same = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
    frag = tail_fragment(payload) if payload else None
    if frag and abs(len(a) - len(b)) <= 1 and same >= min(len(a), len(b)) - 1:
        return True, f"audio identical except the cut-off scrap at the very end ({frag} bytes)"
    return False, f"audio differs from source (from packet {same} of {len(a)})"


# ---------------- FLAC and M4A ----------------

def remux(src, dst, tags, cover=None, keep=False):
    """Put a FLAC or M4A file's audio, untouched, into `dst` with these tags. ffmpeg only rewrites what's around the audio: nothing is re-encoded.
    With `keep`, the tags and cover the file already has stay, apart from the ones named here. Raises ValueError if ffmpeg can't do it."""
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", src]
    if cover:
        cmd += ["-f", "image2", "-pattern_type", "none", "-i", cover]  # so a % in the path isn't read as a numbered series of images
    cmd += ["-map", "0:a:0"] + (["-map", "0:v?"] if keep else ["-map_metadata", "-1", "-map_chapters", "-1"])
    if cover:
        cmd += ["-map", "1:v:0", "-disposition:v:0", "attached_pic"]
    cmd += ["-c", "copy", "-fflags", "+bitexact"]
    for name, value in tags.items():
        cmd += ["-metadata", f"{name}={value}"]
    if dst.lower().endswith(".m4a"):
        cmd += ["-movflags", "+faststart"]  # so a player can start it before it has read the whole file
    done = subprocess.run([*cmd, dst], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=REMUX_TIMEOUT_S)
    if done.returncode:
        raise ValueError((done.stderr or "ffmpeg couldn't write it").strip()[-300:])


def _write_remuxed(src, tmp, e, cover):
    """The temporary file for a FLAC or M4A entry. If the cover is what ffmpeg can't take, the song goes without it, and the check afterwards says so."""
    tags = dict(title=e["title"], artist=e["artist"], album=e.get("album", ""), genre=e["genre"], date=str(e.get("year") or ""), comment=e.get("discogs", ""))
    try:
        try:
            remux(src, tmp, tags, cover)
        except ValueError:
            if not cover:
                raise
            remux(src, tmp, tags)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


# ---------------- main ----------------

class Writer:
    """Writes plan entries into the library one at a time and logs each, so whatever stops a run, what's written is on record."""

    def __init__(self, lib, log_path, dry=False, say=print):
        self.lib, self.dry, self.say = lib, dry, say
        self.existing = {}
        for dp, _, fns in os.walk(lib):
            for fn in fns:
                if os.path.splitext(fn)[1].lower() in KINDS:
                    self.existing.setdefault(norm_key(os.path.splitext(fn)[0]), os.path.join(dp, fn))
        new_log = not dry and (not os.path.exists(log_path) or os.path.getsize(log_path) == 0)
        unfinished = False
        if not dry and not new_log:
            with open(log_path, "rb") as f:
                f.seek(-1, os.SEEK_END)
                unfinished = f.read(1) not in (b"\n", b"\r")  # a run that was cut off mid-line
        self.logf = open(os.devnull if dry else log_path, "a", newline="", encoding="utf-8-sig")  # a dry run leaves no trace
        if unfinished:
            self.logf.write("\r\n")
        self.log = csv.DictWriter(self.logf, fieldnames=LOG_FIELDS)
        if new_log:
            self.log.writeheader()

    def close(self):
        self.logf.close()

    def _logged(self, row):
        self.log.writerow(row)
        self.logf.flush()
        return row

    def write(self, e):
        """Write one plan entry. Returns its log row: "status" says what happened ("ok", "check: ...", "skipped: ...", "error: ..."; "dry" in a dry run)."""
        lib, dry, existing, say = self.lib, self.dry, self.existing, self.say
        fields = dict(artist=e["artist"], title=e["title"], album=e.get("album", ""), year=e.get("year", ""), genre=e["genre"])
        # a song with no known artist is named by its title alone (not " - Title")
        base = safe_filename(config.rule("filename").format(**fields) if fields["artist"] else fields["title"])
        # folder may be nested, e.g. "Game OST\Re-Volt"; each part is made filename-safe
        folder = e.get("folder") or config.rule("folder").format(**fields)
        dest_dir = os.path.join(lib, *[safe_filename(p) for p in re.split(r"[\\/]", folder) if p])
        audio_src = e.get("audio") or e["src"]  # "audio": a verified better copy replacing the original's sound
        kind = os.path.splitext(audio_src)[1].lower()
        ending = kind if kind in KINDS else ".mp3"  # the song stays the type of file it is
        dest = os.path.join(dest_dir, base + ending)
        src = probe(audio_src)
        # the log keeps the ORIGINAL's tags and length (what playlists know), even when a better copy supplies the sound
        orig = src if audio_src == e["src"] else probe(e["src"])
        orig_tags = orig["tags"]
        # many downloaders store the video link in the Comment tag: keep it in the log
        source_link = orig_tags.get("comment", "") if "youtu" in orig_tags.get("comment", "") else ""
        row = {"date": datetime.datetime.now().isoformat(timespec="seconds"), "src": e["src"],
               "src_artist": orig_tags.get("artist", ""), "src_album": orig_tags.get("album", ""),
               "src_title": orig_tags.get("title", ""), "src_secs": orig["secs"], "dest": dest,
               "artist": e["artist"], "title": e["title"], "album": e.get("album", ""), "year": e["year"],
               "genre": e["genre"], "discogs": e.get("discogs", ""),
               "cover": os.path.basename(e.get("cover") or ""),
               "notes": "; ".join(x for x in (e.get("notes", ""), f"downloaded from {source_link}" if source_link else "") if x)}

        dup = existing.get(norm_key(base))
        if os.path.exists(dest) or dup:
            row["status"] = "skipped: already in library (" + (dup or dest) + ")"
            say(f"[{e['key']}] SKIP  {base}  -> already at {dup or dest}")
            return self._logged(row)
        if src["codec"] not in KINDS[ending]:
            row["status"] = f"skipped: source is {src['codec']}, not {ending[1:]}"
            say(f"[{e['key']}] SKIP  {base}: {row['status']}")
            return self._logged(row)
        if dry:
            say(f"[{e['key']}] DRY   {dest}")
            row["status"] = "dry"
            return row

        tmp = None
        try:
            payload = None
            if ending == ".mp3":
                with open(audio_src, "rb") as f:
                    payload = audio_payload(f.read())
            cover = None
            if e.get("cover") and os.path.exists(e["cover"]):
                with open(e["cover"], "rb") as f:
                    cover = f.read()
            os.makedirs(dest_dir, exist_ok=True)
            tmp = os.path.join(dest_dir, f".tmp_{e['key']}{ending}")
            if ending == ".mp3":
                with open(tmp, "wb") as f:
                    f.write(build_tag(e, cover))
                    f.write(payload)
            else:
                _write_remuxed(audio_src, tmp, e, e["cover"] if cover else None)
            os.replace(tmp, dest)
        except BaseException as ex:  # noqa: BLE001
            try:  # a half-written copy isn't left lying in your library
                if tmp and os.path.exists(tmp):
                    os.remove(tmp)
            except OSError:
                pass
            if not isinstance(ex, Exception):  # Ctrl+C and the like still stop the run
                raise
            row["status"] = f"error: {ex}"
            say(f"[{e['key']}] ERROR {base}: {ex}")
            return self._logged(row)

        problems = []
        try:  # the song is in your library from here on: whatever goes wrong with the check, the log has to say it's there
            out = probe(dest)
            for k, want in (("title", e["title"]), ("artist", e["artist"]), ("genre", e["genre"]),
                            ("date", str(e["year"])), ("album", e.get("album", "")), ("comment", e.get("discogs", ""))):
                if (out["tags"].get(k) or "") != (want or ""):
                    problems.append(f"{k}={out['tags'].get(k)!r}")
            if abs(out["secs"] - src["secs"]) > 0.2:
                problems.append(f"duration {src['secs']} -> {out['secs']}")
            if cover and not out["pics"]:
                problems.append("cover missing")
            audio_ok, audio_note = compare_audio(dest, audio_src, payload)
            if not audio_ok:
                problems.append(audio_note)
            elif audio_note:
                row["notes"] = "; ".join(x for x in (row["notes"], audio_note) if x)
        except BaseException as ex:  # noqa: BLE001
            problems.append(f"the new copy couldn't be checked after it was written ({str(ex) or type(ex).__name__})")
            if not isinstance(ex, Exception):  # Ctrl+C in the middle of the check: the row is written first, then the run stops
                row["status"] = "check: " + "; ".join(problems)
                self._logged(row)
                raise
        row["status"] = "ok" if not problems else "check: " + "; ".join(problems)
        existing[norm_key(base)] = dest
        say(f"[{e['key']}] {row['status'].upper():<5} {os.path.relpath(dest, lib)}")
        return self._logged(row)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    plan_path, lib, log_path = argv[0:3]
    plan = json.load(open(plan_path, encoding="utf-8"))
    writer = Writer(lib, log_path, "--dry-run" in argv)
    try:
        for e in plan:
            writer.write(e)
    finally:
        writer.close()


if __name__ == "__main__":
    main()
