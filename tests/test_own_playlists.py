"""Playlists made in the app or brought in from a file. Nothing here reaches the network."""
import http.client
import json
import os
import shutil
import sys
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from music_curator import own_playlists as own, spotify, webapp  # noqa: E402
from test_apply import Base  # noqa: E402
from test_webapp import write_mp3  # noqa: E402


def song(id_="a", artist="A", title="One", secs=300, area="library", file=None, folder="Acid", was=""):
    file = file or f"{artist} - {title}.mp3"
    return dict(id=id_, key=f"{area}/{folder}/{file}", artist=artist, title=title, secs=secs, area=area, file=file, was=was, _path=f"/music/{folder}/{file}")


def line(where, shown="", secs=None):
    return dict(where=where, shown=shown, secs=secs)


class ReadingTheFile(unittest.TestCase):
    def test_where_each_song_is_what_its_called_and_how_long_it_is(self):
        self.assertEqual(own.read_m3u("#EXTM3U\n#EXTINF:123,A - One\n/music/A - One.mp3\n"), [line("/music/A - One.mp3", "A - One", 123)])

    def test_a_plain_list_of_paths_is_enough(self):
        self.assertEqual(own.read_m3u("a.mp3\nb.mp3"), [line("a.mp3"), line("b.mp3")])

    def test_windows_line_endings(self):
        self.assertEqual(own.read_m3u("#EXTM3U\r\n#EXTINF:5,X\r\na.mp3\r\nb.mp3\r\n"), [line("a.mp3", "X", 5), line("b.mp3")])

    def test_old_mac_line_endings(self):
        self.assertEqual(len(own.read_m3u("a.mp3\rb.mp3\r")), 2)

    def test_a_byte_order_mark(self):
        self.assertEqual(own.read_m3u("\ufeffa.mp3"), [line("a.mp3")])

    def test_an_unknown_length_is_no_length(self):
        self.assertEqual(own.read_m3u("#EXTINF:-1,X\na.mp3"), [line("a.mp3", "X")])

    def test_a_length_of_zero_is_no_length(self):
        self.assertEqual(own.read_m3u("#EXTINF:0,X\na.mp3"), [line("a.mp3", "X")])

    def test_a_length_with_decimals(self):
        self.assertEqual(own.read_m3u("#EXTINF:61.5,X\na.mp3")[0]["secs"], 61.5)

    def test_extras_some_players_put_before_the_comma(self):
        self.assertEqual(own.read_m3u('#EXTINF:12 logo="x",A - One\na.mp3'), [line("a.mp3", "A - One", 12)])

    def test_a_comma_in_the_name_stays(self):
        self.assertEqual(own.read_m3u("#EXTINF:12,A, B - One\na.mp3")[0]["shown"], "A, B - One")

    def test_it_doesnt_matter_how_extinf_is_written(self):
        self.assertEqual(own.read_m3u("#extinf:12,X\na.mp3")[0]["shown"], "X")

    def test_other_notes_are_skipped(self):
        self.assertEqual(own.read_m3u("#EXTM3U\n#EXTALB:x\n# Saved by music-curator\n\n  \na.mp3"), [line("a.mp3")])

    def test_what_a_song_is_called_belongs_to_that_song_only(self):
        self.assertEqual(own.read_m3u("#EXTINF:5,X\na.mp3\nb.mp3")[1], line("b.mp3"))

    def test_a_line_longer_than_any_real_path_is_cut(self):
        self.assertEqual(len(own.read_m3u("x" * 100_000)[0]["where"]), own.LONGEST_LINE)

    def test_a_line_of_nothing_but_dashes_is_only_read_a_few_ways(self):
        self.assertEqual(len(own._ways_to_read("x - " * 5000)), own.READINGS + 1)


class FindingTheSong(unittest.TestCase):
    def find(self, entry, *songs):
        got = own.find(entry, own._library_index(songs))
        return got and got["id"]

    def test_by_the_file_name_wherever_the_playlist_thinks_it_is(self):
        self.assertEqual(self.find(line("/somewhere/else/A - One.mp3"), song()), "a")

    def test_by_the_full_path(self):
        self.assertEqual(self.find(line("/music/Acid/A - One.mp3"), song()), "a")

    def test_with_backslashes(self):
        self.assertEqual(self.find(line(r"D:\Music\Acid\A - One.mp3"), song()), "a")

    def test_from_the_playlists_own_folder(self):
        self.assertEqual(self.find(line("../Acid/A - One.mp3"), song()), "a")

    def test_upper_and_lower_case_dont_matter(self):  # a name that can't be read as artist and title, so only the file name can find it
        self.assertEqual(self.find(line("TRACK 01.MP3"), song(file="Track 01.mp3")), "a")

    def test_with_quotes_round_it(self):
        self.assertEqual(self.find(line('"Track 01.mp3"'), song(file="Track 01.mp3")), "a")

    def test_written_as_a_file_address(self):
        self.assertEqual(self.find(line("file:///D:/Music/A%20-%20One.mp3"), song()), "a")

    def test_file_address_with_a_hash_in_the_name(self):
        self.assertEqual(self.find(line("file:///D:/A #1.mp3"), song(file="A #1.mp3")), "a")

    def test_a_percent_sign_in_an_ordinary_path_is_just_that(self):
        self.assertEqual(self.find(line("/m/100%25.mp3"), song(file="100%25.mp3")), "a")

    def test_composed_and_decomposed_accents_are_the_same(self):
        self.assertEqual(self.find(line("Cafe\u0301 - One.mp3"), song(file="Caf\u00e9 - One.mp3")), "a")

    def test_by_the_name_it_had_before_it_was_curated(self):
        self.assertEqual(self.find(line(r"C:\old\one_FINAL_v2.mp3"), song(was="one_FINAL_v2.mp3")), "a")

    def test_todays_name_goes_before_an_old_one(self):
        self.assertEqual(self.find(line("x.mp3"), song("old", file="y.mp3", was="x.mp3"), song("now", file="x.mp3", was="z.mp3")), "now")

    def test_by_what_the_playlist_calls_it(self):
        self.assertEqual(self.find(line(r"C:\x\track01.mp3", "A - One"), song()), "a")

    def test_by_the_artist_and_title_in_the_file_name(self):
        self.assertEqual(self.find(line(r"C:\x\a - one.mp3"), song(file="other.mp3")), "a")

    def test_a_dash_in_the_title(self):
        self.assertEqual(self.find(line("x.mp3", "A - One - Two"), song(title="One - Two", file="y.mp3")), "a")

    def test_a_dash_in_the_artist(self):
        self.assertEqual(self.find(line("x.mp3", "A - B - One"), song(artist="A - B", file="y.mp3")), "a")

    def test_a_song_with_no_tags_by_its_file_name(self):
        self.assertEqual(self.find(line("x.mp3", "Mystery"), song(artist="", title="", file="Mystery.mp3")), "a")

    def test_a_web_address_has_no_file_to_go_by(self):
        self.assertIsNone(self.find(line("https://example.com/A - One.mp3"), song()))

    def test_a_web_address_can_still_say_what_it_is(self):
        self.assertEqual(self.find(line("https://example.com/stream", "A - One"), song()), "a")

    def test_a_length_that_is_close_is_fine(self):
        self.assertEqual(self.find(line("A - One.mp3", "", 306), song(secs=300)), "a")

    def test_a_very_different_length_is_another_version_even_with_the_same_file_name(self):
        self.assertIsNone(self.find(line("A - One.mp3", "", 400), song(secs=300)))

    def test_a_very_different_length_is_another_version_even_with_the_same_name(self):
        self.assertIsNone(self.find(line("x.mp3", "A - One", 400), song(secs=300, file="y.mp3")))

    def test_no_length_in_the_playlist_means_it_cant_rule_anything_out(self):
        self.assertEqual(self.find(line("A - One.mp3"), song(secs=300)), "a")

    def test_no_length_on_the_song_means_it_cant_rule_anything_out(self):
        self.assertEqual(self.find(line("A - One.mp3", "", 300), song(secs=None)), "a")

    def test_the_length_chooses_between_two_files_of_the_same_name(self):
        self.assertEqual(self.find(line("A - One.mp3", "", 500), song("short", secs=300, folder="Acid"), song("long", secs=500, folder="Techno")), "long")

    def test_the_folders_choose_between_two_files_of_the_same_name(self):
        self.assertEqual(self.find(line("Techno/A - One.mp3"), song("acid", folder="Acid"), song("techno", folder="Techno")), "techno")

    def test_the_library_goes_before_a_copy_waiting_elsewhere(self):
        self.assertEqual(self.find(line("A - One.mp3"), song("review", area="review", folder="Review"), song("lib", folder="Acid")), "lib")

    def test_nothing_like_it(self):
        self.assertIsNone(self.find(line("Nobody - Nothing.mp3", "Nobody - Nothing"), song()))

    def test_artist_and_title_arent_mixed_up(self):  # "Ab - C" and "A - Bc" are different songs
        self.assertIsNone(self.find(line("x.mp3", "Ab - C"), song(artist="A", title="Bc", file="y.mp3")))


class Remembering(unittest.TestCase):
    def test_the_very_file_goes_first(self):
        index = own._by_name([song("lib", file="one.mp3"), song("rev", area="review", file="two.mp3")])
        self.assertEqual(own._song_of(dict(key="a|one", name="", file="two.mp3"), index)["id"], "rev")

    def test_then_the_library(self):
        index = own._by_name([song("rev", area="review", file="two.mp3"), song("lib", file="one.mp3")])
        self.assertEqual(own._song_of(dict(key="a|one", name="", file=""), index)["id"], "lib")

    def test_nothing_of_that_name(self):
        self.assertIsNone(own._song_of(dict(key="z|z", name="", file=""), own._by_name([song()])))

    def test_what_a_saved_file_can_hold(self):
        kept = own.well_formed({"a": dict(name="Y", entries=[1, dict(key=1, name="x"), dict(key="k", name="N")]), "b": dict(name="X", entries="nope"), "c": "nope", "d": dict(name="", entries=[]), "e": dict(name=5, entries=[])})
        self.assertEqual(kept, {"a": dict(name="Y", entries=[dict(key="k", name="N", file="")])})

    def test_free_names(self):
        draft = {"a": dict(name="X"), "b": dict(name="x (2)")}
        self.assertEqual(own._free_name("X", draft), "X (3)")
        self.assertEqual(own._free_name("Y", draft), "Y")


class FromThePage(Base):
    def setUp(self):
        super().setUp()
        self.one = self.song("Acid", "A - One", notes="")
        self.two = self.song("Techno", "B - Two", notes="")
        self.three = self.song("Acid", "C - Three", notes="")
        self.saved = os.path.join(self.app, "own_playlists.json")
        self.out = os.path.join(self.root, "Out")
        self.server = webapp.Server(("127.0.0.1", 0), webapp.Handler)
        self.port = self.server.server_address[1]
        self.server.collection, self.server.hosts = webapp.Collection(webapp.app_paths()), {f"127.0.0.1:{self.port}"}
        self.server.collection.refresh()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = None if body is None else body if isinstance(body, str) else json.dumps(body)
        c.request(method, path, body=data, headers={**({"Content-Type": "application/json"} if data is not None else {}), **(headers or {})})
        r = c.getresponse()
        payload = r.read()
        c.close()
        return r.status, json.loads(payload) if payload.startswith(b"{") else payload

    def post(self, what, **body):
        return self.ask("POST", f"/api/playlists/{what}", body)

    def fine(self, what, **body):
        status, answer = self.post(what, **body)
        self.assertEqual(status, 200, answer)
        return answer

    def problem(self, what, **body):
        status, answer = self.post(what, **body)
        self.assertEqual(status, 400, answer)
        return answer["error"]

    def ids(self, *paths):
        self.server.collection.refresh()
        by_path = {s["_path"]: s["id"] for s in self.server.collection.songs.values()}
        return [by_path[p] for p in paths]

    def make(self, name, *paths):
        return self.fine("new", name=name, ids=self.ids(*paths))["made"]["id"]

    def lists(self):
        return self.ask("GET", "/api/all")[1]["meta"]["own_playlists"]

    def the_list(self):
        return self.lists()[0]

    # making them

    def test_a_new_playlist_starts_empty(self):
        self.make("Late Shift")
        self.assertEqual(self.lists(), [dict(self.the_list(), name="Late Shift", ids=[], away=[])])

    def test_each_playlist_has_its_own_id(self):
        self.assertNotEqual(self.make("A"), self.make("B"))

    def test_a_new_playlist_can_start_with_songs(self):
        self.make("Late Shift", self.two, self.one)
        self.assertEqual(self.the_list()["ids"], self.ids(self.two, self.one))

    def test_the_answer_has_the_playlists_as_they_are_now(self):
        self.assertEqual(self.fine("new", name="X")["lists"], self.lists())

    def test_the_answer_says_how_many_went_in(self):
        answer = self.fine("new", name="X", ids=self.ids(self.one, self.two))
        self.assertEqual((answer["added"], answer["already"]), (2, 0))

    def test_a_playlist_needs_a_name(self):
        for empty in ("", "   ", None, 5, ["x"]):
            with self.subTest(empty):
                self.assertIn("name", self.problem("new", name=empty))
        self.assertEqual(self.lists(), [])

    def test_two_playlists_cant_have_the_same_name(self):
        self.make("Late Shift")
        self.assertIn("already have", self.problem("new", name="late shift"))
        self.assertEqual(len(self.lists()), 1)

    def test_a_name_stays_on_one_line_and_isnt_endless(self):
        self.fine("new", name="  a\n  b\r\tc  ")
        self.assertEqual(self.the_list()["name"], "a b c")
        self.fine("new", name="x" * 500)
        self.assertEqual(max(len(p["name"]) for p in self.lists()), own.LONGEST_NAME)

    def test_they_come_a_to_z(self):
        self.make("beta")
        self.make("Alpha")
        self.make("gamma")
        self.assertEqual([p["name"] for p in self.lists()], ["Alpha", "beta", "gamma"])

    # adding and taking out

    def test_songs_go_in_at_the_end_in_the_order_given(self):
        made = self.make("X", self.two)
        self.fine("add", list=made, ids=self.ids(self.three, self.one))
        self.assertEqual(self.the_list()["ids"], self.ids(self.two, self.three, self.one))

    def test_a_song_isnt_put_in_twice(self):
        made = self.make("X", self.one)
        answer = self.fine("add", list=made, ids=self.ids(self.one, self.two))
        self.assertEqual((answer["added"], answer["already"]), (1, 1))
        self.assertEqual(self.the_list()["ids"], self.ids(self.one, self.two))

    def test_naming_a_song_twice_adds_it_once(self):
        made = self.make("X")
        a = self.ids(self.one)[0]
        self.assertEqual(self.fine("add", list=made, ids=[a, a])["added"], 1)

    def test_a_second_copy_of_a_song_counts_as_that_song(self):
        made = self.make("X", self.one)
        copy = write_mp3(os.path.join(self.review, "A - One.mp3"), artist="A", title="One", genre="Acid")
        self.assertEqual(self.fine("add", list=made, ids=self.ids(copy))["already"], 1)
        self.assertEqual(self.the_list()["ids"], self.ids(self.one))

    def test_two_copies_named_together_go_in_once(self):
        made = self.make("X")
        copy = write_mp3(os.path.join(self.review, "A - One.mp3"), artist="A", title="One", genre="Acid")
        answer = self.fine("add", list=made, ids=self.ids(self.one, copy))
        self.assertEqual((answer["added"], answer["already"]), (1, 1))

    def test_two_entries_that_end_up_as_one_song_show_once(self):
        other = write_mp3(os.path.join(self.lib, "Acid", "A - One (Copy).mp3"), artist="A", title="One", genre="Acid")
        self.make("X", self.one, other)
        self.assertEqual(len(self.the_list()["ids"]), 2)
        os.remove(other)
        self.assertEqual(self.the_list()["ids"], self.ids(self.one))

    def test_songs_it_doesnt_know_are_left_out(self):
        made = self.make("X")
        self.assertEqual(self.fine("add", list=made, ids=[*self.ids(self.one), "000000000000"])["added"], 1)

    def test_adding_nothing_is_a_mistake(self):
        made = self.make("X")
        for ids in ([], None, "x", [1], ["000000000000"]):
            with self.subTest(ids):
                self.assertIn("no songs", self.problem("add", list=made, ids=ids))

    def test_a_playlist_that_isnt_there(self):
        for what, extra in (("add", dict(ids=self.ids(self.one))), ("remove", dict(ids=self.ids(self.one))), ("rename", dict(name="New")), ("delete", {})):
            with self.subTest(what):
                self.assertIn("isn't there", self.problem(what, list="nope", **extra))

    def test_a_song_can_be_taken_out(self):
        made = self.make("X", self.one, self.two, self.three)
        self.fine("remove", list=made, ids=self.ids(self.two))
        self.assertEqual(self.the_list()["ids"], self.ids(self.one, self.three))

    def test_taking_a_song_out_leaves_the_song_alone(self):
        made = self.make("X", self.one)
        with open(self.one, "rb") as f:
            before = f.read()
        self.fine("remove", list=made, ids=self.ids(self.one))
        with open(self.one, "rb") as f:
            self.assertEqual(f.read(), before)

    # renaming and deleting

    def test_rename(self):
        made = self.make("Old")
        self.fine("rename", list=made, name="New")
        self.assertEqual(self.the_list()["name"], "New")

    def test_a_rename_can_change_just_the_capitals(self):
        made = self.make("late shift")
        self.fine("rename", list=made, name="Late Shift")
        self.assertEqual(self.the_list()["name"], "Late Shift")

    def test_a_rename_cant_take_another_playlists_name(self):
        self.make("Taken")
        made = self.make("Mine")
        self.assertIn("already have", self.problem("rename", list=made, name="taken"))

    def test_a_rename_needs_a_name(self):
        made = self.make("Mine")
        self.assertIn("name", self.problem("rename", list=made, name=" "))
        self.assertEqual(self.the_list()["name"], "Mine")

    def test_deleting_a_playlist_leaves_the_music(self):
        made = self.make("X", self.one)
        self.fine("delete", list=made)
        self.assertEqual(self.lists(), [])
        self.assertTrue(os.path.exists(self.one))
        self.assertEqual(len(self.ids(self.one)), 1)

    # what's kept, and how well

    def test_its_saved_next_to_the_log_and_nothing_half_written_stays(self):
        self.make("X", self.one)
        self.assertTrue(os.path.exists(self.saved))
        self.assertFalse(os.path.exists(self.saved + ".tmp"))

    def test_it_is_still_there_after_a_restart(self):
        self.make("X", self.one, self.two)
        self.server.collection = webapp.Collection(webapp.app_paths())
        self.assertEqual(self.the_list()["ids"], self.ids(self.one, self.two))

    def test_a_song_stays_in_when_it_moves_to_another_genre(self):
        self.make("X", self.one, self.two)
        moved = os.path.join(self.lib, "Techno", "A - One.mp3")
        shutil.move(self.one, moved)
        self.assertEqual(self.the_list()["ids"], self.ids(moved, self.two))

    def test_a_song_stays_in_when_a_better_copy_with_another_name_replaces_it(self):
        self.make("X", self.one)
        better = write_mp3(os.path.join(self.lib, "Acid", "A - One (Better).mp3"), frames=400, artist="A", title="One", genre="Acid")
        os.remove(self.one)
        self.assertEqual(self.the_list()["ids"], self.ids(better))

    def test_a_song_thats_gone_is_listed_as_not_here(self):
        self.make("X", self.one, self.two)
        holder = os.path.join(self.root, "held.mp3")
        shutil.move(self.one, holder)
        self.server.collection.refresh()
        listed = self.the_list()
        self.assertEqual((listed["ids"], listed["away"]), (self.ids(self.two), ["A - One"]))

    def test_and_it_takes_its_place_again_if_it_comes_back(self):
        self.make("X", self.one, self.two)
        holder = os.path.join(self.root, "held.mp3")
        shutil.move(self.one, holder)
        self.the_list()
        shutil.move(holder, self.one)
        listed = self.the_list()
        self.assertEqual((listed["ids"], listed["away"]), (self.ids(self.one, self.two), []))

    def test_the_songs_that_arent_here_can_be_taken_out_together(self):
        made = self.make("X", self.one, self.two)
        holder = os.path.join(self.root, "held.mp3")
        shutil.move(self.one, holder)
        self.server.collection.refresh()
        self.fine("remove", list=made, away=True)
        shutil.move(holder, self.one)  # it really was taken out, so it doesn't come back with the song
        listed = self.the_list()
        self.assertEqual((listed["ids"], listed["away"]), (self.ids(self.two), []))

    def test_taking_out_one_song_keeps_the_ones_that_arent_here(self):
        made = self.make("X", self.one, self.two)
        os.remove(self.one)
        self.server.collection.refresh()
        self.fine("remove", list=made, ids=self.ids(self.two))
        self.assertEqual(self.the_list()["away"], ["A - One"])

    def test_a_change_made_behind_the_pages_back_is_noticed(self):
        self.make("X")
        with open(self.saved, encoding="utf-8") as f:
            saved = json.load(f)
        next(iter(saved.values()))["name"] = "Edited"
        with open(self.saved, "w", encoding="utf-8") as f:
            json.dump(saved, f)
        self.assertEqual(self.the_list()["name"], "Edited")

    def test_a_file_that_cant_be_read_is_never_saved_over(self):
        for broken in ("{ not json", "[1, 2]"):
            with self.subTest(broken):
                with open(self.saved, "w", encoding="utf-8") as f:
                    f.write(broken)
                self.assertIn("can't be read", self.problem("new", name="X"))
                with open(self.saved, encoding="utf-8") as f:
                    self.assertEqual(f.read(), broken)

    def test_one_that_stops_being_readable_isnt_saved_over_either(self):
        made = self.make("X")
        with open(self.saved, "w", encoding="utf-8") as f:
            f.write("{ not json")
        self.assertIn("can't be read", self.problem("rename", list=made, name="Y"))
        with open(self.saved, encoding="utf-8") as f:
            self.assertEqual(f.read(), "{ not json")

    def test_a_save_that_fails_changes_nothing(self):
        self.make("X")
        with mock.patch.object(own.os, "replace", side_effect=OSError(28, "No space left")):
            self.assertIn("Couldn't save", self.problem("new", name="Y"))
        self.assertEqual([p["name"] for p in self.lists()], ["X"])

    def test_a_save_that_fails_halfway_leaves_the_file_as_it_was(self):
        self.make("X")
        with open(self.saved, encoding="utf-8") as f:
            before = f.read()
        with mock.patch.object(own.json, "dump", side_effect=OSError(28, "No space left")):
            self.assertIn("Couldn't save", self.problem("new", name="Y"))
        with open(self.saved, encoding="utf-8") as f:
            self.assertEqual(f.read(), before)

    # importing

    def bring(self, text, name="Imported"):
        return self.fine("import", name=name, text=text)

    def test_import_finds_the_songs_and_keeps_their_order(self):
        answer = self.bring(f"#EXTM3U\n{self.three}\n{self.one}\n")
        self.assertEqual((answer["found"], answer["total"], answer["missing"], answer["more"]), (2, 2, [], 0))
        self.assertEqual(self.the_list()["ids"], self.ids(self.three, self.one))

    def test_the_new_playlist_is_named_after_the_file(self):
        answer = self.bring(self.one, name="Road Trip")
        self.assertEqual(answer["made"]["name"], "Road Trip")
        self.assertEqual(self.the_list()["id"], answer["made"]["id"])

    def test_a_file_with_no_name_still_gets_one(self):
        self.assertEqual(self.bring(self.one, name="")["made"]["name"], "Imported playlist")

    def test_import_says_which_songs_it_couldnt_find(self):
        answer = self.bring(f"{self.one}\n#EXTINF:100,Nobody - Nothing\nC:\\x\\track.mp3\nC:\\x\\Somebody - Something.mp3\n")
        self.assertEqual((answer["found"], answer["total"], answer["missing"]), (1, 3, ["Nobody - Nothing", "Somebody - Something"]))

    def test_songs_it_couldnt_find_are_listed_as_not_here(self):
        self.bring(f"{self.one}\nNobody - Nothing.mp3\n")
        self.assertEqual(self.the_list()["away"], ["Nobody - Nothing"])

    def test_a_song_that_turns_up_later_takes_its_place(self):
        self.bring(f"{self.one}\nC:\\x\\Nobody - Nothing.mp3\n{self.two}\n")
        late = write_mp3(os.path.join(self.lib, "Acid", "Nobody - Nothing.mp3"), artist="Nobody", title="Nothing", genre="Acid")
        listed = self.the_list()
        self.assertEqual((listed["ids"], listed["away"]), (self.ids(self.one, late, self.two), []))

    def test_a_long_list_of_missing_songs_is_cut_short_on_the_page(self):
        lines = "\n".join(f"Nobody - Song {n}.mp3" for n in range(own.MAX_LISTED + 7))
        answer = self.bring(f"{self.one}\n{lines}")
        self.assertEqual((len(answer["missing"]), answer["more"], answer["total"]), (own.MAX_LISTED, 7, own.MAX_LISTED + 8))
        self.assertEqual(len(self.the_list()["away"]), own.MAX_LISTED + 7)

    def test_a_song_listed_twice_counts_once(self):
        answer = self.bring(f"{self.one}\n{self.one}\n{self.two}\nNobody.mp3\nNobody.mp3\n")
        self.assertEqual((answer["found"], answer["total"]), (2, 3))

    def test_an_import_never_replaces_a_playlist_you_have(self):
        self.make("Road Trip", self.two)
        self.assertEqual(self.bring(self.one, name="road trip")["made"]["name"], "road trip (2)")
        self.assertEqual(sorted(len(p["ids"]) for p in self.lists()), [1, 1])

    def test_an_import_with_none_of_your_songs_makes_nothing(self):
        self.assertIn("None of the songs", self.problem("import", name="X", text="Nobody - Nothing.mp3\nSomebody.mp3"))
        self.assertEqual(self.lists(), [])

    def test_something_that_isnt_a_playlist_makes_nothing(self):
        self.assertIn("None of the songs", self.problem("import", name="X", text="\x00\x01 binary junk \xff\nmore junk"))
        self.assertEqual(self.lists(), [])

    def test_an_empty_file(self):
        self.assertIn("no songs", self.problem("import", name="X", text="#EXTM3U\n"))

    def test_only_text_can_be_imported(self):
        for wrong in (None, 5, ["a"]):
            with self.subTest(wrong):
                self.assertIn("isn't a playlist", self.problem("import", name="X", text=wrong))

    def test_a_file_outside_your_folders_is_not_brought_in(self):  # whatever a playlist points at, only songs the app already knows can match
        outside = write_mp3(os.path.join(self.root, "Elsewhere", "Z - Zed.mp3"), artist="Z", title="Zed", genre="Acid")
        self.assertIn("None of the songs", self.problem("import", name="X", text=outside))
        self.assertNotIn(outside, [s["_path"] for s in self.server.collection.songs.values()])

    def test_a_song_added_just_now_is_found(self):  # the library is read again first
        late = write_mp3(os.path.join(self.lib, "Acid", "New - Song.mp3"), artist="New", title="Song", genre="Acid")
        self.assertEqual(self.bring(late)["found"], 1)

    def test_a_long_playlist_fits(self):  # far over the limit other requests have
        lines = "\n".join(f"C:\\Users\\someone\\Music\\Some Folder\\Nobody - Song number {n}.mp3" for n in range(3000))
        self.assertGreater(len(lines), 150_000)
        self.assertEqual(self.bring(f"{self.one}\n{lines}")["total"], 3001)

    # along with what was already there

    def test_save_as_files_includes_them(self):
        self.make("Late Shift", self.three, self.one)
        status, answer = self.ask("POST", "/api/export/playlists", dict(folder=self.out))
        self.assertEqual((status, answer["saved"]), (200, 1))
        with open(os.path.join(self.out, "Late Shift.m3u8"), encoding="utf-8") as f:
            lines = f.read().splitlines()
        self.assertEqual([x.rsplit("/", 1)[-1] for x in lines if not x.startswith("#")], ["C - Three.mp3", "A - One.mp3"])

    def test_what_save_as_files_writes_comes_back_the_same(self):
        self.make("Late Shift", self.three, self.one, self.two)
        self.ask("POST", "/api/export/playlists", dict(folder=self.out))
        with open(os.path.join(self.out, "Late Shift.m3u8"), encoding="utf-8") as f:
            self.assertEqual(self.bring(f.read(), name="Late Shift")["made"]["name"], "Late Shift (2)")
        names = {p["name"]: p["ids"] for p in self.lists()}
        self.assertEqual(names["Late Shift (2)"], names["Late Shift"])

    def test_an_exported_list_comes_back_too(self):
        text = self.ask("POST", "/api/export/list", dict(ids=self.ids(self.two, self.one), format="m3u"))[1]["text"]
        self.bring(text)
        self.assertEqual(self.the_list()["ids"], self.ids(self.two, self.one))

    def test_an_empty_playlist_isnt_saved_as_a_file(self):
        self.make("Empty")
        self.make("Full", self.one)
        self.ask("POST", "/api/export/playlists", dict(folder=self.out))
        self.assertEqual(os.listdir(self.out), ["Full.m3u8"])

    def test_with_nothing_to_save_it_says_so(self):
        self.make("Empty")
        status, answer = self.ask("POST", "/api/export/playlists", dict(folder=self.out))
        self.assertEqual(status, 400)
        self.assertIn("no playlists", answer["error"])

    def test_one_with_the_name_of_a_spotify_playlist_gets_its_own_file(self):
        self.make("Rave", self.one)
        with open(spotify.cache_path(self.server.collection.paths), "w", encoding="utf-8") as f:
            json.dump({"p": dict(name="Rave", entries=[dict(name="Two", artists=["B"], album="", secs=1, local=True, uri="x")])}, f)
        self.ask("POST", "/api/export/playlists", dict(folder=self.out))
        self.assertEqual(sorted(os.listdir(self.out)), ["Rave (2).m3u8", "Rave.m3u8"])

    def test_spotify_playlists_are_left_as_they_are(self):
        with open(spotify.cache_path(self.server.collection.paths), "w", encoding="utf-8") as f:
            json.dump({"p": dict(name="Rave", entries=[dict(name="Two", artists=["B"], album="", secs=1, local=True, uri="x")])}, f)
        self.make("Mine", self.one)
        meta = self.ask("GET", "/api/all")[1]["meta"]
        self.assertEqual([p["name"] for p in meta["my_playlists"]], ["Rave"])
        self.assertEqual([p["name"] for p in meta["own_playlists"]], ["Mine"])

    # who can ask

    def test_another_site_cant_change_them(self):
        self.assertEqual(self.ask("POST", "/api/playlists/new", dict(name="X"), headers={"Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.ask("POST", "/api/playlists/new", dict(name="X"), headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.lists(), [])

    def test_only_json(self):
        self.assertEqual(self.ask("POST", "/api/playlists/new", '{"name": "X"}', headers={"Content-Type": "text/plain"})[0], 415)

    def test_only_what_the_page_uses(self):
        self.assertEqual(self.post("nope", name="X")[0], 404)
        self.assertEqual(self.ask("GET", "/api/playlists/new")[0], 404)

    def test_there_are_limits_on_size(self):  # small limits here: the server stops reading a body that's too big, and with a huge one the sender's side then fails at random
        with mock.patch.object(webapp, "EXPORT_BODY_MAX", 1000), mock.patch.object(webapp, "IMPORT_BODY_MAX", 5000):
            self.assertEqual(self.ask("POST", "/api/playlists/add", json.dumps(dict(pad="x" * 2000)))[0], 413)
            self.assertEqual(self.ask("POST", "/api/playlists/import", json.dumps(dict(pad="x" * 6000)))[0], 413)
            self.assertEqual(self.ask("POST", "/api/playlists/import", json.dumps(dict(pad="x" * 2000)))[0], 400)  # within an import's own limit


if __name__ == "__main__":
    unittest.main()
