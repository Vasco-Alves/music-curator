"""One test per problem the independent review of the folder setup confirmed, so none of them can come back.

    python -m unittest discover -s tests
"""
import csv
import http.client
import json
import os
import socket
import sys
import tempfile
import threading
import tomllib
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import cli, config, folders, library, tagwriter, webapp  # noqa: E402
from test_webapp import FRAME, write_mp3  # noqa: E402


class Base(unittest.TestCase):
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
        os.makedirs(self.downloads)
        config.load(self.config)

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def serve(self, collection=None):
        server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        port = server.server_address[1]
        server.collection, server.hosts = collection, {f"127.0.0.1:{port}"}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server, port

    def get(self, port, route):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
        c.request("GET", route)
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r, raw


class HiddenRequests(Base):
    def smuggle(self, outer_headers):
        """A refused POST whose body is itself a complete, valid request."""
        server, port = self.serve()
        inner = json.dumps(dict(library=self.library, inbox=[], review=""))
        body = (f"POST /api/settings HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\n"
                f"Content-Length: {len(inner)}\r\n\r\n{inner}")
        head = f"POST {outer_headers['path']} HTTP/1.1\r\nHost: {outer_headers.get('host', f'127.0.0.1:{port}')}\r\n"
        head += "".join(f"{k}: {v}\r\n" for k, v in outer_headers.items() if k not in ("path", "host"))
        head += f"Content-Length: {len(body)}\r\n\r\n"
        with socket.create_connection(("127.0.0.1", port), timeout=10) as s:
            s.sendall((head + body).encode())
            received = b""
            while chunk := s.recv(65536):
                received += chunk
        return received

    def assert_refused(self, received, first_status):
        self.assertTrue(received.startswith(f"HTTP/1.1 {first_status}".encode()), received[:80])
        self.assertEqual(received.count(b"HTTP/1.1 "), 1, "a second request ran from the unread body")
        self.assertFalse(os.path.exists(self.config) or os.path.exists(self.library))

    def test_wrong_origin(self):
        self.assert_refused(self.smuggle(dict(path="/api/settings", Origin="https://evil.example", **{"Content-Type": "text/plain"})), 403)

    def test_wrong_content_type(self):
        self.assert_refused(self.smuggle({"path": "/api/settings", "Content-Type": "text/plain"}), 415)

    def test_unknown_route(self):
        self.assert_refused(self.smuggle({"path": "/nowhere", "Content-Type": "text/plain"}), 404)

    def test_wrong_host(self):
        self.assert_refused(self.smuggle({"path": "/api/settings", "host": "evil.example", "Content-Type": "text/plain"}), 403)


class Covers(Base):
    def test_a_tag_cannot_choose_the_content_type(self):
        for claimed in (b"text/html", b"image/svg+xml", b"text/html\r\nx-injected: yes"):
            with self.subTest(claimed=claimed):
                body = b"\x00" + claimed + b"\x00\x03\x00" + b"<script>alert(1)</script>"
                self.assertEqual(library._picture("APIC", body)[1], "image/jpeg")
        self.assertEqual(library._picture("APIC", b"\x00image/webp\x00\x03\x00RIFFxxxx")[1], "image/webp")


class BadEntries(Base):
    def collection(self, **extra):
        paths = dict(library=self.library, review="", review_list="", inbox=[self.downloads], log="", cache=self.path("cache"), decisions=self.path("d.json"))
        paths.update(extra)
        return webapp.Collection(paths)

    def test_a_huge_number_in_a_link_does_not_hide_the_library(self):
        write_mp3(os.path.join(self.library, "Acid", "Bad.mp3"), discogs="http://discogs.com/release/" + "9" * 5000)
        write_mp3(os.path.join(self.library, "Acid", "Good.mp3"))
        c = self.collection()
        c.refresh()
        self.assertEqual(sorted(s["file"] for s in c.songs.values()), ["Bad.mp3", "Good.mp3"])

    def test_one_failing_file_is_skipped(self):
        write_mp3(os.path.join(self.library, "Acid", "Good.mp3"))
        write_mp3(os.path.join(self.library, "Acid", "Bad.mp3"))
        real = library.read_song
        with mock.patch.object(library, "read_song", lambda p: (_ for _ in ()).throw(ValueError("bad")) if "Bad" in p else real(p)):
            c = self.collection()
            c.refresh()
        self.assertEqual([s["file"] for s in c.songs.values()], ["Good.mp3"])

    def test_a_folder_that_cannot_be_listed_is_skipped(self):
        write_mp3(os.path.join(self.library, "Acid", "Good.mp3"))
        write_mp3(os.path.join(self.downloads, "New.mp3"))
        real = os.scandir
        with mock.patch("os.scandir", lambda p: (_ for _ in ()).throw(PermissionError("no")) if os.path.normpath(str(p)) == self.downloads else real(p)):
            c = self.collection()
            c.refresh()
        self.assertEqual([s["file"] for s in c.songs.values()], ["Good.mp3"])

    def test_check_refuses_a_folder_it_cannot_read(self):
        with mock.patch.object(folders, "_readable", return_value=False):
            result = folders.check("inbox", self.downloads)
        self.assertFalse(result["ok"])

    def test_a_name_with_broken_encoding_still_gets_an_id(self):
        write_mp3(os.path.join(self.library, "Acid", "Good.mp3"))
        c = self.collection()
        c._read_log()
        c.labels = ({}, {})
        info = dict(artist="", title="x", album="", year="", genre="", secs=1, kbps=128, cover=False, comment="")
        song = c._song("library", self.library, os.path.join(self.library, "Caf\udce9.mp3"), info, mock.Mock(st_size=1, st_mtime_ns=1))
        self.assertEqual(len(song["id"]), 12)


class FolderNames(Base):
    def real(self, name):
        p = self.path(name)
        os.makedirs(p)
        return p

    def test_real_names_are_left_alone(self):
        for name in ("Rockin'", "A$$B", "A%%B", "%OS%", "$USERNAME", "'90s", "Say 'Hi'"):
            with self.subTest(name=name):
                p = self.real(name)
                self.assertEqual(folders.clean(p), p)
                self.assertEqual(folders.check("inbox", p)["path"], p)
                self.assertTrue(folders.check("inbox", p)["ok"])

    def test_pasted_quotes_come_off_as_a_pair(self):
        self.assertEqual(folders.clean(f'"{self.downloads}"'), self.downloads)
        self.assertEqual(folders.clean(f"'{self.downloads}'"), self.downloads)

    def test_variables_are_not_expanded_from_what_is_typed(self):
        with mock.patch.dict(os.environ, {"SECRET_THING": "hunter2"}):
            self.assertNotIn("hunter2", folders.clean(r"C:\%SECRET_THING%\x"))
            self.assertNotIn("hunter2", folders.clean("/tmp/$SECRET_THING/x"))

    def test_a_stored_literal_reads_back_unchanged(self):
        lib = self.real("A$$B")
        self.assertIsNone(folders.save(dict(library=lib, inbox=[], review="")))
        config.load(self.config)
        self.assertEqual(config.path("library"), lib)
        self.assertEqual(folders.reason(), "")

    @unittest.skipUnless(os.name == "nt", "Windows paths")
    def test_a_path_with_no_drive_is_refused(self):
        self.assertFalse(folders.check("library", "/Music")["ok"])
        self.assertFalse(folders.check("library", "/c/Users/me/Music")["ok"])
        self.assertTrue(folders.check("library", r"\\server\share\Music")["ok"])

    def test_a_slow_folder_is_not_called_empty(self):
        with mock.patch.object(folders, "_count_audio", return_value=(0, True)):
            self.assertIn("slow", folders.check("library", self.downloads)["message"])
            self.assertIn("slow", folders.check("review", self.downloads)["message"])


class SavingFolders(Base):
    def test_blank_downloads_on_first_run_stays_blank(self):
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        config.load(self.config)
        self.assertEqual(config.path("inbox"), [])

    def test_only_a_real_first_run_moves_the_app_files(self):
        os.makedirs(os.path.dirname(self.config))
        os.makedirs(self.library)
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(f"[paths]\nlibrary = '{self.library}'\ncache = 'MyCache'\nwork = 'MyWork'\n")
        config.load(self.config)
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[self.downloads], review="")))
        self.assertEqual(config.path("cache"), os.path.join(os.path.dirname(self.config), "MyCache"))
        self.assertEqual(config.path("log"), "")

    def test_the_folder_that_went_missing_is_never_recreated(self):
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        os.rmdir(self.library)
        self.assertFalse(folders.check("library", self.library)["ok"])
        self.assertEqual(folders.save(dict(library=self.library, inbox=[self.downloads], review=""))[0], "library")
        self.assertFalse(os.path.exists(self.library))

    def test_a_trailing_slash_is_not_a_change(self):
        os.makedirs(os.path.dirname(self.config))
        os.makedirs(self.library)
        text = f'[paths]\nlibrary = \'{self.library}\'\ninbox = [\n  \'{self.downloads}{os.sep}\',  # browser downloads\n]\nlog = "log.csv"\n'
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(text)
        config.load(self.config)
        other = self.path("Other")
        self.assertIsNone(folders.save(dict(library=other, inbox=[self.downloads], review="")))
        with open(self.config, encoding="utf-8") as f:
            self.assertIn("# browser downloads", f.read())

    def test_a_save_survives_when_the_old_app_folder_is_gone(self):
        os.makedirs(os.path.dirname(self.config))
        gone = self.path("gone", "_curation")
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(f"[paths]\nlibrary = '{self.path('gone', 'Library')}'\nlog = '{gone}{os.sep}log.csv'\ncache = '{gone}{os.sep}cache'\nwork = '{gone}{os.sep}work'\n")
        config.load(self.config)
        self.assertEqual(folders.reason(), "missing")
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        self.assertEqual(config.path("log"), self.path("Music", "_curation", "log.csv"))

    def test_serve_setup_does_not_touch_folders_on_a_missing_drive(self):
        args = mock.Mock(config=self.config, cmd="serve")
        with mock.patch("os.makedirs") as made:
            cli._setup(args)
        made.assert_not_called()


class SettingsFileEdge(unittest.TestCase):
    def roundtrip(self, text, updates):
        before = tomllib.loads(text)
        before.setdefault("paths", {}).update(updates)
        self.assertEqual(tomllib.loads(config.edit_paths(text, updates)), before)

    def test_multi_line_strings_ending_in_quotes(self):
        for entry in ["'''D:\\Rockin''''", "'''D:\\Rockin'''''", '"""a\\"""b"""', '"""ends with quote""""']:
            with self.subTest(entry=entry):
                self.roundtrip(f"[paths]\ninbox = [{entry}]\nlog = 'x'\n\n[rules]\nfolder = '{{genre}}/{{year}}'\n", {"inbox": ["D:\\New"]})

    def test_unusual_but_valid_spellings(self):
        for text in ('[ paths ]\nlibrary = "a"\n', '["paths"]\nlibrary = "a"\n', "[paths]\n\"library\" = 'a'\n", "[paths]\n'library' = 'a'\n"):
            with self.subTest(text=text):
                self.roundtrip(text, {"library": "b"})

    def test_a_layout_it_cannot_edit_is_refused_in_plain_words_and_left_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = os.path.join(tmp, "c.toml")
            original = "paths.library = 'a'\nother = 1\n"
            with open(file, "w", encoding="utf-8") as f:
                f.write(original)
            with self.assertRaisesRegex(ValueError, "change it by hand"):
                config.save_paths(file, {"library": "b"})
            with open(file, encoding="utf-8") as f:
                self.assertEqual(f.read(), original)

    def test_anything_lost_elsewhere_in_the_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = os.path.join(tmp, "c.toml")
            original = "[paths]\nlibrary = 'a'\n\n[rules]\nfolder = 'x'\n"
            with open(file, "w", encoding="utf-8") as f:
                f.write(original)
            with mock.patch.object(config, "edit_paths", return_value="[paths]\nlibrary = 'b'\n"):
                with self.assertRaises(ValueError):
                    config.save_paths(file, {"library": "b"})
            with open(file, encoding="utf-8") as f:
                self.assertEqual(f.read(), original)


class MovedLibrary(Base):
    def test_songs_keep_their_history_after_a_move(self):
        old, new = self.path("Old", "Library"), self.path("New", "Library")
        write_mp3(os.path.join(new, "Acid", "A - B.mp3"), artist="A", title="B")
        log = self.path("log.csv")
        with open(log, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=tagwriter.LOG_FIELDS)
            w.writeheader()
            w.writerow(dict(date="2026-01-02T10:00:00", status="ok", src="x.mp3", dest=os.path.join(old, "Acid", "A - B.mp3"), artist="A", title="B",
                            genre="Acid", discogs="https://www.discogs.com/release/1", notes="genre toss-up: Acid / Techno"))
        c = webapp.Collection(dict(library=new, review="", review_list="", inbox=[], log=log, cache=self.path("cache"), decisions=self.path("d.json")))
        snap = c.snapshot()
        song = snap["songs"][0]
        self.assertEqual(song["trust"], "verified")
        self.assertEqual(song["checks"][0]["kind"], "genre")
        self.assertEqual(snap["progress"]["timeline"][-1]["total"], 1)


class StateOnEveryLoad(Base):
    def test_a_library_that_comes_back_is_opened_and_one_that_goes_is_noticed(self):
        self.assertIsNone(folders.save(dict(library=self.library, inbox=[], review="")))
        write_mp3(os.path.join(self.library, "Acid", "A - B.mp3"))
        moved = self.library + "-away"
        os.rename(self.library, moved)
        server, port = self.serve(None)
        r, raw = self.get(port, "/api/all")
        self.assertEqual(json.loads(raw)["setup"]["reason"], "missing")
        os.rename(moved, self.library)
        r, raw = self.get(port, "/api/all")
        self.assertEqual([s["file"] for s in json.loads(raw)["songs"]], ["A - B.mp3"])
        os.rename(self.library, moved)
        r, raw = self.get(port, "/api/all")
        self.assertEqual(json.loads(raw)["setup"]["reason"], "missing")
        os.rename(moved, self.library)


class MalformedRequests(Base):
    def post(self, port, body, headers=None):
        with socket.create_connection(("127.0.0.1", port), timeout=10) as s:
            head = {"Content-Type": "application/json", "Content-Length": str(len(body)), **(headers or {})}
            s.sendall((f"POST /api/settings/check HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n" + "".join(f"{k}: {v}\r\n" for k, v in head.items()) + "\r\n").encode() + body)
            received = b""
            s.settimeout(5)
            try:
                while chunk := s.recv(65536):
                    received += chunk
                    if b"\r\n\r\n" in received:
                        break
            except TimeoutError:
                pass
        return received.split(b"\r\n", 1)[0]

    def test_every_one_gets_an_answer(self):
        _, port = self.serve()
        self.assertIn(b"400", self.post(port, b'{"kind": [], "path": "x"}'))
        self.assertIn(b"400", self.post(port, b"[" * 60000))
        self.assertIn(b"400", self.post(port, b"{}", {"Content-Length": "abc"}))
        self.assertIn(b"400", self.post(port, b"{}", {"Origin": "http://[bad"}))
        self.assertIn(b"200", self.post(port, b'{"kind": "library", "path": "\\ud800"}'))
        self.assertIsNone(webapp.parse_range("bytes=" + "9" * 5000 + "-", 100))


if __name__ == "__main__":
    unittest.main()
