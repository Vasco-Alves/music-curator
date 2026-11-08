#!/usr/bin/env python3
"""Find a better copy (complete, right speed, better quality) for each item and compare it with yours.

Usage: curator better <items.json> <out.json>
items.json: [{"key","src","artist","title","release"|null,"master"|null,"target_secs"|null,"reason","tries"}]
Candidates: YouTube videos linked on the Discogs release / its pressings first, then a YouTube search.
"tries" (default 3) is how many candidates get compared.
A candidate is accepted only if its length matches the record (or your copy, when Discogs has no
length), it is the same recording as your copy (samerec), and - for low-quality cases - it keeps
clearly more high-frequency detail. Audio is fetched only to compare it and deleted straight after:
what you get is a link, and what to do with it is up to you.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
from . import discogs as d
from . import samerec

from .config import ytdlp_python
def yt(*args):
    r = subprocess.run([ytdlp_python(), "-I", os.path.join(HERE, "ytdlp_helper.py"), *args], capture_output=True, text=True,
                       encoding="utf-8")
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"error": (r.stderr or "no output")[-300:]}


def vid_id(uri):
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", uri or "")
    return m.group(1) if m else None


def title_ok(t, artist, title):
    nt = d.norm(t)
    a = d.norm(re.split(r"\s+&\s+", artist)[0])
    return a[:6] in nt and d.base_title(title)[:10] in nt


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, qdir, cache = argv[0:4]
    d.CACHE_DIR = cache
    items = json.load(open(items_path, encoding="utf-8"))
    results = []
    for it in items:
        my_len = samerec.duration(it["src"])
        target = it.get("target_secs") or my_len
        tol = 6
        cands, seen = [], set()
        rids = [it["release"]] if it.get("release") else []  # a song Discogs doesn't have goes by the YouTube search alone
        if it.get("master"):
            vers = (d.get(f"/masters/{it['master']}/versions", per_page=50) or {}).get("versions", [])
            rids += [v["id"] for v in vers if v["id"] != it.get("release")][:6]
        for rid in rids:
            for v in (d.get(f"/releases/{rid}") or {}).get("videos") or []:
                i = vid_id(v.get("uri"))
                if i and i not in seen and title_ok(v.get("title", ""), it["artist"], it["title"]) \
                        and v.get("duration") and abs(v["duration"] - target) <= tol:
                    seen.add(i)
                    cands.append({"id": i, "title": v.get("title"), "duration": v.get("duration"), "from": "discogs"})
        found = yt("search", f"{it['artist']} {it['title']}", "10")
        for v in found if isinstance(found, list) else []:
            if v.get("id") not in seen and v.get("duration") and abs(v["duration"] - target) <= tol \
                    and title_ok(v.get("title", ""), it["artist"], it["title"]):
                seen.add(v["id"])
                cands.append({**v, "from": "search"})
        cands.sort(key=lambda c: (c["from"] != "discogs", "topic" not in (c.get("channel") or "").lower(),
                                  -(c.get("views") or 0)))
        my_hf = samerec.hf_db(it["src"])
        tried, accepted = [], None
        with samerec.scratch(qdir) as folder:
            for c in cands[:it.get("tries") or 3]:
                info = samerec.fetch_audio(c["id"], folder)
                if info.get("error") or not os.path.exists(info.get("file", "")):
                    tried.append({**c, "error": info.get("error", "download failed")[:120]})
                    continue
                same, det = samerec.same_recording(it["src"], info["file"], os.path.join(folder, "tmp"))
                hf = samerec.hf_db(info["file"])
                entry = {**c, "abr": info.get("abr"), "len": round(samerec.duration(info["file"])), "hf_db": hf,
                         "same": same, **det}
                better = True
                if it["reason"] == "low quality":
                    better = (info.get("abr") or 0) >= 110 and (hf is not None and my_hf is not None and hf >= my_hf + 5)
                    entry["quality_better"] = better
                tried.append(entry)
                if same and better:
                    accepted = {**entry, "url": f"https://www.youtube.com/watch?v={c['id']}"}
                    break
        results.append({"key": it["key"], "src": it["src"], "reason": it["reason"], "my_len": round(my_len),
                        "target": it.get("target_secs"), "my_hf_db": my_hf, "candidates": len(cands),
                        "tried": tried, "accepted": accepted})
        print(f"[{it['key']}] {it['artist']} - {it['title']}: {len(cands)} candidates, "
              + (f"ACCEPTED {accepted['url']} ({accepted['how']})" if accepted else "no verified better copy"), flush=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
