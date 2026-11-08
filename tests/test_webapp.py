"""Tests for the browser app's file reader and server. Standard library only, synthetic files in a temp folder:

    python -m unittest discover -s tests
"""
import csv
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest

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
        self.assertIn(b"Curator", body)
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
