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
   only creates new files under `[paths] library` and appends to the log. The one exception is `curator apply`,
   which carries out genre changes the person chose in the browser and keeps the old copy.
2. **Never delete without explicit permission** for that specific action. When allowed, move to the
   Recycle Bin / trash, not a permanent delete, and verify the library copy exists first.
3. **Certain or held back.** A song goes into the library only when its identity *and* its version are
   confirmed. Otherwise report it as held back with the reason ("3 mixes on the record, lengths don't decide").
4. **Secrets stay secret.** The Discogs token lives in the `DISCOGS_TOKEN` environment variable or in a `.env` file next to the
   person's settings, which only they create or edit. Never read that file, print the token, or put it in a URL, another file
   or a commit. Never put the person's paths or data into this repository.
5. **Be a good API citizen.** Discogs: about 60 requests/min with a token (the client throttles and caches).
   MusicBrainz: 1 request/s and a descriptive User-Agent. VGMdb blocks automated access: never try to get
   around security checks or CAPTCHAs; ask the person instead.
6. **Nothing fetched is kept, and a better copy never replaces a song by itself.** `curator better`, `curator videos` and a link given to
   `curator same` or `drift` fetch audio only to compare it, with yt-dlp, which is optional, and delete it straight after. While it exists
   it's untrusted data in `[paths] work`: never execute anything from it. This toolkit doesn't download music for people to keep. What you
   find goes to the person: see **Better copies**.
7. **Look before you write.** Check covers visually (contact sheet) and spot-check decisions against the
   person's existing tags. The writer re-reads every file it writes (tags, audio bytes, cover) — read its output.

## First-time setup

When the person says "set this up", or `curator` isn't installed yet, go through these in order. Say what each piece is for
in a few plain words, skip whatever is already there, and get their OK before installing anything.

1. **Python 3.11 or newer.** Check with `python --version` (`python3` on macOS and Linux; on Windows `py -3 --version` if
   `python` isn't found). To install: Windows `winget install --id Python.Python.3.13 -e`, macOS `brew install python`,
   Debian/Ubuntu `sudo apt install python3 python3-venv`. If winget stops at an agreement prompt, show it to the person and,
   with their OK, add `--accept-source-agreements --accept-package-agreements`. Something you just installed can stay
   invisible to your shell until the whole AI app restarts (on Windows it always does). Ask the person to restart it, then
   carry on: setup skips what's already there.
2. **The curator.** In this repository's folder, make a virtual environment with the Python command step 1 found, and install into it:
   ```bash
   python -m venv .venv
   .venv/Scripts/python -m pip install -e .   # macOS and Linux: .venv/bin/python -m pip install -e .
   ```
   From then on the command is `.venv/Scripts/curator` (macOS and Linux: `.venv/bin/curator`).
3. **See what's missing.** Run `curator doctor` and work through only what it reports.
4. **ffmpeg with chromaprint**, which the audio fingerprints need. Not every ffmpeg build has it, so trust `curator doctor`
   rather than the package name. As in step 1, the AI app may need a restart before your shell can see it.
   - Windows: `winget install --id Gyan.FFmpeg -e` (Gyan's full build has chromaprint, its essentials build doesn't).
   - Debian/Ubuntu: `sudo apt install ffmpeg`.
   - macOS: `brew install ffmpeg`, then `curator doctor`. If chromaprint is missing, the
     [homebrew-ffmpeg tap](https://github.com/homebrew-ffmpeg/homebrew-ffmpeg) offers it as an option; check the current
     flag with `brew options homebrew-ffmpeg/ffmpeg/ffmpeg`.
5. **A Discogs token** (free; it's how songs get looked up). Only the person can do this, and the token must never pass
   through you (ground rule 4).
   - Send them to <https://www.discogs.com/settings/developers>, where a free account is enough, to click **Generate new token**.
   - The easiest way: `curator doctor` names a folder. Have them make a text file called `.env` there, in **their own** editor,
     with one line: `DISCOGS_TOKEN=their token`.
   - Or as an environment variable, from **their own** terminal window, with their token in place of `PASTE_HERE`:
     - Windows: `setx DISCOGS_TOKEN "PASTE_HERE"`
     - macOS: `echo 'export DISCOGS_TOKEN="PASTE_HERE"' >> ~/.zshrc`
     - Linux: `echo 'export DISCOGS_TOKEN="PASTE_HERE"' >> ~/.bashrc`
   - `curator doctor` should now say `DISCOGS_TOKEN: set`. With the file, or on Windows, that works straight away. On macOS and
     Linux a shell variable is only seen after a restart, so they may need to restart their AI app.
   - If they paste the token into the chat anyway, don't repeat it or use it. Ask them to generate a new one on Discogs and
     save that one themselves.
6. **Folders.** If `curator doctor` shows `library (not set)`, run `curator serve` in the background (it keeps running). The
   page opens on a first-run screen where they pick their library and downloads folders. Let them choose; picking a folder
   never moves any music.
7. **yt-dlp is optional, so ask.** Without it `curator other` can't look for official YouTube uploads and `videos` doesn't work, so
   some songs get held back that could have been verified, and a better copy can only be left as a link nobody has compared with their file. It's only used to compare: nothing it fetches is kept. To add it: `.venv/Scripts/python -m pip install -e ".[compare]"`
   (macOS and Linux: `.venv/bin/python`).
8. **Finish.** Run `curator doctor` again; it should end with `OK`. Then tell them it's ready, give them the exact command that
   opens their library later (the full path to `curator serve` in `.venv`), and say what they can ask for next.

By hand: the same virtual environment as step 2 (a plain `pip install` is refused on recent Linux and with Homebrew's Python),
then `curator init` writes a `curator.toml` in the current folder to edit, or `curator serve` asks for the folders. Without installing: `python -m music_curator ...` with `src` on `PYTHONPATH`. To keep yt-dlp in a
separate Python, set `[ytdlp] python`.

## What the person might ask

- "Curate my new downloads": run `curator curate`, then do everything under **After Curate**.
- "Open my library": `curator serve`, in the background.
- "Apply my answers": see **The browser app**.

## The workflow

Start with `curator curate`, unless the person just pressed **Curate** on the page. It's the plain version of these steps with no AI: it adds
only what it's sure of, marks those notes `matched automatically`, and leaves the rest in the downloads folder, with its reasons and the versions
it found in `curated.json` next to the log. That's a first pass. These steps are how you finish the job: see **After Curate** below.

1. **Parse** — `curator parse items.json` reads the inbox folders (filenames + existing tags) and prints one
   line per file. Only MP3, FLAC and M4A can be curated: it names any other audio it skipped, so tell the person. Fix bad parses by editing `items.json` (fields: `artist`, `title`, `search_artist`,
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
     cuts (chunk alignment). `REF` is a file or a YouTube link (`videos` lists the `url` of each one it checked). Read `how`:
     "fingerprints match", "chunks align (copy cut or faded)", "same recording; your copy plays 3.4% fast", or "no match".
5. **Not found** — retry `resolve` with the file's existing tags as search terms; then `curator other items.json out.json`
   (MusicBrainz, then official "Provided to YouTube by …" uploads from auto-generated "- Topic" channels —
   their ℗ year is usually the original year). Game music: `curator ost` (Discogs coverage is poor; agree a
   fallback naming such as "<Game> OST - <Track>" with the person).
6. **Covers** — the primary image of the regular release. Skip promo / test pressing / white label / mispress
   images (use the master's main release). Build a contact sheet (e.g. ffmpeg `xstack`) and look at it:
   wrong record, barcodes and back sides happen. If you can't confirm a good one, leave the cover empty rather than guess.
7. **Write** — build `plan.json` (see `examples/plan.example.json`), run `curator write plan.json --dry-run`,
   then `curator write plan.json`. Every row in the log keeps the old tags and length next to the new ones.
8. **Better copies** — look for one on every song you check, and leave what you find for the person. See **Better copies** below.
9. **Report** — written songs, genre toss-ups (ties the person can settle by ear; genre changes are cheap),
   held-back songs with reasons, better copies found. A markdown report next to the log works well. Put the questions
   on the page too, or To check stays empty: give each toss-up in `plan.json` a note reading exactly
   `genre toss-up: A / B` (the options from `resolve`'s `genre_options`), and add a line `- **Artist - Title**: reason` to the
   `[paths] review_list` file for each held-back song.
10. **Switching players** — before pointing a player at the new library, list the tracks whose identity
    changed (from the log). Spotify local files match playlist entries by artist + album + title + duration,
    so those tracks must be re-added to playlists; genre, year and cover don't matter for matching.

## After Curate

Curate decides on names and lengths, and only checks that a file plays all the way through (a broken one waits on To check, with a reason that says it's damaged), so what it added is only a first pass. When the person works with you, everything gets the full treatment before you call it done.

**Every song Curate added** (the log marks it `matched automatically` or `picked by you`; the page says Auto-matched):

1. **Tags and metadata.** Compare artist, title and mix, album, year and genre with the Discogs record, as in step 3 above.
2. **Cover.** Check it's the right image, as in step 6 above.
3. **The audio.** Confirm it's that version with `curator videos` or `curator same`.
4. **A better copy.** Look for one: see **Better copies**.
5. **On Spotify?** If they use it, Check Spotify keeps its likely matches in `spotify_search.json` next to the log. Those are by name and length only, because Spotify gives apps no audio.
   Before saying a song is the same recording, compare it with the official upload ("Provided to YouTube by …"): `curator same YOUR_FILE "<its link>"`.
6. **Record it.** `curator verified "Genre/Artist - Title.mp3" --how "what you checked"` turns it into Verified on the page. If something failed, don't mark it: tell the person what's wrong.

The person can also check these themselves on the page's Double-check. **Looks right** writes the same log entry, with `verified: you checked it on the page`: that's their own check, so leave the song as it is unless they ask you to look too. **Not right** is a `wrong` answer (see **The browser app**).

**Every song Curate left** (in `curated.json`, still in the downloads folder): take it through **The workflow**, starting from the reason Curate gave. That includes other sources when Discogs doesn't have the song (step 5). Whatever you can verify gets the same checks before you call it done.
If the person turned on comparing audio (`[curate] compare_audio`), an entry may hold `audio`: how many videos on the record were compared and, under `match`, one that's the same recording from start to finish. Curate never adds a song because of it, and neither should you on that alone: a video can be mislabelled or be another mix from the same record. Use it as one piece of evidence.

## Better copies

Checking a song includes asking whether a better recording of it exists: first the YouTube videos linked on its Discogs page, then other official uploads. Whatever you find, **the person's file stays as it is until they say otherwise.** (If someone tells you to swap verified copies in without asking, do that, and note it in their rules file.)

1. **Look.** Run `curator better items.json out.json` with one entry per song: `{"key": "1", "src": "<the file>", "artist": "...", "title": "...", "release": 123, "master": 456, "target_secs": 300, "reason": "low quality"}`.
   The ids come from the song's Discogs link in the log (for a link to a master, `curator discogs master <id>` gives its `main_release`). Both can be null for a song Discogs doesn't have, and then only a YouTube search is tried. `target_secs` is the record's length, or null if it lists none. Add `"tries": 6` to compare more than the first 3 candidates.
   `"low quality"` asks for better sound: the same recording at that length with clearly more content above 16 kHz. Any other reason (`"cut short"`, `"wrong speed"`) asks only for the same recording at that length.
2. **Without yt-dlp** nothing can be fetched or compared. `better` still lists the Discogs-linked videos whose title and length fit, under `tried` with an `error` each, and the link is `https://www.youtube.com/watch?v=<id>`. Those are guesses, and so is anything you find with your own web search.
3. **Leave it on To check**, where the person can open the link or ignore it: `curator maybe-better "Genre/Artist - Title.mp3" "<link>" --why "official upload; yours is 128 kbps"`. Add `--checked` only if `better` accepted that copy (its `accepted` entry has the `url`). One link per song: a second replaces the first.
4. **If they say yes** (a `better` answer with the link as its note, or they tell you):
   - Get the file. It comes from the person, because the toolkit keeps nothing it fetches: ask them to get it and tell you where it is, or use their own downloader if they've told you to. Confirm it's the same recording with `curator same` before going on.
   - `curator write` won't overwrite a song, so move the old copy to a `Set aside` folder next to the log (never delete it). Then write a plan entry with the song's same tags and cover, `src` set to the set-aside file and `audio` set to the new copy. The log keeps the original as `src`.
   - If the length changed, tell them: Spotify matches local files by length too, so playlist entries for that song need adding again.

## The browser app

If your AI app has its own browser (the Claude desktop app's Browser pane, for example), open the page there, beside the conversation. You and the person then look at the same cards, and you can check how a change really looks. Reading the page is fine. Answering on it is theirs: don't click their answers for them unless they ask.

`curator serve` gives the person a local page to explore the library and answer what only ears can settle. It's a music player
first: the Curator (Curate, To check, Progress, Double-check) and Spotify are extras, turned on or off under Settings → Extras
(`[extras] curator` and `spotify` in `curator.toml`; with no choice made, the Curator is on when there's a downloads folder or a log,
and Spotify once it's set up or has been checked). Off only hides that part of the page: the commands still work, so if the person
asks you to curate with the Curator off, say they'll see the results once they turn it on. With no config
it opens on a first-run screen where they pick their library folder and, if they like, a downloads folder; that saves `curator.toml` to the per-user
location (`--config` or `$CURATOR_CONFIG` override it), and every command then finds it. To change folders, use its Settings page. It reads the
library, the log and (optional `[paths]` keys) a `review` folder and a `review_list` Markdown file with one
`- **Artist - Title**: reason` per song. The page never changes music (Looks right on Double-check only writes its check in the log); answers land in `decisions.json` next to the log, keyed
`<kind>:<area>/<relative path>`, and `curator decisions` lists them. Play counts land in `plays.json` beside it, keyed by artist and title, so a count follows a song to another folder or a better copy. Playlists made in the app are in `own_playlists.json`, keyed the same way: if you change a song's artist or title, it shows as not here in those playlists, so tell the person.

To act on them, run `curator apply --dry-run`, show the person what it would do, and after their OK run `curator apply`. Nothing
is deleted: old copies go to a `Set aside` folder next to the log, and every change is logged. The page's **Curate** button does the same work (and, if the person ticks the box, the `drop` answers too), so answers may already be done by the time you look.

Every style Discogs lists for a record is in `styles.json` next to the log, per record, filled by Curate or `curator genres`. The page shows them and finds songs under them; the file's tag and folder still get the one genre.

- `genre`: `apply` does it. It changes the genre tag and nothing else, moves the song to the new genre's folder unless it's kept
  elsewhere (a soundtrack folder, say), and retires the question. Spotify matching doesn't depend on the genre or the folder. It works on
  MP3, FLAC and M4A files in the library; anything it can't do is reported as "not done" and stays on the list.
- `drop` (the page's "Not worth keeping"): `apply` moves these to `Set aside` only with `--set-aside`. Name the songs and ask first.
- `wrong` (kind `auto`, the page's "Not right" on Double-check): the person says Curate's match is wrong, and the note may say why. `apply` and the page's
  Curate take the copy out of the library: to `Set aside` while the original is still in the downloads folder, or else back to that folder under its
  old name. The log row says `removed: not right`, and from then on Curate holds the song on To check with the note. It's never added again by
  itself, only by the person's pick or by your verified write. Treat it as a song Curate left.
- `keep`: nothing to do. The entry stays; it marks the question as answered.
- `identify`: the person's note says what the song is. Research it like any other song; write it only once it's verified. `curator curate` also acts on a note written as `Artist - Title`.
- `stream` (kind `spotify`): the person listened and added Spotify's version to playlists, from the page. Nothing to do; a `drop` noted "On Spotify" says their file isn't needed, and it only moves with `apply --set-aside`, on their OK.
- `pick`: the person chose a version from the ones in `curated.json` (the note is its id). `curator curate` writes it; run that, or write the same version yourself.
- `add`: the person wants this song in the playlists the note names, one per line (from `curator suggest`). `apply` lists these. Spotify doesn't let apps
  add local files, so they drag those in and click Added on the page's Playlists tab (`added` needs nothing from you); running `suggest` again
  with a newer playlist snapshot clears the ones that have arrived.
- `recheck`, `better`, `cover`, `flag`: follow the note, and ask before deleting anything. `apply` lists these and leaves them to you. A `better` answer whose note is a link means they want that copy: see **Better copies**.

Remove an entry you handled yourself (other than `keep`) once it's done; `apply` removes its own. Edit `decisions.json` with a
JSON-aware tool: if it stops being valid JSON, the page refuses to save answers until it's repaired.

## Lessons learned (real cases)

- **Nightcore and speed checks.** Compare ~10-second pieces in speed steps of 0.4% or less. A whole-track comparison
  in 2% steps misses a real match when the speed falls between two steps; a true match lines up in every piece, a cover
  of the same song only in a few.
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
(a verified better copy the person agreed to), `notes` (goes to the log).

## Talking to the person

- Ask only real decisions, each with its evidence: a version choice ("your copy matches the A-side video,
  not the Barn Mix"), a policy (unverifiable files, game music), a deletion.
- List genre toss-ups in a table in the report instead of asking one by one.
- Keep the rules in the person's own words in their config / rules file, and follow them.
