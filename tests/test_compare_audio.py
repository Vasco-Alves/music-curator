"""Comparing a song with the videos on its record: what it tells you, and what it never does. Nothing here reaches the network."""
import http.client
import json
import os
import subprocess
import sys
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import config, curate, discogs, samerec, videos, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_curate import KEY, LENGTH, WithDiscogs  # noqa: E402
from test_webapp import write_mp3  # noqa: E402

VIDEO, OTHER, THIRD, FOURTH = "abcdefghijk", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"
URL = f"https://www.youtube.com/watch?v={VIDEO}"
FAR = "0:40"  # the test files run about 5 seconds, so a record listing this holds the song back
SONG = "A - Song"
FILE = SONG + ".mp3"
ONE_VIDEO = ((VIDEO, "A - Song", 5),)


class Comparing(WithDiscogs):
    def setUp(self):
        super().setUp()
        self.fetched, self.kept, self.there = [], [], []
        self.ber, self.items, self.video_secs, self.fetch_error, self.after_fetch = 0.1, 45, 5, None, None
        for patcher in (mock.patch.object(samerec, "fetch_audio", self.fetch), mock.patch.object(videos.fpcompare, "fingerprint", self.fingerprint),
                        mock.patch.object(videos.fpcompare, "compare", lambda a, b: (self.ber, 0, self.items)), mock.patch.object(curate, "can_compare", return_value=True)):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.setting(True)

    def setting(self, on):
        patcher = mock.patch.dict(config.cfg()["curate"], {"compare_audio": on})
        patcher.start()
        self.addCleanup(patcher.stop)

    def fetch(self, video_id, folder, timeout=None):
        self.fetched.append(video_id)
        if self.after_fetch:
            self.after_fetch()
        if self.fetch_error:
            return {"error": self.fetch_error}
        path = os.path.join(folder, f"{video_id}.webm")
        with open(path, "wb") as f:
            f.write(b"audio")
        self.kept.append(path)
        return dict(id=video_id, file=path, duration=self.video_secs)

    def fingerprint(self, path):
        self.there.append(os.path.exists(path))
        return [1, 2, 3]

    def record(self, tracks=(("A1", "Song", FAR),), linked=ONE_VIDEO, artist="A"):
        rid = self.fake.add(artist, "The Record", list(tracks))
        self.fake.releases[rid]["videos"] = [dict(uri=f"https://www.youtube.com/watch?v={v}", title=t, duration=d) for v, t, d in linked]
        return rid

    def check(self, name=FILE):
        return next(c for c in self.page_song(name)["checks"] if c["kind"] == "waiting")

    def strong_run(self):
        self.file(SONG)
        self.record()
        return self.run_it()[1]


class WhatItTellsYou(Comparing):
    def test_a_strong_match_never_adds_the_song(self):
        done = self.strong_run()
        self.assertEqual((done["added"], done["waiting"], done["strong"], self.in_library()), (0, 1, 1, []))

    def test_a_strong_match_shows_the_video_and_the_version(self):
        self.strong_run()
        self.assertEqual(self.check()["audio"], dict(strong=True, url=URL, option="A1|Song"))

    def test_the_reason_it_waits_stays_the_same(self):
        self.strong_run()
        self.assertIn("seconds shorter than the record", self.check()["why"])

    def test_no_match_says_how_many_were_compared(self):
        self.ber = 0.4
        self.file(SONG)
        self.record()
        _, done = self.run_it()
        self.assertEqual((done["strong"], self.check()["audio"]), (0, dict(strong=False, tried=1)))

    def test_a_record_with_no_videos_says_nothing(self):
        self.file(SONG)
        self.record(linked=())
        self.run_it()
        self.assertNotIn("audio", self.check())
        self.assertEqual(self.fetched, [])

    def test_several_versions_on_the_record_get_compared_too(self):
        self.file(SONG)
        self.record(tracks=(("A1", "Song (Barn Mix)", "0:05"), ("B1", "Song (Dub)", "0:05")), linked=((VIDEO, "A - Song (Dub)", 5),))
        _, done = self.run_it()
        self.assertEqual((done["added"], done["strong"]), (0, 1))
        self.assertEqual(self.check()["audio"]["option"], "B1|Song (Dub)")


class OnlyWhenItsWanted(Comparing):
    def test_a_song_the_rules_settle_goes_in_with_nothing_fetched(self):
        self.file(SONG)
        self.record(tracks=(("A1", "Song", LENGTH),))
        _, done = self.run_it()
        self.assertEqual((done["added"], self.fetched), (1, []))

    def test_off_fetches_nothing(self):
        self.setting(False)
        done = self.strong_run()
        self.assertEqual((done["waiting"], done["strong"], done["said"], self.fetched), (1, 0, "", []))
        self.assertNotIn("audio", self.check())

    def test_it_is_off_unless_someone_turns_it_on(self):
        self.assertIs(config.DEFAULTS["curate"]["compare_audio"], False)

    def test_only_a_real_true_turns_it_on(self):
        with mock.patch.dict(config.cfg()["curate"], {"compare_audio": "false"}):
            self.assertFalse(curate.compare_on())

    def test_with_no_ytdlp_curate_carries_on_and_says_so(self):
        with mock.patch.object(curate, "can_compare", return_value=False):
            done = self.strong_run()
        self.assertEqual((done["waiting"], self.fetched), (1, []))
        self.assertIn("yt-dlp", done["said"])

    def test_a_preview_fetches_nothing(self):
        self.file(SONG)
        self.record()
        self.run_it(dry_run=True)
        self.assertEqual(self.fetched, [])

    def test_a_different_artist_isnt_compared(self):
        self.file("Eve - Song")
        self.record(artist="Eve Nova")
        with mock.patch.object(discogs, "search", self.fake.everything):
            self.run_it()
        self.assertEqual(self.fetched, [])

    def test_a_song_already_in_the_library_isnt_compared(self):
        self.file(SONG)
        write_mp3(os.path.join(self.lib, "Acid", FILE), artist="A", title="Song", genre="Acid")
        self.record()
        self.run_it()
        self.assertEqual(self.fetched, [])

    def test_a_song_not_on_discogs_isnt_compared(self):
        self.file(SONG)
        self.run_it()
        self.assertEqual(self.fetched, [])


class WhichVideos(Comparing):
    def test_one_that_runs_much_longer_isnt_worth_fetching(self):
        self.file(SONG)
        self.record(linked=((VIDEO, "A - Song", 240),))
        self.run_it()
        self.assertEqual(self.fetched, [])

    def test_a_video_of_another_track_isnt_fetched(self):
        self.file(SONG)
        self.record(linked=((VIDEO, "A - Other Thing", 5),))
        self.run_it()
        self.assertEqual(self.fetched, [])

    def test_no_more_than_three_are_fetched(self):
        self.ber = 0.4
        self.file(SONG)
        self.record(linked=tuple((v, "A - Song", 5) for v in (VIDEO, OTHER, THIRD, FOURTH)))
        self.run_it()
        self.assertEqual(len(self.fetched), videos.MOST_TO_FETCH)

    def test_the_closest_in_length_goes_first(self):
        self.ber = 0.4
        self.file(SONG)
        self.record(linked=((VIDEO, "A - Song", 9), (OTHER, "A - Song", 5), (THIRD, "A - Song", 0)))
        self.run_it()
        self.assertEqual(self.fetched, [OTHER, VIDEO, THIRD])

    def test_it_stops_at_the_first_strong_match(self):
        self.file(SONG)
        self.record(linked=((VIDEO, "A - Song", 5), (OTHER, "A - Song", 5)))
        self.run_it()
        self.assertEqual(self.fetched, [VIDEO])


class WhatCountsAsStrong(unittest.TestCase):
    def test_same_length_and_matching_start_to_finish(self):
        self.assertTrue(videos.is_strong(0.1, 280, 300, 300))

    def test_a_few_seconds_of_silence_dont_matter(self):
        self.assertTrue(videos.is_strong(0.15, 280, 300, 304))

    def test_too_many_differences(self):
        self.assertFalse(videos.is_strong(0.2, 300, 300, 300))

    def test_a_shorter_edit_that_matches_for_as_long_as_it_lasts(self):
        self.assertFalse(videos.is_strong(0.05, 200, 200, 300))

    def test_matching_only_part_of_the_way(self):
        self.assertFalse(videos.is_strong(0.1, 120, 300, 300))

    def test_with_no_length_it_cant_be_sure(self):
        self.assertFalse(videos.is_strong(0.1, 300, 300, None))
        self.assertFalse(videos.is_strong(0.1, 300, 0, 300))


class NothingIsKept(Comparing):
    def left(self):
        return [os.path.join(where, name) for where, _, names in os.walk(config.path("work")) for name in names]

    def test_the_fetched_audio_is_there_for_the_comparison_and_gone_after(self):
        self.strong_run()
        self.assertEqual(self.there, [True, True])
        self.assertEqual([os.path.exists(p) for p in self.kept], [False])
        self.assertEqual(self.left(), [])

    def test_gone_even_when_comparing_blows_up(self):
        self.file(SONG)
        self.record()
        with mock.patch.object(videos.fpcompare, "compare", side_effect=ValueError("boom")):
            _, done = self.run_it()
        self.assertEqual((done["waiting"], self.left()), (1, []))

    def test_a_comparison_that_blows_up_keeps_the_songs_place_on_the_list(self):
        self.file(SONG)
        self.record()
        with mock.patch.object(videos, "linked", side_effect=OSError("no network")):
            self.run_it()
        self.assertIn("seconds shorter", self.check()["why"])
        self.assertTrue(self.check()["options"])


class OnceForEachFile(Comparing):
    def test_a_second_run_doesnt_fetch_again(self):
        self.strong_run()
        self.fetched.clear()
        _, done = self.run_it()
        self.assertEqual((self.fetched, done["strong"]), ([], 1))
        self.assertEqual(self.check()["audio"]["strong"], True)

    def test_no_match_isnt_fetched_again_either(self):
        self.ber = 0.4
        self.file(SONG)
        self.record()
        self.run_it()
        self.fetched.clear()
        self.run_it()
        self.assertEqual(self.fetched, [])

    def test_a_different_file_is_compared_again(self):
        path = self.file(SONG)
        self.record()
        self.run_it()
        self.fetched.clear()
        with open(path, "ab") as f:
            f.write(b"\xff" * 400)
        self.run_it()
        self.assertEqual(self.fetched, [VIDEO])

    def test_what_was_found_about_an_older_copy_isnt_shown(self):
        path = self.file(SONG)
        self.record()
        self.run_it()
        with open(path, "ab") as f:
            f.write(b"\xff" * 400)
        self.assertNotIn("audio", self.check())

    def test_a_video_that_couldnt_be_fetched_gets_another_go(self):
        self.fetch_error = "network"
        self.file(SONG)
        self.record()
        self.run_it()
        self.assertNotIn("audio", self.check())
        self.fetch_error, self.fetched[:] = None, []
        _, done = self.run_it()
        self.assertEqual((self.fetched, done["strong"]), ([VIDEO], 1))

    def test_what_was_found_stays_when_the_setting_goes_off(self):
        self.strong_run()
        self.setting(False)
        self.run_it()
        self.assertEqual(self.check()["audio"]["strong"], True)

    def test_after_telling_it_what_the_song_is_the_new_record_is_compared(self):
        self.file(SONG)
        self.record()
        self.run_it()
        self.fetched.clear()
        self.record(artist="B", linked=((OTHER, "B - Song", 5),))
        self.answer_for(SONG, "identify", "B - Song")
        self.run_it()
        self.assertEqual(self.fetched, [OTHER])
        self.assertEqual(self.check()["audio"]["url"], f"https://www.youtube.com/watch?v={OTHER}")


class WhenFetchingFails(Comparing):
    def many(self, n):
        for i in range(n):
            self.file(f"A - Song{i}")
            self.fake.releases[self.record(tracks=(("A1", f"Song{i}", FAR),), linked=())]["videos"] = [dict(uri=f"https://www.youtube.com/watch?v={chr(97 + i) * 11}", title=f"A - Song{i}", duration=5)]

    def test_it_gives_up_for_the_run_and_says_why(self):
        self.fetch_error = "blocked"
        self.many(8)
        _, done = self.run_it()
        self.assertEqual(len(self.fetched), curate.STOP_FETCHING_AFTER)
        self.assertEqual(done["waiting"], 8)
        self.assertIn("couldn't be fetched", done["said"])

    def test_stop_is_honoured_between_videos(self):
        self.ber = 0.4
        self.file(SONG)
        self.record(linked=((VIDEO, "A - Song", 5), (OTHER, "A - Song", 5)))
        stopping = threading.Event()
        self.after_fetch = stopping.set
        _, done = self.run_it(stopping=stopping)
        self.assertEqual(self.fetched, [VIDEO])
        self.assertNotIn("audio", self.check(), "half compared isn't an answer")
        self.assertEqual(done["waiting"], 1)


class WhichVersionTheVideoIs(unittest.TestCase):
    OPTIONS = [dict(pos="A1", title="Song (Barn Mix)", dur="7:00"), dict(pos="B1", title="Song (Dub)", dur="6:00")]

    def video(self, title, duration=None):
        return dict(title=title, duration=duration)

    def test_the_only_version_on_the_record(self):
        self.assertEqual(curate.version_on_video(self.video("Anything"), self.OPTIONS[:1]), "A1|Song (Barn Mix)")

    def test_named_in_the_videos_title(self):
        self.assertEqual(curate.version_on_video(self.video("A - Song (Dub)", 420), self.OPTIONS), "B1|Song (Dub)")

    def test_told_by_the_videos_length(self):
        self.assertEqual(curate.version_on_video(self.video("A - Song", 361), self.OPTIONS), "B1|Song (Dub)")

    def test_when_the_video_doesnt_say(self):
        self.assertEqual(curate.version_on_video(self.video("A - Song [HD]", 500), self.OPTIONS), "")

    def test_when_two_versions_are_equally_long(self):
        same = [dict(o, dur="6:00") for o in self.OPTIONS]
        self.assertEqual(curate.version_on_video(self.video("A - Song", 360), same), "")


class YouDecide(Comparing):
    def test_picking_the_version_adds_it_with_the_evidence_in_the_log(self):
        self.strong_run()
        self.answer_for(SONG, "pick", "A1|Song")
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (1, ["Acid/A - Song.mp3"]))
        notes = self.log_rows()[-1]["notes"]
        self.assertIn(curate.PICK_NOTE, notes)
        self.assertIn(URL, notes)
        collection = webapp.Collection(self.paths)
        collection.refresh()
        self.assertEqual(next(s for s in collection.songs.values() if s["area"] == "library")["trust"], "auto", "a person picked it, but nobody has double-checked it")

    def test_picking_another_version_doesnt_claim_the_match(self):
        self.file(SONG)
        self.record(tracks=(("A1", "Song (Barn Mix)", "0:05"), ("B1", "Song (Dub)", "0:05")), linked=((VIDEO, "A - Song (Dub)", 5),))
        self.run_it()
        self.answer_for(SONG, "pick", "A1|Song (Barn Mix)")
        self.run_it()
        self.assertNotIn(URL, self.log_rows()[-1]["notes"])

    def test_leaving_it_for_now_adds_nothing(self):
        self.strong_run()
        self.answer_for(SONG, "keep")
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (0, []))

    def _edit_waiting(self, change):
        path = webapp.curated_path(self.paths)
        with open(path, encoding="utf-8") as f:
            saved = json.load(f)
        change(saved["songs"][KEY.format(SONG)]["audio"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(saved, f)

    def test_a_link_that_isnt_a_video_never_reaches_the_page(self):
        self.strong_run()
        self._edit_waiting(lambda audio: audio["match"].update(url="javascript:alert(1)"))
        self.assertNotIn("audio", self.check())

    def test_a_hand_edited_answer_of_the_wrong_shape_is_ignored(self):
        self.strong_run()
        self._edit_waiting(lambda audio: audio.update(match="yes"))
        self.assertNotIn("audio", self.check())


class WhatItNeeds(unittest.TestCase):
    def answers(self, muxers="chromaprint", imported=0):
        def run(command, **_):
            return subprocess.CompletedProcess(command, imported if "import yt_dlp" in command else 0, stdout=muxers)
        return run

    def can(self, **kw):
        with mock.patch.object(curate.shutil, "which", return_value="ffmpeg"), mock.patch.object(curate.subprocess, "run", self.answers(**kw)):
            return curate.can_compare()

    def test_both_there(self):
        self.assertTrue(self.can())

    def test_no_chromaprint_in_ffmpeg(self):
        self.assertFalse(self.can(muxers="mp3 wav"))

    def test_no_ytdlp(self):
        self.assertFalse(self.can(imported=1))

    def test_no_ffmpeg(self):
        with mock.patch.object(curate.shutil, "which", return_value=None):
            self.assertFalse(curate.can_compare())

    def test_a_python_that_isnt_there(self):
        with mock.patch.object(curate.shutil, "which", return_value="ffmpeg"), mock.patch.object(curate.subprocess, "run", side_effect=OSError("missing")):
            self.assertFalse(curate.can_compare())

    def test_a_python_that_hangs(self):
        with mock.patch.object(curate.shutil, "which", return_value="ffmpeg"), mock.patch.object(curate.subprocess, "run", side_effect=subprocess.TimeoutExpired("x", 1)):
            self.assertFalse(curate.can_compare())


class TheSetting(Base):
    def setUp(self):
        super().setUp()
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.server.settings_lock = threading.Lock()
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        patcher = mock.patch.object(curate, "can_compare", return_value=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, method, route, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, route, body=None if body is None else json.dumps(body), headers={"Content-Type": "application/json", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if raw.startswith(b"{") else raw

    def saved(self):
        with open(self.cfg, encoding="utf-8") as f:
            return f.read()

    def test_it_starts_off(self):
        self.assertEqual(self.call("GET", "/api/settings/compare"), (200, dict(available=True, on=False)))

    def test_the_page_can_tell_when_it_isnt_available(self):
        with mock.patch.object(curate, "can_compare", return_value=False):
            self.assertEqual(self.call("GET", "/api/settings/compare")[1]["available"], False)

    def test_turning_it_on_is_saved_and_takes_effect(self):
        self.assertEqual(self.call("POST", "/api/settings/compare", dict(on=True)), (200, dict(on=True)))
        self.assertIn("compare_audio = true", self.saved())
        self.assertTrue(curate.compare_on())
        config.load(self.cfg)
        self.assertTrue(curate.compare_on(), "still on after a restart")

    def test_turning_it_off_again(self):
        self.call("POST", "/api/settings/compare", dict(on=True))
        self.call("POST", "/api/settings/compare", dict(on=False))
        self.assertIn("compare_audio = false", self.saved())
        self.assertFalse(curate.compare_on())

    def test_the_rest_of_the_settings_stay_as_they_were(self):
        before = self.saved()
        self.call("POST", "/api/settings/compare", dict(on=True))
        self.assertTrue(self.saved().startswith(before.rstrip()))

    def test_a_comment_on_the_line_stays(self):
        out = config.edit_table("[curate]\ncompare_audio = false   # keep me\n", "curate", dict(compare_audio=True))
        self.assertEqual(out, "[curate]\ncompare_audio = true   # keep me\n")

    def test_only_true_or_false_will_do(self):
        for wrong in ("true", 1, None, []):
            with self.subTest(wrong):
                self.assertEqual(self.call("POST", "/api/settings/compare", dict(on=wrong))[0], 400)
        self.assertNotIn("compare_audio", self.saved())

    def test_another_site_cant_turn_it_on(self):
        self.assertEqual(self.call("POST", "/api/settings/compare", dict(on=True), headers={"Origin": "http://evil.example"})[0], 403)
        self.assertNotIn("compare_audio", self.saved())

    def test_a_settings_file_it_cant_read_is_left_alone(self):
        with open(self.cfg, "w", encoding="utf-8") as f:
            f.write("this is = not [valid")
        status, answer = self.call("POST", "/api/settings/compare", dict(on=True))
        self.assertEqual(status, 400)
        self.assertIn("Couldn't save", answer["error"])
        self.assertEqual(self.saved(), "this is = not [valid")


if __name__ == "__main__":
    unittest.main()
