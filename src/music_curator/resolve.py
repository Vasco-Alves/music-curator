#!/usr/bin/env python3
"""Resolve inbox items against Discogs and decide every tag automatically (see RULES.md).

Usage: curator resolve <items.json> <out.json>
Status per item: ready | review | notfound | dup
"""
import csv
import json
import os
import re
import sys
import unicodedata

from . import config, tagwriter
from . import discogs as d
from .keys import norm, words

PARENTS = {
    "Trance": {"Hard Trance", "Goa Trance", "Psy-Trance", "Progressive Trance", "Tech Trance"},
    "Techno": {"Hard Techno", "Dub Techno", "Minimal Techno", "Acid Techno", "Detroit Techno"},
    "House": {"Deep House", "Acid House", "Tech House", "Hard House", "Progressive House", "Euro House",
              "Garage House", "Italo House", "Hip-House", "Ghetto House", "Chicago House"},
    "Hardcore": {"Gabber", "Happy Hardcore", "Speedcore", "Breakcore", "Terrorcore", "Frenchcore", "J-Core",
                 "UK Hardcore", "Makina"},
}
ORIGINAL_WORDS = {"original", "originalmix", "originalversion", "original12", "originalclubmix", "mainmix"}


def plain(s):
    """Like norm, but every letter counts, the Latin ones that norm leaves out too: "Mø" is mø here."""
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[\W_]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def _no_notes(s):
    return re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", s or "")


def _either_way(title):
    """A title, and each half of one Discogs gives in two alphabets: "Cyclick = サイクリック". "Love = Pain" is one title, and so is "Cry ツ = Smile":
    one half has to be in Latin letters and the other to have none, whatever notes come after them."""
    halves = (title or "").split(" = ")
    if len(halves) > 1:  # (it can be given in three: "Song = 歌 = Песня")
        keys = [norm(_no_notes(h)) for h in halves]
        latin, others = [k for k in keys if k.isascii()], [k for k in keys if not k.isascii()]
        if len(latin) == 1 and latin[0] and others and not any("a" <= c <= "z" for k in others for c in k):
            return [title, *halves]
    return [title]


def _untitled(title):
    """Is this the name of a track with no name? Discogs may give the word in two alphabets too: "Untitled = 無題"."""
    return norm(one_script(title or "", all_latin_too=False)) == "untitled"


def same_title(track_title, searched):
    """Is this track the song searched for, whatever its mix? 東京 and 大阪 are not the same title."""
    want = d.base_title(searched)
    if want:
        return any(d.base_title(t) == want or want == norm(t) for t in _either_way(track_title))
    return bool(plain(_no_notes(searched))) and plain(_no_notes(track_title)) == plain(_no_notes(searched))


def tokens(s):
    return {t for t in words(s) if (len(t) > 1 or not t.isascii()) and t not in {"dj", "the", "and", "feat", "vs", "mc"}}  # one letter says nothing, but 花 is a whole name


def secs(dur):
    return d.dur_to_sec(dur)


def year_of(r):
    y = str(r.get("year") or "")
    return int(y) if y.isdigit() and int(y) > 0 else 9999


def artist_ok(parsed, discogs_text):
    a, b = norm(parsed), norm(discogs_text)
    if not a or not b:
        return False
    if b == "various":  # nobody in particular: that "Io" or "Ari" is inside the word says nothing about whose track it is
        return a == b
    if a in b or b in a:
        return True
    ta, tb = tokens(parsed), tokens(discogs_text)
    return bool(ta) and len(ta & tb) / len(ta) >= 0.5


def result_artist(r):
    t = r.get("title") or ""
    return re.sub(r"\*", "", t.split(" - ")[0]) if " - " in t else ""


def artists_text(arts):
    return " ".join(f"{a.get('name', '')} {a.get('anv', '')}" for a in arts or [])


def credit(arts):
    names = []
    for a in arts or []:
        n = d.clean_name(a.get("anv") or a.get("name"))
        if n and n not in names:
            names.append(n)
    return unify_joiners(config.rule("artist_joiner").join(names))


def unify_joiners(artist):
    """'A And B', 'A + B', 'A vs. B', 'A feat. B' and 'A x B' (one Discogs name for a duo) use the configured joiner too.
    Only a small x joins two names: the big one in "Mr. X & Mr. Y" or "Planet X Crew" is part of a name."""
    if config.rule("and_to_joiner"):
        artist = re.sub(r"\s+(?:And|\+|x|(?i:vs\.?|versus|feat\.?|ft\.?|featuring))\s+", config.rule("artist_joiner"), artist or "")
    return artist


def paren(title):
    m = re.search(r"\(([^()]*)\)\s*$", title or "")
    return m.group(1) if m else ""


def _at_word_start(squashed, text):
    """Is this in the text once spaces are gone, starting where one of its words starts? "bmix" is inside "clubmix", but "B Mix" isn't "Club Mix"."""
    said, at, starts = words(text), 0, []
    for word in said:
        starts.append(at)
        at += len(word)
    joined = "".join(said)
    return any(joined.startswith(squashed, start) for start in starts)


def mix_matches(mix, discogs_title):
    """Does the version named in the filename match this Discogs track title?"""
    text = paren(discogs_title)
    p, m = norm(text), norm(mix)
    if not m:
        return False
    if not (m.isascii() and p.isascii()):  # the loose ways of matching below only know Latin letters and words. In another alphabet a mix has to be called the same
        return m == p
    if m in ORIGINAL_WORDS and (p == "" or "original" in p):
        return True
    for w in ("remix", "mix", "version", "edit", "the"):
        m2 = m.replace(w, "")
        if len(m2) >= 3 and not m2.isdigit() and _at_word_start(m2, text):  # one or two letters left over would match almost anything, and so would a number by itself: "303 Mix" is not "303 Dub"
            return True
    generic = {"remix", "mix", "edit", "version", "dub", "vocal", "instrumental", "radioedit", "rmx"}
    return _at_word_start(m, text) or bool(p and p not in generic and _at_word_start(p, mix))


def album_for(rel):
    descs = [x for f in rel["formats"] for x in (f.get("desc") or [])]
    real = [t for t in rel["tracklist"] if (t.get("type") in (None, "track"))]
    # untitled sides are different tracks, not mixes of one song
    distinct = {d.base_title(t["title"]) + (t.get("pos") or "" if _untitled(t["title"]) else "") for t in real}
    if any(x in descs for x in ("Single", "Maxi-Single")):
        album, why = "", "Discogs says single"
    elif any(x in descs for x in ("EP", "Album", "LP", "Mini-Album", "Compilation")):
        album, why = rel["title"], "Discogs says " + next(x for x in descs if x in ("EP", "Album", "LP", "Mini-Album", "Compilation"))
    elif len(distinct) <= 1 or len(real) <= 3:
        album, why = "", f"{len(real)}-track single"
    else:
        album, why = rel["title"], f"{len(real)} tracks, so EP"
    if not album and config.rule("album_for_singles") and "single" in why:
        album, why = rel["title"], why + " (album_for_singles is on)"
    if _untitled(album):
        album, why = "", "record is untitled"
    parts = [d.base_title(p) for p in album.split(" / ")] if " / " in album else []
    if parts and all(p in distinct for p in parts):
        album, why = "", "record is just named after its tracks"
    return one_script(album), why


def one_script(s, all_latin_too=True):
    """Discogs writes translated titles as 'A = B' ('Cyclick = サイクリック', '危ないベースライン = Bassline Crisis'):
    keep the Latin-script part, else the first part. With all_latin_too off, 'Love = Pain' stays whole: it may just be the title."""
    if " = " not in (s or ""):
        return s
    parts = [p.strip() for p in s.split(" = ") if p.strip()]
    latin = [p for p in parts if sum(c.isascii() and c.isalpha() for c in p) >= 0.5 * sum(c.isalpha() for c in p)]
    if not all_latin_too and len(latin) == len(parts):
        return s
    return (latin or parts)[0]


def clean_title(title, pos, artist):
    """Move '(feat. X)' into the artist, use '&' inside remix credits, number untitled sides."""
    title = one_script(title, all_latin_too=False).strip()  # Discogs titles sometimes end in a stray space
    m = re.search(r"\s*\((?:feat\.?|ft\.?|featuring)\s+([^()]+)\)", title, re.I)
    if m:
        artist = f"{artist}{config.rule('artist_joiner')}{m.group(1).strip()}"
        title = (title[: m.start()] + title[m.end():]).strip()
    title = re.sub(r"\(([^()]*)\)", lambda mm: "(" + re.sub(r"\s+(?:vs\.?|versus|feat\.?|ft\.?|featuring)\s+", config.rule("artist_joiner"), mm.group(1), flags=re.I) + ")", title)
    if norm(title) == "untitled" and pos:
        title = f"Untitled ({pos})"
    return title, artist


def pick_genre(group_results, rel, artist, history, preferred=None):
    votes, order = {}, []
    for r in group_results:
        for s in r.get("style") or []:
            votes[s] = votes.get(s, 0) + 1
    for s in rel.get("styles") or []:
        if s not in order:
            order.append(s)
        votes.setdefault(s, 1)
    cands = set(votes)
    for parent, kids in PARENTS.items():
        if parent in cands and cands & kids:
            cands.discard(parent)
    if not cands:
        return None, [], False, "no style on Discogs"
    options = sorted(cands, key=lambda s: (-votes[s], order.index(s) if s in order else 99))
    if config.rule("prefer_existing_genre"):
        for p in preferred or []:
            if p and p in cands:
                return p, options, False, "kept your existing genre"
    prev = history.get(norm(artist))
    if prev in cands:
        return prev, options, False, f"same as your other {artist} track"
    top = [s for s in options if votes[s] == votes[options[0]]]
    if len(top) == 1:
        return top[0], options, False, "most pressings agree" if len(options) > 1 else "only style"
    if config.rule("prefer_existing_genre"):  # a tie goes to the style closest to your genre: its parent, else its one tied sibling
        for p in preferred or []:
            kids = [s for s in top if s in PARENTS.get(p, ())]  # your genre is a parent (Trance): its one tied child
            if len(kids) == 1:
                return kids[0], options, False, f"tie settled by your genre ({kids[0]} is a kind of {p})"
            parent = next((par for par, kids in PARENTS.items() if p in kids), None)
            if not parent:
                continue
            if parent in top:
                return parent, options, False, f"tie settled by your genre ({parent} is the parent of {p})"
            sibs = [s for s in top if s in PARENTS[parent]]
            if len(sibs) == 1:
                return sibs[0], options, False, f"tie settled by your genre ({sibs[0]} is in the same family as {p})"
    return top[0], options, True, "toss-up"


def option(t, rel, it):
    """One version on the record, named the way it would be written, for someone to choose by ear."""
    base = credit(t["artists"] or rel["artists"]) if (t["artists"] or rel["artists"]) else it.get("artist", "")
    if norm(base) == "various":
        base = credit(t["artists"]) if t["artists"] else it.get("artist", "")
    title, artist = clean_title(t["title"], t.get("pos"), base)
    length = secs(t["dur"])
    return {"pos": t.get("pos") or "", "artist": artist, "title": title, "dur": t["dur"] or "", "gap": round(it["secs"] - length) if length and it["secs"] else None}


def resolve(it, history, library_keys):
    out = {"key": it["key"], "src": it["src"], "file": it["file"], "secs": it["secs"], "kbps": it["kbps"],
           "status": "notfound", "reasons": [], "notes": []}
    sa, st = it.get("search_artist") or "", it.get("search_title") or ""
    tries = []
    if sa:
        tries += [dict(artist=sa, track=st), dict(q=f"{sa} {st}")]
        if it.get("alt_artist"):
            tries += [dict(artist=it["alt_artist"], track=st)]
    else:
        tries += [dict(q=st), dict(track=st)]
    results = []
    for t in tries:
        res = d.search(**t)
        good = [r for r in res if (sa and artist_ok(sa, result_artist(r))) or result_artist(r) == "Various"
                or (not sa)]
        if good:
            results = good
            break
    if not results:
        out["reasons"].append("not found on Discogs")
        return out

    noncomp = [r for r in results if not d.is_comp(r.get("format")) and result_artist(r) != "Various"]
    comp = [r for r in results if r not in noncomp]
    groups = {}
    for r in noncomp:
        groups.setdefault(r.get("master_id") or f"r{r['id']}", []).append(r)
    ordered = sorted(groups.items(), key=lambda kv: min(year_of(r) for r in kv[1]))
    if not ordered and comp:
        ordered = [(f"r{r['id']}", [r]) for r in sorted(comp, key=year_of)[:2]]

    fetched = []
    special = ("Promo", "White Label", "Test Pressing", "Mispress")
    for mkey, rs in ordered[:3]:
        # read data from a regular pressing when one exists (promos/test pressings can differ); the
        # year still comes from the earliest pressing of any kind
        rs.sort(key=lambda r: (any(x in (r.get("format") or []) for x in special), year_of(r)))
        rel = d.get(f"/releases/{rs[0]['id']}")
        if not rel:
            continue
        c = d.cond_release(rel)
        matches = []
        for t in c["tracklist"]:
            if t.get("type") not in (None, "track"):
                continue
            if not same_title(t["title"], st):
                continue
            arts = t["artists"] or c["artists"]
            if sa and not artist_ok(sa, artists_text(arts)) and not artist_ok(it.get("artist", sa), artists_text(arts)):
                continue
            matches.append(t)
        if matches:
            fetched.append((mkey, rs, c, matches))
    if not fetched:
        out["reasons"].append("artist found on Discogs, but not this track")
        out["candidates"] = [r["title"] for r in results[:5]]
        return out

    mix = it.get("mix")
    chosen_group = fetched[0]
    if mix:
        hit = next((g for g in fetched if any(mix_matches(mix, t["title"]) for t in g[3])), None)
        if not hit:
            # the named mix may sit on another pressing or a later record: look further (bounded)
            extra_fetches = 0
            for mkey2, rs2 in ordered:
                for r2 in sorted(rs2, key=year_of)[:4]:
                    if extra_fetches >= 8 or any(g[2]["id"] == r2["id"] for g in fetched):
                        continue
                    rel2 = d.get(f"/releases/{r2['id']}")
                    extra_fetches += 1
                    if not rel2:
                        continue
                    c2 = d.cond_release(rel2)
                    m2 = [t for t in c2["tracklist"] if t.get("type") in (None, "track")
                          and same_title(t["title"], st) and mix_matches(mix, t["title"])]
                    if m2:
                        hit = (mkey2, rs2, c2, [t for t in c2["tracklist"] if t.get("type") in (None, "track")
                                                and same_title(t["title"], st)])
                        break
                if hit:
                    break
        if hit:
            chosen_group = hit
    mkey, rs, rel, versions = chosen_group
    out["options"] = [option(t, rel, it) for t in versions]
    track, how, probable, mix_conflict = None, None, None, False
    if mix:
        mm = [t for t in versions if mix_matches(mix, t["title"])]
        if len(mm) == 1:
            track, how = mm[0], "mix name matches"
        elif not mm:
            mix_conflict = True
    if not track and _untitled(versions[0]["title"]) and len(versions) > 1:
        side = [t for t in versions if (t.get("pos") or "").upper() == (it.get("pos_hint") or "").upper()]
        if len(side) == 1:
            track, how = side[0], f"untitled track, side {side[0]['pos']} as in your filename"
        else:
            mix_conflict = True  # several untitled sides and no side in the filename: can't tell
    if not track and not mix_conflict and len(versions) == 1:
        track, how = versions[0], "only version on the record"
    if not track and len({t["title"] for t in versions}) == 1 and not mix_conflict:
        track, how = versions[0], f"{len(versions)} tracks on the record share this exact title"
    if not track:
        timed = [(t, abs(secs(t["dur"]) - it["secs"])) for t in versions if secs(t["dur"])]
        close = [t for t, dd in timed if dd <= 6]
        if len(close) == 1 and (not mix_conflict or len(timed) >= 2):
            track = close[0]
            how = "length matches" + (f" (file says '{mix}')" if mix_conflict else "")
            mix_conflict = False
    if not track:
        unmixed = [t for t in versions if not paren(t["title"])]
        probable = unmixed[0]["title"] if (len(unmixed) == 1 and not mix) else None
        out["status"] = "review"
        listing = "; ".join(f"{t['pos']} {t['title']} [{t['dur'] or '?'}]" for t in versions)
        if mix_conflict:
            out["reasons"].append(f"file says '{mix}', Discogs has: {listing}")
        else:
            out["reasons"].append(f"{len(versions)} versions on the record, can't tell which this is: {listing}")
        out["probable"] = probable
        track = None

    out["release"] = rel["id"]
    out["master"] = rel.get("master_id")
    out["discogs"] = (f"https://www.discogs.com/master/{rel['master_id']}" if rel.get("master_id")
                      else f"https://www.discogs.com/release/{rel['id']}")
    out["release_title"] = rel["title"]
    out["labels"] = "; ".join(f"{l['name']} {l['catno']}" for l in rel["labels"][:2])
    years = [year_of(r) for r in rs if year_of(r) < 9999]
    year = min(years) if years else (rel.get("year") or 0)
    out["year"] = year
    if not year:
        out["status"] = "review"
        out["reasons"].append("no year on Discogs")
    album, album_why = album_for(rel)
    out["album"], out["album_why"] = album, album_why

    base_artist = credit(track["artists"] if (track and track["artists"]) else rel["artists"]) if rel["artists"] else it.get("artist", "")
    if norm(base_artist) == "various":
        base_artist = credit(track["artists"]) if track and track["artists"] else it.get("artist", "")
    t_title = track["title"] if track else (versions[0]["title"])
    title, artist = clean_title(t_title, (track or versions[0]).get("pos"), base_artist)
    out["artist"], out["title"] = artist, title
    out["how"] = how
    if track and secs(track["dur"]):
        diff = round(it["secs"] - secs(track["dur"]))
        out["dur_diff"] = diff
        if abs(diff) > 90:
            out["status"] = "review"
            out["reasons"].append(f"file is {abs(diff)}s {'longer' if diff > 0 else 'shorter'} than the record ({track['dur']}): different edit?")
        elif abs(diff) > 20:
            out["notes"].append(f"rip is {abs(diff)}s {'longer' if diff > 0 else 'shorter'} than the record ({track['dur']})")
            if diff < 0:
                out["better_copy"] = "cut short"
    if it["kbps"] and it["kbps"] < 128:
        out["better_copy"] = out.get("better_copy") or f"low quality ({it['kbps']} kbps)"

    genre, options, toss, gwhy = pick_genre(rs, rel, artist, history, preferred=[it.get("tag_genre"), it.get("folder_genre")])
    out["genre"], out["genre_options"], out["toss_up"], out["genre_why"] = genre, options, toss, gwhy
    if not genre:
        out["status"] = "review"
        out["reasons"].append("no style on Discogs")

    imgs = sorted(rel.get("images") or [], key=lambda i: 0 if i.get("type") == "primary" else 1)
    if not imgs:
        for r in rs[1:3]:
            other = d.get(f"/releases/{r['id']}")
            imgs = sorted((other or {}).get("images") or [], key=lambda i: 0 if i.get("type") == "primary" else 1)
            if imgs:
                break
    out["cover_url"] = imgs[0]["uri"] if imgs else None
    if not imgs:
        out["notes"].append("no image on Discogs")

    key = plain(f"{artist} - {title}")
    loose = "~" + plain(re.sub(r"\([^()]*\)", "", f"{artist} - {title}"))
    if key in library_keys:
        out["status"] = "dup"
        out["reasons"].append("already in library: " + library_keys[key])
    elif out["status"] != "review" and loose in library_keys and mix is None and not paren(title):
        out["status"] = "dup"
        out["reasons"].append("probably already in library: " + library_keys[loose])
    if not sa and out["status"] in ("notfound", "ready"):  # a bare title matches anything with that name
        out["status"] = "review"
        out["reasons"].append(f"no artist in the file name or tags: the title-only match ({artist} - {title}) needs checking")
    if out["status"] == "notfound":
        out["status"] = "ready"
    if out["status"] == "ready" and genre:
        history.setdefault(norm(artist), genre)
    return out


def load_history(log_path, settled_only=False):
    """{artist: the genre you last gave them}, from the log. settled_only leaves out genres that are still a toss-up nobody has judged."""
    history = {}
    if os.path.exists(log_path):
        newest = {}  # a song written twice counts once, as it is now: the person may have changed its genre
        with open(log_path, encoding="utf-8-sig", errors="replace", newline="") as f:
            for n, r in enumerate(csv.DictReader(f, restval="")):
                if r.get("status") == "ok":
                    newest[r.get("src") or n] = r
                elif (r.get("status") or "").startswith(tagwriter.TAKEN_BACK):
                    newest.pop(r.get("src"), None)  # the match was wrong, so what it said about the artist doesn't count
        for r in newest.values():
            if not (settled_only and "genre toss-up" in (r.get("notes") or "").lower()):
                history.setdefault(norm(r.get("artist")), r.get("genre"))
    return history


def remember_in_library(library_keys, name, path):
    library_keys.setdefault(plain(name), path)
    library_keys.setdefault("~" + plain(re.sub(r"\([^()]*\)", "", name)), path)  # a separate key: "A - Song" isn't "A - Song (Club Mix)", only probably the same


def load_library_keys(libs):
    library_keys = {}
    for lib in libs:
        for dp, _, fns in os.walk(lib):
            for fn in fns:
                if fn.lower().endswith((".mp3", ".wav", ".flac", ".m4a")):
                    remember_in_library(library_keys, os.path.splitext(fn)[0], os.path.join(dp, fn))
    return library_keys


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    items_path, out_path, log_path, cache = argv[0:4]
    libs = argv[4:]
    d.CACHE_DIR = cache
    items = json.load(open(items_path, encoding="utf-8"))
    history, library_keys = load_history(log_path), load_library_keys(libs)
    results = []
    for n, it in enumerate(items, 1):
        try:
            r = resolve(it, history, library_keys)
        except Exception as ex:  # noqa: BLE001
            r = {"key": it["key"], "src": it["src"], "file": it["file"], "status": "review",
                 "reasons": [f"lookup error: {ex}"], "notes": []}
        results.append(r)
        print(f"[{n}/{len(items)}] {r['status']:<8} {it['file'][:70]}", flush=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
