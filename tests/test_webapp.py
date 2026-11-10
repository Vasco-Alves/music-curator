"""Tests for the browser app's file reader and server. Standard library only, synthetic files in a temp folder:

    python -m unittest discover -s tests
"""
import csv
import http.client
import ipaddress
import json
import os
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import library, tagwriter, webapp  # noqa: E402

FRAME = b"\xff\xfb\x90\x00" + b"\x00" * 413  # MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417 bytes, 1152 samples
JPEG = b"\xff\xd8\xff\xe0not-really-a-jpeg"


def write_mp3(path, frames=200, **tags):
    e = dict(title="Song", artist="Artist", album="Album", genre="Acid", year="1995", discogs="https://www.discogs.com/release/1")
    e.update(tags)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(tagwriter.build_tag(e, JPEG) + FRAME * frames)
    return path


def v24_frame(fid, body):
    n = len(body)
    return fid + bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]) + b"\x00\x00" + body


class Reading(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def test_tags_length_and_cover(self):
        info = library.read_song(write_mp3(self.path("a.mp3"), title="Tïtle", artist="Ärtist & Co"))
        self.assertEqual((info["title"], info["artist"], info["album"], info["genre"], info["year"]), ("Tïtle", "Ärtist & Co", "Album", "Acid", "1995"))
        self.assertTrue(info["cover"])
        self.assertAlmostEqual(info["secs"], 200 * 1152 / 44100, delta=0.05)
        self.assertEqual(info["kbps"], 128)
        self.assertEqual(library.read_cover(self.path("a.mp3")), (JPEG, "image/jpeg"))

    def test_id3v24_utf8_and_date(self):
        frames = v24_frame(b"TIT2", b"\x03" + "Tïtle".encode()) + v24_frame(b"TPE1", b"\x03A\x00B") + v24_frame(b"TDRC", b"\x032001-05-01")
        n = len(frames)
        head = b"ID3\x04\x00\x00" + bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
        with open(self.path("b.mp3"), "wb") as f:
            f.write(head + frames + FRAME * 10)
        info = library.read_song(self.path("b.mp3"))
        self.assertEqual((info["title"], info["artist"], info["year"]), ("Tïtle", "A & B", "2001"))

    def test_untagged_file_is_named_from_the_filename(self):
        with open(self.path("Some One - A Song.mp3"), "wb") as f:
            f.write(FRAME * 5)
        info = library.read_song(self.path("Some One - A Song.mp3"))
        self.assertEqual((info["artist"], info["title"], info["cover"]), ("Some One", "A Song", False))

    def test_junk_tags_count_as_missing(self):
        info = library.read_song(write_mp3(self.path("Show Me.mp3"), title="(Unknown)", artist="<unknown>", year="0000"))
        self.assertEqual((info["title"], info["artist"], info["year"]), ("Show Me", "", ""))

    def test_the_size_of_a_cover(self):
        png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + (600).to_bytes(4, "big") + (500).to_bytes(4, "big") + b"\x08\x02\x00\x00\x00"
        jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 9 + b"\xff\xc0\x00\x11\x08" + (300).to_bytes(2, "big") + (400).to_bytes(2, "big") + b"\x03" + b"\x00" * 9
        gif = b"GIF89a" + (32).to_bytes(2, "little") + (16).to_bytes(2, "little")
        self.assertEqual([library.image_size(x) for x in (png, jpeg, gif)], [(600, 500), (400, 300), (32, 16)])
        for junk in (JPEG, b"", None, b"\x89PNG", b"\xff\xd8\xff\xc0\x00\x11\x08\x00\x00\x00\x00"):
            self.assertIsNone(library.image_size(junk), junk)

    def test_broken_file_is_still_listed(self):
        with open(self.path("broken.mp3"), "wb") as f:
            f.write(b"ID3\x03\x00\x00\x7f\x7f\x7f\x7f" + b"garbage")
        self.assertEqual(library.read_song(self.path("broken.mp3"))["title"], "broken")


class Helpers(unittest.TestCase):
    def test_parse_range(self):
        self.assertEqual(webapp.parse_range("bytes=0-99", 1000), (0, 99))
        self.assertEqual(webapp.parse_range("bytes=900-", 1000), (900, 999))
        self.assertEqual(webapp.parse_range("bytes=-100", 1000), (900, 999))
        self.assertEqual(webapp.parse_range("bytes=990-5000", 1000), (990, 999))
        self.assertEqual(webapp.parse_range("bytes=1000-", 1000), "bad")
        self.assertIsNone(webapp.parse_range(None, 1000))
        self.assertIsNone(webapp.parse_range("items=1-2", 1000))

    def test_genre_options(self):
        self.assertEqual(webapp.genre_options("Techno / Acid / Hardcore", "Techno"), ["Techno", "Acid", "Hardcore"])
        self.assertEqual(webapp.genre_options("Acid / Trance", "Goa"), ["Goa", "Acid", "Trance"])
        self.assertEqual(webapp.genre_options("the album lists Trance / Hip Hop / Progressive Trance, Hip Hop belongs to other tracks"), ["Trance", "Hip Hop", "Progressive Trance"])
        self.assertEqual(webapp.genre_options("just one"), [])

    def test_trust(self):
        self.assertEqual(webapp.trust_of(None), "unknown")
        self.assertEqual(webapp.trust_of(dict(notes="", discogs="https://www.discogs.com/release/1")), "verified")
        self.assertEqual(webapp.trust_of(dict(notes="", discogs="https://www.youtube.com/watch?v=x")), "source")
        self.assertEqual(webapp.trust_of(dict(notes="unverified: unofficial remix", discogs="https://www.discogs.com/release/1")), "unverified")


class Packs(unittest.TestCase):
    def test_the_example_is_a_pack(self):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "examples", "example.curator-pack.json")
        with open(path, encoding="utf-8") as f:
            pack = json.load(f)
        self.assertEqual((pack["curatorPack"], pack["name"]), (1, "Example pack"))
        self.assertTrue(set(pack) <= {"curatorPack", "name", "by", "about", "words", "genres", "settings"})

    def test_the_page_can_load_the_rules(self):
        self.assertEqual(webapp.STATIC["/packs.js"][0], "packs.js")
        self.assertTrue(os.path.exists(os.path.join(webapp.WEB, "packs.js")))


class HomeNetwork(unittest.TestCase):
    KEY = "abc123def0"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        p = lambda *a: os.path.join(self.tmp.name, *a)  # noqa: E731
        write_mp3(p("lib", "Acid", "Artist - Song.mp3"))
        os.makedirs(p("cache", "discogs"))
        self.collection = webapp.Collection(dict(library=p("lib"), review="", review_list="", inbox=[], log=p("log.csv"), cache=p("cache"), decisions=p("decisions.json")))
        self.collection.refresh()
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.lan_host = f"192.168.1.42:{self.port}"
        self.server.collection, self.server.hosts = self.collection, {f"127.0.0.1:{self.port}", self.lan_host}
        self.server.lan = dict(network=ipaddress.ip_network("192.168.1.0/24"), key=self.KEY)
        self.from_ip = "192.168.1.50"
        patcher = mock.patch.object(webapp.Handler, "_client_ip", lambda _: self.from_ip)
        patcher.start()
        self.addCleanup(patcher.stop)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, method, path, body=None, headers=None, cookie=True):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, path, body=body, headers={"Host": self.lan_host, **({"Cookie": f"{webapp.LAN_COOKIE}={self.KEY}"} if cookie else {}), **(headers or {})})
        r = c.getresponse()
        data = r.read()
        c.close()
        return r, data

    def post(self, route, body="{}", cookie=True):
        return self.ask("POST", route, body, {"Content-Type": "application/json"}, cookie)

    def song_id(self):
        return next(iter(self.collection.songs))

    def test_it_is_off_unless_asked_for(self):
        self.assertIsNone(webapp.Server.lan)

    def test_without_the_link_there_is_nothing(self):
        for path in ("/", "/app.js", "/api/all", f"/audio/{self.song_id()}", f"/cover/{self.song_id()}"):
            self.assertEqual(self.ask("GET", path, cookie=False)[0].status, 403, path)
        self.assertEqual(self.post("/api/played", json.dumps(dict(id=self.song_id())), cookie=False)[0].status, 403)

    def test_the_wrong_key_is_no_use(self):
        self.assertEqual(self.ask("GET", "/?key=nope", cookie=False)[0].status, 403)
        self.assertEqual(self.ask("GET", "/", headers={"Cookie": f"{webapp.LAN_COOKIE}=nope"}, cookie=False)[0].status, 403)

    def test_the_link_is_remembered_and_leaves_the_address_bar(self):
        r, _ = self.ask("GET", f"/?key={self.KEY}", cookie=False)
        self.assertEqual((r.status, r.getheader("Location")), (303, "/"))
        cookie = r.getheader("Set-Cookie")
        self.assertIn(f"{webapp.LAN_COOKIE}={self.KEY}", cookie)
        for part in ("HttpOnly", "SameSite=Strict"):
            self.assertIn(part, cookie)

    def test_with_it_everything_is_there(self):
        for path in ("/", "/api/all", f"/audio/{self.song_id()}"):
            self.assertIn(self.ask("GET", path)[0].status, (200, 206), path)
        self.assertEqual(self.post("/api/played", json.dumps(dict(id=self.song_id())))[0].status, 200)

    def test_another_network_is_refused_even_with_the_key(self):
        self.from_ip = "192.168.56.7"
        self.assertEqual(self.ask("GET", "/")[0].status, 403)
        self.assertEqual(self.ask("GET", f"/?key={self.KEY}", cookie=False)[0].status, 403)
        self.from_ip = "8.8.8.8"
        self.assertEqual(self.ask("GET", "/")[0].status, 403)

    def test_this_computer_needs_no_key(self):
        self.from_ip = "127.0.0.1"
        self.assertEqual(self.ask("GET", "/", cookie=False)[0].status, 200)

    def test_another_name_for_it_is_still_refused(self):
        self.assertEqual(self.ask("GET", "/", headers={"Host": "evil.example"})[0].status, 403)

    def test_a_form_on_another_site_gets_nowhere(self):
        r, _ = self.ask("POST", "/api/played", "{}", {"Content-Type": "application/json", "Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)

    def test_folders_and_copying_stay_on_the_computer(self):
        for route in sorted(webapp.PC_ONLY):
            r, data = self.post(route)
            self.assertEqual(r.status, 403, route)
            self.assertIn("computer", json.loads(data)["error"])

    def test_the_computer_itself_can_still_do_those(self):
        self.from_ip = "127.0.0.1"
        self.assertNotEqual(self.post("/api/settings/check", json.dumps(dict(path=self.tmp.name)), cookie=False)[0].status, 403)

    def test_it_only_opens_on_a_private_address(self):
        class Probe:
            def __init__(self, address):
                self.address = address
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def connect(self, _):
                pass
            def getsockname(self):
                return (self.address, 0)
        for address, wanted in (("192.168.1.42", "192.168.1.42"), ("10.0.0.3", "10.0.0.3"), ("8.8.8.8", ""), ("127.0.0.1", ""), ("169.254.1.1", "")):
            with mock.patch.object(webapp.socket, "socket", lambda *a: Probe(address)):
                self.assertEqual(webapp.lan_address(), wanted, address)

    def test_the_key_stays_the_same_between_runs(self):
        with mock.patch.object(webapp.config, "env_file", lambda: os.path.join(self.tmp.name, ".env")):
            first = webapp.lan_key()
            self.assertRegex(first, r"^[0-9a-f]{10}$")
            self.assertEqual(webapp.lan_key(), first)


class App(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = self.tmp.name
        p = lambda *a: os.path.join(root, *a)  # noqa: E731
        self.song = write_mp3(p("lib", "Acid", "Artist - Song.mp3"))
        write_mp3(p("review", "Unknown One - Mystery.mp3"), title="Mystery", artist="Unknown One")
        write_mp3(p("inbox", "New One - Fresh.mp3"), title="Fresh", artist="New One")
        with open(p("log.csv"), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=tagwriter.LOG_FIELDS)
            w.writeheader()
            w.writerow(dict(date="2026-01-02T10:00:00", status="ok", src=p("inbox", "old name.mp3"), dest=self.song, artist="Artist", title="Song",
                            genre="Acid", discogs="https://www.discogs.com/release/1", notes="only version on the record; genre toss-up: Acid / Techno"))
        with open(p("list.md"), "w", encoding="utf-8") as f:
            f.write("# Review\n\n- **Unknown One - Mystery**: not on Discogs\n")
        os.makedirs(p("cache", "discogs"))
        self.collection = webapp.Collection(dict(library=p("lib"), review=p("review"), review_list=p("list.md"), inbox=[p("inbox")], log=p("log.csv"),
                                                 cache=p("cache"), decisions=p("decisions.json")))
        self.snap = self.collection.snapshot()
        self.by_title = {s["title"]: s for s in self.snap["songs"]}

    def serve(self):
        server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        port = server.server_address[1]
        server.collection, server.hosts = self.collection, {f"127.0.0.1:{port}"}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return port

    def request(self, port, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        data = r.read()
        c.close()
        return r, data

    def test_joins_files_with_the_log_and_review_list(self):
        s = self.by_title["Song"]
        self.assertEqual((s["area"], s["trust"], s["was"]), ("library", "verified", "old name.mp3"))
        self.assertEqual(s["checks"], [dict(kind="genre", why="Discogs lists Acid, Techno. Which one fits?", options=["Acid", "Techno"])])
        self.assertEqual(self.by_title["Mystery"]["checks"], [dict(kind="waiting", why="not on Discogs")])
        self.assertEqual((self.by_title["Fresh"]["area"], self.by_title["Fresh"]["checks"]), ("inbox", []))
        self.assertNotIn("_path", s)
        self.assertNotIn(self.tmp.name, json.dumps(self.snap))  # full paths stay on the server

    def test_decisions_persist_and_undo(self):
        sid = self.by_title["Song"]["id"]
        self.assertIsNone(self.collection.decide(dict(id=sid, kind="genre", action="genre", genre="Techno")))
        again = webapp.Collection(self.collection.paths)
        self.assertEqual(again.decisions["genre:library/Acid/Artist - Song.mp3"]["genre"], "Techno")
        self.assertIsNone(self.collection.decide(dict(id=sid, kind="genre", action=None)))
        self.assertEqual(self.collection.decisions, {})
        self.assertEqual(self.collection.decide(dict(id=sid, kind="genre", action="delete-everything")), "bad action")
        self.assertEqual(self.collection.decide(dict(id="nope", kind="genre", action="keep")), "unknown song")

    def test_http_pages_audio_and_guards(self):
        port = self.serve()
        sid = self.by_title["Song"]["id"]
        r, body = self.request(port, "GET", "/")
        self.assertEqual(r.status, 200)
        self.assertIn(b"<title>Pressling</title>", body)
        self.assertIn("default-src 'none'", r.getheader("Content-Security-Policy"))
        r, body = self.request(port, "GET", f"/audio/{sid}", headers={"Range": "bytes=0-9"})
        self.assertEqual((r.status, r.getheader("Content-Range"), len(body)), (206, f"bytes 0-9/{os.path.getsize(self.song)}", 10))
        r, body = self.request(port, "GET", f"/cover/{sid}")
        self.assertEqual((r.status, body), (200, JPEG))
        self.assertEqual(self.request(port, "GET", "/audio/000000000000")[0].status, 404)
        self.assertEqual(self.request(port, "GET", "/api/all", headers={"Host": "evil.example"})[0].status, 403)
        good = json.dumps(dict(id=sid, kind="genre", action="keep"))
        json_header = {"Content-Type": "application/json"}
        self.assertEqual(self.request(port, "POST", "/api/decision", good, {**json_header, "Origin": "https://evil.example"})[0].status, 403)
        self.assertEqual(self.request(port, "POST", "/api/decision", good, {"Content-Type": "text/plain"})[0].status, 415)
        self.assertEqual(self.request(port, "POST", "/api/decision", good, json_header)[0].status, 200)
        self.assertEqual(len(self.collection.decisions), 1)


if __name__ == "__main__":
    unittest.main()
