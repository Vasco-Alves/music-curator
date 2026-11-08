#!/usr/bin/env python3
"""Parse inbox filenames (+ existing tags) into artist / title / hints, and triage them.

Usage: curator parse <out.json> [<dir> ...]   (non-recursive; default: [paths] inbox)
Categories: candidate | mix | ost | nonmusic | nightcore | done (already processed per log)
"""
import csv
import json
import os
import re
import subprocess
import sys
import unicodedata

from .library import AUDIO

LOOKALIKES = {"＂": '"', "：": ":", "｜": "|", "⧸": "/", "⁄": "/", "–": "-",
              "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "【": "[", "】": "]"}
GENRE_WORDS = r"(?:acid|acidtrance|acid trance|acid techno|hard ?trance|trance|techno|goa(?: trance)?|psy|psytrance|classic|hardcore|house|gabber|old ?school)"
MIX_WORDS = re.compile(r"\b(mix|remix|edit|version|dub|rework|vip|extended|instrumental|vocal|re-?edit|bootleg|remaster(?:ed)?|slowed|sped[- ]?up|reverb|nightcore)\b", re.I)
OST_WORDS = re.compile(r"\b(OST|Soundtrack|Original Soundtrack|Game Music|BGM)\b", re.I)
NONMUSIC = re.compile(r"(\breacts?\b|\breaction\b|tutorial|#shorts|podcast|interview|trailer)", re.I)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "--", path],
                         capture_output=True, text=True, encoding="utf-8").stdout
    f = json.loads(out or "{}").get("format", {})
    tags = {k.lower(): v for k, v in (f.get("tags") or {}).items()}
    return tags, round(float(f.get("duration", 0) or 0), 1), round(float(f.get("bit_rate", 0) or 0) / 1000)


def clean(s):
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[​-‏‪-‮﻿]", "", s)
    for a, b in LOOKALIKES.items():
        s = s.replace(a, b)
    s = s.replace(" -- ", " - ").replace("--", " - ")
    return re.sub(r"\s+", " ", s).strip()


def parse(base, tags):
    year = None
    genre = None
    s = clean(base)
    t_artist, t_title = clean(tags.get("artist", "")), clean(tags.get("title", ""))
    uploader = None
    # yt uploader stored as artist while the YouTube title holds "Artist - Title"
    if t_artist and t_title and " - " in t_title and norm(t_artist) not in norm(t_title):
        uploader = t_artist
        if s.endswith(" - " + clean(uploader)):
            s = s[: -len(" - " + clean(uploader))].strip()
    # noise in brackets: catalogue numbers, yt ids, quality notes
    s = re.sub(r"\[(?:[A-Z]{2,}[- ]?\d{2,}[A-Z]?|[A-Za-z0-9_-]{11}|Full Album|HQ|HD)\]", "", s)
    s = re.sub(r"\((?:\d{3} ?Kbps|Official Video|Video|HQ|HD)\)", "", s, flags=re.I)
    s = re.sub(r"^\s*[A-D]\d?\.\s+", "", s)                      # "B2. Artist - Title"
    s = re.sub(r"\s+-?\s*\((?:[A-D]\d?)\)\s*", " ", s)            # "(B1)"
    # year / genre notes: (Acid 1996) (CLASSIC 1994) ('94 CLASSIC) [1993] (95 Acid, Psy) (1995)
    def grab(m):
        nonlocal year, genre
        inner = m.group(1)
        y = re.search(r"(?:19|20)\d\d|'\d\d|\b\d\d\b", inner)
        if y:
            yy = y.group(0).strip("'")
            year = int(yy) if len(yy) == 4 else (1900 + int(yy) if int(yy) > 50 else 2000 + int(yy))
        g = re.search(GENRE_WORDS, inner, re.I)
        if g and not genre:
            genre = g.group(0)
        return ""
    s = re.sub(r"[\(\[]\s*((?:'?\d{2,4}\s*)?(?:" + GENRE_WORDS + r"[\s,/]*)*(?:(?:19|20)\d\d|'\d\d|\d\d)?\s*(?:" + GENRE_WORDS + r")?)\s*[\)\]]",
               lambda m: grab(m) if re.search(r"\d|" + GENRE_WORDS, m.group(1), re.I) else m.group(0), s, flags=re.I)
    # year inside a mix note: (Gracious Mix 1994) -> (Gracious Mix)
    def mixyear(m):
        nonlocal year
        year = year or int(m.group(2))
        return f"({m.group(1).strip()})"
    s = re.sub(r"\(([^()]*?)\s+((?:19|20)\d\d)\)", mixyear, s)
    m = re.search(r"\s((?:19|20)\d\d)$", s)                       # trailing " 1995"
    if m:
        year = year or int(m.group(1))
        s = s[: m.start()]
    s = re.sub(r"\s+", " ", s).strip(" -")
    parts = [p.strip() for p in s.split(" - ") if p.strip()]
    extra = []
    if len(parts) >= 2:
        artist, title, extra = parts[0], parts[1], parts[2:]
    else:
        artist, title = "", parts[0] if parts else s
    for x in list(extra):                                         # "- 1997 - GOA TRANCE" style tails
        if re.fullmatch(r"(?:19|20)\d\d", x):
            year = year or int(x)
            extra.remove(x)
        elif re.fullmatch(GENRE_WORDS, x, re.I):
            genre = genre or x
            extra.remove(x)
    search_artist = re.split(r"\s+(?:feat\.?|ft\.?|featuring|vs\.?|x)\s+|\s+&\s+", artist, flags=re.I)[0] if artist else ""
    search_title = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", title).strip()
    mix = next((note for note in re.findall(r"\(([^()]*)\)", title) if MIX_WORDS.search(note)), None)  # "(feat. X) (Y Remix)": the mix isn't always the first note
    return dict(artist=artist, title=title, search_artist=search_artist, search_title=search_title,
                mix=mix, year_hint=year, genre_hint=genre, extra=extra, uploader=uploader)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def read_inbox(dirs, log_path):
    """(items, paths of other audio that can't be curated). An item's "done" category means the log already has it."""
    done = set()
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8-sig", errors="replace", newline="") as f:  # re-saved from Excel, say: one odd byte mustn't stop everything
            done = {r.get("src") for r in csv.DictReader(f, restval="") if r.get("status") == "ok" or (r.get("status") or "").startswith("check")}  # "check": written, with something to look at
    items, n, skipped = [], 0, []
    for d in dirs:
        for fn in sorted(os.listdir(d)):
            p = os.path.join(d, fn)
            if not (os.path.isfile(p) and fn.lower().endswith(".mp3")):
                if os.path.splitext(fn)[1].lower() in AUDIO and os.path.isfile(p):
                    skipped.append(p)
                continue
            n += 1
            try:
                tags, secs, kbps = probe(p)
            except ValueError:  # ffprobe made no sense of this file: it can still be listed, and the length check will hold it back
                tags, secs, kbps = {}, 0.0, 0
            base = os.path.splitext(fn)[0]
            info = parse(base, tags)
            cat = "candidate"
            if p in done:
                cat = "done"
            elif NONMUSIC.search(base) or (" " not in base and len(base) > 30):
                cat = "nonmusic"
            elif secs > 15 * 60 or re.search(r"\b(Full Album|DJ Mix|Megamix|Mixtape|Live Set)\b", base, re.I) or (re.search(r"\bMix\b", base) and not info["artist"]):
                cat = "mix"
            elif OST_WORDS.search(base):
                cat = "ost"
            elif base.lower().startswith("nightcore"):
                cat = "nightcore"
            items.append({"key": str(n), "src": p, "dir": os.path.basename(os.path.normpath(d)),
                          "file": fn, "secs": secs, "kbps": kbps, "cat": cat,
                          "tag_artist": tags.get("artist", ""), "tag_title": tags.get("title", ""),
                          "tag_album": tags.get("album", ""), "tag_date": tags.get("date", ""), "tag_genre": tags.get("genre", ""),
                          "folder_genre": os.path.basename(os.path.normpath(d)), **info})
    return items, skipped


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    out_path, log_path, dirs = argv[0], argv[1], argv[2:]
    items, skipped = read_inbox(dirs, log_path)
    json.dump(items, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for it in items:
        y = it["year_hint"] or ""
        print(f"{it['key']:>3} {it['dir']:<4} {it['cat']:<9} {it['secs'] / 60:5.1f}m {it['kbps']:>3}k | {it['artist']} || {it['title']}"
              + (f" || y={y}" if y else "") + (f" || extra={it['extra']}" if it["extra"] else "")
              + (f" || up={it['uploader']}" if it["uploader"] else ""))
    if skipped:
        print(f"Skipped {len(skipped)} file{'' if len(skipped) == 1 else 's'} that aren't MP3 (only MP3s can be curated): " + ", ".join(os.path.basename(p) for p in skipped[:20]) + (", ..." if len(skipped) > 20 else ""))


if __name__ == "__main__":
    main()
