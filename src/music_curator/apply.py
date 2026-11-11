"""`curator apply`: carry out the answers from the browser that need no research.

A genre answer changes the genre tag and nothing else (checked byte by byte) and moves the song to the new genre's folder.
A song you said Curate got wrong leaves the library, and waits on To check again. With --set-aside, songs marked "not worth keeping"
leave too. Nothing is ever deleted: what gets replaced or taken out goes to a "Set aside" folder next to the log, and every change is
logged. Answers that need research stay on the list for the person's agent.
"""
import csv
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

from . import config, folders, library, saving, tagwriter, webapp

SET_ASIDE = "Set aside"
TEMP_PREFIX, TEMP_SUFFIX = ".tmp_apply_", ".part"  # not an audio extension, so a player never lists one left behind
ASKS_ABOUT_GENRE = re.compile(r"genre toss-up|genre (is )?a guess", re.I)  # the notes that make the page ask about a song's genre
RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


class Skip(Exception):
    """This answer can't be carried out; the message says why, in words for the person."""


class Gone(Exception):
    """The answer is about a file that's no longer there, in a folder that is."""


# ---------------- the tag ----------------

def _tag_frames(data):
    """(ID3 version, [(frame id, whole frame)], where the tag ends). Anything this can't read with certainty raises Skip."""
    if len(data) < 10 or data[:3] != b"ID3" or any(b & 0x80 for b in data[6:10]):
        raise Skip("it has no ID3v2 tag to edit")
    version, flags = data[3], data[5]
    if version not in (3, 4) or flags:
        raise Skip(f"its tag is a kind that can't be edited safely (ID3v2.{version}, flags {flags:#x})")
    end, pos, frames = 10 + library._syncsafe(data[6:10]), 10, []
    if end > len(data):
        raise Skip("its tag is damaged")
    while pos + 10 <= end and data[pos]:
        raw_size = data[pos + 4:pos + 8]
        if not library._valid_id(data, pos, 4) or (version == 4 and any(b & 0x80 for b in raw_size)):
            raise Skip("its tag is damaged")
        size = int.from_bytes(raw_size, "big") if version == 3 else library._syncsafe(raw_size)
        if pos + 10 + size > end:
            raise Skip("its tag is damaged")
        frames.append((data[pos:pos + 4], data[pos:pos + 10 + size]))
        pos += 10 + size
    if any(data[pos:end]):  # only padding may follow the frames, or they were misread
        raise Skip("its tag is damaged")
    return version, frames, end


def _genre_frame(version, genre):
    encoding, text, _ = tagwriter._enc(genre)
    body = encoding + text
    size = len(body).to_bytes(4, "big") if version == 3 else tagwriter._syncsafe(len(body))
    return b"TCON" + size + b"\x00\x00" + body


def with_genre(data, genre):
    """The file's bytes with its genre replaced. Every other frame and all the audio are carried over untouched."""
    version, frames, end = _tag_frames(data)
    new, kept, placed = _genre_frame(version, genre), [], False
    for frame_id, frame in frames:
        if frame_id != b"TCON":
            kept.append(frame)
        elif not placed:
            kept.append(new)
            placed = True
    if not placed:
        kept.insert(0, new)
    body, room = b"".join(kept), end - 10
    size = room if len(body) <= room else len(body) + tagwriter.PADDING
    return b"ID3" + bytes([version, data[4], 0]) + tagwriter._syncsafe(size) + body.ljust(size, b"\x00") + data[end:]


def other_with_genre(path, genre):
    """A FLAC or M4A file's bytes with its genre replaced. Its other tags and cover stay, and the audio has to come out packet for packet the same."""
    with tempfile.TemporaryDirectory() as folder:
        out = os.path.join(folder, "song" + os.path.splitext(path)[1].lower())
        try:
            tagwriter.remux(path, out, dict(genre=genre), keep=True)
        except (OSError, ValueError, subprocess.SubprocessError) as ex:
            raise Skip("its tags couldn't be rewritten, so the song was left as it was") from ex
        was, now = tagwriter.audio_packets(path), tagwriter.audio_packets(out)
        if not was or was != now:  # nothing read from either is not "the same": ffmpeg was stopped, or couldn't read them
            raise Skip("the new copy didn't check out, so the song was left as it was")
        with open(out, "rb") as f:
            return f.read()


def _same_song(now, was):
    """A rewritten FLAC or M4A can state its length a hair differently (the audio has already been compared packet by packet)."""
    close = abs((now["secs"] or 0) - (was["secs"] or 0)) <= .2
    return close and {k: v for k, v in now.items() if k not in ("secs", "kbps")} == {k: v for k, v in was.items() if k not in ("secs", "kbps")}


def _check(path, name, old, new, song, genre):
    """Read back what was written (a temporary copy of the file called `name`): only the genre may differ from the original."""
    with open(path, "rb") as f:
        written = f.read()
    if written != new:
        raise Skip("the new copy didn't check out, so the song was left as it was")
    now, wanted = library.read_song(path, name), dict(song, genre=genre)
    if os.path.splitext(name)[1].lower() != ".mp3":
        if not _same_song(now, wanted):
            raise Skip("the new copy didn't check out, so the song was left as it was")
        return
    _, before, old_end = _tag_frames(old)
    _, after, new_end = _tag_frames(written)
    others = lambda frames: [f for f in frames if f[0] != b"TCON"]  # noqa: E731
    if others(before) != others(after) or old[old_end:] != written[new_end:] or now != wanted:
        raise Skip("the new copy didn't check out, so the song was left as it was")


# ---------------- where things are and go ----------------

def _locate(key, paths):
    """(area, root folder, file path) of the song an answer is about. The path stays inside the folders you chose."""
    parts = key.split("/") if isinstance(key, str) else []
    awkward = r"[\\:]" if os.name == "nt" else r"\x00"  # on Windows these could only be a hand-made way out of the folder
    if len(parts) < 2 or any(p in ("", ".", "..") or re.search(awkward, p) for p in parts) or os.path.splitext(parts[-1])[1].lower() not in library.AUDIO:
        raise Skip("the answer doesn't point at a song")
    area, rest = parts[0], parts[1:]
    if area in ("library", "review"):
        roots = [paths[area]] if paths[area] else []
    elif area == "inbox" and len(rest) >= 2:
        roots, rest = [r for r in paths["inbox"] if os.path.basename(os.path.normpath(r)) == rest[0]], rest[1:]
    else:
        roots = []
    found = [(os.path.normpath(root), os.path.normpath(os.path.join(root, *rest))) for root in roots]
    found = [(root, path) for root, path in found if folders._inside(path, root)]
    if not found:
        raise Skip("the answer doesn't point at a song in your folders")
    holding = [pair for pair in found if os.path.isfile(pair[1])]
    if len(holding) > 1:
        raise Skip("two of your folders have the same name and both hold this file, so there's no telling which one you meant")
    if not holding:
        if not all(os.path.isdir(root) for root, _ in found):
            raise Skip("its folder can't be found. Is the drive connected?")
        raise Gone
    return (area, *holding[0])


def _clean_answer(genre):
    text = " ".join(genre.split()) if isinstance(genre, str) else ""
    if not text or library._clean_genre(text) != text or any(ord(c) < 32 for c in text):
        raise Skip(f'"{text}" can\'t be used as a genre')
    name = tagwriter.safe_filename(text.replace("/", "-").replace("\\", "-"))
    if not name or name.split(".")[0].upper() in RESERVED:
        raise Skip(f'"{text}" can\'t be used as a folder name')
    return text


def _genre_folder(song, genre):
    fields = dict(artist=song["artist"], title=song["title"], album=song["album"], year=song["year"], genre=genre.replace("/", "-").replace("\\", "-"))
    parts = (tagwriter.safe_filename(p) for p in re.split(r"[\\/]", config.rule("folder").format(**fields)) if p)
    return [p for p in parts if p]


def _destination(library_root, path, song, genre):
    """Where the song belongs now. One kept anywhere but its genre's folder (a soundtrack folder, say) stays where it is."""
    try:
        if webapp.norm(os.path.join(library_root, *_genre_folder(song, song["genre"]))) != webapp.norm(os.path.dirname(path)):
            return path
        return os.path.join(library_root, *_genre_folder(song, genre), os.path.basename(path))
    except (KeyError, IndexError, ValueError):  # a folder rule that can't be filled in
        return path


def _aside_folder(paths):
    base, root = os.path.dirname(paths["log"]), os.path.normpath(paths["library"])
    if webapp.norm(base) == webapp.norm(root) or folders._inside(os.path.normpath(base), root):  # players scanning the library must not find these
        base = os.path.join(os.path.dirname(root), "_curation")
    return os.path.join(base, SET_ASIDE)


def _whole(src, dst):
    """Copy a file so that it only gets its name once all of it is there: closing the app or pulling the drive halfway never leaves half a song under the song's own name."""
    handle, tmp = tempfile.mkstemp(prefix=TEMP_PREFIX, suffix=TEMP_SUFFIX, dir=os.path.dirname(dst) or ".")
    os.close(handle)
    try:
        shutil.copy2(src, tmp)
        os.rename(tmp, dst)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def _move(src, dst):
    """Move a file, leaving nothing half done if it won't go (a song that's playing can't be moved)."""
    if os.path.exists(dst):
        raise OSError(f"{dst} is already there")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        shutil.move(src, dst, copy_function=_whole)  # on the same drive it's renamed in one step; to another drive it's copied first
    except BaseException:
        if os.path.exists(src) and os.path.exists(dst):  # copied to another drive, but the original wouldn't let go
            os.remove(dst)
        raise


def _copy(src, dst):
    if os.path.exists(dst):
        raise OSError(f"{dst} is already there")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        _whole(src, dst)
    except BaseException:
        if os.path.exists(dst):
            os.remove(dst)
        raise


def _remove_if_empty(folder):
    try:
        os.rmdir(folder)
    except OSError:
        pass


def _sweep(root):
    """Temporary copies left behind by a run that was stopped halfway."""
    for folder, _, names in os.walk(root):
        for name in names:
            if name.startswith(TEMP_PREFIX) and name.endswith(TEMP_SUFFIX):
                try:
                    os.remove(os.path.join(folder, name))
                except OSError:
                    pass


def _now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def _settled(notes, old_genre):
    """The notes without the genre question, so the page stops asking."""
    kept = [p.strip() for p in notes.split(";") if p.strip() and not ASKS_ABOUT_GENRE.search(p)]
    return "; ".join(kept + [f"genre chosen by you (was {old_genre})" if old_genre else "genre chosen by you"])


def _first_row(path, song):
    """A log row for a song the log doesn't know."""
    return dict(status="ok", src=path, src_artist=song["artist"], src_album=song["album"], src_title=song["title"], src_secs=song["secs"] or "", dest=path,
                artist=song["artist"], title=song["title"], album=song["album"], year=song["year"], genre=song["genre"],
                discogs=song["comment"] if song["comment"].startswith("http") else "", notes="")


def _open_log(path):
    """Open the log first: if it can't be written (open in Excel, say), better to find out before anything changes."""
    fresh = not os.path.exists(path) or os.path.getsize(path) == 0
    try:
        unfinished = False
        if not fresh:
            with open(path, "rb") as f:
                f.seek(-1, os.SEEK_END)
                unfinished = f.read(1) not in (b"\n", b"\r")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        handle = open(path, "a", newline="", encoding="utf-8-sig")
    except OSError as ex:
        sys.exit(f"Can't write to the log ({ex.strerror or ex}): {path}\nIf it's open in another program, close it and run this again. Nothing was changed.")
    if unfinished:
        handle.write("\r\n")
    writer = csv.DictWriter(handle, fieldnames=tagwriter.LOG_FIELDS, extrasaction="ignore", restval="")
    if fresh:
        writer.writeheader()
    return handle, writer


class Run:
    def __init__(self, paths, dry_run, needs_log, say=print, update=None):
        self.paths, self.dry_run, self.say, self.update = paths, dry_run, say, update
        self.troubles = []  # what couldn't be done, in words for the page
        self.collection = webapp.Collection(paths)
        self.collection._read_log()
        self.aside = os.path.join(_aside_folder(paths), datetime.datetime.now().strftime("%Y-%m-%d %H-%M-%S"))
        self.changed, self.removed, self.cleared, self.problems, self.back = 0, 0, 0, 0, 0
        self.log_file, self.log, self.log_end, self.planned = None, None, None, None
        if needs_log and not dry_run:
            self.log_file, self.log = _open_log(paths["log"])
            _sweep(paths["library"])
            _sweep(_aside_folder(paths))  # a copy on its way there when a run was stopped: the original it was made from is still where it was

    def close(self):
        if self.log_file:
            try:
                self.log_file.close()
            except OSError:
                pass

    def write_log(self, row):
        """Log a change before making it, so whatever stops this run the log is never behind the files.
        Returns the log's length before this row, so the row can be taken back if the change doesn't happen."""
        try:
            self.log_file.flush()
            mark = os.fstat(self.log_file.fileno()).st_size
            self.log.writerow(row)
            self.log_file.flush()
            self.log_end = os.fstat(self.log_file.fileno()).st_size  # where the log ends with this row as its last
        except OSError as ex:
            raise Skip(f"the log couldn't be written ({ex.strerror or ex}), so the song was left as it was") from ex
        return mark

    def take_back(self, mark):
        """Take the row just logged back out, the change not having happened. Not if something else has written to the log since: cutting it back to the mark
        would take that with it. The row then stays, saying a change was made that wasn't, and the next run makes it true: the answer is still on the list."""
        try:
            if os.fstat(self.log_file.fileno()).st_size == self.log_end:
                self.log_file.truncate(mark)
        except (OSError, ValueError):
            pass

    def forget(self, key, keep=False, moved=None):
        """Take an answer off the list, reading the list again first: the page may have saved new answers meanwhile.
        moved=(old file, new file): the song's other answers go with it."""
        planned = self.planned

        def change(answers):
            if planned is not None and answers.get(key) != planned:  # you changed this answer on the page while its song was being dealt with: the new one stays on the list for the next run
                pass
            elif keep and isinstance(answers.get(key), dict):
                answers[key]["action"] = "keep"
            else:
                answers.pop(key, None)
            if moved:
                old, new = moved
                same = lambda d: isinstance(d, dict) and d.get("file") == old  # noqa: E731
                renamed = {(f"{k.split(':', 1)[0]}:{new}" if same(d) else k): (dict(d, file=new) if same(d) else d) for k, d in answers.items()}
                answers.clear()
                answers.update(renamed)
        if self.update:  # from the page, which keeps the list and may be saving a new answer this moment
            problem = self.update(change)
            if problem:
                raise Skip(problem)
            return
        path = self.paths["decisions"]
        for last_try in (False, False, True):  # read, change, save. If the page saved an answer in between, the change is made again on the newer file: saving over it would lose that answer
            was = saving.stamp(path)
            try:
                with open(path, encoding="utf-8-sig") as f:
                    answers = json.load(f)
            except (OSError, ValueError) as ex:
                raise Skip(f"your answers couldn't be read ({ex})") from ex
            change(answers)
            try:
                return saving.write(path, lambda f: json.dump(answers, f, ensure_ascii=False, indent=1), read_as=was, encoding="utf-8", errors="replace")
            except saving.Changed:
                if last_try:
                    raise

    def retire(self, key, keep=False, moved=None):
        """The song has been dealt with by now, so trouble updating the list is only worth a word: the next run clears it."""
        try:
            self.forget(key, keep, moved)
        except (OSError, Skip) as ex:
            self.say(f"    Its answer couldn't be taken off the list ({getattr(ex, 'strerror', None) or ex}). The next run will clear it.")

    def changed_meanwhile(self, key, answer):
        """Is this no longer the answer on the list? The run read the list when it started, and you may have changed or undone the answer on the page since."""
        for _ in range(5):
            try:
                with open(self.paths["decisions"], encoding="utf-8-sig") as f:
                    now = json.load(f)
                return not isinstance(now, dict) or now.get(key) != answer
            except (OSError, ValueError):  # being saved at this very moment, most likely
                time.sleep(.02)
        return False  # the list can't be read just now, so there's nothing to say it changed

    def attempt(self, key, answer, handler):
        name = answer["song"]
        self.planned = None if self.dry_run else answer
        if not self.dry_run and self.changed_meanwhile(key, answer):
            self.say(f"  {name}: you changed this answer while the run was going, so it was left for the next one")
            return
        try:
            handler(key, answer, name)
        except Gone:
            self.say(f"  {name}: its file isn't there any more, so this answer {'would be' if self.dry_run else 'was'} cleared")
            self.cleared += 1
            if not self.dry_run:
                self.retire(key)
        except Skip as ex:
            self.say(f"  {name}: not done: {ex}")
            self.problems += 1
            self.troubles.append(f"{name}: {ex}.")
        except PermissionError:
            self.say(f"  {name}: not done: the file is in use. Close whatever is playing it and run this again")
            self.problems += 1
            self.troubles.append(f"{name}: the file is in use. Stop playing it and press Curate again.")
        except OSError as ex:
            self.say(f"  {name}: not done: {ex.strerror or ex}")
            self.problems += 1
            self.troubles.append(f"{name}: {ex.strerror or ex}.")

    def to_aside(self, action, path, file):
        target = os.path.join(self.aside, *file.split("/"))
        try:
            action(path, target)
        except BaseException:
            self.tidy_aside(target)
            raise
        return target

    @staticmethod
    def tidy_aside(target):
        try:
            os.removedirs(os.path.dirname(target))  # no empty folders left over from something that didn't happen
        except OSError:
            pass

    def swap(self, file, path, dest, old, new, song, genre, row, already_placed):
        """The new file is written and proved right first, and the old one leaves last, so there's never a moment without the song."""
        folder, moving = os.path.dirname(dest), webapp.norm(dest) != webapp.norm(path)
        made, mark, done = not os.path.isdir(folder), None, False
        tmp = os.path.join(folder, f"{TEMP_PREFIX}{os.getpid()}{TEMP_SUFFIX}")
        try:
            if not already_placed:
                os.makedirs(folder, exist_ok=True)
                with open(tmp, "wb") as f:
                    f.write(new)
                _check(tmp, os.path.basename(path), old, new, song, genre)
            mark = self.write_log(row)
            if moving:
                if not already_placed:
                    os.replace(tmp, dest)
                try:
                    self.to_aside(_move, path, file)
                except BaseException:
                    if os.path.exists(path) and not already_placed:  # the old copy couldn't leave, so the new one doesn't stay
                        os.remove(dest)
                    raise
            else:
                aside = self.to_aside(_copy, path, file)
                try:
                    os.replace(tmp, dest)
                except BaseException:
                    os.remove(aside)
                    self.tidy_aside(aside)
                    raise
            done = True
        except BaseException:
            if mark is not None:
                self.take_back(mark)
            raise
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
            if made and not done:
                _remove_if_empty(folder)
        old_folder = os.path.dirname(path)
        if moving and webapp.norm(old_folder) != webapp.norm(self.paths["library"]):
            _remove_if_empty(old_folder)

    def change_genre(self, key, answer, name):
        area, root, path = _locate(answer.get("file"), self.paths)
        if area != "library":
            raise Skip("it isn't in your library yet, so this one is for your AI app")
        kind = os.path.splitext(path)[1].lower()
        if kind not in tagwriter.KINDS:
            raise Skip("only MP3, FLAC and M4A files can be changed this way for now")
        genre, song = _clean_answer(answer.get("genre")), library.read_song(path)
        if song["genre"] == genre:
            self.say(f"  {name}: already {genre}, nothing to change")
            if not self.dry_run:
                self.retire(key, keep=True)
            return
        with open(path, "rb") as f:
            old = f.read()
        new = with_genre(old, genre) if kind == ".mp3" else other_with_genre(path, genre)
        dest = _destination(self.paths["library"], path, song, genre)
        moving, already_placed = webapp.norm(dest) != webapp.norm(path), False
        folder = os.path.dirname(dest)
        if moving and os.path.exists(dest):
            with open(dest, "rb") as f:
                already_placed = f.read() == new  # a run that was stopped halfway got this far
            if not already_placed:
                raise Skip(f"there's already a file with its name in {os.path.basename(folder)}")
        where = "your library" if webapp.norm(folder) == webapp.norm(self.paths["library"]) else os.path.relpath(folder, self.paths["library"])
        line = f"  {name}: {song['genre'] or '(none)'} -> {genre}, {'moved to' if moving else 'stays in'} {where}"
        if self.dry_run:
            self.say(line)
            self.changed += 1
            return
        row = dict(self.collection._log_row(path, os.path.relpath(path, root).replace(os.sep, "/")) or _first_row(path, song))
        row.update(date=_now(), status=row["status"] if row.get("status", "").startswith("check") else "ok", dest=dest, genre=genre,
                   notes=_settled(row.get("notes", ""), song["genre"]))
        self.swap(answer["file"], path, dest, old, new, song, genre, row, already_placed)
        self.say(line)
        self.changed += 1
        new_file = "library/" + os.path.relpath(dest, self.paths["library"]).replace(os.sep, "/")
        self.retire(key, moved=(answer["file"], new_file) if moving else None)

    def take_out(self, key, answer, name):
        area, root, path = _locate(answer.get("file"), self.paths)
        if self.dry_run:
            self.say(f"  {name}: would go to the {SET_ASIDE} folder")
            self.removed += 1
            return
        song, logged = library.read_song(path), None
        if area == "library":
            logged = self.collection._log_row(path, os.path.relpath(path, root).replace(os.sep, "/"))
        target = os.path.join(self.aside, *answer["file"].split("/"))
        row = dict(logged or dict(_first_row(path, song), dest=""))
        row.update(date=_now(), status=f"removed: not worth keeping (set aside in {target})")
        mark = self.write_log(row)
        try:
            self.to_aside(_move, path, answer["file"])
        except BaseException:
            self.take_back(mark)
            raise
        self.say(f"  {name}: set aside")
        self.removed += 1
        self.retire(key)

    def not_right(self, key, answer, name):
        """Curate's match was wrong, so the copy leaves the library and the song waits on To check again. While its original is still in
        your downloads the copy goes to the Set aside folder; if the original has gone, the copy goes back in its place, under its old name."""
        area, root, path = _locate(answer.get("file"), self.paths)
        if area != "library":
            raise Skip("it isn't in your library")
        logged = self.collection._log_row(path, os.path.relpath(path, root).replace(os.sep, "/"))
        src = os.path.normpath(logged["src"]) if logged and logged.get("src") else ""
        home = next((d for d in self.paths["inbox"] if src and webapp.norm(os.path.dirname(src)) == webapp.norm(d)), None)
        if not home:
            raise Skip("the log doesn't say it came from one of your downloads folders, so it stayed in your library")
        if not os.path.isdir(home):
            raise Skip("its downloads folder can't be found. Is the drive connected?")
        original = os.path.isfile(src)
        where = f"the {SET_ASIDE} folder" if original else "your downloads, under its old name"
        if self.dry_run:
            self.say(f"  {name}: would leave your library, to {where}")
            self.back += 1
            return
        target = os.path.join(self.aside, *answer["file"].split("/")) if original else src
        said = " ".join(str(answer.get("note") or "").split())[:300]
        notes = [p.strip() for p in (logged.get("notes") or "").split(";") if p.strip() and not p.strip().startswith(tagwriter.NOT_RIGHT)]
        row = dict(logged, date=_now(), status=f"{tagwriter.TAKEN_BACK} ({f'set aside in {target}' if original else 'back in your downloads'})",
                   notes="; ".join(notes + [f"{tagwriter.NOT_RIGHT}: {said}" if said else tagwriter.NOT_RIGHT]))
        mark = self.write_log(row)
        try:
            if original:
                self.to_aside(_move, path, answer["file"])
            else:
                _move(path, target)
        except BaseException:
            self.take_back(mark)
            raise
        if webapp.norm(os.path.dirname(path)) != webapp.norm(self.paths["library"]):
            _remove_if_empty(os.path.dirname(path))
        self.say(f"  {name}: out of your library, to {where}. It waits on To check.")
        self.back += 1
        self.retire(key)


def _listed(answers):
    """The answers that are in a usable shape, by song."""
    pairs = [(k, d) for k, d in answers.items() if isinstance(d, dict) and d.get("action") and isinstance(d["action"], str) and isinstance(d.get("song"), str)] if isinstance(answers, dict) else []
    return sorted(pairs, key=lambda pair: pair[1]["song"].lower())


def _for_the_page(paths, set_aside):
    """The answers the page's Curate button can carry out: what's going first, then the genre changes."""
    try:
        with open(paths["decisions"], encoding="utf-8-sig") as f:
            pairs = _listed(json.load(f))
    except (OSError, ValueError):
        return []
    in_library = lambda p: str(p[1].get("file") or "").startswith("library/")  # noqa: E731
    return ([p for p in pairs if p[1]["action"] == "wrong" and in_library(p)] + ([p for p in pairs if p[1]["action"] == "drop"] if set_aside else [])
            + [p for p in pairs if p[1]["action"] == "genre" and in_library(p)])


def any_for_the_page(paths, set_aside, only=None):
    return any(not only or answer["action"] in only for _, answer in _for_the_page(paths, set_aside))


def add_up(*told):
    """Answers carried out in more than one go, told back as one."""
    out = dict(changed=0, aside=0, cleared=0, back=0, not_done=[])
    for t in filter(None, told):
        for k in ("changed", "aside", "cleared", "back"):
            out[k] += t.get(k, 0)
        out["not_done"] = out["not_done"] + list(t.get("not_done") or [])
    return out


def carry_out(paths, set_aside=False, update=None, stopping=None, progress=None, only=None):
    """What the page's Curate button does with your answers: the same work as the command, told back in numbers. Anything that can't be done is said and stays on the list.
    only: just the answers with these actions."""
    work = [p for p in _for_the_page(paths, set_aside) if not only or p[1]["action"] in only]
    told = dict(changed=0, aside=0, cleared=0, back=0, not_done=[])
    if not work:
        return told
    try:
        run = Run(paths, False, True, say=lambda _: None, update=update)
    except SystemExit as ex:  # the log can't be written: better to find out before anything changes
        return dict(told, not_done=[str(ex)])
    handlers = dict(wrong=run.not_right, drop=run.take_out, genre=run.change_genre)
    try:
        for n, (key, answer) in enumerate(work):
            if stopping and stopping.is_set():
                break
            if progress:
                progress(done=n, total=len(work), name=answer["song"])
            run.attempt(key, answer, handlers[answer["action"]])
    finally:
        run.close()
    return dict(changed=run.changed, aside=run.removed, cleared=run.cleared, back=run.back, not_done=run.troubles)


def main(dry_run=False, set_aside=False):
    paths = webapp.app_paths()
    if not os.path.isdir(paths["library"]):
        sys.exit(f"Your library folder isn't there: {paths['library']}\nIs its drive connected?")
    answers = {}
    if os.path.exists(paths["decisions"]):
        try:
            with open(paths["decisions"], encoding="utf-8-sig") as f:
                answers = json.load(f)
        except (OSError, ValueError) as ex:
            sys.exit(f"Couldn't read your answers in {paths['decisions']}: {ex}")
    pairs = _listed(answers)
    genres = [p for p in pairs if p[1]["action"] == "genre"]
    drops = [p for p in pairs if p[1]["action"] == "drop"]
    wrongs = [p for p in pairs if p[1]["action"] == "wrong"]
    adds = [p for p in pairs if p[1]["action"] == "add"]
    others = [p for p in pairs if p[1]["action"] not in ("keep", "genre", "drop", "wrong", "add", "added", "stream")]
    if not (genres or drops or wrongs or others or adds):
        print("Nothing to apply: no genre changes or other requests are waiting.")
        return 0
    if dry_run:
        print("Preview only: nothing is being changed.\n")
    run = Run(paths, dry_run, bool(genres or wrongs or (drops and set_aside)))
    try:
        if wrongs:  # first of all: a song on its way out doesn't need anything else done to it
            print("Not right (out of your library, to look at again on To check)")
            for key, answer in wrongs:
                run.attempt(key, answer, run.not_right)
            print()
        if drops and set_aside:  # first: a song on its way out doesn't need its genre changed
            print("Not worth keeping")
            for key, answer in drops:
                run.attempt(key, answer, run.take_out)
            print()
        if genres:
            print("Genre changes")
            for key, answer in genres:
                run.attempt(key, answer, run.change_genre)
            print()
        if drops and not set_aside:
            print("Marked not worth keeping (staying where they are: add --set-aside to move them out)")
            for _, answer in drops:
                print(f"  {answer['song']}")
            print()
        if others:
            print("For your AI app (these need research, so they stay on the list)")
            for _, answer in others:
                extra = "".join(f" | {x}" for x in (answer.get("genre"), answer.get("note")) if x)
                print(f"  [{webapp.WORDS.get(answer['action'], answer['action'])}] {answer['song']}{extra}")
            print()
        if adds:
            print("To add to your playlists (Spotify doesn't let apps add local files, so these are for you to drag in)")
            for _, answer in adds:
                print(f"  {answer['song']} -> {str(answer.get('note') or 'a playlist').replace(chr(10), ', ')}")
            print()
    finally:
        run.close()
    counts = [f"{run.changed} genre change{'' if run.changed == 1 else 's'}"] if genres else []
    if wrongs:
        counts.append(f"{run.back} out of your library to look at again")
    if drops and set_aside:
        counts.append(f"{run.removed} set aside")
    if run.cleared:
        counts.append(f"{run.cleared} cleared")
    if run.problems:
        counts.append(f"{run.problems} not done")
    if others:
        counts.append(f"{len(others)} for your AI app")
    if adds:
        counts.append(f"{len(adds)} to add by hand")
    print(("Would do: " if dry_run else "Done: ") + ", ".join(counts) + ".")
    if dry_run and (genres or wrongs or (drops and set_aside)):
        print(f"Run `curator apply{' --set-aside' if set_aside else ''}` to do this.")
    if not dry_run and os.path.isdir(run.aside):
        print(f"What was replaced or taken out is in {run.aside}\nNothing was deleted. Empty that folder whenever you're happy with the result.")
    if run.back and not dry_run:
        print("Run `curator curate`, or press Curate on the page, to look the songs you took out up again: they wait on To check with the versions on their record.")
    if run.changed + run.removed + run.cleared + run.back and not dry_run:
        print("If your library is open in the browser, refresh the page.")
    return 1 if run.problems else 0
