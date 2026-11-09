"""Tests for getting songs out of the app: a playlist file, a spreadsheet, copies in a folder.

    python -m unittest discover -s tests
"""
import csv
import http.client
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import export, folders, webapp, config  # noqa: E402
from test_apply import Base  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


def song(**extra):
    return {**dict(artist="A", title="Song", album="", year="1996", genre="Acid", label="", country="", secs=61.4, kbps=320, trust="verified", link="", file="A - Song.mp3", _path="/music/A - Song.mp3", _rel="A - Song.mp3", bytes=1), **extra}


class Files(unittest.TestCase):
    def test_a_playlist_names_each_song_and_where_it_is(self):
        self.assertEqual(export.to_m3u([song(), song(artist="", title="", file="x.mp3", _path="/music/x.mp3", secs=None)]).splitlines(),
                         ["#EXTM3U", "#EXTINF:61,A - Song", "/music/A - Song.mp3", "#EXTINF:-1,x.mp3", "/music/x.mp3"])

    def test_a_line_break_in_a_tag_cannot_add_a_line_to_the_playlist(self):
        self.assertEqual(export.to_m3u([song(artist="A\n/evil/path.mp3\r\n#EXTINF:1,x")]).count("\n"), 3)

    def test_a_path_with_a_line_break_is_left_out(self):
        self.assertEqual(export.to_m3u([song(_path="/music/a\nb.mp3")]), "#EXTM3U\n")

    def rows(self, *songs):
        text = export.to_csv(list(songs))
        self.assertTrue(text.startswith("﻿"), "Excel needs the mark to read UTF-8")
        return list(csv.reader(io.StringIO(text[1:], newline="")))

    def test_a_spreadsheet_has_a_row_for_each_song(self):
        head, row = self.rows(song(album="妄殺", label="Harthouse", link="https://www.discogs.com/master/1"))
        got = dict(zip(head, row))
        self.assertEqual((got["Artist"], got["Album"], got["Label"], got["Seconds"], got["Kbps"], got["How sure"], got["File"]), ("A", "妄殺", "Harthouse", "61", "320", "Verified", "/music/A - Song.mp3"))

    def test_a_tag_that_looks_like_a_formula_cannot_run(self):
        for bad in ("=HYPERLINK(1)", "+1", "-1", "@x", "\tx"):
            row = dict(zip(*self.rows(song(title=bad))))
            self.assertEqual(row["Title"], "'" + bad)

    def test_ordinary_words_are_untouched(self):
        self.assertEqual(dict(zip(*self.rows(song(title="A-side"))))["Title"], "A-side")


class RecordDetails(unittest.TestCase):
    def test_a_format_leaves_out_the_speed(self):
        self.assertEqual(webapp.release_format({"formats": [{"name": "Vinyl", "descriptions": ['12"', "33 ⅓ RPM", "EP"]}]}), 'Vinyl, 12", EP')

    def test_a_record_with_no_format_says_nothing(self):
        self.assertEqual(webapp.release_format({}), "")

    def test_tracks_are_counted_but_headings_are_not(self):
        release = dict(id=7, labels=[dict(name="Harthouse")], country="Germany", year=1993, formats=[dict(name="CD")],
                       tracklist=[dict(type_="heading", title="Side A"), dict(type_="track", title="One"), dict(type_="track", title="Two"), dict(title="Three")])
        with tempfile.TemporaryDirectory() as folder:
            with open(os.path.join(folder, "r.json"), "w", encoding="utf-8") as f:
                json.dump(release, f)
            found = webapp.discogs_index(folder)[0][7]
        self.assertEqual((found["tracks"], found["format"], found["label"]), (3, "CD", "Harthouse"))


class Where(Base):
    def verdict(self, path):
        return folders.check("export", path)

    def test_not_into_the_library(self):
        self.assertFalse(self.verdict(self.lib)["ok"])
        self.assertIn("inside your library", self.verdict(os.path.join(self.lib, "Acid"))["message"])

    def test_not_into_the_review_folder(self):
        self.assertFalse(self.verdict(self.review)["ok"])
        self.assertFalse(self.verdict(os.path.join(self.review, "sub"))["ok"])

    def test_not_into_a_downloads_folder_but_its_subfolders_are_fine(self):
        self.assertIn("downloads", self.verdict(self.inbox)["message"])
        self.assertTrue(self.verdict(os.path.join(self.inbox, "Sub"))["ok"], "the app doesn't look inside a downloads folder's subfolders")

    def test_a_folder_that_is_not_there_yet_gets_made(self):
        answer = self.verdict(os.path.join(self.root, "New", "Folder"))
        self.assertTrue(answer["ok"] and answer["create"])

    def test_an_existing_folder_is_fine(self):
        self.assertEqual(self.verdict(self.root)["tone"], "good")

    def test_a_drive_that_is_not_there_is_refused(self):
        with mock.patch.object(folders, "nearest_existing", return_value=None):
            self.assertIn("plug it in", self.verdict(os.path.join(self.root, "x"))["message"])

    def test_nothing_chosen_is_refused(self):
        self.assertFalse(self.verdict("")["ok"])

    def test_a_file_or_a_relative_path_is_refused(self):
        self.assertFalse(self.verdict(self.log if os.path.exists(self.log) else __file__)["ok"])
        self.assertIn("full path", self.verdict("relative/folder")["message"])


class FromThePage(Base):
    def setUp(self):
        super().setUp()
        self.one = self.song("Acid", "A - One", notes="")
        self.two = self.song("Techno", "B - Two", notes="")
        self.out = os.path.join(self.root, "Out")
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.server.export_lock = threading.Lock()  # shared on the class otherwise
        self.server.export_state, self.server.export_stop = None, None
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = None if body is None else body if isinstance(body, str) else json.dumps(body)
        c.request(method, path, body=data, headers={**({"Content-Type": "application/json"} if data is not None else {}), **(headers or {})})
        r = c.getresponse()
        payload = r.read()
        c.close()
        return r.status, json.loads(payload) if payload.startswith(b"{") else payload

    def refresh(self):
        self.server.collection.refresh()

    def ids(self):
        return [s["id"] for s in self.server.collection.songs.values()]

    def copy(self, **extra):
        status, answer = self.ask("POST", "/api/export/copy", dict(ids=self.ids(), folder=self.out, **extra))
        self.assertEqual(status, 200, answer)
        return self.wait()

    def wait(self):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            state = self.ask("GET", "/api/export")[1]
            if not state["running"]:
                return state
            time.sleep(.02)
        self.fail("the copy never finished")

    def files(self):
        found = []
        for where, _, names in os.walk(self.out):
            found += [os.path.relpath(os.path.join(where, n), self.out).replace(os.sep, "/") for n in names]
        return sorted(found)

    def bytes_of(self, path):
        with open(path, "rb") as f:
            return f.read()

    def test_a_playlist_comes_back_with_the_full_paths(self):
        status, answer = self.ask("POST", "/api/export/list", dict(ids=self.ids(), format="m3u"))
        self.assertEqual((status, answer["count"]), (200, 2))
        self.assertIn(self.one, answer["text"])
        self.assertIn(self.two, answer["text"])

    def test_a_spreadsheet_comes_back_too(self):
        status, answer = self.ask("POST", "/api/export/list", dict(ids=self.ids(), format="csv"))
        self.assertEqual(status, 200)
        self.assertIn("A,One", answer["text"].replace('"', ""))

    def test_a_format_it_does_not_know_is_refused(self):
        self.assertEqual(self.ask("POST", "/api/export/list", dict(ids=self.ids(), format="exe"))[0], 400)

    def test_only_songs_the_app_knows_count(self):
        status, answer = self.ask("POST", "/api/export/list", dict(ids=["nope", self.ids()[0], "../../secret"], format="m3u"))
        self.assertEqual((status, answer["count"]), (200, 1))

    def test_no_songs_is_refused(self):
        for ids in ([], ["nope"], "not a list", None, [1, 2]):
            self.assertEqual(self.ask("POST", "/api/export/list", dict(ids=ids, format="m3u"))[0], 400, ids)

    def test_a_long_list_fits(self):
        status, answer = self.ask("POST", "/api/export/list", dict(ids=self.ids() + [f"{n:012x}" for n in range(6000)], format="m3u"))
        self.assertEqual((status, answer["count"]), (200, 2))

    def test_other_requests_stay_small(self):
        self.assertEqual(self.ask("POST", "/api/decision", json.dumps(dict(pad="x" * 70000)))[0], 413)

    def test_another_site_cannot_ask(self):
        self.assertEqual(self.ask("POST", "/api/export/copy", dict(ids=self.ids(), folder=self.out), headers={"Origin": "http://evil.example"})[0], 403)
        self.assertFalse(os.path.exists(self.out))

    def test_the_page_can_check_a_folder(self):
        status, answer = self.ask("POST", "/api/settings/check", dict(kind="export", path=self.lib))
        self.assertEqual((status, answer["ok"]), (200, False))

    def test_every_stylesheet_the_page_asks_for_is_there(self):
        page = self.ask("GET", "/")[1].decode("utf-8")
        for sheet in ("/style.css", "/glass.css", "/hifi.css"):
            self.assertIn(f'href="{sheet}"', page)
            self.assertEqual(self.ask("GET", sheet)[0], 200, sheet)

    def test_the_page_is_told_how_a_copy_is_going(self):
        self.assertFalse(self.ask("GET", "/api/all")[1]["meta"]["export"]["running"])

    def test_copies_keep_the_genre_folders(self):
        state = self.copy()
        self.assertEqual(self.files(), ["Acid/A - One.mp3", "Techno/B - Two.mp3"])
        self.assertEqual((state["result"]["copied"], state["result"]["already"], state["result"]["problems"], state["failed"]), (2, 0, [], ""))
        self.assertEqual(self.bytes_of(os.path.join(self.out, "Acid", "A - One.mp3")), self.bytes_of(self.one))

    def test_or_all_in_one_folder(self):
        self.copy(keep=False)
        self.assertEqual(self.files(), ["A - One.mp3", "B - Two.mp3"])

    def test_the_library_is_not_touched(self):
        before = (self.bytes_of(self.one), os.path.getmtime(self.one))
        self.copy()
        self.assertEqual((self.bytes_of(self.one), os.path.getmtime(self.one)), before)

    def test_a_song_already_there_is_counted_not_copied_again(self):
        self.copy()
        again = self.copy()
        self.assertEqual((again["result"]["copied"], again["result"]["already"]), (0, 2))

    def test_a_different_file_with_that_name_is_left_alone(self):
        theirs = os.path.join(self.out, "Acid", "A - One.mp3")
        os.makedirs(os.path.dirname(theirs))
        with open(theirs, "wb") as f:
            f.write(b"someone else's file")
        state = self.copy()
        self.assertEqual(self.bytes_of(theirs), b"someone else's file")
        self.assertEqual(state["result"]["copied"], 1)
        self.assertIn("left alone", state["result"]["problems"][0])

    def test_stop_finishes_the_song_in_hand_then_stops(self):
        real = shutil.copy2

        def then_stop(src, dst):
            real(src, dst)
            self.server.export_stop.set()

        with mock.patch.object(export.shutil, "copy2", then_stop):
            state = self.copy()
        self.assertEqual((state["result"]["copied"], state["result"]["stopped"]), (1, True))
        self.assertEqual(len(self.files()), 1)

    def test_a_copy_that_breaks_leaves_nothing_behind(self):
        def half(src, dst):
            with open(dst, "wb") as f:
                f.write(b"half a song")
            raise OSError(28, "No space left on device")

        with mock.patch.object(export.shutil, "copy2", half):
            state = self.copy()
        self.assertEqual(self.files(), [])
        self.assertIn("No space left", state["result"]["problems"][0])

    def test_a_copy_of_the_wrong_size_does_not_count(self):
        def short(src, dst):
            with open(dst, "wb") as f:
                f.write(b"x")

        with mock.patch.object(export.shutil, "copy2", short):
            state = self.copy()
        self.assertEqual((self.files(), state["result"]["copied"]), ([], 0))

    def test_it_gives_up_when_nothing_is_working(self):
        for n in range(4):
            self.song("Acid", f"C - {n}", notes="")
        self.refresh()
        with mock.patch.object(export.shutil, "copy2", side_effect=OSError(5, "Input/output error")) as attempt:
            state = self.copy()
        self.assertEqual(attempt.call_count, export.GIVE_UP_AFTER)
        self.assertIn("in a row", state["failed"])

    def test_it_says_so_up_front_if_the_songs_will_not_fit(self):
        with mock.patch.object(export.shutil, "disk_usage", return_value=mock.Mock(free=1)):
            status, answer = self.ask("POST", "/api/export/copy", dict(ids=self.ids(), folder=self.out))
        self.assertEqual(status, 400)
        self.assertIn("GB free", answer["error"])
        self.assertFalse(self.server.export_lock.locked())

    def test_a_bad_folder_is_refused_before_anything_starts(self):
        status, answer = self.ask("POST", "/api/export/copy", dict(ids=self.ids(), folder=self.lib))
        self.assertEqual(status, 400)
        self.assertIn("library", answer["error"])
        self.assertIsNone(self.server.export_state)

    def test_one_copy_at_a_time(self):
        self.assertTrue(self.server.export_lock.acquire(blocking=False))
        try:
            status, answer = self.ask("POST", "/api/export/copy", dict(ids=self.ids(), folder=self.out))
        finally:
            self.server.export_lock.release()
        self.assertEqual(status, 400)
        self.assertIn("Already copying", answer["error"])

    def test_the_page_is_not_given_the_songs_paths_until_someone_exports(self):
        self.assertNotIn(json.dumps(self.root)[1:-1], json.dumps(self.ask("GET", "/api/all")[1]["songs"]))  # as JSON writes it: Windows paths have their backslashes doubled


if __name__ == "__main__":
    unittest.main()
