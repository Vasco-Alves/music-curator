"""Getting songs out of the app: a playlist file, a spreadsheet, or copies in a folder of your choice.

Nothing in the library changes. A copy only ever adds files: anything already in the folder stays as it is.
"""
import csv
import io
import os
import shutil
import threading

from . import folders

TRUST_WORDS = dict(verified="Verified", auto="Auto-matched", source="From the source", unverified="Unverified", unknown="No record")
GIVE_UP_AFTER = 3  # failures in a row: the drive has probably gone
MAX_LISTED = 20  # problems shown on the page
PART = ".curator-part"  # the name a copy has until it's complete


def _cell(text):
    """A spreadsheet runs anything that starts like a formula, and these words come from the tags of downloaded files."""
    text = str(text or "")
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def to_csv(songs):
    out = io.StringIO(newline="")
    w = csv.writer(out)
    w.writerow(["Artist", "Title", "Album", "Year", "Genre", "Label", "Country", "Seconds", "Kbps", "How sure", "Link", "File"])
    for s in songs:
        w.writerow([_cell(s["artist"]), _cell(s["title"]), _cell(s["album"]), _cell(s["year"]), _cell(s["genre"]), _cell(s["label"]), _cell(s["country"]),
                    round(s["secs"]) if s["secs"] else "", s["kbps"] or "", TRUST_WORDS.get(s["trust"], ""), _cell(s["link"]), _cell(s["_path"])])
    return "﻿" + out.getvalue()  # so Excel reads it as UTF-8


def to_m3u(songs):
    """An M3U8 playlist (M3U in UTF-8, so non-Latin titles survive) that points to the songs where they are now."""
    lines = ["#EXTM3U"]
    for s in songs:
        if "\n" in s["_path"] or "\r" in s["_path"]:  # a path like that would be read as two entries
            continue
        name = " - ".join(x for x in (s["artist"], s["title"]) if x) or s["file"]
        lines += [f"#EXTINF:{round(s['secs']) if s['secs'] else -1},{' '.join(name.split())}", s["_path"]]
    return "\n".join(lines) + "\n"


MAKERS = dict(csv=to_csv, m3u=to_m3u)


def picked(collection, ids):
    """The songs the page means: only ever songs the app has indexed, never a path sent by the page."""
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        return []
    with collection.lock:
        return [collection.songs[i] for i in dict.fromkeys(ids) if i in collection.songs]


def status(server):
    """What the page shows about a copy."""
    state = dict(server.export_state or {})
    running = bool(state.get("running"))
    return dict(running=running, stopping=running and bool(server.export_stop and server.export_stop.is_set()), done=state.get("done", 0), total=state.get("total", 0),
                name=state.get("name", ""), failed=state.get("failed", ""), result=state.get("result"))


def _dest(song, target, keep):
    return os.path.join(target, *song["_rel"].split("/")) if keep else os.path.join(target, song["file"])


def _space_problem(songs, target, keep):
    """Better to say so now than to stop halfway with the drive full."""
    try:
        free = shutil.disk_usage(folders.nearest_existing(target)).free
    except (OSError, TypeError):
        return ""
    need = sum(s["bytes"] for s in songs if not os.path.exists(_dest(s, target, keep)))
    return f"That needs {need / 1e9:.1f} GB and the drive has {free / 1e9:.1f} GB free." if need > free else ""


class _NameTaken(Exception):
    pass


def _copy_one(song, dest):
    """Returns True if it was copied, False if it was already there."""
    size = os.path.getsize(song["_path"])
    if os.path.exists(dest):
        if os.path.getsize(dest) == size:
            return False
        raise _NameTaken
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + PART
    try:
        shutil.copy2(song["_path"], part)
        if os.path.getsize(part) != size:
            raise OSError("the copy came out the wrong size")
        os.replace(part, dest)
    finally:
        try:
            os.remove(part)
        except OSError:
            pass
    return True


def _work(server, songs, target, keep):
    state, stop_it = server.export_state, server.export_stop
    copied, already, problems, in_a_row, stopped = 0, 0, [], 0, False
    try:
        for n, song in enumerate(songs):
            if stop_it.is_set():
                stopped = True
                break
            state.update(done=n, name=song["file"])
            try:
                if _copy_one(song, _dest(song, target, keep)):
                    copied += 1
                else:
                    already += 1
                in_a_row = 0
            except _NameTaken:
                problems.append(f"{song['file']}: a different file with that name is already there, so it was left alone")
            except OSError as ex:
                problems.append(f"{song['file']}: {ex.strerror or ex}")
                in_a_row += 1
                if in_a_row >= GIVE_UP_AFTER:
                    state.update(failed=f"Stopped after {in_a_row} songs in a row couldn't be copied. Is the folder still there, and is there room on the drive?")
                    break
    except (Exception, SystemExit) as ex:  # noqa: BLE001  the page must never be left saying "copying" forever
        state.update(failed=f"Copying stopped unexpectedly ({type(ex).__name__}). Songs already copied stay there.")
    finally:
        state.update(running=False, done=copied + already + len(problems), result=dict(copied=copied, already=already, problems=problems[:MAX_LISTED], more=max(0, len(problems) - MAX_LISTED), target=target, stopped=stopped))
        server.export_lock.release()


def start(server, songs, value, keep):
    """Begin copying in the background; the page follows it through status(). One at a time."""
    checked = folders.check("export", value)
    if not checked["ok"]:
        return dict(error=checked["message"] or "Choose a folder first.")
    if not server.export_lock.acquire(blocking=False):
        return dict(error="Already copying songs. Wait for that to finish, or stop it.")
    try:
        problem = _space_problem(songs, checked["path"], keep)
        if problem:
            server.export_lock.release()
            return dict(error=problem)
        server.export_state = dict(running=True, done=0, total=len(songs), name="", failed="", result=None)
        server.export_stop = threading.Event()
        threading.Thread(target=_work, args=(server, songs, checked["path"], keep), daemon=True).start()
    except BaseException:
        server.export_lock.release()
        raise
    return dict(started=True)


def stop(server):
    """Finish the song in hand, then stop. Whatever was copied stays."""
    if server.export_stop:
        server.export_stop.set()
    return dict(ok=True)


def handle(server, route, body):
    """The page's export requests. Answers with {error} when it can't."""
    if route.endswith("/stop"):
        return stop(server)
    songs = picked(server.collection, body.get("ids"))
    if not songs:
        return dict(error="There are no songs to export.")
    if route.endswith("/copy"):
        return start(server, songs, body.get("folder"), body.get("keep") is not False)
    make = MAKERS.get(str(body.get("format")))
    return dict(text=make(songs), count=len(songs)) if make else dict(error="That isn't a format the app can save.")
