#!/bin/sh
# Pressling on macOS and Linux: installs it the first time, updates it every time after, and opens it.
#
#   Run it from this folder:     sh install.sh
#   or straight from GitHub:     curl -LsSf https://raw.githubusercontent.com/Vasco-Alves/pressling/main/install.sh | sh
#
# What it does, asking first before it installs anything else:
#   1. uv, the small tool Pressling is installed with: if it's missing, its official installer (astral.sh), once you say yes.
#   2. Pressling itself: from PyPI once it is published there (only this project's own release), else the newest code on GitHub.
#   3. ffmpeg, only if you want it (the Curator needs it, plain playing doesn't): with Homebrew on macOS; on Linux it says the
#      command for your system, as that needs sudo, which this script never runs.
#   4. Your Discogs token, if there isn't one yet: it opens the page where you make one and a .env file in your text editor
#      to paste it into. The token never passes through this script.
#   5. curator doctor, to show what is ready, and then Pressling opens in your browser.
#
#   --no-open    does everything but open Pressling at the end
#   --dry-run    only says what it would do: nothing is installed, changed or opened
set -u

REPO="https://github.com/Vasco-Alves/pressling"
FROM_GITHUB="pressling @ $REPO/archive/refs/heads/main.zip"
OPEN=1
DRY=0
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN=0 ;;
    --dry-run) DRY=1 ;;
  esac
done

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
ask() { # ask "question" y|n: a yes or no question; Enter gives the answer in capitals. Where nobody can answer, it is no (in a dry run, the default)
  if [ "$2" = y ]; then hint="[Y/n]"; else hint="[y/N]"; fi
  if [ "$DRY" = 1 ]; then say "$1 $hint  (dry run: taken as the default)"; [ "$2" = y ]; return; fi
  answer=""
  if { printf '%s %s ' "$1" "$hint" > /dev/tty; } 2>/dev/null && read -r answer < /dev/tty; then : # (from the terminal itself, so it works when this script comes in through a pipe)
  else say "$1 $hint  (nobody to ask here: no)"; return 1; fi
  case "$answer" in
    "") [ "$2" = y ] ;;
    [yY] | [yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}
run() { # run "what it is" command...: runs it, or in a dry run only says it would
  what="$1"
  shift
  if [ "$DRY" = 1 ]; then say "  (dry run) would run: $what"; return 0; fi
  "$@"
}
openurl() {
  case "$(uname -s)" in
    Darwin) run "open $1" open "$1" ;;
    *) if has xdg-open; then run "open $1" xdg-open "$1" >/dev/null 2>&1; else say "Open $1 in your browser."; fi ;;
  esac
}

say "Pressling: install, update and open."
if [ "$DRY" = 1 ]; then say "(dry run: nothing will be installed, changed or opened)"; fi

step "uv"
if has uv; then
  say "uv is there."
else
  say "Pressling is installed with uv, a small free tool from Astral that installs Python apps (and Python itself if you don't have it)."
  if ! ask "uv isn't installed. Install it now with its official installer from astral.sh?" y; then
    say "Nothing was changed. You can install uv yourself (https://docs.astral.sh/uv/) and run this again."
    exit 1
  fi
  if has curl; then run "the uv installer from https://astral.sh/uv/install.sh" sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
  elif has wget; then run "the uv installer from https://astral.sh/uv/install.sh" sh -c 'wget -qO- https://astral.sh/uv/install.sh | sh'
  else say "This computer has neither curl nor wget to fetch it with. Install uv yourself (https://docs.astral.sh/uv/) and run this again."; exit 1
  fi
  PATH="$HOME/.local/bin:$PATH"
  export PATH
  if [ "$DRY" = 0 ] && ! has uv; then say "uv was installed, but this terminal can't see it yet. Open a new one and run this again."; exit 1; fi
fi

step "Pressling"
onpypi=0
if has curl && curl -fsS --max-time 15 https://pypi.org/pypi/pressling/json 2>/dev/null | grep -q 'github.com/Vasco-Alves/pressling'; then onpypi=1; fi # only this project's own release on PyPI, never another package with the same name
if [ "$onpypi" = 1 ]; then
  say "Installing or updating Pressling from PyPI."
  run "uv tool install --upgrade pressling" uv tool install --upgrade pressling
else
  say "Installing or updating Pressling with the newest code on GitHub."
  run "uv tool install --reinstall \"$FROM_GITHUB\"" uv tool install --reinstall "$FROM_GITHUB"
fi || { say "uv couldn't install Pressling (see above). Nothing else was changed."; exit 1; }
if [ "$DRY" = 0 ] && ! has pressling; then # uv's folder for apps isn't on PATH yet: put it there for good, and for this terminal now
  uv tool update-shell >/dev/null 2>&1 || true
  PATH="$(uv tool dir --bin):$PATH"
  export PATH
fi

step "ffmpeg"
if has ffmpeg; then
  say "ffmpeg is there."
else
  say "ffmpeg isn't installed. Pressling plays your music without it; the Curator needs it to check that each song plays all the way"
  say "through, to draw waveforms and to find a long quiet start or end."
  case "$(uname -s)" in
    Darwin)
      if ask "Install ffmpeg now with Homebrew (brew install ffmpeg)?" n; then
        if has brew; then run "brew install ffmpeg" brew install ffmpeg; else say "Homebrew isn't installed: see https://brew.sh, then run: brew install ffmpeg"; fi
      else say "Left as it is. Run this again any time to add it."; fi ;;
    *)
      say "To add it, use your system's package manager, for example:"
      say "  sudo apt install ffmpeg        (Debian, Ubuntu)"
      say "  sudo dnf install ffmpeg        (Fedora)"
      say "  sudo pacman -S ffmpeg          (Arch)"
      say "(This script never runs sudo for you.)" ;;
  esac
fi

step "Discogs token"
doctor=""
if has curator; then doctor=$(curator doctor 2>&1) || true; fi
envfile=$(printf '%s\n' "$doctor" | sed -n 's/^DISCOGS_TOKEN: MISSING .* in \(.*\))$/\1/p' | head -n 1)
if [ -z "$doctor" ]; then
  say "(dry run) would check the token with curator doctor."
elif [ -z "$envfile" ]; then
  say "There is a token."
else
  say "The Curator looks songs up on Discogs, which needs a free token (plain playing doesn't)."
  if ask "Set it up now? This opens the Discogs page where you make one, and a file to paste it into." y; then
    run "create $envfile with an empty DISCOGS_TOKEN= line, if it isn't there" sh -c 'mkdir -p "$(dirname "$1")" && { [ -e "$1" ] || printf "DISCOGS_TOKEN=\n" > "$1"; }' sh "$envfile"
    say "On the Discogs page: Generate new token, copy it, paste it right after DISCOGS_TOKEN= in the editor, save, and close the editor."
    openurl "https://www.discogs.com/settings/developers"
    editor="${VISUAL:-${EDITOR:-}}"
    if [ -z "$editor" ]; then if has nano; then editor=nano; else editor=vi; fi; fi
    run "open $envfile in $editor" sh -c "$editor \"\$1\" < /dev/tty" sh "$envfile" # (the terminal itself, so the editor works when this came in through a pipe)
  else say "Left as it is. Run this again any time to set it up."; fi
fi

step "Check"
run "curator doctor" curator doctor || true

if [ "$OPEN" = 0 ]; then say ""; say "All set. Start it any time with: pressling"; exit 0; fi
step "Opening Pressling"
say "Your browser opens. Keep this terminal open while you use it (Ctrl+C here stops it)."
if [ "$DRY" = 1 ]; then say "  (dry run) would run: pressling"; exit 0; fi
exec pressling
