"""Tests for the read-only Spotify check, against a stand-in for Spotify. Nothing here reaches the network.

    python -m unittest discover -s tests
"""
import datetime
import email.message
import http.client
import io
import json
import os
import socket
import sys
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import config, own_playlists, spotify, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_webapp import FRAME, write_mp3  # noqa: E402

RAVE, OTHER = "Rave Mix", "Other Mix"


def http_error(url, code, **headers):
    message = email.message.Message()
    for k, v in headers.items():
        message[k.replace("_", "-")] = v
    return urllib.error.HTTPError(url, code, "error", message, io.BytesIO(b""))


class FakeSpotify:
    """Answers like Spotify's API. `lists` is {name: ["Artist - Title", ...]}."""

    def __init__(self, lists, shape="item", page=100, snapshots=None, catalog=None):
        self.lists, self.shape, self.page, self.snapshots, self.catalog = lists, shape, page, snapshots or {}, catalog or []
        self.calls, self.fail, self.puts, self.posts, self.searches, self.made = [], {}, [], [], [], []

    def track(self, t):
        """"Artist - Title", or a dict with name, artists, album, secs and local."""
        if isinstance(t, str):
            t = dict(name=t.split(" - ")[1], artists=[t.split(" - ")[0]])
        local = t.get("local", True)
        return {self.shape: dict(name=t["name"], artists=[dict(name=a) for a in t["artists"]], album=dict(name=t.get("album", "")), duration_ms=t.get("secs", 0) * 1000, is_local=local, uri=t.get("uri")), "is_local": local}

    def __call__(self, url, headers=None, data=None, method=None):
        self.calls.append(url)
        for piece in list(self.fail):
            if piece in url:
                error = self.fail[piece].pop(0)
                if not self.fail[piece]:
                    del self.fail[piece]
                raise http_error(url, *error[:1], **(error[1] if len(error) > 1 else {}))
        parts = urllib.parse.urlsplit(url)
        if method == "PUT":
            name = list(self.lists)[int(parts.path.split("/")[-2].removeprefix("id"))]
            body = json.loads(data)
            self.puts.append((name, body))
            items, start, length, before = self.lists[name], body["range_start"], body["range_length"], body["insert_before"]
            piece = items[start:start + length]
            del items[start:start + length]
            at = before - length if before > start else before
            items[at:at] = piece
            self.snapshots[name] = f"after{len(self.puts)}"
            return dict(snapshot_id=self.snapshots[name])
        if method == "POST" and parts.path.endswith("/me/playlists"):
            body = json.loads(data)
            self.made.append(body)
            self.lists[body["name"]] = []
            return dict(id=f"id{len(self.lists) - 1}", name=body["name"])
        if method == "POST":
            name = list(self.lists)[int(parts.path.split("/")[-2].removeprefix("id"))]
            uris = json.loads(data)["uris"]
            self.posts.append((name, uris))
            self.lists[name].extend(dict(name="Streamed", artists=["S"], uri=u, local=False) for u in uris)
            return dict(snapshot_id="posted")
        if parts.path.endswith("/search"):
            self.searches.append(urllib.parse.parse_qs(parts.query)["q"][0])
            return dict(tracks=dict(items=self.catalog))
        if parts.path.endswith("/me"):
            return dict(id="me")
        if parts.path.endswith("/me/playlists"):
            return dict(items=[dict(id=f"id{i}", name=n, owner=dict(id="me"), snapshot_id=self.snapshots.get(n)) for i, n in enumerate(self.lists)] + [dict(id="theirs", name="Followed", owner=dict(id="someone"))], next=None)
        names = list(self.lists)
        index = int(parts.path.split("/")[-2].removeprefix("id"))
        offset = int(urllib.parse.parse_qs(parts.query).get("offset", ["0"])[0])
        tracks = self.lists[names[index]][offset:offset + self.page]
        more = offset + self.page < len(self.lists[names[index]])
        return dict(items=[self.track(t) for t in tracks],
                    next=f"{url.split('?')[0]}?limit=100&offset={offset + self.page}" if more else None)


class Checking(Base):
    def setUp(self):
        super().setUp()
        for name in ("A - One", "B - Two", "C - Three"):
            self.song("Acid", name=name, notes="")
        self.paths = webapp.app_paths()

    def client(self, fake):
        client = spotify.Client("id", self.paths, fetch=fake, sleep=lambda s: None)
        client.access, client.expires = "token", time.monotonic() + 999
        return client

    def want(self, name, *playlists, action="add"):
        self.answer(action, f"library/Acid/{name}.mp3", kind="playlist", song=name, note="\n".join(playlists))

    def run_check(self, fake):
        collection = webapp.Collection(self.paths)
        return spotify.check(self.client(fake), collection)

    def note(self, name):
        answer = self.saved()[f"playlist:library/Acid/{name}.mp3"]
        return answer["action"], answer["note"]

    def test_a_song_that_arrived_comes_off_the_list_and_one_that_didnt_stays(self):
        self.want("A - One", RAVE)
        self.want("B - Two", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["A - One"]}))
        self.assertEqual((result["arrived"], result["missing"]), (1, 1))
        self.assertIn("1 arrived, 1 still not in the playlist", result["message"])
        self.assertEqual(self.note("A - One")[0], "added")
        self.assertEqual(self.note("B - Two"), ("add", RAVE))

    def test_a_song_going_to_two_playlists_can_arrive_in_one(self):
        self.want("A - One", RAVE, OTHER)
        self.run_check(FakeSpotify({RAVE: ["A - One"], OTHER: []}))
        self.assertEqual(self.note("A - One"), ("add", OTHER))

    def test_a_song_marked_added_that_isnt_there_goes_back_on_the_list(self):
        self.want("A - One", RAVE, action="added")
        result = self.run_check(FakeSpotify({RAVE: []}))
        self.assertEqual(self.note("A - One"), ("add", RAVE))
        self.assertEqual(result["missing"], 1)

    def test_a_song_marked_added_that_is_there_stays_added(self):
        self.want("A - One", RAVE, action="added")
        self.run_check(FakeSpotify({RAVE: ["A - One (Original Mix)"]}))
        self.assertEqual(self.note("A - One"), ("added", RAVE))

    def test_spotify_may_still_know_a_song_by_its_old_name(self):
        self.rows[0]["src_artist"], self.rows[0]["src_title"] = "Old Name", "Old Title"
        self.save_log()
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: ["Old Name - Old Title"]}))
        self.assertEqual(self.note("A - One")[0], "added")

    # -- another version of the song is not the song --

    def streamed(self, artist, name, secs):
        return dict(name=name, artists=[artist], secs=secs, local=False, uri="spotify:track:" + "s" * 22)

    def another(self, name, **tags):
        """One more song in the library, about 5 seconds long like the rest."""
        artist, title = name.split(" - ", 1)
        write_mp3(os.path.join(self.lib, "Acid", name + ".mp3"), **{"artist": artist, "title": title, **tags})

    def test_another_version_in_the_playlist_is_not_the_song_arriving(self):
        self.another("D - Four (Club Mix)")
        self.want("D - Four (Club Mix)", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["D - Four"]}))
        self.assertEqual(self.note("D - Four (Club Mix)"), ("add", RAVE))
        self.assertEqual((result["arrived"], result["missing"]), (0, 1))
        self.assertIn("For 1 of those the playlist has what may be another version: see To add.", result["message"])
        self.assertEqual(self.hints(), [dict(file="library/Acid/D - Four (Club Mix).mp3", playlist=RAVE, name="Four", secs=0)])

    def hints(self):
        """What the page shows on the rows under To add."""
        return spotify.status(self.paths)["other_versions"]

    def test_the_original_is_not_the_remix_arriving_either_way_round(self):
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: ["A - One (Somebody Remix)"]}))
        self.assertEqual(self.note("A - One"), ("add", RAVE))
        self.assertEqual([(h["file"], h["name"]) for h in self.hints()], [("library/Acid/A - One.mp3", "One (Somebody Remix)")])

    def test_what_may_be_another_version_is_forgotten_once_the_song_is_there(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One (Somebody Remix)"]})
        self.run_check(fake)
        self.assertEqual(len(self.hints()), 1)
        fake.lists[RAVE].append("A - One")
        result = self.run_check(fake)
        self.assertEqual((self.note("A - One")[0], self.hints()), ("added", []))
        self.assertNotIn("another version", result["message"])

    def test_a_title_with_a_dash_in_it_is_not_a_version_of_its_first_half(self):
        self.another("A - Up - Down")
        self.want("A - Up - Down", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["A - Up", dict(name="Up - Left", artists=["A"], local=True), self.streamed("A", "Up - Left", 5)]}))
        self.assertEqual(self.hints(), [], '"Up" and "Up - Left" are other songs')
        self.assertNotIn("another version", result["message"])
        self.want("A - Up - Down", OTHER, action="added")
        self.run_check(FakeSpotify({OTHER: [dict(name="Up - Left", artists=["A"], local=True)]}))
        self.assertEqual(self.note("A - Up - Down"), ("add", OTHER), "marked added, and nothing like it is there")

    def test_a_streamed_copy_counts_up_to_ten_seconds_off(self):
        self.want("A - One", RAVE)
        self.want("B - Two", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One", 15), self.streamed("B", "Two", 16)]}))
        self.assertEqual((self.note("A - One")[0], self.note("B - Two")[0]), ("added", "add"), "the files are 5.2 seconds long")

    def test_a_local_entry_counts_whatever_length_spotify_remembers(self):
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [dict(name="One", artists=["A"], secs=300, local=True)]}))
        self.assertEqual(self.note("A - One")[0], "added")

    def test_one_of_two_artists_is_not_the_song(self):
        self.another("A & B - Both")
        self.want("A & B - Both", RAVE)
        self.run_check(FakeSpotify({RAVE: ["A - Both"]}))
        self.assertEqual(self.note("A & B - Both")[0], "add")

    def test_the_name_it_was_downloaded_under_is_no_longer_its_name_once_another_file_has_it(self):
        """The remix came down tagged as plain "Four"; the original, "D - Four", is in the library too. That entry in the playlist is the original's."""
        self.another("D - Four")
        self.song("Acid", name="D - Four (Club Mix)", notes="")
        self.rows[-1]["src_artist"], self.rows[-1]["src_title"] = "D", "Four"
        self.save_log()
        self.want("D - Four (Club Mix)", RAVE)
        self.run_check(FakeSpotify({RAVE: ["D - Four"]}))
        self.assertEqual(self.note("D - Four (Club Mix)"), ("add", RAVE))

    def test_marks_that_make_another_letter_make_another_song(self):
        self.another("YMO - ハート")
        self.want("YMO - ハート", RAVE)
        self.run_check(FakeSpotify({RAVE: ["YMO - ハード"]}))
        self.assertEqual(self.note("YMO - ハート")[0], "add")

    def test_the_streamed_song_of_that_name_and_length_has_arrived(self):
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One", 5)]}))
        self.assertEqual(self.note("A - One")[0], "added")

    def test_spotifys_way_of_writing_a_mix_is_the_same_name(self):
        self.another("D - Four (Barn Mix)")
        self.want("D - Four (Barn Mix)", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("D", "Four - Barn Mix", 6)]}))
        self.assertEqual(self.note("D - Four (Barn Mix)")[0], "added")

    def test_a_streamed_song_of_another_length_is_another_cut(self):
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One", 80)]}))
        self.assertEqual(self.note("A - One"), ("add", RAVE))
        self.assertEqual(self.hints(), [dict(file="library/Acid/A - One.mp3", playlist=RAVE, name="One", secs=80)], "its own name, so the page says how long each one is")

    def test_one_marked_added_stays_added_when_another_version_is_what_is_there(self):
        self.want("A - One", RAVE, action="added")
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One - Original Mix", 80)]}))
        self.assertEqual(self.note("A - One"), ("added", RAVE), "Spotify doesn't have every mix: the closest one may be what you meant")

    def test_one_marked_added_goes_back_when_only_some_other_song_is_there(self):
        self.want("A - One", RAVE, action="added")
        self.run_check(FakeSpotify({RAVE: ["A - Uno", "B - One"]}))
        self.assertEqual(self.note("A - One"), ("add", RAVE))

    def test_a_song_named_in_another_alphabet_can_arrive(self):
        self.another("НЮША - Цунами (SWEEQTY Remix)")
        self.want("НЮША - Цунами (SWEEQTY Remix)", RAVE)
        self.run_check(FakeSpotify({RAVE: ["НЮША - Цунами (SWEEQTY Remix)"]}))
        self.assertEqual(self.note("НЮША - Цунами (SWEEQTY Remix)")[0], "added")

    def test_another_song_by_that_artist_in_that_alphabet_is_not_it(self):
        self.another("SEREBRO - Отпусти меня")
        self.want("SEREBRO - Отпусти меня", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["SEREBRO - Я тебя не отдам"]}))
        self.assertEqual(self.note("SEREBRO - Отпусти меня"), ("add", RAVE))
        self.assertNotIn("another version", result["message"])
        self.assertEqual(self.hints(), [])

    def test_the_message_only_counts_them_and_the_rows_say_which(self):
        for n in range(5):
            self.another(f"D - Song {n} (Club Mix)")
            self.want(f"D - Song {n} (Club Mix)", RAVE)
        result = self.run_check(FakeSpotify({RAVE: [f"D - Song {n}" for n in range(5)]}))
        self.assertIn("0 arrived, 5 still not in the playlist. For 5 of those the playlist has what may be another version: see To add.", result["message"])
        self.assertEqual(sorted(h["name"] for h in self.hints()), [f"Song {n}" for n in range(5)])

    def test_a_playlist_that_wasnt_read_this_time_keeps_what_was_said_about_it(self):
        self.want("A - One", RAVE)
        self.want("B - Two", OTHER)
        self.run_check(FakeSpotify({RAVE: ["A - One (Somebody Remix)"], OTHER: ["B - Two (Somebody Remix)"]}))
        self.assertEqual(len(self.hints()), 2)
        self.run_check(FakeSpotify({RAVE: ["A - One (Somebody Remix)"]}))  # the other playlist can't be found this time
        self.assertEqual(sorted(h["playlist"] for h in self.hints()), sorted([RAVE, OTHER]))

    def test_the_playlists_you_are_adding_to_are_read_first(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({"Unrelated": ["X - Y"], RAVE: ["A - One"]})
        self.run_check(fake)
        read = [url for url in fake.calls if "/items?" in url]
        self.assertIn("/playlists/id1/", read[0])
        self.assertIn("/playlists/id0/", read[1])

    def test_long_playlists_are_read_to_the_end(self):
        self.want("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [f"X - {i}" for i in range(250)] + ["A - One"]}))
        self.assertEqual(self.note("A - One")[0], "added")

    def test_the_older_shape_of_spotifys_answer_works_too(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One"]}, shape="track")
        fake.fail["/items?"] = [(404,)]
        self.run_check(fake)
        self.assertEqual(self.note("A - One")[0], "added")
        self.assertTrue(any("/tracks?" in url for url in fake.calls))

    def test_a_playlist_it_cant_find_is_named_and_left_alone(self):
        self.want("A - One", "Renamed")
        result = self.run_check(FakeSpotify({RAVE: []}))
        self.assertIn("Couldn't find on Spotify: Renamed", result["message"])
        self.assertEqual(self.note("A - One"), ("add", "Renamed"))

    def test_with_nothing_to_add_it_still_looks_for_what_to_remove(self):
        result = self.run_check(FakeSpotify({RAVE: ["Gone - Song"]}))
        self.assertIn("1 to remove in 1 playlist", result["message"])
        self.assertNotIn("arrived", result["message"])

    def test_a_long_wait_stops_the_check_is_remembered_and_keeps_what_it_learned(self):
        self.want("A - One", "A list")
        self.want("B - Two", "B list")
        fake = FakeSpotify({"A list": ["A - One"], "B list": ["B - Two"]})
        fake.fail["/playlists/id1/"] = [(429, dict(Retry_After="3600"))]
        result = self.run_check(fake)
        self.assertIn("asked to wait", result["message"])
        self.assertEqual(self.note("A - One")[0], "added", "what it read before the stop still counts")
        self.assertEqual(self.note("B - Two"), ("add", "B list"))
        self.assertTrue(spotify.status(self.paths)["wait_until"])
        calls = len(fake.calls)
        again = self.run_check(fake)
        self.assertIn("Try again after that", again["message"])
        self.assertEqual(len(fake.calls), calls, "it doesn't ask Spotify again while it's been told to wait")

    def test_a_short_wait_is_waited_out(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One"]})
        fake.fail["/playlists/id0/"] = [(429, dict(Retry_After="2"))]
        waits = []
        client = self.client(fake)
        client.sleep = waits.append
        spotify.check(client, webapp.Collection(self.paths))
        self.assertIn(3, waits)
        self.assertEqual(self.note("A - One")[0], "added")

    def test_an_expired_sign_in_is_renewed_once(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One"]})
        fake.fail["/me?"] = []
        del fake.fail["/me?"]
        client = self.client(fake)
        client.refresh_token, client.expires = "refresh", 0

        def fetch(url, headers=None, data=None):
            if "/api/token" in url:
                self.assertIn(b"grant_type=refresh_token", data)
                return dict(access_token="new", expires_in=3600)
            self.assertEqual(headers["Authorization"], "Bearer new")
            return fake(url, headers, data)
        client.fetch = fetch
        spotify.check(client, webapp.Collection(self.paths))
        self.assertEqual(self.note("A - One")[0], "added")

    def test_the_token_is_never_saved(self):
        self.want("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One"]})
        client = self.client(fake)
        client.access, client.refresh_token = "SECRET-ACCESS", "SECRET-REFRESH"
        spotify.check(client, webapp.Collection(self.paths))
        for path, digest in self.tree().items():
            if digest:
                with open(path, "rb") as f:
                    self.assertNotIn(b"SECRET-", f.read(), path)

    def test_status_says_when_it_is_set_up(self):
        self.assertFalse(spotify.status(self.paths)["ready"])
        with open(self.cfg, "a", encoding="utf-8") as f:
            f.write('[spotify]\nclient_id = "abc"\n')
        config.load(self.cfg)
        self.assertTrue(spotify.status(self.paths)["ready"])

    def test_an_old_wait_doesnt_count(self):
        spotify.write_state(self.paths, wait_until=(datetime.datetime.now() - datetime.timedelta(minutes=1)).isoformat())
        self.assertEqual(spotify.status(self.paths)["wait_until"], "")


class TakingOut(Checking):
    """Songs you said to take out of a Spotify playlist. Spotify doesn't let apps remove local files, so they wait on your to-do until a check finds them gone."""

    def unwant(self, name, *playlists):
        self.answer("remove", f"library/Acid/{name}.mp3", kind="unlist", song=name, note="\n".join(playlists))

    def left(self, name):
        answer = self.saved().get(f"unlist:library/Acid/{name}.mp3")
        return answer and answer["note"]

    def test_one_taken_out_comes_off_the_list_and_one_still_there_stays(self):
        self.unwant("A - One", RAVE)
        self.unwant("B - Two", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["B - Two"]}))
        self.assertIsNone(self.left("A - One"))
        self.assertEqual(self.left("B - Two"), RAVE)
        self.assertIn("1 taken out, 1 still to take out", result["message"])
        self.assertNotIn("arrived", result["message"])

    def test_out_of_one_playlist_but_still_in_another(self):
        self.unwant("A - One", RAVE, OTHER)
        self.run_check(FakeSpotify({RAVE: ["A - One"], OTHER: []}))
        self.assertEqual(self.left("A - One"), RAVE)

    def test_a_playlist_it_cant_find_is_left_alone(self):
        self.unwant("A - One", "Renamed")
        self.run_check(FakeSpotify({RAVE: []}))
        self.assertEqual(self.left("A - One"), "Renamed")

    def test_taking_out_of_one_and_adding_to_another_are_kept_apart(self):
        self.want("A - One", OTHER)
        self.unwant("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [], OTHER: ["A - One"]}))
        self.assertIsNone(self.left("A - One"))
        self.assertEqual(self.note("A - One")[0], "added")

    def test_another_version_staying_in_the_playlist_does_not_keep_it_waiting(self):
        self.unwant("A - One", RAVE)
        result = self.run_check(FakeSpotify({RAVE: ["A - One (Somebody Remix)"]}))
        self.assertIsNone(self.left("A - One"), "the one you took out is gone: the remix is another song")
        self.assertIn("1 taken out, 0 still to take out", result["message"])

    def test_spotifys_own_copy_of_it_still_there_keeps_it_waiting(self):
        self.another("D - Four (Barn Mix)")
        self.unwant("D - Four (Barn Mix)", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("D", "Four - Barn Mix", 5)]}))
        self.assertEqual(self.left("D - Four (Barn Mix)"), RAVE, "written Spotify's way, but the same song at the same length")

    def test_spotifys_copy_written_another_way_keeps_it_waiting_too(self):
        """A take-out called done can't be undone, so anything that may still be this very recording keeps it on the list."""
        for entry in (dict(name="One", artists=["A", "B"], secs=5, local=False), self.streamed("A", "One (feat. B)", 5), self.streamed("A", "One (Remastered 2011)", 6),
                      self.streamed("A", "One - 2011 Remaster", 5), self.streamed("A", "One - Original Mix", 5)):
            with self.subTest(entry["name"]):
                self.unwant("A - One", RAVE)
                result = self.run_check(FakeSpotify({RAVE: [entry]}))
                self.assertEqual(self.left("A - One"), RAVE)
                self.assertIn("0 taken out, 1 still to take out", result["message"])

    def test_spotifys_copy_at_quite_another_length_is_another_cut_and_does_not(self):
        self.unwant("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One (Extended Mix)", 300), dict(name="One", artists=["A", "B"], secs=200, local=False)]}))
        self.assertIsNone(self.left("A - One"))

    def test_with_a_length_unknown_it_keeps_waiting(self):
        self.unwant("A - One", RAVE)
        self.run_check(FakeSpotify({RAVE: [self.streamed("A", "One", 0)]}))
        self.assertEqual(self.left("A - One"), RAVE, "the same name, and nothing to say it's another cut")

    def test_a_file_renamed_since_you_asked_is_still_looked_for_under_its_old_name(self):
        self.unwant("A - One", RAVE)
        write_mp3(os.path.join(self.lib, "Acid", "A - One.mp3"), artist="A", title="One (Original Mix)")  # tidied up while it waited: Spotify still lists it as it last read it
        self.run_check(FakeSpotify({RAVE: ["A - One"]}))
        self.assertEqual(self.left("A - One"), RAVE)
        self.run_check(FakeSpotify({RAVE: []}))
        self.assertIsNone(self.left("A - One"))

    def test_checking_never_takes_anything_out_itself(self):
        self.unwant("A - One", RAVE)
        fake = FakeSpotify({RAVE: ["A - One"]})
        self.run_check(fake)
        self.assertEqual((fake.puts, fake.posts), ([], []))
        self.assertEqual(self.left("A - One"), RAVE)

    def test_the_app_takes_the_answer(self):
        collection = webapp.Collection(self.paths)
        collection.refresh()
        song = next(s for s in collection.songs.values() if s["key"] == "library/Acid/A - One.mp3")
        self.assertIsNone(collection.decide(dict(id=song["id"], kind="unlist", action="remove", note=RAVE)))
        self.assertEqual(self.left("A - One"), RAVE)
        self.assertIsNone(collection.decide(dict(id=song["id"], kind="unlist", action=None)))
        self.assertIsNone(self.left("A - One"))


class ToRemove(Checking):
    def one(self, **extra):  # the file every test library has: "A - One", album "Album", about 5 seconds
        return {**dict(name="One", artists=["A"], album="Album", secs=5), **extra}

    def listed(self):
        return spotify.status(self.paths)["to_remove"]

    def flagged(self, *entries):
        self.run_check(FakeSpotify({RAVE: list(entries)}))
        return [(s["pos"], s["why"]) for r in self.listed() for s in r["songs"]]

    def test_an_entry_with_no_file_is_listed_with_where_it_is(self):
        self.run_check(FakeSpotify({RAVE: [self.one(), dict(name="Song", artists=["Gone"], album="Old", secs=300)]}))
        self.assertEqual(self.listed(), [dict(playlist=RAVE, count=1, at_end=True, songs=[dict(pos=2, song="Gone - Song", why="no file")], odd=[])])

    def test_an_entry_with_a_file_is_not_listed(self):
        result = self.run_check(FakeSpotify({RAVE: [self.one()]}))
        self.assertEqual(self.listed(), [])
        self.assertIn("Nothing to remove", result["message"])

    def test_capitals_and_punctuation_do_not_matter(self):
        self.assertEqual(self.flagged(self.one(name="ONE!", artists=["a"], album="ALBUM")), [])

    def test_a_length_a_little_off_is_the_same_file(self):
        self.assertEqual(self.flagged(self.one(secs=7)), [])

    def test_a_length_far_off_is_only_worth_a_look(self):
        result = self.run_check(FakeSpotify({RAVE: [self.one(secs=40)]}))
        row = self.listed()[0]
        self.assertEqual((row["count"], row["songs"], [o["why"] for o in row["odd"]]), (0, [], ["length differs"]))
        self.assertIn("Nothing to remove", result["message"], "it may well still play: nothing says to remove it")

    def test_worth_a_look_does_not_count_towards_what_to_remove(self):
        gone = dict(name="X", artists=["Gone"])
        result = self.run_check(FakeSpotify({RAVE: [self.one(secs=40), gone], OTHER: [self.one(secs=40)]}))
        self.assertIn("1 to remove in 1 playlist.", result["message"])
        row = next(r for r in self.listed() if r["playlist"] == RAVE)
        self.assertTrue(row["at_end"], "the entry that's only worth a look doesn't count")

    def test_a_changed_album_is_not_the_same_entry(self):
        self.assertEqual(self.flagged(self.one(album="Old Album")), [(1, "no file")])

    def test_streamed_songs_are_never_listed(self):
        self.assertEqual(self.flagged(dict(name="Hit", artists=["Star"], album="X", secs=200, local=False)), [])

    def test_a_second_copy_is_listed_and_the_first_is_not(self):
        self.assertEqual(self.flagged(self.one(), dict(name="Other", artists=["S"], local=False), self.one()), [(3, "second copy")])

    def test_entries_spread_through_a_playlist_are_not_called_the_last_ones(self):
        self.run_check(FakeSpotify({RAVE: [dict(name="X", artists=["Gone"]), self.one()]}))
        self.assertFalse(self.listed()[0]["at_end"])

    def test_a_file_in_review_counts(self):
        write_mp3(os.path.join(self.review, "Rev - Song.mp3"), artist="Rev", title="Song", album="")
        self.assertEqual(self.flagged(dict(name="Song", artists=["Rev"], album="", secs=5)), [])

    def test_a_file_with_no_tags_is_listed_under_its_file_name(self):
        with open(os.path.join(self.review, "Laura - Waves.mp3"), "wb") as f:
            f.write(FRAME * 200)
        self.assertEqual(self.flagged(dict(name="Laura - Waves", artists=[""], album="", secs=5)), [])

    def test_a_file_with_tags_does_not_answer_for_its_old_name(self):
        write_mp3(os.path.join(self.lib, "Acid", "Laura - Haunted.mp3"), artist="Laura", title="Haunted", album="")
        self.assertEqual(self.flagged(dict(name="Laura - Haunted", artists=[""], album="", secs=5)), [(1, "no file")])

    def test_spotifys_stand_in_for_an_empty_artist_is_understood(self):
        write_mp3(os.path.join(self.lib, "Acid", "Vogel.mp3"), artist="", title="Vogel", album="")
        self.assertEqual(self.flagged(dict(name="Vogel", artists=["Unknown Artist"], album="", secs=5)), [])

    def test_an_entry_with_no_name_is_never_listed(self):
        self.assertEqual(self.flagged(dict(name="(Unknown)", artists=[""], album="", secs=410)), [])

    def test_a_playlist_that_has_not_changed_is_not_asked_for_again(self):
        fake = FakeSpotify({RAVE: [dict(name="X", artists=["Gone"])]}, snapshots={RAVE: "v1"})
        self.run_check(fake)
        fake.calls.clear()
        self.run_check(fake)
        self.assertFalse([url for url in fake.calls if "/items?" in url])
        self.assertEqual(self.listed()[0]["count"], 1, "the list still comes from what it read before")

    def test_a_playlist_that_changed_is_read_again_and_the_list_shrinks(self):
        fake = FakeSpotify({RAVE: [dict(name="X", artists=["Gone"])]}, snapshots={RAVE: "v1"})
        self.run_check(fake)
        fake.lists[RAVE], fake.snapshots[RAVE] = [self.one()], "v2"
        self.run_check(fake)
        self.assertEqual(self.listed(), [])

    def test_a_song_added_to_a_file_later_stops_being_listed_without_asking_spotify(self):
        fake = FakeSpotify({RAVE: [dict(name="Later", artists=["New"], album="", secs=5)]}, snapshots={RAVE: "v1"})
        self.run_check(fake)
        self.assertEqual(len(self.listed()), 1)
        write_mp3(os.path.join(self.lib, "Acid", "New - Later.mp3"), artist="New", title="Later", album="")
        fake.calls.clear()
        self.run_check(fake)
        self.assertEqual(self.listed(), [])
        self.assertFalse([url for url in fake.calls if "/items?" in url])

    def test_stopping_partway_keeps_the_rest_of_the_list(self):
        gone = dict(name="X", artists=["Gone"])
        self.run_check(FakeSpotify({"A list": [gone], "B list": [gone]}))
        self.assertEqual([r["playlist"] for r in self.listed()], ["A list", "B list"])
        fake = FakeSpotify({"A list": [self.one()], "B list": [gone]})
        fake.fail["/playlists/id1/"] = [(429, dict(Retry_After="3600"))]
        self.run_check(fake)
        self.assertEqual([r["playlist"] for r in self.listed()], ["B list"], "A list is read and clean; B list wasn't read, so it stays")

    def test_with_the_library_gone_nothing_is_called_missing(self):
        gone = dict(name="X", artists=["Gone"])
        self.run_check(FakeSpotify({RAVE: [gone, self.one()]}))
        before = self.listed()
        os.rename(self.lib, self.lib + " away")
        self.addCleanup(os.rename, self.lib + " away", self.lib)
        self.run_check(FakeSpotify({RAVE: [gone, self.one()]}))
        self.assertEqual(self.listed(), before)

    def test_a_broken_memory_of_the_playlists_only_costs_a_new_read(self):
        with open(spotify.cache_path(self.paths), "w", encoding="utf-8") as f:
            f.write("{ not json")
        self.assertEqual(self.flagged(dict(name="X", artists=["Gone"])), [(1, "no file")])


class MovingToTheBottom(Checking):
    GONE = dict(name="X", artists=["Gone"])

    def one(self, **extra):
        return {**dict(name="One", artists=["A"], album="Album", secs=5), **extra}

    def listed(self):
        return spotify.status(self.paths)["to_remove"]

    def client(self, fake):
        client = super().client(fake)
        client.scope = spotify.TO_CHANGE  # signed in already: sign-in itself is tested below
        return client

    def press(self, fake):
        return spotify.gather(self.client(fake), webapp.Collection(self.paths))

    def order(self, fake, name=RAVE):
        return [t["name"] if isinstance(t, dict) else t for t in fake.lists[name]]

    def spread(self):
        fake = FakeSpotify({RAVE: [self.one(), dict(self.GONE, name="G1"), dict(name="Keep", artists=["S"], local=False), dict(self.GONE, name="G2"), dict(self.GONE, name="G3"), dict(name="Stay", artists=["S"], local=False)]}, snapshots={RAVE: "v1"})
        self.run_check(fake)
        return fake

    def test_the_steps_for_a_set_of_positions(self):
        self.assertEqual(spotify._moves([2, 3, 7], 10), [(1, 2), (4, 1)])
        self.assertEqual(spotify._moves([9, 10], 10), [])
        self.assertEqual(spotify._moves([2, 10], 10), [(1, 1)])
        self.assertEqual(spotify._moves([], 10), [])

    def test_they_end_up_at_the_bottom_and_the_rest_keep_their_order(self):
        fake = self.spread()
        result = self.press(fake)
        self.assertEqual(self.order(fake), ["One", "Keep", "Stay", "G1", "G2", "G3"])
        self.assertEqual(result["moved"], 3)
        self.assertIn("Moved 3 entries to the bottom of 1 playlist", result["message"])

    def test_the_list_then_shows_where_they_really_are(self):
        fake = self.spread()
        self.assertFalse(self.listed()[0]["at_end"])
        self.press(fake)
        row = self.listed()[0]
        self.assertTrue(row["at_end"])
        self.assertEqual([s["pos"] for s in row["songs"]], [4, 5, 6])

    def test_each_change_says_which_version_of_the_playlist_it_is_for(self):
        fake = self.spread()
        self.press(fake)
        self.assertEqual(fake.puts[0][1]["snapshot_id"], "v1")
        self.assertEqual(fake.puts[1][1]["snapshot_id"], "after1")

    def test_positions_are_read_fresh_not_taken_from_the_last_check(self):
        fake = self.spread()
        del fake.lists[RAVE][0]  # you changed the playlist since the check
        fake.snapshots[RAVE] = "v2"
        self.press(fake)
        self.assertEqual(self.order(fake), ["Keep", "Stay", "G1", "G2", "G3"])

    def test_a_playlist_already_in_order_is_left_alone(self):
        fake = FakeSpotify({RAVE: [self.one(), self.GONE]})
        self.run_check(fake)
        result = self.press(fake)
        self.assertEqual((fake.puts, result["message"]), ([], "They're already at the bottom."))

    def test_entries_only_worth_a_look_are_not_moved(self):
        fake = FakeSpotify({RAVE: [self.GONE, self.one(), self.one(name="Odd", secs=40)]})
        self.song("Acid", name="A - Odd", notes="")
        self.run_check(fake)
        self.press(fake)
        self.assertEqual(self.order(fake), ["One", "Odd", "X"])

    def test_nothing_is_ever_removed(self):
        fake = self.spread()
        before = sorted(self.order(fake))
        self.press(fake)
        self.assertEqual(sorted(self.order(fake)), before)

    def test_afterwards_a_check_does_not_need_to_read_it_again(self):
        fake = self.spread()
        self.press(fake)
        fake.calls.clear()
        self.run_check(fake)
        self.assertFalse([url for url in fake.calls if "/items?" in url])

    def test_a_long_wait_stops_it_is_remembered_and_keeps_the_list(self):
        fake = self.spread()
        fake.fail["/playlists/id0/items?"] = [(429, dict(Retry_After="3600"))]
        result = self.press(fake)
        self.assertIn("asked to wait", result["message"])
        self.assertEqual(fake.puts, [])
        self.assertTrue(spotify.status(self.paths)["wait_until"])
        self.assertEqual(self.listed()[0]["count"], 3)

    def test_it_will_not_start_during_a_wait(self):
        fake = self.spread()
        spotify.write_state(self.paths, wait_until=(datetime.datetime.now() + datetime.timedelta(hours=1)).isoformat())
        fake.calls.clear()
        self.assertIn("Try again after that", self.press(fake)["message"])
        self.assertEqual(fake.calls, [])

    def test_a_lost_answer_is_not_sent_twice(self):
        fake = self.spread()
        sent = []

        def fetch(url, headers=None, data=None, method=None):
            if method == "PUT":
                sent.append(url)
                raise OSError("connection reset")
            return fake(url, headers, data, method)
        client = self.client(fake)
        client.fetch = fetch
        result = spotify.gather(client, webapp.Collection(self.paths))
        self.assertEqual(len(sent), 1)
        self.assertIn("Press the button again", result["message"])

    def test_a_playlist_spotify_wont_let_change_does_not_stop_the_others(self):
        gone = dict(self.GONE)
        fake = FakeSpotify({"A list": [gone, self.one()], "B list": [gone, self.one()]})
        self.run_check(fake)

        def fetch(url, headers=None, data=None, method=None):
            if method == "PUT" and "/playlists/id0/" in url:
                raise http_error(url, 403)
            return fake(url, headers, data, method)
        client = self.client(fake)
        client.fetch = fetch
        result = spotify.gather(client, webapp.Collection(self.paths))
        self.assertIn("wouldn't let these be changed: A list", result["message"])
        self.assertEqual(self.order(fake, "B list"), ["One", "X"])

    def test_with_the_library_gone_nothing_is_moved(self):
        fake = self.spread()
        os.rename(self.lib, self.lib + " away")
        self.addCleanup(os.rename, self.lib + " away", self.lib)
        result = self.press(fake)
        self.assertEqual(fake.puts, [])
        self.assertIn("can't be found", result["message"])

    def test_a_playlist_renamed_since_the_check_is_skipped(self):
        fake = self.spread()
        fake.lists = {"Renamed": fake.lists[RAVE]}
        self.assertEqual(self.press(fake)["moved"], 0)

    def test_checking_never_asks_to_change_anything(self):
        client = spotify.Client("id", self.paths, fetch=FakeSpotify({}), sleep=lambda s: None)
        self.assertNotIn("modify", client.scope)

    def test_the_bigger_permission_is_only_asked_for_when_moving(self):
        client = spotify.Client("id", self.paths, fetch=FakeSpotify({}), sleep=lambda s: None)
        client.access, client.refresh_token, client.expires = "read", "refresh", time.monotonic() + 999
        client.allow_changes()
        self.assertIn("playlist-modify-private", client.scope)
        self.assertIsNone(client.access, "a permission to read can't be widened: it takes a new sign-in")
        self.assertIsNone(client.refresh_token)

    def test_turning_down_the_bigger_permission_moves_nothing_and_goes_back_to_reading(self):
        fake = self.spread()
        client = spotify.Client("id", self.paths, fetch=fake, sleep=lambda s: None)
        with mock.patch.object(client, "sign_in", side_effect=spotify.Stop("Spotify sign-in wasn't finished, so nothing was checked.")):
            result = spotify.gather(client, webapp.Collection(self.paths))
        self.assertEqual(fake.puts, [])
        self.assertIn("wasn't finished", result["message"])
        self.assertEqual(client.scope, spotify.SCOPES)
        self.assertEqual(self.listed()[0]["count"], 3, "the list is still there")


def on_spotify(name="Song", artist="Rev", secs=5, track_id="abcdefghij0123456789ab", album="The Album", playable=True):
    return dict(id=track_id, uri=f"spotify:track:{track_id}", name=name, artists=[dict(name=artist)], album=dict(name=album, release_date="1996-01-01"), duration_ms=secs * 1000, is_playable=playable)


class MightBeOnSpotify(Checking):
    def waiting_song(self, name="Rev - Song", folder=None, **tags):
        return write_mp3(os.path.join(folder or self.review, name + ".mp3"), **{"artist": "Rev", "title": "Song", "album": "", **tags})

    def hit(self, key="review/Rev - Song.mp3"):
        return (spotify.read_hits(self.paths).get(key) or {}).get("hit")

    def check_with(self, *catalog):
        fake = FakeSpotify({RAVE: []}, catalog=list(catalog))
        self.result = self.run_check(fake)
        return fake

    def test_a_close_match_is_suggested_and_the_page_shows_it(self):
        self.waiting_song()
        self.check_with(on_spotify())
        self.assertIn("might be on Spotify", self.result["message"])
        collection = webapp.Collection(self.paths)
        collection.refresh()
        song = next(s for s in collection.songs.values() if s["area"] == "review")
        check = next(c for c in song["checks"] if c["kind"] == "spotify")
        self.assertIn('Spotify has "Song" by Rev, from The Album (1996)', check["why"])
        self.assertEqual(check["link"], "https://open.spotify.com/track/abcdefghij0123456789ab")

    def test_another_artist_is_not_suggested(self):
        self.waiting_song()
        self.check_with(on_spotify(artist="Somebody Else"))
        self.assertIsNone(self.hit())

    def test_a_length_far_off_is_not_suggested(self):
        self.waiting_song()
        self.check_with(on_spotify(secs=40))
        self.assertIsNone(self.hit())

    def test_a_length_a_few_seconds_off_is(self):
        self.waiting_song()
        self.check_with(on_spotify(secs=13))
        self.assertEqual(self.hit()["gap"], -8)

    def test_a_song_that_wont_play_here_is_not_suggested(self):
        self.waiting_song()
        self.check_with(on_spotify(playable=False))
        self.assertIsNone(self.hit())

    def test_the_mix_your_file_names_has_to_match(self):
        self.waiting_song("Rev - Song (Acid Mix)", title="Song (Acid Mix)")
        self.check_with(on_spotify(name="Song - Dub Mix"))
        self.assertIsNone(self.hit("review/Rev - Song (Acid Mix).mp3"))

    def test_versions_written_with_several_brackets_are_understood(self):
        self.waiting_song("Rev - Song (Instrumental Mix)", title="Song (Instrumental Mix)")
        self.check_with(on_spotify(name="Song (The Anthem) (feat. Wolfpack) - Instrumental Mix"))
        self.assertTrue(self.hit("review/Rev - Song (Instrumental Mix).mp3"))

    def test_spotifys_way_of_writing_a_mix_is_understood(self):
        self.waiting_song("Rev - Song (Acid Mix)", title="Song (Acid Mix)")
        self.check_with(on_spotify(name="Song - Acid Mix"))
        self.assertEqual(self.hit("review/Rev - Song (Acid Mix).mp3")["name"], "Song - Acid Mix")

    def test_with_no_mix_named_the_plain_version_comes_first(self):
        self.waiting_song()
        self.check_with(on_spotify(name="Song - Original Mix", secs=5, track_id="zzzzzzzzzz0123456789zz"), on_spotify(name="Song", secs=9))
        self.assertEqual(self.hit()["name"], "Song")

    def test_a_song_with_a_year_at_its_end_is_looked_for_without_it_too(self):
        self.waiting_song("Rev - Song 1995", title="Song 1995")
        fake = self.check_with(on_spotify(name="Song"))
        self.assertEqual(self.hit("review/Rev - Song 1995.mp3")["name"], "Song")
        self.assertEqual(fake.searches, ["track:Song 1995 artist:Rev", "Song 1995 Rev", "track:Song artist:Rev"])

    def test_a_song_called_by_a_year_is_found_under_its_whole_name(self):
        self.waiting_song("Rev - Song 1995", title="Song 1995")
        fake = self.check_with(on_spotify(name="Song 1995"))
        self.assertEqual(self.hit("review/Rev - Song 1995.mp3")["name"], "Song 1995")
        self.assertEqual(len(fake.searches), 1)

    def test_songs_in_the_library_are_not_searched_for(self):
        fake = self.check_with()
        self.assertEqual(fake.searches, [])

    def test_each_song_is_only_searched_for_once(self):
        self.waiting_song()
        fake = FakeSpotify({RAVE: []}, catalog=[on_spotify()])
        self.run_check(fake)
        self.assertEqual(len(fake.searches), 1)
        self.run_check(fake)
        self.assertEqual(len(fake.searches), 1)

    def test_a_song_spotify_lacks_is_looked_for_again_only_after_a_while(self):
        self.waiting_song()
        fake = FakeSpotify({RAVE: []})
        self.run_check(fake)
        self.assertEqual(len(fake.searches), 2, "both ways of asking")
        self.run_check(fake)
        self.assertEqual(len(fake.searches), 2)
        hits = spotify.read_hits(self.paths)
        hits["review/Rev - Song.mp3"]["when"] = "2020-01-01"
        spotify._write_hits(self.paths, hits)
        self.run_check(fake)
        self.assertEqual(len(fake.searches), 4)

    def test_saying_not_the_same_stops_it_asking(self):
        self.waiting_song()
        self.answer("keep", "review/Rev - Song.mp3", kind="spotify")
        fake = self.check_with(on_spotify())
        self.assertEqual(fake.searches, [])

    def test_a_long_mix_is_not_searched_for(self):
        path = self.waiting_song()
        with mock.patch.object(spotify, "LONGEST_SONG_S", 1):
            fake = self.check_with(on_spotify())
        self.assertEqual(fake.searches, [])
        self.assertTrue(os.path.exists(path))

    def test_one_press_only_asks_so_much(self):
        self.waiting_song("Rev - One", title="One")
        self.waiting_song("Rev - Two", title="Two")
        with mock.patch.object(spotify, "SEARCHES_PER_CHECK", 1):
            fake = FakeSpotify({RAVE: []})
            self.run_check(fake)
            self.assertEqual(len(spotify.read_hits(self.paths)), 1)
            self.run_check(fake)
            self.assertEqual(len(spotify.read_hits(self.paths)), 2, "the rest get their turn next time")

    def test_a_song_that_stopped_waiting_is_forgotten(self):
        path = self.waiting_song()
        self.check_with(on_spotify())
        os.remove(path)
        self.check_with(on_spotify())
        self.assertEqual(spotify.read_hits(self.paths), {})

    def test_a_long_wait_keeps_what_was_found(self):
        self.waiting_song("Rev - One", title="One")
        self.waiting_song("Rev - Two", title="Two")
        fake = FakeSpotify({RAVE: []}, catalog=[on_spotify(name="One")])
        real, count = fake.__call__, []

        def fetch(url, headers=None, data=None, method=None):
            if "/search" in url:
                count.append(url)
                if len(count) == 2:
                    raise http_error(url, 429, Retry_After="3600")
            return real(url, headers, data, method)
        client = self.client(fake)
        client.fetch = fetch
        result = spotify.check(client, webapp.Collection(self.paths))
        self.assertIn("asked to wait", result["message"])
        self.assertTrue(self.hit("review/Rev - One.mp3"))

    def test_the_search_only_asks_to_read(self):
        self.assertNotIn("modify", spotify.SCOPES)


class AddingTheStreamedSong(MightBeOnSpotify):
    URI = "spotify:track:abcdefghij0123456789ab"

    def setUp(self):
        super().setUp()
        self.file = self.waiting_song()
        self.fake = FakeSpotify({RAVE: [], OTHER: []}, catalog=[on_spotify()])
        self.run_check(self.fake)
        self.collection = webapp.Collection(self.paths)
        self.collection.refresh()
        self.song_id = next(s["id"] for s in self.collection.songs.values() if s["area"] == "review")

    def add(self, *names, fake=None, client=None):
        client = client or self.client(fake or self.fake)
        client.scope = spotify.TO_CHANGE
        return spotify.add_streamed(client, self.collection, self.song_id, list(names))

    def test_it_goes_into_the_playlists_you_chose(self):
        result = self.add(RAVE, OTHER)
        self.assertEqual(self.fake.posts, [(RAVE, [self.URI]), (OTHER, [self.URI])])
        self.assertIn(f"Added to {RAVE}, {OTHER}", result["message"])

    def test_it_is_remembered_and_your_file_is_marked_as_not_needed(self):
        self.add(RAVE)
        saved = self.saved()
        self.assertEqual((saved["spotify:review/Rev - Song.mp3"]["action"], saved["spotify:review/Rev - Song.mp3"]["note"]), ("stream", RAVE))
        self.assertEqual((saved["waiting:review/Rev - Song.mp3"]["action"], saved["waiting:review/Rev - Song.mp3"]["note"]), ("drop", "On Spotify"))

    def test_your_file_is_not_touched(self):
        with open(self.file, "rb") as f:
            before = f.read()
        self.add(RAVE)
        with open(self.file, "rb") as f:
            self.assertEqual(f.read(), before)

    def test_an_answer_you_already_gave_about_the_file_stays(self):
        self.answer("keep", "review/Rev - Song.mp3", kind="waiting", note="mine")
        self.add(RAVE)
        self.assertEqual(self.saved()["waiting:review/Rev - Song.mp3"]["action"], "keep")

    def test_it_is_not_added_twice(self):
        self.fake.lists[RAVE].append(dict(name="Song", artists=["Rev"], uri=self.URI, local=False))
        result = self.add(RAVE)
        self.assertEqual(self.fake.posts, [])
        self.assertIn(f"Already in {RAVE}", result["message"])
        self.assertIn("spotify:review/Rev - Song.mp3", self.saved())

    def test_a_playlist_that_is_gone_is_named(self):
        self.assertIn("Couldn't find on Spotify: Nope", self.add("Nope")["message"])
        self.assertNotIn("spotify:review/Rev - Song.mp3", self.saved())

    def test_a_playlist_spotify_wont_let_change_does_not_stop_the_others(self):
        real = self.fake.__call__

        def fetch(url, headers=None, data=None, method=None):
            if method == "POST" and "/playlists/id0/" in url:
                raise http_error(url, 403)
            return real(url, headers, data, method)
        client = self.client(self.fake)
        client.fetch = fetch
        result = self.add(RAVE, OTHER, client=client)
        self.assertIn("wouldn't let these be changed", result["message"])
        self.assertEqual(self.fake.posts, [(OTHER, [self.URI])])

    def test_a_lost_answer_is_not_sent_twice_and_nothing_is_recorded(self):
        sent, real = [], self.fake.__call__

        def fetch(url, headers=None, data=None, method=None):
            if method == "POST":
                sent.append(url)
                raise OSError("connection reset")
            return real(url, headers, data, method)
        client = self.client(self.fake)
        client.fetch = fetch
        result = self.add(RAVE, client=client)
        self.assertEqual(len(sent), 1)
        self.assertIn("Press the button again", result["message"])
        self.assertNotIn("spotify:review/Rev - Song.mp3", self.saved())

    def test_it_asks_for_permission_to_change_playlists(self):
        client = spotify.Client("id", self.paths, fetch=self.fake, sleep=lambda s: None)
        with mock.patch.object(client, "sign_in", side_effect=spotify.Stop("Spotify sign-in wasn't finished, so nothing was checked.")):
            result = spotify.add_streamed(client, self.collection, self.song_id, [RAVE])
        self.assertIn("wasn't finished", result["message"])
        self.assertEqual((client.scope, self.fake.posts), (spotify.SCOPES, []))

    def test_a_match_that_has_gone_says_so(self):
        spotify._write_hits(self.paths, {})
        self.assertIn("Press Check Spotify again", self.add(RAVE)["message"])

    def test_it_will_not_start_during_a_wait(self):
        spotify.write_state(self.paths, wait_until=(datetime.datetime.now() + datetime.timedelta(hours=1)).isoformat())
        self.assertIn("Try again after that", self.add(RAVE)["message"])
        self.assertEqual(self.fake.posts, [])

    def test_apply_has_nothing_to_do_about_it(self):
        self.add(RAVE)
        code, out = self.run_apply()
        self.assertNotIn("For your AI app", out)

    # the search tests belong to the class above
    test_a_close_match_is_suggested_and_the_page_shows_it = None
    test_another_artist_is_not_suggested = None
    test_a_length_far_off_is_not_suggested = None
    test_a_length_a_few_seconds_off_is = None
    test_a_song_that_wont_play_here_is_not_suggested = None
    test_the_mix_your_file_names_has_to_match = None
    test_spotifys_way_of_writing_a_mix_is_understood = None
    test_with_no_mix_named_the_plain_version_comes_first = None
    test_songs_in_the_library_are_not_searched_for = None
    test_each_song_is_only_searched_for_once = None
    test_a_song_spotify_lacks_is_looked_for_again_only_after_a_while = None
    test_saying_not_the_same_stops_it_asking = None
    test_a_long_mix_is_not_searched_for = None
    test_one_press_only_asks_so_much = None
    test_a_song_that_stopped_waiting_is_forgotten = None
    test_a_long_wait_keeps_what_was_found = None
    test_the_search_only_asks_to_read = None


class SendingALocalPlaylist(Checking):
    NAME = "Night Bus"

    def setUp(self):
        super().setUp()
        self.collection = webapp.Collection(self.paths)
        self.collection.refresh()

    def client(self, fake):
        client = super().client(fake)
        client.scope = spotify.TO_CHANGE  # signed in already: sign-in itself is tested below
        return client

    def make(self, *names, list_name=None):
        by_file = {s["file"]: s["id"] for s in self.collection.songs.values()}
        return own_playlists.handle(self.collection, "/api/playlists/new", dict(name=list_name or self.NAME, ids=[by_file[f"{n}.mp3"] for n in names]))["made"]["id"]

    def send(self, fake, list_id, client=None):
        return spotify.send_playlist(client or self.client(fake), self.collection, list_id)

    def test_it_makes_a_private_playlist_of_that_name(self):
        fake = FakeSpotify({})
        result = self.send(fake, self.make("A - One"))
        self.assertEqual(fake.made, [dict(name=self.NAME, public=False)])
        self.assertTrue(result["made"])
        self.assertIn(f"Made {self.NAME} on Spotify", result["message"])

    def test_it_asks_for_the_playlist_the_current_way(self):
        fake = FakeSpotify({})
        self.send(fake, self.make("A - One"))
        self.assertTrue(any(c.endswith("/v1/me/playlists") for c in fake.calls))

    def test_its_songs_wait_on_the_to_do(self):
        result = self.send(FakeSpotify({}), self.make("A - One", "B - Two"))
        self.assertEqual(result["sent"], 2)
        self.assertEqual(self.note("A - One"), ("add", self.NAME))
        self.assertEqual(self.note("B - Two"), ("add", self.NAME))
        self.assertIn("2 songs are on your Spotify to-do", result["message"])

    def test_another_version_already_in_it_is_not_the_song_being_in_it(self):
        result = self.send(FakeSpotify({self.NAME: ["A - One (Somebody Remix)", self.streamed("B", "Two", 90)]}), self.make("A - One", "B - Two"))
        self.assertEqual(result["sent"], 2)
        self.assertEqual(self.note("A - One"), ("add", self.NAME))
        self.assertEqual(self.note("B - Two"), ("add", self.NAME))

    def test_sending_it_again_leaves_alone_what_you_marked_added(self):
        """Another version is in the playlist and you said that's the one you meant."""
        fake, made = FakeSpotify({self.NAME: ["A - One (Somebody Remix)"]}), self.make("A - One", "B - Two")
        self.send(fake, made)
        self.want("A - One", self.NAME, action="added")
        self.collection.refresh()
        result = self.send(fake, made)
        self.assertEqual((self.note("A - One"), self.note("B - Two")), (("added", self.NAME), ("add", self.NAME)))
        self.assertEqual(result["sent"], 1)

    def test_a_streamed_copy_of_the_same_length_already_in_it_counts(self):
        result = self.send(FakeSpotify({self.NAME: [self.streamed("A", "One", 5)]}), self.make("A - One"))
        self.assertEqual(result["sent"], 0)
        self.assertIn("Every song is already in it", result["message"])

    def test_songs_in_another_alphabet_are_each_their_own(self):
        self.another("Краски - Он не знает ничего")
        self.collection.refresh()
        result = self.send(FakeSpotify({self.NAME: ["НЮША - Цунами"]}), self.make("Краски - Он не знает ничего"))
        self.assertEqual(result["sent"], 1, "a playlist holding one song named all in Cyrillic used to count as holding every such song")

    def test_no_local_file_is_sent_to_spotify(self):  # it can't take them: only the playlist itself is made
        fake = FakeSpotify({})
        self.send(fake, self.make("A - One"))
        self.assertEqual(fake.posts, [])

    def test_a_playlist_thats_already_there_isnt_made_again(self):
        fake = FakeSpotify({self.NAME: []})
        result = self.send(fake, self.make("A - One"))
        self.assertEqual(fake.made, [])
        self.assertFalse(result["made"])
        self.assertIn("already on Spotify", result["message"])
        self.assertEqual(self.note("A - One"), ("add", self.NAME))

    def test_songs_already_in_it_dont_wait(self):
        result = self.send(FakeSpotify({self.NAME: ["A - One"]}), self.make("A - One", "B - Two"))
        self.assertEqual(result["sent"], 1)
        self.assertNotIn("playlist:library/Acid/A - One.mp3", self.saved())
        self.assertEqual(self.note("B - Two"), ("add", self.NAME))

    def test_when_they_are_all_in_it_it_says_so(self):
        result = self.send(FakeSpotify({self.NAME: ["A - One"]}), self.make("A - One"))
        self.assertEqual(result["sent"], 0)
        self.assertIn("Every song is already in it", result["message"])

    def test_a_song_waiting_for_another_playlist_keeps_that(self):
        self.want("A - One", RAVE)
        self.collection.refresh()
        self.send(FakeSpotify({}), self.make("A - One"))
        self.assertEqual(self.note("A - One"), ("add", f"{RAVE}\n{self.NAME}"))

    def test_sending_twice_lists_it_once(self):
        list_id, fake = self.make("A - One"), FakeSpotify({})
        self.send(fake, list_id)
        self.send(fake, list_id)
        self.assertEqual(self.note("A - One"), ("add", self.NAME))
        self.assertEqual(len(fake.made), 1)

    def test_if_spotify_wont_make_it_you_can_still_do_it_by_hand(self):
        fake = FakeSpotify({})

        def fetch(url, headers=None, data=None, method=None):
            if method == "POST":
                raise http_error(url, 403)
            return fake(url, headers, data, method)
        client = self.client(fake)
        client.fetch = fetch
        result = self.send(fake, self.make("A - One"), client=client)
        self.assertFalse(result["made"])
        self.assertEqual(result["sent"], 1)
        self.assertIn("make a playlist with that exact name", result["message"])
        self.assertEqual(self.note("A - One"), ("add", self.NAME))

    def test_a_long_wait_from_spotify_sends_nothing(self):
        fake = FakeSpotify({})
        fake.fail["/me/playlists"] = [(429, dict(Retry_After="3600"))]
        result = self.send(fake, self.make("A - One"))
        self.assertEqual(result["sent"], 0)
        self.assertIn("asked to wait", result["message"])
        self.assertEqual(self.saved(), {})

    def test_it_will_not_start_during_a_wait(self):
        list_id = self.make("A - One")
        spotify.write_state(self.paths, wait_until=(datetime.datetime.now() + datetime.timedelta(hours=1)).isoformat())
        fake = FakeSpotify({})
        self.assertIn("Try again after that", self.send(fake, list_id)["message"])
        self.assertEqual(fake.calls, [])

    def test_it_asks_for_permission_to_change_playlists(self):
        list_id, fake, asked_for = self.make("A - One"), FakeSpotify({}), []
        client = spotify.Client("id", self.paths, fetch=fake, sleep=lambda s: None)

        def sign_in():
            asked_for.append(client.scope)
            raise spotify.Stop("Spotify sign-in wasn't finished, so nothing was checked.")
        with mock.patch.object(client, "sign_in", side_effect=sign_in):
            result = spotify.send_playlist(client, self.collection, list_id)
        self.assertEqual(asked_for, [spotify.TO_CHANGE])
        self.assertIn("wasn't finished", result["message"])
        self.assertEqual((client.scope, fake.made), (spotify.SCOPES, []))
        self.assertEqual(self.saved(), {})

    def test_a_playlist_that_isnt_there(self):
        fake = FakeSpotify({})
        self.assertIn("isn't there", self.send(fake, "nope")["message"])
        self.assertEqual(fake.calls, [])

    def test_a_playlist_with_no_songs_sends_nothing(self):
        fake = FakeSpotify({})
        self.assertIn("nothing to send", self.send(fake, self.make())["message"])
        self.assertEqual(fake.made, [])

    def test_a_song_not_in_the_library_yet_is_left_out(self):  # the to-do only lists finished songs
        waiting = write_mp3(os.path.join(self.review, "Rev - Song.mp3"), artist="Rev", title="Song", album="")
        self.collection.refresh()
        ids = [s["id"] for s in self.collection.songs.values() if s["_path"] == waiting or s["file"] == "A - One.mp3"]
        list_id = own_playlists.handle(self.collection, "/api/playlists/new", dict(name=self.NAME, ids=ids))["made"]["id"]
        result = self.send(FakeSpotify({}), list_id)
        self.assertEqual(result["sent"], 1)
        self.assertIn("Left out 1 song not in your library yet", result["message"])
        self.assertNotIn("playlist:review/Rev - Song.mp3", self.saved())

    def test_check_spotify_ticks_them_off_as_you_drag_them_in(self):
        fake = FakeSpotify({})
        self.send(fake, self.make("A - One", "B - Two"))
        fake.lists[self.NAME].append("A - One")
        result = spotify.check(self.client(fake), webapp.Collection(self.paths))
        self.assertEqual((result["arrived"], result["missing"]), (1, 1))
        self.assertEqual(self.note("A - One")[0], "added")
        self.assertEqual(self.note("B - Two"), ("add", self.NAME))


class SigningIn(Base):
    def free_port(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    def client(self, opener, port):
        def fetch(url, headers=None, data=None):
            self.exchanged = urllib.parse.parse_qs(data.decode())
            return dict(access_token="token", refresh_token="refresh", expires_in=3600)
        return spotify.Client("the-id", webapp.app_paths(), fetch=fetch, opener=opener, port=port)

    def answer_with(self, port, wrong_state_first=False):
        def opener(url):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            self.asked = query

            def respond():
                if wrong_state_first:
                    urllib.request.urlopen(f"http://127.0.0.1:{port}/callback?state=wrong&code=stolen", timeout=5).read()
                urllib.request.urlopen(f"http://127.0.0.1:{port}/callback?state={query['state'][0]}&code=the-code", timeout=5).read()
            threading.Thread(target=respond, daemon=True).start()
        return opener

    def test_the_browser_step_only_asks_to_read_and_uses_pkce(self):
        port = self.free_port()
        client = self.client(self.answer_with(port), port)
        client.sign_in()
        self.assertEqual(self.asked["scope"], [spotify.SCOPES])
        self.assertNotIn("modify", spotify.SCOPES)
        self.assertEqual(self.asked["code_challenge_method"], ["S256"])
        self.assertEqual(self.exchanged["code"], ["the-code"])
        self.assertEqual(self.exchanged["client_id"], ["the-id"])
        self.assertTrue(self.exchanged["code_verifier"])
        self.assertEqual(client.access, "token")

    def test_an_answer_with_the_wrong_state_is_ignored(self):
        port = self.free_port()
        client = self.client(self.answer_with(port, wrong_state_first=True), port)
        client.sign_in()
        self.assertEqual(self.exchanged["code"], ["the-code"])

    def test_no_answer_stops_cleanly(self):
        port = self.free_port()
        client = self.client(lambda url: None, port)
        with mock.patch.object(spotify, "SIGN_IN_S", .6), self.assertRaises(spotify.Stop) as caught:
            client.sign_in()
        self.assertIn("wasn't finished", str(caught.exception))

    def test_a_busy_port_stops_cleanly(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            s.listen()
            client = self.client(lambda url: None, s.getsockname()[1])
            with self.assertRaises(spotify.Stop) as caught:
                client.sign_in()
        self.assertIn("in use", str(caught.exception))


class TheButton(Base):
    def post(self, port, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.request("POST", "/api/spotify/check", body="{}", headers={"Content-Type": "application/json", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if "json" in (r.getheader("Content-Type") or "") else {}

    def setUp(self):
        super().setUp()
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def test_other_websites_cant_press_it(self):
        self.assertEqual(self.post(self.port, {"Origin": "https://evil.example"})[0], 403)

    def test_without_a_client_id_it_says_so(self):
        status, data = self.post(self.port)
        self.assertEqual(status, 200)
        self.assertIn("no Spotify Client ID", data["message"])

    def post_to(self, route, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("POST", route, body="{}", headers={"Content-Type": "application/json", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if "json" in (r.getheader("Content-Type") or "") else {}

    def post_body(self, route, body):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("POST", route, body=json.dumps(body), headers={"Content-Type": "application/json"})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw)

    def test_adding_needs_at_least_one_playlist(self):
        for playlists in (None, [], "x", [1], [""]):
            self.assertEqual(self.post_body("/api/spotify/stream", dict(id="x", playlists=playlists))[0], 400, playlists)

    def test_other_websites_cant_add_a_song(self):
        self.assertEqual(self.post_to("/api/spotify/stream", {"Origin": "https://evil.example"})[0], 403)

    def test_other_websites_cant_press_the_move_button(self):
        self.assertEqual(self.post_to("/api/spotify/move", {"Origin": "https://evil.example"})[0], 403)

    def test_other_websites_cant_send_a_playlist(self):
        self.assertEqual(self.post_to("/api/spotify/send", {"Origin": "https://evil.example"})[0], 403)

    def test_sending_a_playlist_without_a_client_id_says_so(self):
        status, data = self.post_body("/api/spotify/send", dict(list="x"))
        self.assertEqual(status, 200)
        self.assertIn("no Spotify Client ID", data["message"])

    def test_the_move_button_says_when_spotify_isnt_set_up(self):
        status, data = self.post_to("/api/spotify/move")
        self.assertEqual(status, 200)
        self.assertIn("no Spotify Client ID", data["message"])

    def test_moving_waits_its_turn_like_checking(self):
        self.assertTrue(self.server.spotify_lock.acquire(blocking=False))
        self.addCleanup(self.server.spotify_lock.release)
        self.assertIn("Already", self.post_to("/api/spotify/move")[1]["message"])

    def test_one_check_at_a_time(self):
        self.assertTrue(self.server.spotify_lock.acquire(blocking=False))
        self.addCleanup(self.server.spotify_lock.release)
        self.assertIn("Already talking to Spotify", self.post(self.port)[1]["message"])

    def test_the_page_is_told_if_it_is_set_up(self):
        self.assertEqual(self.server.collection.snapshot()["meta"]["spotify"], dict(ready=False, wait_until="", checked="", to_remove=[], playlists=[], other_versions=[]))


if __name__ == "__main__":
    unittest.main()
