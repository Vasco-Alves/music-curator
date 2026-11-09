"""A broken file doesn't go into the library, however good its name is. Nothing here reaches the network."""
import os
import random
import sys
import tempfile
import shutil
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import curate, fpcompare  # noqa: E402
from test_curate import KEY, LENGTH, WithDiscogs  # noqa: E402
from test_webapp import FRAME, write_mp3  # noqa: E402

SONG = "A - Song"
FILE = SONG + ".mp3"
COVER_ERROR = "[mjpeg @ 000001] No JPEG data found in image\n"
DECODE_ERROR = "[mp3float @ 000001] Header missing\n"


def spoil(path):
    """Noise where the audio should be, after the first few frames: a download that came through broken. Its tags and size stay as they were."""
    with open(path, "rb") as f:
        data = bytearray(f.read())
    start = data.index(FRAME) + len(FRAME) * 10
    data[start:] = random.Random(3).randbytes(len(data) - start)
    with open(path, "wb") as f:
        f.write(data)
    return path


def played(seconds):
    return f"size=N/A time=00:{int(seconds) // 60:02d}:{seconds % 60:05.2f} bitrate=N/A speed=300x\r"


class WhatCountsAsDamaged(unittest.TestCase):
    def says(self, stderr, secs=300, stopping=None):
        with mock.patch.object(fpcompare, "run_or_give_up", return_value=("", stderr)):
            return curate.audio_trouble("a.mp3", secs, stopping)

    def test_a_song_that_plays_to_the_end_is_fine(self):
        self.assertEqual(self.says(played(300)), "")

    def test_a_hair_short_of_the_stated_length_is_normal(self):
        self.assertEqual(self.says(played(299.93)), "")

    def test_playing_a_little_longer_than_stated_is_fine(self):
        self.assertEqual(self.says(played(300.9)), "")

    def test_losing_a_whole_second_is_still_within_the_limit(self):
        self.assertEqual(self.says(played(299)), "")

    def test_losing_more_than_that_is_damage(self):
        self.assertIn("damaged or was cut off", self.says(played(298.9)))

    def test_it_says_how_much_can_be_played(self):
        self.assertIn("only 3:20 of its 5:00", self.says(played(200)))

    def test_the_last_progress_line_is_the_one_that_counts(self):
        self.assertEqual(self.says(played(100) + played(200) + played(300)), "")

    def test_nothing_played_is_damage(self):
        self.assertIn("none of it", self.says(played(0.4)))

    def test_no_progress_at_all_is_damage(self):
        self.assertIn("none of it", self.says("[in#0 @ 1] moov atom not found\n"))

    def test_with_no_stated_length_it_still_has_to_play(self):
        self.assertEqual(self.says(played(200), secs=0), "")
        self.assertIn("none of it", self.says("", secs=0))

    def test_the_odd_error_is_normal_in_old_rips(self):
        self.assertEqual(self.says(DECODE_ERROR * 2 + played(300)), "")

    def test_up_to_the_limit_of_errors_is_fine(self):
        self.assertEqual(self.says(DECODE_ERROR * curate.MOST_DECODE_ERRORS + played(300)), "")

    def test_past_the_limit_is_damage(self):
        self.assertIn("damaged in places", self.says(DECODE_ERROR * (curate.MOST_DECODE_ERRORS + 1) + played(300)))

    def test_an_error_right_after_a_progress_line_counts(self):  # ffmpeg ends its progress lines with a carriage return, so they run into what comes next
        self.assertIn("damaged in places", self.says((played(100) + DECODE_ERROR) * (curate.MOST_DECODE_ERRORS + 1) + played(300)))

    def test_a_broken_cover_picture_says_nothing_about_the_sound(self):
        self.assertEqual(self.says(COVER_ERROR * 30 + played(300)), "")

    def test_a_file_ffmpeg_gets_stuck_on_isnt_added(self):
        with mock.patch.object(fpcompare, "run_or_give_up", side_effect=fpcompare.GaveUp("it took too long")):
            self.assertIn("may be damaged", curate.audio_trouble("a.mp3", 300))

    def test_stop_means_no_answer(self):
        stopping = threading.Event()
        stopping.set()
        with mock.patch.object(fpcompare, "run_or_give_up", side_effect=fpcompare.GaveUp("stopped")):
            self.assertIsNone(curate.audio_trouble("a.mp3", 300, stopping))

    def test_when_ffmpeg_cant_run_it_isnt_added(self):
        with mock.patch.object(fpcompare, "run_or_give_up", side_effect=FileNotFoundError("ffmpeg")):
            self.assertIn("may be damaged", curate.audio_trouble("a.mp3", 300))


class WithTheRealFfmpeg(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)
        self.path = write_mp3(os.path.join(self.folder, FILE))

    def test_a_good_file_passes(self):
        self.assertEqual(curate.audio_trouble(self.path, 5.2), "")

    def test_noise_where_the_music_should_be(self):
        self.assertIn("damaged", curate.audio_trouble(spoil(self.path), 5.2))

    def test_a_download_that_stopped_partway(self):
        with open(self.path, "r+b") as f:
            f.truncate(os.path.getsize(self.path) // 2)
        self.assertIn("damaged or was cut off", curate.audio_trouble(self.path, 5.2))

    def test_something_that_isnt_audio_at_all(self):
        with open(self.path, "wb") as f:
            f.write(b"this is not audio at all")
        self.assertIn("none of it", curate.audio_trouble(self.path, 5.2))


class InCurate(WithDiscogs):
    def record(self, *names, length=LENGTH):
        for name in names or ("Song",):
            self.fake.add("A", f"Record of {name}", [("A1", name, length)])

    def broken(self, name=SONG):
        return spoil(self.file(name))

    def why(self):
        return self.waiting()[KEY.format(SONG)]["why"]

    def test_a_broken_file_with_a_perfect_match_stays_out(self):
        self.broken()
        self.record()
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"], self.in_library()), (0, 1, []))
        self.assertIn("damaged", self.why())

    def test_a_good_file_still_goes_in(self):
        self.file(SONG)
        self.record()
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (1, ["Acid/A - Song.mp3"]))

    def test_nothing_is_written_to_the_log(self):
        self.broken()
        self.record()
        self.run_it()
        self.assertEqual(self.log_rows(), [])

    def test_no_cover_is_fetched_for_it(self):
        self.broken()
        self.record()
        self.run_it()
        self.assertEqual(self.fake.images, [])

    def test_a_preview_leaves_it_out_too(self):
        self.broken()
        self.record()
        _, done = self.run_it(dry_run=True)
        self.assertEqual(done["added"], 0)

    def test_it_shows_on_to_check_with_the_reason(self):
        self.broken()
        self.record()
        self.run_it()
        song = self.page_song(FILE)
        self.assertIn("damaged", next(c for c in song["checks"] if c["kind"] == "waiting")["why"])

    def test_it_doesnt_count_as_a_new_song_again_and_again(self):
        self.broken()
        self.record()
        self.run_it()
        self.assertTrue(self.page_song(FILE)["looked"])

    def test_a_new_copy_goes_in_on_the_next_run(self):
        self.broken()
        self.record()
        self.run_it()
        self.file(SONG)
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (1, 0))

    def test_a_song_held_back_anyway_isnt_played_through(self):
        self.file(SONG)
        self.record(length="0:40")
        with mock.patch.object(curate, "audio_trouble") as check:
            self.run_it()
        check.assert_not_called()

    def versions(self):
        self.broken()
        self.fake.add("A", "The Record", [("A1", "Song (Barn Mix)", LENGTH), ("B1", "Song (Dub)", LENGTH)])
        self.run_it()
        self.answer_for(SONG, "pick", "A1|Song (Barn Mix)")

    def test_picking_a_version_of_a_broken_file_doesnt_add_it(self):
        self.versions()
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (0, []))
        self.assertIn("damaged", self.why())

    def test_the_versions_stay_on_offer(self):
        self.versions()
        self.run_it()
        self.assertEqual(len(self.waiting()[KEY.format(SONG)]["options"]), 2)

    def test_your_pick_is_kept_for_when_the_file_is_replaced(self):
        self.versions()
        self.run_it()
        self.file(SONG)
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (1, ["Acid/A - Song (Barn Mix).mp3"]))

    def test_stop_during_the_check_decides_nothing(self):
        self.file(SONG)
        self.file("A - Other")
        self.record("Song", "Other")
        stopping = threading.Event()

        def stopped(path, secs, event):
            event.set()
            return None

        with mock.patch.object(curate, "audio_trouble", stopped):
            _, done = self.run_it(stopping=stopping)
        self.assertEqual((done["added"], done["stopped"], self.waiting(), self.in_library()), (0, True, {}, []))


if __name__ == "__main__":
    unittest.main()
