"""The shape of a song, drawn in the seek bar so you can see where the breakdowns and drops are.

Measured once per file with ffmpeg, which takes well under a second for a song. It goes by how much energy each slice of the song has, not by
its peaks: nearly every file reaches full scale all the way through, so peaks would draw a solid block. Measuring never changes the file.
"""
import array
import math
import operator
import shutil
import subprocess
import sys
import threading

from . import folders

SLICES = 400
RATE = 4000  # samples a second: plenty to tell how much is going on in each slice
CONTRAST = 1.6  # quieter parts are drawn lower than they are, so a breakdown stands out. Tried on real songs: less looks flat, more loses the detail
SILENT = 30  # out of 32767: below this there's nothing to draw
TIMEOUT_S = 120
_slots = threading.BoundedSemaphore(2)  # the page asks for the next song ahead of time, so never more than a couple at once


def shape(raw):
    """How much is going on in each slice of some 16-bit mono audio, from 0 to 100 with the busiest slice at 100. None if there's nothing to draw."""
    samples = array.array("h")
    samples.frombytes(raw[:len(raw) // 2 * 2])
    if sys.byteorder == "big":
        samples.byteswap()
    if len(samples) < SLICES:
        return None
    step, levels = len(samples) / SLICES, []
    for n in range(SLICES):
        part = samples[int(n * step):int((n + 1) * step)]
        levels.append(math.sqrt(sum(map(operator.mul, part, part)) / len(part)))
    top = max(levels)
    return [round(100 * (level / top) ** CONTRAST) for level in levels] if top >= SILENT else None


def measure(path):
    """The shape of a song, or None if it can't be told."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    with _slots:
        try:
            raw = subprocess.run([ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                                 capture_output=True, timeout=TIMEOUT_S, creationflags=folders.NO_WINDOW).stdout
        except (OSError, subprocess.SubprocessError):
            return None
    return shape(raw)
