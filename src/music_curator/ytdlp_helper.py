#!/usr/bin/env python3
"""Find / fetch YouTube copies with yt-dlp (best audio -> MP3 320).

Standalone on purpose: it is run with the interpreter from [ytdlp] python in curator.toml, so an
outdated or broken yt-dlp install never affects the rest of the tool.
  python ytdlp_helper.py ...
  search "<query>" [n]      -> JSON list of {id, title, channel, duration, views}
  fetch <video_id> <outdir> -> downloads into outdir/<id>.mp3, prints JSON with the source audio format
"""
import json
import os
import sys

import yt_dlp


class _Quiet:
    def debug(self, msg): pass
    def info(self, msg): pass
    def warning(self, msg):
        if "JavaScript runtime" not in msg:
            print(f"WARNING: {msg}", file=sys.stderr)
    def error(self, msg): print(f"ERROR: {msg}", file=sys.stderr)


def search(query, n=8):
    opts = {"quiet": True, "skip_download": True, "extract_flat": "in_playlist", "logger": _Quiet()}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
    return [{"id": e.get("id"), "title": e.get("title"), "channel": e.get("channel") or e.get("uploader"),
             "duration": e.get("duration"), "views": e.get("view_count")}
            for e in info.get("entries", []) if e]


def fetch(video_id, outdir):
    os.makedirs(outdir, exist_ok=True)
    opts = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"}],
        "outtmpl": os.path.join(outdir, "%(id)s.%(ext)s"),
        "quiet": True,
        "logger": _Quiet(),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
    return {"id": video_id, "title": info.get("title"), "channel": info.get("channel"),
            "duration": info.get("duration"), "acodec": info.get("acodec"), "abr": info.get("abr"),
            "asr": info.get("asr"), "file": os.path.join(outdir, f"{video_id}.mp3"),
            "url": f"https://www.youtube.com/watch?v={video_id}"}


def info(video_id):
    """Metadata only (no download): title, channel, duration, description."""
    opts = {"quiet": True, "skip_download": True, "noplaylist": True, "logger": _Quiet()}
    with yt_dlp.YoutubeDL(opts) as ydl:
        i = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    return {"id": video_id, "title": i.get("title"), "channel": i.get("channel"), "duration": i.get("duration"),
            "upload_date": i.get("upload_date"), "description": (i.get("description") or "")[:2000]}


def audio(video_id, outdir):
    """Best audio stream as-is (no MP3 conversion) - for fingerprint checks."""
    os.makedirs(outdir, exist_ok=True)
    opts = {"format": "bestaudio/best", "noplaylist": True, "quiet": True, "logger": _Quiet(),
            "outtmpl": os.path.join(outdir, "%(id)s.%(ext)s")}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        path = ydl.prepare_filename(info)
    return {"id": video_id, "title": info.get("title"), "channel": info.get("channel"),
            "duration": info.get("duration"), "acodec": info.get("acodec"), "abr": info.get("abr"),
            "file": path, "url": f"https://www.youtube.com/watch?v={video_id}"}


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    cmd = sys.argv[1]
    try:
        if cmd == "search":
            print(json.dumps(search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8), ensure_ascii=False))
        elif cmd == "fetch":
            print(json.dumps(fetch(sys.argv[2], sys.argv[3]), ensure_ascii=False))
        elif cmd == "audio":
            print(json.dumps(audio(sys.argv[2], sys.argv[3]), ensure_ascii=False))
        elif cmd == "info":
            print(json.dumps(info(sys.argv[2]), ensure_ascii=False))
        else:
            sys.exit(__doc__)
    except Exception as ex:  # noqa: BLE001  (unavailable / private / region-blocked videos)
        print(json.dumps({"id": sys.argv[2] if len(sys.argv) > 2 else None, "error": str(ex)[:300]}))
