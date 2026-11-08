# music-curator

Curate a local music library, on its own or with an AI agent: every song is checked against
[Discogs](https://www.discogs.com), the exact version is settled by track length (and, with an agent, audio
fingerprints and other sources), and a clean copy is written with consistent tags, filename and cover. Nothing is
changed in place, and every change is logged.

Built for people who keep their own files — vinyl-era electronic music, rips, rare tracks — and play them in
Spotify (local files), Plex, Navidrome, foobar2000, a phone, …

> Status: early (0.1). The workflow was developed on a real library of 90s acid/trance. Only Windows has been tried so far.

![The library overview, with a song open in the side panel](docs/img/overview.jpg)

<sub>The screenshots show a made-up library.</sub>

## Get started

There are two ways to use it, and you can mix them:

- **On its own.** Press **Curate** on the page. The app looks up each song and adds the ones it's sure of, and you settle the rest by ear.
  See [Set it up by hand](#set-it-up-by-hand) and [Curate with no AI](#curate-with-no-ai).
- **With an AI app** that can run commands on your computer, such as Claude Code, Codex, Cursor or Gemini CLI. It does the hard
  cases too, and it can do the whole setup for you:

1. Download this repository and unzip it (or `git clone` it).
2. Open the folder in your AI app.
3. Say **"Set up music-curator for me."**

It checks what's missing and asks before installing anything. The one part only you can do is getting a free Discogs token, and
it walks you through that. Then your library opens in your browser and you pick your folders.

After that, just say what you want:

| Say | What happens |
|---|---|
| "Curate my new downloads" | The app's Curate goes first, then your AI app double-checks everything: tags, cover, that the audio is the right version, and other sources when Discogs doesn't have a song. A clean copy goes into your library. Anything it can't verify waits for you in To check, and so does any better-sounding copy it finds, with a link: your file only changes if you say so. |
| "Open my library" | The page opens in your browser. |
| "Apply my answers" | What you decided in To check gets carried out. |

## What makes it different

Taggers like Mp3tag, MusicBrainz Picard and beets match metadata. This toolkit also answers *"is this file really
that version?"*:

- **Version proof.** Compares your file's audio fingerprint with a reference recording, so "A-side or Barn Mix?" is
  answered from the audio, not guessed. (Using the videos linked on a Discogs release as the reference needs the optional yt-dlp.)
- **Speed and edit detection.** Finds rips that play a few percent fast (a common upload trick) or were cut
  short, by aligning 20-second fingerprint chunks.
- **Human in the loop.** Clear "held back" reasons, genre toss-ups to settle by ear, a report per batch.
- **Player switch-overs.** The log keeps old vs new tags, so you know which playlist entries to re-add.

## How it works

```
inbox files ──parse──▶ items.json ──resolve──▶ ready / review / notfound
                                       │            │          │
                                       │       scan · videos   other (MusicBrainz, YouTube)
                                       │       same · drift    ost (game music)
                                       ▼            ▼          ▼
                                   plan.json ──write──▶ library/<genre>/<artist> - <title>.mp3
                                                       + log.csv (old → new) + report
```

The Curate button runs the plain version of these steps by itself. An AI agent runs all of them and talks to you; see
[AGENTS.md](AGENTS.md) for the full workflow it follows. You can also run every step by hand.

## Requirements

- Python 3.11+ (standard library only)
- `ffmpeg` and `ffprobe` on PATH, built with **chromaprint** (`ffmpeg -hide_banner -muxers` lists `chromaprint`)
- A free Discogs personal access token (<https://www.discogs.com/settings/developers>), saved as described
  [below](#your-discogs-token)
- Optional: [yt-dlp](https://github.com/yt-dlp/yt-dlp), for better copies, video checks and finding official YouTube uploads

It curates MP3 files. Other formats still show up and play on the page, but they're skipped when curating.

## Set it up by hand

```bash
pip install -e .
curator serve         # opens your browser: pick your library and downloads folders
curator doctor        # checks everything is in place
```

Prefer a config file? `curator init` writes a `curator.toml` in the current folder.

**How it fits together:** you put downloaded songs in your downloads folder and press **Curate**, or ask your AI app to curate
them. Finished songs are copied into your library, sorted by genre, and your originals stay in downloads until you say they can
go. Songs that can't be settled stay put and show up in To check.

### Your Discogs token

Lookups need a free token from <https://www.discogs.com/settings/developers>. The easiest place for it is a text file called
`.env` next to your settings, with one line (`curator doctor` says which folder, and so does the page):

```
DISCOGS_TOKEN=your token here
```

An environment variable called `DISCOGS_TOKEN` works too, and wins if you have both. The app only ever reads the token and sends
it to Discogs. Keep the file out of anything you share: `.env` is already in this repository's `.gitignore`.

## Curate with no AI

**Curate** on the page (or `curator curate`, with `--dry-run` for a preview) looks up everything waiting in your downloads folders.
With nobody double-checking, the rules are strict. A song goes in only when:

- its artist and title match a track on a record, and any mix named in the file is the one on the record
- the length is within 20 seconds of the record's, when the record lists one
- it isn't already in your library

Those songs are marked **Auto-matched**, so you can tell them from the ones checked more closely. Everything else waits on To check
with the reason and the versions found: listen, then click the one it is, or type what it really is, and press Curate again.

On one real library of 518 songs, replayed from their original messy names, 55% went in by themselves and one disagreed with the
verified answer, only in how the title was spelled. The rules were tuned on that same library, so expect a little less on yours.
Files nobody can look up, like nightcore edits or unofficial remixes, always wait for you or an agent. An agent adds what Curate can't
do: reading odd names, comparing audio fingerprints with the record, checking other sources, and looking for better-sounding copies.

## See it in your browser

`curator serve` opens a small local page (127.0.0.1 only, nothing to install):

![To check: songs waiting for your ears, with the versions found](docs/img/check.jpg)

- **Overview**: a wall of your covers, your peak years, top genres, artists, labels and countries.
- **Songs**: search and filter everything, play it, see how each song was verified and what the file used to be called, and jump to its Discogs page to check it or buy the record.
- **To check**: the questions only ears can answer (genre toss-ups, songs that couldn't be verified), with the audio right there.
- **Progress**: what's waiting in the inbox, how sure each song is, library growth, latest changes.

![Progress: how sure each song is, library growth, what's left to check](docs/img/progress.jpg)

The first time it asks where your library and downloads live, and you can change them later under Folders. Picking a
folder never moves any music. The app keeps its log, answers and cache in a `_curation` folder next to the library, and its
settings in your user profile. Browsing only ever reads your music, and your answers go to `decisions.json` next to the log. The
one thing on the page that adds to your library is the Curate button, and the only outside service it talks to is Discogs.

`curator apply --dry-run` shows what your answers would do, and `curator apply` carries out the ones that need no research: genre
changes, which also move the song to the new genre's folder. Songs you marked not worth keeping only move if you add `--set-aside`.
Nothing is deleted: old copies go to a `Set aside` folder next to the log, which you can empty whenever you like. Answers that need
research, like finding a better copy, stay on the list for your agent.

Optional `[paths]` keys feed the To check page: `review` (a folder of songs waiting for a decision) and `review_list` (a Markdown
file with one `- **Artist - Title**: reason` per song).

### Checking Spotify (optional)

Spotify doesn't let apps add or remove local files in playlists, so the **Playlists** tab lists what's for you to do by hand. Songs you
accept under Playlist ideas wait under To add, for you to drag in. A **Check Spotify** button confirms what arrived and lists under To
remove the local entries with no matching file (Spotify shows those greyed) and any second copies, with where they are in the playlist.
It only reads your playlists, the sign-in stays in memory until the app closes, and a playlist that hasn't changed isn't read twice. If entries to remove are spread through a playlist, **Move all to the bottom** gathers them so you can select them in one go. That button asks Spotify for permission to reorder your playlists when you press it, and it never removes anything.

Check Spotify also searches Spotify for the songs still waiting in your downloads and Review, once per song. Likely matches appear on To check as **Might be on Spotify**, going by name and length, because Spotify gives apps no audio to compare. Open it, listen, and if it's the same recording, choose playlists and the app adds the streamed song to them. Your file stays where it is until you say otherwise.

To turn all this on, create an app at <https://developer.spotify.com/dashboard>, add
`http://127.0.0.1:8888/callback` as its redirect URI, and put its Client ID in `curator.toml`:

```toml
[spotify]
client_id = "your client id"
```

## Commands

| Command | What it does |
|---|---|
| `init`, `doctor` | starter config; environment check |
| `curate [--dry-run]` | curate with no AI: add the songs the evidence settles, leave the rest on To check |
| `verified SONG… --how TEXT` | record that Auto-matched songs were checked properly (for your agent, after Curate) |
| `parse OUT [DIR…]` | read inbox folders (names + tags) into items |
| `resolve ITEMS OUT` | Discogs match and tag decisions |
| `scan ITEMS` | every pressing/version of a song with lengths |
| `videos ITEMS OUT` | fingerprint files against Discogs-linked videos |
| `other ITEMS OUT` | MusicBrainz and official YouTube uploads |
| `ost ITEMS OUT` | game-soundtrack lookup |
| `better ITEMS OUT` | find and verify better copies (yt-dlp) |
| `maybe-better SONG URL --why TEXT [--checked]` | leave a link to a possibly better copy on To check, to open or ignore (for your agent) |
| `same COPY REF`, `compare A B`, `drift COPY REF` | same-recording tests |
| `write PLAN [--dry-run]` | write tagged copies + cover into the library, append to the log |
| `serve [--port N] [--no-browser]` | open the library in your browser |
| `decisions` | list what you decided in the browser |
| `apply [--dry-run] [--set-aside]` | carry out your browser answers that need no research |
| `suggest PLAYLISTS [NAME] [--count N]` | suggest playlists your songs are a confident fit for, to judge by ear on To check (experimental) |
| `discogs …`, `vgmdb …` | raw clients |

## Your rules

The defaults follow one person's taste; change them in `curator.toml` (`[rules]`) and
[docs/RULES.md](docs/RULES.md): filename pattern, folder layout, artist joiner, album for singles, keeping your
existing genres, game/TV soundtrack folders.

## Using it with AI agents

- **Any agent:** point it at [AGENTS.md](AGENTS.md).
- **Claude Code:** [CLAUDE.md](CLAUDE.md) imports AGENTS.md; a skill is in [skills/music-curator](skills/music-curator).

## Notes and limits

- Meant for files you already have. Downloading (yt-dlp) is optional and your responsibility; check the terms
  of the sites you use and your local law.
- Discogs data: use your own token, stay within the rate limits (the client throttles and caches), and credit
  Discogs where you display its data ("Data provided by Discogs"). Cover images are for your personal tags.
- MusicBrainz data is CC0; please keep its 1 request/second limit.
- VGMdb (game music) blocks automated access; the `vgmdb` client uses a volunteer mirror that is often down.
- Fingerprints come from [Chromaprint](https://acoustid.org/chromaprint) via ffmpeg.

## License

[MIT](LICENSE). Data from Discogs, MusicBrainz and Spotify stays under their own terms.
