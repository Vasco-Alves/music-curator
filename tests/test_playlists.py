"""Playing your Spotify playlists from the files you have. Nothing here reaches the network."""
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import spotify, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_spotify import FakeSpotify  # noqa: E402

MIX, OTHER = "Rave Mix", "Other Mix"


def song(id_="a", artist="A", title="One", secs=300, area="library", **extra):
    return {**dict(id=id_, artist=artist, title=title, secs=secs, area=area, file=f"{artist} - {title}.mp3"), **extra}


def entry(name="One", artists=("A",), secs=300, local=True, **extra):
    return {**dict(name=name, artists=list(artists), album="", secs=secs, local=local, uri="x"), **extra}


class WhatCanPlay(unittest.TestCase):
    def ids(self, songs, *entries):
        found = spotify.playable(songs, {"p": dict(name=MIX, entries=list(entries))})
        return found[0]["ids"] if found else []

    def test_a_local_entry_is_its_file(self):
        self.assertEqual(self.ids([song()], entry()), ["a"])

    def test_songs_stay_in_the_playlists_order(self):
        songs = [song("a", title="One"), song("b", title="Two"), song("c", title="Three")]
        self.assertEqual(self.ids(songs, entry("Three"), entry("One"), entry("Two")), ["c", "a", "b"])

    def test_a_local_entry_needs_no_matching_length(self):  # Spotify remembers the length a file had when it last read it, and those usually still play
        self.assertEqual(self.ids([song(secs=300)], entry(secs=40)), ["a"])

    def test_a_streamed_song_you_also_have_counts(self):
        self.assertEqual(self.ids([song(secs=300)], entry(secs=306, local=False)), ["a"])

    def test_a_streamed_song_of_another_length_is_another_version(self):
        self.assertEqual(self.ids([song(secs=300)], entry(secs=340, local=False)), [])

    def test_a_streamed_song_with_no_length_cant_be_matched(self):
        self.assertEqual(self.ids([song(secs=300)], entry(secs=0, local=False)), [])

    def test_a_song_you_dont_have_is_left_out_but_still_counted(self):
        found = spotify.playable([song()], {"p": dict(name=MIX, entries=[entry(), entry("Gone", ["Nobody"], local=False)])})
        self.assertEqual((found[0]["ids"], found[0]["total"]), (["a"], 2))

    def test_a_second_copy_plays_once(self):
        self.assertEqual(self.ids([song()], entry(), entry()), ["a"])

    def test_capitals_and_punctuation_dont_matter(self):
        self.assertEqual(self.ids([song(artist="DJ A.", title="One!")], entry("ONE", ["dj a"])), ["a"])

    def test_spotifys_way_of_writing_a_mix(self):
        self.assertEqual(self.ids([song(title="One (Barn Mix)")], entry("One - Barn Mix", local=False)), ["a"])

    def test_several_artists(self):
        self.assertEqual(self.ids([song(artist="A & B")], entry(artists=("A", "B"), local=False)), ["a"])

    def test_a_file_with_no_tags_goes_by_its_name(self):
        self.assertEqual(self.ids([song(artist="", title="", file="Odd Name.mp3", _tagless=True)], entry("Odd Name", ["Unknown Artist"])), ["a"])

    def test_your_library_copy_beats_one_waiting_in_review(self):
        self.assertEqual(self.ids([song("r", area="review"), song("l", area="library")], entry()), ["l"])

    def test_of_two_files_the_one_closest_in_length(self):
        self.assertEqual(self.ids([song("long", secs=420), song("short", secs=300)], entry(secs=302)), ["short"])

    def test_a_playlist_with_nothing_to_play_is_left_out(self):
        self.assertEqual(spotify.playable([song()], {"p": dict(name=MIX, entries=[entry("Gone")])}), [])

    def test_one_saved_before_names_were_kept_waits_for_the_next_check(self):
        self.assertEqual(spotify.playable([song()], {"p": dict(entries=[entry()])}), [])

    def test_they_come_in_name_order(self):
        cache = {"1": dict(name="zebra", entries=[entry()]), "2": dict(name="Apple", entries=[entry()])}
        self.assertEqual([p["name"] for p in spotify.playable([song()], cache)], ["Apple", "zebra"])

    def test_bad_shapes_are_ignored(self):
        cache = {"1": "nope", "2": dict(name=MIX, entries="nope"), "3": dict(name=5, entries=[]), "4": dict(name=MIX, entries=["nope", entry()])}
        self.assertEqual([p["ids"] for p in spotify.playable([song()], cache)], [["a"]])


class FromSpotify(Base):
    def setUp(self):
        super().setUp()
        self.song("Acid", name="A - One", notes="")
        self.paths = webapp.app_paths()
        self.saved = os.path.join(self.app, "spotify_playlists.json")

    def check(self, fake):
        client = spotify.Client("id", self.paths, fetch=fake, sleep=lambda s: None)
        client.access, client.expires = "token", time.monotonic() + 999
        return spotify.check(client, webapp.Collection(self.paths))

    def lists(self):
        collection = webapp.Collection(self.paths)
        return collection.snapshot()["meta"]["my_playlists"]

    def cache(self):
        with open(self.saved, encoding="utf-8") as f:
            return json.load(f)

    ONE = dict(name="One", artists=["A"], album="Album", secs=5)

    def test_the_page_gets_them_after_a_check(self):
        self.check(FakeSpotify({MIX: [self.ONE, dict(name="Gone", artists=["N"], local=False)]}))
        found = self.lists()
        self.assertEqual([(p["name"], p["total"], len(p["ids"])) for p in found], [(MIX, 2, 1)])

    def test_with_no_check_yet_there_are_none(self):
        self.assertEqual(self.lists(), [])

    def test_an_unchanged_playlist_gets_its_name_without_reading_it_again(self):
        with open(self.saved, "w", encoding="utf-8") as f:
            json.dump({"id0": dict(snapshot="v1", entries=[dict(entry("One", ["A"], 5))])}, f)
        fake = FakeSpotify({MIX: [self.ONE]}, snapshots={MIX: "v1"})
        self.check(fake)
        self.assertEqual(self.cache()["id0"]["name"], MIX)
        self.assertFalse([c for c in fake.calls if "/playlists/id0/" in c], "nothing changed in it, so it isn't read again")

    def test_a_renamed_playlist_shows_its_new_name(self):
        self.check(FakeSpotify({MIX: [self.ONE]}, snapshots={MIX: "v1"}))
        self.check(FakeSpotify({OTHER: [self.ONE]}, snapshots={OTHER: "v1"}))
        self.assertEqual([p["name"] for p in self.lists()], [OTHER])

    def test_a_deleted_playlist_goes(self):
        self.check(FakeSpotify({MIX: [self.ONE], OTHER: [self.ONE]}))
        self.check(FakeSpotify({MIX: [self.ONE]}))
        self.assertEqual([p["name"] for p in self.lists()], [MIX])

    def test_a_check_cut_short_forgets_nothing(self):
        self.check(FakeSpotify({MIX: [self.ONE], OTHER: [self.ONE]}))
        fake = FakeSpotify({MIX: [self.ONE], OTHER: [self.ONE]}, snapshots={MIX: "v9", OTHER: "v9"})
        fake.fail["/playlists/id1/"] = [(403,)]
        self.check(fake)
        self.assertEqual({p["name"] for p in self.lists()}, {MIX, OTHER})

    def test_a_saved_file_that_cant_be_read_is_no_playlists(self):
        with open(self.saved, "w", encoding="utf-8") as f:
            f.write("not json")
        self.assertEqual(self.lists(), [])


if __name__ == "__main__":
    unittest.main()
