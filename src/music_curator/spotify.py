"""What's left to do by hand in your Spotify playlists? A read-only link to Spotify for the page's Playlists tab: has a song you meant to add
arrived, and which local entries have no file behind them any more (Spotify shows those greyed, and its API can't remove them).

Sign-in is Spotify's own consent page in your browser (Authorization Code with PKCE, so no secret), asking only to read your playlists.
Moving entries to the bottom needs more, so that button alone asks to change them too, the first time you press it. The token lives in memory and is never printed or saved. Requests are paced, and if Spotify asks for a long wait the app remembers it and
doesn't ask again until then.

It needs your own Spotify app's Client ID in curator.toml ([spotify] client_id), with http://127.0.0.1:8888/callback as its redirect URI.
"""
import base64
import datetime
import hashlib
import http.server
import json
import os
import re
import secrets
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from . import config, suggest

API = "https://api.spotify.com/v1"
ACCOUNTS = "https://accounts.spotify.com"
PORT = 8888
SCOPES = "playlist-read-private playlist-read-collaborative user-read-private"  # the last one only so a search can say what plays in your country
TO_CHANGE = SCOPES + " playlist-modify-private playlist-modify-public"  # only asked for when you press a button that changes a playlist
SIGN_IN_S = 180  # how long to wait for you to approve in the browser
PACE_S = .6  # between requests
LONGEST_WAIT_S = 30  # Spotify asking for longer than this ends the check: waiting it out is the only polite answer
SAME_LENGTH_S = 2  # a file and a playlist entry this close in length are the same song (rounding, a changed tag)
LENGTH_DIFFERS = "length differs"
MAY_BE_GAP_S = 10  # a streamed song this close in length to your file might be the same recording (real matches were up to 9 s apart)
SEARCHES_PER_CHECK = 150  # so one press can't use up Spotify's patience; the rest get their turn next time
SEARCH_AGAIN_DAYS = 30  # a song Spotify didn't have gets another look after this long
LONGEST_SONG_S = 15 * 60  # past this it's a mix


class Stop(Exception):
    """The check can't go on; the message says why, in words for the person."""


def _state_path(paths):
    return os.path.join(os.path.dirname(paths["decisions"]), "spotify.json")


def read_state(paths):
    try:
        with open(_state_path(paths), encoding="utf-8-sig") as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(paths, **changes):
    path = _state_path(paths)
    state = dict(read_state(paths), **changes)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)
    os.replace(path + ".tmp", path)


def _wait_until(paths):
    """When Spotify said we may ask again, if that's still ahead."""
    try:
        until = datetime.datetime.fromisoformat(read_state(paths).get("wait_until", ""))
    except (TypeError, ValueError):
        return None
    return until if until > datetime.datetime.now() else None


def status(paths):
    until, state = _wait_until(paths), read_state(paths)
    rows, names = state.get("to_remove"), state.get("playlists")
    return dict(ready=bool(config.get("spotify", "client_id")), wait_until=until.isoformat(timespec="minutes") if until else "", checked=str(state.get("checked") or ""),
                to_remove=[r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else [], playlists=[n for n in names if isinstance(n, str)] if isinstance(names, list) else [])


def _hits_path(paths):
    return os.path.join(os.path.dirname(paths["decisions"]), "spotify_search.json")


def read_hits(paths):
    """What Spotify said about each waiting song, so a song is only searched for once."""
    try:
        with open(_hits_path(paths), encoding="utf-8-sig") as f:
            hits = json.load(f)
        return {k: v for k, v in hits.items() if isinstance(v, dict)} if isinstance(hits, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_hits(paths, hits):
    try:
        with open(_hits_path(paths) + ".tmp", "w", encoding="utf-8") as f:
            json.dump(hits, f, ensure_ascii=False, indent=1)
        os.replace(_hits_path(paths) + ".tmp", _hits_path(paths))
    except OSError:  # only costs a few more searches next time
        pass


def cache_path(paths):
    return os.path.join(os.path.dirname(paths["decisions"]), "spotify_playlists.json")


def _read_cache(paths):
    """What each playlist held last time, so one that hasn't changed needn't be asked for again."""
    try:
        with open(cache_path(paths), encoding="utf-8-sig") as f:
            cache = json.load(f)
        return cache if isinstance(cache, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_cache(paths, cache):
    try:
        with open(cache_path(paths) + ".tmp", "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
        os.replace(cache_path(paths) + ".tmp", cache_path(paths))
    except OSError:  # only costs a few more requests next time
        pass


# ---------------- which entries have nothing behind them ----------------

def _plain(text):
    text = unicodedata.normalize("NFKD", text or "")
    return re.sub(r"[^\w]", "", "".join(c for c in text if not unicodedata.combining(c)).lower())


def _file_index(songs):
    """{(artist, album, title): [lengths]} of every file the app knows. A file with no tags at all, Spotify lists by its file name."""
    index = {}
    for s in songs:
        key = ("", "", _plain(os.path.splitext(s["file"])[0])) if s.get("_tagless") else (_plain(s["artist"]), _plain(s["album"]), _plain(s["title"]))
        index.setdefault(key, []).append(s["secs"] or 0)
    return index


def _close(a, b):
    return not a or not b or abs(a - b) <= SAME_LENGTH_S


def _saved_entry(e):
    """(artist, name, secs) of a saved playlist entry. The file can be edited by hand, so whatever isn't the right type counts as not being there."""
    artists, name, secs = e.get("artists"), e.get("name"), e.get("secs")
    return (" ".join(a for a in artists if a and isinstance(a, str)) if isinstance(artists, list) else "", name if isinstance(name, str) else "", secs if type(secs) in (int, float) else 0)


def playable(songs, cache):
    """Your playlists as far as the app can play them: [{name, total, ids}], in the playlist's order. A local entry is the file of that name. A streamed one counts only
    if you also have it as a file of about the same length. A second copy of a song is played once and counted once.
    `total` is the songs you can listen to, here or on Spotify, so a local entry with no file behind it isn't one: Spotify can't play that either."""
    index, out = {}, []
    for s in songs:
        key = ("", _plain(os.path.splitext(s["file"])[0])) if s.get("_tagless") else (_plain(s["artist"]), _plain(s["title"]))
        index.setdefault(key, []).append(s)
    for playlist in cache.values():
        entries = playlist.get("entries") if isinstance(playlist, dict) else None
        if not isinstance(entries, list) or not isinstance(playlist.get("name"), str) or not playlist["name"]:  # saved before names were kept: the next Check Spotify adds them
            continue
        ids, seen, streamed = [], set(), set()
        for e in (x for x in entries if isinstance(x, dict)):
            artist, name, secs = _saved_entry(e)
            key = ("" if artist == "Unknown Artist" else _plain(artist), _plain(name))
            found = index.get(key, [])
            near = found if e.get("local") else [s for s in found if secs and s["secs"] and abs(s["secs"] - secs) <= MAY_BE_GAP_S]
            song = min(near, key=lambda s: (s["area"] != "library", abs((s["secs"] or 0) - secs)), default=None)
            if song and song["id"] not in seen:
                seen.add(song["id"])
                ids.append(song["id"])
            elif not song and not e.get("local") and any(key):
                streamed.add(key)
        if ids:
            out.append(dict(name=playlist["name"], total=len(ids) + len(streamed), ids=ids))
    return sorted(out, key=lambda p: p["name"].casefold())


def to_take_out(entries, index):
    """The entries of one playlist worth a word: local songs with no file behind them and second copies, to remove by hand, and ones whose name matches a file
    but not its length. Those usually still play: Spotify remembers the length a file had when it last read it."""
    out, kept = [], {}
    for pos, e in enumerate(entries, 1):
        if not e.get("local") or e.get("name") in ("", "(Unknown)"):  # nothing to go by: better to say nothing than to name a song that plays
            continue
        artist = " ".join(a for a in e.get("artists") or [] if a)
        artist = "" if artist == "Unknown Artist" else artist  # how Spotify shows an empty artist tag
        same, secs = (_plain(artist), _plain(e["name"])), e.get("secs") or 0
        lengths = index.get((same[0], _plain(e.get("album")), same[1]), [])
        if not lengths:
            out.append(dict(pos=pos, song=f"{artist} - {e['name']}".strip(" -"), why="no file"))
        elif not any(_close(secs, x) for x in lengths):
            out.append(dict(pos=pos, song=f"{artist} - {e['name']}".strip(" -"), why=LENGTH_DIFFERS))
        elif any(_close(secs, x) for x in kept.get(same, [])):
            out.append(dict(pos=pos, song=f"{artist} - {e['name']}".strip(" -"), why="second copy"))
        else:
            kept.setdefault(same, []).append(secs)
    return out


def _fetch(url, headers=None, data=None, method=None):
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers or {}, method=method), timeout=30) as response:
        return json.loads(response.read() or b"{}")


class _OneListener(http.server.HTTPServer):
    allow_reuse_address = False  # on Windows it would silently share a port that's already taken


class Client:
    """One per running app, so one sign-in lasts until the app closes."""

    def __init__(self, client_id, paths, fetch=_fetch, opener=webbrowser.open, port=PORT, sleep=time.sleep):
        self.client_id, self.paths, self.fetch, self.opener, self.port, self.sleep = client_id, paths, fetch, opener, port, sleep
        self.access, self.refresh_token, self.expires, self.last_call = None, None, 0, 0
        self.scope = SCOPES

    def allow_changes(self):
        """Reordering takes more than reading, so ask for it now, when it's needed. A permission to read can't be widened: it takes a new sign-in."""
        if self.scope != TO_CHANGE:
            self.scope, self.access, self.refresh_token, self.expires = TO_CHANGE, None, None, 0

    def _take_tokens(self, fields):
        try:
            answer = self.fetch(ACCOUNTS + "/api/token", {"Content-Type": "application/x-www-form-urlencoded"}, urllib.parse.urlencode(fields).encode())
            self.access, self.expires = answer["access_token"], time.monotonic() + int(answer.get("expires_in", 3600)) - 60
        except (OSError, ValueError, KeyError, TypeError) as ex:
            self.access = None
            raise Stop("Spotify didn't finish the sign-in, so nothing was checked.") from ex
        self.refresh_token = answer.get("refresh_token") or self.refresh_token

    def sign_in(self):
        verifier = secrets.token_urlsafe(64)[:96]
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state, got, redirect = secrets.token_urlsafe(16), {}, f"http://127.0.0.1:{self.port}/callback"

        class Answer(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                if query.get("state", [""])[0] == state:
                    got.update({k: v[0] for k, v in query.items()})
                body = ("Done. You can close this tab and go back to your library." if "code" in got else "Spotify sign-in didn't finish.").encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        try:
            listener = _OneListener(("127.0.0.1", self.port), Answer)
        except OSError as ex:
            raise Stop(f"Port {self.port} is in use, so Spotify sign-in can't finish. Close whatever is using it and try again.") from ex
        listener.timeout = .5
        try:
            self.opener(ACCOUNTS + "/authorize?" + urllib.parse.urlencode(dict(
                client_id=self.client_id, response_type="code", redirect_uri=redirect, scope=self.scope, state=state, code_challenge_method="S256", code_challenge=challenge)))
            deadline = time.monotonic() + SIGN_IN_S
            while not got and time.monotonic() < deadline:
                listener.handle_request()
        finally:
            listener.server_close()
        if "code" not in got:
            raise Stop("Spotify sign-in wasn't finished, so nothing was checked.")
        self._take_tokens(dict(grant_type="authorization_code", code=got["code"], redirect_uri=redirect, client_id=self.client_id, code_verifier=verifier))

    def ready(self):
        if self.access and time.monotonic() < self.expires:
            return
        if self.refresh_token:
            try:
                self._take_tokens(dict(grant_type="refresh_token", refresh_token=self.refresh_token, client_id=self.client_id))
                return
            except Stop:
                self.refresh_token = None
        self.sign_in()

    def _wait_or_stop(self, ex):
        """Spotify said too many requests: wait a little, or if it's long, stop and remember until when."""
        try:
            wait = int(ex.headers.get("Retry-After") or 5)
        except ValueError:
            wait = 60
        if wait > LONGEST_WAIT_S:
            until = datetime.datetime.now() + datetime.timedelta(seconds=wait + 60)
            write_state(self.paths, wait_until=until.isoformat(timespec="seconds"))
            raise Stop(f"Spotify asked to wait until {until:%H:%M}, so it stopped there.") from ex
        self.sleep(wait + 1)

    def _paced(self):
        self.ready()
        gap = self.last_call + PACE_S - time.monotonic()
        if gap > 0:
            self.sleep(gap)
        self.last_call = time.monotonic()

    def put(self, url, body):
        return self._change("PUT", url, body)

    def post(self, url, body):
        return self._change("POST", url, body)

    def _change(self, method, url, body):
        """Change something. If the answer gets lost there's no telling whether it happened, so it's never sent twice: the next press reads the playlist again."""
        for attempt in range(5):
            self._paced()
            try:
                return self.fetch(url, {"Authorization": f"Bearer {self.access}", "Content-Type": "application/json"}, json.dumps(body).encode(), method)
            except urllib.error.HTTPError as ex:
                if ex.code == 401 and attempt == 0:
                    self.expires = 0
                elif ex.code == 429:  # refused, so nothing changed: safe to ask again
                    self._wait_or_stop(ex)
                elif ex.code >= 500:
                    raise Stop("Spotify had a problem partway through. Press the button again to carry on.") from ex
                else:
                    raise
            except (OSError, ValueError) as ex:
                raise Stop("Spotify stopped answering partway through. Press the button again to carry on.") from ex
        raise Stop("Spotify kept refusing, so it stopped there.")

    def get(self, url):
        for attempt in range(5):
            self._paced()
            try:
                return self.fetch(url, {"Authorization": f"Bearer {self.access}"})
            except urllib.error.HTTPError as ex:
                if ex.code == 401 and attempt == 0:
                    self.expires = 0
                elif ex.code == 429:
                    self._wait_or_stop(ex)
                elif ex.code >= 500:
                    self.sleep(2 * (attempt + 1))
                else:
                    raise
            except (OSError, ValueError) as ex:
                if attempt >= 2:
                    raise Stop("Couldn't reach Spotify, so the check stopped there.") from ex
                self.sleep(2)
        raise Stop("Spotify kept failing, so the check stopped there.")

    def my_playlists(self):
        me = self.get(API + "/me")["id"]
        found, url = {}, API + "/me/playlists?limit=50"
        while url:
            page = self.get(url)
            for playlist in page.get("items") or []:
                if playlist and ((playlist.get("owner") or {}).get("id") == me or playlist.get("collaborative")):
                    found.setdefault(playlist.get("name"), dict(id=playlist.get("id"), snapshot=playlist.get("snapshot_id")))
            url = page.get("next")
        return found

    def search(self, query):
        page = self.get(API + "/search?" + urllib.parse.urlencode(dict(q=query, type="track", limit=10, market="from_token")))
        return [t for t in (page.get("tracks") or {}).get("items") or [] if t]

    def entries(self, playlist_id):
        """What's in a playlist, in order."""
        found, url = [], f"{API}/playlists/{playlist_id}/items?limit=100"
        while url:
            try:
                page = self.get(url)
            except urllib.error.HTTPError:
                if "/items?" not in url:  # the older name for the same list
                    raise
                url = url.replace("/items?", "/tracks?")
                continue
            for entry in page.get("items") or []:
                track = (entry or {}).get("item") or (entry or {}).get("track") or {}
                found.append(dict(artists=[(a or {}).get("name") or "" for a in track.get("artists") or []], album=(track.get("album") or {}).get("name") or "", name=track.get("name") or "",
                                  secs=round((track.get("duration_ms") or 0) / 1000), local=bool((entry or {}).get("is_local") or track.get("is_local")), uri=track.get("uri")))
            url = page.get("next")
        return found


def _lines(answer):
    return [n for n in str(answer.get("note") or "").split("\n") if n]


def _removal(name, entries, index):
    """One playlist's row on the To remove list, or None if there's nothing to say about it. `odd` are the entries that are only worth a look."""
    every, last = to_take_out(entries, index), len(entries)
    found = [f for f in every if f["why"] != LENGTH_DIFFERS]
    return dict(playlist=name, count=len(found), at_end=[f["pos"] for f in found] == list(range(last - len(found) + 1, last + 1)), songs=found, odd=[f for f in every if f["why"] == LENGTH_DIFFERS]) if every else None


def _search_terms(song):
    """(artist, title, mix) to look a waiting song up by. Files named by uploaders need reading, the same way Curate reads them."""
    from . import parse
    info = parse.parse(os.path.splitext(song["file"])[0], dict(artist=song["artist"], title=song["title"]))
    if info["search_artist"]:
        return info["search_artist"], info["search_title"], info["mix"]
    return song["artist"], re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", song["title"] or "").strip(), info["mix"]


def _best_track(tracks, artist, title, mix, secs):
    """The streamed song most likely to be this file, or None. Only a suggestion: Spotify gives apps no audio to compare, so someone has to listen."""
    from . import curate, resolve
    options = []
    for track in tracks:
        name, length = track.get("name") or "", (track.get("duration_ms") or 0) / 1000
        base = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]|\s+-\s+.*$", "", name).strip()  # Spotify writes "Song - Original Mix" as well as "Song (Original Mix)"
        version = name[len(base):].strip(" -()[]")
        if track.get("is_playable") is False or not re.fullmatch(r"[A-Za-z0-9]{10,40}", str(track.get("id") or "")) or abs(secs - length) > MAY_BE_GAP_S:
            continue
        if not resolve.same_title(base, title) or not curate.same_artist(artist, ", ".join((a or {}).get("name") or "" for a in track.get("artists") or [])):
            continue
        if mix and not resolve.mix_matches(mix, "x (" + re.sub(r"[()\[\]]", " ", version) + ")"):  # Spotify can stack them: "(Anthem) (feat. X) - Instrumental Mix"
            continue
        options.append((bool(version), abs(secs - length), track))
    if not options:
        return None
    track = min(options, key=lambda option: option[:2])[2]
    length = (track.get("duration_ms") or 0) / 1000
    return dict(id=track["id"], uri=track.get("uri") or f"spotify:track:{track['id']}", name=track.get("name") or "", artists=[(a or {}).get("name") or "" for a in track.get("artists") or []],
                album=(track.get("album") or {}).get("name") or "", year=str((track.get("album") or {}).get("release_date") or "")[:4], gap=round(secs - length))


def _look_for_waiting_songs(client, collection):
    """Search Spotify for the songs still waiting. Returns (how many might be there, why it stopped if it did)."""
    paths, hits, asked, stopped = collection.paths, read_hits(collection.paths), 0, ""
    today, waiting = datetime.date.today(), [s for s in collection.songs.values() if s["area"] != "library" and not s["done"]]
    try:
        for song in sorted(waiting, key=lambda s: s["key"]):
            if f"spotify:{song['key']}" in collection.decisions or not song["secs"] or song["secs"] > LONGEST_SONG_S:
                continue
            artist, title, mix = _search_terms(song)
            if not artist or not title:
                continue
            terms, old = f"{artist}|{title}|{mix or ''}|{round(song['secs'])}", hits.get(song["key"])
            if old and old.get("terms") == terms:
                try:
                    if old.get("hit") or (today - datetime.date.fromisoformat(str(old.get("when")))).days < SEARCH_AGAIN_DAYS:
                        continue
                except ValueError:
                    pass
            if asked >= SEARCHES_PER_CHECK:
                break
            asked += 1
            best = _best_track(client.search(f"track:{title} artist:{artist}"), artist, title, mix, song["secs"])
            if not best:  # Spotify's stricter search misses "&" and punctuation
                best = _best_track(client.search(f"{title} {artist}"), artist, title, mix, song["secs"])
            hits[song["key"]] = dict(terms=terms, when=today.isoformat(), hit=best)
    except Stop as ex:
        stopped = str(ex)
    except urllib.error.HTTPError as ex:
        stopped = f"Spotify answered with an error ({ex.code}), so the search stopped there."
    still_waiting = {s["key"] for s in waiting}
    hits = {k: v for k, v in hits.items() if k in still_waiting}
    _write_hits(paths, hits)
    return sum(1 for k, v in hits.items() if v.get("hit") and f"spotify:{k}" not in collection.decisions), stopped


def _moves(positions, total):
    """[(start, length)] to carry these 1-based positions to the end, one run at a time. Each start allows for the runs already carried off."""
    runs = []
    for pos in sorted(positions):
        if runs and runs[-1][0] + runs[-1][1] == pos - 1:
            runs[-1][1] += 1
        else:
            runs.append([pos - 1, 1])
    if runs and runs[-1][0] + runs[-1][1] == total:  # already at the end
        runs.pop()
    gone, out = 0, []
    for start, length in runs:
        out.append((start - gone, length))
        gone += length
    return out


def check(client, collection):
    """Compare what you meant to add with what's really in those playlists and update the list to match, and work out which entries have no file behind them."""
    until = _wait_until(collection.paths)
    if until:
        return dict(arrived=0, missing=0, message=f"Spotify asked to wait until {until:%H:%M}. Try again after that.")
    collection.refresh()
    songs = {s["key"]: s for s in collection.songs.values() if s["area"] == "library"}
    answers = {k: d for k, d in collection.decisions.items() if d.get("kind") == "playlist" and d.get("action") in ("add", "added") and d.get("file") in songs}
    wanted = sorted({n for d in answers.values() for n in _lines(d)})

    keys = {}
    for key, d in answers.items():
        song = songs[d["file"]]
        row = collection._log_row(song["_path"], song["_rel"]) or {}  # Spotify may still know a song by its old name
        keys[key] = {suggest.track_key(song["artist"], song["title"])} | ({suggest.track_key(row.get("src_artist"), row.get("src_title"))} if row.get("src_title") else set())

    present, read, stopped, unknown, mine = {}, {}, "", [], {}
    cache = _read_cache(collection.paths)
    try:
        mine = client.my_playlists()
        unknown = [n for n in wanted if n not in mine]
        for name in sorted(mine, key=lambda n: n not in wanted):  # the ones you're adding to first, in case Spotify stops us partway
            info, known = mine[name], cache.get(mine[name]["id"])
            if isinstance(known, dict) and info["snapshot"] and known.get("snapshot") == info["snapshot"] and isinstance(known.get("entries"), list):
                read[name] = known["entries"]  # unchanged since last time: no need to ask
                known["name"] = name  # it may have been renamed, which isn't a change to what's in it
            else:
                read[name] = client.entries(info["id"])
                cache[info["id"]] = dict(snapshot=info["snapshot"], entries=read[name], name=name)
            if name in wanted:
                present[name] = {suggest.track_key((e["artists"] or [""])[0], e["name"]) for e in read[name]} - {"|"}
    except Stop as ex:
        stopped = str(ex)
    except urllib.error.HTTPError as ex:
        stopped = f"Spotify answered with an error ({ex.code}), so the check stopped there."
    if mine and not stopped:  # a playlist you've deleted shouldn't stay playable here
        cache = {k: v for k, v in cache.items() if k in {info["id"] for info in mine.values()}}
    _write_cache(collection.paths, cache)

    removals = None
    known_files = list(collection.songs.values())
    if read and any(s["area"] == "library" for s in known_files):  # with the library's drive gone, everything would look like it has no file
        index, rows = _file_index(known_files), {}
        for name, entries in read.items():
            row = _removal(name, entries, index)
            if row:
                rows[name] = row
        if stopped:  # what wasn't read this time stays as it was
            for row in status(collection.paths)["to_remove"]:
                if row.get("playlist") not in read:
                    rows[row.get("playlist")] = row
        removals = [rows[n] for n in sorted(rows, key=lambda n: str(n).casefold())]

    counts = dict(arrived=0, missing=0)

    def change(current):
        for key in answers:
            d = current.get(key)  # read again: you may have answered something while Spotify was being read
            if not isinstance(d, dict) or d.get("action") not in ("add", "added"):
                continue
            names = _lines(d)
            here = [n for n in names if n in present and keys[key] & present[n]]
            gone = [n for n in names if n in present and n not in here]
            if d["action"] == "add":
                left = [n for n in names if n not in here]
                counts["arrived"] += len(here)
                counts["missing"] += len(gone)
                if here and not left:
                    d["action"] = "added"
                elif here:
                    d["note"] = "\n".join(left)
            elif gone:  # marked as added, but Spotify doesn't have it there
                d.update(action="add", note="\n".join(gone))
                counts["missing"] += len(gone)

    problem = collection.update_answers(change) if present else None
    if read:
        write_state(collection.paths, checked=datetime.datetime.now().isoformat(timespec="seconds"), playlists=sorted(mine, key=str.casefold), **({} if removals is None else dict(to_remove=removals)))
    maybe = 0
    if read and not stopped:
        maybe, stopped = _look_for_waiting_songs(client, collection)
    parts = [stopped] if stopped else []
    if problem:
        parts.append(problem)
    if present and not problem:
        parts.append(f"{counts['arrived']} arrived, {counts['missing']} still not in {'their playlists' if len(present) > 1 else 'the playlist'}.")
    if removals is not None:
        total, lists = sum(r["count"] for r in removals), sum(1 for r in removals if r["count"])
        parts.append(f"{total} to remove in {lists} playlist{'' if lists == 1 else 's'}." if total else "Nothing to remove.")
    if maybe:
        parts.append(f"{maybe} waiting song{' might be' if maybe == 1 else 's might be'} on Spotify: see To check.")
    if unknown:
        parts.append("Couldn't find on Spotify: " + ", ".join(unknown) + ".")
    return dict(counts, message=" ".join(parts) or "Nothing was checked.")


def gather(client, collection):
    """Carry the entries on the To remove list to the bottom of their playlists, so they can be selected in one go. Nothing is removed, and the songs that stay keep their order."""
    paths = collection.paths
    until = _wait_until(paths)
    if until:
        return dict(moved=0, message=f"Spotify asked to wait until {until:%H:%M}. Try again after that.")
    collection.refresh()
    rows = {r["playlist"]: r for r in status(paths)["to_remove"] if r.get("playlist")}
    spread = [name for name, r in rows.items() if r.get("count") and not r.get("at_end")]
    if not spread:
        return dict(moved=0, message="They're already at the bottom.")
    known_files = list(collection.songs.values())
    if not any(s["area"] == "library" for s in known_files):  # with the library's drive gone, everything would look like it has no file
        return dict(moved=0, message="Your library can't be found, so nothing was moved. Is its drive connected?")
    index, cache, moved, touched, refused, stopped = _file_index(known_files), _read_cache(paths), 0, 0, [], ""
    client.allow_changes()
    try:
        mine = client.my_playlists()
        for name in spread:
            if name not in mine:  # renamed or deleted since the last check
                continue
            info = mine[name]
            entries = client.entries(info["id"])  # as it is right now: positions from the last check may be out of date
            steps, snapshot = _moves([f["pos"] for f in to_take_out(entries, index) if f["why"] != LENGTH_DIFFERS], len(entries)), info["snapshot"]
            try:
                for start, length in steps:
                    answer = client.put(f"{API}/playlists/{info['id']}/items", dict(range_start=start, range_length=length, insert_before=len(entries), **({"snapshot_id": snapshot} if snapshot else {})))
                    snapshot = answer.get("snapshot_id", snapshot)
                    moved += length
            except urllib.error.HTTPError:  # someone else's collaborative playlist, say
                refused.append(name)
                continue
            if steps:
                touched += 1
                entries = client.entries(info["id"])  # read it back: the list has to show what's really there
            cache[info["id"]] = dict(snapshot=snapshot, entries=entries, name=name)
            row = _removal(name, entries, index)
            if row:
                rows[name] = row
            else:
                rows.pop(name, None)
    except Stop as ex:
        stopped = str(ex)
    except urllib.error.HTTPError as ex:
        stopped = f"Spotify answered with an error ({ex.code}), so it stopped there."
    finally:
        if not client.access:  # the bigger permission wasn't given: the next check asks only to read
            client.scope = SCOPES
    _write_cache(paths, cache)
    write_state(paths, to_remove=[rows[n] for n in sorted(rows, key=lambda n: str(n).casefold())])
    parts = [stopped] if stopped else []
    if moved:
        parts.append(f"Moved {moved} entr{'y' if moved == 1 else 'ies'} to the bottom of {touched} playlist{'' if touched == 1 else 's'}.")
    if refused:
        parts.append("Spotify wouldn't let these be changed: " + ", ".join(refused) + ".")
    return dict(moved=moved, message=" ".join(parts) or "Nothing needed moving.")


def add_streamed(client, collection, song_id, names):
    """You've listened and it's the same song: add Spotify's version to these playlists. Your file stays where it is until you say otherwise."""
    paths = collection.paths
    until = _wait_until(paths)
    if until:
        return dict(added=0, message=f"Spotify asked to wait until {until:%H:%M}. Try again after that.")
    collection.refresh()
    song = collection.songs.get(str(song_id))
    if not song:
        return dict(added=0, message="This song has moved since the page was loaded. Refresh the page and try again.")
    uri = str(((read_hits(paths).get(song["key"]) or {}).get("hit") or {}).get("uri") or "")
    if not re.fullmatch(r"spotify:track:[A-Za-z0-9]{10,40}", uri):
        return dict(added=0, message="Spotify's match for this song has gone. Press Check Spotify again.")
    client.allow_changes()
    added, already, missing, refused, stopped = [], [], [], [], ""
    try:
        mine = client.my_playlists()
        for name in names:
            if name not in mine:
                missing.append(name)
                continue
            if any(e.get("uri") == uri for e in client.entries(mine[name]["id"])):
                already.append(name)
                continue
            try:
                client.post(f"{API}/playlists/{mine[name]['id']}/items", dict(uris=[uri]))
                added.append(name)
            except urllib.error.HTTPError:  # someone else's collaborative playlist, say
                refused.append(name)
    except Stop as ex:
        stopped = str(ex)
    except urllib.error.HTTPError as ex:
        stopped = f"Spotify answered with an error ({ex.code}), so it stopped there."
    finally:
        if not client.access:
            client.scope = SCOPES
    problem = None
    if added or already:
        now, name = datetime.datetime.now().isoformat(timespec="seconds"), f"{song['artist']} - {song['title']}".strip(" -")

        def change(current):
            current[f"spotify:{song['key']}"] = dict(kind="spotify", action="stream", song=name, file=song["key"], genre="", note="\n".join(added + already), at=now)
            current.setdefault(f"waiting:{song['key']}", dict(kind="waiting", action="drop", song=name, file=song["key"], genre="", note="On Spotify", at=now))
        problem = collection.update_answers(change)
    parts = [stopped] if stopped else []
    if added:
        parts.append("Added to " + ", ".join(added) + ".")
    if already:
        parts.append("Already in " + ", ".join(already) + ".")
    if missing:
        parts.append("Couldn't find on Spotify: " + ", ".join(missing) + ".")
    if refused:
        parts.append("Spotify wouldn't let these be changed: " + ", ".join(refused) + ".")
    if problem:
        parts.append(problem)
    return dict(added=len(added), message=" ".join(parts) or "Nothing was added.")


def _with_client(server, action):
    client_id = config.get("spotify", "client_id")
    if not client_id:
        return dict(arrived=0, missing=0, moved=0, message="There's no Spotify Client ID in your settings yet.")
    if server.spotify_client is None or server.spotify_client.client_id != client_id or server.spotify_client.paths != server.collection.paths:
        server.spotify_client = Client(client_id, server.collection.paths)
    try:
        return action(server.spotify_client, server.collection)
    except Stop as ex:
        return dict(arrived=0, missing=0, moved=0, message=str(ex))


def run(server):
    """Answer the page's Check Spotify button."""
    return _with_client(server, check)


def run_gather(server):
    """Answer the page's Move all to the bottom button."""
    return _with_client(server, gather)


def run_stream(server, song_id, names):
    """Answer the page's button for adding Spotify's version of a song to playlists."""
    return _with_client(server, lambda client, collection: add_streamed(client, collection, song_id, names))
