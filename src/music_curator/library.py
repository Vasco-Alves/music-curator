"""Read a music collection for the browser app: tags, length, bitrate and cover.

Pure Python for MP3s (ID3v2.2/2.3/2.4 plus the first MPEG frame), so a whole library is indexed in seconds instead of
one ffprobe call per file. Other formats are listed from their filename and still play in the browser.
"""
import os
import re
import subprocess

from .tagwriter import _BITRATES, _RATES

AUDIO = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".ogg": "audio/ogg",
         ".opus": "audio/ogg", ".wav": "audio/wav"}
_TEXT_FRAMES = {"TIT2": "title", "TT2": "title", "TPE1": "artist", "TP1": "artist", "TALB": "album", "TAL": "album",
                "TCON": "genre", "TCO": "genre", "TYER": "year", "TYE": "year", "TDRC": "year", "TDOR": "year"}
_ENCODINGS = {0: "latin-1", 1: "utf-16", 2: "utf-16-be", 3: "utf-8"}


def _syncsafe(b):
    return (b[0] & 0x7F) << 21 | (b[1] & 0x7F) << 14 | (b[2] & 0x7F) << 7 | (b[3] & 0x7F)


def _decode(raw, enc):
    return raw.decode(_ENCODINGS.get(enc, "latin-1"), "replace")


def _text(body):
    if not body:
        return ""
    parts = [p.strip() for p in _decode(body[1:], body[0]).split("\x00")]
    return " & ".join(p for p in parts if p)


def _split_terminated(data, enc):
    """(text before the string terminator, what follows it); UTF-16 terminators are two zero bytes on a 2-byte boundary."""
    if enc in (1, 2):
        for i in range(0, len(data) - 1, 2):
            if data[i] == 0 and data[i + 1] == 0:
                return data[:i], data[i + 2:]
        return data, b""
    i = data.find(b"\x00")
    return (data, b"") if i < 0 else (data[:i], data[i + 1:])


def _valid_id(data, pos, idlen):
    fid = data[pos:pos + idlen]
    return len(fid) == idlen and all(48 <= c <= 57 or 65 <= c <= 90 for c in fid)


def _frames(path):
    """Yield (frame id, body) of the ID3v2 tag; also returns where the audio starts via the 'start' frame."""
    with open(path, "rb") as f:
        head = f.read(10)
        if len(head) < 10 or head[:3] != b"ID3" or head[3] in (0xFF, 0) or any(c & 0x80 for c in head[6:10]):
            yield "start", 0
            return
        ver, flags, size = head[3], head[5], _syncsafe(head[6:10])
        data = f.read(size)
    yield "start", 10 + size + (10 if ver == 4 and flags & 0x10 else 0)
    if flags & 0x80 and ver < 4:
        data = data.replace(b"\xff\x00", b"\xff")
    pos = 0
    if flags & 0x40:  # extended header
        pos = _syncsafe(data[:4]) if ver == 4 else int.from_bytes(data[:4], "big") + 4
    idlen, hdr = (3, 6) if ver == 2 else (4, 10)
    while pos + hdr <= len(data) and _valid_id(data, pos, idlen):
        fid = data[pos:pos + idlen].decode("latin-1")
        fl = 0
        if ver == 2:
            n = int.from_bytes(data[pos + 3:pos + 6], "big")
        elif ver == 3:
            n, fl = int.from_bytes(data[pos + 4:pos + 8], "big"), data[pos + 9]
        else:
            n, fl = _syncsafe(data[pos + 4:pos + 8]), data[pos + 9]
            big = int.from_bytes(data[pos + 4:pos + 8], "big")  # some taggers write plain sizes in v2.4
            end = pos + hdr + n
            if big != n and end < len(data) and not _valid_id(data, end, idlen) and data[end:end + 1] != b"\x00" \
                    and _valid_id(data, pos + hdr + big, idlen):
                n = big
        body = data[pos + hdr:pos + hdr + n]
        pos += hdr + n
        if ver == 3 and fl & 0xC0:  # compressed / encrypted
            continue
        if ver == 4:
            if fl & 0x0C:
                continue
            if fl & 0x02:
                body = body.replace(b"\xff\x00", b"\xff")
            if fl & 0x01:
                body = body[4:]
        if body:
            yield fid, body


def _picture(fid, body):
    """(picture type, mime, image bytes) from an APIC/PIC frame."""
    enc = body[0]
    if fid == "PIC":
        fmt = body[1:4].decode("latin-1").upper()
        mime, kind, rest = ("image/png" if fmt == "PNG" else "image/jpeg"), body[4], body[5:]
    else:
        raw_mime, rest = _split_terminated(body[1:], 0)
        mime = raw_mime.decode("latin-1").lower()
        kind, rest = rest[0], rest[1:]
    _, image = _split_terminated(rest, enc)
    if image[:2] == b"\xff\xd8":
        mime = "image/jpeg"
    elif image[:4] == b"\x89PNG":
        mime = "image/png"
    elif mime not in ("image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"):  # a tag can claim anything
        mime = "image/jpeg"
    return kind, mime, image


def _mpeg_header(b, i):
    if i + 4 > len(b) or b[i] != 0xFF or (b[i + 1] & 0xE0) != 0xE0:
        return None
    ver, lay, br, sr = (b[i + 1] >> 3) & 3, (b[i + 1] >> 1) & 3, b[i + 2] >> 4, (b[i + 2] >> 2) & 3
    if ver == 1 or lay == 0 or br in (0, 15) or sr == 3:
        return None
    layer, mpeg1 = 4 - lay, ver == 3
    kbps, rate, pad = _BITRATES[(mpeg1, layer)][br - 1], _RATES[ver][sr], (b[i + 2] >> 1) & 1
    samples = 384 if layer == 1 else 1152 if layer == 2 or mpeg1 else 576
    size = (12 * kbps * 1000 // rate + pad) * 4 if layer == 1 else samples // 8 * kbps * 1000 // rate + pad
    return dict(kbps=kbps, rate=rate, samples=samples, size=size, mono=(b[i + 3] >> 6) == 3, mpeg1=mpeg1)


def mp3_info(path, start):
    """Length (s) and average bitrate (kbps) from the first MPEG frame and its Xing/Info/VBRI header, if any."""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(start)
        buf = f.read(256 * 1024)
        f.seek(max(0, size - 128))
        tail = 128 if f.read(3) == b"TAG" else 0
    for i in range(len(buf) - 4):
        h = _mpeg_header(buf, i)
        if h and (i + h["size"] + 4 > len(buf) or _mpeg_header(buf, i + h["size"])):
            break
    else:
        return None
    audio = max(0, size - start - i - tail)
    off = (21 if h["mono"] else 36) if h["mpeg1"] else (13 if h["mono"] else 21)
    frames = None
    if buf[i + off:i + off + 4] in (b"Xing", b"Info") and int.from_bytes(buf[i + off + 4:i + off + 8], "big") & 1:
        frames = int.from_bytes(buf[i + off + 8:i + off + 12], "big")
    elif buf[i + 36:i + 40] == b"VBRI":
        frames = int.from_bytes(buf[i + 50:i + 54], "big")
    if frames:
        secs = frames * h["samples"] / h["rate"]
        return dict(secs=round(secs, 2), kbps=round(audio * 8 / secs / 1000) if secs else h["kbps"])
    return dict(secs=round(audio * 8 / (h["kbps"] * 1000), 2), kbps=h["kbps"])


def _clean_year(y):
    m = re.match(r"\s*(\d{4})", y or "")
    return m.group(1) if m and m.group(1) != "0000" else ""


def _clean_name(s):
    return "" if s.strip().strip("()<>[]").lower() in ("unknown", "unknown artist", "unknown title", "untitled") else s


def _clean_genre(g):
    g = re.sub(r"^\(\d+\)", "", (g or "").strip()).strip()  # "(17)Rock" -> "Rock"; a bare number says nothing
    return "" if g.isdigit() else g


def _ffprobe_secs(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                           capture_output=True, text=True, timeout=20)
        return round(float(r.stdout.strip()), 2)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def read_song(path, name=None):
    """Tags and audio facts of one file. Missing tags fall back to '<artist> - <title>' in the filename (`name`, for a temporary copy)."""
    name = name or path
    stem = os.path.splitext(os.path.basename(name))[0]
    out = dict(title="", artist="", album="", year="", genre="", comment="", cover=False, secs=None, kbps=None)
    if os.path.splitext(name)[1].lower() == ".mp3":
        start = 0
        try:
            for fid, body in _frames(path):
                if fid == "start":
                    start = body
                elif fid in _TEXT_FRAMES and not out[_TEXT_FRAMES[fid]]:
                    out[_TEXT_FRAMES[fid]] = _text(body)
                elif fid in ("COMM", "COM") and not out["comment"] and len(body) > 4:
                    enc, rest = body[0], body[4:]
                    _, text = _split_terminated(rest, enc)
                    out["comment"] = _decode(text, enc).strip("\x00 \r\n\t")
                elif fid in ("APIC", "PIC"):
                    out["cover"] = True
            info = mp3_info(path, start)
            if info:
                out.update(info)
        except (OSError, IndexError, KeyError):
            pass  # a damaged file is still listed by name
    if out["secs"] is None:  # not really an MP3 (AAC with a .mp3 name, ...) or another format: ask ffprobe once
        out["secs"] = _ffprobe_secs(path)
    out["year"], out["genre"] = _clean_year(out["year"]), _clean_genre(out["genre"])
    out["title"], out["artist"] = _clean_name(out["title"]), _clean_name(out["artist"])
    out["tagless"] = not out["title"] and not out["artist"]  # players go by the file's name
    if not out["title"]:
        if " - " in stem and not out["artist"]:
            out["artist"], out["title"] = [s.strip() for s in stem.split(" - ", 1)]
        else:
            out["title"] = stem
    return out


def read_cover(path):
    """(image bytes, mime) of the front cover, else the first picture, else None."""
    if os.path.splitext(path)[1].lower() != ".mp3":
        return None
    best = None
    try:
        for fid, body in _frames(path):
            if fid in ("APIC", "PIC"):
                kind, mime, image = _picture(fid, body)
                if image and (best is None or kind == 3):
                    best = (image, mime)
                    if kind == 3:
                        break
    except (OSError, IndexError):
        return None
    return best
