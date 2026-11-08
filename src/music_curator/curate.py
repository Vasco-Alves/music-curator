"""`curator curate`: curate with no AI, from the command line or the page's Curate button.

Every song waiting in your downloads folders is looked up on Discogs. A song is copied into your library, with clean tags, name and
cover, only when the evidence settles it: its artist and name match a track on a record and, when the record lists a length, so does the
length. With nobody double-checking, these rules are stricter than an agent's. Everything else waits on To check with the reason and the
versions found, for you to settle by ear. Originals are never changed, and every write is logged.
"""
import datetime
import hashlib
import http.client
import json
import os
import re
import shutil
import sys
import threading
import urllib.error
import urllib.parse

from . import config, discogs, parse, resolve, tagwriter, webapp

MAX_GAP_S = 20  # how far a file's length may be from the record's. Past it the file may be another edit (on a real library, the first wrong match came at 55 s)
AUTO_NOTE, PICK_NOTE = "matched automatically", "picked by you"  # in the log's notes; the page shows these songs as Auto-matched
SAVE_EVERY = 10  # songs between saves of what's waiting, so a run that's cut off loses little
GIVE_UP_AFTER = 3  # lookups failing in a row before the network is assumed to be down
ONLY_MP3 = "Only MP3 files can be curated for now."
NOT_LOOKED_UP = {
    "mix": "Looks like a DJ mix or a full album, so it wasn't looked up.",
    "ost": "Looks like game or film music, which Discogs rarely lists by track, so it wasn't looked up.",
    "nightcore": "Nightcore edits aren't on Discogs, so it wasn't looked up.",
    "nonmusic": "Doesn't look like a song, so it wasn't looked up.",
}


class Stop(Exception):
    """Curate can't go on; the message says why, in words for the person."""


def missing(paths):
    """What has to be in place before Curate can run, in words for the person ("" when it's ready)."""
    if not paths["library"] or not paths["log"] or not paths["inbox"]:
        return "Choose your library and downloads folders first, under Folders."
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        return "Curate needs ffmpeg and ffprobe. Install ffmpeg, add it to your PATH, then restart this app."
    try:
        discogs.token()
    except SystemExit as ex:
        if "can't be right" in str(ex):
            return str(ex)
        return f"Curate looks songs up on Discogs, which needs a free token. Create one at discogs.com/settings/developers, then save a text file called .env in {os.path.dirname(config.env_file())} with one line: DISCOGS_TOKEN=your token. Then refresh this page."
    return ""


def _no_token_in(text):
    """Error messages can quote a request's headers. The token must never reach a file or the page."""
    return text.replace(discogs._tok[0], "(token)") if discogs._tok[0] else text


class _OneAtATime:
    """Only one run per library, even from a second window or the command line. The system lets go of this when the process ends, however it ends."""

    def __init__(self, path):
        self.path, self.file = path, None

    def __enter__(self):
        self.file = open(self.path, "a+b")
        try:
            self.file.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as ex:
            self.file.close()
            raise Stop("Curate is already running on this library, in another window or command. Wait for it to finish.") from ex
        return self

    def __exit__(self, *_):
        self.file.close()


# ---------------- is the evidence enough? ----------------

def name_notes(title):
    """What a file's title says in brackets, other than who's featured or a browser's copy number: "(Slowed)", "[Acid Mix]"."""
    notes = (n.strip() for n in re.findall(r"[(\[]([^()\[\]]*)[)\]]", title or ""))
    return [n for n in notes if n and not n.isdigit() and not re.match(r"(?:feat|ft|featuring)\b", n, re.I)]


def _span(seconds):
    return f"{seconds} seconds" if seconds < 90 else f"{seconds // 60}:{seconds % 60:02d}"


def _credited(artist):
    """The people credited, each as a set of name words."""
    parts = re.split(r"\s*(?:&|,|/|\+|;|\band\b|\bx\b|\bvs\.?(?=\s)|\bversus\b|\bfeat\.?(?=\s)|\bft\.?(?=\s)|\bfeaturing\b)\s*", artist or "", flags=re.I)
    return [words for words in (resolve.tokens(p) for p in parts) if words]


def same_artist(named, credited):
    """Is the artist on the record the one the file names? One credited name has to match whole: "Eve" isn't "Steven Wilson", "John Smith" isn't "John Williams"."""
    if resolve.plain(named) and resolve.plain(named) == resolve.plain(credited):
        return True
    mine, theirs = _credited(named), _credited(credited)
    return bool(mine and theirs) and (any(name in theirs for name in mine) or set().union(*mine) == set().union(*theirs))


def _reasons(found):
    """Why the lookup itself didn't settle it."""
    said = []
    for reason in found.get("reasons") or ["it couldn't be confirmed"]:
        m = re.match(r"(probably )?already in library: (.+)$", reason)
        said.append(f"{'probably a' if m[1] else 'a'}lready in your library: {os.path.basename(m[2])}" if m else reason)
    return "; ".join(said)


def judge(item, found):
    """Why this song shouldn't go in with nobody double-checking, in words for the person. "" means the evidence is enough."""
    if found["status"] != "ready":
        return _reasons(found)
    how, gap, title = found.get("how") or "", found.get("dur_diff"), found.get("title") or ""
    if not same_artist(item.get("artist"), found.get("artist")):
        return f'The closest record is by {found.get("artist")}, not the artist your file names.'
    if "file says" in how:
        return f'Your file says "{item.get("mix")}", and the record doesn\'t list that. By length it\'s closest to "{title}".'
    if how.startswith("length matches") and any(o.get("gap") is None for o in found.get("options") or []):
        return "The record lists several versions and not all of them have a length, so the length can't settle which this is."
    if gap is not None and abs(gap) > MAX_GAP_S:
        return f"Your file is {_span(abs(gap))} {'longer' if gap > 0 else 'shorter'} than the record lists, so it could be a different version."
    notes = [*name_notes(item.get("title")), *(item.get("extra") or []), *(item.get("noted") or [])]  # "(Slowed)", "- Slowed", or said in a reading of the name that didn't work
    for note in notes:
        if not resolve.mix_matches(note, title):
            return f'Your file says "{note}", and the record doesn\'t list that.'
    if (how.startswith("only version") or "share this exact title" in how) and resolve.paren(title) and not notes:
        return f'The record only lists "{title}", and your file doesn\'t name a mix.'
    return ""


def with_names(item, artist, title):
    """The same song under another reading of its name."""
    info = parse.parse(f"{artist} - {title}", {})
    return dict(item, **{k: info[k] for k in ("artist", "title", "search_artist", "search_title", "mix", "extra")})


def other_readings(item):
    """Other ways to read a name that found nothing: the file's own tags, then the name the other way round. What the file's name notes still counts."""
    noted, readings = [*name_notes(item.get("title")), *(item.get("extra") or [])], []
    if item.get("tag_artist") and item.get("tag_title"):
        readings.append(dict(with_names(item, item["tag_artist"], item["tag_title"]), noted=noted))
    if item.get("artist") and item.get("title"):
        readings.append(dict(with_names(item, item["title"], item["artist"]), noted=[]))  # its notes moved with the words
    tried, found = {(resolve.plain(item.get("search_artist")), resolve.plain(item.get("search_title")))}, []
    for reading in readings:
        names = (resolve.plain(reading["search_artist"]), resolve.plain(reading["search_title"]))
        if names not in tried and all(names):
            tried.add(names)
            found.append(reading)
    return found


def lookup(item, history, library_keys):
    """(the reading of the name that worked, what the lookup found). The history isn't changed: a song only counts once it's in."""
    found = resolve.resolve(item, dict(history), library_keys)
    if found["status"] == "notfound":
        for reading in other_readings(item):
            again = resolve.resolve(reading, dict(history), library_keys)
            if again["status"] != "notfound":
                return reading, again
    return item, found


def fetch_cover(url, folder):
    """Save a record's cover and return the file, or "" if there isn't a usable one: no cover beats a broken one."""
    host = urllib.parse.urlsplit(url or "").hostname or ""
    if host != "discogs.com" and not host.endswith(".discogs.com"):
        return ""
    path = os.path.join(folder, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".jpg")
    if os.path.exists(path):
        return path
    try:
        data = discogs._request(url, binary=True)
        if not data or data[:3] != b"\xff\xd8\xff":
            return ""
        with open(path + ".tmp", "wb") as f:
            f.write(data)
        os.replace(path + ".tmp", path)
    except Exception:  # noqa: BLE001  a song is never held up by its cover
        return ""
    return path


def key_of(item):
    """The page's name for a song in a downloads folder."""
    return f"inbox/{item['dir']}/{item['file']}"


def said_names(note):
    """(artist, title) from what someone typed, or None if it isn't written that way."""
    note = parse.clean(" ".join(str(note or "").split()))
    return tuple(note.split(" - ", 1)) if " - " in note else None


class Run:
    def __init__(self, paths, dry_run=False, say=print, progress=None, stopping=None, retire=None):
        self.paths, self.dry, self.say = paths, dry_run, say
        self.progress = progress or (lambda **_: None)
        self.stopping = stopping or threading.Event()
        self.take_off_list = retire or self._take_off_list
        self.songs, self.added, self.loaded = {}, [], False
        self.looked, self.stopped = 0, False
        self.covers, self.writer, self.history, self.library_keys = None, None, {}, {}

    # ---------------- files ----------------

    def _read_answers(self):
        path = self.paths["decisions"]
        try:
            with open(path, encoding="utf-8-sig") as f:
                loaded = json.load(f)
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as ex:
            raise Stop(f"Your answers file ({os.path.basename(path)}) can't be read, so Curate stopped there: {ex}") from ex
        return {k: v for k, v in loaded.items() if isinstance(v, dict)} if isinstance(loaded, dict) else {}

    def _read_waiting(self):
        try:
            with open(webapp.curated_path(self.paths), encoding="utf-8-sig") as f:
                songs = json.load(f)["songs"]
            return {k: v for k, v in songs.items() if isinstance(v, dict)}
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return {}

    def _save_waiting(self):
        if self.dry or not self.loaded:  # a run that couldn't read your downloads has nothing to say about them
            return
        path = webapp.curated_path(self.paths)
        try:
            with open(path + ".tmp", "w", encoding="utf-8", errors="replace") as f:
                json.dump(dict(when=datetime.datetime.now().isoformat(timespec="seconds"), songs=self.songs), f, ensure_ascii=False, indent=1)
            os.replace(path + ".tmp", path)
        except OSError as ex:
            self.say(f"Couldn't save the list of waiting songs ({ex.strerror or ex}). The next run makes it again.")

    def _take_off_list(self, key, answer):
        """Remove an answer that was carried out, if it's still the same one: the page may have saved a new one meanwhile."""
        path = self.paths["decisions"]
        with open(path, encoding="utf-8-sig") as f:
            answers = json.load(f)
        if answers.get(key) == answer:
            del answers[key]
        with open(path + ".curate.tmp", "w", encoding="utf-8", errors="replace") as f:
            json.dump(answers, f, ensure_ascii=False, indent=1)
        os.replace(path + ".curate.tmp", path)

    def _retire(self, key, answer):
        if self.dry:
            return
        try:
            problem = self.take_off_list(key, answer)
        except (OSError, ValueError, AttributeError, TypeError) as ex:
            problem = str(ex)
        if problem:  # the song has been dealt with by now, so this is only worth a word
            self.say(f"Its answer couldn't be taken off the list: {problem}")

    # ---------------- one song ----------------

    def hold(self, key, why, found=None, retry=False, said=""):
        old = self.songs.get(key) or {}
        entry = {"why": _no_token_in(why)}
        if found is None:  # a blip or a failed write says nothing about the song: what was found before still stands
            entry.update({k: old[k] for k in ("options", "record", "said") if k in old})
        elif found.get("options") and found.get("genre") and (found["status"] != "dup" or "probably" in " ".join(found.get("reasons") or [])):
            entry["options"] = [dict(o, id=f"{o['pos']}|{o['title']}") for o in found["options"]]
            entry["record"] = {k: found.get(k) or "" for k in ("discogs", "release_title", "labels", "album", "year", "genre", "cover_url")}
            entry["record"]["toss"] = " / ".join(found.get("genre_options") or []) if found.get("toss_up") else ""
        if said:
            entry["said"] = said  # the next run goes by what you said, not the file's name
        if retry:
            entry["retry"] = True  # worth another go: it counts as not looked at yet
        self.songs[key] = entry
        self.say(f"  waiting  {key.rsplit('/', 1)[-1]}: {entry['why']}")

    def add(self, key, item, tags, notes):
        """Write the song. False if it didn't go in, and it's on the waiting list instead."""
        cover = "" if self.dry else fetch_cover(tags.get("cover_url"), self.covers)
        entry = dict(key=item["key"], src=item["src"], artist=tags["artist"], title=tags["title"], album=tags.get("album") or "", year=str(tags.get("year") or ""),
                     genre=tags["genre"], discogs=tags.get("discogs") or "", cover=cover, notes="; ".join(n for n in notes if n))
        try:
            row = self.writer.write(entry)
        except Exception as ex:  # noqa: BLE001  a naming rule that can't be filled in, a full disk: one song, not the whole run
            self.hold(key, f"The new copy couldn't be written: {ex}")
            return False
        status = row["status"]
        if status in ("ok", "dry") or status.startswith("check"):
            name = f"{tags['artist']} - {tags['title']}".strip(" -")
            self.songs.pop(key, None)
            self.added.append(name)
            resolve.remember_in_library(self.library_keys, os.path.splitext(os.path.basename(row["dest"]))[0], row["dest"])
            self.say(f"  added    {name}  ({tags['genre']})")
            return True
        m = re.match(r"skipped: already in library \((.+)\)$", status)
        codec = re.match(r"skipped: source is (\w+), not mp3", status)
        self.hold(key, f"Already in your library: {os.path.basename(m[1])}" if m else f"It's named .mp3, but it's really {codec[1]}. {ONLY_MP3}" if codec else status)
        return False

    def _judged(self, key, item, said=""):
        used, found = lookup(item, self.history, self.library_keys)
        self.looked += 1
        why = judge(used, found)
        if why:
            self.hold(key, f'You said "{said}". {why}' if said else why, found, said=said)
            return
        how = found.get("how") or ""
        gap = found.get("dur_diff")
        length = "no length on the record" if gap is None else "length matches the record" if abs(gap) <= 1 else f"length within {abs(gap)} s of the record"
        toss = "genre toss-up: " + " / ".join(found["genre_options"]) if found.get("toss_up") else ""
        if self.add(key, item, found, [f"{AUTO_NOTE}: {how}, {length}", *found.get("notes", []), toss]) and not toss:
            self.history.setdefault(resolve.norm(found["artist"]), found["genre"])  # a genre nobody has judged doesn't decide the next song's

    def one(self, item):
        key = key_of(item)
        if not os.path.exists(item["src"]):
            self.songs.pop(key, None)
            return
        answer_key, answer = f"waiting:{key}", self._read_answers().get(f"waiting:{key}") or {}  # read now, not at the start: you may have answered during the run
        action = answer.get("action")
        if action in ("drop", "keep"):  # "not worth keeping" and "leave it for now": it stays as it is
            return
        if action == "pick":
            if self._pick(key, item, answer):
                self._retire(answer_key, answer)
            return
        if action == "identify":
            names = said_names(answer.get("note"))
            if not names:  # "anything that helps" is for a person or an agent to read
                return
            self._judged(key, with_names(item, *names), " - ".join(names))
            self._retire(answer_key, answer)
            return
        remembered = said_names((self.songs.get(key) or {}).get("said"))
        if remembered:
            self._judged(key, with_names(item, *remembered), " - ".join(remembered))
            return
        if item["cat"] != "candidate":
            self.hold(key, NOT_LOOKED_UP[item["cat"]])
            return
        self._judged(key, item)

    def _pick(self, key, item, answer):
        """You said which version on the record this is. True once the answer has been dealt with."""
        old = self.songs.get(key) or {}
        record, option = old.get("record") or {}, next((o for o in old.get("options") or [] if o.get("id") == answer.get("note")), None)
        if not option or not record.get("genre"):
            self._judged(key, item)  # the list has changed since you chose: look it up again
            return True
        toss = "genre toss-up: " + record["toss"] if record.get("toss") else ""
        return self.add(key, item, dict(record, artist=option["artist"], title=option["title"]), [f"{PICK_NOTE} from the versions on the record", toss])

    # ---------------- a whole run ----------------

    def summary(self):
        return dict(added=len(self.added), waiting=len(self.songs), looked=self.looked, stopped=self.stopped, names=self.added[:12], when=datetime.datetime.now().isoformat(timespec="seconds"))

    def go(self):
        paths = self.paths
        problem = missing(paths)
        if problem:
            raise Stop(problem)
        if not os.path.isdir(paths["library"]):
            raise Stop("Your library folder can't be found. Is its drive connected?")
        self._read_answers()  # better to find out now than halfway through
        folders = [d for d in paths["inbox"] if os.path.isdir(d)]
        if not folders:
            raise Stop("Your downloads folder can't be found. Is its drive connected?")
        discogs.CACHE_DIR = os.path.join(paths["cache"], "discogs")
        self.covers = os.path.join(paths["work"], "covers")
        try:
            for folder in (discogs.CACHE_DIR, self.covers, os.path.dirname(paths["log"])):
                os.makedirs(folder, exist_ok=True)
        except OSError as ex:
            raise Stop(f"A working folder can't be made ({ex.strerror or ex}). Nothing was changed.") from ex
        if self.dry:
            return self._go(folders)
        with _OneAtATime(os.path.join(os.path.dirname(paths["log"]), "curate.lock")):
            return self._go(folders)

    def _go(self, folders):
        paths = self.paths
        try:
            self.writer = tagwriter.Writer(paths["library"], paths["log"], self.dry, say=lambda _: None)
        except OSError as ex:
            raise Stop(f"The log can't be written ({ex.strerror or ex}). If it's open in another program, close it and try again. Nothing was changed.") from ex
        try:
            self.progress(step="Reading your downloads", done=0, total=0, name="")
            try:
                items, others = parse.read_inbox(folders, paths["log"])
            except (OSError, ValueError) as ex:
                raise Stop(f"Your downloads couldn't be read ({getattr(ex, 'strerror', None) or ex}). Nothing was changed.") from ex
            todo = [it for it in items if it["cat"] != "done"]
            other_keys = {f"inbox/{os.path.basename(os.path.dirname(p))}/{os.path.basename(p)}" for p in others}
            still_here, read_now = {key_of(it) for it in todo} | other_keys, {os.path.basename(os.path.normpath(d)) for d in folders}
            # a folder that wasn't there this time (a drive that's unplugged) keeps what it had
            self.songs = {k: v for k, v in self._read_waiting().items() if k in still_here or (k.count("/") >= 2 and k.split("/", 2)[1] not in read_now)}
            self.loaded = True
            for key in other_keys:
                self.songs[key] = {"why": ONLY_MP3}
            self.history, self.library_keys = resolve.load_history(paths["log"], settled_only=True), resolve.load_library_keys([paths["library"]])
            fails = 0
            for n, item in enumerate(todo):
                if self.stopping.is_set():
                    self.stopped = True
                    break
                self.progress(step="Looking up", done=n, total=len(todo), name=item["file"])
                try:
                    self.one(item)
                    fails = 0
                except urllib.error.HTTPError as ex:
                    if ex.code in (401, 403):
                        raise Stop("Discogs turned your token down. Check the DISCOGS_TOKEN you saved, then restart this app.") from ex
                    fails += 1
                    self.hold(key_of(item), f"Discogs answered with an error ({ex.code}). Press Curate to try again.", retry=True)
                except (OSError, RuntimeError, http.client.HTTPException):
                    fails += 1
                    self.hold(key_of(item), "Discogs couldn't be reached. Press Curate to try again.", retry=True)
                except Stop:
                    raise
                except Exception as ex:  # noqa: BLE001  an odd answer about one song never stops the rest. The message itself isn't shown: it could quote the token
                    fails = 0
                    self.hold(key_of(item), f"Something went wrong looking this up ({type(ex).__name__}). Press Curate to try again.", retry=True)
                if fails >= GIVE_UP_AFTER:
                    raise Stop("Discogs isn't answering, so Curate stopped. Songs already added stay added. Press Curate to carry on later.")
                if (n + 1) % SAVE_EVERY == 0:
                    self._save_waiting()
            self.progress(step="Finishing", done=len(todo), total=len(todo), name="")
        finally:
            self.writer.close()
            self._save_waiting()
        return self.summary()


# ---------------- from the page ----------------

def status(server):
    """What the page shows about Curate."""
    state = dict(server.curate_state or {})
    running = bool(state.get("running"))
    return dict(problem=missing(server.collection.paths) if server.collection else "", running=running, stopping=running and bool(server.curate_stop and server.curate_stop.is_set()), step=state.get("step", ""),
                done=state.get("done", 0), total=state.get("total", 0), name=state.get("name", ""), failed=state.get("failed", ""), result=state.get("result"))


def _work(server, run):
    state = server.curate_state
    try:
        state.update(result=run.go())
    except Stop as ex:
        state.update(failed=_no_token_in(str(ex)), result=run.summary())
    except (Exception, SystemExit) as ex:  # noqa: BLE001  the page must never be left saying "running" forever
        state.update(failed=f"Curate stopped unexpectedly ({type(ex).__name__}). Songs already added stay added.", result=run.summary())
    finally:
        state.update(running=False)
        server.curate_lock.release()


def start(server):
    """Begin a run in the background; the page follows it through status(). One at a time."""
    collection = server.collection
    if not collection:
        return dict(error="Choose your folders first.")
    if not server.curate_lock.acquire(blocking=False):
        return dict(error="Curate is already running.")
    try:
        problem = missing(collection.paths)
        if problem:
            server.curate_lock.release()
            return dict(error=problem)

        def retire(key, answer):
            return collection.update_answers(lambda answers: answers.pop(key, None) if answers.get(key) == answer else None)

        state = server.curate_state = dict(running=True, step="Starting", done=0, total=0, name="", failed="", result=None)
        server.curate_stop = threading.Event()
        run = Run(collection.paths, say=lambda _: None, progress=state.update, stopping=server.curate_stop, retire=retire)
        threading.Thread(target=_work, args=(server, run), daemon=True).start()
    except BaseException:
        server.curate_lock.release()
        raise
    return dict(started=True)


def stop(server):
    """Finish the song in hand, then stop. Whatever was added stays."""
    if server.curate_stop:
        server.curate_stop.set()
    return dict(ok=True)


# ---------------- after a run: someone checked it properly ----------------

def _library_song(songs, name):
    """The one song a Genre/Artist - Title.mp3 or a file name means. If there isn't exactly one, says so and returns None."""
    wanted = name.replace("\\", "/").strip("/").casefold()
    found = [s for s in songs if s["_rel"].casefold() == wanted] or [s for s in songs if s["file"].casefold() == wanted]
    if len(found) == 1:
        return found[0]
    print(f"  {name}: {'more than one song has that name, so give its folder too' if found else 'not found in your library'}")
    return None


def leave_better_link(name, url, why, checked):
    """Put a link to a possibly better copy of a library song on To check. The song isn't touched: what happens next is the person's call."""
    why = " ".join(why.split())[:300]
    if not webapp.is_web_link(url) or not why:
        print("Give a web link (http:// or https://) and say in a few words why it's better.")
        return 1
    paths = webapp.app_paths()
    collection = webapp.Collection(paths)
    collection.refresh()
    song = _library_song([s for s in collection.songs.values() if s["area"] == "library"], name)
    if not song:
        return 1
    path = webapp.better_links_path(paths)
    links = {}
    try:
        if os.path.exists(path):
            with open(path, encoding="utf-8-sig") as f:
                links = json.load(f)
        if not isinstance(links, dict):
            raise ValueError("it isn't a list of links")
        links[song["key"]] = dict(url=url, why=why, checked=bool(checked), secs=song["secs"], when=datetime.datetime.now().isoformat(timespec="seconds"))
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(links, f, ensure_ascii=False, indent=1)
        os.replace(path + ".tmp", path)
    except (OSError, ValueError) as ex:
        print(f"{path} couldn't be updated, so nothing was saved: {ex}")
        return 1
    print(f"  {name}: left on To check, for the person to open or ignore")
    return 0


def mark_verified(names, how):
    """Record that these Auto-matched songs were checked properly, so the page stops calling them Auto-matched. The log keeps what was checked."""
    from . import apply
    paths = webapp.app_paths()
    collection = webapp.Collection(paths)
    collection.refresh()
    songs = [s for s in collection.songs.values() if s["area"] == "library"]
    handle, writer = apply._open_log(paths["log"])
    done, problems = 0, 0
    try:
        for name in names:
            song = _library_song(songs, name)
            if not song:
                problems += 1
                continue
            row = collection._log_row(song["_path"], song["_rel"])
            notes = [p.strip() for p in ((row or {}).get("notes") or "").split(";") if p.strip()]
            auto = [p for p in notes if p.startswith((AUTO_NOTE, PICK_NOTE))]
            if not auto:
                print(f"  {name}: wasn't Auto-matched, so there's nothing to change")
                continue
            writer.writerow(dict(row, date=datetime.datetime.now().isoformat(timespec="seconds"), notes="; ".join([p for p in notes if p not in auto] + [f"verified: {how}"])))
            handle.flush()
            print(f"  {name}: verified")
            done += 1
    finally:
        handle.close()
    print(f"{done} verified." + (f" {problems} not done." if problems else ""))
    return 1 if problems else 0


# ---------------- from the command line ----------------

def main(dry_run=False):
    run = Run(webapp.app_paths(), dry_run)
    if dry_run:
        print("Preview only: nothing is being changed.\n")
    try:
        done = run.go()
    except Stop as ex:
        sys.exit(_no_token_in(str(ex)))
    if not done["added"] and not done["waiting"]:
        print("Nothing is waiting in your downloads.")
        return 0
    print(f"\n{'Would add' if dry_run else 'Added'} {done['added']} song{'' if done['added'] == 1 else 's'}. {done['waiting']} waiting for you: open `curator serve`, then To check.")
    return 0
