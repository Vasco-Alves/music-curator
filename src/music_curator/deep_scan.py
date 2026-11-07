#!/usr/bin/env python3
"""Wide Discogs scan for one song: every release containing the track, every version with its length.

Usage: curator scan <items.json>
items.json: [{"key","src","artists":[variants],"title","q":optional extra query}]
"""
import json
import os
import re
import subprocess
import sys

from . import discogs as d
from . import resolve as rv

def main(argv=None):
  argv = sys.argv[1:] if argv is None else list(argv)
  d.CACHE_DIR = argv[0]
  for it in json.load(open(argv[1], encoding="utf-8")):
      secs = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", it["src"]],
                                  capture_output=True, text=True).stdout or 0)
      want = d.base_title(it["title"])
      found = {}
      queries = []
      for a in it.get("artists") or []:
          queries += [dict(artist=a, track=it["title"]), dict(q=f"{a} {it['title']}")]
      queries.append(dict(track=it["title"]))
      if it.get("q"):
          queries.append(dict(q=it["q"]))
      for q in queries:
          for r in d.search(**q):
              ra = rv.result_artist(r)
              if it.get("artists") and ra != "Various" and not any(rv.artist_ok(a, ra) for a in it["artists"]):
                  continue
              found.setdefault(r["id"], r)
      print(f"=== [{it['key']}] {os.path.basename(it['src'])}  (file {int(secs // 60)}:{int(secs % 60):02d} = {secs:.0f}s, {len(found)} releases)")
      rows = []
      for rid, r in list(found.items())[:18]:
          rel = d.get(f"/releases/{rid}") or {}
          for t in rel.get("tracklist", []):
              if d.base_title(t.get("title")) != want:
                  continue
              arts = rv.credit(rv.d.cond_artists(t.get("artists"))) if t.get("artists") else rv.credit(d.cond_artists(rel.get("artists")))
              if it.get("artists") and not any(rv.artist_ok(a, arts) for a in it["artists"]):
                  continue
              s = d.dur_to_sec(t.get("duration"))
              fmt = ",".join(f.get("name", "") + ("/" + "/".join(f.get("descriptions") or []) if f.get("descriptions") else "") for f in rel.get("formats", []))
              rows.append((rel.get("year") or 0, f"   {rid:>9} {rel.get('year') or '????'} {rel.get('title', '')[:38]:<38} [{fmt[:28]:<28}] "
                                                 f"{t.get('position', ''):<4} {arts[:30]} - {t.get('title')} [{t.get('duration') or '?'}]"
                                                 + (f"  Δ{round(secs - s):+d}s" if s else "")))
      for _, line in sorted(rows):
          print(line)


if __name__ == "__main__":
    main()
