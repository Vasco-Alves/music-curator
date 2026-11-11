"""What's left to do by hand in your Spotify playlists? A read-only link to Spotify for the page's Playlists tab: has a song you meant to add
arrived, and which local entries have no file behind them any more (Spotify shows those greyed, and its API can't remove them).

Sign-in is Spotify's own consent page in your browser (Authorization Code with PKCE, so no secret), asking only to read your playlists.
Moving entries to the bottom needs more, so that button alone asks to change them too, the first time you press it. The token lives in memory and is never printed or saved. Requests are paced, and if Spotify asks for a long wait the app remembers it and
doesn't ask again until then.

It needs your own Spotify app's Client ID in curator.toml ([spotify] client_id), with http://127.0.0.1:8888/callback as its redirect URI.
"""
import base64
import collections
import datetime
import hashlib
import http.server
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from . import config, keys, saving, suggest

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


def _load(path):
    """What one of the files kept here holds. {} if there isn't one yet, or it makes no sense: all of them can be made again from Spotify.
    None if it's there and couldn't be opened just now. That is not an empty file, and saving as if it were would lose what's in it."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            saved = json.load(f)
        return saved if isinstance(saved, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}
    except OSError:
        return None


def _save(path, data, **how):
    """True once it's saved whole. A save that fails leaves the file as it was."""
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        saving.write(path, lambda f: json.dump(data, f, **how), encoding="utf-8", errors="replace")
    except OSError:
        return False
    return True


def _state(paths):
    """What's kept from the last check, or None if it's there and can't be opened. A save takes the file's place in an instant, and for that instant Windows won't open it:
    so it's tried a few times before that's believed."""
    for _ in range(5):
        state = _load(_state_path(paths))
        if state is not None:
            return state
        time.sleep(.02)
    return None


def read_state(paths):
    return _state(paths) or {}


def write_state(paths, **changes):
    """Keep these with what's already kept. False if that couldn't be done: the list on the page then stays as it was until the next check."""
    state = _state(paths)
    return state is not None and _save(_state_path(paths), dict(state, **changes), indent=1)


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
    hints = state.get("other_versions")
    return dict(ready=bool(config.get("spotify", "client_id")), wait_until=until.isoformat(timespec="minutes") if until else "", checked=str(state.get("checked") or ""),
                to_remove=[r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else [], playlists=[n for n in names if isinstance(n, str)] if isinstance(names, list) else [],
                other_versions=[h for h in hints if isinstance(h, dict) and all(isinstance(h.get(k), str) for k in ("file", "playlist", "name"))] if isinstance(hints, list) else [])


def _hits_path(paths):
    return os.path.join(os.path.dirname(paths["decisions"]), "spotify_search.json")


def read_hits(paths):
    """What Spotify said about each waiting song, so a song is only searched for once."""
    return {k: v for k, v in (_load(_hits_path(paths)) or {}).items() if isinstance(v, dict)}


def _write_hits(paths, hits):
    _save(_hits_path(paths), hits, ensure_ascii=False, indent=1)  # one that fails only costs a few more searches next time


def cache_path(paths):
    return os.path.join(os.path.dirname(paths["decisions"]), "spotify_playlists.json")


def _read_cache(paths):
    """What each playlist held last time, so one that hasn't changed needn't be asked for again. None if that can't be opened just now."""
    return _load(cache_path(paths))


def _write_cache(paths, cache):
    _save(cache_path(paths), cache, ensure_ascii=False)  # one that fails only costs a few more requests next time


# ---------------- which entries have nothing behind them ----------------

def _plain(text):
    return keys.plain(text)  # capitals, accents and punctuation don't count, but a mark that makes another letter does: ハート isn't ハード


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


def _entry_name(e):
    """((who, what), length) of a playlist entry, the way it's compared with a file: the names in full, version and all."""
    artist, name, secs = _saved_entry(e)
    return ("" if artist == "Unknown Artist" else _plain(artist), _plain(name)), secs  # that's how Spotify shows an empty artist tag


VERSION_WORD = r"\b(?:mix|remix|rmx|edit|version|dub|rework|vip|extended|instrumental|vocal|bootleg|remaster(?:ed)?|live|acoustic|demo|original|mono|stereo|slowed|sped[- ]?up|reverb|nightcore|(?:19|20)\d\d)\b"
VERSION_TAIL = re.compile(r"\s+-\s+(?=(?:(?! - ).)*" + VERSION_WORD + r")(?:(?! - ).)*$", re.I)  # how Spotify writes a version after a title: "Song - X Remix", "Song - 2011 Remaster". "Up - Down" is all title


def _any_version(artist, title, streamed=False):
    """Who and what, whatever the version: "Song (X Remix)" and "Song" are one. Of a streamed song Spotify writes the version after a dash too, and that comes off
    as well: "Song - X Remix", "Song - Remastered 2011". Only when it reads as a version, and never off one of your own files: their titles can have a dash in them."""
    title, before = re.sub(r"\s*[(\[][^)\]]*[)\]]", "", title or ""), None
    while streamed and title != before:
        title, before = VERSION_TAIL.sub("", title), title
    return suggest.track_key("" if artist == "Unknown Artist" else artist, title)


def _in_playlist(entries):
    """What's in a playlist: the names of its local entries; the lengths of its streamed ones by name (0 where Spotify gave none); each song in it whatever the
    version, with the name it has there; and the lengths of the streamed ones by song, whatever the version."""
    local, streamed, versions, lengths = set(), {}, {}, {}
    for e in (x for x in entries if isinstance(x, dict)):
        key, secs = _entry_name(e)
        if not any(key):
            continue
        artists, name, mine = e.get("artists"), e.get("name"), bool(e.get("local"))
        name = name if isinstance(name, str) else ""
        version = _any_version(next((a for a in artists if a and isinstance(a, str)), "") if isinstance(artists, list) else "", name, streamed=not mine)
        if mine:
            local.add(key)
        else:
            streamed.setdefault(key, []).append(secs)
            lengths.setdefault(version, []).append(secs)
        if not version.endswith("|"):  # with no title left there's nothing to tell songs apart by
            versions.setdefault(version, dict(name=name, secs=0 if mine else secs, same=key))
    return dict(local=local, streamed=streamed, versions=versions, lengths=lengths)


def _has(there, song):
    """Is this song in the playlist? The rule the page plays by: a local entry is the file of that name, and a streamed one also has to be about as long,
    since the same name at another length is another cut. `song` is what _names_on_spotify gives."""
    return any(name in there["local"] or any(secs and song["secs"] and abs(song["secs"] - secs) <= MAY_BE_GAP_S for secs in there["streamed"].get(name, ())) for name in song["names"])


def _other_version(there, song):
    """What the playlist has of this song in some version: {name, secs, same}, or None. Only worth asking once _has has said no."""
    return next((there["versions"][v] for v in sorted(song["versions"]) if v in there["versions"]), None)


def _may_still_be(there, song):
    """Once _has has said no: could Spotify's own copy of this very recording still be in the playlist? Under its own name where a length isn't known, or under a name
    written another way (one more artist credited, "Remastered 2011", no "Original Mix") and about as long. Asked before a take-out is called done, because that can't be undone."""
    def close(secs):
        return not secs or not song["secs"] or abs(song["secs"] - secs) <= MAY_BE_GAP_S
    return any(close(secs) for v in song["versions"] for secs in there["lengths"].get(v, ())) or any(not secs or not song["secs"] for name in song["names"] for secs in there["streamed"].get(name, ()))


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
            key, secs = _entry_name(e)
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
            except Stop as ex:
                refused = isinstance(ex.__cause__, urllib.error.HTTPError) and ex.__cause__.code in (400, 401)
                if not refused:  # the network, or Spotify having a bad moment: your sign-in is still good, so you aren't asked to sign in again
                    raise Stop("Couldn't reach Spotify just now, so it stopped there. Try again in a moment.") from ex
                self.refresh_token = None  # Spotify turned the sign-in down: it takes a new one
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
    """(artist, title, mix, the title's other reading) to look a waiting song up by. Files named by uploaders need reading, the same way Curate reads them.
    The other reading is the title without the year at its end, when that may only say when the song is from: "Analog Mind 1995"."""
    from . import parse
    info = parse.parse(os.path.splitext(song["file"])[0], dict(artist=song["artist"], title=song["title"]))
    if info["search_artist"]:
        return info["search_artist"], info["search_title"], info["mix"], re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", info["alt_title"] or "").strip()
    return song["artist"], re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", song["title"] or "").strip(), info["mix"], ""


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
    paths, asked, stopped = collection.paths, 0, ""
    if _load(_hits_path(paths)) is None:  # what's remembered can't be opened just now: searching anyway would save over all of it with this run's few answers
        return 0, ""
    hits = read_hits(paths)
    today, waiting = datetime.date.today(), [s for s in collection.songs.values() if s["area"] != "library" and not s["done"]]
    try:
        for song in sorted(waiting, key=lambda s: s["key"]):
            if f"spotify:{song['key']}" in collection.decisions or not song["secs"] or song["secs"] > LONGEST_SONG_S:
                continue
            artist, title, mix, other = _search_terms(song)
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
            best = None
            for name in [title, other] if other else [title]:
                best = _best_track(client.search(f"track:{name} artist:{artist}"), artist, name, mix, song["secs"])
                if not best:  # Spotify's stricter search misses "&" and punctuation
                    best = _best_track(client.search(f"{name} {artist}"), artist, name, mix, song["secs"])
                if best:
                    break
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


def _own_name(song):
    """A song's name the way a playlist lists it. A file with no tags goes by its file name."""
    return ("", _plain(os.path.splitext(song["file"])[0])) if song.get("_tagless") else (_plain(song["artist"]), _plain(song["title"]))


def _names_on_spotify(collection, song, noted="", everyone=None):
    """How a playlist may list this song: its names in full, its length, and the song whatever the version.
    Spotify shows a file under the tags it had when it last read it. So the name the song was downloaded under counts too, and so does `noted`: the name it had when
    it went on the to-do ("Artist - Title"). An older name stops counting once another of your files goes by it (`everyone` counts today's names): that entry is the other file's."""
    row = collection._log_row(song["_path"], song["_rel"]) or {}
    own = _own_name(song)
    names, versions = {own}, {_any_version(song["artist"], song["title"])}
    older = [(row.get("src_artist") or "", row["src_title"])] if row.get("src_title") else []
    artist, dash, title = str(noted or "").partition(" - ")
    if noted:
        older.append((artist, title) if dash else ("", artist))
    for artist, title in older:
        name = (_plain(artist), _plain(title))
        if name != own and not (everyone or {}).get(name):
            names.add(name)
            if artist:  # a video's title filed under nobody is too little to tell songs apart by
                versions.add(_any_version(artist, title))
    return dict(names=names, secs=song["secs"] or 0, versions={v for v in versions if not v.endswith("|")})


def check(client, collection):
    """Compare what you meant to add with what's really in those playlists and update the list to match, and work out which entries have no file behind them."""
    until = _wait_until(collection.paths)
    if until:
        return dict(arrived=0, missing=0, message=f"Spotify asked to wait until {until:%H:%M}. Try again after that.")
    collection.refresh()
    songs = {s["key"]: s for s in collection.songs.values() if s["area"] == "library"}
    answers = {k: d for k, d in collection.decisions.items() if d.get("kind") == "playlist" and d.get("action") in ("add", "added") and d.get("file") in songs}
    takeouts = {k: d for k, d in collection.decisions.items() if d.get("kind") == "unlist" and d.get("action") == "remove" and d.get("file") in songs}  # songs you said to take out of a playlist
    wanted = sorted({n for d in [*answers.values(), *takeouts.values()] for n in _lines(d)})

    everyone = collections.Counter(_own_name(s) for s in collection.songs.values() if not s.get("done"))  # (not a download that's in the library by now: that is the song itself under its old name, not another one)
    who = {key: _names_on_spotify(collection, songs[d["file"]], d.get("song"), everyone) for key, d in {**answers, **takeouts}.items()}

    present, read, stopped, unknown, mine = {}, {}, "", [], {}
    cache = _read_cache(collection.paths)
    whole = cache is not None  # False: what was kept couldn't be opened, so every playlist is read afresh
    cache = cache or {}
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
                present[name] = _in_playlist(read[name])
    except Stop as ex:
        stopped = str(ex)
    except urllib.error.HTTPError as ex:
        stopped = f"Spotify answered with an error ({ex.code}), so the check stopped there."
    if mine and not stopped:  # a playlist you've deleted shouldn't stay playable here
        cache = {k: v for k, v in cache.items() if k in {info["id"] for info in mine.values()}}
    if whole or not stopped:  # a check cut short, on top of a file that couldn't be opened, knows less than the file does: leave it
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

    counts, others = dict(arrived=0, missing=0, out=0, still=0), []

    def change(current):
        counts.update(arrived=0, missing=0, out=0, still=0)  # it may be run again on a newer list, if another program saved your answers meanwhile
        del others[:]
        for key in takeouts:  # done once Spotify doesn't have it in that playlist any more. Another version staying there is another song, but Spotify's own copy of this one is not
            d = current.get(key)
            if not isinstance(d, dict) or d.get("kind") != "unlist" or d.get("action") != "remove":
                continue
            names = _lines(d)
            out = [n for n in names if n in present and not _has(present[n], who[key]) and not _may_still_be(present[n], who[key])]
            left = [n for n in names if n not in out]
            counts["out"] += len(out)
            counts["still"] += len([n for n in left if n in present])
            if not left:
                current.pop(key)
            elif out:
                d["note"] = "\n".join(left)
        for key in answers:
            d = current.get(key)  # read again: you may have answered something while Spotify was being read
            if not isinstance(d, dict) or d.get("action") not in ("add", "added"):
                continue
            names = _lines(d)
            here = [n for n in names if n in present and _has(present[n], who[key])]
            gone = [n for n in names if n in present and n not in here]
            if d["action"] == "add":
                left = [n for n in names if n not in here]
                counts["arrived"] += len(here)
                counts["missing"] += len(gone)
                others.extend(dict(file=d.get("file"), playlist=n, name=other["name"], secs=other["secs"] if other["same"] in who[key]["names"] else 0) for n in gone for other in [_other_version(present[n], who[key])] if other)
                if here and not left:
                    d["action"] = "added"
                elif here:
                    d["note"] = "\n".join(left)
            else:  # marked as added. It goes back on the list only where no version of it is there: Spotify doesn't have every mix, so another one may be what you meant
                gone = [n for n in gone if not _other_version(present[n], who[key])]
                if gone:
                    d.update(action="add", note="\n".join(gone))
                    counts["missing"] += len(gone)

    problem = collection.update_answers(change) if present else None
    listed = True
    if read:
        still_asked = {(d.get("file"), n) for d in collection.decisions.values() if d.get("kind") == "playlist" and d.get("action") == "add" for n in _lines(d)}
        hints = {} if problem else dict(other_versions=others + [h for h in status(collection.paths)["other_versions"] if h.get("playlist") not in present and (h.get("file"), h.get("playlist")) in still_asked])  # what wasn't read this time stays as it was, for as long as the song still waits for that playlist
        listed = write_state(collection.paths, checked=datetime.datetime.now().isoformat(timespec="seconds"), playlists=sorted(mine, key=str.casefold), **hints, **({} if removals is None else dict(to_remove=removals)))
    maybe = 0
    if read and not stopped:
        maybe, stopped = _look_for_waiting_songs(client, collection)
    parts = [stopped] if stopped else []
    if problem:
        parts.append(problem)
    if present and not problem and answers:
        parts.append(f"{counts['arrived']} arrived, {counts['missing']} still not in {'their playlists' if len(present) > 1 else 'the playlist'}.")
    if others and not problem and listed:  # another version doesn't count as arrived, but it's worth saying it's there: the rows under To add say which
        parts.append(f"For {len(others)} of those the playlist has what may be another version: see To add.")
    if present and not problem and takeouts:
        parts.append(f"{counts['out']} taken out, {counts['still']} still to take out.")
    if not listed:  # the answers are up to date, but what the page lists under them is from the check before
        parts.append("The lists on this page couldn't be saved just now: press Check Spotify again.")
    if removals is not None and listed:
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
    whole = cache is not None  # False: what was kept couldn't be opened, and the few playlists read here mustn't be saved over the rest
    cache = cache or {}
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
    if whole:
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


def send_playlist(client, collection, list_id):
    """Put one of your local playlists on Spotify. Spotify doesn't let apps add local files, so the playlist is made if it isn't there yet, and its songs wait on your to-do for you to drag in."""
    from . import own_playlists  # here because it needs the web app's module loaded first
    until = _wait_until(collection.paths)
    if until:
        return dict(sent=0, message=f"Spotify asked to wait until {until:%H:%M}. Try again after that.")
    collection.refresh()
    playlist = next((p for p in own_playlists.listed(collection) if p["id"] == list_id), None)
    if not playlist:
        return dict(sent=0, message="That playlist isn't there any more. Read the library again.")
    name, members = playlist["name"], [collection.songs[i] for i in playlist["ids"]]
    songs = [s for s in members if s["area"] == "library"]
    if not songs:
        return dict(sent=0, message="None of its songs are in your library yet, so there's nothing to send.")
    client.allow_changes()
    made, refused, there = False, False, _in_playlist([])
    try:
        mine = client.my_playlists()
        if name in mine:
            there = _in_playlist(client.entries(mine[name]["id"]))
        else:
            try:
                client.post(f"{API}/me/playlists", dict(name=name, public=False))
                made = True
            except urllib.error.HTTPError:  # Spotify doesn't let every app make playlists. The songs can still wait for you
                refused = True
    except Stop as ex:
        return dict(sent=0, message=str(ex))
    except urllib.error.HTTPError as ex:
        return dict(sent=0, message=f"Spotify answered with an error ({ex.code}), so nothing was sent.")
    finally:
        if not client.access:  # the bigger permission wasn't given: the next check asks only to read
            client.scope = SCOPES
    everyone = collections.Counter(_own_name(s) for s in collection.songs.values() if not s.get("done"))  # (not a download that's in the library by now: that is the song itself under its old name, not another one)

    def settled(song):
        """In the playlist already. Or you marked it Added there with another version in it, which may be the one you meant: sending the playlist again doesn't undo that."""
        me, answer = _names_on_spotify(collection, song, "", everyone), collection.decisions.get(f"playlist:{song['key']}") or {}
        return _has(there, me) or (answer.get("action") == "added" and name in _lines(answer) and bool(_other_version(there, me)))

    waiting, now = [s for s in songs if not settled(s)], datetime.datetime.now().isoformat(timespec="seconds")  # another version in it isn't this song: it still waits

    def change(current):
        for song in waiting:
            key = f"playlist:{song['key']}"
            d = current.get(key)
            names = _lines(d) if isinstance(d, dict) and d.get("action") == "add" else []
            current[key] = dict(kind="playlist", action="add", song=f"{song['artist']} - {song['title']}".strip(" -"), file=song["key"], genre="", note="\n".join(dict.fromkeys([*names, name])), at=now)

    problem = collection.update_answers(change) if waiting else None
    if problem:
        return dict(sent=0, message=problem)
    count = f"{len(waiting)} song{'' if len(waiting) == 1 else 's'}"
    first = f"Made {name} on Spotify." if made else f"Spotify wouldn't let the app make {name}, so make a playlist with that exact name there yourself." if refused else f"{name} is already on Spotify."
    rest = f"{count} {'is' if len(waiting) == 1 else 'are'} on your Spotify to-do." if waiting else "Every song is already in it."
    left = len(members) - len(songs)
    return dict(sent=len(waiting), made=made, message=" ".join(x for x in (first, rest, f"Left out {left} song{'' if left == 1 else 's'} not in your library yet." if left else "") if x))


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


def run_send(server, list_id):
    """Answer the page's Send to Spotify button."""
    return _with_client(server, lambda client, collection: send_playlist(client, collection, list_id))
