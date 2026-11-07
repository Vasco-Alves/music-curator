#!/usr/bin/env python3
"""Check whether two audio files are the same recording, using Chromaprint fingerprints (via ffmpeg).

Usage: curator compare <file_a> <file_b>
Prints JSON: {"ber": bit error rate at the best alignment (0 = identical, ~0.5 = unrelated),
              "offset_s": how far b is shifted against a, "overlap_s": compared length, "verdict": ...}
Same recording (even a different rip or master) is typically < 0.25; a different song ~0.45-0.5.
"""
import json
import struct
import subprocess
import sys

ITEM_S = 0.1238  # seconds per fingerprint item (4096-sample frames at 11025 Hz, 2/3 overlap)


def fingerprint(path):
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path,
                          "-f", "chromaprint", "-fp_format", "raw", "-"], capture_output=True).stdout
    return list(struct.unpack(f"<{len(raw) // 4}I", raw[: len(raw) // 4 * 4]))


def compare(a, b, max_offset_s=90, min_overlap_items=120):
    best = (1.0, 0, 0)
    max_off = int(max_offset_s / ITEM_S)
    for off in range(-max_off, max_off + 1):
        if off >= 0:
            pa, pb = a[off:], b
        else:
            pa, pb = a, b[-off:]
        n = min(len(pa), len(pb))
        if n < min_overlap_items:
            continue
        step = 2 if n > 1500 else 1  # sample every other item on long overlaps (fast, still precise)
        bits = sum((pa[i] ^ pb[i]).bit_count() for i in range(0, n, step))
        ber = bits / (32 * len(range(0, n, step)))
        if ber < best[0]:
            best = (ber, off, n)
    return best


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    fa, fb = fingerprint(argv[0]), fingerprint(argv[1])
    ber, off, n = compare(fa, fb)
    verdict = "same recording" if ber < 0.3 else ("unsure" if ber < 0.4 else "different")
    print(json.dumps({"ber": round(ber, 3), "offset_s": round(off * ITEM_S, 1),
                      "overlap_s": round(n * ITEM_S), "verdict": verdict}))


if __name__ == "__main__":
    main()
