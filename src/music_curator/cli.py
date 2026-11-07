"""`curator` command line. Each subcommand is a thin wrapper around one module."""
import argparse
import os
import shutil
import subprocess
import sys

from . import config


def _setup(args):
    config.load(args.config)
    from . import discogs, vgmdb
    cache = config.path("cache")
    discogs.CACHE_DIR = os.path.join(cache, "discogs")
    discogs.UA = config.get("discogs", "user_agent") or discogs.UA
    vgmdb.CACHE_DIR = os.path.join(cache, "vgmdb")
    for key in ("cache", "work"):
        os.makedirs(config.path(key), exist_ok=True)


def _need(key):
    p = config.path(key)
    if not p:
        sys.exit(f"Set [paths] {key} in curator.toml (see `curator init`).")
    return p


def cmd_init(args):
    target = os.path.join(os.getcwd(), "curator.toml")
    if os.path.exists(target):
        sys.exit("curator.toml already exists here; not overwriting it.")
    with open(target, "w", encoding="utf-8") as f:
        f.write(config.EXAMPLE)
    print(f"Wrote {target}. Edit the paths, then run `curator doctor`.")


def cmd_doctor(args):
    ok = True
    print("config:", config.config_path() or "(none found, using defaults)")
    for key in ("library", "log", "cache", "work"):
        print(f"  {key:<8} {config.path(key) or '(not set)'}")
    print("  inbox   ", ", ".join(config.path("inbox")) or "(not set)")
    ff = shutil.which("ffmpeg")
    print("ffmpeg:", ff or "MISSING (install ffmpeg and put it on PATH)")
    if ff:
        muxers = subprocess.run([ff, "-hide_banner", "-muxers"], capture_output=True, text=True).stdout
        has = "chromaprint" in muxers
        print("  chromaprint muxer:", "yes" if has else "MISSING (fingerprint checks need an ffmpeg build with chromaprint)")
        ok &= has
    ok &= bool(ff and shutil.which("ffprobe"))
    from . import discogs
    try:
        has_token = bool(discogs.token())
    except SystemExit:
        has_token = False
    print("DISCOGS_TOKEN:", "set" if has_token else "MISSING (create one at https://www.discogs.com/settings/developers)")
    ok &= has_token
    py = config.ytdlp_python()
    r = subprocess.run([py, "-c", "import yt_dlp; print(yt_dlp.version.__version__)"], capture_output=True, text=True)
    print("yt-dlp:", r.stdout.strip() or f"not available in {py} (optional: only for better copies / video checks)")
    print("OK" if ok else "Some required pieces are missing.")
    return 0 if ok else 1


def main(argv=None):
    p = argparse.ArgumentParser(prog="curator", description="Curate a local music library: verify songs against Discogs "
                                "(and fallbacks), settle versions by length and fingerprints, write clean tags + covers.")
    p.add_argument("--config", help="path to curator.toml (default: $CURATOR_CONFIG or ./curator.toml)")
    sub = p.add_subparsers(dest="cmd", required=True, metavar="<command>")

    def add(name, help_, *args):
        sp = sub.add_parser(name, help=help_, description=help_)
        for a in args:
            sp.add_argument(*a[0], **a[1])
        return sp

    add("init", "write a starter curator.toml in the current folder")
    add("doctor", "check ffmpeg/chromaprint, the Discogs token, paths and yt-dlp")
    add("parse", "parse inbox folders (filenames + existing tags) into an items JSON",
        (["out"], {"help": "items JSON to write"}), (["dirs"], {"nargs": "*", "help": "folders (default: [paths] inbox)"}))
    add("resolve", "match items against Discogs and decide tags (status: ready / review / notfound / dup)",
        (["items"], {}), (["out"], {}))
    add("scan", "wide Discogs scan: every pressing and version of a song, with lengths", (["items"], {}))
    add("videos", "fingerprint files against the YouTube videos Discogs links on the release",
        (["items"], {}), (["out"], {}))
    add("other", "fallback sources for songs Discogs lacks: MusicBrainz, official YouTube uploads",
        (["items"], {}), (["out"], {}))
    add("ost", "game-soundtrack lookup (\"<Game> OST - <Track>\" files)", (["items"], {}), (["out"], {}))
    add("better", "find and verify better copies (complete, right speed, better quality); needs yt-dlp",
        (["items"], {}), (["out"], {}))
    add("same", "is COPY the same recording as REFERENCE? (handles speed changes and cuts)",
        (["copy"], {}), (["reference"], {}), (["--tmp"], {"help": "scratch folder (default: [paths] work)"}))
    add("compare", "quick whole-file fingerprint comparison", (["a"], {}), (["b"], {}))
    add("drift", "chunk-by-chunk alignment, to tell 'sped up' from 'edited'", (["copy"], {}), (["reference"], {}))
    add("write", "copy audio into the library with clean tags + cover, and append to the log",
        (["plan"], {}), (["--dry-run"], {"action": "store_true"}))
    add("discogs", "raw Discogs client: release <id> | master <id> | versions <id> | search <artist> <track> | "
                   "image <url> <file>", (["rest"], {"nargs": argparse.REMAINDER}))
    add("vgmdb", "VGMdb via the vgmdb.info mirror: search <q> | album <id> | product <id> (often unavailable)",
        (["rest"], {"nargs": argparse.REMAINDER}))

    args = p.parse_args(argv)
    if args.cmd == "init":
        return cmd_init(args)
    _setup(args)
    cache, work = config.path("cache"), config.path("work")
    if args.cmd == "doctor":
        return cmd_doctor(args)
    if args.cmd == "parse":
        from . import parse
        dirs = args.dirs or config.path("inbox")
        if not dirs:
            sys.exit("Give folders or set [paths] inbox.")
        return parse.main([args.out, config.path("log") or os.devnull] + dirs)
    if args.cmd == "resolve":
        from . import resolve
        return resolve.main([args.items, args.out, config.path("log") or os.devnull, os.path.join(cache, "discogs"), _need("library")])
    if args.cmd == "scan":
        from . import deep_scan
        return deep_scan.main([os.path.join(cache, "discogs"), args.items])
    if args.cmd == "videos":
        from . import videos
        return videos.main([args.items, args.out, os.path.join(work, "videos"), os.path.join(cache, "discogs")])
    if args.cmd == "other":
        from . import other_sources
        return other_sources.main([args.items, args.out, os.path.join(cache, "other")])
    if args.cmd == "ost":
        from . import ost
        return ost.main([args.items, args.out, os.path.join(cache, "discogs"), _need("library")])
    if args.cmd == "better":
        from . import better_copies
        return better_copies.main([args.items, args.out, os.path.join(work, "better"), os.path.join(cache, "discogs")])
    if args.cmd == "same":
        from . import samerec
        return samerec.main([args.copy, args.reference, args.tmp or os.path.join(work, "same")])
    if args.cmd == "compare":
        from . import fpcompare
        return fpcompare.main([args.a, args.b])
    if args.cmd == "drift":
        from . import fpdrift
        return fpdrift.main([args.copy, args.reference])
    if args.cmd == "write":
        from . import tagwriter
        return tagwriter.main([args.plan, _need("library"), _need("log")] + (["--dry-run"] if args.dry_run else []))
    if args.cmd == "discogs":
        from . import discogs
        return discogs.main(args.rest)
    if args.cmd == "vgmdb":
        from . import vgmdb
        return vgmdb.main(args.rest)


if __name__ == "__main__":
    sys.exit(main())
