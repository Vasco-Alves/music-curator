---
name: music-curator
description: Curate a local music library with the music-curator CLI — verify songs against Discogs (and MusicBrainz / official YouTube uploads), settle the exact version by track length and audio fingerprints, detect sped-up or cut rips, write clean tags, filenames and covers into a library folder, and report what needs a human decision. Use when the user wants to tag, verify, rename, organize or deduplicate music files, check whether a rip is the right version, or find a better copy of a song.
---

# Music curator

Requires the `music-curator` package (installed from the repo into a virtual environment, as "First-time setup" in `AGENTS.md` shows; command `curator`), ffmpeg with chromaprint,
and a Discogs token (in `DISCOGS_TOKEN`, or a `.env` file the person keeps next to their settings: don't read it). Run `curator doctor` first. If it isn't set up yet, follow "First-time setup" in `AGENTS.md`.

## Ground rules
- Never modify or delete the user's files; `curator write` only creates copies in the library folder.
  Deletions need the user's explicit OK and go to the trash.
- A song goes in only when identity and version are certain; otherwise report it as held back, with the reason.
- Never print or store the Discogs token. Never bypass CAPTCHAs or site security checks.
- Look at covers (contact sheet) before writing; leave the cover empty if none can be confirmed.
- A better copy never replaces a song until the user says so. Audio fetched to compare is deleted straight after: this toolkit doesn't download music to keep.

## Steps
First run `curator curate`, unless the user just pressed Curate on the page. It adds what it's sure of and is only a first pass: check every song it added ("After Curate" in `AGENTS.md`), and take what it left through these steps.

1. `curator parse items.json` → fix bad parses in items.json.
2. `curator resolve items.json out.json` → ready / review / notfound / dup.
3. Compare ready decisions with the user's existing tags; re-check remix-only matches for files without a mix name.
4. Review items: `curator scan`, `curator videos`, `curator same` / `drift` (speed changes, cuts).
5. Not found: retry with existing tags, then `curator other`; game music `curator ost`.
6. Covers from the regular release; check visually.
7. `plan.json` → `curator write plan.json --dry-run` → `curator write plan.json`.
8. Better copies, on every song you check: `curator better` (Discogs-linked videos first), then `curator maybe-better` leaves each find on To check as a link the user can open or ignore. See "Better copies" in `AGENTS.md`.
9. Report: written, genre toss-ups, held back with reasons, better copies found.

The full workflow, formats and lessons are in `AGENTS.md` at the repository root; the tagging rules in `docs/RULES.md`.

## Browser app
`curator serve` opens the library in the person's browser; they answer genre toss-ups and review questions there. Its Curate button (`curator curate`) adds what it's sure of with no AI and leaves the rest, with reasons, in `curated.json`.
`curator apply --dry-run`, then `curator apply` after their OK, carries out the answers that need no research and lists the rest
(see "The browser app" in AGENTS.md). `curator decisions` lists every answer.
