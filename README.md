# music-curator

Curate a local music library with the help of an AI agent: every song is checked against
[Discogs](https://www.discogs.com) (and MusicBrainz / official YouTube uploads when Discogs doesn't have it),
the exact version is settled by track length and audio fingerprints, and a clean copy is written with
consistent tags, filename and cover. Nothing is changed in place, and every change is logged.

Built for people who keep their own files — vinyl-era electronic music, rips, rare tracks — and play them in
Spotify (local files), Plex, Navidrome, foobar2000, a phone, …

> Status: early (0.1), private. The workflow was developed on a real library of 90s acid/trance.

## What makes it different

Taggers like Mp3tag, MusicBrainz Picard and beets match metadata. This toolkit also answers *"is this file really
that version?"*:

- **Version proof.** Fingerprints your file against the YouTube videos linked on the Discogs release, so
  "A-side or Barn Mix?" is answered from the audio, not guessed.
- **Speed and edit detection.** Finds rips that play a few percent fast (a common upload trick) or were cut
  short, by aligning 20-second fingerprint chunks.
- **Better copies.** Optionally finds a complete, right-speed, better-sounding copy — and uses it only if it's
  provably the same recording.
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

An AI agent drives these steps and talks to you; see [AGENTS.md](AGENTS.md) for the full workflow it follows.
You can also run every step by hand.

## Requirements

- Python 3.11+ (standard library only)
- `ffmpeg` and `ffprobe` on PATH, built with **chromaprint** (`ffmpeg -hide_banner -muxers` lists `chromaprint`)
- A free Discogs personal access token in the `DISCOGS_TOKEN` environment variable
  (<https://www.discogs.com/settings/developers>)
- Optional: a Python with [yt-dlp](https://github.com/yt-dlp/yt-dlp) for better copies and video checks

## Quick start

```bash
pip install -e .
curator init          # writes curator.toml here; set library / inbox / log paths
curator doctor        # checks everything is in place
curator parse items.json
curator resolve items.json out.json
```

Then let your agent take it from there, or build a `plan.json` and run `curator write plan.json --dry-run`.

## Commands

| Command | What it does |
|---|---|
| `init`, `doctor` | starter config; environment check |
| `parse OUT [DIR…]` | read inbox folders (names + tags) into items |
| `resolve ITEMS OUT` | Discogs match and tag decisions |
| `scan ITEMS` | every pressing/version of a song with lengths |
| `videos ITEMS OUT` | fingerprint files against Discogs-linked videos |
| `other ITEMS OUT` | MusicBrainz and official YouTube uploads |
| `ost ITEMS OUT` | game-soundtrack lookup |
| `better ITEMS OUT` | find and verify better copies (yt-dlp) |
| `same COPY REF`, `compare A B`, `drift COPY REF` | same-recording tests |
| `write PLAN [--dry-run]` | write tagged copies + cover into the library, append to the log |
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
