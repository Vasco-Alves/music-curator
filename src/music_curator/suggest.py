"""`curator suggest`: which of your songs look like they belong in your playlists?

It learns only from your own data: the genres, years, artists and labels of your songs already in each playlist, and how much
your other playlists overlap with it. It only speaks up when it's sure, so a song can get several playlists, one, or none. It can't hear
anything, so these are still ideas: you listen on the To check page and decide. Run it again with a newer copy of your playlists
and it notices which songs you've since added.

The playlists come from a JSON file: [{"name": "...", "tracks": [{"name": "...", "artists": ["..."]}]}]
"""
import collections
import datetime
import json
import math
import os
import re
import sys

from . import saving, webapp
from .keys import norm as _norm
from .keys import plain as _plain

COUNT = 40
MIN_SONGS = 8  # with fewer of your songs in a playlist than this there's nothing to learn from
BIG = 30  # playlists with at least this many of your songs are much more predictable: tested by hiding songs and seeing if they came back
SURE, SURE_SMALL = .7, .9  # the estimated chance needed before a playlist gets suggested, in a big and a small playlist
OVERLAP_WEIGHT = 1.5  # your own sorting says more than genre does: in testing this is what lifted the results most
Count = collections.Counter


def track_key(artist, title):
    """Who and what, ignoring featured artists and mix names. That's for learning what a playlist is like, and for not suggesting a song where some version of it
    already is. Whether a song you said to add has arrived goes by its full name: see read_names."""
    first = re.split(r"\s*(?:&|,| feat\.? | ft\.? | x | vs\.? )\s*", artist or "", flags=re.I)[0]
    return _norm(first) + "|" + _norm(re.sub(r"\s*[(\[][^)\]]*[)\]]", "", title or ""))


def _lists(path):
    """[(playlist name, its tracks)] from the file."""
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("expected a list of playlists")
    return [(p["name"], [t for t in p["tracks"] if isinstance(t, dict)]) for p in data if isinstance(p, dict) and isinstance(p.get("name"), str) and isinstance(p.get("tracks"), list)]


def read_playlists(path):
    """{playlist name: set of track keys}."""
    return {name: {track_key(((t.get("artists") or [""])[0]), t.get("name")) for t in tracks} - {"|"} for name, tracks in _lists(path)}


def read_names(path):
    """{playlist name: the names of its tracks in full}, each (who, what) with the version left in. A song you said to add has arrived when the playlist has it under
    its own name: another version of it in there isn't the song."""
    def text(x):
        return x if isinstance(x, str) else ""
    found = {name: {(_plain(" ".join(text(a) for a in (t.get("artists") if isinstance(t.get("artists"), list) else []) if text(a))), _plain(text(t.get("name")))) for t in tracks} for name, tracks in _lists(path)}
    return {name: {full for full in names if full[1]} for name, names in found.items()}  # a track with no name is nothing to go by


def _decade(song):
    return song["year"][:3] + "0s" if song["year"] else ""


def _lift(inside, everywhere, total_inside, total, levels, a=1.0):
    """How much more common this is in the playlist than in the whole library, on a scale where 0 means no different."""
    return math.log(((inside + a) / (total_inside + a * levels)) / ((everywhere + a) / (total + a * levels)))


def _said(items):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


class Model:
    """What each fact about a song says about whether it belongs, learned from the songs already in the playlist."""

    def __init__(self, songs, keys, members, playlists, target):
        self.songs, self.keys, self.target = songs, keys, target
        inside = [s for s in songs if s["id"] in members]
        self.size, self.base = len(inside), len(inside) / len(songs)
        self.genres, self.all_genres = Count(s["genre"] for s in inside), Count(s["genre"] for s in songs)
        self.decades, self.all_decades = Count(_decade(s) for s in inside), Count(_decade(s) for s in songs)
        self.artists, self.all_artists = Count(_norm(s["artist"]) for s in inside), Count(_norm(s["artist"]) for s in songs)
        self.labels, self.all_labels = Count(s["label"] for s in inside), Count(s["label"] for s in songs)
        owned, member_keys = set().union(*keys.values()), set().union(*(keys[s["id"]] for s in inside))
        self.overlap = {}
        for name, tracks in playlists.items():
            mine = tracks & owned
            if name != target and mine and len(mine) <= len(songs) / 2:  # a list of nearly everything says nothing about feel
                shared = len(mine & member_keys)
                self.overlap[name] = ((shared + self.base * 4) / (len(mine) + 4), shared, tracks)

    def score(self, song):
        """(total, how much each fact added, the closest other playlist the song is in)."""
        total = len(self.songs)
        parts = dict(genre=_lift(self.genres[song["genre"]], self.all_genres[song["genre"]], self.size, total, len(self.all_genres)),
                     decade=_lift(self.decades[_decade(song)], self.all_decades[_decade(song)], self.size, total, len(self.all_decades)))
        artist = _norm(song["artist"])
        others = self.all_artists[artist] - 1  # the song itself says nothing
        if artist and others:
            parts["artist"] = math.log((self.artists[artist] + self.base) / (others + 1) / self.base)
        if song["label"] and self.all_labels[song["label"]] > 1:
            parts["label"] = _lift(self.labels[song["label"]], self.all_labels[song["label"]], self.size, total, len(self.all_labels), a=.5)
        near = max(((rate, name) for name, (rate, _, tracks) in self.overlap.items() if self.keys[song["id"]] & tracks), default=None)
        if near:
            parts["playlists"] = OVERLAP_WEIGHT * math.log(near[0] / self.base)
        return sum(parts.values()), parts, near[1] if near else ""

    def chance(self, score):
        """The score as an estimated chance, which is fair between big playlists and small ones."""
        odds = self.base / (1 - self.base) * math.exp(score)
        return odds / (1 + odds)

    def sure_enough(self, chance):
        return chance >= (SURE if self.size >= BIG else SURE_SMALL)

    def why(self, song, parts, near):
        facts = []
        for part in sorted(parts, key=parts.get, reverse=True):
            if parts[part] <= 0:
                continue
            if part == "genre" and self.genres[song["genre"]]:
                facts.append(f"{self.genres[song['genre']]} {song['genre']} songs")
            elif part == "decade" and _decade(song):
                facts.append(f"{self.decades[_decade(song)]} from the {_decade(song)}")
            elif part == "artist":
                facts.append(f"{self.artists[_norm(song['artist'])]} by {song['artist']}")
            elif part == "label":
                facts.append(f"{self.labels[song['label']]} on {song['label']}")
        text = f"Could fit {self.target}: " + (f"it has {_said(facts[:3])}" if facts else "worth a listen")
        if near and parts["playlists"] > 0:
            text += f". You also have it in {near}, which shares {self.overlap[near][1]} of your songs with it"
        return text + "."


def fits_for(song, members, models):
    """Every playlist this song isn't in yet, best first: [(chance, sure enough?, name, why)]."""
    found = []
    for name, model in models.items():
        if song["id"] not in members[name]:
            total, parts, near = model.score(song)
            chance = model.chance(total)
            found.append((chance, model.sure_enough(chance), name, model.why(song, parts, near)))
    return sorted(found, key=lambda x: -x[0])


def _update_answers(path, done, notes):
    """Take finished answers off the list, and shorten the ones where only some of the playlists are still to come."""
    for last_try in (False, False, True):  # read, change, save. If the page saved an answer in between, it's done again on the newer file
        was = saving.stamp(path)
        with open(path, encoding="utf-8-sig") as f:
            answers = json.load(f)
        for key in done:
            answers.pop(key, None)
        for key, note in notes.items():
            if isinstance(answers.get(key), dict):
                answers[key]["note"] = note
        try:
            return saving.write(path, lambda f: json.dump(answers, f, ensure_ascii=False, indent=1), read_as=was, encoding="utf-8", errors="replace")
        except saving.Changed:
            if last_try:
                raise


def main(snapshot, name=None, count=COUNT):
    paths = webapp.app_paths()
    try:
        playlists, exact = read_playlists(snapshot), read_names(snapshot)
    except (OSError, ValueError) as ex:
        sys.exit(f"Couldn't read the playlists in {snapshot}: {ex}")
    target = None
    if name:
        matches = [n for n in playlists if n == name] or [n for n in playlists if name.lower() in n.lower()]
        if len(matches) != 1:
            sys.exit(f'{"Several playlists match" if matches else "No playlist matches"} "{name}". The playlists are: ' + ", ".join(sorted(matches or playlists)))
        target = matches[0]
    collection = webapp.Collection(paths)
    collection.refresh()
    if collection.decisions_broken:
        sys.exit(f"Your answers file ({paths['decisions']}) can't be read. Repair it first.")
    songs = [s for s in collection.songs.values() if s["area"] == "library"]
    if not songs:
        sys.exit("There are no songs in your library yet.")
    keys, full, own = {}, {}, collections.Counter((_plain(s["artist"]), _plain(s["title"])) for s in songs)
    for s in songs:
        row = collection._log_row(s["_path"], s["_rel"]) or {}  # the playlist may still know a song by its old name
        keys[s["id"]] = {track_key(s["artist"], s["title"])} | ({track_key(row.get("src_artist"), row.get("src_title"))} if row.get("src_title") else set())
        old = (_plain(row.get("src_artist")), _plain(row.get("src_title"))) if row.get("src_title") else None
        full[s["id"]] = {(_plain(s["artist"]), _plain(s["title"]))} | ({old} if old and not own[old] else set())  # its old name counts unless another of your songs goes by that name today: then it's that one in the playlist
    members = {n: {s["id"] for s in songs if keys[s["id"]] & tracks} for n, tracks in playlists.items()}
    learnable = [n for n, m in members.items() if MIN_SONGS <= len(m) <= len(songs) / 2]
    if target and target not in learnable:
        sys.exit(f"{len(members[target])} of the songs in {target} are in your library: too {'few' if len(members[target]) < MIN_SONGS else 'many'} to learn from.")
    if not learnable:
        sys.exit(f"None of your playlists has at least {MIN_SONGS} of your songs, so there's nothing to learn from.")
    models = {n: Model(songs, keys, members[n], playlists, n) for n in learnable}

    by_key = {s["key"]: s for s in songs}
    answers = {k: d for k, d in collection.decisions.items() if d.get("kind") == "playlist"}
    added, still_to_come = [], {}
    for k, d in answers.items():
        song = by_key.get(d.get("file"))
        wanted = [n for n in str(d.get("note") or "").split("\n") if n]
        if d.get("action") != "add" or not song or not wanted:
            continue
        left = [n for n in wanted if not full[song["id"]] & exact.get(n, set())]  # one name per line: it can be going to several. Only its own name counts as arrived: the original being there isn't the remix
        if not left:
            added.append(k)
        elif len(left) < len(wanted):
            still_to_come[k] = "\n".join(left)
    if added or still_to_come:
        try:
            _update_answers(paths["decisions"], added, still_to_come)
        except (OSError, ValueError) as ex:
            sys.exit(f"Your answers ({paths['decisions']}) couldn't be updated just now, so nothing was changed: {getattr(ex, 'strerror', None) or ex}. Run this again.")
    if added:
        print(f"Now in the playlist, so taken off your list: {_said([answers[k]['song'] for k in added])}")
    answered = {d.get("file") for k, d in answers.items() if k not in added}

    owned = set().union(*keys.values())
    names = sorted((n for n, tracks in playlists.items() if n == target or len(tracks & owned) <= len(songs) / 2), key=str.lower)  # a list of nearly everything isn't a place to send a song
    new, kept = [], []
    for song in songs:
        fits = fits_for(song, members, models)
        sure = [f for f in fits if f[1]]
        if song["key"] in answered:  # stays visible under "Show what's decided", sure or not
            if fits:
                kept.append((song, sure or fits[:1]))
        elif sure and (not target or any(f[2] == target for f in sure)):
            new.append((song, sure))
    new.sort(key=lambda x: -x[1][0][0])
    ideas = {song["key"]: dict(why=fits[0][3], fits=[dict(name=f[2], why=f[3]) for f in fits], also=[n for n in names if keys[song["id"]] & playlists[n]]) for song, fits in kept + new[:count]}
    target_file = webapp.suggestions_path(paths)
    try:
        os.makedirs(os.path.dirname(target_file) or ".", exist_ok=True)
        saving.write(target_file, lambda f: json.dump(dict(playlists=names, made=datetime.datetime.now().isoformat(timespec="seconds"), songs=ideas), f, ensure_ascii=False, indent=1), encoding="utf-8", errors="replace")
    except OSError as ex:
        sys.exit(f"The playlist ideas couldn't be saved just now ({ex.strerror or ex}). Run this again.")
    print(f"{len(learnable)} playlists have enough of your songs to learn from. {min(len(new), count)} songs have a playlist they're a confident fit for"
          + (f" ({len(new) - count} more than the {count} shown)." if len(new) > count else "."))
    print("They're on the To check page under Playlist ideas. Refresh the page if it's open.")
    return 0
