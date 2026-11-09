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

    def test_a_playlist_can_say_where_each_song_is_another_way(self):
        self.assertEqual(export.to_m3u([song()], lambda s: "../" + s["file"]).splitlines()[-1], "../A - Song.mp3")

    def test_a_path_given_another_way_is_checked_too(self):
        self.assertEqual(export.to_m3u([song()], lambda s: "a\nb.mp3"), "#EXTM3U\n")

    def test_a_playlist_from_here_says_so_where_players_ignore_it(self):
        lines = export.to_m3u([song()], made_here=True).splitlines()
        self.assertEqual(lines[:2], ["#EXTM3U", export.MADE_HERE])
        self.assertTrue(lines[1].startswith("# "))

    def test_paths_go_from_the_playlists_folder(self):
        self.assertEqual(export._from_folder(os.path.join(os.sep, "music", "Acid", "a.mp3"), os.path.join(os.sep, "music", "Lists")), "../Acid/a.mp3")

    def test_on_another_drive_the_full_path_is_all_there_is(self):
        with mock.patch.object(export.os.path, "relpath", side_effect=ValueError("different drives")):
            self.assertEqual(export._from_folder("D:/a.mp3", "E:/Lists"), "D:/a.mp3")


class PlaylistNames(unittest.TestCase):
    def name(self, text):
        return export._playlist_file(text, set())

    def test_an_ordinary_name(self):
        self.assertEqual(self.name("Late Shift"), "Late Shift.m3u8")

    def test_emoji_stay(self):
        self.assertEqual(self.name("💊 Rave Master Mix 💊"), "💊 Rave Master Mix 💊.m3u8")

    def test_characters_a_file_cant_have_are_replaced(self):
        self.assertEqual(self.name('A/B: "C"?'), "A-B - 'C'.m3u8")

    def test_spaces_around_the_name_go(self):
        self.assertEqual(self.name(" Psytrance "), "Psytrance.m3u8")

    def test_nothing_left_of_the_name(self):
        self.assertEqual(self.name("???"), "Playlist.m3u8")

    def test_a_name_windows_keeps_for_itself(self):
        self.assertEqual(self.name("Con"), "Con playlist.m3u8")

    def test_two_that_come_out_the_same_stay_apart(self):
        taken = set()
        self.assertEqual([export._playlist_file(n, taken) for n in ("A/B", "A-B", "a-b")], ["A-B.m3u8", "A-B (2).m3u8", "a-b (3).m3u8"])

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

    def test_playlists_can_go_in_the_library(self):  # they aren't songs, and some players look for them there
        self.assertTrue(folders.check("playlists", self.lib)["ok"])

    def test_playlists_can_go_in_a_new_folder(self):
        answer = folders.check("playlists", os.path.join(self.root, "New"))
        self.assertTrue(answer["ok"] and answer["create"])

    def test_playlists_need_somewhere_to_go(self):
        self.assertFalse(folders.check("playlists", "")["ok"])

    def test_playlists_need_a_drive_that_is_there(self):
        with mock.patch.object(folders, "nearest_existing", return_value=None):
            self.assertIn("plug it in", folders.check("playlists", os.path.join(self.root, "x"))["message"])


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

    def lines_of(self, *parts):
        with open(os.path.join(self.out, *parts), encoding="utf-8") as f:
            return f.read().splitlines()

    def test_copies_come_with_a_playlist_of_them(self):
        state = self.copy(name="Late Shift")
        self.assertEqual(state["result"]["playlist"], "Late Shift.m3u8")
        lines = self.lines_of("Late Shift.m3u8")
        self.assertEqual(sorted(x for x in lines if not x.startswith("#")), ["Acid/A - One.mp3", "Techno/B - Two.mp3"])

    def test_in_one_folder_the_playlist_says_so_too(self):
        self.copy(name="Late Shift", keep=False)
        self.assertEqual(sorted(x for x in self.lines_of("Late Shift.m3u8") if not x.startswith("#")), ["A - One.mp3", "B - Two.mp3"])

    def test_the_playlist_keeps_the_lists_order(self):
        ids = list(reversed(self.ids()))
        self.ask("POST", "/api/export/copy", dict(ids=ids, folder=self.out, name="Mine"))
        self.wait()
        self.assertEqual([x for x in self.lines_of("Mine.m3u8") if not x.startswith("#")], ["Techno/B - Two.mp3", "Acid/A - One.mp3"])

    def test_with_no_name_there_is_no_playlist(self):
        self.assertEqual(self.copy()["result"]["playlist"], "")
        self.assertEqual(self.files(), ["Acid/A - One.mp3", "Techno/B - Two.mp3"])

    def test_a_song_that_could_not_be_copied_is_not_in_it(self):
        theirs = os.path.join(self.out, "Acid", "A - One.mp3")
        os.makedirs(os.path.dirname(theirs))
        with open(theirs, "wb") as f:
            f.write(b"someone else's file")
        self.copy(name="Mine")
        self.assertEqual([x for x in self.lines_of("Mine.m3u8") if not x.startswith("#")], ["Techno/B - Two.mp3"])

    def test_a_song_already_there_is_in_it(self):
        self.copy()
        self.copy(name="Mine")
        self.assertEqual(sorted(x for x in self.lines_of("Mine.m3u8") if not x.startswith("#")), ["Acid/A - One.mp3", "Techno/B - Two.mp3"])

    def test_copying_again_updates_its_own_playlist(self):
        self.copy(name="Mine")
        first = self.lines_of("Mine.m3u8")
        self.assertEqual(self.copy(name="Mine")["result"]["playlist"], "Mine.m3u8")
        self.assertEqual(self.lines_of("Mine.m3u8"), first)

    def test_a_file_of_that_name_that_isnt_ours_stays(self):
        os.makedirs(self.out)
        theirs = os.path.join(self.out, "Mine.m3u8")
        with open(theirs, "w", encoding="utf-8") as f:
            f.write("#EXTM3U\nmy own playlist.mp3\n")
        self.assertEqual(self.copy(name="Mine")["result"]["playlist"], "")
        self.assertEqual(self.lines_of("Mine.m3u8"), ["#EXTM3U", "my own playlist.mp3"])

    def test_nothing_copied_means_no_playlist(self):
        with mock.patch.object(export.shutil, "copy2", side_effect=OSError(5, "Input/output error")):
            state = self.copy(name="Mine")
        self.assertEqual((state["result"]["playlist"], self.files()), ("", []))

    def lists(self, *playlists):
        with open(os.path.join(self.app, "spotify_playlists.json"), "w", encoding="utf-8") as f:
            json.dump({str(n): dict(name=name, entries=[dict(name=t, artists=[a], album="", secs=5, local=True, uri="x") for a, t in members]) for n, (name, members) in enumerate(playlists)}, f)

    def save(self, folder=None):
        return self.ask("POST", "/api/export/playlists", dict(folder=folder or self.out))

    def test_all_the_playlists_are_saved_at_once(self):
        self.lists(("Late Shift", [("A", "One")]), ("Sunrise", [("B", "Two"), ("A", "One")]))
        status, answer = self.save()
        self.assertEqual((status, answer["saved"], answer["left"]), (200, 2, []))
        self.assertEqual(self.files(), ["Late Shift.m3u8", "Sunrise.m3u8"])

    def test_songs_are_in_the_playlists_order_with_paths_from_that_folder(self):
        self.lists(("Sunrise", [("B", "Two"), ("A", "One")]))
        self.save()
        rel = os.path.relpath(self.lib, self.out).replace(os.sep, "/")
        self.assertEqual([x for x in self.lines_of("Sunrise.m3u8") if not x.startswith("#")], [f"{rel}/Techno/B - Two.mp3", f"{rel}/Acid/A - One.mp3"])

    def test_they_really_lead_to_the_songs(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.save()
        path = next(x for x in self.lines_of("Sunrise.m3u8") if not x.startswith("#"))
        self.assertTrue(os.path.samefile(os.path.join(self.out, path), self.two))

    def test_the_library_is_left_as_it_was(self):
        self.lists(("Sunrise", [("B", "Two")]))
        before = sorted(os.path.join(w, n) for w, _, ns in os.walk(self.lib) for n in ns)
        self.save()
        self.assertEqual(sorted(os.path.join(w, n) for w, _, ns in os.walk(self.lib) for n in ns), before)

    def test_saving_again_replaces_them(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.save()
        self.lists(("Sunrise", [("A", "One")]))
        status, answer = self.save()
        self.assertEqual((status, answer["saved"]), (200, 1))
        self.assertIn("One", "\n".join(self.lines_of("Sunrise.m3u8")))
        self.assertNotIn("Two", "\n".join(self.lines_of("Sunrise.m3u8")))

    def test_a_file_of_that_name_that_isnt_ours_stays_and_is_named(self):
        self.lists(("Sunrise", [("B", "Two")]), ("Late Shift", [("A", "One")]))
        os.makedirs(self.out)
        with open(os.path.join(self.out, "Sunrise.m3u8"), "w", encoding="utf-8") as f:
            f.write("mine\n")
        _, answer = self.save()
        self.assertEqual((answer["saved"], answer["left"]), (1, ["Sunrise.m3u8"]))
        self.assertEqual(self.lines_of("Sunrise.m3u8"), ["mine"])

    def test_a_folder_that_is_not_there_is_made(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.assertEqual(self.save(os.path.join(self.out, "deep", "er"))[0], 200)
        self.assertEqual(self.files(), ["deep/er/Sunrise.m3u8"])

    def test_no_playlists_is_refused(self):
        status, answer = self.save()
        self.assertEqual(status, 400)
        self.assertIn("Check Spotify", answer["error"])

    def test_no_folder_is_refused(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.assertEqual(self.ask("POST", "/api/export/playlists", dict(folder=""))[0], 400)

    def test_a_problem_part_way_says_how_far_it_got(self):
        self.lists(("A", [("A", "One")]), ("B", [("B", "Two")]))
        real, calls = export._save_playlist, []

        def second_fails(path, text):
            calls.append(path)
            if len(calls) == 2:
                raise OSError(28, "No space left on device")
            return real(path, text)

        with mock.patch.object(export, "_save_playlist", second_fails):
            status, answer = self.save()
        self.assertEqual(status, 400)
        self.assertIn("Saved 1 of 2", answer["error"])
        self.assertIn("No space left", answer["error"])

    def test_nothing_half_written_is_left(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.save()
        self.assertEqual([f for f in self.files() if f.endswith(export.PART)], [])

    def test_another_site_cannot_save_them(self):
        self.lists(("Sunrise", [("B", "Two")]))
        self.assertEqual(self.ask("POST", "/api/export/playlists", dict(folder=self.out), headers={"Origin": "http://evil.example"})[0], 403)
        self.assertFalse(os.path.exists(self.out))

    def test_the_page_can_check_a_folder_for_playlists(self):
        status, answer = self.ask("POST", "/api/settings/check", dict(kind="playlists", path=self.lib))
        self.assertEqual((status, answer["ok"]), (200, True))

    def test_the_page_is_not_given_the_songs_paths_until_someone_exports(self):
        self.assertNotIn(json.dumps(self.root)[1:-1], json.dumps(self.ask("GET", "/api/all")[1]["songs"]))  # as JSON writes it: Windows paths have their backslashes doubled


if __name__ == "__main__":
    unittest.main()
