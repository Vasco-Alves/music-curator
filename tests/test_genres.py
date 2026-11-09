"""Tests for the extra genres a song can be found under, and for the page's Curate button carrying out your other answers. Nothing here reaches the network.

    python -m unittest discover -s tests
"""
import contextlib
import email.message
import io
import os
import sys
import threading
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import apply, discogs, genres, webapp  # noqa: E402
from test_curate import WithDiscogs  # noqa: E402

SONG = "library/Techno/A - B.mp3"


class Records(unittest.TestCase):
    def test_a_release_and_a_master_are_told_apart(self):
        self.assertEqual(webapp.record_of("https://www.discogs.com/release/123-Some-Name"), "release/123")
        self.assertEqual(webapp.record_of("https://www.discogs.com/master/45"), "master/45")

    def test_anything_else_is_no_record(self):
        for link in ("", None, "https://youtu.be/abc", "https://www.discogs.com/artist/1"):
            self.assertEqual(webapp.record_of(link), "")


class WhatIsKept(unittest.TestCase):
    def test_styles_come_first(self):
        self.assertEqual(genres.entry(dict(styles=["Acid", "Techno"], genres=["Electronic"]))["styles"], ["Acid", "Techno"])

    def test_the_broad_genre_only_stands_in_when_there_are_no_styles(self):
        self.assertEqual(genres.entry(dict(styles=[], genres=["Stage & Screen"]))["styles"], ["Stage & Screen"])

    def test_a_compilation_is_marked(self):
        self.assertTrue(genres.entry(dict(styles=["Acid"], formats=[dict(descriptions=["Compilation", "Mixed"])]))["wide"])
        self.assertTrue(genres.entry(dict(styles=["Acid"], artists=[dict(name="Various")]))["wide"])

    def test_an_ep_is_not(self):
        self.assertFalse(genres.entry(dict(styles=["Acid"], formats=[dict(descriptions=['12"', "EP"])], artists=[dict(name="A")]))["wide"])

    def test_an_odd_answer_is_harmless(self):
        self.assertEqual(genres.entry(dict(styles=[None, 3, " Acid "], formats=["x", dict(descriptions=None)], artists=["y"])), dict(styles=["Acid"], wide=False))


class Filling(WithDiscogs):
    def collection(self):
        found = webapp.Collection(self.paths)
        found.refresh()
        return found

    def test_the_song_gets_the_others_and_its_file_is_left_alone(self):
        path = self.song("Acid")
        with open(path, "rb") as f:
            before = f.read()
        self.fake.add("A", "Record", [("A1", "B", "0:05")], styles=("Acid", "Techno", "Hard Trance"))
        self.assertEqual(genres.wanted(self.collection()), {"release/1": "A - B"})
        self.assertEqual(genres.fill(self.paths, genres.wanted(self.collection()))["looked"], 1)
        song = self.page_song("A - B.mp3")
        self.assertEqual((song["genre"], song["also"], song["wide"]), ("Acid", ["Techno", "Hard Trance"], False))
        with open(path, "rb") as f:
            self.assertEqual(f.read(), before)

    def test_a_compilations_are_marked_on_the_song(self):
        self.song("Acid")
        self.fake.add("A", "Record", [("A1", "B", "0:05")], styles=("Acid", "House"), descriptions=("Compilation",))
        genres.fill(self.paths, genres.wanted(self.collection()))
        song = self.page_song("A - B.mp3")
        self.assertEqual((song["also"], song["wide"]), (["House"], True))

    def test_what_is_known_is_not_asked_again(self):
        self.song("Acid")
        self.fake.add("A", "Record", [("A1", "B", "0:05")])
        genres.fill(self.paths, genres.wanted(self.collection()))
        self.assertEqual(genres.wanted(self.collection()), {})

    def test_a_record_gone_from_discogs_is_not_asked_about_again(self):
        self.song("Acid")
        genres.fill(self.paths, genres.wanted(self.collection()))
        self.assertEqual(genres.wanted(self.collection()), {})
        self.assertEqual(self.page_song("A - B.mp3")["also"], [])

    def test_songs_still_waiting_are_left_out(self):
        self.file("A - Song", discogs="https://www.discogs.com/release/9")
        self.assertEqual(genres.wanted(self.collection()), {})

    def test_stop_stops_it(self):
        stop = threading.Event()
        stop.set()
        done = genres.fill(self.paths, {"release/1": "A - B"}, stopping=stop)
        self.assertEqual((done["looked"], done["stopped"]), (0, True))

    def test_a_network_that_is_down_ends_it_early_and_says_so(self):
        records = {f"release/{n}": "A - B" for n in range(1, 8)}
        with mock.patch.object(discogs, "get", side_effect=OSError("down")) as get:
            done = genres.fill(self.paths, records)
        self.assertEqual((get.call_count, done["looked"]), (3, 0))
        self.assertIn("isn't answering", done["said"])
        self.assertEqual(genres.known(self.paths), {})

    def test_one_blip_is_no_reason_to_stop(self):
        answers = [OSError("blip"), dict(styles=["Acid"]), dict(styles=["House"])]
        with mock.patch.object(discogs, "get", side_effect=answers):
            done = genres.fill(self.paths, {"release/1": "a", "release/2": "b", "release/3": "c"})
        self.assertEqual(done["looked"], 2)
        self.assertEqual(sorted(genres.known(self.paths)), ["release/2", "release/3"])

    def test_a_refused_token_ends_it_and_never_quotes_it(self):
        refused = urllib.error.HTTPError("https://api.discogs.com/x", 401, "no", email.message.Message(), None)
        with mock.patch.object(discogs, "get", side_effect=refused):
            done = genres.fill(self.paths, {"release/1": "a"})
        self.assertIn("token", done["said"])
        self.assertNotIn("Discogs token=", done["said"])

    def test_a_file_that_cannot_be_read_counts_as_nothing_found(self):
        with open(webapp.styles_path(self.paths), "w", encoding="utf-8") as f:
            f.write("{ not json")
        self.assertEqual(genres.known(self.paths), {})

    def test_from_the_command_line(self):
        self.song("Acid")
        self.fake.add("A", "Record", [("A1", "B", "0:05")], styles=("Acid", "Techno"))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(genres.main(), 0)
            self.assertEqual(genres.main(), 0)
        self.assertIn("1 looked up", out.getvalue())
        self.assertIn("has its genres already", out.getvalue())


class CarryingOut(WithDiscogs):
    def test_a_genre_answer_is_done(self):
        self.song("Techno")
        self.answer("genre", SONG, genre="Acid")
        told = apply.carry_out(self.paths)
        self.assertEqual((told["changed"], told["not_done"]), (1, []))
        self.assertEqual(self.in_library(), ["Acid/A - B.mp3"])
        self.assertEqual(self.saved(), {})

    def test_not_worth_keeping_only_leaves_when_asked(self):
        self.song("Techno")
        self.answer("drop", SONG, kind="check")
        self.assertEqual(apply.carry_out(self.paths)["aside"], 0)
        self.assertEqual(self.in_library(), ["Techno/A - B.mp3"])
        self.assertEqual(apply.carry_out(self.paths, set_aside=True)["aside"], 1)
        self.assertEqual(self.in_library(), [])

    def test_what_needs_research_stays_on_the_list(self):
        self.song("Techno")
        self.answer("better", SONG, kind="check")
        self.assertEqual(apply.carry_out(self.paths)["changed"], 0)
        self.assertIn(f"check:{SONG}", self.saved())

    def test_a_song_that_is_not_in_the_library_yet_is_left_for_the_agent(self):
        self.answer("genre", "review/A - B.mp3", genre="Acid")
        self.assertEqual(apply.carry_out(self.paths), dict(changed=0, aside=0, cleared=0, not_done=[]))
        self.assertIn("genre:review/A - B.mp3", self.saved())

    def test_what_cannot_be_done_is_said_and_stays(self):
        self.song("Techno")
        self.answer("genre", SONG, genre="Bad/\x01Name")
        told = apply.carry_out(self.paths)
        self.assertEqual((told["changed"], len(told["not_done"])), (0, 1))
        self.assertIn(f"genre:{SONG}", self.saved())

    def test_the_pages_list_is_the_one_changed(self):
        self.song("Techno")
        self.answer("genre", SONG, genre="Acid")
        collection = webapp.Collection(self.paths)
        collection.refresh()
        with mock.patch.object(collection, "update_answers", wraps=collection.update_answers) as update:
            apply.carry_out(self.paths, update=collection.update_answers if False else update)
        self.assertTrue(update.called)
        self.assertEqual(self.saved(), {})

    def test_stop_leaves_the_rest(self):
        self.song("Techno")
        self.answer("genre", SONG, genre="Acid")
        stop = threading.Event()
        stop.set()
        self.assertEqual(apply.carry_out(self.paths, stopping=stop)["changed"], 0)
        self.assertEqual(self.in_library(), ["Techno/A - B.mp3"])

    def test_a_log_that_cannot_be_opened_is_said_before_anything_changes(self):
        self.song("Techno")
        self.answer("genre", SONG, genre="Acid")
        with mock.patch.object(apply, "_open_log", side_effect=SystemExit("Can't write to the log")):
            told = apply.carry_out(self.paths)
        self.assertEqual(told["not_done"], ["Can't write to the log"])
        self.assertEqual(self.in_library(), ["Techno/A - B.mp3"])


if __name__ == "__main__":
    unittest.main()
