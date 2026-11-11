"""Playlists you make in the app or bring in from a file. They're only lists: nothing here moves, copies or changes any music.

A playlist remembers its songs by name, the way play counts do, so a song stays in it when it moves to another genre folder or a better copy replaces the file.
A song that can't be found stays listed as not here, and takes its place again if it turns up.
"""
import copy
import json
import os
import re
import secrets
import unicodedata
import urllib.parse

from . import saving
from .export import picked
from .webapp import name_key, own_lists_path, play_key, text_key

LONGEST_NAME = 100
LENGTH_GAP_S = 10  # copies of a song can differ by a few seconds. Past this it's another version, whatever it's called
MAX_LISTED = 200  # songs that weren't found, named on the page
LONGEST_LINE = 2000  # no real path or name comes close
READINGS = 5  # ways to read an "Artist - Title" with dashes in it. A file made of nothing but dashes mustn't keep the app busy for minutes


def well_formed(saved):
    """What can be used from the saved file. None if there are things in it and not one is a playlist as the app writes them: that's some other file, or one from
    a later version, and saving over it would lose all of it."""
    kept = {k: dict(name=p["name"], entries=[dict(key=e["key"], name=e["name"], file=e.get("file", "")) for e in p["entries"] if isinstance(e, dict) and isinstance(e.get("key"), str) and isinstance(e.get("name"), str)])
            for k, p in saved.items() if isinstance(p, dict) and isinstance(p.get("name"), str) and p["name"].strip() and isinstance(p.get("entries"), list)}
    return kept if kept or not saved else None


def _by_name(songs):
    index = {}
    for s in songs:
        index.setdefault(play_key(s), []).append(s)
    return index


def _song_of(entry, index):
    """The song an entry means: the very file if it's still there, and otherwise the copy in your library before one anywhere else."""
    return min(index.get(entry["key"], ()), key=lambda s: (s["file"] != entry["file"], s["area"] != "library"), default=None)


def listed(collection):
    """Your playlists as the page needs them, A to Z: the songs that are here, and the names of those that aren't."""
    index, out = _by_name(collection.songs.values()), []
    for list_id, p in collection.own.items():
        found = [(e, _song_of(e, index)) for e in p["entries"]]
        out.append(dict(id=list_id, name=p["name"], ids=list(dict.fromkeys(s["id"] for _, s in found if s)), away=[e["name"] for e, s in found if not s]))
    return sorted(out, key=lambda p: p["name"].casefold())


def _entry(song):
    return dict(key=play_key(song), name=" - ".join(x for x in (song["artist"], song["title"]) if x) or song["file"], file=song["file"])


def _put_in(entries, songs, index):
    """Add the songs a playlist doesn't have yet, a second copy of one it has counting as that song. How many went in."""
    here, before = {s["id"] for s in (_song_of(e, index) for e in entries) if s}, len(entries)
    for song in songs:
        entry, same = _entry(song), _song_of(_entry(song), index)["id"]
        if same not in here:
            here.add(same)
            entries.append(entry)
    return len(entries) - before


def _unreadable(collection):
    """True if there's a file the app couldn't make sense of: saving over it would lose every playlist in it."""
    try:
        st = os.stat(own_lists_path(collection.paths))
    except FileNotFoundError:
        return False
    except OSError:
        return True
    return (st.st_mtime_ns, st.st_size) != collection.own_sig


def _change(collection, change):
    """One change to the latest version of your playlists. It only counts once it's saved."""
    path = own_lists_path(collection.paths)
    with collection.lock:
        collection._read_own()
        if _unreadable(collection):
            return dict(error=f"Your playlists file ({os.path.basename(path)}) can't be read, so nothing was changed.")
        draft = copy.deepcopy(collection.own)
        answer = change(draft)
        if answer.get("error"):
            return answer
        try:
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            saving.write(path, lambda f: json.dump(draft, f, ensure_ascii=False, indent=1), encoding="utf-8", errors="replace")
        except OSError as ex:
            return dict(error=f"Couldn't save that: {ex.strerror or ex}")
        collection.own = draft
        return dict(answer, lists=listed(collection))


def _clean(name):
    return " ".join(name.split())[:LONGEST_NAME].strip() if isinstance(name, str) else ""


def _new_id(draft):
    while True:
        made = secrets.token_hex(4)
        if made not in draft:
            return made


def _name_problem(name, draft, but=None):
    if not name:
        return "Give the playlist a name first."
    return f"You already have a playlist called {name}." if any(k != but and p["name"].casefold() == name.casefold() for k, p in draft.items()) else ""


def _free_name(name, draft):
    """An imported playlist never replaces one you have."""
    taken, n, free = {p["name"].casefold() for p in draft.values()}, 1, name
    while free.casefold() in taken:
        n += 1
        free = f"{name} ({n})"
    return free


def read_m3u(text):
    """What an M3U or M3U8 file lists, in order: where each song is and, if it says, what it's called and how long it is."""
    out, shown, secs = [], "", None
    for line in re.split(r"[\r\n]+", text.lstrip("\ufeff")):
        line = line.strip()[:LONGEST_LINE]
        info = re.match(r"#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)", line, re.I)
        if info:
            secs, shown = float(info[1]) if float(info[1]) > 0 else None, info[2].strip()
        elif line and not line.startswith("#"):
            out.append(dict(where=line, shown=shown, secs=secs))
            shown, secs = "", None
    return out


def _plain(text):
    return unicodedata.normalize("NFC", text).casefold()


def _pieces(path):
    return [_plain(p) for p in re.split(r"[\\/]+", path) if p not in ("", ".", "..")]


def _place(where):
    """The path on a line of a playlist, however it was written, and the name of its file. It's only ever compared with songs the app already knows, never opened."""
    where = where.strip('"')
    if re.match(r"file:", where, re.I):
        where = urllib.parse.unquote(re.sub(r"^file:/*", "", where, flags=re.I))
    elif re.match(r"[a-z][a-z0-9+.-]+://", where, re.I):  # a web address: there's no file to go by
        where = ""
    return where, os.path.splitext(re.split(r"[\\/]", where)[-1])[0]


def _ways_to_read(text):
    """The name keys some text could mean. "Artist - Title" can have other dashes in it."""
    bits = text.split(" - ")
    return [name_key(" - ".join(bits[:n]), " - ".join(bits[n:])) for n in range(1, min(len(bits), READINGS + 1))] + [text_key(text)]


def _library_index(songs):
    files, former, names = {}, {}, {}
    for s in songs:
        files.setdefault(_plain(s["file"]), []).append(s)
        if s.get("was"):
            former.setdefault(_plain(s["was"]), []).append(s)
        names.setdefault(play_key(s), []).append(s)
    return files, former, names


def _shared_folders(pieces, song):
    """How much of a playlist's path agrees with this song's, counting back from the file."""
    n = 0
    for mine, theirs in zip(reversed(pieces), reversed(_pieces(song["_path"]))):
        if mine != theirs:
            break
        n += 1
    return n


def find(line, index):
    """The song a line of a playlist means, or None. A matching name isn't enough when the playlist gives a length and this song's is clearly different."""
    files, former, names = index
    where, stem = _place(line["where"])
    pieces, secs = _pieces(where), line["secs"]
    groups = [files.get(pieces[-1], []), former.get(pieces[-1], [])] if pieces else []
    groups += [names.get(key, []) for text in (line["shown"], stem) if text for key in _ways_to_read(text)]
    for group in groups:
        near = [s for s in group if not secs or not s["secs"] or abs(s["secs"] - secs) <= LENGTH_GAP_S]
        if near:
            return max(near, key=lambda s: (_shared_folders(pieces, s), s["area"] == "library"))
    return None


def bring_in(collection, name, text):
    """A new playlist from the text of an M3U or M3U8 file. Songs you don't have keep their place in it, in case they turn up."""
    if not isinstance(text, str):
        return dict(error="That isn't a playlist file.")
    name = name or "Imported playlist"
    lines = read_m3u(text)
    if not lines:
        return dict(error=f"There are no songs in {name}.")
    with collection.lock:
        collection.refresh()
        index, entries, seen, missing, waiting = _library_index(collection.songs.values()), [], set(), [], set()
        for line in lines:
            song = find(line, index)
            if song:
                if song["id"] not in seen:
                    seen.add(song["id"])
                    entries.append(_entry(song))
                continue
            shown = (line["shown"] or _place(line["where"])[1] or line["where"])[:300]
            if shown.casefold() not in waiting:
                waiting.add(shown.casefold())
                missing.append(shown)
                entries.append(dict(key=_ways_to_read(shown)[0], name=shown, file=""))
        if not seen:
            return dict(error=f"None of the songs in {name} are in your library, so it wasn't imported.")

        def make(draft):
            made, free = _new_id(draft), _free_name(name, draft)
            draft[made] = dict(name=free, entries=entries)
            return dict(made=dict(id=made, name=free), found=len(seen), total=len(seen) + len(missing), missing=missing[:MAX_LISTED], more=max(0, len(missing) - MAX_LISTED))

        return _change(collection, make)


def handle(collection, route, body):
    """The page's playlist requests. Answers with {error} when it can't, and otherwise with your playlists as they are now."""
    what, target, name = route.rsplit("/", 1)[1], str(body.get("list") or ""), _clean(body.get("name"))
    if what == "import":
        return bring_in(collection, name, body.get("text"))

    def new(draft):
        problem = _name_problem(name, draft)
        if problem:
            return dict(error=problem)
        made, entries = _new_id(draft), []
        added = _put_in(entries, songs, index)
        draft[made] = dict(name=name, entries=entries)
        return dict(made=dict(id=made, name=name), added=added, already=len(songs) - added)

    def add(draft):
        if not songs:
            return dict(error="There are no songs to add.")
        added = _put_in(draft[target]["entries"], songs, index)
        return dict(added=added, already=len(songs) - added)

    def remove(draft):  # the songs named, or with {away: true} the ones that aren't here
        goes = {s["id"] for s in songs}

        def stays(entry):
            song = _song_of(entry, index)
            return song["id"] not in goes if song else body.get("away") is not True

        draft[target]["entries"] = [e for e in draft[target]["entries"] if stays(e)]
        return {}

    def move(draft):  # the songs named go in front of the song `before`, or to the end if it's None
        goes, before, which = {s["id"] for s in songs}, body.get("before"), lambda e: (_song_of(e, index) or {}).get("id")
        entries = draft[target]["entries"]
        moving, rest = [e for e in entries if which(e) in goes], [e for e in entries if which(e) not in goes]
        at = len(rest) if before is None else next((n for n, e in enumerate(rest) if which(e) == before), None)
        if not moving or at is None:
            return dict(error="That song isn't in this playlist any more. Read the library again.")
        draft[target]["entries"] = rest[:at] + moving + rest[at:]
        return {}

    def rename(draft):
        problem = _name_problem(name, draft, but=target)
        if problem:
            return dict(error=problem)
        draft[target]["name"] = name
        return {}

    def delete(draft):
        del draft[target]
        return {}

    def checked(draft):
        if what != "new" and target not in draft:
            return dict(error="That playlist isn't there any more. Read the library again.")
        return dict(new=new, add=add, remove=remove, move=move, rename=rename, delete=delete)[what](draft)

    with collection.lock:
        songs, index = picked(collection, body.get("ids")), _by_name(collection.songs.values())
        return _change(collection, checked)
