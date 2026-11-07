#!/usr/bin/env python3
"""Discogs lookup helper (Python stdlib only).

The token is read from DISCOGS_TOKEN (process env, else the Windows user
environment in HKCU\\Environment). It is only ever sent as an HTTP header to
api.discogs.com and is never printed or written to disk.

Usage (through the CLI):
  curator discogs release <id>
  curator discogs master <id>
  curator discogs versions <master_id>
  curator discogs search <artist> <track>
  curator discogs image <url> <out_file>
  curator discogs batch <items.json> <out.json>

items.json: [{"key": "1", "src": "/music/inbox/file.mp3", "artist": "...", "title": "...", "year_hint": 1995}]
"""
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.discogs.com"
UA = "MusicCurator/0.1"  # the CLI replaces this with [discogs] user_agent from the config
_last = [0.0]
_tok = [None]


def token():
    if _tok[0]:
        return _tok[0]
    t = os.environ.get("DISCOGS_TOKEN")
    if not t and sys.platform == "win32":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                t = winreg.QueryValueEx(k, "DISCOGS_TOKEN")[0]
        except OSError:
            t = None
    if not t:
        sys.exit("DISCOGS_TOKEN is not set")
    _tok[0] = t
    return t


def _request(url, binary=False):
    for attempt in range(6):
        wait = 1.1 - (time.time() - _last[0])  # stay under 60 requests/min
        if wait > 0:
            time.sleep(wait)
        headers = {"User-Agent": UA}
        if url.startswith(API):
            headers["Authorization"] = "Discogs token=" + token()
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _last[0] = time.time()
                return r.read() if binary else json.load(r)
        except urllib.error.HTTPError as e:
            _last[0] = time.time()
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise RuntimeError("Discogs request kept failing")


CACHE_DIR = None  # set by callers to reuse API responses between runs


def get(path, **params):
    url = path if path.startswith("http") else API + path
    params = {k: v for k, v in params.items() if v not in (None, "")}
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    cache_file = None
    if CACHE_DIR:
        import hashlib
        cache_file = os.path.join(CACHE_DIR, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".json")
        if os.path.exists(cache_file):
            with open(cache_file, encoding="utf-8") as f:
                return json.load(f)
    data = _request(url)
    if cache_file and data is not None:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f)
    return data


# ---------- normalisation helpers ----------

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def base_title(s):
    return norm(re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", s or ""))


def clean_name(name):
    """Drop Discogs disambiguation suffixes like 'Equator (3)'."""
    return re.sub(r"\s\(\d+\)$", "", (name or "").strip())


def cond_artists(arts):
    return [{"name": clean_name(a.get("name")), "anv": a.get("anv") or "",
             "join": a.get("join") or "", "id": a.get("id")} for a in (arts or [])]


def cond_release(r):
    return {
        "id": r["id"], "title": r.get("title"), "artists": cond_artists(r.get("artists")),
        "year": r.get("year"), "released": r.get("released"), "country": r.get("country"),
        "genres": r.get("genres"), "styles": r.get("styles"),
        "formats": [{"name": f.get("name"), "qty": f.get("qty"), "desc": f.get("descriptions"),
                     "text": f.get("text")} for f in r.get("formats", [])],
        "labels": [{"name": clean_name(l.get("name")), "catno": l.get("catno")} for l in r.get("labels", [])],
        "master_id": r.get("master_id"), "uri": r.get("uri"),
        "tracklist": [{"pos": t.get("position"), "type": t.get("type_"), "title": t.get("title"),
                       "dur": t.get("duration"), "artists": cond_artists(t.get("artists")),
                       "extra": [{"name": clean_name(e.get("name")), "role": e.get("role")}
                                 for e in t.get("extraartists", [])]}
                      for t in r.get("tracklist", [])],
        "extra": [{"name": clean_name(e.get("name")), "role": e.get("role"), "tracks": e.get("tracks")}
                  for e in r.get("extraartists", [])],
        "images": [{"type": i.get("type"), "uri": i.get("uri"), "w": i.get("width"), "h": i.get("height")}
                   for i in r.get("images", [])],
    }


def cond_master(m):
    return {"id": m["id"], "title": m.get("title"), "year": m.get("year"),
            "main_release": m.get("main_release"), "artists": cond_artists(m.get("artists")),
            "styles": m.get("styles"), "genres": m.get("genres"),
            "tracklist": [{"pos": t.get("position"), "title": t.get("title"), "dur": t.get("duration")}
                          for t in m.get("tracklist", [])]}


def search(**kw):
    res = get("/database/search", type="release", per_page=50, **kw) or {}
    return [{"id": x["id"], "title": x.get("title"), "year": x.get("year"), "country": x.get("country"),
             "format": x.get("format"), "label": (x.get("label") or [])[:2], "catno": x.get("catno"),
             "style": x.get("style"), "genre": x.get("genre"), "master_id": x.get("master_id")}
            for x in res.get("results", [])]


def file_duration(path):
    try:
        out = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                              "-of", "default=nw=1:nk=1", "--", path],
                             capture_output=True, text=True, timeout=60).stdout.strip()
        return round(float(out), 1)
    except Exception:
        return None


def dur_to_sec(d):
    if not d:
        return None
    parts = d.split(":")
    try:
        sec = 0
        for p in parts:
            sec = sec * 60 + int(p)
        return sec
    except ValueError:
        return None


def is_comp(fmt_list):
    return any("Compilation" in (f or "") for f in (fmt_list or []))


def lookup(item, max_releases=5):
    artist, title = item["artist"], item["title"]
    tbase = base_title(title)
    out = {"key": item["key"], "src": item["src"], "artist": artist, "title": title,
           "year_hint": item.get("year_hint"), "file_secs": file_duration(item["src"]),
           "searches": [], "releases": [], "masters": {}}

    attempts = [dict(artist=artist, track=re.sub(r"\s*\([^)]*\)", "", title))]
    attempts.append(dict(q=f"{artist} {re.sub(r'[(][^)]*[)]', '', title)}"))
    attempts.append(dict(track=re.sub(r"\s*\([^)]*\)", "", title)))
    results = []
    for a in attempts:
        res = search(**a)
        out["searches"].append({"params": a, "count": len(res)})
        if res:
            results = res
            break
    out["results"] = results[:25]

    # Prefer original (non-compilation) releases, earliest first, one per master.
    noncomp = [r for r in results if not is_comp(r.get("format"))]
    comp = [r for r in results if is_comp(r.get("format"))]
    noncomp.sort(key=lambda r: (int(r["year"]) if str(r.get("year") or "").isdigit() else 9999))
    picked, seen_masters = [], set()
    for r in noncomp:
        m = r.get("master_id") or ("r%s" % r["id"])
        if m in seen_masters:
            continue
        seen_masters.add(m)
        picked.append(r["id"])
        if len(picked) >= max_releases:
            break
    if not picked and comp:
        picked = [comp[0]["id"]]

    for rid in picked:
        rel = get(f"/releases/{rid}")
        if not rel:
            continue
        c = cond_release(rel)
        c["matches"] = [t for t in c["tracklist"]
                        if base_title(t["title"]) == tbase or (tbase and tbase in norm(t["title"]))]
        for t in c["matches"]:
            s = dur_to_sec(t.get("dur"))
            t["dur_diff"] = (round(out["file_secs"] - s, 1) if (s and out["file_secs"]) else None)
        out["releases"].append(c)
        mid = c.get("master_id")
        if mid and str(mid) not in out["masters"]:
            m = get(f"/masters/{mid}")
            if m:
                out["masters"][str(mid)] = cond_master(m)
    return out


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    if not argv:
        sys.exit(__doc__)
    cmd = argv[0]
    if cmd == "batch":
        items = json.load(open(argv[1], encoding="utf-8"))
        results = []
        for it in items:
            print(f"[{it['key']}] {it['artist']} - {it['title']}", file=sys.stderr, flush=True)
            results.append(lookup(it))
        with open(argv[2], "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        print(f"wrote {len(results)} lookups to {argv[2]}", file=sys.stderr)
    elif cmd == "release":
        r = get(f"/releases/{argv[1]}")
        print(json.dumps(cond_release(r) if r else None, ensure_ascii=False, indent=1))
    elif cmd == "master":
        m = get(f"/masters/{argv[1]}")
        print(json.dumps(cond_master(m) if m else None, ensure_ascii=False, indent=1))
    elif cmd == "versions":
        v = get(f"/masters/{argv[1]}/versions", per_page=100) or {}
        print(json.dumps(v.get("versions", []), ensure_ascii=False, indent=1))
    elif cmd == "search":
        print(json.dumps(search(artist=argv[1], track=argv[2]), ensure_ascii=False, indent=1))
    elif cmd == "image":
        data = _request(argv[1], binary=True)
        with open(argv[2], "wb") as f:
            f.write(data)
        print(f"saved {len(data)} bytes")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
