"""Tests for `curator apply`: the genre tag edit, what happens to files, and how the page sees the result.

    python -m unittest discover -s tests
"""
import contextlib
import csv
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import apply, cli, config, folders, library, other_sources, parse, resolve, tagwriter, webapp  # noqa: E402
from test_webapp import FRAME, write_mp3  # noqa: E402

AUDIO = FRAME * 50


def tag(version, frames, padding=64, flags=0):
    """An ID3v2 tag from (id, body) pairs."""
    out = b""
    for fid, body in frames:
        size = len(body).to_bytes(4, "big") if version == 3 else tagwriter._syncsafe(len(body))
        out += fid + size + b"\x00\x00" + body
    out += b"\x00" * padding
    return b"ID3" + bytes([version, 0, flags]) + tagwriter._syncsafe(len(out)) + out


class TagEdit(unittest.TestCase):
    OTHERS = [(b"TIT2", b"\x00Song"), (b"TXXX", b"\x00who\x00knows"), (b"APIC", b"\x00image/jpeg\x00\x03\x00\xff\xd8picture")]

    def frames_of(self, data):
        return apply._tag_frames(data)[1]

    def check(self, version):
        old = tag(version, [self.OTHERS[0], (b"TCON", b"\x00Techno"), *self.OTHERS[1:]]) + AUDIO
        new = apply.with_genre(old, "Acid")
        frames = self.frames_of(new)
        self.assertEqual([f[0] for f in frames], [b"TIT2", b"TCON", b"TXXX", b"APIC"])
        self.assertEqual([f for f in frames if f[0] != b"TCON"], [f for f in self.frames_of(old) if f[0] != b"TCON"])
        self.assertEqual(new[apply._tag_frames(new)[2]:], AUDIO)
        self.assertEqual(new[3], version)
        self.assertEqual(len(new), len(old) - len("Techno") + len("Acid") + (len("Techno") - len("Acid")))  # padding absorbs the difference

    def test_v23_and_v24(self):
        self.check(3)
        self.check(4)

    def test_grows_when_the_padding_runs_out(self):
        old = tag(3, [(b"TCON", b"\x00A")], padding=0) + AUDIO
        new = apply.with_genre(old, "A much longer genre name")
        self.assertEqual(new[apply._tag_frames(new)[2]:], AUDIO)
        self.assertGreater(len(new), len(old) + tagwriter.PADDING)

    def test_adds_a_genre_when_there_is_none_and_merges_repeats(self):
        self.assertEqual(self.frames_of(apply.with_genre(tag(3, self.OTHERS) + AUDIO, "Acid"))[0][0], b"TCON")
        new = apply.with_genre(tag(3, [(b"TCON", b"\x00A"), (b"TIT2", b"\x00S"), (b"TCON", b"\x00B")]) + AUDIO, "Acid")
        self.assertEqual([f[0] for f in self.frames_of(new)], [b"TCON", b"TIT2"])

    def test_non_latin_genre_reads_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_mp3(os.path.join(tmp, "a.mp3"))
            with open(path, "rb") as f:
                new = apply.with_genre(f.read(), "テクノ")
            with open(path, "wb") as f:
                f.write(new)
            self.assertEqual(library.read_song(path)["genre"], "テクノ")

    def test_refuses_what_it_cant_be_sure_of(self):
        good = tag(3, [(b"TCON", b"\x00A")])
        bad = {"no tag": AUDIO, "too short": b"ID3", "v2.2": b"ID3\x02" + good[4:], "unsynchronised": good[:5] + b"\x80" + good[6:],
               "extended header": good[:5] + b"\x40" + good[6:], "junk after the frames": good[:-4] + b"junk" + AUDIO,
               "frame past the tag": tag(3, [(b"TCON", b"\x00A")], padding=0)[:-1] + b"", "bad frame id": tag(3, [(b"tc n", b"\x00A")]) + AUDIO,
               "plain sizes in v2.4": b"ID3\x04\x00\x00" + tagwriter._syncsafe(300) + b"TCON\x00\x00\x00\x80\x00\x00" + b"\x00" * 290}
        for name, data in bad.items():
            with self.subTest(name), self.assertRaises(apply.Skip):
                apply.with_genre(data, "Acid")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(config.load, None)
        self.root = self.tmp.name
        home = mock.patch.dict(os.environ, {"USERPROFILE": self.root, "HOME": self.root})
        home.start()
        self.addCleanup(home.stop)
        self.lib, self.app = os.path.join(self.root, "Library"), os.path.join(self.root, "_curation")
        self.review, self.inbox = os.path.join(self.root, "Review"), os.path.join(self.root, "Downloads")
        for folder in (self.lib, self.app, self.review, self.inbox):
            os.makedirs(folder)
        self.log, self.answers = os.path.join(self.app, "log.csv"), os.path.join(self.app, "decisions.json")
        self.cfg = os.path.join(self.root, "curator.toml")
        with open(self.cfg, "w", encoding="utf-8") as f:
            f.write(f"[paths]\nlibrary = '{self.lib}'\ninbox = ['{self.inbox}']\nreview = '{self.review}'\nlog = '{self.log}'\n")
        config.load(self.cfg)
        self.rows = []

    def song(self, folder, name="A - B", genre=None, notes="genre toss-up: Techno / Acid", date="2026-01-02T03:04:05"):
        path = write_mp3(os.path.join(self.lib, folder, name + ".mp3"), genre=genre or folder, title=name.split(" - ")[-1], artist=name.split(" - ")[0])
        self.rows.append(dict(zip(tagwriter.LOG_FIELDS, [date, "ok", f"C:/old/{name}.mp3", "Old", "", "Old title", "100", path, name.split(" - ")[0],
                                                         name.split(" - ")[-1], "Album", "1995", genre or folder, "https://www.discogs.com/release/1", "", notes])))
        self.save_log()
        return path

    def save_log(self):
        with open(self.log, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=tagwriter.LOG_FIELDS)
            w.writeheader()
            w.writerows(self.rows)

    def answer(self, action, file, kind="genre", song="A - B", **extra):
        current = self.saved()
        current[f"{kind}:{file}"] = {**dict(kind=kind, action=action, song=song, file=file, genre="", note="", at="2026-11-08T10:00:00"), **extra}
        with open(self.answers, "w", encoding="utf-8") as f:
            json.dump(current, f)

    def saved(self):
        if not os.path.exists(self.answers):
            return {}
        with open(self.answers, encoding="utf-8") as f:
            return json.load(f)

    def log_rows(self):
        with open(self.log, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    def run_apply(self, **kw):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = apply.main(**kw)
        return code, out.getvalue()

    def tree(self):
        found = {}
        for dp, dirs, files in os.walk(self.root):
            found[dp] = None
            for name in files:
                p = os.path.join(dp, name)
                with open(p, "rb") as f:
                    found[p] = hashlib.sha1(f.read()).hexdigest()
        return found

    def aside_files(self):
        return [os.path.join(dp, n) for dp, _, files in os.walk(os.path.join(self.app, apply.SET_ASIDE)) for n in files]


class GenreAnswers(Base):
    def test_changes_the_tag_moves_the_file_and_settles_the_question(self):
        path = self.song("Techno", notes="only version on the record; genre toss-up: Techno / Acid")
        with open(path, "rb") as f:
            original = f.read()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.answer("keep", "library/Techno/C - D.mp3", kind="cover", song="C - D")
        code, out = self.run_apply()
        new = os.path.join(self.lib, "Acid", "A - B.mp3")
        self.assertEqual(code, 0, out)
        self.assertEqual(library.read_song(new)["genre"], "Acid")
        self.assertFalse(os.path.exists(path))
        self.assertFalse(os.path.isdir(os.path.dirname(path)), "the emptied genre folder is tidied away")
        with open(self.aside_files()[0], "rb") as f:
            self.assertEqual(f.read(), original, "the old copy is kept, untouched")
        self.assertEqual(list(self.saved()), ["cover:library/Techno/C - D.mp3"], "only the carried-out answer is gone")
        row = self.log_rows()[-1]
        self.assertEqual((row["dest"], row["genre"], row["status"], row["src"]), (new, "Acid", "ok", "C:/old/A - B.mp3"))
        self.assertEqual(row["notes"], "only version on the record; genre chosen by you (was Techno)")
        self.assertIn("Nothing was deleted", out)

    def test_dry_run_changes_nothing_at_all(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        before = self.tree()
        code, out = self.run_apply(dry_run=True)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.tree(), before)
        self.assertIn("Techno -> Acid", out)
        self.assertIn("Preview only", out)

    def test_a_song_kept_outside_its_genre_folder_stays_there(self):
        path = self.song(os.path.join("Game OST", "Re-Volt"), genre="Techno")
        self.answer("genre", "library/Game OST/Re-Volt/A - B.mp3", genre="Acid")
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertEqual(library.read_song(path)["genre"], "Acid")
        self.assertEqual(self.log_rows()[-1]["dest"], path)

    def test_nested_folder_rule(self):
        with open(self.cfg, "a", encoding="utf-8") as f:
            f.write('[rules]\nfolder = "{genre}/{year}"\n')
        config.load(self.cfg)
        self.song(os.path.join("Techno", "1995"), genre="Techno")
        self.answer("genre", "library/Techno/1995/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        self.assertTrue(os.path.isfile(os.path.join(self.lib, "Acid", "1995", "A - B.mp3")))

    def test_already_that_genre_becomes_a_keep(self):
        before = self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Techno")
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.exists(before))
        self.assertEqual(self.saved()["genre:library/Techno/A - B.mp3"]["action"], "keep")
        self.assertEqual(self.aside_files(), [])

    def test_wont_overwrite_a_file_already_there(self):
        path = self.song("Techno")
        taken = write_mp3(os.path.join(self.lib, "Acid", "A - B.mp3"), genre="Acid")
        with open(taken, "rb") as f:
            kept = f.read()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        code, out = self.run_apply()
        self.assertEqual(code, 1)
        self.assertIn("already a file", out)
        self.assertTrue(os.path.exists(path))
        with open(taken, "rb") as f:
            self.assertEqual(f.read(), kept)
        self.assertIn("genre:library/Techno/A - B.mp3", self.saved())

    def test_a_file_in_use_changes_nothing(self):
        path = self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        before = self.tree()
        with mock.patch("shutil.move", side_effect=PermissionError("in use")):
            code, out = self.run_apply()
        self.assertEqual(code, 1)
        self.assertIn("in use", out)
        self.assertTrue(os.path.exists(path))
        after = self.tree()
        self.assertEqual({k: v for k, v in after.items() if k != self.log}, {k: v for k, v in before.items() if k != self.log and apply.SET_ASIDE not in k}, "no temp file or new folder left behind")
        self.assertIn("genre:library/Techno/A - B.mp3", self.saved())
        self.assertEqual(len(self.log_rows()), 1)

    def test_if_the_new_file_cant_be_placed_the_old_one_comes_back(self):
        path = self.song("Techno")
        with open(path, "rb") as f:
            original = f.read()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        with mock.patch("os.replace", side_effect=PermissionError("nope")):
            code, _ = self.run_apply()
        self.assertEqual(code, 1)
        with open(path, "rb") as f:
            self.assertEqual(f.read(), original)
        self.assertFalse(os.path.exists(os.path.join(self.lib, "Acid")))

    def test_a_copy_that_doesnt_check_out_never_replaces_the_song(self):
        path = self.song("Techno")
        with open(path, "rb") as f:
            original = f.read()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        real = library.read_song
        with mock.patch("music_curator.library.read_song", side_effect=lambda p, name=None: dict(real(p, name), title="Wrong") if ".tmp_apply_" in p else real(p, name)):
            code, out = self.run_apply()
        self.assertEqual(code, 1)
        self.assertIn("didn't check out", out)
        with open(path, "rb") as f:
            self.assertEqual(f.read(), original)
        self.assertEqual(self.aside_files(), [])

    def test_missing_file_is_cleared_with_a_word(self):
        self.answer("genre", "library/Techno/Gone.mp3", genre="Acid")
        code, out = self.run_apply(dry_run=True)
        self.assertEqual(code, 0)
        self.assertIn("would be cleared", out)
        self.assertTrue(self.saved())
        code, out = self.run_apply()
        self.assertEqual(code, 0)
        self.assertEqual(self.saved(), {})

    def test_answers_that_point_outside_the_folders_are_refused(self):
        outside = write_mp3(os.path.join(self.root, "outside.mp3"))
        for file in ("library/../outside.mp3", "library/..\\outside.mp3", f"library/{outside}", "nowhere/a.mp3", "library/a.txt", 5):
            with self.subTest(file=file):
                if os.path.exists(self.answers):
                    os.remove(self.answers)
                self.answer("genre", file, genre="Acid")
                code, out = self.run_apply()
                self.assertTrue(os.path.exists(outside))
                self.assertEqual(library.read_song(outside)["genre"], "Acid")  # untouched; the helper's default genre
                self.assertTrue(code == 1 or "cleared" in out, out)
        self.assertFalse(os.path.exists(os.path.join(self.root, apply.SET_ASIDE)))

    def test_genre_names_that_cant_be_folders(self):
        path = self.song("Techno")
        for genre in ("..", "CON", "aux.x", "", "  ", "1995", "a\x01b"):
            with self.subTest(genre=genre):
                self.answer("genre", "library/Techno/A - B.mp3", genre=genre)
                code, _ = self.run_apply()
                self.assertEqual(code, 1)
                self.assertTrue(os.path.exists(path))

    def test_a_slash_in_a_genre_makes_one_folder(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Drum/Bass")
        self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(library.read_song(os.path.join(self.lib, "Drum-Bass", "A - B.mp3"))["genre"], "Drum/Bass")

    def test_only_library_mp3s(self):
        write_mp3(os.path.join(self.review, "A - B.mp3"))
        self.answer("genre", "review/A - B.mp3", genre="Trance")
        self.assertIn("isn't in your library", self.run_apply()[1])
        flac = os.path.join(self.lib, "Techno", "F.ogg")
        os.makedirs(os.path.dirname(flac))
        open(flac, "wb").close()
        if os.path.exists(self.answers):
            os.remove(self.answers)
        self.answer("genre", "library/Techno/F.ogg", genre="Acid")
        self.assertIn("only MP3, FLAC and M4A", self.run_apply()[1])

    def test_a_locked_log_stops_before_anything_changes(self):
        path = self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        with mock.patch.object(apply, "_open_log", side_effect=SystemExit("Can't write")), self.assertRaises(SystemExit):
            self.run_apply()
        self.assertTrue(os.path.exists(path))

    def test_a_log_without_a_final_newline(self):
        self.song("Techno")
        with open(self.log, "rb+") as f:
            f.seek(-2, os.SEEK_END)
            f.truncate()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(len(self.log_rows()), 2)

    def test_a_song_the_log_doesnt_know_gets_a_row(self):
        write_mp3(os.path.join(self.lib, "Techno", "A - B.mp3"), genre="Techno", artist="A", title="B")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        row = self.log_rows()[-1]
        self.assertEqual((row["artist"], row["title"], row["genre"], row["status"]), ("A", "B", "Acid", "ok"))

    def test_a_row_with_a_problem_keeps_it(self):
        self.song("Techno")
        self.rows[-1]["status"] = "check: cover missing"
        self.save_log()
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.run_apply()
        self.assertEqual(self.log_rows()[-1]["status"], "check: cover missing")

    def test_set_aside_stays_out_of_a_library_that_holds_the_log(self):
        with open(self.cfg, "w", encoding="utf-8") as f:
            f.write(f"[paths]\nlibrary = '{self.lib}'\nlog = '{os.path.join(self.lib, 'log.csv')}'\n")
        config.load(self.cfg)
        self.log = os.path.join(self.lib, "log.csv")
        self.answers = os.path.join(self.lib, "decisions.json")
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        self.assertTrue(os.path.isdir(os.path.join(self.root, "_curation", apply.SET_ASIDE)))
        self.assertFalse(os.path.exists(os.path.join(self.lib, apply.SET_ASIDE)))


class OtherAnswers(Base):
    def test_not_worth_keeping_needs_the_flag(self):
        path = write_mp3(os.path.join(self.review, "X - Y.mp3"))
        self.answer("drop", "review/X - Y.mp3", kind="waiting", song="X - Y")
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.exists(path))
        self.assertIn("--set-aside", out)
        self.assertTrue(self.saved())

    def test_set_aside_moves_it_and_logs_it(self):
        path = write_mp3(os.path.join(self.review, "X - Y.mp3"), artist="X", title="Y")
        self.answer("drop", "review/X - Y.mp3", kind="waiting", song="X - Y")
        before = self.tree()
        self.assertEqual(self.run_apply(dry_run=True, set_aside=True)[0], 0)
        self.assertEqual(self.tree(), before)
        code, out = self.run_apply(set_aside=True)
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(path))
        self.assertEqual(len(self.aside_files()), 1)
        self.assertEqual(self.saved(), {})
        row = self.log_rows()[-1]
        self.assertTrue(row["status"].startswith("removed: not worth keeping"))
        self.assertEqual((row["src"], row["dest"], row["artist"]), (path, "", "X"))

    def test_set_aside_from_downloads_and_library(self):
        inbox = write_mp3(os.path.join(self.inbox, "P - Q.mp3"))
        lib = self.song("Techno", notes="unverified")
        self.answer("drop", "inbox/Downloads/P - Q.mp3", kind="waiting", song="P - Q")
        self.answer("drop", "library/Techno/A - B.mp3", kind="unverified")
        self.assertEqual(self.run_apply(set_aside=True)[0], 0)
        self.assertFalse(os.path.exists(inbox) or os.path.exists(lib))
        statuses = {r["src"]: r for r in self.log_rows() if r["status"].startswith("removed")}
        self.assertEqual(statuses["C:/old/A - B.mp3"]["dest"], lib)
        self.assertEqual(len(self.aside_files()), 2)

    def test_research_answers_stay_on_the_list(self):
        self.answer("identify", "review/A.mp3", kind="waiting", song="A", note="It's by Hardfloor")
        self.answer("better", "library/T/B.mp3", kind="quality", song="B")
        self.answer("cover", "library/T/C.mp3", kind="cover", song="C")
        self.answer("recheck", "library/T/D.mp3", kind="problem", song="D")
        self.answer("flag", "library/T/E.mp3", kind="flag", song="E")
        before = self.saved()
        code, out = self.run_apply()
        self.assertEqual(code, 0)
        self.assertEqual(self.saved(), before)
        self.assertIn("It's by Hardfloor", out)
        self.assertIn("5 for your AI app", out)

    def test_nothing_to_do(self):
        self.assertIn("Nothing to apply", self.run_apply()[1])
        self.answer("keep", "library/T/B.mp3", kind="cover", song="B")
        self.assertIn("Nothing to apply", self.run_apply()[1])
        self.assertFalse(os.path.exists(self.log))

    def test_unreadable_answers_stop_with_a_message(self):
        with open(self.answers, "w", encoding="utf-8") as f:
            f.write("{broken")
        with self.assertRaises(SystemExit) as caught:
            self.run_apply()
        self.assertIn("Couldn't read", str(caught.exception))

    def test_odd_entries_survive(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        answers = self.saved()
        answers["junk"] = "not an answer"
        with open(self.answers, "w", encoding="utf-8") as f:
            json.dump(answers, f)
        self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(self.saved(), {"junk": "not an answer"})

    def test_through_the_command_line(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(cli.main(["--config", self.cfg, "apply", "--dry-run"]), 0)
        self.assertIn("Techno -> Acid", out.getvalue())
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Techno", "A - B.mp3")))

    def test_no_library_stops_with_a_message(self):
        shutil.rmtree(self.lib)
        with self.assertRaises(SystemExit) as caught:
            self.run_apply()
        self.assertIn("isn't there", str(caught.exception))


class WhenThingsGoWrong(Base):
    FILE = "library/Techno/A - B.mp3"

    def setUp(self):
        super().setUp()
        self.new = os.path.join(self.lib, "Acid", "A - B.mp3")

    def genre_answer(self):
        self.answer("genre", self.FILE, genre="Acid")

    def test_never_a_moment_without_the_song(self):
        path = self.song("Techno")
        self.genre_answer()
        both, real = [], apply._move

        def watch(src, dst):
            both.append(os.path.exists(self.new) and os.path.exists(path))
            real(src, dst)
        with mock.patch.object(apply, "_move", watch):
            self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(both, [True], "the new copy is in place before the old one leaves")

    def test_ctrl_c_as_the_old_copy_leaves(self):
        path = self.song("Techno")
        with open(self.log, "rb") as f:
            log = f.read()
        self.genre_answer()
        with mock.patch.object(apply, "_move", side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            self.run_apply()
        self.assertTrue(os.path.exists(path))
        self.assertFalse(os.path.exists(self.new))
        with open(self.log, "rb") as f:
            self.assertEqual(f.read(), log, "the log is taken back")
        self.assertIn(f"genre:{self.FILE}", self.saved())

    def test_a_run_stopped_after_placing_the_copy_is_finished_by_the_next(self):
        path = self.song("Techno")
        with open(path, "rb") as f:
            placed = apply.with_genre(f.read(), "Acid")
        os.makedirs(os.path.dirname(self.new))
        with open(self.new, "wb") as f:
            f.write(placed)
        self.genre_answer()
        code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(path))
        self.assertEqual(self.saved(), {})
        self.assertEqual(len(self.aside_files()), 1)

    def test_a_run_stopped_after_logging_changes_nothing_and_the_next_finishes(self):
        path = self.song("Techno")
        self.genre_answer()
        with mock.patch.object(apply.Run, "take_back"), mock.patch("os.replace", side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
            self.run_apply()  # like a kill: the row is written, the song hasn't moved, and nobody takes the row back
        self.assertTrue(os.path.exists(path))
        self.assertEqual(self.run_apply()[0], 0)
        self.assertTrue(os.path.exists(self.new))
        self.assertEqual(self.saved(), {})

    def test_staying_put_keeps_the_song_if_the_swap_fails(self):
        path = self.song(os.path.join("Game OST", "X"), genre="Techno")
        with open(path, "rb") as f:
            original = f.read()
        self.answer("genre", "library/Game OST/X/A - B.mp3", genre="Acid")
        with mock.patch("os.replace", side_effect=PermissionError("in use")):
            code, _ = self.run_apply()
        self.assertEqual(code, 1)
        with open(path, "rb") as f:
            self.assertEqual(f.read(), original)
        self.assertEqual(self.aside_files(), [])

    def test_staying_put_sets_a_copy_aside(self):
        path = self.song(os.path.join("Game OST", "X"), genre="Techno")
        with open(path, "rb") as f:
            original = f.read()
        self.answer("genre", "library/Game OST/X/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        with open(self.aside_files()[0], "rb") as f:
            self.assertEqual(f.read(), original)

    def test_a_failure_leaves_the_log_exactly_as_it_was_and_later_rows_are_fine(self):
        self.song("Techno")
        with open(self.log, "rb") as f:
            log = f.read()
        self.genre_answer()
        with mock.patch("shutil.move", side_effect=PermissionError("in use")):
            self.assertEqual(self.run_apply()[0], 1)
        with open(self.log, "rb") as f:
            self.assertEqual(f.read(), log)
        self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual([r["genre"] for r in self.log_rows()], ["Techno", "Acid"])

    def test_a_folder_that_isnt_there_keeps_its_answers(self):
        write_mp3(os.path.join(self.review, "X - Y.mp3"))
        self.answer("drop", "review/X - Y.mp3", kind="waiting", song="X - Y")
        os.rename(self.review, self.review + " away")
        code, out = self.run_apply(set_aside=True)
        self.assertEqual(code, 1)
        self.assertIn("Is the drive connected", out)
        self.assertEqual(len(self.saved()), 1)

    def test_the_songs_other_answers_move_with_it(self):
        self.song("Techno")
        self.genre_answer()
        self.answer("keep", self.FILE, kind="cover")
        self.answer("flag", self.FILE, kind="flag", note="wrong mix?")
        self.answer("keep", "library/Trance/Other.mp3", kind="cover", song="Other")
        self.assertEqual(self.run_apply()[0], 0)
        saved = self.saved()
        self.assertEqual(sorted(saved), ["cover:library/Acid/A - B.mp3", "cover:library/Trance/Other.mp3", "flag:library/Acid/A - B.mp3"])
        self.assertEqual((saved["flag:library/Acid/A - B.mp3"]["file"], saved["flag:library/Acid/A - B.mp3"]["note"]), ("library/Acid/A - B.mp3", "wrong mix?"))

    def test_a_song_on_its_way_out_isnt_retagged(self):
        path = self.song("Techno", notes="unverified; genre toss-up: Techno / Acid")
        self.genre_answer()
        self.answer("drop", self.FILE, kind="unverified")
        self.assertEqual(self.run_apply(set_aside=True)[0], 0)
        self.assertFalse(os.path.exists(path) or os.path.exists(self.new))
        self.assertEqual(self.saved(), {})

    def test_trouble_with_the_list_afterwards_is_reported_as_it_is(self):
        self.song("Techno")
        self.genre_answer()
        with mock.patch.object(apply.Run, "forget", side_effect=PermissionError(13, "locked")):
            code, out = self.run_apply()
        self.assertEqual(code, 0, out)
        self.assertIn("Done: 1 genre change", out)
        self.assertIn("next run will clear", out)
        self.assertNotIn("in use", out)
        self.assertTrue(os.path.exists(self.new))
        self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(self.saved(), {})

    def test_a_stopped_runs_temporary_copy_is_swept_up(self):
        self.song("Techno")
        left = os.path.join(self.lib, "Trance", apply.TEMP_PREFIX + "99999" + apply.TEMP_SUFFIX)
        os.makedirs(os.path.dirname(left))
        open(left, "wb").close()
        self.genre_answer()
        self.assertEqual(self.run_apply()[0], 0)
        self.assertFalse(os.path.exists(left))

    def test_two_folders_with_the_same_name_arent_guessed_between(self):
        other = os.path.join(self.root, "second", "Downloads")
        with open(self.cfg, "w", encoding="utf-8") as f:
            f.write(f"[paths]\nlibrary = '{self.lib}'\ninbox = ['{self.inbox}', '{other}']\nlog = '{self.log}'\n")
        config.load(self.cfg)
        one, two = write_mp3(os.path.join(self.inbox, "P - Q.mp3")), write_mp3(os.path.join(other, "P - Q.mp3"))
        self.answer("drop", "inbox/Downloads/P - Q.mp3", kind="waiting", song="P - Q")
        code, out = self.run_apply(set_aside=True)
        self.assertEqual(code, 1)
        self.assertIn("same name", out)
        self.assertTrue(os.path.exists(one) and os.path.exists(two))

    def test_a_song_with_no_usable_title_can_change_genre(self):
        for title, name in (("Untitled", "Untitled One"), ("", "Nameless")):
            with self.subTest(title=title):
                write_mp3(os.path.join(self.lib, "Techno", name + ".mp3"), genre="Techno", title=title, artist="")
                self.answer("genre", f"library/Techno/{name}.mp3", genre="Acid", song=name)
                code, out = self.run_apply()
                self.assertEqual(code, 0, out)
                self.assertEqual(library.read_song(os.path.join(self.lib, "Acid", name + ".mp3"))["genre"], "Acid")


class ThePageAfterwards(Base):
    def setUp(self):
        super().setUp()
        self.paths = webapp.app_paths()

    def test_a_broken_answers_file_is_never_saved_over(self):
        self.song("Techno")
        broken = '{"genre:library/Techno/A - B.mp3": {"action": "keep", "song": "A - B", "file": "library/Techno/A - B.mp3"},}'
        with open(self.answers, "w", encoding="utf-8") as f:
            f.write(broken)
        page = webapp.Collection(self.paths)
        page.refresh()
        error = page.decide(dict(id=next(iter(page.songs)), kind="cover", action="keep"))
        self.assertIn("can't be read", error)
        with open(self.answers, encoding="utf-8") as f:
            self.assertEqual(f.read(), broken)

    def test_a_byte_order_mark_is_fine_everywhere(self):
        path = self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        answers = self.saved()
        with open(self.answers, "w", encoding="utf-8-sig") as f:
            json.dump(answers, f)
        page = webapp.Collection(self.paths)
        self.assertEqual(list(page.decisions), list(answers))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(webapp.show_decisions(), 0)
        self.assertIn("A - B", out.getvalue())
        self.assertEqual(self.run_apply()[0], 0)
        self.assertFalse(os.path.exists(path))

    def test_decisions_says_when_it_cant_read_the_file(self):
        with open(self.answers, "w", encoding="utf-8") as f:
            f.write("{broken")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(webapp.show_decisions(), 1)
        self.assertIn("can't be read", out.getvalue())

    def test_an_open_page_cant_answer_for_a_song_that_moved(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        page = webapp.Collection(self.paths)
        page.refresh()
        song = next(iter(page.songs))
        self.assertEqual(self.run_apply()[0], 0)
        self.assertIn("has moved", page.decide(dict(id=song, kind="genre", action=None)))
        self.assertEqual(self.saved(), {})

    def test_curated_originals_arent_waiting_any_more(self):
        done, waiting = write_mp3(os.path.join(self.inbox, "Z - Z.mp3")), write_mp3(os.path.join(self.inbox, "Y - Y.mp3"))
        self.song("Techno")
        self.rows[-1]["src"] = done
        self.save_log()
        page = webapp.Collection(self.paths)
        page.refresh()
        self.assertEqual({s["file"]: s["done"] for s in page.songs.values() if s["area"] == "inbox"}, {"Z - Z.mp3": True, "Y - Y.mp3": False})
        self.assertTrue(os.path.exists(waiting))

    def test_the_question_goes_and_the_song_keeps_its_arrival_date(self):
        self.song("Techno", date="2026-01-02T03:04:05")
        self.song("Trance", name="Other - Song", notes="", date="2026-03-04T05:06:07")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        page = webapp.Collection(self.paths)
        page.refresh()
        self.assertEqual({s["genre"] for s in page.songs.values()}, {"Techno", "Trance"})
        self.assertEqual(self.run_apply()[0], 0)
        data = page.snapshot()
        moved = next(s for s in data["songs"] if s["artist"] == "A")
        self.assertEqual((moved["genre"], moved["key"]), ("Acid", "library/Acid/A - B.mp3"))
        self.assertEqual([c for c in moved["checks"] if c["kind"] == "genre"], [])
        self.assertEqual(moved["added"], "2026-01-02T03:04:05")
        self.assertEqual(moved["trust"], "verified")
        self.assertEqual(data["decisions"], {})
        self.assertEqual(sum(b["added"] for b in data["progress"]["timeline"]), 2)
        self.assertEqual(data["progress"]["timeline"][0]["t"][:10], "2026-01-02", "the change isn't counted as a new arrival")
        self.assertEqual(dict(data["progress"]["outcomes"]), {"Written": 2})

    def test_an_answer_saved_after_apply_doesnt_bring_old_ones_back(self):
        self.song("Techno")
        self.song("Trance", name="Other - Song", notes="genre toss-up: Trance / Goa")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        page = webapp.Collection(self.paths)
        page.refresh()
        other = next(s for s in page.songs.values() if s["artist"] == "Other")
        self.assertEqual(self.run_apply()[0], 0)  # the page is still open and hasn't reloaded
        self.assertIsNone(page.decide(dict(id=other["id"], kind="genre", action="keep")))
        self.assertEqual(list(self.saved()), ["genre:library/Trance/Other - Song.mp3"])

    def test_answers_saved_while_apply_runs_survive(self):
        self.song("Techno")
        self.song("Trance", name="Other - Song", notes="genre toss-up: Trance / Goa")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        page = webapp.Collection(self.paths)
        page.refresh()
        other = next(s for s in page.songs.values() if s["artist"] == "Other")
        real = apply.Run.forget

        def answer_then_forget(run, key, keep=False, moved=None):
            page.decide(dict(id=other["id"], kind="genre", action="keep"))
            real(run, key, keep, moved)
        with mock.patch.object(apply.Run, "forget", answer_then_forget):
            self.assertEqual(self.run_apply()[0], 0)
        self.assertEqual(list(self.saved()), ["genre:library/Trance/Other - Song.mp3"])

    def test_the_artists_next_song_follows_the_genre_you_chose(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.assertEqual(self.run_apply()[0], 0)
        items, seen = os.path.join(self.root, "items.json"), {}
        with open(items, "w", encoding="utf-8") as f:
            json.dump([dict(key="1", src="x", file="x.mp3")], f)

        def capture(item, history, keys):
            seen.update(history)
            raise ValueError("stop here")
        with mock.patch.object(resolve, "resolve", capture), contextlib.redirect_stdout(io.StringIO()):
            resolve.main([items, os.path.join(self.root, "out.json"), self.log, os.path.join(self.root, "cache"), self.lib])
        self.assertEqual(seen, {resolve.norm("A"): "Acid"})

    def test_parse_still_knows_the_song_is_done(self):
        self.song("Techno")
        self.answer("genre", "library/Techno/A - B.mp3", genre="Acid")
        self.run_apply()
        with open(self.log, encoding="utf-8-sig") as f:
            done = {r["src"] for r in csv.DictReader(f) if r["status"] == "ok"}
        self.assertIn("C:/old/A - B.mp3", done)


class TheCommandsAround(Base):
    def test_piped_output_keeps_every_name(self):
        self.answer("keep", "library/T/音楽.mp3", kind="cover", song="音楽 - 曲")
        raw = io.BytesIO()
        stream = io.TextIOWrapper(raw, encoding="cp1252", newline="")
        with mock.patch("sys.stdout", stream):
            self.assertEqual(cli.main(["--config", self.cfg, "decisions"]), 0)
            stream.flush()
        self.assertIn("音楽 - 曲", raw.getvalue().decode("utf-8"))

    def test_parse_names_what_it_skipped(self):
        open(os.path.join(self.inbox, "Lossless.ogg"), "wb").close()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            parse.main([os.path.join(self.root, "items.json"), self.log, self.inbox])
        self.assertIn("Lossless.ogg", out.getvalue())
        self.assertIn("Skipped 1 file", out.getvalue())

    def test_other_says_when_youtube_wasnt_checked(self):
        other_sources._warned[0] = False
        self.addCleanup(other_sources._warned.__setitem__, 0, False)
        out = io.StringIO()
        with mock.patch.object(other_sources, "yt", return_value={"error": "No module named yt_dlp"}), contextlib.redirect_stdout(out):
            self.assertIsNone(other_sources.try_topic(dict(search_artist="A", search_title="B", secs=100)))
            other_sources.try_topic(dict(search_artist="C", search_title="D", secs=100))
        self.assertEqual(out.getvalue().count("YouTube check isn't running"), 1)

    def test_a_python_that_isnt_there_counts_as_no_ytdlp(self):
        with mock.patch("subprocess.run", side_effect=FileNotFoundError("nope")):
            self.assertIn("error", other_sources.yt("search", "x", "1"))

    def doctor(self):
        out = io.StringIO()
        with mock.patch("music_curator.discogs.token", return_value="x"), contextlib.redirect_stdout(out):
            code = cli.main(["--config", self.cfg, "doctor"])
        return code, out.getvalue()

    def test_doctor_names_ffprobe_and_survives_a_bad_ytdlp_path(self):
        with open(self.cfg, "a", encoding="utf-8") as f:
            f.write(f"[ytdlp]\npython = '{os.path.join(self.root, 'no-such-python.exe')}'\n")

        def which(name):
            return None if name == "ffprobe" else os.path.join(self.root, name)
        real_run = mock.Mock(return_value=mock.Mock(stdout="chromaprint", stderr=""))

        def run(cmd, **kw):
            if cmd[0].endswith("no-such-python.exe"):
                raise FileNotFoundError(cmd[0])
            return real_run(cmd, **kw)
        with mock.patch("shutil.which", which), mock.patch("subprocess.run", run):
            code, out = self.doctor()
        self.assertEqual(code, 1)
        self.assertIn("ffprobe: MISSING", out)
        self.assertIn("yt-dlp: not available", out)

    def test_a_bare_python_name_is_left_for_the_path_to_find(self):
        with open(self.cfg, "a", encoding="utf-8") as f:
            f.write("[ytdlp]\npython = 'python'\n")
        config.load(self.cfg)
        self.assertEqual(config.ytdlp_python(), "python")

    def test_a_dry_run_of_write_leaves_the_log_alone(self):
        self.song("Techno")
        with open(self.log, "rb") as f:
            log = f.read()
        plan = os.path.join(self.root, "plan.json")
        with open(plan, "w", encoding="utf-8") as f:
            json.dump([dict(key="1", src=os.path.join(self.lib, "Techno", "A - B.mp3"), artist="A", title="B", year="1995", genre="Techno")], f)
        with mock.patch.object(tagwriter, "probe", return_value=dict(tags={}, secs=1.0, codec="mp3", pics=[])), contextlib.redirect_stdout(io.StringIO()):
            tagwriter.main([plan, self.lib, self.log, "--dry-run"])
        with open(self.log, "rb") as f:
            self.assertEqual(f.read(), log)

    def test_a_first_run_has_somewhere_to_list_held_back_songs(self):
        fresh = os.path.join(self.root, "fresh", "curator.toml")
        config.load(fresh)
        library_folder = os.path.join(self.root, "New", "Library")
        self.assertIsNone(folders.save(dict(library=library_folder, inbox=[], review="")))
        self.assertEqual(config.path("review_list"), os.path.join(self.root, "New", "_curation", "Review list.md"))


if __name__ == "__main__":
    unittest.main()
