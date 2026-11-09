"""Play counts: what the player reports, and what's kept of it."""

import http.client
import json
import os
import shutil
import sys
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import export, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


class Names(unittest.TestCase):
    def key(self, **extra):
        return webapp.play_key({**dict(artist="A", title="Song", file="A - Song.mp3", key="library/Acid/A - Song.mp3"), **extra})

    def test_where_the_file_is_and_what_its_called_dont_matter(self):
        self.assertEqual(self.key(), self.key(file="other.mp3", key="library/Techno/other.mp3"))

    def test_spelling_of_case_and_accents_doesnt_matter(self):
        self.assertEqual(self.key(artist="Á", title="SONG"), self.key())

    def test_two_mixes_are_two_songs(self):
        self.assertNotEqual(self.key(title="Song (Barn Mix)"), self.key(title="Song (Dub)"))

    def test_a_song_with_no_tags_goes_by_its_file_name(self):
        self.assertNotEqual(self.key(artist="", title="", file="one.mp3"), self.key(artist="", title="", file="two.mp3"))

    def test_a_name_with_no_letters_at_all_still_has_a_key(self):
        self.assertEqual(self.key(artist="", title="", file="!!!.mp3", key="library/!!!.mp3"), "library/!!!.mp3")


class FromThePlayer(Base):
    def setUp(self):
        super().setUp()
        self.one = self.song("Acid", "A - One", notes="")
        self.two = self.song("Techno", "B - Two", notes="")
        self.counts = os.path.join(self.app, "plays.json")
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = None if body is None else json.dumps(body)
        c.request(method, path, body=data, headers={**({"Content-Type": "application/json"} if data is not None else {}), **(headers or {})})
        r = c.getresponse()
        payload = r.read()
        c.close()
        return r.status, json.loads(payload) if payload.startswith(b"{") else payload

    def song_at(self, path):
        self.server.collection.refresh()
        return next(s for s in self.server.collection.songs.values() if os.path.samefile(s["_path"], path))

    def play(self, path):
        return self.ask("POST", "/api/played", dict(id=self.song_at(path)["id"]))

    def test_each_play_adds_one(self):
        self.assertEqual(self.play(self.one)[0], 200)
        status, answer = self.play(self.one)
        self.assertEqual((status, answer["plays"]), (200, 2))
        self.assertRegex(answer["played"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$")

    def test_only_the_song_that_was_played_changes(self):
        self.play(self.one)
        self.assertEqual((self.song_at(self.one)["plays"], self.song_at(self.two)["plays"]), (1, 0))
        self.assertEqual(self.song_at(self.two)["played"], "")

    def test_the_page_gets_the_counts(self):
        self.play(self.one)
        status, answer = self.ask("GET", "/api/all")
        got = {s["title"]: s["plays"] for s in answer["songs"]}
        self.assertEqual((status, got), (200, {"One": 1, "Two": 0}))

    def test_counts_are_still_there_after_a_restart(self):
        self.play(self.one)
        again = webapp.Collection(webapp.app_paths())
        again.refresh()
        self.assertEqual(next(s["plays"] for s in again.songs.values() if s["title"] == "One"), 1)

    def test_the_first_and_last_time_are_both_kept(self):
        self.play(self.one)
        first = json.load(open(self.counts, encoding="utf-8"))
        entry = next(iter(first.values()))
        entry["first"], entry["last"] = "2020-01-01T00:00:00", "2020-01-02T00:00:00"
        with open(self.counts, "w", encoding="utf-8") as f:
            json.dump(first, f)
        self.play(self.one)
        entry = next(iter(json.load(open(self.counts, encoding="utf-8")).values()))
        self.assertEqual((entry["song"], entry["plays"], entry["first"]), ("A - One", 2, "2020-01-01T00:00:00"))
        self.assertGreater(entry["last"], "2020-01-02T00:00:00")

    def test_a_song_keeps_its_count_when_it_moves_folder(self):
        self.play(self.one)
        moved = os.path.join(self.lib, "Techno", "A - One.mp3")
        shutil.move(self.one, moved)
        self.assertEqual(self.song_at(moved)["plays"], 1)

    def test_a_song_keeps_its_count_when_a_better_copy_replaces_it(self):
        self.play(self.one)
        with open(self.one, "ab") as f:
            f.write(b"\xff\xfb\x90\x00" * 50)
        self.assertEqual(self.song_at(self.one)["plays"], 1)

    def test_nothing_is_left_behind_but_the_counts(self):
        self.play(self.one)
        self.assertFalse(os.path.exists(self.counts + ".tmp"))

    def test_a_song_it_doesnt_know_is_refused(self):
        status, answer = self.ask("POST", "/api/played", dict(id="nope"))
        self.assertEqual((status, answer["error"]), (400, "unknown song"))
        self.assertFalse(os.path.exists(self.counts))

    def test_a_file_that_cant_be_read_is_never_saved_over(self):
        for broken in ("not json at all", "[1, 2]"):
            with self.subTest(broken):
                with open(self.counts, "w", encoding="utf-8") as f:
                    f.write(broken)
                status, answer = self.play(self.one)
                self.assertEqual(status, 400)
                self.assertIn("plays.json", answer["error"])
                with open(self.counts, encoding="utf-8") as f:
                    self.assertEqual(f.read(), broken)

    def test_counting_starts_again_once_the_file_is_repaired(self):
        with open(self.counts, "w", encoding="utf-8") as f:
            f.write("not json")
        self.assertEqual(self.play(self.one)[0], 400)
        os.remove(self.counts)
        status, answer = self.play(self.one)
        self.assertEqual((status, answer["plays"]), (200, 1))

    def test_entries_that_make_no_sense_are_ignored(self):
        key = webapp.play_key(self.song_at(self.one))
        for wrong in ("many", -3, 0, True, 10 ** 7, None):
            with self.subTest(wrong):
                with open(self.counts, "w", encoding="utf-8") as f:
                    json.dump({key: dict(plays=wrong)}, f)
                self.assertEqual(self.song_at(self.one)["plays"], 0)

    def test_it_only_listens_to_its_own_page(self):
        id_ = self.song_at(self.one)["id"]
        self.assertEqual(self.ask("POST", "/api/played", dict(id=id_), headers={"Origin": "http://evil.example"})[0], 403)
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("POST", "/api/played", body=json.dumps(dict(id=id_)), headers={"Content-Type": "text/plain"})
        self.assertEqual(c.getresponse().status, 415)
        c.close()
        self.assertFalse(os.path.exists(self.counts))

    def test_before_there_are_folders_theres_nothing_to_count(self):
        self.server.collection = None
        status, answer = self.ask("POST", "/api/played", dict(id="x"))
        self.assertEqual((status, answer["error"]), (400, "choose your folders first"))


class WhenItArrived(Base):
    def added(self):
        c = webapp.Collection(webapp.app_paths())
        c.refresh()
        return next(iter(c.songs.values()))["added"]

    def test_a_better_copy_doesnt_make_a_song_new(self):
        self.song("Acid", "A - One", notes="")
        self.rows.append(dict(self.rows[-1], date="2026-06-01T00:00:00", src=os.path.join(self.app, "Set aside", "A - One.mp3")))
        self.save_log()
        self.assertEqual(self.added(), "2026-01-02T03:04:05")

    def test_a_song_first_written_from_two_places_keeps_the_earliest(self):
        self.song("Acid", "A - One", notes="", date="2026-03-01T00:00:00")
        self.rows.insert(0, dict(self.rows[-1], date="2026-02-01T00:00:00", src="C:/somewhere/else.mp3"))
        self.save_log()
        self.assertEqual(self.added(), "2026-02-01T00:00:00")

    def test_a_song_the_log_doesnt_know_has_no_date(self):
        write_mp3(os.path.join(self.lib, "Acid", "A - One.mp3"), genre="Acid", title="One", artist="A")
        self.assertEqual(self.added(), "")


class Spreadsheet(unittest.TestCase):
    def test_it_has_a_plays_column(self):
        base = dict(artist="A", title="S", album="", year="", genre="", label="", country="", secs=60, kbps=320, trust="verified", link="", _path="/m/a.mp3")
        lines = export.to_csv([{**base, "plays": 7}, base]).splitlines()
        at = lines[0].split(",").index("Plays")
        self.assertEqual((lines[1].split(",")[at], lines[2].split(",")[at]), ("7", "0"))


if __name__ == "__main__":
    unittest.main()
