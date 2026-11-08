"""What the follow-up pass found after the first set of review fixes: one test per problem.

    python -m unittest discover -s tests
"""
import csv
import os
import socket
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import cli, config, folders, tagwriter, webapp  # noqa: E402
from test_review_fixes import Base  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


class SecondRound(Base):
    def real(self, name):
        p = self.path(name)
        os.makedirs(p)
        return p

    def collection(self, log="", review_list="", decisions=None):
        os.makedirs(self.library, exist_ok=True)
        return webapp.Collection(dict(library=self.library, review="", review_list=review_list, inbox=[], log=log, cache=self.path("cache"),
                                      decisions=decisions or self.path("d.json")))

    def write_log(self, *rows):
        log = self.path("log.csv")
        with open(log, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=tagwriter.LOG_FIELDS)
            w.writeheader()
            for r in rows:
                w.writerow(r)
        return log

    def song(self, *parts, **tags):
        return write_mp3(os.path.join(self.library, *parts), **tags)

    def settings(self, text):
        os.makedirs(os.path.dirname(self.config), exist_ok=True)
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(text)

    # ---- stored paths
    def test_absolute_paths_are_taken_as_written_and_relative_ones_still_expand(self):
        absolute = self.path("a$$b", "%X%", "$HOME")
        self.assertEqual(config._resolve_path(absolute, self.root), absolute)
        with mock.patch.dict(os.environ, {"CURATOR_T": self.path("expanded")}):
            self.assertEqual(os.path.normpath(config._resolve_path("$CURATOR_T/x", self.root)), self.path("expanded", "x"))
        self.assertEqual(config._resolve_path("sub/x", self.root), self.path("sub", "x"))

    def test_first_run_under_a_folder_with_a_dollar_keeps_every_path(self):
        with mock.patch.dict(os.environ, {"BRKVAR": "expanded"}):
            base = self.real("$BRKVAR")
            self.assertIsNone(folders.save(dict(library=os.path.join(base, "My Music"), inbox=[], review="")))
            self.assertEqual(config.path("log"), os.path.join(base, "_curation", "log.csv"))
            self.assertFalse(os.path.exists(self.path("expanded")))

    def test_paths_that_is_not_a_table_is_refused_not_a_crash(self):
        os.makedirs(self.library)
        self.settings(f"[paths]\nlibrary = '{self.library}'\n")
        config.load(self.config)
        self.settings("paths = 'oops'\n")
        self.assertEqual(folders.save(dict(library=self.library, inbox=[self.downloads], review=""))[0], "library")

    def test_a_name_that_cannot_be_stored_is_refused_before_anything_is_made(self):
        bad = self.path("bad\ud800name")
        self.assertFalse(folders.check("library", bad)["ok"])
        self.assertEqual(folders.save(dict(library=bad, inbox=[], review=""))[0], "library")
        self.assertEqual(sorted(os.listdir(self.root)), ["Downloads"])

    # ---- HTTP
    def test_a_slow_body_cannot_hold_a_refused_connection(self):
        _, port = self.serve()
        with mock.patch.object(webapp, "DISCARD_S", 0.6), socket.create_connection(("127.0.0.1", port), timeout=6) as s:
            s.sendall(f"POST /x HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 1048576\r\n\r\n".encode())
            started, received = time.monotonic(), b""
            while time.monotonic() - started < 5:
                try:
                    s.sendall(b"x")
                    s.settimeout(0.2)
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    received += chunk
                except TimeoutError:
                    continue
                except OSError:
                    break
            self.assertLess(time.monotonic() - started, 4.5)
        self.assertIn(b"404", received)

    def test_a_bad_request_target_gets_an_answer(self):
        _, port = self.serve()
        for line in ("GET http://[/ HTTP/1.1", "POST http://[/api/settings HTTP/1.1"):
            with socket.create_connection(("127.0.0.1", port), timeout=5) as s:
                s.sendall(f"{line}\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 0\r\n\r\n".encode())
                self.assertIn(b"HTTP/1.1 4", s.recv(1024))

    def test_a_promised_body_that_never_comes_does_not_hold_the_connection(self):
        _, port = self.serve()
        with mock.patch.object(webapp, "BODY_TIMEOUT_S", 0.4), socket.create_connection(("127.0.0.1", port), timeout=5) as s:
            s.sendall(f"POST /api/decision HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{{}}".encode())
            started = time.monotonic()
            self.assertEqual(s.recv(1024), b"")
            self.assertLess(time.monotonic() - started, 3)

    # ---- files other programs may have touched
    def test_a_log_saved_by_excel_still_opens(self):
        self.song("Acid", "A - B.mp3")
        log = self.path("log.csv")
        with open(log, "wb") as f:
            f.write(",".join(tagwriter.LOG_FIELDS).encode() + b"\r\n" + b"2026-01-01T10:00:00,ok,x.mp3,,,,1,"
                    + os.path.join(self.library, "Acid", "A - B.mp3").encode() + b",A,B,,,Acid,,,caf\xe9\r\n")
        snap = self.collection(log=log).snapshot()
        self.assertEqual(len(snap["songs"]), 1)
        self.assertIn("caf", snap["songs"][0]["notes"])

    def test_a_log_held_open_by_another_program_does_not_stop_the_page(self):
        self.song("Acid", "A - B.mp3")
        log = self.write_log()
        real = open

        def fake(p, *a, **k):
            if p == log:
                raise PermissionError("in use")
            return real(p, *a, **k)

        with mock.patch("builtins.open", fake):
            snap = self.collection(log=log).snapshot()
        self.assertEqual(len(snap["songs"]), 1)

    def test_a_cut_off_log_row_does_not_stop_the_page(self):
        path = self.song("Acid", "A - B.mp3")
        log = self.path("log.csv")
        with open(log, "w", encoding="utf-8-sig", newline="") as f:
            f.write(",".join(tagwriter.LOG_FIELDS) + "\r\n" + f"2026-01-01T10:00:00,ok,x.mp3,a,,t,1,{path}\r\n")
        self.assertEqual(self.collection(log=log).snapshot()["songs"][0]["notes"], "")

    def test_a_date_excel_reformatted_is_skipped(self):
        path = self.song("Acid", "A - B.mp3")
        log = self.write_log(dict(date="08/11/2026 10:00", status="ok", src="x", dest=path))
        snap = self.collection(log=log).snapshot()
        self.assertEqual(snap["progress"]["timeline"], [])
        self.assertEqual(snap["progress"]["recent"][0]["when"], "")

    def test_a_review_list_that_is_not_utf8_still_opens(self):
        self.song("Acid", "A - B.mp3")
        listing = self.path("list.md")
        with open(listing, "wb") as f:
            f.write(b"- **caf\xe9 - x**: y\n")
        self.assertEqual(len(self.collection(review_list=listing).snapshot()["songs"]), 1)

    def test_answers_of_the_wrong_shape_are_ignored(self):
        self.song("Acid", "A - B.mp3")
        for text in ("[1,2]", "null", '{"flag:library/Acid/A - B.mp3":"x"}'):
            with self.subTest(text=text):
                file = self.path("answers.json")
                with open(file, "w", encoding="utf-8") as f:
                    f.write(text)
                snap = self.collection(decisions=file).snapshot()
                self.assertEqual((len(snap["songs"]), snap["decisions"]), (1, {}))

    def test_odd_saved_discogs_answers_are_skipped(self):
        folder = self.path("cache", "discogs")
        os.makedirs(folder)
        answers = ('{"id":1,"labels":["x"]}', '{"id":[1],"labels":[{"name":"x"}]}', '{"id":2,"master_id":5,"year":"1999","labels":[{"name":"a"}]}',
                   '{"id":3,"master_id":5,"year":1998,"labels":[{"name":"b"}]}')
        for i, text in enumerate(answers):
            with open(os.path.join(folder, f"{i}.json"), "w", encoding="utf-8") as f:
                f.write(text)
        self.assertIsInstance(webapp.discogs_index(folder), tuple)

    def test_a_log_that_goes_away_and_comes_back_is_read_again(self):
        path = self.song("Acid", "A - B.mp3")
        os.makedirs(self.path("app"))
        log = self.path("app", "log.csv")
        with open(log, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=tagwriter.LOG_FIELDS)
            w.writeheader()
            w.writerow(dict(date="2026-01-01T10:00:00", status="ok", src="x", dest=path, notes="kept"))
        c = self.collection(log=log)
        self.assertEqual(c.snapshot()["songs"][0]["notes"], "kept")
        os.rename(self.path("app"), self.path("app2"))
        self.assertEqual(c.snapshot()["songs"][0]["notes"], "")
        os.rename(self.path("app2"), self.path("app"))
        self.assertEqual(c.snapshot()["songs"][0]["notes"], "kept")

    def test_history_never_lands_on_a_different_song(self):
        logged = self.song("Rock", "2001", "A - B.mp3")
        self.song("Pop", "2001", "A - B.mp3")
        log = self.write_log(dict(date="2026-01-01T10:00:00", status="ok", src="x", dest=logged, notes="rock-note"))
        by_folder = {s["folder"]: s["notes"] for s in self.collection(log=log).snapshot()["songs"]}
        self.assertEqual(by_folder, {"Rock/2001": "rock-note", "Pop/2001": ""})

    def test_after_a_move_nested_songs_keep_their_own_history(self):
        self.song("Rock", "2001", "A - B.mp3")
        self.song("Pop", "2001", "A - B.mp3")
        old = self.path("Old", "Library")
        log = self.write_log(dict(date="2026-01-01T10:00:00", status="ok", src="x", dest=os.path.join(old, "Rock", "2001", "A - B.mp3"), notes="rock-note"),
                             dict(date="2026-01-01T10:00:00", status="ok", src="y", dest=os.path.join(old, "Pop", "2001", "A - B.mp3"), notes="pop-note"))
        by_folder = {s["folder"]: s["notes"] for s in self.collection(log=log).snapshot()["songs"]}
        self.assertEqual(by_folder, {"Rock/2001": "rock-note", "Pop/2001": "pop-note"})

    # ---- folders
    @unittest.skipUnless(os.name == "nt", "Windows paths")
    def test_windows_spellings_of_the_lost_folder_cannot_recreate_it(self):
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        os.rmdir(self.library)
        for spelling in (self.library + ".", self.library + ". ", "\\\\?\\" + self.library):
            with self.subTest(spelling=spelling):
                self.assertFalse(folders.check("library", spelling)["ok"])
                self.assertEqual(folders.save(dict(library=spelling, inbox=[], review=""))[0], "library")
        self.assertFalse(os.path.exists(self.library))

    def test_a_save_that_keeps_the_library_never_moves_the_app_files(self):
        os.makedirs(self.library)
        cache, work = self.real("mycache"), self.real("mywork")
        self.settings(f"[paths]\nlibrary = '{self.library}'\nlog = '{self.path('app', 'log.csv')}'\ncache = '{cache}'\nwork = '{work}'\n")
        config.load(self.config)
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[self.downloads], review="")))
        self.assertEqual((config.path("log"), config.path("cache"), config.path("work")), (self.path("app", "log.csv"), cache, work))

    def test_when_the_library_moves_only_what_is_gone_gets_a_new_home(self):
        cache = self.real("mycache")
        self.settings(f"[paths]\nlibrary = '{self.path('gone', 'Lib')}'\nlog = '{self.path('gone', '_c', 'log.csv')}'\ncache = '{cache}'\nwork = '{self.path('gone', '_c', 'work')}'\n")
        config.load(self.config)
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        self.assertEqual(config.path("cache"), cache)
        self.assertEqual(config.path("log"), self.path("Music", "_curation", "log.csv"))

    def test_a_library_named_by_hand_and_not_made_yet_can_be_created(self):
        self.settings('[paths]\nlibrary = "My Music"\n')
        config.load(self.config)
        self.assertEqual(folders.reason(), "missing")
        self.assertTrue(folders.check("library", os.path.join(os.path.dirname(self.config), "My Music"))["create"])

    def test_a_hand_written_whole_drive_library_can_still_be_saved(self):
        root = os.path.abspath(os.sep)
        self.settings(f"[paths]\nlibrary = '{root}'\n")
        config.load(self.config)
        with mock.patch.object(folders, "_count_audio", return_value=(0, False)):
            self.assertTrue(folders.check("library", root)["ok"])

    def test_doctor_and_decisions_work_with_the_drive_gone(self):
        for cmd in ("doctor", "decisions"):
            with self.subTest(cmd=cmd), mock.patch("os.makedirs") as made:
                cli._setup(mock.Mock(config=self.config, cmd=cmd))
                made.assert_not_called()

    def test_a_broken_settings_file_says_so_in_words(self):
        for text in ("[paths\nlibrary=", "[paths]\nlibrary = 5\n", "paths = 'oops'\n"):
            with self.subTest(text=text):
                self.settings(text)
                with self.assertRaises(SystemExit) as stop:
                    cli._setup(mock.Mock(config=self.config, cmd="serve"))
                self.assertIn("curator.toml", str(stop.exception.code))

    def test_a_byte_order_mark_is_accepted(self):
        os.makedirs(os.path.dirname(self.config))
        with open(self.config, "w", encoding="utf-8-sig") as f:
            f.write(f"[paths]\nlibrary = '{self.library}'\n")
        config.load(self.config)
        self.assertEqual(config.path("library"), self.library)
        config.save_paths(self.config, {"library": self.downloads})
        with open(self.config, "rb") as f:
            self.assertFalse(f.read().startswith(b"\xef\xbb\xbf"))

    def test_decisions_command_survives_a_bad_file(self):
        self.settings(f"[paths]\nlibrary = '{self.library}'\nlog = '{self.path('app', 'log.csv')}'\n")
        config.load(self.config)
        os.makedirs(self.path("app"))
        with open(self.path("app", "decisions.json"), "w", encoding="utf-8") as f:
            f.write("[1,2]")
        self.assertEqual(webapp.show_decisions(), 0)


if __name__ == "__main__":
    unittest.main()
