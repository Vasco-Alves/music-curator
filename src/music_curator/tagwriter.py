#!/usr/bin/env python3
"""Copy source MP3s into the library with clean ID3v2.3 tags and an embedded front cover.

Originals are never modified. For each plan entry the audio bytes of the source are copied
unchanged (old ID3v2 / ID3v1 / APEv2 tags stripped), a fresh ID3v2.3 tag is prepended
(TIT2, TPE1, TALB, TCON, TYER, COMM = Discogs link, APIC = front cover), and the result
is written to <library>/<genre>/<Artist> - <Title>.mp3. One row per track goes to the log CSV.

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
    return re.sub(r"[^a-z0-9]", "", s.lower())


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


def audio_payload(data):
    """Return the MPEG audio bytes with every ID3v2 (start), ID3v1 and APEv2 (end) tag removed."""
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
    payload = data[start:end]
    if len(payload) < 4 or payload[0] != 0xFF or (payload[1] & 0xE0) != 0xE0:
        raise ValueError("audio does not start with an MPEG frame after stripping tags")
    return payload


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


def audio_md5(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-map", "0:a:0",
                        "-c", "copy", "-f", "md5", "-"], capture_output=True, text=True)
    return r.stdout.strip()


# ---------------- main ----------------

def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    plan_path, lib, log_path = argv[0:3]
    dry = "--dry-run" in argv
    plan = json.load(open(plan_path, encoding="utf-8"))

    existing = {}
    for dp, _, fns in os.walk(lib):
        for fn in fns:
            if fn.lower().endswith(".mp3"):
                existing.setdefault(norm_key(os.path.splitext(fn)[0]), os.path.join(dp, fn))

    new_log = not os.path.exists(log_path)
    logf = open(log_path, "a", newline="", encoding="utf-8-sig")
    log = csv.DictWriter(logf, fieldnames=LOG_FIELDS)
    if new_log:
        log.writeheader()

    for e in plan:
        fields = dict(artist=e["artist"], title=e["title"], album=e.get("album", ""), year=e.get("year", ""), genre=e["genre"])
        base = safe_filename(config.rule("filename").format(**fields))
        # folder may be nested, e.g. "Game OST\Re-Volt"; each part is made filename-safe
        folder = e.get("folder") or config.rule("folder").format(**fields)
        dest_dir = os.path.join(lib, *[safe_filename(p) for p in re.split(r"[\\/]", folder) if p])
        dest = os.path.join(dest_dir, base + ".mp3")
        audio_src = e.get("audio") or e["src"]  # "audio": a verified better copy replacing the original's sound
        src = probe(audio_src)
        # many downloaders store the video link in the Comment tag: keep it in the log
        orig_tags = src["tags"] if audio_src == e["src"] else probe(e["src"])["tags"]
        source_link = orig_tags.get("comment", "") if "youtu" in orig_tags.get("comment", "") else ""
        row = {"date": datetime.datetime.now().isoformat(timespec="seconds"), "src": e["src"],
               "src_artist": src["tags"].get("artist", ""), "src_album": src["tags"].get("album", ""),
               "src_title": src["tags"].get("title", ""), "src_secs": src["secs"], "dest": dest,
               "artist": e["artist"], "title": e["title"], "album": e.get("album", ""), "year": e["year"],
               "genre": e["genre"], "discogs": e.get("discogs", ""),
               "cover": os.path.basename(e.get("cover") or ""),
               "notes": "; ".join(x for x in (e.get("notes", ""), f"downloaded from {source_link}" if source_link else "") if x)}

        dup = existing.get(norm_key(base))
        if os.path.exists(dest) or dup:
            row["status"] = "skipped: already in library (" + (dup or dest) + ")"
            print(f"[{e['key']}] SKIP  {base}  -> already at {dup or dest}")
            log.writerow(row)
            continue
        if src["codec"] != "mp3":
            row["status"] = f"skipped: source is {src['codec']}, not mp3"
            print(f"[{e['key']}] SKIP  {base}: {row['status']}")
            log.writerow(row)
            continue
        if dry:
            print(f"[{e['key']}] DRY   {dest}")
            continue

        try:
            with open(audio_src, "rb") as f:
                payload = audio_payload(f.read())
            cover = open(e["cover"], "rb").read() if e.get("cover") and os.path.exists(e["cover"]) else None
            os.makedirs(dest_dir, exist_ok=True)
            tmp = os.path.join(dest_dir, f".tmp_{e['key']}.mp3")
            with open(tmp, "wb") as f:
                f.write(build_tag(e, cover))
                f.write(payload)
            os.replace(tmp, dest)
        except Exception as ex:  # noqa: BLE001
            row["status"] = f"error: {ex}"
            print(f"[{e['key']}] ERROR {base}: {ex}")
            log.writerow(row)
            continue

        out = probe(dest)
        problems = []
        for k, want in (("title", e["title"]), ("artist", e["artist"]), ("genre", e["genre"]),
                        ("date", str(e["year"])), ("album", e.get("album", "")), ("comment", e.get("discogs", ""))):
            if (out["tags"].get(k) or "") != (want or ""):
                problems.append(f"{k}={out['tags'].get(k)!r}")
        if abs(out["secs"] - src["secs"]) > 0.2:
            problems.append(f"duration {src['secs']} -> {out['secs']}")
        if cover and not out["pics"]:
            problems.append("cover missing")
        if audio_md5(dest) != audio_md5(audio_src):
            problems.append("audio differs from source")
        row["status"] = "ok" if not problems else "check: " + "; ".join(problems)
        existing[norm_key(base)] = dest
        log.writerow(row)
        print(f"[{e['key']}] {row['status'].upper():<5} {os.path.relpath(dest, lib)}")
    logf.close()


if __name__ == "__main__":
    main()
