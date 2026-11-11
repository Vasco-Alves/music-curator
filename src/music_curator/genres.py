"""Every style Discogs lists for the records in your library, for the app.

A file and its folder keep the one genre you settled on, so tags, Spotify and your phone don't change. The rest are kept next to the
log, per record, so the page can show them on a song and find the song under any of them. Discogs gives styles for a whole release: on
a single or an EP that's the song, but on a compilation it's a mix of the album's, so those are marked and only shown.
"""
import datetime
import http.client
import json
import os
import urllib.error

from . import discogs, saving, webapp

SAVE_EVERY = 20  # records between saves, so a run that's cut off loses little
GIVE_UP_AFTER = 3  # lookups failing in a row before the network is assumed to be down


def known(paths):
    """What's been found so far: record -> {styles, wide}. A file that makes no sense counts as nothing found yet: it can all be looked up again.
    None if the file is there and couldn't be opened just now. That isn't an empty one, and saving as if it were would lose what's in it."""
    try:
        with open(webapp.styles_path(paths), encoding="utf-8-sig") as f:
            saved = json.load(f)
    except (FileNotFoundError, ValueError):
        return {}
    except OSError:
        return None
    return {k: v for k, v in saved.items() if isinstance(v, dict) and isinstance(v.get("styles"), list)} if isinstance(saved, dict) else {}


def _save(paths, saved):
    """True once it's saved whole."""
    path = webapp.styles_path(paths)
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        saving.write(path, lambda f: json.dump(saved, f, ensure_ascii=False, indent=1), encoding="utf-8", errors="replace")
    except OSError:
        return False
    return True


def entry(data):
    """What's worth keeping from a Discogs release or master. The very broad genres ("Electronic") only stand in when it has no styles."""
    words = lambda name: [x.strip() for x in data.get(name) or [] if isinstance(x, str) and x.strip()]  # noqa: E731
    described = {d for f in data.get("formats") or [] if isinstance(f, dict) for d in f.get("descriptions") or []}
    various = any(isinstance(a, dict) and (a.get("name") or "").strip().lower() == "various" for a in data.get("artists") or [])
    return dict(styles=words("styles") or words("genres"), wide="Compilation" in described or various)


def wanted(collection):
    """The records your library's songs came from and aren't known yet: record -> a song's name, to show while looking."""
    out = {}
    for song in list(collection.songs.values()):
        record = webapp.record_of(song["link"]) if song["area"] == "library" else ""
        if record and record not in collection.styles:
            out.setdefault(record, f"{song['artist']} - {song['title']}".strip(" -") or song["file"])
    return out


def fill(paths, records, progress=None, stopping=None):
    """Look up the records given (record -> name). Returns how many were looked up, whether it was stopped, and anything worth saying."""
    progress = progress or (lambda **_: None)
    if not records:
        return dict(looked=0, stopped=False, said="")
    discogs.CACHE_DIR = os.path.join(paths["cache"], "discogs")
    os.makedirs(discogs.CACHE_DIR, exist_ok=True)
    saved, todo, fails, looked, stopped, said = known(paths), sorted(records), 0, 0, False, ""
    if saved is None:
        return dict(looked=0, stopped=False, said="The list of extra genres couldn't be opened just now, so none were fetched. Press Curate to carry on later.")
    for n, record in enumerate(todo):
        if stopping and stopping.is_set():
            stopped = True
            break
        progress(done=n, total=len(todo), name=records[record])
        kind, number = record.split("/")
        try:
            data = discogs.get(f"/{kind}s/{number}")
        except urllib.error.HTTPError as ex:
            if ex.code in (401, 403):
                said = "Discogs turned your token down, so the extra genres weren't all fetched."
                break
            fails += 1
        except (OSError, ValueError, RuntimeError, http.client.HTTPException):
            fails += 1
        else:
            fails = 0
            looked += 1
            saved[record] = dict(entry(data if isinstance(data, dict) else {}), at=datetime.date.today().isoformat())  # a record that's gone from Discogs isn't asked about again
        if fails >= GIVE_UP_AFTER:
            said = "Discogs isn't answering, so the extra genres weren't all fetched. Press Curate to carry on later."
            break
        if (n + 1) % SAVE_EVERY == 0:
            _save(paths, saved)
    if not _save(paths, saved):
        said = said or "The extra genres that were fetched couldn't be saved. Press Curate to fetch them again later."
    return dict(looked=looked, stopped=stopped, said=said)


def main():
    paths = webapp.app_paths()
    collection = webapp.Collection(paths)
    collection.refresh()
    records = wanted(collection)
    if not records:
        print("Every record in your library has its genres already.")
        return 0
    print(f"Looking up {len(records)} record{'' if len(records) == 1 else 's'} on Discogs (about one a second)...")
    done = fill(paths, records)
    print(f"Done: {done['looked']} looked up.")
    if done["said"]:
        print(done["said"])
    return 1 if done["said"] else 0
