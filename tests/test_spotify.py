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
from music_curator import config, spotify, webapp  # noqa: E402
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
        self.calls, self.fail, self.puts, self.posts, self.searches = [], {}, [], [], []

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
        with open(spotify._cache_path(self.paths), "w", encoding="utf-8") as f:
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
        self.assertEqual(self.server.collection.snapshot()["meta"]["spotify"], dict(ready=False, wait_until="", checked="", to_remove=[], playlists=[]))


if __name__ == "__main__":
    unittest.main()
