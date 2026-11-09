"""How loud a song is, so the player can bring the loud ones down to match the rest.

Measured once per file with ffmpeg's EBU R128 filter, which reads the whole song but takes only a second or so. The result is the song's integrated loudness in LUFS.
Measuring never changes the file: the player only turns its own volume down.
"""
import re
import shutil
import subprocess
import threading

from . import folders

TIMEOUT_S = 120
SILENT_LUFS = -60  # ffmpeg reports about -70 for silence, and there's nothing to even out in that
_slots = threading.BoundedSemaphore(2)  # the page asks for the next song ahead of time, so never more than a couple at once


def measure(path):
    """A song's loudness in LUFS, or None if it can't be told."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    with _slots:
        try:
            said = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-nostdin", "-i", path, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                                  capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_S, creationflags=folders.NO_WINDOW).stderr or ""
        except (OSError, subprocess.SubprocessError):
            return None
    found = re.search(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", said[said.rfind("Summary:"):])
    level = float(found[1]) if found else None
    return level if level is not None and level > SILENT_LUFS else None
