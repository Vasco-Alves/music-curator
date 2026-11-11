#!/usr/bin/env python3
"""Parse inbox filenames (+ existing tags) into artist / title / hints, and triage them.

Usage: curator parse <out.json> [<dir> ...]   (non-recursive; default: [paths] inbox)
Categories: candidate | mix | ost | nonmusic | nightcore | done (already processed per log)
"""
import csv
import datetime
import json
import os
import re
import subprocess
import sys
import unicodedata

from .keys import norm
from .library import AUDIO
from .tagwriter import KINDS, written_sources

LOOKALIKES = {"＂": '"', "：": ":", "｜": "|", "⧸": "/", "⁄": "/", "–": "-",
              "—": "-", "－": "-", "‐": "-", "―": "-", "−": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "【": "[", "】": "]",
              "（": "(", "）": ")", "［": "[", "］": "]", "＆": "&"}
GENRE_WORDS = r"(?:acid|acidtrance|acid trance|acid techno|hard ?trance|trance|techno|goa(?: trance)?|psy|psytrance|classic|hardcore|house|gabber|old ?school)"
MIX_WORDS = re.compile(r"\b(mix|remix|edit|version|dub|rework|vip|extended|instrumental|vocal|re-?edit|bootleg|remaster(?:ed)?|slowed|sped[- ]?up|reverb|nightcore)\b", re.I)
OST_WORDS = re.compile(r"\b(OST|Soundtrack|Original Soundtrack|Game Music|BGM)\b", re.I)
NONMUSIC = re.compile(r"(\breacts?\b|\breaction\b|tutorial|#shorts|podcast|interview|trailer)", re.I)
YEAR = r"(?:19|20)\d\d"
NOTE_WORD = r"(?>" + YEAR + r"(?!\d)|'?\d\d(?!\d)|" + GENRE_WORDS + r")"  # each word is taken once and not gone back on, or a long bracket of them that never closes is tried every possible way
NOTE = re.compile(r"[\(\[]\s*(" + NOTE_WORD + r"(?:[\s,/]*+" + NOTE_WORD + r")*+)\s*[\)\]]", re.I)  # a note of years and genres and nothing else: (Acid 1996) (CLASSIC 1994) ('94 CLASSIC) [1993] (95 Acid, Psy) (1995). Not (303) or (Acid Mix)
SIDE = r"\((?:[A-D]\d?)\)"  # "(B1)": which side of the record
JOINER = re.compile(r"&|feat\.?|ft\.?|featuring|vs\.?", re.I)  # a word that joins two names


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


def a_year(text):
    """The year a number in a name can mean, or None: 2049 hasn't been yet, so "Blade Runner 2049" keeps it."""
    year = int(text)
    return year if 1900 <= year <= datetime.date.today().year + 1 else None


def first_artist(artist):
    """The first of the people a name credits: "A x B", "A feat. B", "A vs. B" and "A & B" are all A.
    An x is part of a name when the letters around it are spelled out too ("T Ξ X Λ S"), or when a joiner follows it ("Mr X & Mr Y")."""
    words = artist.split()
    for i in range(1, len(words) - 1):
        if words[i] in ("x", "X") and not (len(words[i - 1]) == 1 and len(words[i + 1]) == 1) and not JOINER.fullmatch(words[i + 1]):
            artist = " ".join(words[:i])
            break
    return re.split(r"\s+(?:feat\.?|ft\.?|featuring|vs\.?)\s+|\s+&\s+", artist, flags=re.I)[0]


def split_name(s):
    """The parts of a name between its " - ". One inside brackets doesn't count: "Song (Future Breeze Mix - Edit)" is one part."""
    parts, depth, start, i = [], 0, 0, 0
    while i < len(s):
        if s[i] in "([":
            depth += 1
        elif s[i] in ")]":
            depth = max(0, depth - 1)
        elif not depth and s.startswith(" - ", i):
            parts.append(s[start:i])
            start = i = i + 3
            continue
        i += 1
    return s.split(" - ") if depth else parts + [s[start:]]  # a bracket that never closes is a name cut short: read it the plain way


def parse(base, tags):
    year = None
    genre = None
    s = clean(base)
    t_artist, t_title = clean(tags.get("artist", "")), clean(tags.get("title", ""))
    uploader = None
    # yt uploader stored as artist while the YouTube title holds "Artist - Title"
    if t_artist and t_title and " - " in t_title and norm(t_artist) not in norm(t_title):
        uploader = t_artist
        for dash in reversed([m.start() for m in re.finditer(" - ", s)]):  # "... - Acid Channel", uploaded by AcidChannel. The channel's own name can have a dash in it: "... - Trance - Classics"
            if norm(s[dash + 3:]) == norm(uploader):
                s = s[:dash].strip()
                break
    year_after_note = re.search(r"[\)\]]\s*" + YEAR + r"(?:\s*[\(\[][^()\[\]]*[\)\]])*$", s)  # "Plasmata (Hardtrance) 1995", "Song [HH 019] 1992 [HQ]": looked at now, before those notes come out
    # noise in brackets: catalogue numbers, yt ids, quality notes
    s = re.sub(r"\[(?:[A-Z]{2,}[- ]?\d{2,}[A-Z]?|[A-Za-z0-9_-]{11}|Full Album|HQ|HD)\]", "", s)
    s = re.sub(r"\((?:\d{3} ?Kbps|Official Video|Video|HQ|HD)\)", "", s, flags=re.I)
    s = re.sub(r"^\s*[A-D]\d\.\s+", "", s)                       # "B2. Artist - Title". A letter alone is somebody's initial: "D. Ramirez - Yeah Yeah"
    whole = [p.strip() for p in split_name(re.sub(r"\s+", " ", s).strip(" -")) if p.strip()]  # the name before any note is taken out of it
    s = re.sub(r"\s+(-?)\s*" + SIDE + r"\s*(-\s+)?", lambda m: " - " if m.group(1) or m.group(2) else " ", s)  # "(B1)". A dash in front of it is the one between artist and title: "Scanners - (B2) A World Outside"
    # year / genre notes: (Acid 1996) (CLASSIC 1994) ('94 CLASSIC) [1993] (95 Acid, Psy) (1995)
    def grab(m):
        nonlocal year, genre
        inner = m.group(1)
        y, g = re.search(YEAR + r"|'\d\d|\b\d\d\b", inner), re.search(GENRE_WORDS, inner, re.I)
        if y:
            yy = y.group(0).strip("'")
            said = a_year(yy if len(yy) == 4 else ("19" if int(yy) > 50 else "20") + yy)
            if not said or (len(y.group(0)) == 2 and not g):
                return m.group(0)                                 # "(2049)" and "(10)" are saying something else
            year = said
        if g and not genre:
            genre = g.group(0)
        return ""
    s = NOTE.sub(grab, s)
    # year inside a mix note: (Gracious Mix 1994) -> (Gracious Mix)
    def mixyear(m):
        nonlocal year
        if not a_year(m.group(2)):
            return m.group(0)
        year = year or int(m.group(2))
        return f"({m.group(1).strip()})"
    s = re.sub(r"\(([^()]*?)\s+(" + YEAR + r")\)", mixyear, s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    parts = [p.strip() for p in split_name(s) if p.strip()]
    if len(parts) == 1 and len(whole) > 1 and parts[0] == whole[0]:  # the notes were all the title there is: "Jon The Dentist - (A1)", "Lil Louis - (House)". They stay, so the artist does too. With the note in front, "(House) - Lil Louis", what's left is a title with no artist, as it always was
        parts = [parts[0], " - ".join(whole[1:])]
    alt_title = None
    m = re.search(r"\s(" + YEAR + r")$", parts[-1]) if parts else None
    if m and a_year(m.group(1)):                                  # a year at the very end
        rest = parts[-1][: m.start()].rstrip(" -")
        if len(parts) > 2 or year_after_note or rest.endswith((")", "]")):  # after a note, or after the title's own part, it's a note: "Infinite (Original Mix) 1995"
            year, parts[-1] = year or int(m.group(1)), rest
        elif rest:                                                # after the title's words it can be either: "Analog Mind 1995" is from 1995, "Greece 2000" is called that. The title keeps it, and the other reading is there to try
            alt_title = rest
    parts = [p for p in parts if p]
    extra = []
    if len(parts) >= 2:
        artist, title, extra = parts[0], parts[1], parts[2:]
    else:
        artist, title = "", parts[0] if parts else s
    for x in list(extra):                                         # "- 1997 - GOA TRANCE" style tails
        if re.fullmatch(YEAR, x):
            year = year or int(x)
            extra.remove(x)
        elif re.fullmatch(GENRE_WORDS, x, re.I):
            genre = genre or x
            extra.remove(x)
    search_artist = first_artist(artist)
    search_title = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", title).strip()
    mix = next((note for note in re.findall(r"\(([^()]*)\)", title) if MIX_WORDS.search(note)), None)  # "(feat. X) (Y Remix)": the mix isn't always the first note
    return dict(artist=artist, title=title, search_artist=search_artist, search_title=search_title,
                mix=mix, year_hint=year, genre_hint=genre, extra=extra, uploader=uploader, alt_title=alt_title)


def read_inbox(dirs, log_path):
    """(items, paths of other audio that can't be curated). An item's "done" category means the log already has it.
    One whose copy you took back out of the library, because the match was wrong, has "back": what you said about it."""
    done, back = set(), {}
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8-sig", errors="replace", newline="") as f:  # re-saved from Excel, say: one odd byte mustn't stop everything
            done, back = written_sources(csv.DictReader(f, restval=""))
    items, n, skipped = [], 0, []
    for d in dirs:
        for fn in sorted(os.listdir(d)):
            p = os.path.join(d, fn)
            if not (os.path.isfile(p) and os.path.splitext(fn)[1].lower() in KINDS):
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
            if p in back:
                items[-1]["back"] = back[p]
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
        print(f"Skipped {len(skipped)} file{'' if len(skipped) == 1 else 's'} that can't be curated (only MP3, FLAC and M4A can): " + ", ".join(os.path.basename(p) for p in skipped[:20]) + (", ..." if len(skipped) > 20 else ""))


if __name__ == "__main__":
    main()
