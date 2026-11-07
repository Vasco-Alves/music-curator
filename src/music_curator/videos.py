#!/usr/bin/env python3
"""Compare a local file with the YouTube videos Discogs links on a release (fingerprints + lengths).

Usage: curator videos <items.json> <out.json>
items.json: [{"key", "src", "release": <discogs release id>, "title": <track base title>, "extra_releases": [ids]}]
For every linked video whose title mentions the track, the audio is downloaded (with the
yt-dlp interpreter from the config) into <quarantine_dir>/<key>/ and fingerprinted against the local file.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
from . import discogs as d
from . import fpcompare

from .config import ytdlp_python
def vid_id(uri):
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", uri or "")
    return m.group(1) if m else None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, qdir, cache = argv[0:4]
    d.CACHE_DIR = cache
    items = json.load(open(items_path, encoding="utf-8"))
    results = []
    for it in items:
        want = d.base_title(it["title"])
        videos, seen = [], set()
        rids = [it["release"]] + list(it.get("extra_releases") or [])
        if it.get("master"):
            vers = (d.get(f"/masters/{it['master']}/versions", per_page=50) or {}).get("versions", [])
            rids += [v["id"] for v in vers if v.get("id") not in rids][:4]
        for rid in rids:
            rel = d.get(f"/releases/{rid}") or {}
            for v in rel.get("videos") or []:
                vid = vid_id(v.get("uri"))
                if vid and vid not in seen and want and want in d.norm(v.get("title")):
                    seen.add(vid)
                    videos.append({"id": vid, "title": v.get("title"), "duration": v.get("duration")})
        local_fp = fpcompare.fingerprint(it["src"])
        checked = []
        for v in videos[:5]:
            outdir = os.path.join(qdir, it["key"])
            r = subprocess.run([ytdlp_python(), "-I", os.path.join(HERE, "ytdlp_helper.py"), "audio", v["id"], outdir],
                               capture_output=True, text=True, encoding="utf-8")
            try:
                info = json.loads(r.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                info = {"error": (r.stderr or "no output")[-300:]}
            if info.get("error") or not os.path.exists(info.get("file", "")):
                checked.append({**v, "error": info.get("error", "download failed")})
                continue
            ber, off, n = fpcompare.compare(local_fp, fpcompare.fingerprint(info["file"]))
            checked.append({**v, "file": info["file"], "abr": info.get("abr"), "acodec": info.get("acodec"),
                            "yt_duration": info.get("duration"), "ber": round(ber, 3),
                            "offset_s": round(off * fpcompare.ITEM_S, 1), "overlap_s": round(n * fpcompare.ITEM_S)})
        results.append({"key": it["key"], "src": it["src"], "title": it["title"], "videos": checked,
                        "linked": len(videos)})
        best = min((c for c in checked if "ber" in c), key=lambda c: c["ber"], default=None)
        print(f"[{it['key']}] {it['title']}: {len(videos)} linked video(s)"
              + (f", best match {best['ber']} '{best['title']}'" if best else ""), flush=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
