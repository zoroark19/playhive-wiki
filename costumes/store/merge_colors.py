#!/usr/bin/env python3
"""
merge_colors.py
-------------------------------------------------------------------------
Merges color data from a colors2.txt file (produced by
extract_hex_colors.py, one line per costume: `slug` followed by one or
more `` `#hexcode` (NN.N%) `` entries) into a store-costumes.json file,
matching on each item's `slug` and writing the result into that item's
`colors` array as a list of { "hex": ..., "percent": ... } objects.

Usage:
    python3 merge_colors.py colors2.txt store-costumes.json -o store-costumes-merged.json

If -o/--output is omitted, the input JSON file is overwritten in place.

Any slug present in colors2.txt but missing from store-costumes.json, and
any item in store-costumes.json with no matching line in colors2.txt, are
reported at the end but do not stop the merge — items with no match keep
whatever `colors` value (if any) they already had.
"""

import argparse
import json
import re
import sys

LINE_RE = re.compile(r"`(#[0-9a-fA-F]{6})`\s*\(([\d.]+)%\)")


def parse_colors2(path):
    """Returns {slug: [{"hex": ..., "percent": ...}, ...]}."""
    colors_by_slug = {}
    with open(path, "r", encoding="utf-8") as f:
        for line_num, raw_line in enumerate(f, start=1):
            line = raw_line.rstrip("\n").rstrip("\r")
            if not line.strip():
                continue

            parts = line.split(" ", 1)
            slug = parts[0]
            rest = parts[1] if len(parts) > 1 else ""

            matches = LINE_RE.findall(rest)
            if not matches:
                print(
                    f"Warning: no color data parsed on line {line_num} "
                    f"(slug={slug!r}) — skipping",
                    file=sys.stderr,
                )
                continue

            colors_by_slug[slug] = [
                {"hex": hexcode.lower(), "percent": float(pct)}
                for hexcode, pct in matches
            ]
    return colors_by_slug


def merge(colors2_path, json_path, output_path):
    colors_by_slug = parse_colors2(colors2_path)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", [])

    matched = 0
    unmatched_items = []
    for item in items:
        slug = item.get("slug")
        if slug in colors_by_slug:
            item["colors"] = colors_by_slug[slug]
            matched += 1
        else:
            unmatched_items.append(slug)

    unmatched_lines = sorted(
        set(colors_by_slug.keys()) - {item.get("slug") for item in items}
    )

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Parsed {len(colors_by_slug)} slugs from {colors2_path}")
    print(f"Matched {matched} / {len(items)} items in {json_path}")
    if unmatched_items:
        print(f"Items with no matching colors2.txt line ({len(unmatched_items)}):")
        for slug in unmatched_items:
            print(f"  - {slug}")
    if unmatched_lines:
        print(f"colors2.txt lines with no matching item ({len(unmatched_lines)}):")
        for slug in unmatched_lines:
            print(f"  - {slug}")
    print(f"Wrote merged output to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Merge colors2.txt dominant-color data into store-costumes.json (or any similarly-shaped catalog file)."
    )
    parser.add_argument("colors2", help="Path to colors2.txt")
    parser.add_argument("json_file", help="Path to store-costumes.json (or similar)")
    parser.add_argument(
        "-o",
        "--output",
        help="Output path (default: overwrite json_file in place)",
    )
    args = parser.parse_args()

    output_path = args.output or args.json_file
    merge(args.colors2, args.json_file, output_path)


if __name__ == "__main__":
    main()