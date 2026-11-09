"""FLAC and M4A: reading their tags and covers, writing them into the library, changing their genre. Nothing here reaches the network."""
import os
import random
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import curate, discogs, library, tagwriter  # noqa: E402
from test_apply import Base  # noqa: E402
from test_curate import LENGTH, WithDiscogs  # noqa: E402
from test_webapp import JPEG, write_mp3  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\nnot-really-a-png"
LINK = "https://www.discogs.com/release/1"


# ---------------- files made by hand, so every byte is known ----------------

def flac_block(kind, body, last=False):
    return bytes([kind | (0x80 if last else 0)]) + len(body).to_bytes(3, "big") + body


def streaminfo(secs, rate=44100):
    packed = rate << 44 | 1 << 41 | 15 << 36 | int(secs * rate)
    return bytes(10) + packed.to_bytes(8, "big") + bytes(16)


def vorbis(pairs):
    body = (4).to_bytes(4, "little") + b"test" + len(pairs).to_bytes(4, "little")
    for field, value in pairs:
        text = f"{field}={value}".encode()
        body += len(text).to_bytes(4, "little") + text
    return body


def picture(image, kind=3, mime=b"image/jpeg"):
    return kind.to_bytes(4, "big") + len(mime).to_bytes(4, "big") + mime + bytes(4) + bytes(16) + len(image).to_bytes(4, "big") + image


def flac_bytes(pairs=(("TITLE", "Song"), ("ARTIST", "A")), pictures=(), secs=10, audio=125000, before=b""):
    blocks = [(0, streaminfo(secs)), (4, vorbis(list(pairs))), *((6, p) for p in pictures), (1, bytes(50))]
    return before + b"fLaC" + b"".join(flac_block(k, b, i == len(blocks) - 1) for i, (k, b) in enumerate(blocks)) + bytes(audio)


def box(name, *parts):
    body = b"".join(parts)
    return (8 + len(body)).to_bytes(4, "big") + name + body


def item(name, value, kind=1):
    return box(name, box(b"data", kind.to_bytes(4, "big"), bytes(4), value))


def text(name, value):
    return item(name, value.encode())


def mvhd(secs=10, scale=1000, version=0):
    if version:
        return box(b"mvhd", b"\x01\x00\x00\x00", bytes(16), scale.to_bytes(4, "big"), (secs * scale).to_bytes(8, "big"), bytes(80))
    return box(b"mvhd", bytes(4), bytes(8), scale.to_bytes(4, "big"), (secs * scale).to_bytes(4, "big"), bytes(80))


TAGS = (text(b"\xa9nam", "Song"), text(b"\xa9ART", "A"))


def m4a_bytes(items=TAGS, header=None, audio=125000, moov_first=True, quicktime=False):
    meta = box(b"meta", *([] if quicktime else [bytes(4)]), box(b"hdlr", bytes(24)), box(b"ilst", *items))
    moov = box(b"moov", header or mvhd(), box(b"udta", meta))
    first = box(b"ftyp", b"M4A ", bytes(4))
    mdat = box(b"mdat", bytes(audio))
    return first + moov + mdat if moov_first else first + mdat + moov


class Hand(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.folder, ignore_errors=True)

    def file(self, name, data):
        path = os.path.join(self.folder, name)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def read(self, name, data):
        return library.read_song(self.file(name, data))


class ReadingFlac(Hand):
    def song(self, *pairs, **kw):
        return self.read("x.flac", flac_bytes(pairs, **kw))

    def test_its_tags(self):
        got = self.song(("TITLE", "Tïtle"), ("ARTIST", "Ärtist"), ("ALBUM", "Record"), ("DATE", "1996"), ("GENRE", "Acid"), ("COMMENT", LINK))
        self.assertEqual({k: got[k] for k in ("title", "artist", "album", "year", "genre", "comment")}, dict(title="Tïtle", artist="Ärtist", album="Record", year="1996", genre="Acid", comment=LINK))

    def test_field_names_can_be_any_case(self):
        self.assertEqual(self.song(("title", "Song"), ("Artist", "A"))["artist"], "A")

    def test_its_length_comes_from_the_file(self):
        self.assertEqual(self.song(secs=10)["secs"], 10)

    def test_its_bitrate_counts_only_the_audio(self):
        self.assertEqual(self.song(secs=10, audio=125000, pictures=[picture(b"x" * 500000)])["kbps"], 100)

    def test_several_artists_are_joined(self):
        self.assertEqual(self.song(("ARTIST", "A"), ("ARTIST", "B"))["artist"], "A & B")

    def test_a_full_date_gives_the_year(self):
        self.assertEqual(self.song(("DATE", "1996-05-01"))["year"], "1996")

    def test_the_release_date_comes_before_the_original_one(self):
        self.assertEqual(self.song(("ORIGINALDATE", "1990"), ("DATE", "1996"))["year"], "1996")

    def test_a_description_counts_as_a_comment(self):
        self.assertEqual(self.song(("DESCRIPTION", LINK))["comment"], LINK)

    def test_fields_it_doesnt_know_are_ignored(self):
        self.assertEqual(self.song(("TITLE", "Song"), ("REPLAYGAIN", "1"))["title"], "Song")

    def test_no_tags_goes_by_the_file_name(self):
        got = self.read("Some One - A Song.flac", flac_bytes(()))
        self.assertEqual((got["artist"], got["title"]), ("Some One", "A Song"))

    def test_a_tag_in_front_of_the_flac_is_stepped_over(self):
        tag = b"ID3\x03\x00\x00" + bytes([0, 0, 0, 20]) + bytes(20)
        self.assertEqual(self.read("x.flac", flac_bytes(before=tag))["title"], "Song")

    def test_a_file_that_isnt_flac_is_still_listed(self):
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            self.assertEqual(self.read("Name.flac", b"not a flac at all")["title"], "Name")

    def test_a_file_cut_off_inside_a_tag_in_front_is_still_listed(self):
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            self.assertEqual(self.read("Name.flac", b"ID3\x03")["title"], "Name")

    def test_a_file_that_cant_be_opened_is_still_listed(self):
        path = self.file("Name.flac", flac_bytes())
        with mock.patch.object(library, "_ffprobe_secs", return_value=None), mock.patch("builtins.open", side_effect=PermissionError("in use")):
            self.assertEqual(library.read_song(path)["title"], "Name")
            self.assertIsNone(library.read_cover(path))

    def test_a_picture_is_noticed(self):
        self.assertTrue(self.song(pictures=[picture(JPEG)])["cover"])
        self.assertFalse(self.song()["cover"])

    def cover(self, *pictures):
        return library.read_cover(self.file("x.flac", flac_bytes(pictures=pictures)))

    def test_its_cover_comes_out(self):
        self.assertEqual(self.cover(picture(JPEG)), (JPEG, "image/jpeg"))

    def test_the_front_cover_wins(self):
        self.assertEqual(self.cover(picture(PNG, kind=4, mime=b"image/png"), picture(JPEG, kind=3))[0], JPEG)

    def test_any_picture_will_do_if_none_is_the_front(self):
        self.assertEqual(self.cover(picture(PNG, kind=4, mime=b"image/png"))[0], PNG)

    def test_a_picture_is_taken_for_what_it_is(self):
        self.assertEqual(self.cover(picture(PNG, mime=b"image/jpeg"))[1], "image/png")

    def test_no_picture_is_no_cover(self):
        self.assertIsNone(self.cover())

    def test_a_cut_off_file_never_stops_the_library(self):
        whole = flac_bytes((("TITLE", "Song"), ("ARTIST", "A")), pictures=[picture(JPEG)], audio=10)
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            for cut in range(len(whole)):
                self.read("x.flac", whole[:cut])
                library.read_cover(self.file("x.flac", whole[:cut]))

    def test_nonsense_never_stops_the_library(self):
        rnd = random.Random(1)
        whole = bytearray(flac_bytes((("TITLE", "Song"),), pictures=[picture(JPEG)], audio=10))
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            for _ in range(400):
                spoilt = bytearray(whole)
                for _ in range(8):
                    spoilt[rnd.randrange(4, len(spoilt))] = rnd.randrange(256)
                self.read("x.flac", bytes(spoilt))
                library.read_cover(self.file("x.flac", bytes(spoilt)))


class ReadingM4A(Hand):
    def song(self, *items, **kw):
        return self.read("x.m4a", m4a_bytes(items or TAGS, **kw))

    def test_its_tags(self):
        got = self.song(text(b"\xa9nam", "Tïtle"), text(b"\xa9ART", "Ärtist"), text(b"\xa9alb", "Record"), text(b"\xa9day", "1996-05-01"), text(b"\xa9gen", "Acid"), text(b"\xa9cmt", LINK))
        self.assertEqual({k: got[k] for k in ("title", "artist", "album", "year", "genre", "comment")}, dict(title="Tïtle", artist="Ärtist", album="Record", year="1996", genre="Acid", comment=LINK))

    def test_its_length_comes_from_the_file(self):
        self.assertEqual(self.song()["secs"], 10)

    def test_a_long_form_header_too(self):
        self.assertEqual(self.song(header=mvhd(secs=20, version=1))["secs"], 20)

    def test_its_bitrate_counts_only_the_audio(self):
        self.assertEqual(self.song(item(b"covr", b"x" * 500000, 13), audio=125000)["kbps"], 100)

    def test_the_tags_can_come_after_the_audio(self):
        self.assertEqual(self.song(moov_first=False)["title"], "Song")

    def test_quicktimes_way_of_writing_them_too(self):
        self.assertEqual(self.song(quicktime=True)["title"], "Song")

    def test_a_box_with_a_64_bit_size(self):
        big = (1).to_bytes(4, "big") + b"free" + (24).to_bytes(8, "big") + bytes(8)
        self.assertEqual(self.read("x.m4a", big + m4a_bytes())["title"], "Song")

    def test_a_numbered_genre_says_nothing(self):
        self.assertEqual(self.song(*TAGS, item(b"gnre", b"\x00\x12", 0))["genre"], "")

    def test_no_tags_goes_by_the_file_name(self):
        got = self.read("Some One - A Song.m4a", m4a_bytes(()))
        self.assertEqual((got["artist"], got["title"]), ("Some One", "A Song"))

    def test_a_file_that_isnt_m4a_is_still_listed(self):
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            self.assertEqual(self.read("Name.m4a", b"not an m4a at all")["title"], "Name")

    def test_a_file_that_cant_be_opened_is_still_listed(self):
        path = self.file("Name.m4a", m4a_bytes())
        with mock.patch.object(library, "_ffprobe_secs", return_value=None), mock.patch("builtins.open", side_effect=PermissionError("in use")):
            self.assertEqual(library.read_song(path)["title"], "Name")
            self.assertIsNone(library.read_cover(path))

    def cover(self, *items):
        return library.read_cover(self.file("x.m4a", m4a_bytes((*TAGS, *items))))

    def test_a_cover_is_noticed(self):
        self.assertTrue(self.song(item(b"covr", JPEG, 13))["cover"])
        self.assertFalse(self.song()["cover"])

    def test_its_cover_comes_out(self):
        self.assertEqual(self.cover(item(b"covr", JPEG, 13)), (JPEG, "image/jpeg"))

    def test_a_png_cover(self):
        self.assertEqual(self.cover(item(b"covr", PNG, 14)), (PNG, "image/png"))

    def test_no_picture_is_no_cover(self):
        self.assertIsNone(self.cover())

    def test_a_cut_off_file_never_stops_the_library(self):
        whole = m4a_bytes((*TAGS, item(b"covr", JPEG, 13)), audio=10)
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            for cut in range(len(whole)):
                self.read("x.m4a", whole[:cut])
                library.read_cover(self.file("x.m4a", whole[:cut]))

    def test_nonsense_never_stops_the_library(self):
        rnd = random.Random(2)
        whole = bytearray(m4a_bytes((*TAGS, item(b"covr", JPEG, 13)), audio=10))
        with mock.patch.object(library, "_ffprobe_secs", return_value=None):
            for _ in range(400):
                spoilt = bytearray(whole)
                for _ in range(8):
                    spoilt[rnd.randrange(len(spoilt))] = rnd.randrange(256)
                self.read("x.m4a", bytes(spoilt))
                library.read_cover(self.file("x.m4a", bytes(spoilt)))


# ---------------- real files, through the real ffmpeg ----------------

CODECS = {".flac": "flac", ".m4a": "aac"}
SONG = "A - Song"


def real_song(path, secs=5.2, **tags):
    tagged = [part for name, value in tags.items() for part in ("-metadata", f"{name}={value}")]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", f"anoisesrc=d={secs}:c=pink:r=44100:seed=5", "-ac", "2", "-c:a", CODECS[os.path.splitext(path)[1]], *tagged, path], check=True)
    return path


def real_jpeg(path):
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", path], check=True)
    return path


def read(path):
    with open(path, "rb") as f:
        return f.read()


class EachKind:
    """The same checks for each kind of file."""
    ending = None

    def setUp(self):
        super().setUp()
        self.cover = real_jpeg(os.path.join(self.root, "cover.jpg"))
        self.source = real_song(os.path.join(self.inbox, SONG + self.ending), title="junk title", artist="junk artist", encoded_by="junk")
        self.writer = tagwriter.Writer(self.lib, self.log)
        self.addCleanup(self.writer.close)
        self.written = os.path.join(self.lib, "Acid", SONG + self.ending)

    def write(self, **extra):
        return self.writer.write(dict(key="1", src=self.source, artist="A", title="Song", album="The Record", year="1996", genre="Acid", discogs=LINK, cover=self.cover, notes="", **extra))

    def test_it_goes_in_as_the_type_of_file_it_is(self):
        self.assertEqual(self.write()["status"], "ok")
        self.assertTrue(os.path.exists(self.written))

    def test_the_tags_and_cover_are_the_new_ones(self):
        self.write()
        got = library.read_song(self.written)
        self.assertEqual({k: got[k] for k in ("artist", "title", "album", "year", "genre", "comment", "cover")}, dict(artist="A", title="Song", album="The Record", year="1996", genre="Acid", comment=LINK, cover=True))
        self.assertEqual(library.read_cover(self.written)[0], read(self.cover))

    def test_nothing_is_left_of_the_old_tags(self):
        self.write()
        self.assertNotIn("encoded_by", tagwriter.probe(self.written)["tags"])

    def test_the_audio_is_exactly_the_same(self):
        self.write()
        self.assertEqual(tagwriter.audio_packets(self.written), tagwriter.audio_packets(self.source))

    def test_the_original_is_untouched(self):
        before = read(self.source)
        self.write()
        self.assertEqual(read(self.source), before)

    def test_with_no_cover_it_goes_in_without_one(self):
        self.assertEqual(self.writer.write(dict(key="1", src=self.source, artist="A", title="Song", album="", year="", genre="Acid", discogs="", cover="", notes=""))["status"], "ok")
        got = library.read_song(self.written)
        self.assertEqual((got["cover"], got["album"], got["year"], got["comment"]), (False, "", "", ""))

    def test_a_cover_ffmpeg_cant_use_doesnt_cost_the_song(self):
        with open(self.cover, "wb") as f:
            f.write(JPEG)
        row = self.write()
        self.assertTrue(os.path.exists(self.written))
        self.assertIn("cover missing", row["status"])

    def test_a_preview_writes_nothing(self):
        writer = tagwriter.Writer(self.lib, self.log, dry=True)
        self.addCleanup(writer.close)
        self.assertEqual(writer.write(dict(key="1", src=self.source, artist="A", title="Song", album="", year="", genre="Acid", discogs="", cover="", notes=""))["status"], "dry")
        self.assertFalse(os.path.exists(self.written))

    def test_a_song_already_in_the_library_as_something_else_is_skipped(self):
        write_mp3(os.path.join(self.lib, "Acid", SONG + ".mp3"), artist="A", title="Song")
        writer = tagwriter.Writer(self.lib, self.log)
        self.addCleanup(writer.close)
        self.assertIn("already in library", writer.write(dict(key="1", src=self.source, artist="A", title="Song", album="", year="", genre="Acid", discogs="", cover="", notes=""))["status"])

    def test_one_of_these_counts_as_already_there_for_an_mp3(self):
        self.write()
        mp3 = write_mp3(os.path.join(self.inbox, "Other.mp3"), artist="", title="")
        writer = tagwriter.Writer(self.lib, self.log)
        self.addCleanup(writer.close)
        self.assertIn("already in library", writer.write(dict(key="2", src=mp3, artist="A", title="Song", album="", year="", genre="Acid", discogs="", cover="", notes=""))["status"])

    def test_nothing_is_left_behind_when_ffmpeg_fails(self):
        real = subprocess.run

        def failing(cmd, **kw):
            if "-movflags" in cmd or "-fflags" in cmd:
                with open(cmd[-1], "wb") as f:
                    f.write(b"half a file")
                return subprocess.CompletedProcess(cmd, 1, "", "it went wrong")
            return real(cmd, **kw)

        with mock.patch.object(tagwriter.subprocess, "run", failing):
            row = self.write()
        self.assertTrue(row["status"].startswith("error"))
        self.assertEqual([n for _, _, names in os.walk(self.lib) for n in names], [])


class WritingFlac(EachKind, Base):
    ending = ".flac"


class WritingM4A(EachKind, Base):
    ending = ".m4a"


class WrongInside(Base):
    def setUp(self):
        super().setUp()
        self.writer = tagwriter.Writer(self.lib, self.log)
        self.addCleanup(self.writer.close)

    def write(self, src):
        return self.writer.write(dict(key="1", src=src, artist="A", title="Song", album="", year="", genre="Acid", discogs="", cover="", notes=""))

    def test_an_mp3_named_flac_is_skipped(self):
        path = os.path.join(self.inbox, "A - Song.flac")
        shutil.copy2(write_mp3(os.path.join(self.root, "x.mp3")), path)
        self.assertEqual(self.write(path)["status"], "skipped: source is mp3, not flac")

    def test_a_flac_named_mp3_is_skipped(self):
        real_song(os.path.join(self.root, "x.flac"))
        path = os.path.join(self.inbox, "A - Song.mp3")
        shutil.copy2(os.path.join(self.root, "x.flac"), path)
        self.assertEqual(self.write(path)["status"], "skipped: source is flac, not mp3")

    def test_an_mp3_with_some_other_ending_still_goes_in_as_an_mp3(self):
        path = os.path.join(self.root, "x.part")
        shutil.copy2(write_mp3(os.path.join(self.root, "x.mp3")), path)
        self.assertEqual(self.write(path)["status"], "ok")
        self.assertTrue(os.path.exists(os.path.join(self.lib, "Acid", "A - Song.mp3")))


class InCurate(WithDiscogs):
    def setUp(self):
        super().setUp()
        jpeg = read(real_jpeg(os.path.join(self.root, "cover.jpg")))
        patcher = mock.patch.object(discogs, "_request", lambda url, binary=False: jpeg)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.fake.add("A", "The Record", [("A1", "Song", LENGTH)])

    def check_goes_in(self, ending):
        source = real_song(os.path.join(self.inbox, SONG + ending))
        before = read(source)
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (1, [f"Acid/{SONG}{ending}"]))
        written = os.path.join(self.lib, "Acid", SONG + ending)
        got = library.read_song(written)
        self.assertEqual((got["artist"], got["title"], got["genre"], got["cover"]), ("A", "Song", "Acid", True))
        self.assertEqual(tagwriter.audio_packets(written), tagwriter.audio_packets(source))
        self.assertEqual(read(source), before)
        self.assertEqual(self.log_rows()[-1]["status"], "ok")
        self.assertEqual(self.page_song(SONG + ending)["trust"], "auto")

    def test_a_flac_goes_in(self):
        self.check_goes_in(".flac")

    def test_an_m4a_goes_in(self):
        self.check_goes_in(".m4a")

    def test_a_second_run_leaves_it_alone(self):
        real_song(os.path.join(self.inbox, SONG + ".flac"))
        self.run_it()
        _, done = self.run_it()
        self.assertEqual((done["added"], done["waiting"]), (0, 0))

    def test_other_kinds_of_file_wait(self):
        with open(os.path.join(self.inbox, SONG + ".ogg"), "wb") as f:
            f.write(b"OggS")
        self.run_it()
        self.assertEqual(self.waiting()[f"inbox/Downloads/{SONG}.ogg"]["why"], curate.NOT_CURATABLE)

    def test_a_file_that_isnt_what_its_name_says_waits_and_says_so(self):
        shutil.copy2(write_mp3(os.path.join(self.root, "x.mp3")), os.path.join(self.inbox, SONG + ".flac"))
        self.run_it()
        why = self.waiting()[f"inbox/Downloads/{SONG}.flac"]["why"]
        self.assertIn("named .flac, but it's really mp3. Rename it to .mp3", why)
        self.assertEqual(self.in_library(), [])

    def test_something_it_cant_curate_under_any_name_says_so(self):
        self.assertIn(curate.NOT_CURATABLE, curate._wrong_name("mp3", "vorbis"))

    def test_a_broken_flac_waits(self):
        path = real_song(os.path.join(self.inbox, SONG + ".flac"))
        data = bytearray(read(path))
        keep = data.index(b"fLaC") + 8000
        data[keep:] = random.Random(9).randbytes(len(data) - keep)
        with open(path, "wb") as f:
            f.write(data)
        _, done = self.run_it()
        self.assertEqual((done["added"], self.in_library()), (0, []))
        self.assertIn("damaged", self.waiting()[f"inbox/Downloads/{SONG}.flac"]["why"])

    def test_the_page_shows_a_waiting_flac_with_its_tags(self):
        real_song(os.path.join(self.inbox, "Someone - Unknown Thing.flac"), artist="Someone", title="Unknown Thing", album="Tagged Album")
        self.run_it()
        song = self.page_song("Someone - Unknown Thing.flac")
        self.assertEqual((song["artist"], song["title"], song["album"]), ("Someone", "Unknown Thing", "Tagged Album"))


class ChangingGenre(Base):
    def setUp(self):
        super().setUp()
        self.cover = real_jpeg(os.path.join(self.root, "cover.jpg"))

    def place(self, ending, cover=True):
        source = real_song(os.path.join(self.inbox, SONG + ending))
        writer = tagwriter.Writer(self.lib, self.log)
        self.addCleanup(writer.close)
        writer.write(dict(key="1", src=source, artist="A", title="Song", album="The Record", year="1996", genre="Techno", discogs=LINK, cover=self.cover if cover else "", notes="genre toss-up: Techno / Acid"))
        writer.close()
        return os.path.join(self.lib, "Techno", SONG + ending)

    def check_changes(self, ending):
        old = self.place(ending)
        packets, before = tagwriter.audio_packets(old), library.read_song(old)
        self.answer("genre", f"library/Techno/{SONG}{ending}", genre="Acid")
        code, out = self.run_apply()
        new = os.path.join(self.lib, "Acid", SONG + ending)
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(old), "it moved to its new genre's folder")
        got = library.read_song(new)
        self.assertEqual(got["genre"], "Acid")
        self.assertEqual({k: got[k] for k in ("artist", "title", "album", "year", "comment", "cover")}, {k: before[k] for k in ("artist", "title", "album", "year", "comment", "cover")})
        self.assertEqual(tagwriter.audio_packets(new), packets)
        return out

    def test_a_flac(self):
        self.check_changes(".flac")

    def test_an_m4a(self):
        self.check_changes(".m4a")

    def test_the_old_copy_is_set_aside(self):
        self.check_changes(".flac")
        aside = [n for _, _, names in os.walk(os.path.join(self.app, "Set aside")) for n in names]
        self.assertEqual(aside, [SONG + ".flac"])

    def test_if_ffmpeg_cant_do_it_the_song_stays_as_it_was(self):
        old = self.place(".flac")
        before = read(old)
        self.answer("genre", f"library/Techno/{SONG}.flac", genre="Acid")
        with mock.patch.object(tagwriter, "remux", side_effect=ValueError("no")):
            code, out = self.run_apply()
        self.assertEqual(code, 1)
        self.assertIn("couldn't be rewritten", out)
        self.assertEqual(read(old), before)

    def test_if_the_audio_came_out_different_the_song_stays_as_it_was(self):
        old = self.place(".flac")
        before = read(old)
        self.answer("genre", f"library/Techno/{SONG}.flac", genre="Acid")
        with mock.patch.object(tagwriter, "audio_packets", side_effect=[["a"], ["b"]]):
            code, out = self.run_apply()
        self.assertEqual(code, 1)
        self.assertIn("didn't check out", out)
        self.assertEqual(read(old), before)


if __name__ == "__main__":
    unittest.main()
