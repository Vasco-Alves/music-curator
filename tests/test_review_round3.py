"""What the full review found in the parts that change your files and in the Discogs helper: one test per problem.

    python -m unittest discover -s tests
"""
import contextlib
import http.client
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from unittest import mock

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
sys.path.insert(0, SRC)

from music_curator import apply, curate, discogs, other_sources, spotify, tagwriter, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_curate import KEY, LENGTH, WithDiscogs  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


class WhatChangesYourFiles(WithDiscogs):
    def blocked_genre_folder(self):
        """A file where the genre's folder should go, so the new copy can't be written."""
        block = os.path.join(self.lib, "Acid")
        with open(block, "w", encoding="utf-8") as f:
            f.write("x")
        return block

    # -- what you said about a song --

    def test_what_you_said_is_kept_when_the_copy_cannot_be_written(self):
        self.file("Unknown - Track")
        self.fake.add("Real", "The Record", [("A1", "Name", LENGTH)])
        block = self.blocked_genre_folder()
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid"], "nothing went in")
        self.assertEqual(self.waiting()[KEY.format("Unknown - Track")]["said"], "Real - Name")
        os.remove(block)
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Real - Name.mp3"], "the next run goes by what you said")

    def test_stopping_before_the_song_goes_in_keeps_your_answer(self):
        self.file("Unknown - Track")
        self.fake.add("Real", "The Record", [("A1", "Name", LENGTH)])
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        with mock.patch.object(curate, "audio_trouble", return_value=None):  # what it answers when Stop was pressed during the listen
            self.run_it()
        self.assertEqual(self.in_library(), [])
        self.assertIn(f"waiting:{KEY.format('Unknown - Track')}", self.saved())

    # -- the waiting list --

    def test_a_waiting_list_that_cannot_be_opened_stops_the_run_and_is_left_alone(self):
        self.file("A - One")
        self.run_it()
        path = webapp.curated_path(self.paths)
        with open(path, "rb") as f:
            before = f.read()
        self.assertIn(b"A - One", before)
        real = open

        def locked(file, *a, **k):
            if os.path.abspath(str(file)) == os.path.abspath(path):
                raise PermissionError(13, "Permission denied", str(file))
            return real(file, *a, **k)

        with mock.patch.object(curate, "open", locked, create=True), self.assertRaises(curate.Stop) as stopped:
            self.run_it()
        self.assertIn("can't be read just now", str(stopped.exception))
        with open(path, "rb") as f:
            self.assertEqual(f.read(), before)

    # -- the log always knows what is in your library --

    def test_a_check_that_fails_after_the_write_still_logs_the_song(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        with mock.patch.object(tagwriter, "compare_audio", side_effect=RuntimeError("boom")):
            _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (1, ["Acid/A - Song.mp3"]))
        row = self.log_rows()[-1]
        self.assertTrue(row["status"].startswith("check:"), row["status"])
        self.assertIn("couldn't be checked", row["status"])
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], len(self.log_rows())), (0, 0, 1), "the next run knows it's there")

    def test_ctrl_c_during_the_check_still_logs_the_song(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        with mock.patch.object(tagwriter, "compare_audio", side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])
        self.assertTrue(self.log_rows()[-1]["status"].startswith("check:"))
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], len(self.log_rows())), (0, 0, 1))

    def test_a_check_that_read_no_audio_at_all_is_not_a_pass(self):
        """ffmpeg stopped under the app, or unable to read the files, gives nothing for the copy and nothing for its source. Two nothings are equal, and that used to count as the same audio."""
        with mock.patch.object(tagwriter, "audio_packets", return_value=[]):
            ok, note = tagwriter.compare_audio("copy.mp3", "source.mp3", None)
        self.assertFalse(ok)
        self.assertIn("couldn't be read back", note)
        with mock.patch.object(tagwriter, "audio_packets", side_effect=lambda path: [] if path == "copy.mp3" else ["a1", "b2"]):
            self.assertFalse(tagwriter.compare_audio("copy.mp3", "source.mp3", None)[0])
        with mock.patch.object(tagwriter, "audio_packets", return_value=["a1", "b2"]):
            self.assertEqual(tagwriter.compare_audio("copy.mp3", "source.mp3", None), (True, ""))

    def test_a_song_whose_copy_could_not_be_read_back_is_marked_to_check(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        with mock.patch.object(tagwriter, "audio_packets", return_value=[]):
            self.run_it()
        row = self.log_rows()[-1]
        self.assertTrue(row["status"].startswith("check:"), row["status"])
        self.assertIn("couldn't be read back", row["status"])

    def test_a_new_genre_is_not_written_when_the_copy_could_not_be_read_back(self):
        """For a FLAC or M4A the tags are rewritten into a copy, and the copy only takes the song's place once its audio is shown to be the same."""
        def made(src, dst, tags, **how):
            with open(dst, "wb") as f:
                f.write(b"not what was asked for")
        with mock.patch.object(tagwriter, "remux", made), mock.patch.object(tagwriter, "audio_packets", return_value=[]), self.assertRaises(apply.Skip) as held:
            apply.other_with_genre(os.path.join(self.root, "song.flac"), "Acid")
        self.assertIn("didn't check out", str(held.exception))

    def test_no_half_written_copy_is_left_when_it_cannot_be_put_in_place(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        real = os.replace

        def failing(src, dst, *a, **k):
            if os.path.basename(str(src)).startswith(".tmp_") and str(src).endswith(".mp3"):
                raise PermissionError(13, "Access is denied", str(dst))
            return real(src, dst, *a, **k)

        with mock.patch.object(tagwriter.os, "replace", failing):
            _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (0, []))
        self.assertTrue(self.log_rows()[-1]["status"].startswith("error:"))
        self.assertIn(KEY.format("A - Song"), self.waiting())


class Opened:
    """Stands in for the web: it keeps what would have been sent and answers with an empty reply."""

    def __init__(self):
        self.requests = []

    def open(self, req, timeout=None):
        self.requests.append(req)
        return io.BytesIO(b"{}")


class TheDiscogsToken(unittest.TestCase):
    def setUp(self):
        self.web = Opened()
        for name, stand_in in (("_opener", self.web), ("token", lambda: "dummy"), ("_last", [0.0])):
            patcher = mock.patch.object(discogs, name, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)

    def sent(self, url):
        """The request that goes out for this address."""
        discogs._last[0] = 0.0  # no waiting between requests in a test
        discogs._request(url)
        return self.web.requests[-1]

    def test_the_token_goes_to_the_discogs_api(self):
        self.assertEqual(self.sent("https://api.discogs.com/releases/1").get_header("Authorization"), "Discogs token=dummy")

    def test_an_address_that_only_looks_like_discogs_gets_no_token(self):
        for url in ("https://api.discogs.com.example.net/x", "https://api.discogs.com@example.net/x", "http://api.discogs.com/x",
                    "https://api.discogs.com:8443/x", "https://i.discogs.com/picture.jpg"):
            with self.subTest(url=url):
                self.assertFalse(self.sent(url).has_header("Authorization"))

    def test_an_address_that_cannot_be_read_is_not_discogs(self):
        self.assertFalse(discogs._is_api("https://api.discogs.com:notaport/x"))
        self.assertFalse(discogs._is_api("https://[api.discogs.com/x"))

    def test_the_token_does_not_follow_a_redirect_to_another_site(self):
        first = urllib.request.Request("https://api.discogs.com/releases/1", headers={"User-Agent": "test", "Authorization": "Discogs token=dummy"})
        away = discogs._TokenStaysHome().redirect_request(first, None, 302, "Found", {}, "https://elsewhere.example/x")
        self.assertFalse(away.has_header("Authorization"))
        self.assertTrue(away.has_header("User-agent"), "the rest of the request goes on as it was")
        home = discogs._TokenStaysHome().redirect_request(first, None, 302, "Found", {}, "https://api.discogs.com/releases/2")
        self.assertEqual(home.get_header("Authorization"), "Discogs token=dummy")

    def test_a_picture_that_is_not_there_leaves_no_file(self):
        with tempfile.TemporaryDirectory() as folder:
            out = os.path.join(folder, "cover.jpg")
            with mock.patch.object(discogs, "_request", return_value=None), self.assertRaises(SystemExit):
                discogs.main(["image", "https://i.discogs.com/gone.jpg", out])
            self.assertFalse(os.path.exists(out))

    def test_a_picture_that_is_there_is_saved(self):
        with tempfile.TemporaryDirectory() as folder:
            out = os.path.join(folder, "cover.jpg")
            with mock.patch.object(discogs, "_request", return_value=b"picture"), contextlib.redirect_stdout(io.StringIO()):
                discogs.main(["image", "https://i.discogs.com/there.jpg", out])
            with open(out, "rb") as f:
                self.assertEqual(f.read(), b"picture")


class YourAnswers(WithDiscogs):
    def setUp(self):
        super().setUp()
        self.file("A - One")
        self.collection = webapp.Collection(self.paths)
        self.collection.refresh()
        self.song = next(s for s in self.collection.songs.values() if s["file"] == "A - One.mp3")
        self.key = f"waiting:{self.song['key']}"

    def say(self, **body):
        return self.collection.decide(dict(id=self.song["id"], **body))

    def full_disk(self):
        return mock.patch.object(webapp.os, "replace", side_effect=OSError(28, "No space left on device"))

    def test_an_answer_that_could_not_be_saved_is_not_shown_as_saved(self):
        with self.full_disk():
            self.assertIn("Couldn't save", self.say(kind="waiting", action="keep"))
        self.assertNotIn(self.key, self.collection.decisions)
        self.assertEqual(self.saved(), {})
        self.assertIsNone(self.say(kind="flag", action="flag"))
        self.assertEqual(list(self.saved()), [f"flag:{self.song['key']}"], "the answer that failed doesn't come back with the next one")

    def test_a_change_to_several_answers_that_could_not_be_saved_changes_nothing(self):
        self.assertIsNone(self.say(kind="waiting", action="keep", note="first"))
        with self.full_disk():
            self.assertIn("Couldn't save", self.collection.update_answers(lambda answers: answers[self.key].update(note="changed")))
        self.assertEqual(self.collection.decisions[self.key]["note"], "first")
        self.assertEqual(self.saved()[self.key]["note"], "first")

    def test_answers_that_cannot_be_opened_just_now_are_not_written_over(self):
        self.assertIsNone(self.say(kind="waiting", action="keep"))
        path = self.paths["decisions"]
        with open(path, "w", encoding="utf-8") as f:  # another program changes the file, as `curator apply` does
            json.dump({"genre:another song": {"action": "genre"}}, f)
        real = open

        def locked(file, *a, **k):
            if os.path.abspath(str(file)) == os.path.abspath(path):
                raise PermissionError(13, "Permission denied", str(file))
            return real(file, *a, **k)

        with mock.patch.object(webapp, "open", locked, create=True):
            self.assertEqual(self.say(kind="flag", action="flag"), webapp.ANSWERS_BUSY)
            self.assertEqual(self.collection.update_answers(dict.clear), webapp.ANSWERS_BUSY)
        self.assertEqual(list(self.saved()), ["genre:another song"], "what the other program wrote is still there")

    def test_a_song_held_back_with_no_reason_given_still_shows(self):
        self.run_it()
        path = webapp.curated_path(self.paths)
        with open(path, encoding="utf-8") as f:
            kept = json.load(f)
        kept["songs"][KEY.format("A - One")]["why"] = ""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(kept, f)
        waiting = [c for c in self.page_song("A - One.mp3")["checks"] if c["kind"] == "waiting"]
        self.assertEqual([c["why"] for c in waiting], ["Not verified yet, so it isn't in your library."])

    def test_a_song_that_got_shorter_does_not_leave_the_player_waiting(self):
        server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        port = server.server_address[1]
        server.collection, server.hosts = self.collection, {f"127.0.0.1:{port}"}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        real = os.path.getsize

        def before_it_was_cut(path):
            return real(path) + (5000 if os.path.abspath(path) == os.path.abspath(self.song["_path"]) else 0)

        asking = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        self.addCleanup(asking.close)
        with mock.patch.object(webapp.os.path, "getsize", before_it_was_cut):
            asking.request("GET", f"/audio/{self.song['id']}")
            reply = asking.getresponse()
            with self.assertRaises(http.client.IncompleteRead) as cut:  # the connection is closed, not left open for bytes that will never come
                reply.read()
        self.assertEqual(len(cut.exception.partial), real(self.song["_path"]))


class TheLinkForYourPhone(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = tmp.name

    def key_kept_beside(self, env):
        with mock.patch.object(webapp.config, "env_file", return_value=env):
            return webapp.lan_key()

    def test_the_key_is_kept_even_when_its_folder_is_not_there_yet(self):
        env = os.path.join(self.folder, "not", "there", ".env")
        key = self.key_kept_beside(env)
        self.assertRegex(key, "^[0-9a-f]{10}$")
        self.assertEqual(self.key_kept_beside(env), key, "the link on your phone still works the next time")

    def test_a_key_that_cannot_be_kept_still_works_for_this_run(self):
        in_the_way = os.path.join(self.folder, "a file")
        with open(in_the_way, "w", encoding="utf-8") as f:
            f.write("x")
        self.assertRegex(self.key_kept_beside(os.path.join(in_the_way, "settings", ".env")), "^[0-9a-f]{10}$")


class WhatFfmpegSays(unittest.TestCase):
    def test_a_title_in_another_alphabet_does_not_lose_the_answer(self):
        code = "import sys; sys.path.insert(0, sys.argv[1]); from music_curator import samerec; print(repr(samerec.hf_db(sys.argv[2])))"
        with tempfile.TemporaryDirectory() as folder:
            path = write_mp3(os.path.join(folder, "a.mp3"), title="Абв")
            # in its own Python with UTF-8 mode off, as the app runs on Windows: there, text from another program is read as Windows text unless the code says otherwise
            done = subprocess.run([sys.executable, "-I", "-X", "utf8=0", "-c", code, SRC, path], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        self.assertEqual(done.returncode, 0, done.stderr[-400:])
        self.assertRegex(done.stdout.strip(), "^(None|-?(inf|[0-9.]+))$")


class AskingMusicBrainz(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cache, self.replies, self.asked = tmp.name, [], 0
        for owner, name, stand_in in ((other_sources.urllib.request, "urlopen", self.web), (other_sources.time, "sleep", lambda secs: None)):
            patcher = mock.patch.object(owner, name, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)

    def web(self, req, timeout=None):
        """Stands in for MusicBrainz: the next of `replies`, an error to raise or the bytes of an answer."""
        self.asked += 1
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return io.BytesIO(reply)

    def kept(self):
        return os.listdir(self.cache)

    def test_a_request_that_failed_is_asked_again(self):
        self.replies = [OSError("the network is down"), b'{"recordings": []}']
        self.assertIn("error", other_sources.mb("recording?query=x", self.cache))
        self.assertEqual(self.kept(), [], "a failure isn't kept as MusicBrainz's answer")
        self.assertEqual(other_sources.mb("recording?query=x", self.cache), {"recordings": []})
        self.assertEqual(other_sources.mb("recording?query=x", self.cache), {"recordings": []})
        self.assertEqual(self.asked, 2, "a real answer is kept and not asked for again")

    def test_a_failure_an_older_version_kept_is_asked_again(self):
        self.replies = [b'{"recordings": []}', b'{"recordings": [{"id": "1"}]}']
        other_sources.mb("recording?query=x", self.cache)
        (name,) = self.kept()
        with open(os.path.join(self.cache, name), "w", encoding="utf-8") as f:
            json.dump({"error": "timed out"}, f)
        self.assertEqual(other_sources.mb("recording?query=x", self.cache), {"recordings": [{"id": "1"}]})
        self.assertEqual(self.asked, 2)

    def test_a_quote_in_a_name_stays_inside_the_phrase(self):
        slash, asked = chr(92), []  # a backslash
        with mock.patch.object(other_sources, "mb", lambda path, cache: asked.append(path) or {}):
            self.assertIsNone(other_sources.try_musicbrainz({"search_artist": 'A "B"', "search_title": f"C{slash}D", "secs": 100}, self.cache))
        query = urllib.parse.parse_qs(asked[0].split("?", 1)[1])["query"][0]
        self.assertEqual(query, f'recording:"C{slash}{slash}D" AND artist:"A {slash}"B{slash}""')


class RenewingTheSpotifySignIn(unittest.TestCase):
    def client(self, *replies):
        """A client whose sign-in has run out. `replies` is what Spotify says to each try at renewing it: an error to raise, or the answer."""
        waiting = list(replies)

        def fetch(url, headers=None, data=None):
            reply = waiting.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply

        client = spotify.Client("id", {}, fetch=fetch, sleep=lambda secs: None)
        client.refresh_token, client.expires = "refresh", 0
        return client

    def says(self, code):
        return urllib.error.HTTPError(spotify.ACCOUNTS + "/api/token", code, "error", {}, io.BytesIO(b""))

    def test_a_bad_moment_on_the_network_does_not_ask_you_to_sign_in_again(self):
        client = self.client(OSError("the network is down"), self.says(503), dict(access_token="new", expires_in=3600))
        with mock.patch.object(client, "sign_in") as sign_in:
            for _ in range(2):  # no network, then Spotify itself having a problem
                with self.assertRaises(spotify.Stop) as stopped:
                    client.ready()
                self.assertIn("Try again in a moment", str(stopped.exception))
                self.assertEqual(client.refresh_token, "refresh")
            client.ready()  # once Spotify answers again, it carries on by itself
        self.assertEqual(client.access, "new")
        sign_in.assert_not_called()

    def test_a_sign_in_spotify_turns_down_is_asked_for_again(self):
        client = self.client(self.says(400))
        with mock.patch.object(client, "sign_in") as sign_in:
            client.ready()
        sign_in.assert_called_once_with()
        self.assertIsNone(client.refresh_token)


class CopiesThatArriveWhole(Base):
    """A copy, and a move to another drive, go under a temporary name until all of the song is there."""

    def setUp(self):
        super().setUp()
        self.src, self.dst = os.path.join(self.root, "from", "A - B.mp3"), os.path.join(self.root, "to", "A - B.mp3")
        os.makedirs(os.path.dirname(self.src))
        with open(self.src, "wb") as f:
            f.write(b"all of the song")

    def read(self, path):
        with open(path, "rb") as f:
            return f.read()

    def stopped_halfway(self, src, tmp):
        """Stands in for the copying itself: half the song is written, then the app is closed."""
        with open(tmp, "wb") as f:
            f.write(b"all of")
        self.assertFalse(os.path.exists(self.dst), "half a song under the song's own name: if the computer went off now, it would stay there")
        raise KeyboardInterrupt

    def other_drive(self):
        """The song can't just be renamed, as from one drive to another, so it has to be copied."""
        real = os.rename

        def rename(old, new):
            if old == self.src:
                raise OSError(18, "Invalid cross-device link")
            real(old, new)

        return mock.patch.object(apply.os, "rename", rename)

    def test_a_copy_stopped_halfway_leaves_nothing_under_the_songs_name(self):
        with mock.patch.object(apply.shutil, "copy2", self.stopped_halfway), self.assertRaises(KeyboardInterrupt):
            apply._copy(self.src, self.dst)
        self.assertEqual(os.listdir(os.path.dirname(self.dst)), [], "no half song, and no temporary file either")
        self.assertEqual(self.read(self.src), b"all of the song")

    def test_a_move_to_another_drive_stopped_halfway_leaves_the_song_where_it_was(self):
        with self.other_drive(), mock.patch.object(apply.shutil, "copy2", self.stopped_halfway), self.assertRaises(KeyboardInterrupt):
            apply._move(self.src, self.dst)
        self.assertEqual(os.listdir(os.path.dirname(self.dst)), [])
        self.assertEqual(self.read(self.src), b"all of the song")

    def test_both_still_do_their_job(self):
        apply._copy(self.src, self.dst)
        self.assertEqual((self.read(self.src), self.read(self.dst)), (b"all of the song", b"all of the song"))
        os.remove(self.dst)
        with self.other_drive():
            apply._move(self.src, self.dst)
        self.assertFalse(os.path.exists(self.src))
        self.assertEqual(os.listdir(os.path.dirname(self.dst)), ["A - B.mp3"])
        self.assertEqual(self.read(self.dst), b"all of the song")

    def test_a_temporary_copy_left_in_set_aside_is_swept_up(self):
        self.song("Techno")
        left = os.path.join(self.app, apply.SET_ASIDE, "2026-01-01 00-00-00", "library", "Techno", apply.TEMP_PREFIX + "left" + apply.TEMP_SUFFIX)
        os.makedirs(os.path.dirname(left))
        open(left, "wb").close()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        self.assertFalse(os.path.exists(left))


if __name__ == "__main__":
    unittest.main()
