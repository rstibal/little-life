#!/usr/bin/env python3
"""Re-embed art/*.png into index.html as the SPRITE_DATA block.

index.html is meant to run standalone from disk, so sprites live inside it as
base64 rather than as sibling files. Edit the PNGs in art/, then run this.

    python3 tools/embed.py

Adding a new sprite: drop the PNGs in art/, run this, then add an entry to the
SPRITES map in index.html pointing an object id at the artwork name. Footprints
come from OBJECTS, not from here.
"""

import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / "art"
INDEX = ROOT / "index.html"

START = "const SPRITE_DATA = {"
END = "};"


def main() -> int:
    pngs = sorted(ART.glob("*.png"))
    if not pngs:
        print(f"no PNGs in {ART}", file=sys.stderr)
        return 1

    lines = []
    for png in pngs:
        data = base64.b64encode(png.read_bytes()).decode()
        lines.append(f"  {png.stem}: '{data}',")
    block = START + "\n" + "\n".join(lines) + "\n" + END

    html = INDEX.read_text()
    start = html.find(START)
    if start == -1:
        print("SPRITE_DATA block not found in index.html", file=sys.stderr)
        return 1
    end = html.index("\n" + END, start) + len("\n" + END)

    INDEX.write_text(html[:start] + block + html[end:])

    total = sum(len(l) for l in lines)
    print(f"embedded {len(pngs)} sprites ({total/1024:.0f} KB base64)")
    print(f"index.html is now {INDEX.stat().st_size/1024:.0f} KB")

    # names must be valid JS identifiers since the map uses bare keys
    bad = [p.stem for p in pngs if not re.fullmatch(r"[A-Za-z_$][\w$]*", p.stem)]
    if bad:
        print(f"warning: these filenames are not valid JS keys: {bad}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
