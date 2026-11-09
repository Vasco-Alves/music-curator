#!/usr/bin/env python3
"""Compare a local file with the YouTube videos Discogs links on a release (fingerprints + lengths).

Usage: curator videos <items.json> <out.json>
items.json: [{"key", "src", "release": <discogs release id>, "title": <track base title>, "extra_releases": [ids]}]
For every linked video whose title mentions the track, the audio is fetched (with the yt-dlp
interpreter from the config), fingerprinted against the local file, and deleted straight after.
"""
import json
import os
import re
import sys

from . import discogs as d
from . import fpcompare
from . import samerec

STRONG_BER = 0.2  # samerec's rule for "the same recording, start to finish"
STRONG_WITHIN_S = 6  # a shorter edit matches for as long as it lasts, so the two have to run equally long...
STRONG_OVERLAP = 0.9  # ...and match over nearly all of it
MOST_TO_FETCH = 3  # videos per song
FETCH_TIMEOUT_S = 240


def vid_id(uri):
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", uri or "")
    return m.group(1) if m else None


def linked(release, title, master=None, extra=()):
    """The videos linked on a record and its other pressings that name this track."""
    want = d.base_title(title)
    videos, seen = [], set()
    rids = [release] + list(extra or [])
    if master:
        vers = (d.get(f"/masters/{master}/versions", per_page=50) or {}).get("versions", [])
        rids += [v["id"] for v in vers if v.get("id") not in rids][:4]
    for rid in rids:
        rel = d.get(f"/releases/{rid}") or {}
        for v in rel.get("videos") or []:
            vid = vid_id(v.get("uri"))
            if vid and vid not in seen and want and want in d.norm(v.get("title")):
                seen.add(vid)
                videos.append({"id": vid, "title": v.get("title"), "duration": v.get("duration")})
    return videos


def is_strong(ber, overlap_s, secs, video_secs):
    """Sure enough to tell someone: the two run equally long and match from start to finish."""
    return bool(secs and video_secs) and ber < STRONG_BER and abs(secs - video_secs) <= STRONG_WITHIN_S and overlap_s >= STRONG_OVERLAP * min(secs, video_secs)


def find_match(src, secs, videos, parent, stopping=None):
    """Is this file, from start to finish, the same recording as one of these videos? What it fetches is deleted straight after.
    A match says the two are the same audio, not that the video is the version on the record: videos get mislabelled. So it's for a person to weigh."""
    out = dict(tried=0, failed=0, stopped=False, unreadable=False, match=None)
    near = sorted((v for v in videos if not v.get("duration") or abs(v["duration"] - secs) <= STRONG_WITHIN_S), key=lambda v: (not v.get("duration"), abs((v.get("duration") or 0) - secs)))[:MOST_TO_FETCH]  # one that runs longer or shorter can't be a strong match, so it isn't worth fetching
    if not near:
        return out

    def asked_to_stop():
        out["stopped"] = bool(stopping and stopping.is_set())
        return out["stopped"]

    mine = fpcompare.fingerprint(src, stopping)
    if asked_to_stop():
        return out
    if not mine:  # a damaged file, or ffmpeg got stuck on it: nothing was compared, so there's no answer to keep
        out["unreadable"] = True
        return out
    with samerec.scratch(parent) as folder:
        for v in near:
            if asked_to_stop():
                break
            info = samerec.fetch_audio(v["id"], folder, timeout=FETCH_TIMEOUT_S, stopping=stopping)
            theirs = [] if info.get("error") or not os.path.exists(info.get("file", "")) else fpcompare.fingerprint(info["file"], stopping)
            if asked_to_stop():
                break
            if not theirs:
                out["failed"] += 1
                continue
            out["tried"] += 1
            ber, _, n = fpcompare.compare(mine, theirs)
            length = info.get("duration") or v.get("duration")
            if is_strong(ber, n * fpcompare.ITEM_S, secs, length):
                out["match"] = {**v, "duration": length, "url": f"https://www.youtube.com/watch?v={v['id']}"}
                break
    return out


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, qdir, cache = argv[0:4]
    d.CACHE_DIR = cache
    items = json.load(open(items_path, encoding="utf-8"))
    results = []
    for it in items:
        videos = linked(it["release"], it["title"], it.get("master"), it.get("extra_releases"))
        local_fp = fpcompare.fingerprint(it["src"])
        checked = []
        with samerec.scratch(qdir) as folder:
            for v in videos[:5]:
                info = samerec.fetch_audio(v["id"], folder)
                if info.get("error") or not os.path.exists(info.get("file", "")):
                    checked.append({**v, "error": info.get("error", "download failed")})
                    continue
                ber, off, n = fpcompare.compare(local_fp, fpcompare.fingerprint(info["file"]))
                checked.append({**v, "url": f"https://www.youtube.com/watch?v={v['id']}", "abr": info.get("abr"), "acodec": info.get("acodec"),
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
