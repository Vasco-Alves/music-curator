#!/usr/bin/env python3
"""Fallback lookup for songs Discogs doesn't have: MusicBrainz first, then YouTube's official
'Provided to YouTube by' uploads (auto-generated "- Topic" channels).

Usage: curator other <items.json> <out.json>
items.json entries need: key, src, artist (or search_artist), title (or search_title), secs, tag_genre (optional)
A match must agree on artist and title, and on length (within 6 s) when the source gives one.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
from . import resolve as rv

from .config import ytdlp_python
UA = "LocalMusicCurator/0.1 (personal music library tool)"
_last = [0.0]


def mb(path, cache):
    url = "https://musicbrainz.org/ws/2/" + path
    cf = os.path.join(cache, "mb_" + hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(cf):
        return json.load(open(cf, encoding="utf-8"))
    wait = 1.2 - (time.time() - _last[0])  # MusicBrainz asks for at most 1 request per second
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        data = json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as ex:  # noqa: BLE001
        data = {"error": str(ex)}
    _last[0] = time.time()
    json.dump(data, open(cf, "w", encoding="utf-8"))
    return data


def credit_mb(ac):
    names = [c.get("name") or c.get("artist", {}).get("name", "") for c in ac or []]
    return " & ".join(n for n in names if n)


def try_musicbrainz(it, cache):
    a, t = it["search_artist"], it["search_title"]
    q = f'recording:"{t}" AND artist:"{a}"'
    res = mb(f"recording?query={urllib.parse.quote(q)}&fmt=json&limit=15", cache)
    best = None
    for r in res.get("recordings", []):
        who = credit_mb(r.get("artist-credit"))
        if not rv.artist_ok(a, who) or rv.d.base_title(r.get("title")) != rv.d.base_title(t):
            continue
        if it.get("mix") and not rv.mix_matches(it["mix"], r.get("title", "")):
            continue
        length = (r.get("length") or 0) / 1000
        if length and abs(length - it["secs"]) > 6:
            continue
        rels = [x for x in r.get("releases", []) if x.get("date")]
        rels.sort(key=lambda x: x.get("date"))
        first = rels[0] if rels else None
        cand = {"source": "MusicBrainz", "artist": who, "title": r.get("title"),
                "year": (r.get("first-release-date") or (first or {}).get("date") or "")[:4],
                "length": round(length) if length else None, "link": f"https://musicbrainz.org/recording/{r['id']}"}
        if first:
            rg = first.get("release-group") or {}
            ptype = rg.get("primary-type") or ""
            cand["album"] = first.get("title", "") if ptype in ("Album", "EP") else ""
            cand["album_why"] = f"MusicBrainz release type: {ptype or 'unknown'}"
            cand["cover"] = f"https://coverartarchive.org/release/{first['id']}/front-500"
        if best is None or (cand["year"] and cand["year"] < (best.get("year") or "9999")):
            best = cand
    return best


def yt(*args):
    try:
        r = subprocess.run([ytdlp_python(), "-I", os.path.join(HERE, "ytdlp_helper.py"), *args], capture_output=True, text=True, encoding="utf-8")
    except OSError as ex:
        return {"error": str(ex)}
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"error": (r.stderr or "no output")[-200:]}


_warned = [False]


def try_topic(it):
    a, t = it["search_artist"], it["search_title"]
    found = yt("search", f"{a} {t}", "10")
    if isinstance(found, dict) and found.get("error") and not _warned[0]:
        _warned[0] = True
        print("The YouTube check isn't running (is yt-dlp installed? see `curator doctor`), so \"not found\" below only means MusicBrainz.", flush=True)
    for v in found if isinstance(found, list) else []:
        if not (v.get("channel") or "").endswith(" - Topic"):
            continue
        if v.get("duration") and abs(v["duration"] - it["secs"]) > 6:
            continue
        info = yt("info", v["id"])
        desc = info.get("description") or ""
        if "Provided to YouTube by" not in desc:
            continue
        blocks = [b.strip() for b in desc.split("\n\n") if b.strip()]
        line = next((b for b in blocks if " · " in b), "")
        parts = [p.strip() for p in line.split(" · ")]
        if len(parts) < 2 or rv.d.base_title(parts[0]) != rv.d.base_title(t) or not rv.artist_ok(a, " ".join(parts[1:])):
            continue
        album = blocks[blocks.index(line) + 1] if line in blocks and blocks.index(line) + 1 < len(blocks) else ""
        if album.startswith("℗") or album.startswith("Released on"):
            album = ""
        p_year = re.search(r"℗\s*((?:19|20)\d\d)", desc)
        rel = re.search(r"Released on:\s*((?:19|20)\d\d)", desc)
        years = [int(m.group(1)) for m in (p_year, rel) if m]
        label = re.search(r"Provided to YouTube by (.+)", desc)
        return {"source": "YouTube official upload", "artist": " & ".join(parts[1:]), "title": parts[0],
                "album": album if album and rv.d.base_title(album) != rv.d.base_title(parts[0]) else "",
                "album_why": "album named on the official upload" if album else "single on the official upload",
                "year": str(min(years)) if years else "", "length": v.get("duration"),
                "link": f"https://www.youtube.com/watch?v={v['id']}", "label": label.group(1).strip() if label else ""}
    return None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, cache = argv[0:3]
    os.makedirs(cache, exist_ok=True)
    out = []
    for it in json.load(open(items_path, encoding="utf-8")):
        it.setdefault("search_artist", it.get("artist", ""))
        it.setdefault("search_title", re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", it.get("title", "")).strip())
        hit = try_musicbrainz(it, cache) if it["search_artist"] else None
        if not hit and it["search_artist"]:
            hit = try_topic(it)
        out.append({"key": it["key"], "src": it["src"], "file": os.path.basename(it["src"]), "found": hit,
                    "tag_genre": it.get("tag_genre", "")})
        print(f"[{it['key']}] {os.path.basename(it['src'])[:60]:<60} -> " +
              (f"{hit['source']}: {hit['artist']} - {hit['title']} ({hit.get('year') or '?'})" if hit else "not found"), flush=True)
        json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
