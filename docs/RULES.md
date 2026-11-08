# Tagging rules (defaults)

These are the defaults the tools and AGENTS.md follow. The `[rules]` keys in `curator.toml` change the ones
marked *(config)*; for the rest, edit this file in your own copy and tell your agent.

## "Certain" means
- Discogs (or a fallback source) has a release crediting this artist with this track, **and**
- the version is pinned down: only one version exists, the filename names the mix and it matches, the file
  length matches the tracklist (a few seconds off is normal for rips), or a fingerprint matches a video linked
  on the release; **and**
- the genre is settled (auto-picked, see below).
Anything else is held back with the reason.

## Filename
- `{artist} - {title}` *(config: `filename`)*; the title includes the mix name in parentheses when the record has one.
- No year, genre, uploader name, catalog number or quality note in the name.
- Characters Windows forbids are swapped in the filename only (`/` → `-`, `:` → ` -`, `"` → `'`, `* ? < > |`
  removed); tags keep the real name (e.g. `Man/ipulate`). Invisible characters and look-alike symbols are removed.

## Tags (ID3v2.3)
| Field | Rule |
|---|---|
| Artist | As printed on the record (Discogs name variation), without Discogs' `(2)` numbers or `*`. Several artists joined with one joiner *(config: `artist_joiner`, default ` & `)*, replacing feat./vs./x; "A And B", "A + B" and "A vs. B" between two names too, even when Discogs files the pair under one name *(config: `and_to_joiner`)*. |
| Title | Exactly as listed, mix name included; untitled vinyl sides become `Untitled (A1)`. Titles written in two scripts ("Cyclick = サイクリック") keep the Latin-script part (also for albums). Unofficial versions with no release: "(<Name> Remix)" when the remixer is known, "(Hardstyle Mix)" or similar when not; official releases keep the record's own "Mix"/"Remix" wording. |
| Album | Release title for EPs and albums; empty for singles *(config: `album_for_singles`)*. The Discogs format label decides (Single / Maxi-Single → single; EP / Album / LP / Compilation → album); without one, 1–3 tracks or all mixes of one song = single. "Untitled" releases and titles that just list the tracks → empty. |
| Year | Earliest pressing of that exact track (never a reissue, compilation or upload year). |
| Genre | One Discogs **style** (not the genre "Electronic"), spelled as Discogs does. |
| Comment | The source link (Discogs master/release, MusicBrainz recording, or official upload). |
| Cover | Primary image of the regular release (not promo / test pressing / white label), embedded as front cover. |

## Genre auto-pick
1. Count styles across every pressing of the record.
2. A specific style beats its parent (Hard Trance / Goa Trance / Psy-Trance beat Trance; Deep / Acid / Tech House
   beat House; Gabber / Happy Hardcore / Speedcore beat Hardcore).
3. The file's existing genre (tag or folder) wins when Discogs lists it *(config: `prefer_existing_genre`)*.
4. The same genre as the person's other tracks by that artist, if listed.
5. Otherwise the most-voted style. A tie goes to the style closest to the file's existing genre: its one tied
   child (Hard Trance for a Trance file), its parent (Trance for a Hard Trance file), else the single tied style
   from the same family (Psy-Trance for a Goa Trance file tied between Psy-Trance and Hardcore). Any other tie is a **toss-up**: the first-listed style is used and
   the song is flagged for the person to settle by ear.

## Folders
`{genre}` inside the library *(config: `folder`, may be nested like `{genre}/{year}`)*. Plan entries can override
it per song with `folder` — used for game and film/TV music:
- `Game OST/<Game>/` and `Movie & TV OST/<Show>/`; album = the game/show, year = its release year; when nothing
  confirms the track, name it `<Game> OST - <Track>`.

## Placeholders
Files named like `Trance - <title>` or `Nightcore - <title>` keep that form when the real song can't be found.
