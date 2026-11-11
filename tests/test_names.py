"""Reading the name of a download, and comparing names in any alphabet. One test per thing a name can do to the reader.

    python -m unittest discover -s tests
"""
import os
import re
import sys
import time
import unicodedata
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import curate, discogs, keys, parse, resolve, suggest  # noqa: E402
from test_curate import KEY, LENGTH, WithDiscogs  # noqa: E402


def read(name, **tags):
    return parse.parse(name, tags)


def said(name, **tags):
    info = read(name, **tags)
    return info["artist"], info["title"]


class WhatANameKeeps(unittest.TestCase):
    def test_an_initial_is_not_the_side_of_a_record(self):
        self.assertEqual(said("D. Ramirez - Yeah Yeah"), ("D. Ramirez", "Yeah Yeah"))
        self.assertEqual(read("A. Paul - Tension")["search_artist"], "A. Paul")
        self.assertEqual(read("C. J. Bolland - Camargue")["search_artist"], "C. J. Bolland")

    def test_a_side_with_its_number_still_comes_off_the_front(self):
        self.assertEqual(said("B2. Lee Burton - Music [UNTITLED001]"), ("Lee Burton", "Music"))
        self.assertEqual(said("A1. Hardfloor - Acperience 1"), ("Hardfloor", "Acperience 1"))

    def test_a_title_that_is_a_year_stays_and_so_does_the_artist(self):
        for name, artist, title in (("Binary Finary - 1998", "Binary Finary", "1998"), ("Cari Lekebusch - 1989", "Cari Lekebusch", "1989"), ("Prince - 1999", "Prince", "1999")):
            info = read(name)
            self.assertEqual((info["artist"], info["title"], info["search_title"], info["alt_title"]), (artist, title, title, None), name)
        self.assertEqual(read("Binary Finary - 1998 (Paul van Dyk Remix)")["search_title"], "1998")
        self.assertEqual(said("1999"), ("", "1999"))

    def test_a_year_after_the_titles_words_stays_with_the_other_reading_beside_it(self):
        for name in ("Three Drives - Greece 2000", "Three Drives - Greece 2000 [MASS001]", "Three Drives - Greece 2000 (Official Video)"):
            info = read(name)
            self.assertEqual((info["title"], info["search_title"], info["alt_title"]), ("Greece 2000", "Greece 2000", "Greece"), name)
        self.assertEqual(read("M.U.T.E - Analog Mind 1995")["alt_title"], "Analog Mind")
        info = read("Song 1995")
        self.assertEqual((info["artist"], info["title"], info["alt_title"]), ("", "Song 1995", "Song"))

    def test_a_year_after_a_note_only_says_when(self):
        info = read("Trans Fusion II - Infinite (Original Mix) 1995")
        self.assertEqual((info["title"], info["mix"], info["year_hint"], info["alt_title"]), ("Infinite (Original Mix)", "Original Mix", 1995, None))

    def test_a_year_after_the_name_of_who_put_it_up_only_says_when(self):
        info = read("Artist - Song - Label 1995")
        self.assertEqual((info["title"], info["extra"], info["year_hint"], info["alt_title"]), ("Song", ["Label"], 1995, None))
        info = read("Ubar Tmar - The Tale Of Taketori - Fusion - 1997 - GOA TRANCE")
        self.assertEqual((info["title"], info["extra"], info["year_hint"], info["genre_hint"]), ("The Tale Of Taketori", ["Fusion"], 1997, "GOA TRANCE"))

    def test_a_year_that_has_not_been_yet_is_part_of_the_name(self):
        info = read("Vangelis - Blade Runner 2049")
        self.assertEqual((info["title"], info["alt_title"], info["year_hint"]), ("Blade Runner 2049", None, None))
        self.assertEqual(read("Vangelis - Blade Runner (2049)")["title"], "Blade Runner (2049)")
        self.assertEqual(read("Artist - Theme (Blade Runner 2049)")["title"], "Theme (Blade Runner 2049)")

    def test_notes_of_years_and_genres_still_come_off(self):
        for note, year, genre in (("(Acid 1996)", 1996, "Acid"), ("(CLASSIC 1994)", 1994, "CLASSIC"), ("('94 CLASSIC)", 1994, "CLASSIC"), ("[1993]", 1993, None), ("(95 Acid, Psy)", 1995, "Acid"),
                                  ("(1995)", 1995, None), ("(Hardtrance 1995)", 1995, "Hardtrance"), ("(Acid Trance 1997)", 1997, "Acid"), ("(Techno)", None, "Techno")):
            info = read(f"Artist - Song {note}")
            self.assertEqual((info["artist"], info["title"], info["year_hint"], info["genre_hint"]), ("Artist", "Song", year, genre), note)

    def test_a_number_in_brackets_is_not_a_year(self):
        for note in ("(303)", "[303]", "(808)", "(10)", "(95)", "(1200)", "(303 Acid)"):
            info = read(f"Artist - Song {note}")
            self.assertEqual((info["title"], info["search_title"], info["year_hint"]), (f"Song {note}", "Song", None), note)
        for note in ("(303)", "[303]", "(10)", "(1200)"):
            self.assertEqual(curate.name_notes(read(f"Artist - Song {note}")["title"]), [], f"{note} doesn't hold the song back")

    def test_notes_that_are_all_the_title_there_is_stay(self):
        self.assertEqual(said("Jon The Dentist - (A1)"), ("Jon The Dentist", "(A1)"))
        self.assertEqual(said("Lil Louis - (House)"), ("Lil Louis", "(House)"))
        self.assertEqual(said("Artist - (1995)"), ("Artist", "(1995)"))
        self.assertEqual(read("Jon The Dentist - (A1) (1995)")["artist"], "Jon The Dentist")
        self.assertEqual(read("Jon The Dentist - (A1)")["search_title"], "", "nothing to search a title by, so it waits for you")

    def test_a_note_in_front_of_a_name_leaves_a_title_with_no_artist(self):
        for name, title in (("(House) - Lil Louis", "Lil Louis"), ("[1990] - LFO", "LFO"), ("(Acid) - Hardfloor", "Hardfloor"), ("(Trance) - Black Stone", "Black Stone")):
            self.assertEqual(said(name), ("", title), "it used to come out as a song named after its artist")

    def test_the_side_of_a_record_still_comes_off_a_title(self):
        self.assertEqual(said("Jon The Dentist - Untitled (A1)"), ("Jon The Dentist", "Untitled"))
        self.assertEqual(said("Scanners - Gun Shy- (B2) A World Outside"), ("Scanners", "Gun Shy- A World Outside"))
        self.assertEqual(said("Scanners - (B2) A World Outside"), ("Scanners", "A World Outside"), "the dash in front of the side is the one between artist and title")
        info = read("Artist - Song - (B1)")
        self.assertEqual((info["title"], info["extra"]), ("Song", []))

    def test_a_dash_inside_brackets_does_not_cut_the_title(self):
        info = read("Sash! - Encore Une Fois (Future Breeze Mix - Edit)")
        self.assertEqual((info["title"], info["search_title"], info["mix"], info["extra"]), ("Encore Une Fois (Future Breeze Mix - Edit)", "Encore Une Fois", "Future Breeze Mix - Edit", []))
        info = read("Artist - Song (A - B Remix) - Uploader")
        self.assertEqual((info["title"], info["extra"]), ("Song (A - B Remix)", ["Uploader"]))

    def test_a_name_cut_short_in_a_bracket_is_still_read(self):
        info = read("Artist - Song (Original Mix - Uploader")
        self.assertEqual((info["artist"], info["title"], info["extra"]), ("Artist", "Song (Original Mix", ["Uploader"]))
        self.assertEqual(said("Analog Exploration - Back To :-)"), ("Analog Exploration", "Back To :-)"))

    def test_a_year_in_a_mix_name(self):
        info = read("The South Of Trance - De La Troisieme Dimension (Gracious Mix 1994)")
        self.assertEqual((info["mix"], info["year_hint"]), ("Gracious Mix", 1994))
        self.assertEqual(read("Artist - Song (Original Mix 1995)")["mix"], "Original Mix")
        self.assertEqual(read("Push - Universal Nation (Remix 2000)")["mix"], "Remix", "with the year left in, any version with 2000 in its name would do")

    def test_an_x_between_two_names_is_two_people_and_inside_one_it_is_a_letter(self):
        for artist, first in (("Mandragora X AF3", "Mandragora"), ("lil happy lil sad x SoLonely", "lil happy lil sad"), ("T Ξ X Λ S", "T Ξ X Λ S"), ("Mr X & Mr Y", "Mr X"),
                              ("Jay Z x Kanye West", "Jay Z"), ("Dimitri K x N-Vitral", "Dimitri K"), ("Willy William x J Balvin", "Willy William"), ("Maduk x T & Sugah", "Maduk"),
                              ("DJ Panda ft. Nadir", "DJ Panda"), ("Phorum Feat. Marvin B.", "Phorum"), ("Styles & Breeze", "Styles"), ("Planet X", "Planet X"), ("X", "X"), ("", "")):
            self.assertEqual(read(f"{artist} - Song")["search_artist"] if artist else parse.first_artist(""), first, artist)

    def test_a_guest_and_a_mix_in_one_bracket_still_count_as_a_mix(self):
        self.assertEqual(read("Artist - Song (feat. Singer Y Remix)")["mix"], "feat. Singer Y Remix", "left out, the song would go in as the plain original")
        self.assertEqual(read("Artist - Song (ft. Vocal Tia) (Dub Mix)")["mix"], "ft. Vocal Tia", "the first note with a mix word in it, as it always was")

    def test_a_year_after_a_note_that_comes_off_only_says_when(self):
        for name in ("Phasenraum - Plasmata (Hardtrance) 1995", "Phasenraum - Plasmata (Official Video) 1995", "Phasenraum - Plasmata [HH 019] 1995", "Phasenraum - Plasmata [HQ] 1995",
                     "Phasenraum - Plasmata (Hardtrance) 1995 [HQ]"):
            info = read(name)
            self.assertEqual((info["title"], info["year_hint"], info["alt_title"]), ("Plasmata", 1995, None), name)

    def test_a_long_name_full_of_genre_words_is_read_at_once(self):
        """A bracket of them that never closes used to be tried every possible way: seconds for 200 characters, minutes for a few more."""
        for word in ("acidtrance", "psytrance", "acid trance ", "goa trance", "hard trance 1995 "):
            started = time.perf_counter()
            info = read("A - B (" + word * 40)
            self.assertLess(time.perf_counter() - started, 1, word)
            self.assertEqual(info["artist"], "A")

    def test_other_dashes_split_a_name_too(self):
        for dash in ("-", "–", "—", "－", "‐", "―", "−"):
            self.assertEqual(said(f"Artist {dash} Song"), ("Artist", "Song"), dash)

    def test_wide_brackets_are_brackets(self):
        info = read("Artist ＆ Friend - Song （Extended Mix） ［HQ］")
        self.assertEqual((info["artist"], info["title"], info["search_title"], info["mix"]), ("Artist & Friend", "Song (Extended Mix)", "Song", "Extended Mix"))

    def test_whoever_put_it_up_comes_off_the_end(self):
        info = parse.parse("Phasenraum - Plasmata (Hardtrance 1995) - marcou909", dict(artist="marcou909", title="Phasenraum - Plasmata (Hardtrance 1995)"))
        self.assertEqual((info["artist"], info["title"], info["extra"], info["uploader"]), ("Phasenraum", "Plasmata", [], "marcou909"))
        info = parse.parse("Hardfloor - Acperience 1 - Acid Channel", dict(artist="AcidChannel", title="Hardfloor - Acperience 1"))
        self.assertEqual((info["title"], info["extra"]), ("Acperience 1", []), "the same name written with a space")
        info = parse.parse("Hardfloor - Acperience 1 - テクノ", dict(artist="テクノ", title="Hardfloor - Acperience 1"))
        self.assertEqual((info["title"], info["extra"], info["uploader"]), ("Acperience 1", [], "テクノ"), "a channel named in another alphabet")
        info = parse.parse("Energy 52 - Café Del Mar - Trance - Classics", dict(artist="Trance - Classics", title="Energy 52 - Café Del Mar"))
        self.assertEqual((info["artist"], info["title"], info["extra"]), ("Energy 52", "Café Del Mar", []), "a channel with a dash in its own name")

    def test_plain_names_read_as_they_always_did(self):
        for name, artist, title in (("A - Song", "A", "Song"), ("A - Song (2)", "A", "Song (2)"), ("Trash + Burn - T.A. 140", "Trash + Burn", "T.A. 140"), ("OXL - Don't U Harm My TB 303", "OXL", "Don't U Harm My TB 303"),
                                    ("Ben Fraser - 2424 - Scythe Squadron 09", "Ben Fraser", "2424"), ("Kernkraft 400", "", "Kernkraft 400"), ("Cafe del Mar '98", "", "Cafe del Mar '98"), ("A - Love = Pain", "A", "Love = Pain")):
            self.assertEqual(said(name), (artist, title), name)


class TheOtherReadingOfAYear(WithDiscogs):
    def test_a_song_called_by_a_year_goes_in_under_its_whole_name(self):
        self.file("Three Drives - Greece 2000")
        self.fake.add("Three Drives", "Record", [("A1", "Greece 2000", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Three Drives - Greece 2000.mp3"])

    def test_a_year_that_only_says_when_is_left_out_once_the_whole_name_finds_nothing(self):
        self.file("Mute - Analog Mind 1995")
        self.fake.add("Mute", "Record", [("A1", "Analog Mind", LENGTH)], year=1995)
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Mute - Analog Mind.mp3"])

    def test_a_year_one_off_from_the_records_is_still_only_a_note(self):
        self.file("Mute - Analog Mind 1995")
        self.fake.add("Mute", "Record", [("A1", "Analog Mind", LENGTH)], year=1994)
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Mute - Analog Mind.mp3"])

    def test_a_later_version_named_by_its_year_is_not_taken_for_the_original(self):
        self.file("Mute - Stella 1999")
        self.fake.add("Mute", "Record", [("A1", "Stella", LENGTH)], year=1992)
        self.run_it()
        self.assertEqual(self.in_library(), [])
        why = self.waiting()[KEY.format("Mute - Stella 1999")]["why"]
        self.assertIn("ends in 1999", why)
        self.assertIn("1992", why)

    def test_the_whole_name_is_tried_first(self):
        self.file("Mute - Stella 1999")
        self.fake.add("Mute", "The Old One", [("A1", "Stella", LENGTH)], year=1992)
        self.fake.add("Mute", "The New One", [("A1", "Stella 1999", LENGTH)], year=1999)
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Mute - Stella 1999.mp3"])

    def test_a_title_with_no_artist_gets_its_other_reading_too(self):
        item = dict(parse.parse("Song 1995", {}), tag_artist="", tag_title="")
        self.assertEqual([(r["search_artist"], r["search_title"]) for r in curate.other_readings(item)], [("", "Song")])

    def test_tags_that_end_in_a_year_get_their_other_reading_too(self):
        self.file("track07", artist="Mute", title="Analog Mind 1995")
        self.fake.add("Mute", "Record", [("A1", "Analog Mind", LENGTH)], year=1995)
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Mute - Analog Mind.mp3"])

    def test_a_reading_with_no_artist_comes_after_the_ones_that_name_one(self):
        item = dict(parse.parse("Song 1995", {}), tag_artist="Rev", tag_title="Song 1995")
        self.assertEqual([(r["search_artist"], r["search_title"]) for r in curate.other_readings(item)], [("Rev", "Song 1995"), ("Rev", "Song"), ("", "Song")])

    def test_a_title_made_only_of_a_note_is_not_turned_round(self):
        item = dict(parse.parse("Lil Louis - (House)", {}), tag_artist="", tag_title="")
        self.assertEqual(curate.other_readings(item), [], "turned round it would be a song called Lil Louis")

    def test_a_song_whose_title_is_only_a_note_is_not_taken_for_one_named_after_its_artist(self):
        for name in ("Lil Louis - (House)", "(House) - Lil Louis"):
            with self.subTest(name):
                self.file(name)
                self.fake.add("Lil Louis", "Record", [("A1", "Lil Louis", LENGTH), ("B1", "French Kiss", "6:00")])
                self.run_it()
                self.assertEqual(self.in_library(), [])

    def test_the_other_reading_comes_before_the_tags_and_the_name_turned_round(self):
        item = dict(parse.parse("Song 1995 - A", {}), tag_artist="Real", tag_title="Title")
        self.assertEqual([(r["search_artist"], r["search_title"]) for r in curate.other_readings(item)], [("Real", "Title"), ("A", "Song 1995")], "the year isn't at the end here, so there's no other reading")
        item = dict(parse.parse("A - Song 1995", {}), tag_artist="Real", tag_title="Title")
        self.assertEqual([(r["search_artist"], r["search_title"]) for r in curate.other_readings(item)], [("A", "Song"), ("Real", "Title"), ("Song 1995", "A")])

    def test_what_you_say_a_song_is_is_read_the_same_way(self):
        self.file("Unknown - Track")
        self.fake.add("Binary Finary", "Record", [("A1", "1998", LENGTH)])
        self.run_it()
        self.answer_for("Unknown - Track", "identify", "Binary Finary - 1998")
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Binary Finary - 1998.mp3"])

    def test_an_artist_you_name_by_an_initial_is_looked_up_whole(self):
        self.file("Unknown - Track")
        self.fake.add("D. Ramirez", "Record", [("A1", "Yeah Yeah", LENGTH)])
        self.run_it()
        self.answer_for("Unknown - Track", "identify", "D. Ramirez - Yeah Yeah")
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/D. Ramirez - Yeah Yeah.mp3"])
        self.assertIn(dict(artist="D. Ramirez", track="Yeah Yeah"), self.fake.calls)

    def test_an_edit_of_a_mix_is_not_taken_for_the_mix(self):
        self.assertEqual(curate.name_notes("Encore Une Fois (Future Breeze Mix - Edit)"), ["Future Breeze Mix - Edit", "Future Breeze Mix", "Edit"])
        self.file("Sash! - Encore Une Fois (Future Breeze Mix - Edit)")
        self.fake.add("Sash!", "Record", [("A1", "Encore Une Fois (Future Breeze Mix)", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])
        self.assertIn('"Edit"', self.waiting()[KEY.format("Sash! - Encore Une Fois (Future Breeze Mix - Edit)")]["why"])

    def test_a_mix_with_a_dash_in_its_name_goes_in_when_the_record_lists_it(self):
        self.file("Sash! - Encore Une Fois (Future Breeze Mix - Edit)")
        self.fake.add("Sash!", "Record", [("A1", "Encore Une Fois (Future Breeze Mix - Edit)", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Sash! - Encore Une Fois (Future Breeze Mix - Edit).mp3"])

    def test_a_guest_and_a_version_in_one_bracket_wait(self):
        for name in ("A - Song (feat. Bob Extended Mix)", "A - Song (feat. Bob - Sped Up Version)"):
            with self.subTest(name):
                self.file(name)
                self.fake.add("A", "Record", [("A1", "Song", LENGTH)])
                self.run_it()
                self.assertEqual(self.in_library(), [])

    def test_a_song_with_only_a_side_for_a_title_waits_with_its_artist(self):
        self.file("Jon The Dentist - (A1)")
        self.fake.add("Jon The Dentist", "Record", [("A1", "Untitled", LENGTH), ("A2", "Untitled", LENGTH)])
        self.fake.add("Somebody", "Other Record", [("A1", "Jon The Dentist", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [], "it used to be looked up as a song called Jon The Dentist")
        self.assertIn(KEY.format("Jon The Dentist - (A1)"), self.waiting())


def as_it_was(s):
    """The key rule before letters of other alphabets counted."""
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


class NamesInAnyAlphabet(unittest.TestCase):
    def test_names_in_latin_letters_keep_the_key_they_had(self):
        for name in ("Björk", "Röyksopp", "Mø", "Tiësto", "Łukasz", "Straße", "CrØssf@d3d", "İstanbul", "Hawaiʻi", "Opti²k³atO", "AC/DC", "P!nk", "100% Acidiferous", "2814", "Ⅲ", "½", "№ 5",
                     "ＡＢＣ　ｆｕｌｌ", "１２３", "ⓐⓑⓒ", "ℓove™", "t+pazolite", "D.A.V.E. The Drummer", "Mr. Burns & The Geezer", "!!!", "<3", "(((O)))", "", "   ",
                     chr(0xB5) + "-Ziq", "10 " + chr(0xB5) + "F", "50 " + chr(0x2126), chr(0x212B), chr(0x212A)):  # the micro, ohm, angstrom and kelvin signs
            self.assertEqual(keys.norm(name), as_it_was(name), name)
        self.assertTrue(curate.same_artist("u-Ziq", chr(0xB5) + "-Ziq"), "the micro sign is not a Greek letter")

    def test_no_character_changes_the_latin_part_of_a_key(self):
        for point in [*range(0x3400), *range(0xA000, 0xAC00, 7), *range(0xF900, 0x10000), *range(0x1D400, 0x1D800), *range(0x1F100, 0x1F200)]:
            for text in (chr(point), "a" + chr(point) + "b", "A" + chr(point).upper() + "Z", chr(point) + chr(0x301)):
                key = keys.norm(text)
                self.assertEqual("".join(c for c in key if c.isascii()), as_it_was(text), hex(point))

    def test_names_in_other_alphabets_get_keys_of_their_own(self):
        for one, other in (("Отпусти меня", "Я тебя не отдам"), ("初音ミク", "鏡音リン"), ("千本桜", "炉心融解"), ("ガラス", "カラス"), ("Ελένη", "Σας"), ("방탄소년단", "周杰倫"), ("Love 東京", "Love 大阪")):
            self.assertTrue(keys.norm(one) and keys.norm(other), (one, other))
            self.assertNotEqual(keys.norm(one), keys.norm(other), (one, other))

    def test_a_mark_that_makes_another_letter_stays(self):
        for one, other in (("Край", "Краи"), ("Война", "Воина"), ("Мой", "Мои"), ("Їжа", "Іжа"), ("กิน", "กัน"), ("दिल", "दाल"), ("राम", "रमा"), ("ハード", "バード"), ("バード", "パード")):
            self.assertNotEqual(keys.norm(one), keys.norm(other), (one, other))

    def test_capitals_accents_and_widths_still_do_not_count_there(self):
        for one, other in (("КИНО", "Кино"), ("Всё", "Все"), ("ΕΛΕΝΗ", "Ελένη"), ("Σας", "ΣΑΣ"), ("שָׁלוֹם", "שלום"), ("ｶﾞﾗｽ", "ガラス"), ("高橋　洋子", "高橋洋子"), ("Группа  крови!", "группа крови")):
            self.assertEqual(keys.norm(one), keys.norm(other), (one, other))

    def test_a_key_and_its_words_are_made_of_the_same_letters(self):
        for name in ("DJﾞRush", "あ゛あ゛", "Край и Война", "กิน ข้าว", "Three 'N One", "t+pazolite", "Ελένη ΣΑΣ", "x" + chr(0x3099) + "y"):
            self.assertEqual("".join(keys.words(name)), keys.norm(name), name)

    def test_the_words_of_a_name(self):
        self.assertEqual(keys.words("Three 'N One Remix"), ["three", "n", "one", "remix"])
        self.assertEqual(keys.words("かめりあ Remix"), ["かめりあ", "remix"])
        self.assertEqual(keys.words("Кино - Группа крови"), ["кино", "группа", "крови"])

    def test_two_songs_by_one_artist_are_two_songs_to_spotify(self):
        self.assertNotEqual(suggest.track_key("SEREBRO", "Отпусти меня (gerc3w Remix)"), suggest.track_key("SEREBRO", "Я Тебя Не Отдам (SWEEQTY Remix)"))
        self.assertEqual(suggest.track_key("SEREBRO", "Я тебя не отдам (Hardstyle Mix)"), suggest.track_key("Serebro", "Я Тебя Не Отдам"))
        self.assertNotEqual(suggest.track_key("НЮША", "Цунами (SWEEQTY Remix)"), "|", "a song named all in Cyrillic used to have no key at all")
        self.assertNotEqual(suggest.track_key("DJ 千夏", "Love 東京"), suggest.track_key("DJ 太郎", "Love 大阪"))
        self.assertEqual(suggest.track_key("Hardfloor & Friend", "Acperience (Original Mix)"), "hardfloor|acperience")

    def test_a_remixer_named_in_another_alphabet_has_to_be_the_one(self):
        self.assertFalse(resolve.mix_matches("かめりあ Remix", "Song (t+pazolite Remix)"))
        self.assertFalse(resolve.mix_matches("Кино Mix", "Song (Other Mix)"))
        self.assertFalse(resolve.mix_matches("ロング Version", "Song (Short Version)"))
        self.assertTrue(resolve.mix_matches("かめりあ Remix", "Song (かめりあ Remix)"))
        self.assertTrue(resolve.mix_matches("リミックス", "Song (リミックス)"))
        self.assertTrue(resolve.mix_matches("SWEEQTY Remix", "Ревную (SWEEQTY Hardstyle Remix)"))

    def test_a_mix_named_in_another_alphabet_has_to_be_named_the_same(self):
        """The loose ways of matching a mix name only know Latin words like "remix" and "version": elsewhere they'd let any version through."""
        for mix, title in (("замедленная версия", "Song (Версия)"), ("Кино Ремикс", "Song (Ремикс)"), ("かめりあリミックス", "Song (リミックス)"), ("リミックス", "Song (リミックスロング)"),
                           ("Original Mix", "Song (オリジナル)"), ("Club Mix", "Song (クラブ)")):
            self.assertFalse(resolve.mix_matches(mix, title), (mix, title))
        self.assertTrue(resolve.mix_matches("Версия", "Song (версия)"))

    def test_mix_names_in_latin_letters_match_as_they_did(self):
        for mix, title, same in (("B Mix", "Song (Club Mix)", False), ("Acid Mix", "Tune (Acid Mix)", True), ("Original Mix", "Tune", True), ("Three 'N One Remix", "Café Del Mar (Three 'N One Remix)", True),
                                 ("Hardtrance Mix", "Other Worlds (Hard Trance Mix)", True), ("Club Mix", "Song (Dub Mix)", False), ("Acid Mix", "Tune (Acid Remix)", True),
                                 ("303 Mix", "Tune (303 Mix)", True), ("303 Mix", "Tune (303 Dub)", False), ("1995 Mix", "Tune (1995 Live Version)", False), ("Remix", "Tune (2000 Dub)", False)):
            self.assertEqual(resolve.mix_matches(mix, title), same, (mix, title))

    def test_an_artist_in_another_alphabet_is_checked_like_any_other(self):
        for named, credited, same in (("初音ミク", "初音ミク", True), ("Кино", "КИНО", True), ("DJ 千夏", "DJ Sharpnel", False), ("DJ 千夏", "Adjuzt", False), ("DJ 千夏", "DJ 千夏", True),
                                      ("Ramirez", "D. Ramirez", True), ("Mr Burns", "Mr. Burns & The Geezer", True)):
            self.assertEqual(resolve.artist_ok(named, credited), same, (named, credited))
        self.assertTrue(curate.same_artist("初音ミク & 鏡音リン", "鏡音リン & 初音ミク"))
        self.assertTrue(curate.same_artist("かめりあ feat. ななひら", "かめりあ"))
        self.assertFalse(curate.same_artist("東京事変", "大阪"))
        self.assertTrue(curate.same_artist("花", "花"), "one letter can be a whole name there")

    def test_titles_in_other_alphabets_are_told_apart_even_beside_latin_words(self):
        self.assertFalse(resolve.same_title("Love 大阪", "Love 東京"))
        self.assertFalse(resolve.same_title("別の曲 2001", "夜空ノムコウ 2001"))
        self.assertFalse(resolve.same_title("カラス", "ガラス"))
        self.assertTrue(resolve.same_title("Всё (Remix)", "Все"))
        self.assertTrue(resolve.same_title("Song (Club Mix)", "Song"))

    def test_a_title_discogs_gives_in_two_alphabets_matches_either_half(self):
        self.assertTrue(resolve.same_title("Cyclick = サイクリック", "Cyclick"))
        self.assertTrue(resolve.same_title("危ないベースライン = Bassline Crisis", "危ないベースライン"))
        self.assertTrue(resolve.same_title("Cyclick = サイクリック", "Cyclick = サイクリック"))
        self.assertFalse(resolve.same_title("Love = Pain", "Love"), "an equals sign between two halves in one alphabet is part of the title")
        self.assertTrue(resolve.same_title("Love = Pain", "Love = Pain"))
        self.assertTrue(resolve.same_title("東京 2001 = Tokyo 2001 (Remix)", "Tokyo 2001"))

    def test_one_odd_letter_does_not_make_a_title_two_titles(self):
        for title, half in (("Love = Pain (feat. 初音ミク)", "Love"), ("Love = Pain (かめりあ Remix)", "Pain"), ("Cry ツ = Smile", "Smile"), ("Circumference = 2πr", "Circumference"), ("Love ❶ = Pain", "Pain")):
            self.assertFalse(resolve.same_title(title, half), (title, half))



class OtherAlphabetsInCurate(WithDiscogs):
    def test_a_song_named_in_cyrillic_is_found_under_its_own_name(self):
        self.file("Кино - Группа крови")
        self.fake.add("Кино", "Record", [("A1", "Группа крови", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), ["Acid/Кино - Группа крови.mp3"])

    def test_an_untitled_track_named_in_two_alphabets_is_still_untitled(self):
        self.assertEqual(resolve.clean_title("Untitled = 無題", "A2", "X")[0], "Untitled (A2)")
        patcher = mock.patch.object(discogs, "search", self.fake.everything)  # Discogs finds a record by either half of such a title
        patcher.start()
        self.addCleanup(patcher.stop)
        self.file("A - Untitled")
        self.fake.add("A", "Record", [("A1", "Untitled = 無題", "7:00"), ("A2", "Untitled = 無題", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])
        self.assertIn("several untitled tracks", self.waiting()[KEY.format("A - Untitled")]["why"])

    def test_a_title_in_cyrillic_one_mark_apart_is_another_title(self):
        self.file("Ария - Край")
        self.fake.add("Ария", "Record", [("A1", "Краи", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_version_named_in_another_alphabet_is_not_any_version(self):
        self.file("A - Song (замедленная версия)")
        self.fake.add("A", "Record", [("A1", "Song (Версия)", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_another_song_by_the_same_artist_is_not_taken_for_it(self):
        self.file("Кино - Группа крови")
        self.fake.add("Кино", "Record", [("A1", "Звезда по имени Солнце", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_another_artist_who_shares_only_dj_is_not_taken_for_this_one(self):
        patcher = mock.patch.object(discogs, "search", self.fake.everything)  # Discogs answers loosely: every record comes back
        patcher.start()
        self.addCleanup(patcher.stop)
        self.file("DJ 千夏 - Love")
        self.fake.add("DJ Sharpnel", "Record", [("A1", "Love", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_record_by_various_artists_is_not_proof_of_whose_track_it_is(self):
        self.assertFalse(resolve.artist_ok("Io", "Various "), "that the letters are inside the word says nothing")
        self.assertFalse(resolve.artist_ok("Ari", "Various"))
        self.assertTrue(resolve.artist_ok("Various", "Various "))
        patcher = mock.patch.object(discogs, "search", self.fake.everything)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.file("Io - Song")
        self.fake.add("Various", "A Compilation", [("A1", "Song", LENGTH)])
        self.run_it()
        self.assertEqual(self.in_library(), [])

    def test_a_big_x_inside_a_name_is_not_a_joiner(self):
        for credited, written in (("Mr. X & Mr. Y", "Mr. X & Mr. Y"), ("Planet X Crew", "Planet X Crew"), ("A x B", "A & B"), ("A vs. B", "A & B"), ("A And B", "A & B"), ("A feat. B", "A & B")):
            self.assertEqual(resolve.unify_joiners(credited), written, credited)

    def test_untitled_sides_nobody_named_are_said_as_that(self):
        why = curate.judge(dict(artist="A", title="Untitled", mix=None), dict(status="ready", how="length matches (file says 'None')", artist="A", title="Untitled (A1)", dur_diff=0, options=[]))
        self.assertIn("several untitled tracks", why)
        self.assertNotIn("None", why)
        why = curate.judge(dict(artist="A", title="Song (Club Mix)", mix="Club Mix"), dict(status="ready", how="length matches (file says 'Club Mix')", artist="A", title="Song (Dub Mix)", dur_diff=0, options=[]))
        self.assertIn('Your file says "Club Mix"', why)

    def test_your_genre_for_one_artist_is_not_handed_to_every_artist_in_another_alphabet(self):
        history = {}
        history.setdefault(resolve.norm("初音ミク"), "J-Core")
        self.assertIsNone(history.get(resolve.norm("Кино")))
        self.assertEqual(history.get(resolve.norm("初音ミク")), "J-Core")


class AYearWrittenAsANote(WithDiscogs):
    """ "Stella 1999" already waited when only the "Stella" of 1992 was found. So must the same year written as a note."""

    def test_a_record_from_another_year_is_asked_about(self):
        names = ("A - Stella (Hardtrance) 1999", "A - Stella (Official Video) 1999", "A - Stella [HH 019] 1999", "D - Other (Mix 1999)")
        for name in names:
            self.file(name)
        self.fake.add("A", "The Record", [("A1", "Stella", 0)], year=1992)
        self.fake.add("D", "Another", [("A1", "Other (Mix)", 0)], year=1992)
        self.run_it()
        self.assertEqual(self.in_library(), [])
        for name in names:
            with self.subTest(name):
                self.assertIn("says 1999 and the record is from 1992", self.waiting()[KEY.format(name)]["why"])

    def test_a_record_from_that_year_or_the_one_beside_it_goes_in(self):
        self.file("B - Tune (Hardtrance) 1992")
        self.file("C - Song (Trance 1994)")
        self.fake.add("B", "One", [("A1", "Tune", LENGTH)], year=1992)
        self.fake.add("C", "Two", [("A1", "Song", LENGTH)], year=1993)
        self.run_it()
        self.assertEqual(len(self.in_library()), 2, self.waiting())


class AfterTheSecondReview(unittest.TestCase):
    def test_the_micro_sign_typed_as_a_greek_letter_is_the_same_name(self):
        micro, mu, ohm, omega = chr(0xB5), chr(0x3BC), chr(0x2126), chr(0x3A9)
        self.assertEqual({keys.norm(micro + "-Ziq"), keys.norm(mu + "-Ziq"), keys.norm("-Ziq")}, {"ziq"})
        self.assertEqual(keys.norm("5 " + micro + "m"), keys.norm("5 " + mu + "m"))
        self.assertEqual(keys.norm(ohm + "mega"), keys.norm(omega + "mega"))
        self.assertTrue(resolve.same_title("5 " + mu + "m", "5 " + micro + "m"))

    def test_in_a_greek_word_they_are_letters(self):
        mikros = chr(0x39C) + chr(0x3B9) + chr(0x3BA) + chr(0x3C1) + chr(0x3CC) + chr(0x3C2)  # "Mikros"
        mikro = chr(0x3BC) + chr(0x3B9) + chr(0x3BA) + chr(0x3C1) + chr(0x3BF)  # "mikro", which starts with the small mu
        omega = chr(0x3A9) + chr(0x39C) + chr(0x395) + chr(0x393) + chr(0x391)  # "OMEGA"
        self.assertEqual(len(keys.norm(mikros)), 6)
        self.assertEqual(keys.norm(mikro)[0], chr(0x3BC))
        self.assertEqual(keys.norm(omega)[0], chr(0x3C9))

    def test_a_side_between_two_dashes_leaves_no_dash_on_the_title(self):
        for name, artist, title in (("Artist - (B1) - Song", "Artist", "Song"), ("Artist -(B1)- Song", "Artist", "Song"), ("Artist (B1) - Song", "Artist", "Song"),
                                    ("Scanners - (B2) A World Outside", "Scanners", "A World Outside"), ("Artist - Song (B1)", "Artist", "Song")):
            with self.subTest(name):
                got = read(name)
                self.assertEqual((got["artist"], got["title"]), (artist, title))

    def test_an_artist_with_the_name_again_in_brackets_is_that_artist(self):
        hangul = chr(0xBC29) + chr(0xD0C4) + chr(0xC18C) + chr(0xB144) + chr(0xB2E8)
        kino = chr(0x41A) + chr(0x438) + chr(0x43D) + chr(0x43E)
        self.assertTrue(curate.same_artist(f"BTS ({hangul})", "BTS"))
        self.assertTrue(curate.same_artist("BTS", f"BTS ({hangul})"))
        self.assertTrue(curate.same_artist(f"Kino ({kino})", "Kino"))
        self.assertFalse(curate.same_artist(f"BTS ({hangul})", "Kino"))
        self.assertFalse(curate.same_artist("(K)", "(J)"), "a name that is only a bracket is compared as it is")

    def test_a_title_given_in_three_alphabets_is_each_of_them(self):
        ge, pesnya = chr(0x6B4C), chr(0x41F) + chr(0x435) + chr(0x441) + chr(0x43D) + chr(0x44F)
        self.assertTrue(resolve.same_title(f"Song = {ge} = {pesnya}", "Song"))
        self.assertTrue(resolve.same_title(f"Song = {ge} = {pesnya}", pesnya))
        self.assertFalse(resolve.same_title(f"Song = {ge} = {pesnya}", "Another Song"))
        self.assertFalse(resolve.same_title("Love = Pain = Joy", "Love"), "three words in one alphabet are one title")


if __name__ == "__main__":
    unittest.main()
