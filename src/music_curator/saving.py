"""Writing a file so that it's either the old one or the new one, never something in between.

A save goes into a file of its own beside the real one, is pushed out to the disk, and then takes the real one's place in one step. So a crash, a full disk or a
power cut leaves your file as it was, and two programs saving at once can't write into each other's halves. On Windows a file can't be replaced while anything has
it open, even only to read it (the app's own page loading, a virus scanner, a backup tool), so the last step is tried again for a moment before giving up.

A file that two programs each read, change and save (your answers: the page and the command line) needs one thing more, or the one that saves second undoes what
the first one did. Each says what the file looked like when it read it (`read_as`), and the save is refused if it looks different by then. Looking and replacing
are done as one step, with a small lock file beside the real one to take turns by.
"""
import contextlib
import itertools
import os
import re
import stat
import threading
import time

ANY = object()  # for `read_as`: save whatever the file looks like now
PART = ".saving"  # how the name of a file still being written ends. Not an audio ending, so a player never lists one left behind
TRIES = 6  # how often the last step is tried while something else has the file open: about three quarters of a second in all
TURN_WAIT_S = 2  # how long a save waits for another program's save of the same file to finish. One takes a few thousandths of a second
_count = itertools.count()
_OURS = re.compile(r".+\.\d+-\d+-\d+" + re.escape(PART))  # the names _part makes


class Changed(OSError):
    """Another program saved the file between this one reading it and saving it. Saving now would undo what that one did."""


def stamp(path):
    """What tells one saved version of a file from the next: when it was written and how big it is. None if there's no file."""
    try:
        st = os.stat(path)
    except FileNotFoundError:
        return None
    return (st.st_mtime_ns, st.st_size)


def _part(path):
    """A name of its own for the file being written: two saves of one file at the same moment each get theirs."""
    return f"{path}.{os.getpid()}-{threading.get_ident()}-{next(_count)}{PART}"


def _no_use_waiting(path):
    """Only Windows refuses to replace a file because something has it open for a moment. A folder in the way, or a file marked read-only, stays that way however long the wait."""
    return os.name != "nt" or os.path.isdir(path) or (os.path.exists(path) and not os.access(path, os.W_OK))


def _swap(part, path, read_as=ANY):
    for attempt in range(TRIES):
        if read_as is not ANY and stamp(path) != read_as:  # looked at right before every try: while this one waited for the file to be let go, the other program may have saved
            raise Changed(f"{os.path.basename(path)} was changed by another program just now")
        try:
            return os.replace(part, path)
        except PermissionError:  # open somewhere just now. Whatever it is usually lets go in a moment
            if attempt == TRIES - 1 or _no_use_waiting(path):
                raise
            time.sleep(.05 * (attempt + 1))


class _Turn:
    """One program at a time from looking at a file to putting the new one in its place. Without it two programs could both look, both see nothing new, and both replace it.
    The turn is a lock on a small file beside the real one, which the system lets go of when the program ends, however it ends. That file stays: taking it away would let two in at once."""

    def __init__(self, path):
        self.path, self.file = path + ".lock", None

    def _take(self):
        self.file.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def __enter__(self):
        try:
            self.file = open(self.path, "a+b")
        except OSError:  # the lock file can't be made here. The save still looks before it replaces, as well as it can without a turn
            return self
        until = time.monotonic() + TURN_WAIT_S
        while True:
            try:
                self._take()
                return self
            except OSError:
                if time.monotonic() >= until:
                    self.file.close()
                    raise OSError(f"{os.path.basename(self.path)[:-5]} is being saved by another program just now") from None
                time.sleep(.01)

    def __exit__(self, *_):
        if self.file:
            with contextlib.suppress(OSError, ValueError):
                if os.name == "nt":
                    import msvcrt
                    self.file.seek(0)
                    msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
            self.file.close()


def write(path, fill, mode="w", read_as=ANY, **how):
    """Put a whole new file at `path`. `fill(f)` writes it into `f`, opened with `mode` and `how` (encoding, errors, newline).
    All of it gets there or the old file stays as it was, and nothing half-written is left either way. Raises what `fill` raises, or OSError.
    When the new file was made from the old one, pass the old one's stamp as `read_as`: if the file has another by now, somebody else has saved meanwhile,
    and Changed is raised with their file left as it is."""
    if os.path.islink(path):  # kept somewhere else and linked to from here, as some people keep their settings: the file it points at is the one to save, and the link stays
        path = os.path.realpath(path)
    part = _part(path)
    try:
        with open(part, mode.replace("w", "x"), **how) as f:
            fill(f)
            f.flush()
            with contextlib.suppress(OSError):  # some drives can't be told to. Then it's as safe as it was before this
                os.fsync(f.fileno())
        if os.name != "nt":  # on a Mac or Linux a new file can be read by more people than the old one let. Windows keeps that with the folder
            with contextlib.suppress(OSError):  # a first save has no old file to go by
                os.chmod(part, stat.S_IMODE(os.stat(path).st_mode))
        if read_as is ANY:
            _swap(part, path)
        else:
            with _Turn(path):
                _swap(part, path, read_as)
    except BaseException:
        with contextlib.suppress(OSError):
            os.remove(part)
        raise


def sweep(folder, older_than_s=3600):
    """Remove files a save left behind in this folder when its program was killed halfway. Young ones are left: another program may be writing one right now.
    Only names this module makes are touched: a file of your own that happens to end the same way is not the app's to remove."""
    try:
        names = os.listdir(folder)
    except OSError:
        return
    for name in names:
        path = os.path.join(folder, name)
        if _OURS.fullmatch(name) and os.path.isfile(path):
            with contextlib.suppress(OSError):
                if time.time() - os.path.getmtime(path) > older_than_s:
                    os.remove(path)
