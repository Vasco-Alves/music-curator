"""Configuration for music-curator.

Read from the --config option if given, else the first found of: $CURATOR_CONFIG, ./curator.toml, the per-user file
that the app's first-run screen creates (see user_config_path).
Relative paths in the file are resolved against the file's own folder, and they may start with ~ or use $VARS; absolute
paths are taken exactly as written, so a real folder name containing $ or % stays intact.
Secrets never live here: the Discogs token comes from the DISCOGS_TOKEN environment variable, or from a .env file next to this one (see env_file).
"""
import copy
import os
import re
import sys
import tomllib

from . import saving

DEFAULTS = {
    "paths": {
        "library": "",       # where curated copies are written (genre folders inside)
        "inbox": [],         # folders to parse for new files (non-recursive)
        "log": "",           # CSV log of every write (old tags -> new tags); used for playlist switch-overs
        "cache": "",         # API response cache (Discogs, MusicBrainz, VGMdb)
        "work": "",          # scratch space for downloads used in checks (quarantine)
        "review": "",        # optional: folder of songs waiting for a decision (shown in `curator serve`)
        "review_list": "",   # optional: Markdown with the reasons, one "- **Artist - Title**: reason" per song
    },
    "discogs": {
        "user_agent": "MusicCurator/0.1",
    },
    "ytdlp": {
        "python": "",        # interpreter that has yt-dlp installed; empty = this interpreter
    },
    "curate": {
        "compare_audio": False,  # when Curate can't tell which version a song is, compare it with the videos on the record. It only tells you how sure it is
    },
    "spotify": {
        "client_id": "",     # optional: your own Spotify app's Client ID, for the Check Spotify button (it isn't a secret)
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
_requested = None


class BadConfig(ValueError):
    """The settings file can't be used; the message says which file and why."""


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
    if os.path.isabs(p):  # what the app writes: a $ or % in there is part of a real folder name
        return p
    p = os.path.expandvars(os.path.expanduser(p))
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(base_dir, p))


def load(path=None):
    """Load (or reload) the configuration. Returns the merged dict."""
    global _cfg, _cfg_path, _requested
    _requested = path or os.environ.get("CURATOR_CONFIG") or None
    candidates = [path] if path else [os.environ.get("CURATOR_CONFIG"), os.path.join(os.getcwd(), "curator.toml"), user_config_path()]
    found = next((c for c in candidates if c and os.path.exists(c)), None)
    data = {}
    if found:
        try:
            with open(found, encoding="utf-8-sig") as f:  # some editors add a byte-order mark
                data = tomllib.loads(f.read())
        except (OSError, ValueError) as ex:
            raise BadConfig(f"Can't read the settings file {found}: {ex}") from ex
    cfg = _merge(DEFAULTS, data)
    base = os.path.dirname(os.path.abspath(found)) if found else os.getcwd()
    paths = cfg["paths"]
    texts = ("library", "log", "cache", "work", "review", "review_list")
    if not isinstance(paths, dict) or not all(isinstance(paths[k], str) for k in texts) \
            or not all(isinstance(x, str) for x in (paths["inbox"] if isinstance(paths["inbox"], list) else [paths["inbox"]])):
        raise BadConfig(f"The [paths] section of {found} should only hold folder paths as text.")
    cfg["as_written"] = dict(paths)
    for key in texts:
        paths[key] = _resolve_path(paths[key], base)
    inbox = paths["inbox"] if isinstance(paths["inbox"], list) else [paths["inbox"]]
    paths["inbox"] = [_resolve_path(p, base) for p in inbox if p]
    if not paths["cache"]:
        paths["cache"] = os.path.join(os.path.expanduser("~"), ".cache", "music-curator")
    if not paths["work"]:
        paths["work"] = os.path.join(paths["cache"], "work")
    python = cfg["ytdlp"]["python"]
    cfg["ytdlp"]["python"] = python if isinstance(python, str) and python and not os.path.dirname(python) else _resolve_path(python, base)  # a bare name is found on PATH
    _cfg, _cfg_path = cfg, found
    return cfg


def user_config_path():
    """Where the first-run screen saves the config when nothing says otherwise, so it's found from any folder."""
    base = os.environ.get("APPDATA") if sys.platform == "win32" else os.environ.get("XDG_CONFIG_HOME")
    return os.path.join(base or os.path.join(os.path.expanduser("~"), ".config"), "music-curator", "curator.toml")


def target_path():
    """The file to create or update when the person picks folders in the app."""
    cfg()
    return _cfg_path or _requested or user_config_path()


def env_file():
    """Where a .env file with your Discogs token goes: next to your settings, away from your music and out of the repository."""
    return os.path.join(os.path.dirname(os.path.abspath(target_path())), ".env")


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


def _toml_text(value):
    if "'" not in value and not any(ord(c) < 32 or ord(c) == 127 for c in value):
        return f"'{value}'"  # a literal string: Windows backslashes stay as they are
    out = value.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + "".join(c if ord(c) >= 32 and ord(c) != 127 else f"\\u{ord(c):04x}" for c in out) + '"'


def _toml_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    return "[" + ", ".join(_toml_text(v) for v in value) + "]" if isinstance(value, list) else _toml_text(value)


def _value_end(text, i):
    """Index just past the TOML value that starts at text[i]: a string, an array over any number of lines, or a bare word."""
    for quote in ('"""', "'''"):
        if text.startswith(quote, i):
            j = i + 3
            while j < len(text):
                if quote[0] == '"' and text[j] == "\\":
                    j += 2
                elif text.startswith(quote, j):
                    j += 3
                    for _ in range(2):  # a string may end in up to two more quote characters
                        j += text[j:j + 1] == quote[0]
                    return j
                else:
                    j += 1
            return len(text)
    if text[i:i + 1] in ('"', "'"):
        j = i + 1
        while j < len(text) and text[j] not in "\r\n":
            if text[i] == '"' and text[j] == "\\":
                j += 2
                continue
            if text[j] == text[i]:
                return j + 1
            j += 1
        return j
    if text[i:i + 1] == "[":
        j, depth = i, 0
        while j < len(text):
            c = text[j]
            if c in "\"'":
                j = _value_end(text, j)
                continue
            if c == "#":
                newline = text.find("\n", j)
                j = len(text) if newline < 0 else newline
                continue
            depth += (c == "[") - (c == "]")
            j += 1
            if not depth:
                return j
        return j
    return re.compile(r"[^\s#]*").match(text, i).end()


def edit_table(text, table, updates):
    """Set keys of one table in TOML text. Everything else stays as it was; only a replaced array loses comments inside it."""
    newline = "\r\n" if "\r\n" in text else "\n"
    header = re.search(rf"""^[ \t]*\[[ \t]*(?:{table}|"{table}"|'{table}')[ \t]*\][ \t]*(#[^\r\n]*)?\r?$""", text, re.M)
    if not header:
        block = f"[{table}]" + newline + "".join(f"{k} = {_toml_value(v)}{newline}" for k, v in updates.items())
        return (text.rstrip() + newline * 2 if text.strip() else "") + block
    start = text.find("\n", header.start())
    i = last = len(text) if start < 0 else start + 1
    spans = {}
    while i < len(text):
        eol = text.find("\n", i)
        eol = len(text) if eol < 0 else eol
        line = text[i:eol]
        if line.strip().startswith("["):
            break
        key = re.match(r"""[ \t]*("[^"\r\n]*"|'[^'\r\n]*'|[A-Za-z0-9_-]+)[ \t]*=[ \t]*""", line)
        if not key:
            i = eol + 1
            continue
        begin = i + key.end()
        end = _value_end(text, begin)
        spans[key.group(1).strip("\"'")] = (begin, end)
        eol = text.find("\n", end)
        i = last = len(text) if eol < 0 else eol + 1
    new_keys = "".join(f"{k} = {_toml_value(v)}{newline}" for k, v in updates.items() if k not in spans)
    if new_keys and last and text[last - 1:last] != "\n":
        new_keys = newline + new_keys
    edits = [(spans[k], _toml_value(v)) for k, v in updates.items() if k in spans] + ([((last, last), new_keys)] if new_keys else [])
    for (begin, end), value in sorted(edits, key=lambda e: e[0][0], reverse=True):
        text = text[:begin] + value + text[end:]
    return text


def edit_paths(text, updates):
    return edit_table(text, "paths", updates)


def save_paths(file, updates):
    _save_table(file, "paths", updates, edit_paths)


def save_table(file, table, updates):
    _save_table(file, table, updates, lambda text, values: edit_table(text, table, values))


def _save_table(file, table, updates, edit):
    """Update (or create, from the example) a config file. Refuses unless the result differs from the old file by exactly these values."""
    refusal = f"the app can't safely edit this settings file, so change it by hand: {file}"
    try:
        with open(file, encoding="utf-8-sig", newline="") as f:
            text = f.read()
    except FileNotFoundError:
        text = EXAMPLE
    expected = copy.deepcopy(tomllib.loads(text))
    if not isinstance(expected.setdefault(table, {}), dict):
        raise ValueError(refusal)
    expected[table].update(updates)
    text = edit(text, updates)
    try:
        same = tomllib.loads(text) == expected
    except tomllib.TOMLDecodeError:
        same = False
    if not same:
        raise ValueError(refusal)
    data = text.encode("utf-8")  # before any file is made, so a bad value leaves nothing behind
    os.makedirs(os.path.dirname(os.path.abspath(file)), exist_ok=True)
    saving.write(file, lambda f: f.write(data), "wb")


EXAMPLE = '''# music-curator configuration. Copy to curator.toml and adjust.
# Relative paths are relative to this file. The Discogs token is NOT stored here:
# put a line DISCOGS_TOKEN=your_token in a .env file next to this one, or set the DISCOGS_TOKEN environment variable.
# Get a free token at https://www.discogs.com/settings/developers

[paths]
library = "My Music"                 # curated copies go here, in genre folders
inbox   = ["Downloads"]              # folders with new files to curate (non-recursive)
log     = "_curation/log.csv"        # every write, old tags -> new tags
cache   = "_curation/cache"          # API responses (safe to delete)
work    = "_curation/work"           # downloads used for fingerprint checks (safe to delete)
# review = "Review"                  # songs waiting for a decision (shown in `curator serve`)
# review_list = "_curation/Review list.md"   # their reasons: one "- **Artist - Title**: reason" per song

[discogs]
user_agent = "MusicCurator/0.1"      # Discogs asks for a unique, descriptive User-Agent

[ytdlp]
python = ""                          # Python with yt-dlp installed (only to compare your files with videos online)

[curate]
compare_audio = false                # when Curate can't tell which version a song is, compare it with the videos on the record (needs yt-dlp). It only tells you how sure it is

[spotify]
client_id = ""                       # optional: your Spotify app's Client ID, for the Check Spotify button (see README)

[rules]
artist_joiner = " & "
and_to_joiner = true
filename = "{artist} - {title}"
folder = "{genre}"
album_for_singles = false
prefer_existing_genre = true
'''
