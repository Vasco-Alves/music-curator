"""Choosing where the library lives: shared by the first-run screen and the Settings page.

Picking a folder never moves music. It only sets where the app looks and where new songs get written.
"""
import os
import subprocess
import sys
import threading
import time

from . import config, library

# Runs in its own short-lived process: a browser can't tell a page a folder's real path, and Tk needs its own main thread.
PICKER = """
import sys, tkinter
from tkinter import filedialog
root = tkinter.Tk()
root.withdraw()
root.attributes('-topmost', True)
root.update()
path = filedialog.askdirectory(parent=root, title=sys.argv[1], initialdir=sys.argv[2] or None, mustexist=False)
sys.stdout.write(path or '')
"""
TITLES = dict(library="Choose your library folder", inbox="Choose a folder where you put downloaded songs",
              review="Choose the folder of songs waiting for a decision", export="Choose where to copy the songs")
NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0  # no console window behind the folder window
COUNT_LIMIT_S = 1.5
MAX_INBOX = 20
_pick_lock = threading.Lock()
_has_picker = [None]


def picker_available():
    if _has_picker[0] is None:
        try:
            done = subprocess.run([sys.executable, "-I", "-c", "import tkinter"], capture_output=True, timeout=30, creationflags=NO_WINDOW)
            _has_picker[0] = done.returncode == 0
        except (OSError, subprocess.SubprocessError):
            _has_picker[0] = False
    return _has_picker[0]


def pick_folder(kind, start=""):
    """Open the system's folder window. Returns {path}, {cancelled: true} or {error}."""
    if not _pick_lock.acquire(blocking=False):
        return dict(error="A folder window is already open. It may be behind this one.")
    try:
        done = subprocess.run([sys.executable, "-I", "-X", "utf8", "-c", PICKER, TITLES.get(kind, "Choose a folder"), start if os.path.isdir(start) else ""],
                              capture_output=True, encoding="utf-8", errors="replace", timeout=900, creationflags=NO_WINDOW)
    except (OSError, subprocess.SubprocessError):
        return dict(error="The folder window couldn't open. Type the path instead.")
    finally:
        _pick_lock.release()
    if done.returncode:
        return dict(error="The folder window couldn't open. Type the path instead.")
    path = done.stdout.strip()
    return dict(path=os.path.normpath(path)) if path else dict(cancelled=True)


def clean(value):
    """What the person typed or picked, as a path. Quotes come off only as a pair, and nothing else in a name is touched."""
    p = str(value or "").strip()
    if len(p) >= 2 and p[0] == p[-1] and p[0] in "\"'":
        p = p[1:-1].strip()
    if not p:
        return ""
    if os.name == "nt" and p.startswith("\\\\?\\"):  # the long-path prefix names the same folder
        p = "\\\\" + p[8:] if p[4:8].upper() == "UNC\\" else p[4:]
    p = os.path.normpath(os.path.expanduser(p))
    if os.name == "nt" and os.path.splitdrive(p)[0]:  # Windows ignores trailing dots and spaces: use the folder it really means
        p = os.path.abspath(p)
    return p


def _same(a, b):
    return os.path.normcase(a) == os.path.normcase(b)


def _inside(child, parent):
    return os.path.normcase(child).startswith(os.path.normcase(parent).rstrip("\\/") + os.sep)


def _count_audio(path, recursive):
    """How many songs a folder holds, giving up after a moment so a huge folder can't stall the page."""
    n, stop = 0, time.monotonic() + COUNT_LIMIT_S
    try:
        if recursive:
            for _dp, _dirs, files in os.walk(path):
                n += sum(os.path.splitext(f)[1].lower() in library.AUDIO for f in files)
                if time.monotonic() > stop:
                    return n, True
        else:
            for entry in os.scandir(path):
                n += os.path.splitext(entry.name)[1].lower() in library.AUDIO and entry.is_file()
    except OSError:
        pass
    return n, False


def _readable(path):
    try:
        with os.scandir(path) as entries:
            next(entries, None)
        return True
    except OSError:
        return False


def _same_list(a, b):
    return [os.path.normcase(os.path.normpath(x)) for x in a] == [os.path.normcase(os.path.normpath(x)) for x in b]


def _songs(n, more):
    return f"{n:,}+ songs" if more else f"{n:,} song{'' if n == 1 else 's'}"


def _library_existed():
    """A library the app set up, or one with songs in the log, really was there. One named by hand may just not be made yet."""
    log = config.path("log")
    return os.path.isabs(config.get("as_written", "library", "") or "") or bool(log and os.path.isfile(log))


def _result(path, tone, message, ok, create=False):
    return dict(path=path, tone=tone, message=message, ok=ok, create=create)


def nearest_existing(path):
    """The closest folder up the tree that's really there, or None if not even the drive is."""
    while not os.path.exists(path):
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent
    return path


def _check_export(p):
    """Can songs be copied here? Never into a folder the app itself reads as music."""
    for where, name in ((config.path("library"), "your library"), (config.path("review"), "your Review folder")):
        if where and _same(p, os.path.normpath(where)):
            return _result(p, "bad", f"That's {name}.", False)
        if where and _inside(p, os.path.normpath(where)):
            return _result(p, "bad", f"That's inside {name}, so the copies would count as songs there.", False)
    if any(_same(p, os.path.normpath(x)) for x in config.path("inbox") or []):  # its subfolders are fine: the app doesn't look in them
        return _result(p, "bad", "That's one of your downloads folders, so the copies would count as new downloads.", False)
    if not nearest_existing(p):
        return _result(p, "bad", "Can't find that drive. If it's a USB drive, plug it in.", False)
    if not os.path.exists(p):
        return _result(p, "warn", "This folder doesn't exist yet. It'll be created.", True, create=True)
    return _result(p, "good", "Songs will be copied here. Anything already in this folder stays.", True)


def check(kind, value, library_value=""):
    """Is this folder usable for this role? Says why in plain words, for the line under the field."""
    p = clean(value)
    if not p:
        needed = kind in ("library", "export")
        return _result(p, "none", "Choose a folder to continue." if needed else "", not needed)
    try:
        p.encode("utf-8")
    except UnicodeEncodeError:
        return _result("", "bad", "That folder name has characters the app can't store.", False)
    if not os.path.isabs(p) or (os.name == "nt" and not os.path.splitdrive(p)[0]):  # "\Music" means a different place per drive
        return _result(p, "bad", "Use the full path to the folder.", False)
    if os.path.exists(p) and not os.path.isdir(p):
        return _result(p, "bad", "That's a file, not a folder.", False)
    if os.path.exists(p) and not _readable(p):
        return _result(p, "bad", "The app isn't allowed to read that folder.", False)
    if kind == "export":
        return _check_export(p)
    if kind == "library":
        current = config.path("library")
        is_current = bool(current) and _same(p, os.path.normpath(current))
        if os.path.dirname(p) == p and not is_current:
            return _result(p, "bad", "Pick a folder on that drive, not the whole drive.", False)
        if not os.path.exists(p):
            if is_current and _library_existed():  # the folder that went missing: never recreate it empty
                return _result(p, "bad", "Can't find this folder. If it's on a drive, plug it in. If it moved, pick its new location.", False)
            return _result(p, "warn", "This folder doesn't exist yet. It'll be created.", True, create=True)
        n, more = _count_audio(p, True)
        if more and not n:
            return _result(p, "good", "This folder is slow to read, so the app couldn't count its songs yet.", True)
        return _result(p, "good", f"{_songs(n, more)} here. They stay where they are." if n else "Empty for now. Finished songs will go here.", True)
    lib = clean(library_value)
    if lib and _same(p, lib):
        return _result(p, "bad", "That's your library folder.", False)
    if lib and _inside(p, lib):
        return _result(p, "bad", "That's inside your library, so its songs would count as library songs.", False)
    if not os.path.exists(p):
        return _result(p, "bad", "That folder doesn't exist.", False)
    n, more = _count_audio(p, kind == "review")
    if more and not n:
        return _result(p, "good", "This folder is slow to read, so the app couldn't count its songs yet.", True)
    return _result(p, "good", f"{_songs(n, more)} waiting here." if n else "No songs in it right now.", True)


def reason():
    """Why the first-run screen is needed: '' when the library is there."""
    lib = config.path("library")
    if not lib:
        return "first"
    return "" if os.path.isdir(lib) else "missing"


def state():
    log = config.path("log") or ""
    return dict(reason=reason(), config_file=config.target_path(), picker=picker_available(), library=config.path("library") or "",
                inbox=config.path("inbox") or [], review=config.path("review") or "", app_folder=os.path.dirname(log) if log else "")


def _app_folder(lib):
    """Next to the library, so players that scan the library never see the app's own files."""
    folder = os.path.join(os.path.dirname(lib), "_curation")
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError:
        folder = os.path.join(os.path.dirname(config.target_path()), "data")
    return folder


def save(body):
    """Check and store the folders. Returns (field, message) if something's wrong, else None."""
    lib = check("library", body.get("library"))
    if not lib["ok"]:
        return "library", lib["message"]
    values = body.get("inbox") or []
    if not isinstance(values, list) or len(values) > MAX_INBOX:
        return "inbox", "That's too many folders."
    inbox = []
    for value in values:
        result = check("inbox", value, lib["path"])
        if not result["ok"]:
            return "inbox", result["message"]
        if result["path"] and not any(_same(result["path"], x) for x in inbox):
            inbox.append(result["path"])
    review = check("review", body.get("review"), lib["path"])
    if not review["ok"]:
        return "review", review["message"]

    fresh = not config.config_path()  # no settings file yet: every value gets written, so the template's examples don't stay
    updates = {}
    if fresh or not config.path("library") or not _same(lib["path"], os.path.normpath(config.path("library"))):
        updates["library"] = lib["path"]
    if fresh or not _same_list(inbox, config.path("inbox") or []):
        updates["inbox"] = inbox
    if not _same(review["path"], os.path.normpath(config.path("review")) if config.path("review") else ""):
        updates["review"] = review["path"]
    log, old_library = config.path("log"), config.path("library")
    moved = bool(log and old_library) and "library" in updates and not os.path.isdir(old_library) and not os.path.isdir(os.path.dirname(log))
    try:
        os.makedirs(lib["path"], exist_ok=True)
        if fresh or moved:  # a first run, or the app's folder went away along with the library
            folder = _app_folder(lib["path"])
            homes = dict(log=(os.path.join(folder, "log.csv"), os.path.dirname), cache=(os.path.join(folder, "cache"), str), work=(os.path.join(folder, "work"), str),
                         review_list=(os.path.join(folder, "Review list.md"), os.path.dirname))  # where the agent lists held-back songs for To check
            for key, (home, folder_of) in homes.items():
                if fresh or not config.path(key) or not os.path.isdir(folder_of(config.path(key))):  # anything still there stays where it is
                    updates[key] = home
        target = config.target_path()
        if updates:
            config.save_paths(target, updates)
        config.load(target)
    except (OSError, ValueError) as ex:
        return "library", f"Couldn't save that: {ex}"
    for key in ("cache", "work"):  # commands create these when they need them, so a problem here doesn't undo the save
        try:
            os.makedirs(config.path(key), exist_ok=True)
        except OSError:
            pass
    return None
