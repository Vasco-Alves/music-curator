"""The shape of a song in the seek bar, and where its sound starts and ends: what's measured, and what's kept of it. Nothing here reaches the network."""
import array
import http.client
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import waveform, webapp  # noqa: E402
from test_apply import Base  # noqa: E402


def pcm(*parts, each=4000):
    """16-bit mono audio: a stretch of a steady wave at each of these strengths."""
    samples = array.array("h")
    for strength in parts:
        samples.extend(int(strength * math.sin(n / 3)) for n in range(each))
    if sys.byteorder == "big":
        samples.byteswap()
    return samples.tobytes()


class TheShape(unittest.TestCase):
    def test_there_are_as_many_slices_as_promised(self):
        self.assertEqual(len(waveform.shape(pcm(9000))), waveform.SLICES)

    def test_the_busiest_part_is_full_height_however_quiet_the_song(self):
        self.assertEqual(max(waveform.shape(pcm(400))), 100)
        self.assertEqual(max(waveform.shape(pcm(30000))), 100)

    def test_a_breakdown_shows(self):
        got = waveform.shape(pcm(20000, 2000, 20000))
        third = len(got) // 3
        self.assertGreater(min(got[:third - 2]), 90)
        self.assertLess(max(got[third + 2:2 * third - 2]), 10)
        self.assertGreater(min(got[2 * third + 2:]), 90)

    def test_quieter_parts_are_drawn_lower_than_they_are(self):
        got = waveform.shape(pcm(20000, 10000))
        expected = 100 * 0.5 ** waveform.CONTRAST
        self.assertAlmostEqual(got[len(got) // 2 + 5], expected, delta=2)

    def test_it_goes_by_energy_not_by_peaks(self):  # a click is as high as anything, but there's hardly anything in it
        clicks = array.array("h", (30000 if n % 40 == 0 else 0 for n in range(8000)))
        if sys.byteorder == "big":
            clicks.byteswap()
        got = waveform.shape(pcm(20000, each=8000) + clicks.tobytes())
        self.assertGreater(min(got[:len(got) // 2 - 2]), 90)
        self.assertLess(max(got[len(got) // 2 + 2:]), 30)

    def test_silence_has_no_shape(self):
        self.assertIsNone(waveform.shape(bytes(8000)))

    def test_too_little_audio_has_no_shape(self):
        self.assertIsNone(waveform.shape(pcm(9000, each=waveform.SLICES - 1)))

    def test_a_stray_last_byte_doesnt_matter(self):
        self.assertEqual(len(waveform.shape(pcm(9000) + b"\x01")), waveform.SLICES)

    def test_nothing_at_all(self):
        self.assertIsNone(waveform.shape(b""))

    def test_every_value_fits_the_page(self):
        self.assertTrue(all(type(v) is int and 0 <= v <= 100 for v in waveform.shape(pcm(5000, 30000, 100))))


class Measuring(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)
        self.path = os.path.join(self.folder, "a.flac")

    def test_a_real_song_with_a_quiet_middle(self):
        subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=9", "-af", "volume='if(between(t,3,6),0.05,1)':eval=frame", "-c:a", "flac", self.path], check=True)
        got = waveform.measure(self.path)
        third = len(got) // 3
        self.assertEqual(len(got), waveform.SLICES)
        self.assertGreater(got[third // 2], 90)
        self.assertLess(got[third + third // 2], 10)
        self.assertGreater(got[2 * third + third // 2], 90)

    def test_something_that_isnt_audio(self):
        with open(self.path, "wb") as f:
            f.write(b"not audio at all")
        self.assertIsNone(waveform.measure(self.path))

    def test_with_no_ffmpeg(self):
        with mock.patch.object(waveform.shutil, "which", return_value=None):
            self.assertIsNone(waveform.measure(self.path))

    def test_ffmpeg_getting_stuck(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=subprocess.TimeoutExpired("x", 1)):
            self.assertIsNone(waveform.measure(self.path))

    def test_ffmpeg_not_starting(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=OSError("no")):
            self.assertIsNone(waveform.measure(self.path))

    def test_a_slot_is_free_again_afterwards(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=OSError("no")):
            for _ in range(4):
                waveform.measure(self.path)
        self.assertTrue(waveform._slots.acquire(blocking=False))
        waveform._slots.release()


def log(*lines):
    return "\n".join(lines)


def quiet(began, ended=None):
    """What ffmpeg's silencedetect says about one stretch of quiet."""
    said = [f"[Parsed_silencedetect_0 @ 000001fb7e18e880] silence_start: {began}"]
    if ended is not None:
        said.append(f"[Parsed_silencedetect_0 @ 000001fb7e18e880] silence_end: {ended} | silence_duration: {ended - began}")
    return log(*said)


class WhereTheSoundIs(unittest.TestCase):
    def test_quiet_at_both_ends(self):
        self.assertEqual(waveform.sounding(log(quiet(0, 3.000023), quiet(7, 12)), 12), [3.0, 7.0])

    def test_no_quiet_at_all(self):
        self.assertEqual(waveform.sounding("", 301.4), [0.0, 301.4])

    def test_quiet_in_the_middle_doesnt_count(self):  # a breakdown that stops dead is part of the song
        self.assertEqual(waveform.sounding(quiet(100, 104), 200), [0.0, 200.0])

    def test_quiet_only_at_the_start(self):
        self.assertEqual(waveform.sounding(quiet(0, 7.29), 190.4), [7.29, 190.4])

    def test_quiet_only_at_the_end(self):
        self.assertEqual(waveform.sounding(quiet(189.5638, 301.4), 301.4), [0.0, 189.56])

    def test_quiet_still_going_when_the_song_ran_out(self):  # older ffmpeg doesn't say that it ended
        self.assertEqual(waveform.sounding(log(quiet(0, 2), quiet(9)), 12), [2.0, 9.0])

    def test_a_start_just_before_zero_is_the_start(self):  # how some files' first samples are timed
        self.assertEqual(waveform.sounding(quiet(-0.0213, 4), 60), [4.0, 60.0])

    def test_quiet_all_the_way_through(self):
        self.assertIsNone(waveform.sounding(quiet(0, 12), 12))
        self.assertIsNone(waveform.sounding(quiet(0), 12))

    def test_older_ffmpeg_names_it_differently(self):
        said = log("[silencedetect @ 0x55d0c8a3e2c0] silence_start: 0", "[silencedetect @ 0x55d0c8a3e2c0] silence_end: 5.5 | silence_duration: 5.5")
        self.assertEqual(waveform.sounding(said, 60), [5.5, 60.0])

    def test_only_ffmpegs_own_lines_count(self):  # a song's tags are printed in the same place
        said = log("    comment         : silence_start: 0", "    title           : [silencedetect @ 1] silence_end: 30", "  Stream #0:0: Audio: mp3, 44100 Hz, stereo")
        self.assertEqual(waveform.sounding(said, 60), [0.0, 60.0])

    def test_a_tag_cant_pass_for_one_of_its_lines(self):  # ffmpeg prints a song's tags, and a tag may hold breaks that aren't new lines
        said = log("    comment         : nice tune\u2028[silencedetect @ 1] silence_start: 0\u2028[silencedetect @ 1] silence_end: 5\u0085[silencedetect @ 1] silence_start: 0")
        self.assertEqual(waveform.sounding(said, 12), [0.0, 12.0])

    def test_what_rounds_to_nothing_is_nothing(self):  # a blip of sound shorter than a hundredth of a second between two quiets
        self.assertIsNone(waveform.sounding(log(quiet(0, 10.0004), quiet(10.0009, 20)), 20))

    def test_other_lines_in_between_dont_matter(self):
        said = log("Input #0, mp3, from 'a.mp3':", quiet(0, 3), "[out#0/null @ 0000] video:0KiB audio:2067KiB", quiet(7, 12))
        self.assertEqual(waveform.sounding(said, 12), [3.0, 7.0])


def made(path, expression, seconds):
    """A made-up song, as FLAC: `expression` is the sound at time t, the same in both channels."""
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{expression}|{expression}':s=44100:d={seconds}", "-c:a", "flac", path], check=True)


class MeasuringWhereTheSoundIs(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)
        self.path = os.path.join(self.folder, "a.flac")

    def near(self, got, expected):
        self.assertIsNotNone(got)
        for a, b in zip(got, expected):
            self.assertAlmostEqual(a, b, delta=0.05)

    def test_a_song_with_quiet_at_both_ends(self):
        made(self.path, "if(between(t,3,7),0.5*sin(2*PI*220*t),0)", 12)
        self.near(waveform.edges(self.path), [3, 7])

    def test_a_song_with_none(self):
        made(self.path, "0.5*sin(2*PI*220*t)", 9)
        self.near(waveform.edges(self.path), [0, 9])

    def test_less_than_a_second_of_quiet_is_left_alone(self):
        made(self.path, "if(gte(t,0.6),0.5*sin(2*PI*220*t),0)", 9)
        self.near(waveform.edges(self.path), [0, 9])

    def test_a_quiet_middle_is_left_alone(self):
        made(self.path, "if(between(t,3,6),0,0.5*sin(2*PI*220*t))", 9)
        self.near(waveform.edges(self.path), [0, 9])

    def test_a_song_that_opens_on_hi_hats_alone_isnt_quiet(self):  # high and soft: measured at the full rate, it's heard
        made(self.path, "if(lt(t,3),0.03*sin(2*PI*9000*t),0.5*sin(2*PI*220*t))", 9)
        self.near(waveform.edges(self.path), [0, 9])

    def test_hiss_far_down_is_quiet(self):
        made(self.path, "if(lt(t,3),0.0002*(random(0)*2-1),0.5*sin(2*PI*220*t))", 9)
        self.near(waveform.edges(self.path), [3, 9])

    def test_a_steady_offset_doesnt_hide_the_quiet(self):  # an old transfer: its quiet sits a little off zero, which nobody can hear
        made(self.path, "if(between(t,3,7),0.5*sin(2*PI*220*t),0.002)", 12)
        self.near(waveform.edges(self.path), [3, 7])

    def test_a_song_thats_quiet_all_the_way_through(self):
        made(self.path, "0", 5)
        self.assertIsNone(waveform.edges(self.path))

    def test_something_that_isnt_audio(self):
        with open(self.path, "wb") as f:
            f.write(b"not audio at all")
        self.assertIsNone(waveform.edges(self.path))

    def test_with_no_ffmpeg(self):
        with mock.patch.object(waveform.shutil, "which", return_value=None):
            self.assertIsNone(waveform.edges(self.path))

    def test_ffmpeg_getting_stuck(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=subprocess.TimeoutExpired("x", 1)):
            self.assertIsNone(waveform.edges(self.path))

    def test_ffmpeg_not_starting(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=OSError("no")):
            self.assertIsNone(waveform.edges(self.path))

    def test_ffmpeg_not_saying_how_long_it_was(self):
        done = subprocess.CompletedProcess([], 0, stdout=b"out_time_us=N/A\nprogress=end\n", stderr=quiet(0, 3).encode())
        with mock.patch.object(waveform.subprocess, "run", return_value=done):
            self.assertIsNone(waveform.edges(self.path))

    def test_a_file_whose_clock_starts_late_isnt_measured(self):  # a browser may keep that offset, and then the times wouldn't line up
        done = subprocess.CompletedProcess([], 0, stdout=b"out_time_us=55010000\nprogress=end\n", stderr=log("  Duration: 00:01:00.00, start: 4.990000, bitrate: 900 kb/s", quiet(50, 55.01)).encode())
        with mock.patch.object(waveform.subprocess, "run", return_value=done):
            self.assertIsNone(waveform.edges(self.path))

    def test_a_file_that_starts_a_moment_in_is_measured(self):  # as an MP3's first frame often does
        done = subprocess.CompletedProcess([], 0, stdout=b"out_time_us=12000000\nprogress=end\n", stderr=log("  Duration: 00:00:12.03, start: 0.025057, bitrate: 192 kb/s", quiet(0, 3), quiet(7, 12)).encode())
        with mock.patch.object(waveform.subprocess, "run", return_value=done):
            self.assertEqual(waveform.edges(self.path), [3.0, 7.0])

    def test_a_slot_is_free_again_afterwards(self):
        with mock.patch.object(waveform.subprocess, "run", side_effect=OSError("no")):
            for _ in range(4):
                waveform.edges(self.path)
        self.assertTrue(waveform._slots.acquire(blocking=False))
        waveform._slots.release()


WAVE = [50] * waveform.SLICES
EDGES = [3.0, 297.5]


class Served(Base):
    """The app, running, with one song in it."""
    def setUp(self):
        super().setUp()
        self.one = self.song("Acid", "A - One", notes="")
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def patch(self, name, value):
        patcher = mock.patch.object(waveform, name, return_value=value)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def ask(self, route, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("GET", route, headers=headers or {})
        r = c.getresponse()
        payload = r.read()
        c.close()
        return r.status, json.loads(payload) if payload.startswith(b"{") else payload

    def song_now(self):
        self.server.collection.refresh()
        return next(iter(self.server.collection.songs.values()))


class FromThePage(Served):
    def setUp(self):
        super().setUp()
        self.saved = os.path.join(self.app, "waveforms.json")
        self.measure = self.patch("measure", WAVE)

    def get(self):
        return self.ask(f"/api/waveform/{self.song_now()['id']}")

    def test_the_page_gets_the_shape(self):
        self.assertEqual(self.get(), (200, dict(wave=WAVE)))

    def test_it_is_only_measured_once(self):
        self.get()
        self.get()
        self.assertEqual(self.measure.call_count, 1)

    def test_it_is_still_there_after_a_restart(self):
        self.get()
        self.server.collection = webapp.Collection(webapp.app_paths())
        self.assertEqual(self.get(), (200, dict(wave=WAVE)))
        self.assertEqual(self.measure.call_count, 1)

    def test_a_moved_song_isnt_measured_again(self):
        self.get()
        moved = os.path.join(self.lib, "Techno", "A - One.mp3")
        os.makedirs(os.path.dirname(moved), exist_ok=True)
        shutil.move(self.one, moved)
        self.get()
        self.assertEqual(self.measure.call_count, 1)

    def test_a_better_copy_is(self):
        self.get()
        with open(self.one, "ab") as f:
            f.write(b"\xff\xfb\x90\x00" * 50)
        self.get()
        self.assertEqual(self.measure.call_count, 2)

    def test_a_shape_that_cant_be_told_isnt_kept(self):
        self.measure.return_value = None
        self.assertEqual(self.get(), (200, dict(wave=None)))
        self.assertFalse(os.path.exists(self.saved))
        self.measure.return_value = WAVE
        self.assertEqual(self.get(), (200, dict(wave=WAVE)))

    def test_a_song_it_doesnt_know(self):
        self.assertEqual(self.ask("/api/waveform/000000000000")[0], 404)

    def test_only_what_looks_like_a_song_id(self):
        self.assertEqual(self.ask("/api/waveform/..%2F..%2Fsecret")[0], 404)

    def test_another_site_cant_ask(self):
        self.assertEqual(self.ask(f"/api/waveform/{self.song_now()['id']}", headers={"Host": "evil.example"})[0], 403)

    def test_nothing_half_written_is_left(self):
        self.get()
        self.assertFalse(os.path.exists(self.saved + ".tmp"))

    def test_shapes_arent_sent_with_the_whole_library(self):
        self.get()
        self.assertNotIn("wave", self.ask("/api/all")[1]["songs"][0])

    def test_a_saved_file_of_the_wrong_kind_is_measured_again(self):
        key = webapp.level_key(self.song_now())
        for wrong in ("many", [1, "x"], [101], [-1], [True], {"a": 1}):
            with self.subTest(wrong):
                self.measure.reset_mock()
                with open(self.saved, "w", encoding="utf-8") as f:
                    json.dump({key: wrong}, f)
                self.assertEqual(self.get(), (200, dict(wave=WAVE)))
                self.assertEqual(self.measure.call_count, 1)

    def test_a_saved_file_that_cant_be_read_doesnt_break_the_page(self):
        with open(self.saved, "w", encoding="utf-8") as f:
            f.write("not json")
        self.assertEqual(self.get(), (200, dict(wave=WAVE)))

    def test_it_doesnt_get_in_the_way_of_the_loudness(self):
        from music_curator import loudness
        with mock.patch.object(loudness, "measure", return_value=-9.5):
            status, answer = self.ask(f"/api/loudness/{self.song_now()['id']}")
        self.assertEqual((status, answer), (200, dict(lufs=-9.5)))
        self.assertEqual(self.get(), (200, dict(wave=WAVE)))
        self.assertEqual(self.song_now()["lufs"], -9.5)


class EdgesFromThePage(Served):
    def setUp(self):
        super().setUp()
        self.saved = os.path.join(self.app, "sound_edges.json")
        self.measure = self.patch("edges", EDGES)

    def get(self):
        return self.ask(f"/api/edges/{self.song_now()['id']}")

    def test_the_page_gets_them(self):
        self.assertEqual(self.get(), (200, dict(edges=EDGES)))

    def test_they_are_only_measured_once(self):
        self.get()
        self.get()
        self.assertEqual(self.measure.call_count, 1)

    def test_they_are_still_there_after_a_restart(self):
        self.get()
        self.server.collection = webapp.Collection(webapp.app_paths())
        self.assertEqual(self.get(), (200, dict(edges=EDGES)))
        self.assertEqual(self.measure.call_count, 1)
        with open(self.saved, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {webapp.level_key(self.song_now()): EDGES})

    def test_a_better_copy_is_measured_again(self):
        self.get()
        with open(self.one, "ab") as f:
            f.write(b"\xff\xfb\x90\x00" * 50)
        self.get()
        self.assertEqual(self.measure.call_count, 2)

    def test_what_cant_be_told_isnt_kept(self):
        self.measure.return_value = None
        self.assertEqual(self.get(), (200, dict(edges=None)))
        self.assertFalse(os.path.exists(self.saved))
        self.measure.return_value = EDGES
        self.assertEqual(self.get(), (200, dict(edges=EDGES)))

    def test_a_saved_file_of_the_wrong_kind_is_measured_again(self):
        key = webapp.level_key(self.song_now())
        for wrong in ("many", [1], [1, 2, 3], [5, 2], [2, 2], [-1, 2], [True, 2], ["0", 2], [0, 1e9], [0, float("nan")], {"a": 1}, None):
            with self.subTest(wrong):
                self.measure.reset_mock()
                with open(self.saved, "w", encoding="utf-8") as f:
                    json.dump({key: wrong}, f)
                self.assertEqual(self.get(), (200, dict(edges=EDGES)))
                self.assertEqual(self.measure.call_count, 1)

    def test_a_song_it_doesnt_know(self):
        self.assertEqual(self.ask("/api/edges/000000000000")[0], 404)

    def test_another_site_cant_ask(self):
        self.assertEqual(self.ask(f"/api/edges/{self.song_now()['id']}", headers={"Host": "evil.example"})[0], 403)

    def test_they_arent_sent_with_the_whole_library(self):
        self.get()
        self.assertNotIn("edges", self.ask("/api/all")[1]["songs"][0])

    def test_they_dont_get_in_the_way_of_the_shape(self):
        shape = self.patch("measure", WAVE)
        song = self.song_now()["id"]
        self.assertEqual(self.ask(f"/api/waveform/{song}"), (200, dict(wave=WAVE)))
        self.assertEqual(self.get(), (200, dict(edges=EDGES)))
        self.assertEqual(self.ask(f"/api/waveform/{song}"), (200, dict(wave=WAVE)))
        self.assertEqual((shape.call_count, self.measure.call_count), (1, 1))


if __name__ == "__main__":
    unittest.main()
