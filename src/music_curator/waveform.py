"""The shape of a song, drawn in the seek bar so you can see where the breakdowns and drops are, and where its sound starts and ends, so a long quiet start or end can be skipped.

Measured once per file with ffmpeg, which takes well under a second for a song. The shape goes by how much energy each slice of the song has, not by
its peaks: nearly every file reaches full scale all the way through, so peaks would draw a solid block. Measuring never changes the file.
"""
import array
import math
import operator
import re
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

# Where the sound starts and ends: at the full sample rate, so a song that opens on hi-hats alone isn't taken for quiet
QUIET_DB = -60  # a stretch where nothing reaches this is quiet. Measured on a whole library: lower finds hardly any more, higher starts taking the first seconds of a slow fade-in
QUIET_S = 1  # quiet shorter than this at the start or the end is left alone
_QUIET_LINE = re.compile(r"\[(?:Parsed_)?silencedetect\w* @ [^\]]*\] silence_(start|end): ([-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)")
_STARTS_AT = re.compile(r"(?m)^\s*Duration: [^,]*, start: (-?\d+(?:\.\d+)?)")  # where the file's own clock starts, from ffmpeg's description of it
LATE_START_S = 0.2  # a file whose clock starts later than this isn't measured: a browser may keep that offset, and the times would not line up


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


def sounding(log, length):
    """Where the sound starts and ends, in seconds, from ffmpeg's silencedetect lines and the song's length: [start, end]. A song with no quiet
    at the start starts at 0 and one with none at the end ends at its length; quiet in the middle doesn't count. None if it's quiet all the way through."""
    runs = []
    for line in log.replace("\r", "\n").split("\n"):  # only real line breaks: a tag can hold other characters that splitlines() would break on
        m = _QUIET_LINE.match(line)
        if not m:
            continue
        if m[1] == "start":
            runs.append([float(m[2]), None])
        elif runs and runs[-1][1] is None:
            runs[-1][1] = float(m[2])
    start, end = 0.0, length
    for began, ended in runs:
        ended = length if ended is None else min(ended, length)  # quiet still going when the song ran out (older ffmpeg doesn't say it ended)
        if began <= 0.05 and ended < length - 0.05:
            start = ended
        if ended >= length - 0.05:
            end = min(end, max(began, 0.0))
    start, end = round(start, 2), round(end, 2)
    return [start, end] if end > start else None


def edges(path):
    """Where the sound of a song starts and ends, [start, end] in seconds, or None if it can't be told."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    with _slots:
        try:
            done = subprocess.run([ffmpeg, "-hide_banner", "-nostdin", "-nostats", "-v", "info", "-progress", "pipe:1", "-i", path, "-map", "0:a:0",
                                   "-af", f"highpass=f=20,silencedetect=noise={QUIET_DB}dB:d={QUIET_S}", "-f", "null", "-"],
                                  capture_output=True, timeout=TIMEOUT_S, creationflags=folders.NO_WINDOW)
        except (OSError, subprocess.SubprocessError):
            return None
    if done.returncode:
        return None
    length = None
    for line in done.stdout.decode("ascii", "replace").splitlines():  # how much audio there was, from the progress ffmpeg reports as it goes
        key, _, value = line.partition("=")
        if key.strip() == "out_time_us" and value.strip().isdigit():
            length = int(value) / 1e6
    log = done.stderr.decode("utf-8", "replace")
    late = _STARTS_AT.search(log)
    if not length or (late and float(late[1]) > LATE_START_S):  # (a clock that starts before 0 is moved to 0 by ffmpeg and the browsers alike)
        return None
    return sounding(log, length)
