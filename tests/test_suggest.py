"""Tests for `curator suggest`: who gets suggested, why, and how the answers flow through the page and `curator apply`.

    python -m unittest discover -s tests
"""
import contextlib
import io
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import suggest, webapp  # noqa: E402
from test_apply import Base  # noqa: E402


def song(n, genre="Acid", year="1995", artist=None, label=""):
    return dict(id=str(n), key=f"library/{genre}/{n}.mp3", artist=artist or f"Artist {n}", title=f"Title {n}", genre=genre, year=year, label=label)


def keys_of(songs):
    return {s["id"]: {suggest.track_key(s["artist"], s["title"])} for s in songs}


class Scoring(unittest.TestCase):
    def model(self, songs, members, playlists=None):
        keys = keys_of(songs)
        return suggest.Model(songs, keys, {str(m) for m in members}, {"Target": set(), **(playlists or {})}, "Target"), keys

    def test_track_key_ignores_features_and_mixes(self):
        self.assertEqual(suggest.track_key("Hardfloor & Friend", "Acperience (Original Mix)"), suggest.track_key("Hardfloor", "Acperience"))
        self.assertEqual(suggest.track_key("Björk feat. X", "Song [Live]"), suggest.track_key("Bjork", "Song"))
        self.assertNotEqual(suggest.track_key("A", "One"), suggest.track_key("A", "Two"))

    def test_the_playlists_kind_of_song_scores_higher(self):
        songs = [song(i) for i in range(10)] + [song(i, "J-Core", "2012") for i in range(10, 20)] + [song(20), song(21, "J-Core", "2012")]
        model, _ = self.model(songs, range(10))
        self.assertGreater(model.score(songs[20])[0], model.score(songs[21])[0])

    def test_an_artist_with_no_other_songs_counts_for_nothing(self):
        songs = [song(i) for i in range(10)] + [song(10)]
        model, _ = self.model(songs, range(5))
        self.assertNotIn("artist", model.score(songs[10])[1])

    def test_an_artists_other_songs_in_the_playlist_count_for_it(self):
        songs = [song(i, artist="Same") for i in range(3)] + [song(i) for i in range(3, 12)]
        model, _ = self.model(songs, [0, 1, 3, 4])
        parts = model.score(songs[2])[1]
        self.assertGreater(parts["artist"], 0)
        self.assertIn("2 by Same", model.why(songs[2], parts, ""))

    def test_being_in_a_close_playlist_counts_and_is_named(self):
        songs = [song(i) for i in range(12)]
        keys = keys_of(songs)
        close = keys["0"] | keys["1"] | keys["2"] | keys["11"]
        model = suggest.Model(songs, keys, {str(i) for i in range(6)}, {"Target": set(), "Close": close}, "Target")
        total, parts, near = model.score(songs[11])
        self.assertEqual(near, "Close")
        self.assertGreater(parts["playlists"], 0)
        self.assertIn("You also have it in Close, which shares 3 of your songs", model.why(songs[11], parts, near))

    def test_a_list_of_nearly_everything_says_nothing(self):
        songs = [song(i) for i in range(12)]
        keys = keys_of(songs)
        model = suggest.Model(songs, keys, {"0", "1", "2"}, {"Target": set(), "All my files": set().union(*keys.values())}, "Target")
        self.assertNotIn("playlists", model.score(songs[11])[1])

    def test_the_chance_is_fair_to_big_and_small_playlists(self):
        songs = [song(i) for i in range(100)]
        big, _ = self.model(songs, range(40))
        small, _ = self.model(songs, range(4))
        self.assertAlmostEqual(big.chance(0), .4)
        self.assertAlmostEqual(small.chance(0), .04)
        self.assertGreater(big.chance(1), big.chance(0))
        self.assertLess(small.chance(1), big.chance(1), "the same evidence means less for a playlist few songs belong to")

    def test_a_small_playlist_needs_more_certainty(self):
        songs = [song(i) for i in range(100)]
        big, _ = self.model(songs, range(40))
        small, _ = self.model(songs, range(10))
        self.assertTrue(big.sure_enough(.75))
        self.assertFalse(small.sure_enough(.75))
        self.assertTrue(small.sure_enough(.95))
        self.assertFalse(big.sure_enough(.6))

    def test_fits_are_best_first_and_skip_playlists_the_song_is_in(self):
        songs = [song(i) for i in range(4)]
        low, high, inside = mock.Mock(), mock.Mock(), mock.Mock()
        for m, chance, ok in ((low, .3, False), (high, .9, True), (inside, .99, True)):
            m.score.return_value, m.chance.return_value, m.sure_enough.return_value = (1, {}, ""), chance, ok
            m.why.return_value = "because"
        found = suggest.fits_for(songs[0], dict(low=set(), high=set(), inside={"0"}), dict(low=low, high=high, inside=inside))
        self.assertEqual([(f[2], f[1]) for f in found], [("high", True), ("low", False)])


class EndToEnd(Base):
    """A library where one artist's songs fill a playlist, and one more of their songs isn't in it yet."""

    INSIDE = [f"Dj - In{i}" for i in range(10)]

    def setUp(self):
        super().setUp()
        self.snapshot = os.path.join(self.root, "playlists.json")
        for name in self.INSIDE + ["Dj - Fits"]:
            self.song("J-Core", name=name, notes="")
        for i in range(26):
            self.song("Techno", name=f"Other{i} - Thing", notes="")
        self.write_playlists(self.INSIDE)
        self.paths = webapp.app_paths()
        sure = mock.patch.object(suggest, "SURE_SMALL", .5)
        sure.start()
        self.addCleanup(sure.stop)

    def write_playlists(self, names, other=()):
        tracks = lambda items: [dict(name=n.split(" - ")[1], artists=[n.split(" - ")[0]]) for n in items]  # noqa: E731
        with open(self.snapshot, "w", encoding="utf-8") as f:
            json.dump([dict(name="💊 Rave Mix", tracks=tracks(names)), dict(name="Elsewhere", tracks=tracks(other))], f)

    def suggest(self, name=None, count=5):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = suggest.main(self.snapshot, name, count)
        return code, out.getvalue()

    def page(self):
        collection = webapp.Collection(self.paths)
        collection.refresh()
        return collection

    def checks(self, collection, title):
        found = next(s for s in collection.songs.values() if s["title"] == title)
        return found, [c for c in found["checks"] if c["kind"] == "playlist"]

    def test_ideas_that_cannot_be_saved_are_said_in_a_sentence(self):
        with mock.patch.object(suggest.saving, "write", side_effect=PermissionError(13, "Access is denied")), self.assertRaises(SystemExit) as stopped:
            self.suggest()
        self.assertIn("The playlist ideas couldn't be saved just now (Access is denied)", str(stopped.exception))

    def test_ideas_reach_the_page_without_touching_any_music(self):
        before = self.tree()
        code, out = self.suggest()
        self.assertEqual(code, 0, out)
        after = self.tree()
        self.assertEqual({k for k in after if k not in before}, {webapp.suggestions_path(self.paths)})
        self.assertEqual({k: v for k, v in after.items() if k in before}, before)
        page = self.page()
        _, ideas = self.checks(page, "Fits")
        self.assertEqual([f["name"] for f in ideas[0]["fits"]], ["💊 Rave Mix"], "only the one playlist it's sure about")
        self.assertIn("Could fit 💊 Rave Mix", ideas[0]["why"])
        self.assertEqual(self.checks(page, "In0")[1], [], "a song already in the playlist isn't suggested")
        self.assertEqual(self.checks(page, "Thing")[1], [], "and a song it isn't sure about isn't suggested at all")

    def test_when_nothing_is_sure_nothing_is_suggested(self):
        with mock.patch.object(suggest, "SURE_SMALL", 1.0):
            code, out = self.suggest()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.checks(self.page(), "Fits")[1], [])

    def test_a_song_can_be_suggested_for_several_playlists(self):
        self.write_playlists(self.INSIDE, other=self.INSIDE[:8])
        self.suggest()
        ideas = self.checks(self.page(), "Fits")[1]
        self.assertEqual(sorted(f["name"] for f in ideas[0]["fits"]), ["Elsewhere", "💊 Rave Mix"])
        self.assertTrue(all(f["why"].startswith("Could fit") for f in ideas[0]["fits"]))

    def test_asking_for_one_playlist_keeps_to_its_songs(self):
        self.write_playlists(self.INSIDE, other=self.INSIDE[:8] + ["Dj - Fits"])
        self.suggest("Rave")
        ideas = self.checks(self.page(), "Fits")[1]
        self.assertEqual([f["name"] for f in ideas[0]["fits"]], ["💊 Rave Mix"], "it's already in the other one")
        self.assertEqual(ideas[0]["also"], ["Elsewhere"])

    def test_finding_the_playlist(self):
        for name in ("nope", "e"):  # none, and more than one
            with self.subTest(name=name), self.assertRaises(SystemExit) as caught:
                self.suggest(name)
            self.assertIn("Elsewhere", str(caught.exception))

    def test_too_few_songs_to_learn_from(self):
        self.write_playlists(self.INSIDE[:3])
        with self.assertRaises(SystemExit) as caught:
            self.suggest("Rave")
        self.assertIn("too few", str(caught.exception))
        with self.assertRaises(SystemExit) as caught:
            self.suggest()
        self.assertIn("nothing to learn from", str(caught.exception))

    def test_a_song_the_playlist_knows_by_its_old_name_counts_as_in_it(self):
        self.rows[10]["src_artist"], self.rows[10]["src_title"] = "Old Name", "Old Title"
        self.save_log()
        self.write_playlists(self.INSIDE + ["Old Name - Old Title"])
        self.suggest()
        self.assertEqual(self.checks(self.page(), "Fits")[1], [])

    def test_answers_flow_through_and_added_songs_are_noticed(self):
        self.suggest()
        page = self.page()
        found, _ = self.checks(page, "Fits")
        self.assertIsNone(page.decide(dict(id=found["id"], kind="playlist", action="add", note="💊 Rave Mix")))
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertIn("Dj - Fits -> 💊 Rave Mix", out)
        self.assertIn("1 to add by hand", out)
        self.assertNotIn("For your AI app", out)
        self.assertIn(f"playlist:{found['key']}", self.saved(), "it stays on the list until it's really there")

        self.write_playlists(self.INSIDE + ["Dj - Fits"])
        code, out = self.suggest()
        self.assertIn("taken off your list: Dj - Fits", out)
        self.assertEqual(self.saved(), {})
        self.assertEqual(self.checks(self.page(), "Fits")[1], [])

    def test_another_version_in_the_playlist_is_not_the_song_arriving(self):
        self.suggest()
        page = self.page()
        found, _ = self.checks(page, "Fits")
        self.assertIsNone(page.decide(dict(id=found["id"], kind="playlist", action="add", note="Elsewhere")))
        self.write_playlists(self.INSIDE, other=["Dj - Fits (Somebody Remix)"])
        code, out = self.suggest()
        self.assertNotIn("taken off your list", out)
        self.assertIn(f"playlist:{found['key']}", self.saved(), "the remix being there doesn't mean you dragged this one in")
        self.write_playlists(self.INSIDE, other=["Dj - Fits (Somebody Remix)", "Dj - Fits"])
        code, out = self.suggest()
        self.assertIn("taken off your list: Dj - Fits", out)
        self.assertEqual(self.saved(), {})

    def test_the_full_names_in_a_playlist_file(self):
        with open(self.snapshot, "w", encoding="utf-8") as f:
            json.dump([dict(name="Mix", tracks=[dict(name="One (Barn Mix)", artists=["A", "B"]), dict(name="Two - Dub", artists=["C"]), dict(name=5, artists="nope"), "junk", dict(name="Отпусти меня", artists=["SEREBRO"])])], f)
        self.assertEqual(suggest.read_names(self.snapshot), {"Mix": {("ab", "onebarnmix"), ("c", "twodub"), ("serebro", "отпустименя")}})

    def test_a_song_can_go_to_several_playlists(self):
        self.write_playlists(self.INSIDE, other=["In - Zero"])
        self.suggest()
        page = self.page()
        self.assertEqual(page.snapshot()["meta"]["playlists"], ["Elsewhere", "💊 Rave Mix"])
        found, _ = self.checks(page, "Fits")
        self.assertIsNone(page.decide(dict(id=found["id"], kind="playlist", action="add", note="💊 Rave Mix\nElsewhere")))
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertIn("Dj - Fits -> 💊 Rave Mix, Elsewhere", out)

        self.write_playlists(self.INSIDE + ["Dj - Fits"], other=["In - Zero"])  # in one of the two so far
        _, out = self.suggest()
        self.assertNotIn("taken off your list", out)
        self.assertEqual(self.saved()[f"playlist:{found['key']}"]["note"], "Elsewhere")

        self.write_playlists(self.INSIDE + ["Dj - Fits"], other=["In - Zero", "Dj - Fits"])  # now both
        _, out = self.suggest()
        self.assertIn("taken off your list: Dj - Fits", out)
        self.assertEqual(self.saved(), {})

    def test_a_song_marked_added_is_finished_and_not_suggested_again(self):
        self.suggest()
        page = self.page()
        found, _ = self.checks(page, "Fits")
        self.assertIsNone(page.decide(dict(id=found["id"], kind="playlist", action="added", note="💊 Rave Mix")))
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertIn("Nothing to apply", out)
        _, out = self.suggest()
        self.assertIn("0 songs have a playlist", out)
        self.assertEqual(self.saved()[f"playlist:{found['key']}"]["action"], "added")

    def test_a_card_says_where_the_song_already_is(self):
        self.write_playlists(self.INSIDE, other=["Dj - Fits"])
        self.suggest()
        self.assertEqual(self.checks(self.page(), "Fits")[1][0]["also"], ["Elsewhere"])

    def test_an_answered_song_stays_visible_and_isnt_counted_as_new(self):
        self.suggest()
        page = self.page()
        found, _ = self.checks(page, "Fits")
        self.assertIsNone(page.decide(dict(id=found["id"], kind="playlist", action="keep")))
        _, out = self.suggest()
        self.assertIn("0 songs have a playlist", out)
        self.assertEqual(len(self.checks(self.page(), "Fits")[1]), 1)

    def test_a_damaged_ideas_file_is_ignored(self):
        self.suggest()
        with open(webapp.suggestions_path(self.paths), "w", encoding="utf-8") as f:
            f.write("{broken")
        self.assertEqual(self.checks(self.page(), "Fits")[1], [])


if __name__ == "__main__":
    unittest.main()
