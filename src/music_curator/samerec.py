#!/usr/bin/env python3
"""Decide whether two files are the same recording, even if one plays at a different speed or was
cut / faded early. Uses Chromaprint fingerprints (fpcompare) and chunk alignment (fpdrift).

Verdict "same" when either:
  - the whole-file bit error rate is < 0.2, or
  - >= 70% of 20 s chunks align (BER < 0.3) and the alignment moves in step (robust slope 0.97-1.03),
    directly or after resampling the copy by the speed difference.
Usage: curator same <copy> <reference> [--tmp DIR]
"""
import json
import os
import subprocess
import sys

from . import fpcompare as fp
from . import fpdrift


def _probe(p, entry):
    return subprocess.run(["ffprobe", "-v", "quiet", "-select_streams", "a:0", "-show_entries", entry, "-of", "csv=p=0", p],
                          capture_output=True, text=True).stdout.strip()


def duration(p):
    return float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                capture_output=True, text=True).stdout)


def _aligned(rows, slope):
    good = [r for r in rows if r["ber"] < 0.3]
    frac = f"{len(good)}/{len(rows)}"
    if not rows or len(good) / len(rows) < 0.7:
        return False, frac
    if slope is not None and 0.97 <= slope <= 1.03:
        return True, frac
    # an edit (a section cut out): consecutive matched chunks advance in step, with forward jumps only
    steps = [(b["t_b"] - a["t_b"]) / (b["t_a"] - a["t_a"]) for a, b in zip(good, good[1:]) if b["t_a"] > a["t_a"]]
    in_step = sum(0.95 <= s <= 1.05 for s in steps)
    forward = all(s > 0 for s in steps)
    return bool(steps) and forward and in_step / len(steps) >= 0.7, frac + " (edited)"


def same_recording(copy, ref, tmp):
    a, b = fp.fingerprint(copy), fp.fingerprint(ref)
    ber, off, n = fp.compare(a, b)
    info = {"ber": round(ber, 3)}
    if ber < 0.2:
        return True, {**info, "how": "fingerprints match"}
    rows, slope = fpdrift.analyse(a, b)
    ok, frac = _aligned(rows, slope)
    info.update({"chunks": frac, "slope": round(slope, 3) if slope else None})
    if ok:
        return True, {**info, "how": "chunks align (copy cut or faded)"}
    # speed difference: estimate it from how fast matched chunks advance (robust to cuts), else from the
    # length ratio; then resample the copy (turntable-style) and try again
    good = [r for r in rows if r["ber"] < 0.3]
    steps = sorted((b["t_b"] - a["t_b"]) / (b["t_a"] - a["t_a"]) for a, b in zip(good, good[1:])
                   if b["t_a"] > a["t_a"] and 0.88 < (b["t_b"] - a["t_b"]) / (b["t_a"] - a["t_a"]) < 1.12)
    factor = steps[len(steps) // 2] if len(steps) >= 3 else duration(ref) / duration(copy)
    if 0.88 < factor < 1.12 and abs(factor - 1) > 0.004:
        os.makedirs(tmp, exist_ok=True)
        sr = int(_probe(copy, "stream=sample_rate"))
        adj = os.path.join(tmp, "speed_adjusted.wav")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", copy, "-af",
                        f"asetrate={round(sr / factor)},aresample={sr}", adj], check=True)
        rows2, slope2 = fpdrift.analyse(fp.fingerprint(adj), b)
        ok2, frac2 = _aligned(rows2, slope2)
        info.update({"speed_factor": round(factor, 4), "adjusted_chunks": frac2,
                     "adjusted_slope": round(slope2, 3) if slope2 else None})
        if ok2:
            return True, {**info, "how": f"same recording; your copy plays {abs(factor - 1) * 100:.1f}% "
                                          f"{'fast' if factor > 1 else 'slow'}"}
    return False, {**info, "how": "no match"}


def hf_db(p):
    """Mean level above 16 kHz (dB): low values mean a low-quality source with the top end cut off."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", p, "-af", "highpass=f=16000,volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "mean_volume" in line:
            return float(line.split("mean_volume:")[1].split("dB")[0])
    return None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    same, details = same_recording(argv[0], argv[1], argv[2])
    print(json.dumps({"same": same, **details}))


if __name__ == "__main__":
    main()
