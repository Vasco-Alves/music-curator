"""Configuration for music-curator.

Read from (first found): the --config option, $CURATOR_CONFIG, ./curator.toml.
Relative paths in the file are resolved against the file's own folder; ~ and $VARS are expanded.
Secrets never live here: the Discogs token comes only from the DISCOGS_TOKEN environment variable.
"""
import copy
import os
import sys
import tomllib

DEFAULTS = {
    "paths": {
        "library": "",       # where curated copies are written (genre folders inside)
        "inbox": [],         # folders to parse for new files (non-recursive)
        "log": "",           # CSV log of every write (old tags -> new tags); used for playlist switch-overs
        "cache": "",         # API response cache (Discogs, MusicBrainz, VGMdb)
        "work": "",          # scratch space for downloads used in checks (quarantine)
    },
    "discogs": {
        "user_agent": "MusicCurator/0.1",
    },
    "ytdlp": {
        "python": "",        # interpreter that has yt-dlp installed; empty = this interpreter
    },
    "rules": {
        "artist_joiner": " & ",        # one joiner for multiple artists (replaces feat./vs./x/And)
        "and_to_joiner": True,         # "A And B" between two credited names becomes "A & B"
        "filename": "{artist} - {title}",
        "folder": "{genre}",           # folder inside the library; may be nested, e.g. "{genre}/{year}"
        "album_for_singles": False,    # False: singles get an empty album; True: the release title
        "prefer_existing_genre": True, # keep the file's current genre (tag or folder) when Discogs lists it
    },
}

_cfg = None
_cfg_path = None


def _merge(base, extra):
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def _resolve_path(p, base_dir):
    if not p:
        return p
    p = os.path.expandvars(os.path.expanduser(p))
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(base_dir, p))


def load(path=None):
    """Load (or reload) the configuration. Returns the merged dict."""
    global _cfg, _cfg_path
    candidates = [path, os.environ.get("CURATOR_CONFIG"), os.path.join(os.getcwd(), "curator.toml")]
    found = next((c for c in candidates if c and os.path.exists(c)), None)
    data = {}
    if found:
        with open(found, "rb") as f:
            data = tomllib.load(f)
    cfg = _merge(DEFAULTS, data)
    base = os.path.dirname(os.path.abspath(found)) if found else os.getcwd()
    paths = cfg["paths"]
    for key in ("library", "log", "cache", "work"):
        paths[key] = _resolve_path(paths[key], base)
    inbox = paths["inbox"] if isinstance(paths["inbox"], list) else [paths["inbox"]]
    paths["inbox"] = [_resolve_path(p, base) for p in inbox if p]
    if not paths["cache"]:
        paths["cache"] = os.path.join(os.path.expanduser("~"), ".cache", "music-curator")
    if not paths["work"]:
        paths["work"] = os.path.join(paths["cache"], "work")
    cfg["ytdlp"]["python"] = _resolve_path(cfg["ytdlp"]["python"], base)
    _cfg, _cfg_path = cfg, found
    return cfg


def cfg():
    return _cfg if _cfg is not None else load()


def config_path():
    cfg()
    return _cfg_path


def get(section, key, default=None):
    return cfg().get(section, {}).get(key, default)


def rule(key, default=None):
    return cfg()["rules"].get(key, DEFAULTS["rules"].get(key, default))


def path(key):
    return cfg()["paths"].get(key)


def ytdlp_python():
    """Interpreter used to run yt-dlp (kept separate so a broken/outdated yt-dlp can't affect the rest)."""
    return get("ytdlp", "python") or sys.executable


EXAMPLE = '''# music-curator configuration. Copy to curator.toml and adjust.
# Relative paths are relative to this file. The Discogs token is NOT stored here:
# set the DISCOGS_TOKEN environment variable (https://www.discogs.com/settings/developers).

[paths]
library = "My Music"                 # curated copies go here, in genre folders
inbox   = ["Downloads"]              # folders with new files to curate (non-recursive)
log     = "_curation/log.csv"        # every write, old tags -> new tags
cache   = "_curation/cache"          # API responses (safe to delete)
work    = "_curation/work"           # downloads used for fingerprint checks (safe to delete)

[discogs]
user_agent = "MusicCurator/0.1"      # Discogs asks for a unique, descriptive User-Agent

[ytdlp]
python = ""                          # Python with yt-dlp installed (only for better copies / video checks)

[rules]
artist_joiner = " & "
and_to_joiner = true
filename = "{artist} - {title}"
folder = "{genre}"
album_for_singles = false
prefer_existing_genre = true
'''
