# AGENTS.md — music-curator

Instructions for an AI agent (Claude Code, Codex, Cursor, Gemini CLI, …) helping a person curate their
local music library with this toolkit. Humans: see `README.md`.

## What you are doing

The person has music files (often downloads with messy names and tags). Your job is to turn each one into a
verified library entry: the right artist, title (with the exact mix/version), album, year, genre and cover,
saved as a clean copy in their library folder, with every change logged. You decide only what the
evidence settles; everything else goes to the person as a short, clear question or a "held back" list.

The `curator` CLI does the deterministic work (API lookups, fingerprints, tag writing). You supply judgment:
reading results, spotting wrong matches, choosing which check to run next, and talking to the person.

## Ground rules

1. **Never modify originals.** Source files and the person's existing library are read-only. `curator write`
   only creates new files under `[paths] library` and appends to the log.
2. **Never delete without explicit permission** for that specific action. When allowed, move to the
   Recycle Bin / trash, not a permanent delete, and verify the library copy exists first.
3. **Certain or held back.** A song goes into the library only when its identity *and* its version are
   confirmed. Otherwise report it as held back with the reason ("3 mixes on the record, lengths don't decide").
4. **Secrets stay secret.** The Discogs token lives only in the `DISCOGS_TOKEN` environment variable. Never
   print it, put it in a URL, a file or a commit. Never put the person's paths or data into this repository.
5. **Be a good API citizen.** Discogs: about 60 requests/min with a token (the client throttles and caches).
   MusicBrainz: 1 request/s and a descriptive User-Agent. VGMdb blocks automated access: never try to get
   around security checks or CAPTCHAs; ask the person instead.
6. **Downloads are optional and only on request.** `curator better` / `curator videos` use yt-dlp. Treat
   downloaded files as untrusted data (they stay in `[paths] work`; never execute anything from them).
7. **Look before you write.** Check covers visually (contact sheet) and spot-check decisions against the
   person's existing tags. The writer re-reads every file it writes (tags, audio bytes, cover) — read its output.

## Setup

```bash
pip install -e .            # or run without installing: python -m music_curator ...
curator init                # writes curator.toml in the current folder; edit the paths
curator doctor              # ffmpeg + chromaprint, DISCOGS_TOKEN, paths, yt-dlp (optional)
```

Requirements: Python 3.11+, `ffmpeg`/`ffprobe` on PATH built with chromaprint (`ffmpeg -muxers | grep chromaprint`),
a free Discogs personal access token in `DISCOGS_TOKEN`. Optional: a Python with `yt-dlp` (set `[ytdlp] python`).

## The workflow

1. **Parse** — `curator parse items.json` reads the inbox folders (filenames + existing tags) and prints one
   line per file. Fix bad parses by editing `items.json` (fields: `artist`, `title`, `search_artist`,
   `search_title`, `mix`, `pos_hint`, `year_hint`, `cat`). Typical fixes: reversed "Title - Artist", labels or
   uploader names glued to the end, vinyl side codes ("B2 Untitled" → title `Untitled`, `pos_hint` `B2`),
   placeholder artists ("Trance - …", "Nightcore - …"). Categories: `candidate`, `mix`, `ost`, `nonmusic`,
   `nightcore`, `done`. Files over 15 minutes are marked `mix` — check them, some are long tracks.
2. **Resolve** — `curator resolve items.json out.json` matches every candidate on Discogs and decides tags:
   artist as credited (one joiner), title exactly as listed (mix name included), album per the album rule,
   year = earliest pressing, genre = Discogs *style* by votes across pressings (a specific style beats its
   parent: Hard Trance beats Trance). Status: `ready`, `review` (versions can't be told apart, the file names a
   mix Discogs doesn't list, the length is off by >90 s, no year/style), `notfound`, `dup`.
3. **Check the ready ones** — compare decisions with the person's existing tags and flag disagreements
   (artist/title changes, year ±2, length differences >10 s, albums taken from compilations). Re-check
   "only version on the record" picks when the filename has no mix name: the release found may hold only a
   remix while the original is on another record.
4. **Settle the review ones**
   - `curator scan items.json` — every pressing and version with lengths (other pressings, compilations,
     spelling variants). Often decides it by length alone.
   - `curator videos items.json out.json` — fingerprints the file against the YouTube videos Discogs links on
     the release; the video that matches names the version. By elimination is fine when only one version is
     left *and* you have ruled out speed differences (`curator same`).
   - `curator same COPY REF` / `curator drift COPY REF` — same recording? handles speed changes (resamples) and
     cuts (chunk alignment). Read `how`: "fingerprints match", "chunks align (copy cut or faded)",
     "same recording; your copy plays 3.4% fast", or "no match".
5. **Not found** — retry `resolve` with the file's existing tags as search terms; then `curator other items.json out.json`
   (MusicBrainz, then official "Provided to YouTube by …" uploads from auto-generated "- Topic" channels —
   their ℗ year is usually the original year). Game music: `curator ost` (Discogs coverage is poor; agree a
   fallback naming such as "<Game> OST - <Track>" with the person).
6. **Covers** — the primary image of the regular release. Skip promo / test pressing / white label / mispress
   images (use the master's main release). Build a contact sheet (e.g. ffmpeg `xstack`) and look at it:
   wrong record, barcodes and back sides happen.
7. **Write** — build `plan.json` (see `examples/plan.example.json`), run `curator write plan.json --dry-run`,
   then `curator write plan.json`. Every row in the log keeps the old tags and length next to the new ones.
8. **Report** — written songs, genre toss-ups (ties the person can settle by ear; genre changes are cheap),
   held-back songs with reasons, better-copy candidates. A markdown report next to the log works well.
9. **Better copies (optional, on request)** — `curator better items.json out.json` tries Discogs-linked videos,
   then a YouTube search. A copy is used only if its length matches the record, `same` says same recording
   (directly, after speed correction, or with chunks aligned), and — for low quality — it has clearly more
   content above 16 kHz. Pass it as `audio` in the plan; the log keeps the original as `src`.
10. **Switching players** — before pointing a player at the new library, list the tracks whose identity
    changed (from the log). Spotify local files match playlist entries by artist + album + title + duration,
    so those tracks must be re-added to playlists; genre, year and cover don't matter for matching.

## Lessons learned (real cases)

- **Sped-up rips.** Many uploads play 3–8% fast (turntable pitch +8%). "Shorter than the record" can mean
  faster, not cut. `same` estimates the speed from how fast matched chunks advance and resamples.
- **DJ-mix segments.** A file that exactly matches a track length on a *mixed* compilation is a mix cut
  (often pitched up). The full version is usually wanted; ask.
- **Spelling and naming.** Discogs varies: Doctor/Doktor, Millenium/Millennium, "Meteor 7 Mix" vs "Meteor Seven
  Remix", "Kai Tracid Mix" vs "Kai Tracid Cut". Several acts can share a name (Discogs adds "(2)"; strip it).
  Search variants with `scan`.
- **Popular artists.** The first pass fetches only the 3 earliest masters; artists with many releases can hide
  the right record. `scan` looks wider.
- **Uploader junk.** YouTube channel names end up as the artist tag; video titles carry "(Acid 1996)",
  "(CLASSIC 1994)", catalog numbers and "320 Kbps". None of it belongs in tags or filenames.
- **Mislabels.** Trance tracks are often uploaded under famous DJs' names. Fingerprint against official uploads
  before trusting an artist you can't find.
- **Special pressings.** Promos, test pressings and mispresses can have different tracklists and images;
  take album and cover from the regular release. "If any pressing says EP" is a fair album rule.
- **Styles are per release.** An album listing Hip Hop and Trance doesn't make every track Hip Hop.
- **Bare titles.** A file with no artist ("Show Me.mp3", a trance track) matched a 1981 soul single by title alone.
  `resolve` now sends artist-less files to review; never write one from a title-only match.
- **Compilation names posing as artists.** Three "Goa Syndrome - ..." files were tracks from Cygnetic Records'
  *Goa Syndrome* compilation series (Anodynez, Imperial Project). When an "artist" has releases but none with the
  track, search release titles for the name: it may be a compilation or label.
- **A master's year can be later than its first pressing** (a 1995 12" under a master dated 1996). Take the earliest
  pressing's year, never the master's alone.
- **Lengths can point the wrong way.** A "2010 Refix" listed 3 s from the file turned out not to be it; the
  fingerprint matched the original on a compilation. When two versions exist, settle it with `videos`/`same`.
- **Remix names that don't exist.** A filename's mix name may not be on any record; if lengths and fingerprints
  don't settle it, hold it back.
- **Scraps at the edges of old rips.** Some files have a partial frame between the tag and the first real frame,
  or end in a cut-off frame followed by an ID3v1 tag. `write` drops the leading scrap (decoders skip it) and
  keeps the trailing one. The audio check accepts a difference only in the last packet, and only when the
  audio really ends in such a scrap. Anything else is flagged.

## Formats

`items.json` (from `parse`, input to `resolve`/`scan`/`videos`/`other`/`better`): see `examples/items.example.json`.
`plan.json` (input to `write`): see `examples/plan.example.json` — required `key`, `src`, `artist`, `title`,
`album`, `year`, `genre`; optional `folder`, `discogs` (comment/source link), `cover` (local JPEG), `audio`
(a verified better copy), `notes` (goes to the log).

## Talking to the person

- Ask only real decisions, each with its evidence: a version choice ("your copy matches the A-side video,
  not the Barn Mix"), a policy (unverifiable files, game music), a deletion.
- List genre toss-ups in a table in the report instead of asking one by one.
- Keep the rules in the person's own words in their config / rules file, and follow them.
