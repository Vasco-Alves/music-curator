"""Saving a file whole: it's the old one or the new one, never half of each, and nothing is left behind.
And what the app does with a file it can't open just now, which is not an empty file.

    python -m unittest discover -s tests
"""
import contextlib
import csv
import glob
import io
import json
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import apply, cli, config, curate, discogs, genres, own_playlists, saving, spotify, suggest, tagwriter, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_curate import KEY, WithDiscogs  # noqa: E402


def as_on_windows():
    """While this is in force a file that's open elsewhere is waited for, as on Windows, whatever system the test runs on."""
    return mock.patch.object(saving, "_no_use_waiting", return_value=False)


def cant_open(module, path):
    """While this is in force `module` can't open `path`: another program has it."""
    real = open

    def locked(file, *a, **k):
        if os.path.abspath(str(file)) == os.path.abspath(path):
            raise PermissionError(13, "Permission denied", str(file))
        return real(file, *a, **k)
    return mock.patch.object(module, "open", locked, create=True)


class SavingAFile(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = self.tmp.name
        self.path = os.path.join(self.folder, "answers.json")

    def save(self, data, **how):
        saving.write(self.path, lambda f: json.dump(data, f), encoding="utf-8", **how)

    def read(self):
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def test_the_new_file_takes_the_old_ones_place_and_nothing_else_is_left(self):
        self.save({"a": 1})
        self.save({"b": 2})
        self.assertEqual(self.read(), {"b": 2})
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_a_save_that_fails_while_writing_leaves_the_old_file_and_nothing_else(self):
        self.save({"a": 1})

        def fill(f):
            f.write('{"half": ')
            raise OSError(28, "No space left on device")
        with self.assertRaises(OSError):
            saving.write(self.path, fill, encoding="utf-8")
        self.assertEqual(self.read(), {"a": 1})
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_a_save_that_cannot_take_its_place_leaves_the_old_file_and_nothing_else(self):
        self.save({"a": 1})
        with mock.patch("os.replace", side_effect=OSError(28, "No space left on device")), self.assertRaises(OSError):
            self.save({"b": 2})
        self.assertEqual(self.read(), {"a": 1})
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_being_stopped_halfway_leaves_nothing_behind_either(self):
        self.save({"a": 1})

        def fill(f):
            raise KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            saving.write(self.path, fill, encoding="utf-8")
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_a_file_something_else_has_open_for_a_moment_is_saved_once_it_lets_go(self):
        self.save({"a": 1})
        real, tries = os.replace, []

        def busy_twice(src, dst):
            tries.append(src)
            if len(tries) < 3:
                raise PermissionError(13, "Access is denied")
            return real(src, dst)
        with as_on_windows(), mock.patch("os.replace", busy_twice), mock.patch.object(saving.time, "sleep") as waited:
            self.save({"b": 2})
        self.assertEqual(self.read(), {"b": 2})
        self.assertEqual((len(tries), waited.call_count), (3, 2))

    def test_a_file_that_stays_open_elsewhere_is_given_up_on_and_said(self):
        self.save({"a": 1})
        with as_on_windows(), mock.patch("os.replace", side_effect=PermissionError(13, "Access is denied")) as tried, mock.patch.object(saving.time, "sleep"), self.assertRaises(PermissionError):
            self.save({"b": 2})
        self.assertEqual(tried.call_count, saving.TRIES)
        self.assertEqual(self.read(), {"a": 1})
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_it_is_pushed_out_to_the_disk_before_it_takes_the_old_ones_place(self):
        """Replaced first and written out after, a power cut at the wrong moment leaves an empty file under the real name."""
        order, real_sync, real_swap = [], os.fsync, os.replace
        with mock.patch("os.fsync", side_effect=lambda fd: (order.append("to the disk"), real_sync(fd))[1]), mock.patch("os.replace", side_effect=lambda a, b: (order.append("in place"), real_swap(a, b))[1]):
            self.save({"a": 1})
        self.assertEqual(order, ["to the disk", "in place"])

    def test_a_save_of_the_same_size_at_another_time_is_another_version(self):
        self.save({"n": "ab"})
        was = saving.stamp(self.path)
        self.save({"n": "cd"})
        os.utime(self.path, ns=(was[0] + 2_000_000_000, was[0] + 2_000_000_000))  # two seconds on: every kind of drive can tell that apart
        self.assertEqual(saving.stamp(self.path)[1], was[1])
        with self.assertRaises(saving.Changed):
            self.save({"n": "ef"}, read_as=was)
        self.assertEqual(self.read(), {"n": "cd"})

    def test_so_is_one_of_another_size_with_the_same_time_on_it(self):
        self.save({"n": "ab"})
        was = saving.stamp(self.path)
        self.save({"n": "abcdef"})
        os.utime(self.path, ns=(was[0], was[0]))
        self.assertEqual(saving.stamp(self.path)[0], was[0])
        with self.assertRaises(saving.Changed):
            self.save({"n": "ef"}, read_as=was)
        self.assertEqual(self.read(), {"n": "abcdef"})

    def test_a_file_marked_read_only_is_not_waited_for(self):
        """Waiting only helps when something has the file open for a moment. With a file that can't be written at all, every save would hold the app up for most of a second first."""
        self.save({"a": 1})
        os.chmod(self.path, stat.S_IREAD)
        self.addCleanup(os.chmod, self.path, stat.S_IREAD | stat.S_IWRITE)
        with mock.patch("os.replace", side_effect=PermissionError(13, "Access is denied")) as tried, mock.patch.object(saving.time, "sleep") as waited, self.assertRaises(PermissionError):
            self.save({"b": 2})
        self.assertEqual((tried.call_count, waited.call_count), (1, 0))
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_the_file_is_looked_at_again_before_every_try(self):
        """While a save waits for the file to be let go, the program that had it open may have saved. Trying again without looking would put this save on top of that one."""
        self.save({"a": 1})
        was, real, tries = saving.stamp(self.path), os.replace, []

        def busy_while_they_save(src, dst):
            tries.append(src)
            if len(tries) == 1:
                with open(self.path, "w", encoding="utf-8") as f:
                    json.dump({"a": 1, "theirs": 2}, f)
                raise PermissionError(13, "Access is denied")
            return real(src, dst)
        with as_on_windows(), mock.patch("os.replace", busy_while_they_save), mock.patch.object(saving.time, "sleep"), self.assertRaises(saving.Changed):
            self.save({"a": 1, "mine": 3}, read_as=was)
        self.assertEqual(self.read(), {"a": 1, "theirs": 2})
        self.assertEqual(len(tries), 1)

    def test_a_save_made_from_the_old_file_waits_its_turn(self):
        """Looking at the file and replacing it are one step, taken in turn: or two programs could both look, both see nothing new, and both replace it."""
        self.save({"a": 1})
        was, has_it, let_go = saving.stamp(self.path), threading.Event(), threading.Event()

        def another_program():
            with saving._Turn(self.path):
                has_it.set()
                let_go.wait(5)
        other = threading.Thread(target=another_program, daemon=True)
        other.start()
        self.assertTrue(has_it.wait(5))
        threading.Timer(.15, let_go.set).start()
        began = time.monotonic()
        self.save({"mine": 1}, read_as=was)
        self.assertGreater(time.monotonic() - began, .1)
        other.join(5)
        self.assertEqual(self.read(), {"mine": 1})
        self.assertEqual(sorted(os.listdir(self.folder)), ["answers.json", "answers.json.lock"])

    def test_a_turn_that_never_comes_is_said_and_the_file_is_left(self):
        self.save({"a": 1})
        was = saving.stamp(self.path)
        with mock.patch.object(saving, "TURN_WAIT_S", .1), saving._Turn(self.path), self.assertRaises(OSError) as refused:
            self.save({"mine": 1}, read_as=was)
        self.assertNotIsInstance(refused.exception, saving.Changed)
        self.assertIn("answers.json is being saved by another program", str(refused.exception))
        self.assertEqual(self.read(), {"a": 1})
        self.assertEqual(sorted(os.listdir(self.folder)), ["answers.json", "answers.json.lock"])

    def test_a_plain_save_takes_no_turn_and_leaves_no_lock(self):
        self.save({"a": 1})
        with saving._Turn(self.path):
            self.save({"b": 2})
        self.assertEqual(self.read(), {"b": 2})
        os.remove(self.path + ".lock")
        self.save({"c": 3})
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_only_a_file_in_use_is_tried_again(self):
        with mock.patch("os.replace", side_effect=OSError(28, "No space left on device")) as tried, self.assertRaises(OSError):
            self.save({"b": 2})
        self.assertEqual(tried.call_count, 1)

    def test_a_file_that_was_not_there_yet_is_made(self):
        self.save({"first": True})
        self.assertEqual(self.read(), {"first": True})

    def test_a_folder_that_is_not_there_is_an_error_and_makes_nothing(self):
        with self.assertRaises(OSError):
            saving.write(os.path.join(self.folder, "missing", "x.json"), lambda f: f.write("{}"), encoding="utf-8")
        self.assertEqual(os.listdir(self.folder), [])

    def test_it_writes_bytes_too(self):
        saving.write(self.path, lambda f: f.write(b"\xff\xd8 a picture"), "wb")
        with open(self.path, "rb") as f:
            self.assertEqual(f.read(), b"\xff\xd8 a picture")

    def test_how_the_text_is_written_is_up_to_the_caller(self):
        saving.write(self.path, lambda f: f.write("a\nb caf\udce9"), encoding="utf-8", errors="replace", newline="\n")
        with open(self.path, "rb") as f:
            self.assertEqual(f.read(), b"a\nb caf?")

    def test_a_file_that_is_a_link_stays_one_and_the_file_it_points_at_is_saved(self):
        real = os.path.join(self.folder, "real.json")
        with open(real, "w", encoding="utf-8") as f:
            f.write("{}")
        try:
            os.symlink(real, self.path)
        except (OSError, NotImplementedError):
            self.skipTest("this computer doesn't let a test make a link")
        self.save({"a": 1})
        self.assertTrue(os.path.islink(self.path))
        with open(real, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"a": 1})
        self.assertEqual(sorted(os.listdir(self.folder)), ["answers.json", "real.json"])

    @unittest.skipIf(os.name == "nt", "Windows keeps who may read a file with its folder")
    def test_the_new_file_is_as_private_as_the_one_it_replaces(self):
        self.save({"a": 1})
        os.chmod(self.path, 0o600)
        self.save({"b": 2})
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(self.read(), {"b": 2})

    def test_a_file_nobody_else_touched_since_it_was_read_is_saved(self):
        self.save({"a": 1})
        self.save({"b": 2}, read_as=saving.stamp(self.path))
        self.assertEqual(self.read(), {"b": 2})

    def test_a_file_someone_else_saved_since_it_was_read_is_not_saved_over(self):
        self.save({"a": 1})
        was = saving.stamp(self.path)
        self.save({"a": 1, "theirs": 2})
        with self.assertRaises(saving.Changed):
            self.save({"a": 1, "mine": 3}, read_as=was)
        self.assertEqual(self.read(), {"a": 1, "theirs": 2})
        self.assertEqual(sorted(os.listdir(self.folder)), ["answers.json", "answers.json.lock"], "the file to take turns by stays; nothing half-written does")

    def test_a_file_that_was_not_there_when_looked_for_and_is_now_is_not_saved_over(self):
        self.assertIsNone(saving.stamp(self.path))
        self.save({"theirs": 1})
        with self.assertRaises(saving.Changed):
            self.save({"mine": 2}, read_as=None)
        self.assertEqual(self.read(), {"theirs": 1})
        os.remove(self.path)
        self.save({"mine": 2}, read_as=None)
        self.assertEqual(self.read(), {"mine": 2})

    def test_a_file_that_was_there_when_read_and_is_gone_now_is_not_put_back(self):
        self.save({"a": 1})
        was = saving.stamp(self.path)
        os.remove(self.path)
        with self.assertRaises(saving.Changed):
            self.save({"a": 1, "mine": 2}, read_as=was)
        self.assertEqual(os.listdir(self.folder), ["answers.json.lock"])

    def test_two_saves_at_the_same_moment_do_not_write_into_each_other(self):
        """With one shared temporary name the file could end up as the start of one save and the end of the other."""
        self.save({"start": True})
        big, small = {"big": "x" * 400_000}, {"small": 1}
        inside, go = threading.Event(), threading.Event()

        def slow(f):
            text = json.dumps(big)
            f.write(text[:200_000])
            inside.set()
            go.wait(5)
            f.write(text[200_000:])
        first = threading.Thread(target=lambda: saving.write(self.path, slow, encoding="utf-8"), daemon=True)
        first.start()
        try:
            self.assertTrue(inside.wait(5))
            self.save(small)  # while the big one is half written
            self.assertEqual(self.read(), small)
        finally:
            go.set()
            first.join(5)
        self.assertEqual(self.read(), big)
        self.assertEqual(os.listdir(self.folder), ["answers.json"])

    def test_a_reader_never_sees_half_a_file(self):
        self.save({"n": 0, "pad": "x" * 50_000})
        stop, seen, failed = threading.Event(), [], []

        def keep_reading():
            while not stop.wait(.005):  # the way the page does: often, but not without a breath in between
                try:
                    seen.append(self.read()["n"])
                except ValueError as ex:  # a cut-off or empty file would be this
                    failed.append(repr(ex))
                except OSError:
                    pass
        reader = threading.Thread(target=keep_reading, daemon=True)
        reader.start()
        n, give_up = 0, time.monotonic() + 10
        try:
            while (n < 40 or len(seen) < 5) and time.monotonic() < give_up:  # on a fast disk forty saves are over before the reader has looked once
                n += 1
                self.save({"n": n, "pad": "x" * 50_000})
        finally:
            stop.set()
            reader.join(5)
        self.assertEqual(failed, [])
        self.assertEqual(self.read()["n"], n)
        self.assertGreaterEqual(len(seen), 5, "the reader has to have read while saves were going on, or this shows nothing")


class WhatAKilledSaveLeaves(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = self.tmp.name

    def left(self, name, age_s):
        path = os.path.join(self.folder, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write("half")
        os.utime(path, (time.time() - age_s, time.time() - age_s))
        return path

    def test_an_old_leftover_is_swept_up(self):
        self.left("answers.json.123-456-0" + saving.PART, 7200)
        saving.sweep(self.folder)
        self.assertEqual(os.listdir(self.folder), [])

    def test_a_young_one_may_be_a_save_going_on_right_now(self):
        self.left("answers.json.123-456-0" + saving.PART, 5)
        saving.sweep(self.folder)
        self.assertEqual(len(os.listdir(self.folder)), 1)

    def test_nothing_else_in_the_folder_is_touched(self):
        for name in ("answers.json", "log.csv", "song.mp3", "notes" + saving.PART + ".txt"):
            self.left(name, 7200)
        os.mkdir(os.path.join(self.folder, "folder" + saving.PART))
        saving.sweep(self.folder)
        self.assertEqual(sorted(os.listdir(self.folder)), sorted(["answers.json", "log.csv", "song.mp3", "notes" + saving.PART + ".txt", "folder" + saving.PART]))

    def test_a_file_of_your_own_that_ends_the_same_way_is_not_the_apps_to_remove(self):
        for name in ("my thesis" + saving.PART, "Song.mp3" + saving.PART, saving.PART, "answers.json.lock"):
            self.left(name, 7200)
        saving.sweep(self.folder)
        self.assertEqual(sorted(os.listdir(self.folder)), sorted(["my thesis" + saving.PART, "Song.mp3" + saving.PART, saving.PART, "answers.json.lock"]))

    def test_a_folder_that_is_not_there_is_no_trouble(self):
        saving.sweep(os.path.join(self.folder, "gone"))


class AFileThatCantBeOpenedJustNow(Base):
    """Another program has it for a moment. Taking that for an empty file, and saving, would wipe what's in it."""

    def setUp(self):
        super().setUp()
        self.song("Acid", name="A - One", notes="")
        self.paths = webapp.app_paths()
        self.collection = webapp.Collection(self.paths)
        self.collection.refresh()
        self.one = next(s for s in self.collection.songs.values() if s["file"] == "A - One.mp3")

    def keep(self, path, data):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f) if not isinstance(data, str) else f.write(data)

    def kept(self, path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def test_play_counts_are_not_started_again(self):
        path = webapp.plays_path(self.paths)
        self.keep(path, {"x|y": dict(song="X - Y", plays=7, first="2026-01-01T00:00:00", last="2026-01-02T00:00:00")})
        with cant_open(webapp, path):
            fresh = webapp.Collection(self.paths)  # the app has just started, so it has never read them
            fresh.refresh()
            answer = fresh.played(self.one["id"])
        self.assertIn("couldn't be opened just now", answer["error"])
        self.assertEqual(self.kept(path)["x|y"]["plays"], 7)
        self.assertEqual(self.collection.played(self.one["id"])["plays"], 1)
        self.assertEqual(self.kept(path)["x|y"]["plays"], 7)

    def test_playlists_in_a_file_of_another_kind_are_not_saved_over(self):
        path, other = webapp.own_lists_path(self.paths), {"version": 2, "lists": {"a": {"title": "Mine"}}}
        self.keep(path, other)
        answer = own_playlists.handle(self.collection, "/api/playlists/new", dict(name="X", ids=[self.one["id"]]))
        self.assertIn("can't be read", answer["error"])
        self.assertEqual(self.kept(path), other)

    def test_a_playlists_file_with_nothing_in_it_is_just_empty(self):
        path = webapp.own_lists_path(self.paths)
        self.keep(path, {})
        self.assertNotIn("error", own_playlists.handle(self.collection, "/api/playlists/new", dict(name="X", ids=[self.one["id"]])))
        self.assertEqual([p["name"] for p in self.kept(path).values()], ["X"])

    def test_what_spotify_said_last_time_is_kept(self):
        rows = [dict(playlist="P", count=1)]
        self.assertTrue(spotify.write_state(self.paths, to_remove=rows, checked="2026-01-01T00:00:00"))
        with cant_open(spotify, spotify._state_path(self.paths)):
            self.assertFalse(spotify.write_state(self.paths, checked="2026-02-02T00:00:00"))
        self.assertEqual(spotify.read_state(self.paths), dict(to_remove=rows, checked="2026-01-01T00:00:00"))
        self.assertTrue(spotify.write_state(self.paths, checked="2026-02-02T00:00:00"))
        self.assertEqual(spotify.read_state(self.paths), dict(to_remove=rows, checked="2026-02-02T00:00:00"))

    def test_a_spotify_file_that_makes_no_sense_is_started_again(self):
        self.keep(spotify._state_path(self.paths), "{ not json")
        self.assertTrue(spotify.write_state(self.paths, checked="2026-02-02T00:00:00"))
        self.assertEqual(spotify.read_state(self.paths), dict(checked="2026-02-02T00:00:00"))

    def test_a_spotify_save_that_fails_is_not_the_end_of_the_check(self):
        with mock.patch("os.replace", side_effect=OSError(28, "No space left on device")):
            self.assertFalse(spotify.write_state(self.paths, checked="2026-02-02T00:00:00"))
        self.assertEqual(os.listdir(self.app), ["log.csv"])

    def test_searches_spotify_already_answered_are_not_made_again(self):
        spotify._write_hits(self.paths, {"review/X.mp3": dict(terms="t", when="2026-01-01", hit=None)})
        with cant_open(spotify, spotify._hits_path(self.paths)):
            self.assertEqual(spotify._look_for_waiting_songs(None, self.collection), (0, ""), "it asks Spotify nothing: there'd be nothing to check the answers against")
        self.assertEqual(list(spotify.read_hits(self.paths)), ["review/X.mp3"])

    def test_playlists_as_they_were_are_not_cut_down_to_the_few_just_read(self):
        self.keep(spotify.cache_path(self.paths), {"id9": dict(snapshot="s", entries=[], name="Kept")})
        with cant_open(spotify, spotify.cache_path(self.paths)):
            self.assertIsNone(spotify._read_cache(self.paths))
        self.assertEqual(list(spotify._read_cache(self.paths)), ["id9"])

    def test_the_extra_genres_are_not_started_again(self):
        path = webapp.styles_path(self.paths)
        self.keep(path, {"release/1": dict(styles=["Acid"], wide=False)})
        with cant_open(genres, path), mock.patch.object(genres.discogs, "get", return_value=dict(styles=["Trance"])) as asked:
            done = genres.fill(self.paths, {"release/2": "A - Two"})
        self.assertIn("couldn't be opened just now", done["said"])
        self.assertEqual((done["looked"], asked.call_count), (0, 0))
        self.assertEqual(list(self.kept(path)), ["release/1"])
        with mock.patch.object(genres.discogs, "get", return_value=dict(styles=["Trance"])):
            self.assertEqual(genres.fill(self.paths, {"release/2": "A - Two"})["said"], "")
        self.assertEqual(sorted(self.kept(path)), ["release/1", "release/2"])

    def test_extra_genres_that_cannot_be_saved_are_said(self):
        with mock.patch.object(genres.discogs, "get", return_value=dict(styles=["Trance"])), mock.patch("os.replace", side_effect=OSError(28, "No space left on device")):
            self.assertIn("couldn't be saved", genres.fill(self.paths, {"release/2": "A - Two"})["said"])

    def test_an_answer_is_saved_once_what_was_reading_the_file_lets_go(self):
        real, tries = os.replace, []

        def busy_twice(src, dst):
            tries.append(dst)
            if len(tries) < 3:
                raise PermissionError(13, "Access is denied")
            return real(src, dst)
        with as_on_windows(), mock.patch("os.replace", busy_twice), mock.patch.object(saving.time, "sleep"):
            self.assertIsNone(self.collection.decide(dict(id=self.one["id"], kind="flag", action="flag", note="listen again")))
        self.assertEqual(len(tries), 3)
        self.assertEqual([d["note"] for d in self.kept(self.answers).values()], ["listen again"])
        self.assertEqual(sorted(os.listdir(self.app)), ["decisions.json", "decisions.json.lock", "log.csv"])

    def test_everything_the_app_keeps_is_saved_the_safe_way(self):
        """Any of these written straight onto the real file again would pass every other test, and lose the file in a crash."""
        saved, real = [], saving.write

        def seen(path, *a, **k):
            saved.append(os.path.basename(path))
            return real(path, *a, **k)
        env = os.path.join(self.root, "settings", ".env")
        os.makedirs(os.path.dirname(env))
        with mock.patch.object(saving, "write", seen), mock.patch.object(webapp.config, "env_file", return_value=env):
            self.assertIsNone(self.collection.decide(dict(id=self.one["id"], kind="flag", action="flag", note="x")))
            self.assertEqual(self.collection.played(self.one["id"])["plays"], 1)
            self.collection._measured(self.one["id"], "lufs", "levels", self.collection._read_levels, webapp.levels_path, lambda song: -9.0)
            self.collection._measured(self.one["id"], "wave", "waves", self.collection._read_waves, webapp.waves_path, lambda song: [1, 2, 3])
            webapp.lan_key()
            self.assertNotIn("error", own_playlists.handle(self.collection, "/api/playlists/new", dict(name="X", ids=[self.one["id"]])))
            self.assertTrue(spotify.write_state(self.paths, checked="2026-02-02T00:00:00"))
            spotify._write_hits(self.paths, {})
            spotify._write_cache(self.paths, {})
            with mock.patch.object(genres.discogs, "get", return_value=dict(styles=["Trance"])):
                genres.fill(self.paths, {"release/2": "A - Two"})
            run = curate.Run(self.paths, say=lambda _: None)
            run.loaded = True
            self.assertTrue(run._save_waiting())
            curate.leave_better_link("A - One.mp3", "https://example.org/better", "a better copy", False)
            config.save_paths(self.cfg, dict(review=self.review))
        kept = {"decisions.json", "plays.json", os.path.basename(webapp.levels_path(self.paths)), os.path.basename(webapp.waves_path(self.paths)), "lan_key.txt", os.path.basename(webapp.own_lists_path(self.paths)),
                os.path.basename(spotify._state_path(self.paths)), os.path.basename(spotify._hits_path(self.paths)), os.path.basename(spotify.cache_path(self.paths)), os.path.basename(webapp.styles_path(self.paths)),
                os.path.basename(webapp.curated_path(self.paths)), "better_links.json", os.path.basename(self.cfg)}
        self.assertEqual(kept - set(saved), set(), "these were written some other way")

    def test_measurements_are_not_cut_down_to_the_one_just_made(self):
        """Another program has the file for a moment while a song is measured. Saved as if the file were empty, hundreds of measurements would be gone."""
        for path, read, word in ((webapp.levels_path(self.paths), self.collection._read_levels, "lufs"), (webapp.waves_path(self.paths), self.collection._read_waves, "wave")):
            with self.subTest(word):
                kept = {f"song {n}": -9.5 if word == "lufs" else [1, 2, 3] for n in range(40)}
                self.keep(path, kept)
                fresh = webapp.Collection(self.paths)  # the app has just started, so it has never read them
                fresh.refresh()
                setattr(fresh, "levels" if word == "lufs" else "waves", {})
                setattr(fresh, "levels_sig" if word == "lufs" else "waves_sig", None)
                with cant_open(webapp, path), mock.patch.object(webapp.os, "stat", side_effect=lambda p, *a, real=os.stat, **k: (_ for _ in ()).throw(PermissionError(13, "Access is denied")) if os.path.abspath(str(p)) == os.path.abspath(path) else real(p, *a, **k)):
                    got = fresh._measured(self.one["id"], word, "levels" if word == "lufs" else "waves", fresh._read_levels if word == "lufs" else fresh._read_waves, webapp.levels_path if word == "lufs" else webapp.waves_path, lambda song: -7.0 if word == "lufs" else [4, 5, 6])
                self.assertEqual(got, {word: -7.0 if word == "lufs" else [4, 5, 6]}, "the answer is still given")
                self.assertEqual(self.kept(path), kept, "and the file is as it was")

    def test_the_key_for_your_phone_is_not_made_anew_while_its_file_is_busy(self):
        env = os.path.join(self.root, "settings", ".env")
        os.makedirs(os.path.dirname(env))
        path = os.path.join(os.path.dirname(env), "lan_key.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write("0123456789\n")
        with mock.patch.object(webapp.config, "env_file", return_value=env):
            self.assertEqual(webapp.lan_key(), "0123456789")
            with cant_open(webapp, path):
                for_now = webapp.lan_key()
            self.assertRegex(for_now, r"^[0-9a-f]{10}$")
            with open(path, encoding="utf-8") as f:
                self.assertEqual(f.read(), "0123456789\n", "the bookmark on the phone still works the next time")
            self.assertEqual(webapp.lan_key(), "0123456789")


class AnswersTwoProgramsChangeAtOnce(Base):
    """The page and the command line each read the answers, change them and save the lot. Whichever saved second used to undo what the other had just done."""

    def setUp(self):
        super().setUp()
        self.song("Acid", name="A - One", notes="")
        self.song("Acid", name="B - Two", notes="")
        self.paths = webapp.app_paths()
        self.collection = webapp.Collection(self.paths)
        self.collection.refresh()
        self.one, self.two = (next(s for s in self.collection.songs.values() if s["file"] == name + ".mp3") for name in ("A - One", "B - Two"))
        self.key_one, self.key_two = (f"flag:{s['key']}" for s in (self.one, self.two))

    def flag(self, song, note="listen again"):
        return self.collection.decide(dict(id=song["id"], kind="flag", action="flag", note=note))

    def just_before_the_next_save(self, happens):
        """While this is in force, `happens` right before the next save: after the answers were read for it, which is the moment that used to lose one."""
        real, done = saving.write, []

        def write(*a, **k):
            if not done:
                done.append(True)
                happens()
            return real(*a, **k)
        return mock.patch.object(saving, "write", write)

    def notes(self):
        return {key: answer["note"] for key, answer in self.saved().items()}

    def test_the_page_does_not_put_back_an_answer_the_command_line_just_took_off(self):
        self.assertIsNone(self.flag(self.one))
        self.assertIsNone(self.flag(self.two))

        def apply_takes_one_off():  # `curator apply`, having carried it out
            answers = self.saved()
            del answers[self.key_one]
            with open(self.answers, "w", encoding="utf-8") as f:
                json.dump(answers, f)
        with self.just_before_the_next_save(apply_takes_one_off):
            self.assertIsNone(self.flag(self.two, "and again"), "it's done again on what the command line saved, so you're not asked to")
        self.assertEqual(self.notes(), {self.key_two: "and again"}, "saved over it, the answer that was carried out would be back on the list")
        self.assertEqual(sorted(os.listdir(self.app)), ["decisions.json", "decisions.json.lock", "log.csv"])

    def test_the_page_says_so_when_the_answers_keep_changing_under_it(self):
        self.assertIsNone(self.flag(self.one))
        real, saves = saving.write, []

        def write(*a, **k):  # something else saves a new version before every one of the page's
            saves.append(True)
            with open(self.answers, "w", encoding="utf-8") as f:
                json.dump({"theirs": dict(note="x" * len(saves))}, f)
            return real(*a, **k)
        with mock.patch.object(saving, "write", write):
            self.assertEqual(self.flag(self.two), webapp.ANSWERS_CHANGED)
            ran = []
            self.assertEqual(self.collection.update_answers(lambda answers: ran.append(dict(answers))), webapp.ANSWERS_CHANGED)
        self.assertEqual(len(saves), 6)
        self.assertEqual([list(a) for a in ran], [["theirs"]] * 3, "each try starts from the list as the other program left it")
        self.assertEqual(self.notes(), {"theirs": "x" * 6})

    def test_an_answer_you_changed_while_the_run_was_going_is_not_carried_out(self):
        """apply reads the list when it starts. By the time it reaches a song you may have changed your mind on the page: the new answer is the one that counts."""
        self.answer("genre", "library/Acid/A - One.mp3", song="A - One", genre="Techno")
        self.answer("genre", "library/Acid/B - Two.mp3", song="B - Two", genre="Techno")
        run, real, changed = apply.Run, apply.Run.change_genre, []

        def after_the_first(self_, key, answer, name):
            real(self_, key, answer, name)
            if not changed:  # the first song is done: now, before the second, you change its answer on the page
                changed.append(True)
                self.answer("genre", "library/Acid/B - Two.mp3", song="B - Two", genre="House")
        with mock.patch.object(run, "change_genre", after_the_first), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(apply.main(), 0)
        self.assertIn("you changed this answer while the run was going", out.getvalue())
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Techno", "A - One.mp3")))
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Acid", "B - Two.mp3")), "not moved to Techno against your last word")
        self.assertEqual({k: d["genre"] for k, d in self.saved().items()}, {"genre:library/Acid/B - Two.mp3": "House"}, "and the new answer waits for the next run")

    def test_an_answer_changed_while_its_song_was_being_moved_stays_on_the_list(self):
        self.answer("genre", "library/Acid/A - One.mp3", song="A - One", genre="Techno")
        run = apply.Run(self.paths, False, True, say=lambda _: None)
        self.addCleanup(run.close)
        real = run.swap

        def swap_then_you_change_it(*a, **k):
            real(*a, **k)
            self.answer("genre", "library/Acid/A - One.mp3", song="A - One", genre="House")
        with mock.patch.object(run, "swap", swap_then_you_change_it):
            run.attempt("genre:library/Acid/A - One.mp3", self.saved()["genre:library/Acid/A - One.mp3"], run.change_genre)
        self.assertEqual({k: d["genre"] for k, d in self.saved().items()}, {"genre:library/Techno/A - One.mp3": "House"}, "it follows the song to where it is now, for the next run")

    def test_the_command_line_does_not_lose_an_answer_the_page_just_saved(self):
        self.assertIsNone(self.flag(self.one))
        run = apply.Run(self.paths, False, False, say=lambda _: None)
        with self.just_before_the_next_save(lambda: self.flag(self.two)):
            run.forget(self.key_one)
        self.assertEqual(self.notes(), {self.key_two: "listen again"}, "the one carried out is off the list, and the new one is on it")

    def test_curate_does_not_lose_one_either(self):
        self.assertIsNone(self.flag(self.one))
        answer = self.saved()[self.key_one]
        with self.just_before_the_next_save(lambda: self.flag(self.two)):
            curate.Run(self.paths, say=lambda _: None)._take_off_list(self.key_one, answer)
        self.assertEqual(self.notes(), {self.key_two: "listen again"})

    def test_nor_does_suggest(self):
        self.assertIsNone(self.flag(self.one))
        with self.just_before_the_next_save(lambda: self.flag(self.two)):
            suggest._update_answers(self.answers, [self.key_one], {})
        self.assertEqual(self.notes(), {self.key_two: "listen again"})

    def test_curate_and_suggest_give_up_after_three_tries_too(self):
        self.assertIsNone(self.flag(self.one))
        answer, real, saves = self.saved()[self.key_one], saving.write, []

        def write(*a, **k):  # something else saves a new version before every one of theirs
            saves.append(True)
            with open(self.answers, "w", encoding="utf-8") as f:
                json.dump({self.key_one: answer, "theirs": dict(note="x" * len(saves))}, f)
            return real(*a, **k)
        with mock.patch.object(saving, "write", write):
            with self.assertRaises(saving.Changed):
                curate.Run(self.paths, say=lambda _: None)._take_off_list(self.key_one, answer)
            with self.assertRaises(saving.Changed):
                suggest._update_answers(self.answers, [self.key_one], {})
        self.assertEqual(len(saves), 6)
        self.assertEqual(self.notes()["theirs"], "x" * 6)

    def test_a_file_that_keeps_changing_is_given_up_on_and_said(self):
        self.assertIsNone(self.flag(self.one))
        said, real, saves = [], saving.write, []

        def write(*a, **k):  # something else saves a new version before every one of ours
            saves.append(True)
            with open(self.answers, "w", encoding="utf-8") as f:
                json.dump({"theirs": dict(note="x" * len(saves))}, f)
            return real(*a, **k)
        with mock.patch.object(saving, "write", write):
            apply.Run(self.paths, False, False, say=said.append).retire(self.key_one)
        self.assertEqual(len(saves), 3)
        self.assertEqual(self.notes(), {"theirs": "xxx"})
        self.assertIn("couldn't be taken off the list (decisions.json was changed by another program just now)", said[-1])
        self.assertEqual(sorted(os.listdir(self.app)), ["decisions.json", "decisions.json.lock", "log.csv"])


class AnswersKeptFromDiscogs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache = os.path.join(self.tmp.name, "discogs")
        was = discogs.CACHE_DIR
        discogs.CACHE_DIR = self.cache
        self.addCleanup(setattr, discogs, "CACHE_DIR", was)

    def test_one_that_was_cut_short_is_asked_for_again_and_kept_whole(self):
        with mock.patch.object(discogs, "_request", return_value={"id": 1}) as asked:
            self.assertEqual(discogs.get("/releases/1"), {"id": 1})
            (name,) = os.listdir(self.cache)
            with open(os.path.join(self.cache, name), "w", encoding="utf-8") as f:
                f.write('{"id": ')
            self.assertEqual(discogs.get("/releases/1"), {"id": 1}, "it used to fail on every run from then on")
            self.assertEqual(asked.call_count, 2)
            self.assertEqual(discogs.get("/releases/1"), {"id": 1})
            self.assertEqual(asked.call_count, 2, "kept whole again, so not asked a third time")
        self.assertEqual(os.listdir(self.cache), [name])

    def test_one_that_cannot_be_kept_is_still_the_answer(self):
        with mock.patch.object(discogs, "_request", return_value={"id": 1}), mock.patch("os.replace", side_effect=OSError(28, "No space left on device")):
            self.assertEqual(discogs.get("/releases/1"), {"id": 1})
        self.assertEqual(os.listdir(self.cache), [])


class WhatYouTypedForASong(WithDiscogs):
    def test_it_is_saved_before_its_answer_leaves_the_list(self):
        """The answer used to come off the list at once, and the waiting list that now carried your words was only saved up to ten songs later."""
        self.file("Unknown - Track")
        self.run_it()
        self.answer_for("Unknown - Track", "identify", "Real - Name")
        with mock.patch.object(curate.Run, "_save_waiting", return_value=False):  # the list can't be saved
            self.run_it()
        self.assertIn("waiting:" + KEY.format("Unknown - Track"), self.saved(), "so the answer that carries your words stays")
        self.run_it()
        self.assertEqual(self.saved(), {})
        self.assertEqual(self.waiting()[KEY.format("Unknown - Track")]["said"], "Real - Name")

    def test_a_list_of_waiting_songs_that_makes_no_sense_is_kept_beside_the_new_one(self):
        self.file("Unknown - Track")
        path = webapp.curated_path(self.paths)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"songs": {"inbox/Downloads/Unknown - Track.mp3": {"said": "Real - Na')
        done = curate.Run(self.paths, say=lambda _: None).go()
        (kept,) = glob.glob(glob.escape(path) + ".*.unreadable")
        with open(kept, encoding="utf-8") as f:
            self.assertIn('"said": "Real - Na', f.read())
        self.assertIn(KEY.format("Unknown - Track"), self.waiting())
        self.assertIn(f"kept as {os.path.basename(kept)}", done["said"], "said where the page shows it too")

    def test_a_second_damaged_list_does_not_take_the_place_of_the_first_one_kept(self):
        self.file("Unknown - Track")
        path = webapp.curated_path(self.paths)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        first = path + ".2026-01-01 10-00-00.unreadable"
        with open(first, "w", encoding="utf-8") as f:
            f.write("the first one kept")
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"songs": {"cut sho')
        curate.Run(self.paths, say=lambda _: None).go()
        with open(first, encoding="utf-8") as f:
            self.assertEqual(f.read(), "the first one kept")
        self.assertEqual(len(glob.glob(glob.escape(path) + ".*.unreadable")), 2)

    def test_a_preview_leaves_a_damaged_list_where_it_is(self):
        self.file("Unknown - Track")
        path = webapp.curated_path(self.paths)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"songs": {"cut sho')
        curate.Run(self.paths, dry_run=True, say=lambda _: None).go()
        with open(path, encoding="utf-8") as f:
            self.assertEqual(f.read(), '{"songs": {"cut sho')
        self.assertEqual(glob.glob(glob.escape(path) + ".*"), [])

    def test_a_list_that_could_not_be_saved_is_said_on_the_page_too(self):
        self.file("Unknown - Track")
        with mock.patch.object(curate.Run, "_save_waiting", return_value=False):
            done = curate.Run(self.paths, say=lambda _: None).go()
        self.assertIn("couldn't be saved", done["said"])


class TheLogWithTwoWriters(Base):
    def setUp(self):
        super().setUp()
        self.song("Acid", name="A - One", notes="")
        self.paths = webapp.app_paths()

    def logged(self):
        with open(self.log, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    def test_taking_a_row_back_leaves_alone_what_someone_else_wrote_after_it(self):
        run = apply.Run(self.paths, False, True, say=lambda _: None)
        self.addCleanup(run.close)
        mark = run.write_log(dict(self.logged()[0], status="removed: not right"))
        handle, writer = apply._open_log(self.log)  # Curate, or the page's Looks right, writing meanwhile
        writer.writerow(dict(self.logged()[0], status="ok", dest="D:/somewhere/new song.mp3"))
        handle.close()
        run.take_back(mark)
        self.assertEqual([r["status"] for r in self.logged()], ["ok", "removed: not right", "ok"], "cut back to the mark, the other writer's row would be gone with it")

    def test_taking_a_row_back_still_leaves_the_log_exactly_as_it_was(self):
        with open(self.log, "rb") as f:
            before = f.read()
        run = apply.Run(self.paths, False, True, say=lambda _: None)
        self.addCleanup(run.close)
        run.take_back(run.write_log(dict(self.logged()[0], status="removed: not right")))
        run.close()
        with open(self.log, "rb") as f:
            self.assertEqual(f.read(), before)

    def test_the_command_line_waits_its_turn_while_curate_is_running(self):
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")), mock.patch.object(cli, "WAIT_FOR_TURN_S", .1):
            for command in (["verified", "A - One", "--how", "listened to it"], ["apply"], ["write", os.path.join(self.root, "plan.json")]):
                with self.subTest(command[0]), self.assertRaises(SystemExit) as stopped:
                    cli.main(["--config", self.cfg, *command])
                self.assertIn("Something else is writing to the log just now", str(stopped.exception))
        self.assertEqual([r["status"] for r in self.logged()], ["ok"])

    def test_a_turn_held_for_a_moment_is_waited_for(self):
        """Another command adding its row to the log has the turn for a few thousandths of a second. Refused at once, the command run beside it would fail for no reason."""
        has_it, let_go = threading.Event(), threading.Event()

        def another_command():
            with curate._OneAtATime(os.path.join(self.app, "curate.lock")):
                has_it.set()
                let_go.wait(5)
        other = threading.Thread(target=another_command, daemon=True)
        other.start()
        self.assertTrue(has_it.wait(5))
        threading.Timer(.2, let_go.set).start()
        self.answer("genre", "library/Acid/A - One.mp3", song="A - One", genre="Techno")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["--config", self.cfg, "apply"]), 0)
        other.join(5)
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Techno", "A - One.mp3")))

    def test_curate_meeting_curate_is_still_told_at_once(self):
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")), self.assertRaises(curate.Stop) as stopped:
            curate._OneAtATime(os.path.join(self.app, "curate.lock")).__enter__()
        self.assertIn("Curate is already running", str(stopped.exception))

    def test_with_nothing_else_running_the_command_line_does_its_work_and_lets_go(self):
        self.answer("genre", "library/Acid/A - One.mp3", song="A - One", genre="Techno")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["--config", self.cfg, "apply"]), 0)
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Techno", "A - One.mp3")))
        self.assertEqual(self.saved(), {})
        self.assertEqual((self.logged()[-1]["status"], self.logged()[-1]["genre"]), ("ok", "Techno"))
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")):  # and its turn is free for the next one
            pass

    def test_a_command_that_stops_with_an_error_lets_go_of_its_turn_too(self):
        with mock.patch.object(apply, "main", side_effect=SystemExit("stopped")), self.assertRaises(SystemExit):
            cli.main(["--config", self.cfg, "apply"])
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")):
            pass

    def test_a_dry_run_needs_no_turn(self):
        with curate._OneAtATime(os.path.join(self.app, "curate.lock")), mock.patch.object(apply, "main", return_value=0) as ran:
            self.assertEqual(cli.main(["--config", self.cfg, "apply", "--dry-run"]), 0)
        ran.assert_called_once()


if __name__ == "__main__":
    unittest.main()
