#!/usr/bin/env python3
"""Tiny client for VGMdb data via the vgmdb.info JSON mirror (public, read-only). Responses are cached.

Usage:
  curator vgmdb search "<query>"        -> albums (id, title, catalog, date) and products (games)
  curator vgmdb album <id>              -> title, date, catalog, composers, tracklist (disc/track/name/length)
  curator vgmdb product <id>            -> game title, release date, linked albums
"""
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://vgmdb.info"
UA = "LocalMusicCurator/0.1"
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "music-curator", "vgmdb")  # the CLI sets this from the config
_last = [0.0]


def get(path):
    url = BASE + path + ("&" if "?" in path else "?") + "format=json"
    os.makedirs(CACHE_DIR, exist_ok=True)
    cf = os.path.join(CACHE_DIR, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(cf):
        return json.load(open(cf, encoding="utf-8"))
    wait = 1.5 - (time.time() - _last[0])  # be gentle with a volunteer-run service
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
    _last[0] = time.time()
    json.dump(data, open(cf, "w", encoding="utf-8"))
    return data


def name(n):
    if isinstance(n, dict):
        return n.get("en") or n.get("ja-latn") or next(iter(n.values()), "")
    return n or ""


def search(q):
    d = get("/search/" + urllib.parse.quote(q))
    res = d.get("results", {})
    return {"albums": [{"id": a["link"].split("/")[-1], "title": name(a.get("titles")), "catalog": a.get("catalog"),
                        "date": a.get("release_date")} for a in res.get("albums", [])[:15]],
            "products": [{"id": p["link"].split("/")[-1], "title": name(p.get("names")), "type": p.get("type"),
                          "date": p.get("release_date")} for p in res.get("products", [])[:10]]}


def album(aid):
    d = get(f"/album/{aid}")
    credits = [{"role": name(c.get("role")), "names": [name(x.get("names")) for x in c.get("names", [])]}
               for c in d.get("credits", [])]
    tracks = []
    for di, disc in enumerate(d.get("discs", []), 1):
        for ti, t in enumerate(disc.get("tracks", []), 1):
            tracks.append({"disc": di, "n": ti, "name": name(t.get("names")), "length": t.get("track_length")})
    return {"id": aid, "title": name(d.get("names")), "date": d.get("release_date"), "catalog": d.get("catalog"),
            "products": [name(p.get("names")) for p in d.get("products", [])], "credits": credits,
            "notes": (d.get("notes") or "")[:1500], "picture": d.get("picture_full") or d.get("picture_small"),
            "tracks": tracks}


def product(pid):
    d = get(f"/product/{pid}")
    return {"id": pid, "title": name(d.get("name")), "date": d.get("release_date"),
            "releases": [{"name": name(r.get("names")), "date": r.get("date"), "platform": r.get("platform")}
                         for r in d.get("releases", [])][:8],
            "albums": [{"id": a["link"].split("/")[-1], "title": name(a.get("titles")), "date": a.get("date")}
                       for a in d.get("albums", [])][:10]}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    cmd, arg = argv[0], argv[1]
    fn = {"search": search, "album": album, "product": product}[cmd]
    print(json.dumps(fn(arg), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
