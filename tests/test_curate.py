"""Tests for curating with no AI, against a stand-in for Discogs. Nothing here reaches the network.

    python -m unittest discover -s tests
"""
import email.message
import http.client
import io
import json
import os
import re
import sys
import threading
import time
import unicodedata
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import cli, config, curate, discogs, library, parse, resolve, tagwriter, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_webapp import JPEG, write_mp3  # noqa: E402

KEY = "inbox/Downloads/{}.mp3"
LENGTH = "0:05"  # the test files run about 5.2 seconds


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


class FakeDiscogs:
    """Answers like Discogs for the records added to it."""

    def __init__(self):
        self.releases, self.calls, self.errors, self.images = {}, [], [], []

    def add(self, artist, title, tracks, styles=("Acid",), year=1996, descriptions=("12\"",), image=True):
        """tracks: [(position, title, length)]"""
        rid = len(self.releases) + 1
        self.releases[rid] = dict(
            id=rid, title=title, artists=[dict(name=artist, anv="", join="", id=rid)], year=year, released=str(year), country="UK", genres=["Electronic"], styles=list(styles),
            formats=[dict(name="Vinyl", qty="1", descriptions=list(descriptions))], labels=[dict(name="Label", catno=f"L{rid}")], master_id=0, uri="",
            tracklist=[dict(position=p, type_="track", title=t, duration=d, artists=[], extraartists=[]) for p, t, d in tracks], extraartists=[],
            images=[dict(type="primary", uri=f"https://i.discogs.com/{rid}.jpg", width=600, height=600)] if image else [])
        return rid

    def search(self, **kw):
        self.calls.append(kw)
        if self.errors:
            raise self.errors.pop(0)
        found = []
        for rid, r in self.releases.items():
            who, tracks = norm(r["artists"][0]["name"]), [resolve.d.base_title(t["title"]) for t in r["tracklist"]]
            words = (kw.get("q") or "").split()
            if ("artist" in kw and norm(kw["artist"]) == who and norm(kw.get("track")) in tracks) or (words and norm(" ".join(words)) in (who + t for t in tracks)):
                found.append(dict(id=rid, title=f"{r['artists'][0]['name']} - {r['title']}", year=str(r["year"]), country="UK", format=["Vinyl"], label=["Label"], catno="L", style=r["styles"], genre=["Electronic"], master_id=0))
        return found

    def everything(self, **kw):
        """Discogs' free-text search can bring back other people's records with the same title."""
        self.calls.append(kw)
        return [dict(id=rid, title=f"{r['artists'][0]['name']} - {r['title']}", year=str(r["year"]), country="UK", format=["Vinyl"], label=["Label"], catno="L", style=r["styles"], genre=["Electronic"], master_id=0)
                for rid, r in self.releases.items()]

    def get(self, path, **params):
        return self.releases.get(int(path.rsplit("/", 1)[-1]))

    def request(self, url, binary=False):
        self.images.append(url)
        return JPEG


class Judging(unittest.TestCase):
    def ready(self, **extra):
        return {"status": "ready", "how": "only version on the record", "dur_diff": 3, "title": "Song", "artist": "A", **extra}

    def test_a_name_and_length_that_agree_are_enough(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song"}, self.ready()), "")

    def test_a_record_that_lists_no_length_is_enough_on_its_own(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song"}, self.ready(dur_diff=None)), "")

    def test_the_length_may_be_off_by_a_little(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song"}, self.ready(dur_diff=-20)), "")

    def test_but_not_by_more(self):
        self.assertIn("longer", curate.judge({"artist": "A", "title": "Song"}, self.ready(dur_diff=21)))
        self.assertIn("shorter", curate.judge({"artist": "A", "title": "Song"}, self.ready(dur_diff=-120)))

    def test_a_mix_picked_only_by_length_waits(self):
        why = curate.judge({"artist": "A", "title": "Song (Acid Mix)", "mix": "Acid Mix"}, self.ready(how="length matches (file says 'Acid Mix')", title="Song (Dub)"))
        self.assertIn("Acid Mix", why)

    def test_a_note_in_the_name_that_the_record_lacks_waits(self):
        self.assertIn("Slowed", curate.judge({"artist": "A", "title": "Song (Slowed)"}, self.ready()))

    def test_a_note_the_record_has_is_fine(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song (Acid Mix)", "mix": "Acid Mix"}, self.ready(how="mix name matches", title="Song (Acid Mix)")), "")

    def test_who_is_featured_is_not_a_note(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song (feat. B)"}, self.ready()), "")

    def test_a_browsers_copy_number_is_not_a_note(self):
        self.assertEqual(curate.judge({"artist": "A", "title": "Song (2)"}, self.ready()), "")

    def test_a_record_with_only_a_remix_waits_when_the_file_names_none(self):
        self.assertIn("only lists", curate.judge({"artist": "A", "title": "Song"}, self.ready(title="Song (X Remix)")))

    def test_what_the_lookup_said_is_passed_on(self):
        self.assertIn("not found", curate.judge({"artist": "A", "title": "Song"}, {"status": "notfound", "reasons": ["not found on Discogs"]}))

    def test_a_path_in_a_reason_is_cut_to_the_file_name(self):
        path = os.path.join(os.sep, "Music", "Acid", "A - B.mp3")
        why = curate.judge({"artist": "A", "title": "Song"}, {"status": "dup", "reasons": [f"already in library: {path}"]})
        self.assertEqual(why, "already in your library: A - B.mp3")


class TokenFile(Base):
    """A .env file next to the settings, for people who'd rather not set an environment variable."""

    def setUp(self):
        super().setUp()
        for patcher in (mock.patch.object(discogs, "_tok", [None]), mock.patch.object(discogs.sys, "platform", "not-windows"), mock.patch.dict(os.environ),
                        mock.patch.object(curate.shutil, "which", return_value="found")):  # with that platform, which() can't find ffmpeg.exe
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop("DISCOGS_TOKEN", None)

    def save(self, text, encoding="utf-8"):
        with open(os.path.join(self.root, ".env"), "w", encoding=encoding) as f:
            f.write(text)

    def test_it_lives_next_to_the_settings(self):
        self.assertEqual(config.env_file(), os.path.join(self.root, ".env"))

    def test_the_token_is_read_from_it(self):
        self.save("DISCOGS_TOKEN=abc123\n")
        self.assertEqual(discogs.token(), "abc123")

    def test_the_usual_ways_of_writing_it_all_work(self):
        for text in ('DISCOGS_TOKEN="abc123"', "DISCOGS_TOKEN='abc123'", "  DISCOGS_TOKEN = abc123  ", "export DISCOGS_TOKEN=abc123", "# my token\n\nOTHER=x\nDISCOGS_TOKEN=abc123\r\n"):
            discogs._tok[0] = None
            self.save(text)
            self.assertEqual(discogs.token(), "abc123", text)

    def test_notepads_byte_order_mark_does_no_harm(self):
        self.save("DISCOGS_TOKEN=abc123", encoding="utf-8-sig")
        self.assertEqual(discogs.token(), "abc123")

    def test_an_environment_variable_comes_first(self):
        self.save("DISCOGS_TOKEN=from_file")
        os.environ["DISCOGS_TOKEN"] = "from_env"
        self.assertEqual(discogs.token(), "from_env")

    def test_a_commented_out_line_is_not_a_token(self):
        self.save("# DISCOGS_TOKEN=abc123\n")
        with self.assertRaises(SystemExit):
            discogs.token()

    def test_with_no_token_it_says_where_to_put_one(self):
        with self.assertRaises(SystemExit) as stopped:
            discogs.token()
        self.assertIn(config.env_file(), str(stopped.exception))

    def test_an_empty_value_is_no_token(self):
        self.save("DISCOGS_TOKEN=\n")
        with self.assertRaises(SystemExit):
            discogs.token()

    def test_the_rest_of_the_file_is_left_alone(self):
        self.save("DISCOGS_TOKEN=abc123\nSOMETHING_ELSE=hello\n")
        discogs.token()
        self.assertNotIn("SOMETHING_ELSE", os.environ)
        self.assertNotIn("DISCOGS_TOKEN", os.environ)

    def test_the_page_tells_you_where_the_file_goes(self):
        message = curate.missing(webapp.app_paths())
        self.assertIn(".env", message)
        self.assertIn(self.root, message)

    def test_adding_the_file_works_without_a_restart(self):
        self.assertIn(".env", curate.missing(webapp.app_paths()))
        self.save("DISCOGS_TOKEN=abc123\n")
        self.assertEqual(curate.missing(webapp.app_paths()), "")


class ReadingNames(unittest.TestCase):
    def test_a_mix_after_a_featured_artist_is_found(self):
        self.assertEqual(parse.parse("A - Song (feat. B) (C Remix)", {})["mix"], "C Remix")

    def test_a_slowed_edit_counts_as_a_version(self):
        self.assertEqual(parse.parse("A - Song (Slowed)", {})["mix"], "Slowed")

    def test_other_readings_use_the_tags_then_the_name_the_other_way_round(self):
        item = dict(parse.parse("Song - A", {}), tag_artist="Real", tag_title="Title")
        self.assertEqual([r["search_artist"] for r in curate.other_readings(item)], ["Real", "A"])

    def test_a_reading_already_tried_is_not_tried_again(self):
        item = dict(parse.parse("A - Song", {}), tag_artist="A", tag_title="Song")
        self.assertEqual([r["search_artist"] for r in curate.other_readings(item)], ["Song"])


class WithDiscogs(Base):
    def setUp(self):
        super().setUp()
        self.fake = FakeDiscogs()
        for name, stand_in in (("search", self.fake.search), ("get", self.fake.get), ("_request", self.fake.request), ("token", lambda: "token")):
            patcher = mock.patch.object(discogs, name, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.paths = webapp.app_paths()

    def file(self, name, **tags):
        return write_mp3(os.path.join(self.inbox, name + ".mp3"), **{"artist": "", "title": "", "album": "", "discogs": "", "genre": "Other", "year": "", **tags})

    def run_it(self, **kw):
        run = curate.Run(self.paths, say=lambda _: None, **kw)
        return run, run.go()

    def waiting(self):
        path = webapp.curated_path(self.paths)
        if not os.path.exists(path):
            return {}
        with open(path, encoding="utf-8") as f:
            return json.load(f)["songs"]

    def in_library(self):
        return sorted(os.path.relpath(os.path.join(dp, n), self.lib).replace(os.sep, "/") for dp, _, names in os.walk(self.lib) for n in names)

    def page_song(self, name):
        collection = webapp.Collection(self.paths)
        collection.refresh()
        return next(s for s in collection.songs.values() if s["file"] == name)

    def answer_for(self, name, action, note=""):
        self.answer(action, KEY.format(name), kind="waiting", song=name, note=note)


class Running(WithDiscogs):
    def test_a_clear_match_goes_in_with_clean_tags_and_a_cover(self):
        original = self.file("A - Song")
        with open(original, "rb") as f:
            before = f.read()
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH), ("B1", "Other", "6:00")])
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (1, 0))
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])
        written = library.read_song(os.path.join(self.lib, "Acid", "A - Song.mp3"))
        self.assertEqual((written["artist"], written["title"], written["year"], written["genre"]), ("A", "Song", "1996", "Acid"))
        self.assertTrue(written["cover"])
        with open(original, "rb") as f:
            self.assertEqual(f.read(), before, "the original is never changed")
        row = self.log_rows()[-1]
        self.assertEqual(row["status"], "ok")
        self.assertIn(curate.AUTO_NOTE, row["notes"])

    def test_the_page_says_how_it_got_in(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertEqual(self.page_song("A - Song.mp3")["trust"], "auto")

    def test_running_again_adds_nothing_and_looks_nothing_up(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.fake.calls.clear()
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], self.fake.calls), (0, 0, []))
        self.assertEqual(len(self.log_rows()), 1)

    def test_a_song_it_cannot_settle_waits_with_the_reason_and_the_versions(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", "0:40")])
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], self.in_library()), (0, 1, []))
        entry = self.waiting()[KEY.format("A - Song")]
        self.assertIn("shorter", entry["why"])
        self.assertEqual([o["title"] for o in entry["options"]], ["Song"])
        self.assertEqual(entry["record"]["genre"], "Acid")

    def test_the_page_shows_the_reason_and_the_versions(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", "0:40")])
        self.run_it()
        song = self.page_song("A - Song.mp3")
        check = next(c for c in song["checks"] if c["kind"] == "waiting")
        self.assertIn("shorter", check["why"])
        self.assertEqual(check["options"][0]["pos"], "A1")
        self.assertEqual(check["record"]["title"], "The Record")
        self.assertTrue(song["looked"])

    def test_a_song_nobody_has_looked_at_is_marked_so(self):
        self.file("A - Song")
        self.assertFalse(self.page_song("A - Song.mp3")["looked"])

    def test_several_versions_on_a_record_wait_for_your_ears(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song (One Mix)", "0:30"), ("A2", "Song (Two Mix)", "0:50")])
        self.run_it()
        self.assertEqual([o["pos"] for o in self.waiting()[KEY.format("A - Song")]["options"]], ["A1", "A2"])

    def test_a_song_discogs_does_not_have_waits(self):
        self.file("A - Song")
        self.run_it()
        entry = self.waiting()[KEY.format("A - Song")]
        self.assertIn("not found", entry["why"])
        self.assertNotIn("options", entry)

    def test_files_that_are_not_songs_are_not_looked_up(self):
        self.file("Nightcore - Song")
        self.file("Someone reacts to A - Song")
        self.run_it()
        self.assertEqual(self.fake.calls, [])
        self.assertEqual(len(self.waiting()), 2)

    def test_a_name_the_wrong_way_round_is_found(self):
        self.file("Song - A")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])

    def test_the_files_own_tags_are_tried(self):
        self.file("track01 - unknown", artist="A", title="Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])

    def test_a_song_already_in_the_library_is_not_added_twice(self):
        self.song("Acid", "A - Song", notes="")
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        _, done = self.run_it()
        self.assertEqual(done["added"], 0)
        self.assertIn("lready in your library", self.waiting()[KEY.format("A - Song")]["why"])

    def test_two_copies_in_one_run_go_in_once(self):
        self.file("A - Song")
        self.file("A - Song (2)")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        _, done = self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])
        self.assertEqual(done["added"], 1)

    def test_a_cover_that_is_not_a_picture_is_left_out(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        with mock.patch.object(discogs, "_request", lambda url, binary=False: b"<html>nope</html>"):
            self.run_it()
        self.assertFalse(library.read_song(os.path.join(self.lib, "Acid", "A - Song.mp3"))["cover"])

    def test_a_cover_from_anywhere_else_is_never_fetched(self):
        self.assertEqual(curate.fetch_cover("https://example.com/x.jpg", self.root), "")
        self.assertEqual(curate.fetch_cover("https://discogs.com.example.org/x.jpg", self.root), "")
        self.assertEqual(self.fake.images, [])

    def test_a_toss_up_goes_in_and_asks_about_the_genre(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)], styles=("Acid", "Techno"))
        self.run_it()
        song = self.page_song("A - Song.mp3")
        self.assertEqual([c["kind"] for c in song["checks"]][:1], ["genre"])

    def test_picking_a_version_adds_it_and_clears_the_answer(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song (One Mix)", "0:30"), ("A2", "Song (Two Mix)", "0:50")], year=1997)
        self.run_it()
        self.answer_for("A - Song", "pick", "A2|Song (Two Mix)")
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (1, 0))
        self.assertEqual(self.in_library(), ["Acid/A - Song (Two Mix).mp3"])
        self.assertIn(curate.PICK_NOTE, self.log_rows()[-1]["notes"])
        self.assertEqual(self.log_rows()[-1]["year"], "1997")
        self.assertEqual(self.saved(), {})
        self.assertEqual(self.page_song("A - Song (Two Mix).mp3")["trust"], "auto")

    def test_a_pick_that_no_longer_exists_is_looked_up_again(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", "0:40")])
        self.run_it()
        self.answer_for("A - Song", "pick", "Z9|Gone")
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (0, 1))
        self.assertEqual(self.saved(), {})

    def test_saying_what_it_is_looks_that_up_instead(self):
        self.file("Unknown - Track")
        self.fake.add("Real", "The Record", [("A1", "Name", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Real - Name.mp3"])
        self.assertEqual(self.saved(), {})

    def test_when_what_you_said_is_not_found_it_tells_you(self):
        self.file("Unknown - Track")
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        self.run_it()
        self.assertIn('You said "Real - Name"', self.waiting()[KEY.format("Unknown - Track")]["why"])
        self.assertEqual(self.saved(), {}, "the question comes back, to answer again")

    def test_a_note_that_is_not_a_name_stays_for_a_person_or_an_agent(self):
        self.file("Unknown - Track")
        self.answer_for("Unknown - Track", "identify", "my friend's band, ask me later")
        self.run_it()
        self.assertEqual(self.fake.calls, [])
        self.assertIn(f"waiting:{KEY.format('Unknown - Track')}", self.saved())

    def test_saying_what_it_is_works_for_files_it_would_not_look_up(self):
        self.file("Nightcore - Song")
        self.fake.add("Real", "The Record", [("A1", "Name", LENGTH)])
        self.answer_for("Nightcore - Song", "identify", "Real - Name")
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Real - Name.mp3"])

    def test_songs_you_set_aside_are_left_alone(self):
        self.file("A - One")
        self.file("B - Two")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        self.fake.add("B", "Record", [("A1", "Two", LENGTH)])
        self.answer_for("A - One", "keep")
        self.answer_for("B - Two", "drop")
        self.run_it()
        self.assertEqual((self.fake.calls, self.in_library()), ([], []))
        self.assertEqual(len(self.saved()), 2)

    def test_a_dry_run_changes_nothing(self):
        self.file("A - Song")
        self.file("B - Nope")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        outside_the_cache = lambda tree: {k: v for k, v in tree.items() if ".cache" not in k}  # noqa: E731
        before = outside_the_cache(self.tree())
        _, done = self.run_it(dry_run=True)
        self.assertEqual((done["added"], done["waiting"]), (1, 1))
        self.assertEqual(outside_the_cache(self.tree()), before)
        self.assertEqual(self.fake.images, [])

    def test_stopping_keeps_what_was_done(self):
        for name in ("A - One", "B - Two"):
            self.file(name)
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        self.fake.add("B", "Record", [("A1", "Two", LENGTH)])
        stopping = threading.Event()
        def progress(**state):
            if state.get("total") and state.get("done") == 0:  # while the first song is being looked up
                stopping.set()
        _, done = self.run_it(stopping=stopping, progress=progress)
        self.assertTrue(done["stopped"])
        self.assertEqual(self.in_library(), ["Acid/A - One.mp3"])
        _, again = self.run_it()
        self.assertEqual(again["added"], 1)
        self.assertEqual(self.in_library(), ["Acid/A - One.mp3", "Acid/B - Two.mp3"])

    def test_a_lookup_that_fails_once_only_holds_that_song(self):
        for name in ("A - One", "B - Two"):
            self.file(name)
        self.fake.add("B", "Record", [("A1", "Two", LENGTH)])
        self.fake.errors = [OSError("connection reset")]
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (1, 1))
        self.assertIn("try again", self.waiting()[KEY.format("A - One")]["why"])

    def test_after_three_failures_in_a_row_it_stops_and_keeps_the_rest(self):
        for name in ("A - One", "B - Two", "C - Three", "D - Four", "E - Five"):
            self.file(name)
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        calls = iter([None, RuntimeError("down"), RuntimeError("down"), RuntimeError("down")])
        real = self.fake.search
        def flaky(**kw):
            error = next(calls, None)
            if error:
                raise error
            return real(**kw)
        with mock.patch.object(discogs, "search", flaky):
            run = curate.Run(self.paths, say=lambda _: None)
            with self.assertRaises(curate.Stop) as stopped:
                run.go()
        self.assertIn("isn't answering", str(stopped.exception))
        self.assertEqual(self.in_library(), ["Acid/A - One.mp3"])
        self.assertEqual(len(self.waiting()), 3)

    def test_an_odd_answer_about_one_song_only_holds_that_song(self):
        for name in ("A - One", "B - Two"):
            self.file(name)
        self.fake.add("B", "Record", [("A1", "Two", LENGTH)])
        self.fake.errors = [KeyError("title")]
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (1, 1))
        self.assertIn("went wrong", self.waiting()[KEY.format("A - One")]["why"])

    def test_a_token_discogs_refuses_stops_the_run(self):
        self.file("A - One")
        self.fake.errors = [urllib.error.HTTPError("https://api.discogs.com", 401, "error", email.message.Message(), io.BytesIO(b""))]
        with self.assertRaises(curate.Stop) as stopped:
            self.run_it()
        self.assertIn("token", str(stopped.exception))

    def test_other_audio_is_listed_but_not_looked_up(self):
        with open(os.path.join(self.inbox, "A - Song.flac"), "wb") as f:
            f.write(b"fLaC")
        self.run_it()
        self.assertEqual(self.waiting()[KEY.format("A - Song").replace(".mp3", ".flac")]["why"], curate.ONLY_MP3)

    def test_an_answers_file_that_cannot_be_read_stops_it_before_anything_changes(self):
        self.file("A - One")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        with open(self.answers, "w", encoding="utf-8") as f:
            f.write("{ not json")
        with self.assertRaises(curate.Stop):
            self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_log_that_cannot_be_written_stops_it_before_anything_changes(self):
        self.file("A - One")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        with mock.patch.object(tagwriter, "Writer", side_effect=PermissionError(13, "in use")):
            with self.assertRaises(curate.Stop) as stopped:
                self.run_it()
        self.assertIn("close it", str(stopped.exception))
        self.assertEqual(self.in_library(), [])

    def test_a_naming_rule_that_cannot_be_filled_only_holds_that_song(self):
        self.file("A - One")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        with mock.patch.dict(config.cfg()["rules"], {"filename": "{nonsense}"}):
            _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (0, 1))
        self.assertIn("couldn't be written", self.waiting()[KEY.format("A - One")]["why"])

    def test_a_downloads_folder_that_is_gone_says_so(self):
        os.rmdir(self.inbox)
        with self.assertRaises(curate.Stop) as stopped:
            self.run_it()
        self.assertIn("can't be found", str(stopped.exception))

    def test_a_song_that_left_stops_waiting(self):
        path = self.file("A - One")
        self.run_it()
        self.assertEqual(len(self.waiting()), 1)
        os.remove(path)
        self.run_it()
        self.assertEqual(self.waiting(), {})

    def test_what_is_missing_is_said_plainly(self):
        with mock.patch.object(curate.shutil, "which", return_value=None):
            self.assertIn("ffmpeg", curate.missing(self.paths))
        def no_token():
            raise SystemExit("DISCOGS_TOKEN is not set")
        with mock.patch.object(discogs, "token", no_token):
            self.assertIn("DISCOGS_TOKEN", curate.missing(self.paths))
        self.assertIn("folders", curate.missing(dict(self.paths, inbox=[])))
        self.assertEqual(curate.missing(self.paths), "")

    def test_the_command_says_what_happened(self):
        self.file("A - Song")
        self.file("B - Nope")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        out = io.StringIO()
        with mock.patch("sys.stdout", out):
            code = cli.main(["--config", self.cfg, "curate"])
        self.assertEqual(code, 0)
        self.assertIn("Added 1 song", out.getvalue())
        self.assertIn("1 waiting", out.getvalue())

    def test_the_command_says_when_there_is_nothing(self):
        out = io.StringIO()
        with mock.patch("sys.stdout", out):
            cli.main(["--config", self.cfg, "curate"])
        self.assertIn("Nothing is waiting", out.getvalue())

    def test_a_log_that_was_cut_off_mid_line_is_not_written_onto(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        with open(self.log, "w", newline="", encoding="utf-8-sig") as f:
            f.write(",".join(tagwriter.LOG_FIELDS) + "\r\n2026-01-01T00:00:00,ok,C:/x.mp3")
        self.run_it()
        rows = self.log_rows()
        self.assertEqual([r["status"] for r in rows], ["ok", "ok"])
        self.assertIn(curate.AUTO_NOTE, rows[-1]["notes"])


class WhatTheReviewFound(WithDiscogs):
    """Each of these once went wrong."""

    def fuzzy_search(self):
        patcher = mock.patch.object(discogs, "search", self.fake.everything)
        patcher.start()
        self.addCleanup(patcher.stop)

    def two_versions(self, artist="A", title="Song"):
        self.fake.add(artist, "The Record", [("A1", f"{title} (One Mix)", "0:30"), ("A2", f"{title} (Two Mix)", "0:50")])

    # -- whose song is it? --

    def test_who_counts_as_the_same_artist(self):
        for named, credited, same in (("John Smith", "John Williams", False), ("Eve", "Steven Wilson", False), ("Air", "Fairground", False), ("Sasha", "Zed", False), ("東京事変", "大阪", False), ("", "Someone", False),
                                      ("DJ Sharpnel", "Sharpnel", True), ("Mr Burns & Geezer", "Mr. Burns & The Geezer", True), ("Ann Bee & Cid Dee", "Cid Dee", True), ("Cid Dee", "Ann Bee & Cid Dee", True),
                                      ("Above and Beyond", "Above & Beyond", True), ("Earth Wind & Fire", "Earth, Wind & Fire", True), ("東京事変", "東京事変", True), ("A", "A", True)):
            self.assertEqual(curate.same_artist(named, credited), same, (named, credited))

    def test_another_artists_song_does_not_go_in(self):
        self.fuzzy_search()
        self.file("John Smith - Angel")
        self.fake.add("John Williams", "Record", [("A1", "Angel", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])
        self.assertIn("John Williams", self.waiting()[KEY.format("John Smith - Angel")]["why"])

    def test_titles_in_other_scripts_do_not_all_match(self):
        self.file("Foo - 東京")
        self.fake.add("Foo", "Record", [("A1", "大阪", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_title_in_another_script_matches_itself(self):
        self.file("Foo - 東京")
        self.fake.add("Foo", "Record", [("A1", "東京", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Foo - 東京.mp3"])

    def test_songs_in_other_scripts_are_not_duplicates_of_each_other(self):
        write_mp3(os.path.join(self.lib, "Acid", "Foo - 東京.mp3"), artist="Foo", title="東京")
        self.file("Foo - 大阪")
        self.fake.add("Foo", "Record", [("A1", "大阪", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Foo - 大阪.mp3", "Acid/Foo - 東京.mp3"])

    # -- which version is it? --

    def test_a_version_after_a_second_dash_counts(self):
        self.file("A - Song - Slowed")
        self.fake.add("A", "Record", [("A1", "Song", "")])
        self.run_it()
        self.assertEqual(self.in_library(), [])
        self.assertIn("Slowed", self.waiting()[KEY.format("A - Song - Slowed")]["why"])

    def test_a_note_in_a_name_that_found_nothing_still_counts(self):
        self.file("Slowed Channel - Song (Slowed)", artist="Aaa", title="Song")
        self.fake.add("Aaa", "Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_sibling_with_no_length_means_length_cannot_settle_it(self):
        self.file("A - Song")
        self.fake.add("A", "Record", [("A1", "Song (One Mix)", LENGTH), ("A2", "Song (Two Mix)", "")])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_stray_letter_is_not_a_mix_name(self):
        self.assertFalse(resolve.mix_matches("B Mix", "Song (Club Mix)"))
        self.assertFalse(resolve.mix_matches("A Mix", "Tune (Acid Mix)"))
        self.assertTrue(resolve.mix_matches("Acid Mix", "Tune (Acid Mix)"))

    def test_a_title_with_an_equals_sign_stays_whole(self):
        self.file("A - Love = Pain")
        self.fake.add("A", "Record", [("A1", "Love = Pain", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - Love = Pain.mp3"])

    def test_a_translated_title_still_keeps_its_latin_part(self):
        self.assertEqual(resolve.clean_title("Cyclick = サイクリック", "A1", "X")[0], "Cyclick")
        self.assertEqual(resolve.clean_title("危ないベースライン = Bassline Crisis", "A1", "X")[0], "Bassline Crisis")

    def test_a_different_mix_in_the_library_is_only_probably_the_same(self):
        write_mp3(os.path.join(self.lib, "Acid", "A - Song (Club Mix).mp3"), artist="A", title="Song (Club Mix)")
        self.file("A - Song")
        self.fake.add("A", "Record", [("A1", "Song", LENGTH)])
        self.run_it()
        entry = self.waiting()[KEY.format("A - Song")]
        self.assertIn("probably", entry["why"])
        self.answer_for("A - Song", "pick", entry["options"][0]["id"])
        self.run_it()
        self.assertIn("Acid/A - Song.mp3", self.in_library())

    def test_the_exact_same_song_is_still_a_duplicate(self):
        write_mp3(os.path.join(self.lib, "Acid", "A - Song.mp3"), artist="A", title="Song")
        self.file("A - Song")
        self.fake.add("A", "Record", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertNotIn("options", self.waiting()[KEY.format("A - Song")])

    # -- genres --

    def test_a_song_that_never_went_in_does_not_decide_a_genre(self):
        self.file("A - One")
        self.file("A - Two")
        self.fake.add("A", "Record", [("A1", "One", "0:40")], styles=("Acid", "Techno"))
        self.fake.add("A", "Other", [("A1", "Two", LENGTH)], styles=("Techno", "Acid"))
        self.run_it()
        self.assertEqual(self.in_library(), ["Techno/A - Two.mp3"])
        self.assertIn("toss-up", self.log_rows()[-1]["notes"])

    def test_an_unjudged_genre_does_not_decide_the_next_song(self):
        self.file("A - One")
        self.file("A - Two")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)], styles=("Acid", "Techno"))
        self.fake.add("A", "Other", [("A1", "Two", LENGTH)], styles=("Techno", "Acid"))
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - One.mp3", "Techno/A - Two.mp3"])

    def test_the_next_run_does_not_trust_an_unjudged_genre_either(self):
        self.file("A - One")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)], styles=("Acid", "Techno"))
        self.run_it()
        self.file("A - Two")
        self.fake.add("A", "Other", [("A1", "Two", LENGTH)], styles=("Techno", "Acid"))
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/A - One.mp3", "Techno/A - Two.mp3"])

    # -- the token --

    def test_an_error_quoting_the_token_reaches_neither_a_file_nor_the_page(self):
        self.file("A - One")
        self.fake.errors = [ValueError("Invalid header value b'Discogs token=S3CRET-VALUE'")]
        with mock.patch.object(discogs, "_tok", ["S3CRET-VALUE"]):
            self.run_it()
        with open(webapp.curated_path(self.paths), encoding="utf-8") as f:
            self.assertNotIn("S3CRET", f.read())

    def test_even_a_message_that_quotes_it_is_cleaned(self):
        self.file("A - One")
        with mock.patch.object(discogs, "_tok", ["S3CRET-VALUE"]), mock.patch.object(curate, "NOT_LOOKED_UP", {"candidate": "x"}):
            run = curate.Run(self.paths, say=lambda _: None)
            run.hold("inbox/Downloads/x.mp3", "it said S3CRET-VALUE here")
        self.assertNotIn("S3CRET", run.songs["inbox/Downloads/x.mp3"]["why"])

    # -- your answers --

    def held_with_a_pick(self):
        self.file("A - Song")
        self.two_versions()
        self.run_it()
        self.answer_for("A - Song", "pick", "A1|Song (One Mix)")

    def while_the_first_song_is_looked_up(self, change):
        self.file("0 - First")
        done = []
        def progress(**state):
            if state.get("total") and state.get("done") == 0 and not done:
                done.append(True)
                change()
        return progress

    def test_a_pick_changed_during_a_run_is_the_one_that_counts(self):
        self.held_with_a_pick()
        self.run_it(progress=self.while_the_first_song_is_looked_up(lambda: self.answer_for("A - Song", "pick", "A2|Song (Two Mix)")))
        self.assertEqual(self.in_library(), ["Acid/A - Song (Two Mix).mp3"])

    def test_a_pick_undone_during_a_run_is_not_carried_out(self):
        self.held_with_a_pick()
        def undo():
            with open(self.answers, "w", encoding="utf-8") as f:
                json.dump({}, f)
        self.run_it(progress=self.while_the_first_song_is_looked_up(undo))
        self.assertEqual(self.in_library(), [])

    def test_not_worth_keeping_during_a_run_is_respected(self):
        self.file("A - Song")
        self.fake.add("A", "Record", [("A1", "Song", LENGTH)])
        self.run_it(progress=self.while_the_first_song_is_looked_up(lambda: self.answer_for("A - Song", "drop")))
        self.assertEqual(self.in_library(), [])

    def test_a_newer_answer_is_not_taken_off_the_list(self):
        self.answer_for("A - Song", "pick", "new")
        curate.Run(self.paths, say=lambda _: None)._take_off_list(f"waiting:{KEY.format('A - Song')}", dict(action="pick", note="old"))
        self.assertIn(f"waiting:{KEY.format('A - Song')}", self.saved())

    def test_a_pick_that_cannot_be_written_keeps_the_answer_and_the_versions(self):
        self.held_with_a_pick()
        with open(os.path.join(self.lib, "Acid"), "w", encoding="utf-8") as f:  # a file where the genre's folder should go
            f.write("x")
        self.run_it()
        self.assertIn(f"waiting:{KEY.format('A - Song')}", self.saved())
        self.assertEqual(len(self.waiting()[KEY.format("A - Song")]["options"]), 2)

    def test_what_you_said_is_remembered_when_it_needs_another_answer(self):
        self.file("Unknown - Track")
        self.two_versions("Real", "Name")
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        self.run_it()
        self.assertEqual(self.saved(), {})
        self.run_it()
        entry = self.waiting()[KEY.format("Unknown - Track")]
        self.assertEqual(len(entry["options"]), 2, "the next run goes by what you said, not the file's name")
        self.answer_for("Unknown - Track", "pick", entry["options"][1]["id"])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Real - Name (Two Mix).mp3"])

    def test_dashes_of_any_kind_work_in_what_you_type(self):
        self.assertEqual(curate.said_names("Real – Name"), ("Real", "Name"))
        self.assertEqual(curate.said_names("Real — Name"), ("Real", "Name"))
        self.assertIsNone(curate.said_names("my friend's band"))

    # -- the waiting list --

    def test_a_read_that_fails_leaves_the_waiting_list_alone(self):
        self.file("A - One")
        self.run_it()
        before = self.waiting()
        self.assertTrue(before)
        with mock.patch.object(parse, "read_inbox", side_effect=PermissionError(13, "denied")), self.assertRaises(curate.Stop):
            self.run_it()
        self.assertEqual(self.waiting(), before)

    def test_one_odd_byte_in_the_log_does_not_stop_it(self):
        self.file("A - One")
        self.fake.add("A", "Record", [("A1", "One", LENGTH)])
        with open(self.log, "wb") as f:
            f.write(",".join(tagwriter.LOG_FIELDS).encode() + b"\r\n2026-01-01,ok,C:/caf\xe9.mp3\r\n")
        _, done = self.run_it()
        self.assertEqual(done["added"], 1)

    def test_a_folder_that_is_unplugged_keeps_its_waiting_songs(self):
        other = os.path.join(self.root, "Other")
        write_mp3(os.path.join(other, "B - Two.mp3"), artist="", title="", album="", discogs="", genre="Other", year="")
        self.file("A - One")
        self.paths = dict(self.paths, inbox=[self.inbox, other])
        self.run_it()
        self.assertEqual(len(self.waiting()), 2)
        os.rename(other, other + " away")
        self.addCleanup(os.rename, other + " away", other)
        self.run_it()
        self.assertEqual(len(self.waiting()), 2)

    def test_a_network_blip_keeps_the_versions_and_counts_as_not_looked_at(self):
        self.file("A - Song")
        self.two_versions()
        self.run_it()
        self.assertTrue(self.page_song("A - Song.mp3")["looked"])
        self.fake.errors = [OSError("connection reset")]
        self.run_it()
        entry = self.waiting()[KEY.format("A - Song")]
        self.assertEqual((len(entry["options"]), entry["retry"]), (2, True))
        self.assertFalse(self.page_song("A - Song.mp3")["looked"], "so the page still offers the button")

    def test_trying_again_after_a_blip_clears_it(self):
        self.file("A - Song")
        self.two_versions()
        self.fake.errors = [OSError("connection reset")]
        self.run_it()
        self.run_it()
        self.assertNotIn("retry", self.waiting()[KEY.format("A - Song")])

    # -- only one at a time, and honest records --

    def test_a_second_run_on_the_same_library_is_refused(self):
        self.file("A - One")
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")), self.assertRaises(curate.Stop) as stopped:
            self.run_it()
        self.assertIn("already running", str(stopped.exception))

    def test_the_lock_is_let_go_afterwards(self):
        self.file("A - One")
        self.run_it()
        self.run_it()

    def test_a_skipped_row_does_not_take_over_the_songs_record(self):
        self.song("Acid", "A - Song", notes="")
        before = self.page_song("A - Song.mp3")
        self.rows.append({**self.rows[0], "status": "skipped: already in library (x)", "src": "C:/rejected.mp3", "notes": "picked by you from the versions on the record", "date": "2026-02-02T00:00:00"})
        self.save_log()
        after = self.page_song("A - Song.mp3")
        self.assertEqual((after["trust"], after["was"], after["added"], after["notes"]), (before["trust"], before["was"], before["added"], before["notes"]))

    def test_a_song_written_with_something_to_check_counts_as_done(self):
        path = self.file("A - Song")
        self.rows.append(dict(zip(tagwriter.LOG_FIELDS, ["2026-01-02T03:04:05", "check: cover missing", path, "", "", "", "5", os.path.join(self.lib, "Acid", "A - Song.mp3"), "A", "Song", "", "1996", "Acid", "", "", ""])))
        self.save_log()
        self.assertTrue(self.page_song("A - Song.mp3")["done"])
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], self.fake.calls), (0, 0, []))


class TokenFormat(Base):
    def setUp(self):
        super().setUp()
        for patcher in (mock.patch.object(discogs, "_tok", [None]), mock.patch.object(discogs.sys, "platform", "not-windows"), mock.patch.dict(os.environ)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_stray_spaces_and_line_ends_are_cleaned(self):
        os.environ["DISCOGS_TOKEN"] = "abc123\r\n"
        self.assertEqual(discogs.token(), "abc123")

    def test_a_token_that_cannot_be_right_is_refused_without_being_repeated(self):
        os.environ["DISCOGS_TOKEN"] = "“abc 123”"
        with self.assertRaises(SystemExit) as stopped:
            discogs.token()
        self.assertIn("can't be right", str(stopped.exception))
        self.assertNotIn("abc", str(stopped.exception))

    def test_curly_quotes_around_it_in_the_file_are_cleaned(self):
        os.environ.pop("DISCOGS_TOKEN", None)
        with open(os.path.join(self.root, ".env"), "w", encoding="utf-8") as f:
            f.write("DISCOGS_TOKEN=“abc123”\n")
        self.assertEqual(discogs.token(), "abc123")

    def test_the_page_says_so_plainly(self):
        os.environ["DISCOGS_TOKEN"] = "not a token"
        with mock.patch.object(curate.shutil, "which", return_value="found"):
            self.assertIn("can't be right", curate.missing(webapp.app_paths()))


class MarkingVerified(WithDiscogs):
    def auto(self, name="A - Song", notes="matched automatically: only version on the record, length matches the record; genre toss-up: Acid / Techno"):
        self.song("Acid", name, notes=notes)

    def mark(self, *names):
        out = io.StringIO()
        with mock.patch("sys.stdout", out):
            code = cli.main(["--config", self.cfg, "verified", *names, "--how", "fingerprint matches the Discogs-linked video"])
        return code, out.getvalue()

    def test_a_checked_song_stops_being_auto_matched(self):
        self.auto()
        self.assertEqual(self.page_song("A - Song.mp3")["trust"], "auto")
        code, out = self.mark("Acid/A - Song.mp3")
        self.assertEqual(code, 0)
        self.assertIn("1 verified", out)
        self.assertEqual(self.page_song("A - Song.mp3")["trust"], "verified")

    def test_the_log_says_what_was_checked_and_keeps_the_rest(self):
        self.auto()
        self.mark("Acid/A - Song.mp3")
        notes = self.log_rows()[-1]["notes"]
        self.assertIn("verified: fingerprint matches the Discogs-linked video", notes)
        self.assertIn("genre toss-up: Acid / Techno", notes)
        self.assertNotIn(curate.AUTO_NOTE, notes)

    def test_a_song_you_picked_can_be_checked_too(self):
        self.auto(notes=f"{curate.PICK_NOTE} from the versions on the record")
        self.mark("A - Song.mp3")
        self.assertEqual(self.page_song("A - Song.mp3")["trust"], "verified")

    def test_when_it_arrived_does_not_change(self):
        self.auto()
        before = self.page_song("A - Song.mp3")
        self.mark("A - Song.mp3")
        after = self.page_song("A - Song.mp3")
        self.assertEqual((after["added"], after["was"]), (before["added"], before["was"]))

    def test_a_song_that_was_not_auto_matched_is_left_alone(self):
        self.auto(notes="")
        rows = len(self.log_rows())
        code, out = self.mark("A - Song.mp3")
        self.assertIn("wasn't Auto-matched", out)
        self.assertEqual((code, len(self.log_rows())), (0, rows))

    def test_a_song_that_is_not_there_is_reported(self):
        self.auto()
        code, out = self.mark("Nope.mp3")
        self.assertEqual(code, 1)
        self.assertIn("not found", out)

    def test_two_songs_with_one_name_need_their_folder(self):
        self.auto()
        self.song("Techno", "A - Song", notes=curate.AUTO_NOTE)
        code, out = self.mark("A - Song.mp3")
        self.assertEqual(code, 1)
        self.assertIn("give its folder", out)


class FromThePage(WithDiscogs):
    def setUp(self):
        super().setUp()
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.server.curate_lock = threading.Lock()  # shared on the class otherwise
        self.server.curate_state, self.server.curate_stop = None, None
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(self.paths), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def call(self, method, route, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, route, body=body, headers=headers or {})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if "json" in (r.getheader("Content-Type") or "") else {}

    def post(self, route="/api/curate", headers=None, body="{}"):
        return self.call("POST", route, body, {"Content-Type": "application/json", **(headers or {})})

    def wait(self):
        deadline = time.time() + 20
        while time.time() < deadline:
            _, state = self.call("GET", "/api/curate")
            if not state["running"]:
                return state
            time.sleep(.03)
        self.fail("Curate never finished")

    def test_the_button_runs_it_and_the_page_can_follow(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])
        status, answer = self.post()
        self.assertEqual((status, answer), (200, dict(started=True)))
        state = self.wait()
        self.assertEqual((state["result"]["added"], state["failed"]), (1, ""))
        _, everything = self.call("GET", "/api/all")
        self.assertEqual(everything["meta"]["curate"]["result"]["added"], 1)
        self.assertEqual([s["trust"] for s in everything["songs"] if s["area"] == "library"], ["auto"])

    def test_one_run_at_a_time(self):
        self.assertTrue(self.server.curate_lock.acquire(blocking=False))
        self.addCleanup(self.server.curate_lock.release)
        status, answer = self.post()
        self.assertEqual(status, 400)
        self.assertIn("already running", answer["error"])

    def test_it_will_not_start_when_something_is_missing(self):
        def no_token():
            raise SystemExit("not set")
        with mock.patch.object(discogs, "token", no_token):
            status, answer = self.post()
        self.assertEqual(status, 400)
        self.assertIn("DISCOGS_TOKEN", answer["error"])
        self.assertTrue(self.server.curate_lock.acquire(blocking=False), "a refused start doesn't keep the lock")
        self.server.curate_lock.release()

    def test_another_site_cannot_start_it(self):
        status, _ = self.post(headers={"Origin": "https://evil.example"})
        self.assertEqual(status, 403)
        self.assertIsNone(self.server.curate_state)

    def test_a_plain_form_cannot_start_it(self):
        status, _ = self.call("POST", "/api/curate", "{}", {"Content-Type": "text/plain"})
        self.assertEqual(status, 415)
        self.assertIsNone(self.server.curate_state)

    def test_folders_cannot_change_during_a_run(self):
        self.assertTrue(self.server.curate_lock.acquire(blocking=False))
        self.addCleanup(self.server.curate_lock.release)
        status, answer = self.post("/api/settings", body=json.dumps(dict(library=self.lib, inbox=[self.inbox])))
        self.assertEqual(status, 409)
        self.assertIn("Curate is running", answer["error"])

    def test_stop_finishes_the_song_in_hand(self):
        for name in ("A - One", "B - Two"):
            self.file(name)
        started, carry_on = threading.Event(), threading.Event()
        real = self.fake.search
        def slow(**kw):
            started.set()
            carry_on.wait(5)
            return real(**kw)
        with mock.patch.object(discogs, "search", slow):
            self.post()
            started.wait(5)
            self.assertEqual(self.post("/api/curate/stop")[0], 200)
            carry_on.set()
            state = self.wait()
        self.assertTrue(state["result"]["stopped"])

    def test_a_crash_never_leaves_it_running(self):
        self.file("A - Song")
        with mock.patch.object(curate.Run, "go", side_effect=ValueError("boom")):
            self.post()
            state = self.wait()
        self.assertIn("unexpectedly", state["failed"])
        self.assertNotIn("boom", state["failed"], "an error's own words could quote the token")
        self.assertTrue(self.server.curate_lock.acquire(blocking=False))
        self.server.curate_lock.release()

    def test_the_page_can_tell_it_is_stopping(self):
        self.file("A - One")
        started, carry_on = threading.Event(), threading.Event()
        def slow(**kw):
            started.set()
            carry_on.wait(5)
            return []
        with mock.patch.object(discogs, "search", slow):
            self.post()
            started.wait(5)
            self.assertFalse(self.call("GET", "/api/curate")[1]["stopping"])
            self.post("/api/curate/stop")
            self.assertTrue(self.call("GET", "/api/curate")[1]["stopping"])
            carry_on.set()
            self.wait()
        self.assertFalse(self.call("GET", "/api/curate")[1]["stopping"])

    def test_a_pick_is_saved_from_the_page(self):
        self.file("A - Song")
        self.fake.add("A", "The Record", [("A1", "Song", "0:40")])
        self.post()
        self.wait()
        _, everything = self.call("GET", "/api/all")
        song = next(s for s in everything["songs"] if s["area"] == "inbox")
        option = song["checks"][0]["options"][0]
        status, _ = self.post("/api/decision", body=json.dumps(dict(id=song["id"], kind="waiting", action="pick", note=option["id"])))
        self.assertEqual(status, 200)
        self.post()
        state = self.wait()
        self.assertEqual(state["result"]["added"], 1)
        self.assertEqual(self.in_library(), ["Acid/A - Song.mp3"])
        self.assertEqual(self.saved(), {})

    def test_only_discogs_links_reach_the_page(self):
        self.file("A - Song")
        with open(webapp.curated_path(self.paths), "w", encoding="utf-8") as f:
            json.dump(dict(songs={KEY.format("A - Song"): dict(why="x", record=dict(discogs="javascript:alert(1)"), options=[])}), f)
        _, everything = self.call("GET", "/api/all")
        self.assertNotIn("record", next(s for s in everything["songs"] if s["area"] == "inbox")["checks"][0])

    def test_a_broken_list_of_waiting_songs_is_ignored(self):
        self.file("A - Song")
        with open(webapp.curated_path(self.paths), "w", encoding="utf-8") as f:
            f.write("{ not json")
        status, everything = self.call("GET", "/api/all")
        self.assertEqual(status, 200)
        self.assertFalse(next(s for s in everything["songs"] if s["area"] == "inbox")["looked"])

