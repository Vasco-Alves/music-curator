"""Tests for choosing folders: the settings-file editor, the checks, and the first-run flow over HTTP.

    python -m unittest discover -s tests
"""
import http.client
import json
import os
import sys
import tempfile
import threading
import tomllib
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import config, folders, webapp  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


class SettingsFile(unittest.TestCase):
    SAMPLE = '# my settings\n[paths]\nlibrary = "../My Music"      # keep this comment\ninbox   = ["../Downloads",\n           ".."]\nlog     = "log.csv"\n\n[rules]\nfilename = "{artist} - {title}"\n'

    def test_changes_only_the_given_values(self):
        out = config.edit_paths(self.SAMPLE, {"library": r"D:\Music\Mine"})
        self.assertIn(r"library = 'D:\Music\Mine'      # keep this comment", out)
        self.assertEqual(out.replace(r"'D:\Music\Mine'", '"../My Music"'), self.SAMPLE)

    def test_replaces_an_array_over_several_lines(self):
        out = config.edit_paths(self.SAMPLE, {"inbox": [r"D:\A", r"E:\B"]})
        self.assertEqual(tomllib.loads(out)["paths"]["inbox"], [r"D:\A", r"E:\B"])
        self.assertEqual(tomllib.loads(out)["rules"]["filename"], "{artist} - {title}")

    def test_adds_a_missing_key_inside_the_table(self):
        out = config.edit_paths(self.SAMPLE, {"review": r"D:\Review"})
        parsed = tomllib.loads(out)
        self.assertEqual(parsed["paths"]["review"], r"D:\Review")
        self.assertNotIn("review", parsed["rules"])

    def test_awkward_paths_read_back_exactly(self):
        for path in [r"D:\It's Mine", r'D:\Say "Hi"', r"D:\Ünï\音楽", "/home/me/o'neil's \"best\"", r"C:\a\b\\"]:
            with self.subTest(path=path):
                self.assertEqual(tomllib.loads(config.edit_paths(self.SAMPLE, {"library": path}))["paths"]["library"], path)

    def test_no_table_empty_file_and_windows_line_endings(self):
        self.assertEqual(tomllib.loads(config.edit_paths("[a]\nb = 1\n", {"library": "x"}))["paths"]["library"], "x")
        self.assertEqual(tomllib.loads(config.edit_paths("", {"library": "x"}))["paths"]["library"], "x")
        out = config.edit_paths("[paths]\r\nlibrary = 'a'", {"library": "b", "log": "c"})
        self.assertEqual(tomllib.loads(out)["paths"], {"library": "b", "log": "c"})
        self.assertNotIn("\n\n", out.replace("\r\n", "\n"))
        self.assertTrue(all(part.endswith("\r") for part in out.split("\n")[:-1]))

    def test_commented_key_is_not_mistaken_for_a_real_one(self):
        out = config.edit_paths("[paths]\n# review = 'old'\nlibrary = 'a'\n", {"review": "new"})
        self.assertIn("# review = 'old'", out)
        self.assertEqual(tomllib.loads(out)["paths"]["review"], "new")

    def test_refuses_to_write_what_would_not_read_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = os.path.join(tmp, "c.toml")
            with open(file, "w", encoding="utf-8") as f:
                f.write("[paths]\nlibrary = 'a'\n[paths]\n")  # already broken TOML
            with self.assertRaises(Exception):
                config.save_paths(file, {"library": "b"})
            with open(file, encoding="utf-8") as f:
                self.assertIn("library = 'a'", f.read())


class Folders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(config.load, None)
        self.root = self.tmp.name
        home = mock.patch.dict(os.environ, {"USERPROFILE": self.root, "HOME": self.root})  # default folders stay in the temp folder
        home.start()
        self.addCleanup(home.stop)
        self.config = os.path.join(self.root, "settings", "curator.toml")
        self.library = os.path.join(self.root, "Music", "Library")
        self.downloads = os.path.join(self.root, "Downloads")
        write_mp3(os.path.join(self.downloads, "A - B.mp3"))
        write_mp3(os.path.join(self.downloads, "sub", "ignored.mp3"))
        config.load(self.config)

    def test_library_rules(self):
        self.assertFalse(folders.check("library", "")["ok"])
        self.assertFalse(folders.check("library", "relative/path")["ok"])
        self.assertFalse(folders.check("library", os.path.abspath(os.sep))["ok"])
        self.assertFalse(folders.check("library", os.path.join(self.downloads, "A - B.mp3"))["ok"])
        new = folders.check("library", self.library)
        self.assertTrue(new["ok"] and new["create"])
        self.assertEqual(folders.check("library", f'  "{self.downloads}" ')["path"], self.downloads)

    def test_inbox_counts_only_its_own_folder(self):
        self.assertEqual(folders.check("inbox", self.downloads)["message"], "1 song waiting here.")
        self.assertIn("2 songs", folders.check("review", self.downloads)["message"])

    def test_inbox_rules(self):
        self.assertTrue(folders.check("inbox", "")["ok"])
        self.assertFalse(folders.check("inbox", os.path.join(self.root, "nope"))["ok"])
        self.assertFalse(folders.check("inbox", self.downloads, self.downloads)["ok"])
        self.assertFalse(folders.check("inbox", os.path.join(self.downloads, "sub"), self.downloads)["ok"])
        # the folder that holds the library is fine: inbox folders aren't searched inside
        self.assertTrue(folders.check("inbox", self.root, os.path.join(self.root, "Lib"))["ok"])
        # a name that only starts the same isn't inside
        self.assertFalse(folders._inside(os.path.join(self.root, "Library2"), os.path.join(self.root, "Library")))

    def test_first_run_then_change_keeps_the_rest(self):
        self.assertEqual(folders.reason(), "first")
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[self.downloads, self.downloads], review="")))
        self.assertEqual(folders.reason(), "")
        self.assertTrue(os.path.isdir(self.library))
        app = os.path.join(self.root, "Music", "_curation")
        self.assertEqual(config.path("log"), os.path.join(app, "log.csv"))
        self.assertTrue(os.path.isdir(os.path.join(app, "cache")) and os.path.isdir(os.path.join(app, "work")))
        self.assertEqual(config.path("inbox"), [self.downloads])  # the repeat is dropped
        other = os.path.join(self.root, "Other")
        self.assertIsNone(folders.save(dict(library=other, inbox=[self.downloads], review="")))
        self.assertEqual((config.path("library"), config.path("log")), (other, os.path.join(app, "log.csv")))  # the log stays put

    def test_save_leaves_relative_lines_alone_when_unchanged(self):
        os.makedirs(os.path.dirname(self.config))
        os.makedirs(os.path.join(self.root, "Lib"))
        with open(self.config, "w", encoding="utf-8") as f:
            f.write('[paths]\nlibrary = "../Lib"\ninbox = ["../Downloads"]\nlog = "log.csv"\n')
        config.load(self.config)
        self.assertIsNone(folders.save(dict(library=os.path.join(self.root, "Lib"), inbox=[self.downloads], review="")))
        with open(self.config, encoding="utf-8") as f:
            self.assertEqual(f.read(), '[paths]\nlibrary = "../Lib"\ninbox = ["../Downloads"]\nlog = "log.csv"\n')

    def test_rejected_save_changes_nothing(self):
        self.assertEqual(folders.save(dict(library=self.library, inbox=[os.path.join(self.root, "nope")]))[0], "inbox")
        self.assertFalse(os.path.exists(self.config) or os.path.exists(self.library))

    def test_missing_library_asks_again(self):
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        os.rmdir(self.library)
        self.assertEqual(folders.reason(), "missing")

    def test_picker_paths(self):
        original = folders.PICKER
        self.addCleanup(setattr, folders, "PICKER", original)
        folders.PICKER = "import sys; sys.stdout.write('C:/Some/Folder' if sys.argv[1] else '')"
        self.assertEqual(folders.pick_folder("library")["path"], os.path.normpath("C:/Some/Folder"))
        folders.PICKER = "pass"
        self.assertEqual(folders.pick_folder("library"), dict(cancelled=True))
        folders.PICKER = "raise SystemExit(3)"
        self.assertIn("error", folders.pick_folder("library"))

    def request(self, port, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers={"Content-Type": "application/json", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if "json" in (r.getheader("Content-Type") or "") else {}

    def test_http_first_run(self):
        server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        port = server.server_address[1]
        server.collection, server.hosts, server.settings_lock = None, {f"127.0.0.1:{port}"}, threading.Lock()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        status, data = self.request(port, "GET", "/api/all")
        self.assertEqual((status, data["setup"]["reason"]), (200, "first"))
        self.assertEqual(self.request(port, "POST", "/api/decision", dict(id="x", kind="genre", action="keep"))[0], 400)
        self.assertEqual(self.request(port, "POST", "/api/settings/check", dict(kind="nonsense", path="x"))[0], 400)
        self.assertEqual(self.request(port, "POST", "/api/settings", dict(library=self.library), {"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request(port, "POST", "/api/settings", dict(library="relative"))[1]["field"], "library")
        self.assertEqual(self.request(port, "POST", "/api/settings", dict(library=self.library, inbox=[self.downloads]))[0], 200)
        status, data = self.request(port, "GET", "/api/all")
        self.assertEqual((status, [s["file"] for s in data["songs"]]), (200, ["A - B.mp3"]))


if __name__ == "__main__":
    unittest.main()
