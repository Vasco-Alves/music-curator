#!/usr/bin/env python3
"""Tell 'sped up / pitched' apart from 'edited / cut' when two copies of a track differ in length.

Usage: curator drift <copy> <reference>
Aligns 20-second chunks of the first file inside the second. A steady, linear drift of the offsets
means a different playback speed (slope = speed factor); jumps mean sections were cut or added.
Prints JSON with per-chunk matches and the fitted speed factor.
"""
import json
import os
import sys

from . import fpcompare as fp


def best_offset(chunk, ref):
    best = (1.0, 0)
    for off in range(0, len(ref) - len(chunk) + 1):
        bits = sum((chunk[i] ^ ref[off + i]).bit_count() for i in range(0, len(chunk), 2))
        ber = bits / (32 * len(range(0, len(chunk), 2)))
        if ber < best[0]:
            best = (ber, off)
    return best


def analyse(a, b, chunk_s=20):
    n = int(chunk_s / fp.ITEM_S)
    rows = []
    for start in range(0, len(a) - n, n):
        ber, off = best_offset(a[start:start + n], b)
        rows.append({"t_a": round(start * fp.ITEM_S), "t_b": round(off * fp.ITEM_S, 1), "ber": round(ber, 3)})
    good = [r for r in rows if r["ber"] < 0.3]
    slope = None
    if len(good) >= 3:
        # Theil-Sen: median of pairwise slopes, so an intro chunk that matches the outro can't skew it
        pairs = [(b["t_b"] - a["t_b"]) / (b["t_a"] - a["t_a"])
                 for i, a in enumerate(good) for b in good[i + 1:] if b["t_a"] != a["t_a"]]
        pairs.sort()
        slope = pairs[len(pairs) // 2]
    return rows, slope


def main(argv=None):
    argv = sys.argv[1:] if argv is None else list(argv)
    a, b = fp.fingerprint(argv[0]), fp.fingerprint(argv[1])
    rows, slope = analyse(a, b)
    print(json.dumps({"speed_factor": round(slope, 4) if slope else None,
                      "matched_chunks": sum(r["ber"] < 0.3 for r in rows), "chunks": len(rows), "rows": rows}))


if __name__ == "__main__":
    main()
