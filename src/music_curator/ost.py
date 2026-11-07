#!/usr/bin/env python3
"""Resolve game-soundtrack files ("<Game> OST - <Track>") against Discogs.

Usage: curator ost <items.json> <out.json>
items.json: [{"key","src","game","title","artist"(optional),"mix"(optional)}]
Same rules as resolve.py (artist as credited, title as listed, album/year/genre rules); the folder is
always "Game OST". Status: ready | review | notfound | dup.
"""
import json
import os
import re
import subprocess
import sys

from . import discogs as d
from . import resolve as rv


def secs(p):
    out = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                         capture_output=True, text=True).stdout
    return round(float(out or 0), 1)


def game_ok(game, release_title):
    g = [t for t in rv.tokens(game) if t not in {"ost", "soundtrack", "psx", "n64", "video", "game", "original"}]
    rt = rv.tokens(release_title)
    return bool(g) and len(set(g) & rt) / len(g) >= 0.6


def resolve(it, history, library_keys):
    out = {"key": it["key"], "src": it["src"], "file": os.path.basename(it["src"]), "secs": secs(it["src"]),
           "status": "notfound", "reasons": [], "notes": []}
    title, game, artist = it["title"], it.get("game", ""), it.get("artist", "")
    st = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", title).strip()
    tries = []
    if artist:
        tries.append(dict(artist=artist, track=st))
    if game:
        tries += [dict(q=f"{game} {st}"), dict(release_title=game, track=st)]
    results = []
    for t in tries:
        res = d.search(**t)
        good = [r for r in res if (artist and rv.artist_ok(artist, rv.result_artist(r))) or
                (game and game_ok(game, r.get("title", "")))]
        if good:
            results = good
            break
    if not results:
        out["reasons"].append("not found on Discogs")
        return out
    results.sort(key=rv.year_of)
    want = d.base_title(st)
    found = None
    for r in results[:6]:
        rel = d.get(f"/releases/{r['id']}")
        if not rel:
            continue
        c = d.cond_release(rel)
        hits = [t for t in c["tracklist"] if t.get("type") in (None, "track") and d.base_title(t["title"]) == want]
        if it.get("mix"):
            hits = [t for t in hits if rv.mix_matches(it["mix"], t["title"])] or []
        if hits:
            found = (r, c, hits)
            break
    if not found:
        out["reasons"].append("soundtrack found on Discogs, but not this track" + (f" ({it['mix']})" if it.get("mix") else ""))
        out["candidates"] = [r["title"] for r in results[:4]]
        return out
    r, rel, hits = found
    track = hits[0]
    if len({t["title"] for t in hits}) > 1:
        out["status"] = "review"
        out["reasons"].append("several versions: " + "; ".join(f"{t['pos']} {t['title']} [{t['dur'] or '?'}]" for t in hits))
    arts = track["artists"] or rel["artists"]
    who = rv.credit(arts)
    if rv.norm(who) == "various" or not who:
        out["status"] = "review"
        out["reasons"].append("no artist credited for this track on Discogs")
    t_title, who = rv.clean_title(track["title"], track.get("pos"), who)
    same_master = [x for x in results if x.get("master_id") and x.get("master_id") == r.get("master_id")] or [r]
    years = [rv.year_of(x) for x in same_master if rv.year_of(x) < 9999]
    album, album_why = rv.album_for(rel)
    genre, options, toss, gwhy = rv.pick_genre(same_master, rel, who, history)
    out.update({"release": rel["id"], "master": rel.get("master_id"), "release_title": rel["title"],
                "discogs": (f"https://www.discogs.com/master/{rel['master_id']}" if rel.get("master_id")
                            else f"https://www.discogs.com/release/{rel['id']}"),
                "artist": who, "title": t_title, "album": album, "album_why": album_why,
                "year": min(years) if years else rel.get("year"), "genre": genre, "genre_options": options,
                "toss_up": toss, "genre_why": gwhy, "folder": "Game OST", "how": "track found on the soundtrack"})
    if track.get("dur") and rv.secs(track["dur"]):
        diff = round(out["secs"] - rv.secs(track["dur"]))
        out["dur_diff"] = diff
        if abs(diff) > 25:
            out["status"] = "review"
            out["reasons"].append(f"file is {abs(diff)}s {'longer' if diff > 0 else 'shorter'} than the soundtrack version ({track['dur']})")
    imgs = sorted(rel.get("images") or [], key=lambda i: 0 if i.get("type") == "primary" else 1)
    out["cover_url"] = imgs[0]["uri"] if imgs else None
    key = rv.norm(f"{who} - {t_title}")
    if key in library_keys:
        out["status"] = "dup"
        out["reasons"].append("already in library: " + library_keys[key])
    if out["status"] == "notfound":
        out["status"] = "ready"
    return out


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, cache = argv[0:3]
    d.CACHE_DIR = cache
    library_keys = {}
    for lib in argv[3:]:
        for dp, _, fns in os.walk(lib):
            for fn in fns:
                if fn.lower().endswith(".mp3"):
                    library_keys.setdefault(rv.norm(os.path.splitext(fn)[0]), os.path.join(dp, fn))
    results, history = [], {}
    for it in json.load(open(items_path, encoding="utf-8")):
        try:
            r = resolve(it, history, library_keys)
        except Exception as ex:  # noqa: BLE001
            r = {"key": it["key"], "src": it["src"], "file": os.path.basename(it["src"]), "status": "review",
                 "reasons": [f"lookup error: {ex}"], "notes": []}
        results.append(r)
        print(f"[{it['key']}] {r['status']:<8} {r['file'][:70]}", flush=True)
    json.dump(results, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
