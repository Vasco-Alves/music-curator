"""Measuring how loud a song is, for the player's even volume. ffmpeg is stood in for: what's tested is what the app does with its answer."""
import http.client
import json
import os
import shutil
import subprocess
import sys
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import loudness, webapp  # noqa: E402
from test_apply import Base  # noqa: E402

REPORT = """[Parsed_ebur128_0 @ 0000] t: 1 TARGET:-23 LUFS M: -9.0 S:-120.7 I: -9.0 LUFS LRA: 0.0 LU
[Parsed_ebur128_0 @ 0000] Summary:

  Integrated loudness:
    I:         -10.5 LUFS
    Threshold: -20.9 LUFS

  Loudness range:
    LRA:         4.2 LU
"""


def answered(said):
    return mock.patch.object(loudness.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stderr=said))


class Measuring(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(loudness.shutil, "which", return_value="ffmpeg")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_it_reads_the_summary_and_not_a_passing_figure(self):
        with answered(REPORT):
            self.assertEqual(loudness.measure("song.mp3"), -10.5)

    def test_the_file_goes_in_as_one_argument_and_nothing_is_written(self):
        with answered(REPORT) as run:
            loudness.measure("a song & more.mp3")
        command = run.call_args[0][0]
        self.assertEqual(command[command.index("-i") + 1], "a song & more.mp3")
        self.assertEqual(command[-3:], ["-f", "null", "-"])

    def test_silence_has_no_loudness(self):
        with answered(REPORT.replace("-10.5 LUFS", "-70.0 LUFS")):
            self.assertIsNone(loudness.measure("song.mp3"))

    def test_a_file_ffmpeg_cant_read(self):
        with answered("Invalid data found when processing input"):
            self.assertIsNone(loudness.measure("song.mp3"))

    def test_no_ffmpeg(self):
        with mock.patch.object(loudness.shutil, "which", return_value=None):
            self.assertIsNone(loudness.measure("song.mp3"))

    def test_ffmpeg_that_hangs_or_is_missing(self):
        for failure in (subprocess.TimeoutExpired("x", 1), OSError("gone")):
            with self.subTest(failure), mock.patch.object(loudness.subprocess, "run", side_effect=failure):
                self.assertIsNone(loudness.measure("song.mp3"))


class FromThePage(Base):
    def setUp(self):
        super().setUp()
        self.one = self.song("Acid", "A - One", notes="")
        self.saved = os.path.join(self.app, "loudness.json")
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        patcher = mock.patch.object(loudness, "measure", return_value=-9.5)
        self.measure = patcher.start()
        self.addCleanup(patcher.stop)

    def song_now(self):
        self.server.collection.refresh()
        return next(iter(self.server.collection.songs.values()))

    def ask(self, song_id):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("GET", f"/api/loudness/{song_id}")
        r = c.getresponse()
        payload = r.read()
        c.close()
        return r.status, json.loads(payload) if payload.startswith(b"{") else payload

    def test_it_measures_the_song_and_says(self):
        self.assertEqual(self.ask(self.song_now()["id"]), (200, dict(lufs=-9.5)))

    def test_a_song_is_only_measured_once(self):
        song = self.song_now()["id"]
        self.ask(song), self.ask(song)
        self.assertEqual(self.measure.call_count, 1)

    def test_the_page_gets_it_with_the_song_from_then_on(self):
        self.assertIsNone(self.song_now()["lufs"])
        self.ask(self.song_now()["id"])
        self.assertEqual(self.song_now()["lufs"], -9.5)

    def test_it_survives_a_restart(self):
        self.ask(self.song_now()["id"])
        again = webapp.Collection(webapp.app_paths())
        again.refresh()
        self.assertEqual(next(iter(again.songs.values()))["lufs"], -9.5)

    def test_moving_a_song_doesnt_mean_measuring_it_again(self):
        self.ask(self.song_now()["id"])
        os.makedirs(os.path.join(self.lib, "Techno"))
        shutil.move(self.one, os.path.join(self.lib, "Techno", "A - One.mp3"))
        self.assertEqual(self.song_now()["lufs"], -9.5)

    def test_a_better_copy_is_measured_again(self):
        self.ask(self.song_now()["id"])
        with open(self.one, "ab") as f:
            f.write(b"\xff" * 400)
        self.assertIsNone(self.song_now()["lufs"])

    def test_a_song_it_cant_measure_says_so_and_nothing_is_saved(self):
        self.measure.return_value = None
        self.assertEqual(self.ask(self.song_now()["id"]), (200, dict(lufs=None)))
        self.assertFalse(os.path.exists(self.saved))

    def test_an_id_that_isnt_a_song(self):
        self.assertEqual(self.ask("0" * 12)[0], 404)

    def test_something_that_isnt_an_id_never_reaches_a_file(self):
        self.assertEqual(self.ask("..%2f..%2fetc")[0], 404)
        self.measure.assert_not_called()

    def test_a_saved_file_that_cant_be_read_is_only_measured_again(self):
        with open(self.saved, "w", encoding="utf-8") as f:
            f.write("not json")
        self.assertEqual(self.ask(self.song_now()["id"]), (200, dict(lufs=-9.5)))
        with open(self.saved, encoding="utf-8") as f:
            self.assertEqual(list(json.load(f).values()), [-9.5])

    def test_entries_that_arent_numbers_are_ignored(self):
        key = webapp.level_key(self.song_now())
        with open(self.saved, "w", encoding="utf-8") as f:
            json.dump({key: "loud"}, f)
        self.assertIsNone(self.song_now()["lufs"])


if __name__ == "__main__":
    unittest.main()
