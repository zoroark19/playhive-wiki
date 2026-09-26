#!/usr/bin/env python3
"""
python extract_hex_colors.py . --ignore-alpha -o colors.txt

Walks a root directory, finds every subfolder containing a skin.png, and
prints that folder's name followed by its DOMINANT hex colors (in
markdown inline-code format), one folder per line.

"Dominant" means: each color's share of the image's total pixel count
(not just how many *distinct* colors exist). A costume can easily have
dozens of near-identical anti-aliasing/shading colors that are each used
on only a handful of pixels — those get filtered out via --min-coverage
so two costumes that both happen to have a few stray brown outline
pixels don't get lumped into the same color group. What's left is
capped at --max-colors, so the output is genuinely "what color is this
costume", not "every color that appears anywhere in it".

Usage:
    python3 extract_hex_colors.py path/to/root_folder
    python3 extract_hex_colors.py path/to/root_folder --output colors.txt
    python3 extract_hex_colors.py path/to/root_folder --ignore-alpha
    python3 extract_hex_colors.py path/to/root_folder --sort hex
    python3 extract_hex_colors.py path/to/root_folder --min-coverage 2.0
    python3 extract_hex_colors.py path/to/root_folder --max-colors 8
    python3 extract_hex_colors.py path/to/root_folder --show-percent

Output format (one line per subfolder that has a skin.png):
    Koffee `#ffffff` `#d2e2ee` `#9bafca` ...

With --show-percent:
    Koffee `#ffffff` (34.2%) `#d2e2ee` (18.5%) `#9bafca` (9.1%) ...
"""

import argparse
import os
from PIL import Image


def extract_hex_colors(image_path, ignore_transparent=True):
    """Returns {hex_code: pixel_count} for every non-filtered color."""
    img = Image.open(image_path).convert("RGBA")
    colors = img.getcolors(maxcolors=img.width * img.height)  # (count, (r,g,b,a))

    hex_counts = {}
    total_pixels = 0
    for count, (r, g, b, a) in colors:
        if ignore_transparent and a == 0:
            continue
        total_pixels += count
        hex_code = f"#{r:02x}{g:02x}{b:02x}"
        hex_counts[hex_code] = hex_counts.get(hex_code, 0) + count

    return hex_counts, total_pixels


def dominant_colors(hex_counts, total_pixels, min_coverage=0.0, max_colors=None):
    """
    Filters hex_counts down to colors that cover at least `min_coverage`
    percent of total_pixels, sorted by coverage (most-used first), then
    truncates to `max_colors` if given.

    Returns a list of (hex_code, pixel_count, percent) tuples.
    """
    if total_pixels <= 0:
        return []

    ranked = sorted(hex_counts.items(), key=lambda x: x[1], reverse=True)

    result = []
    for hex_code, count in ranked:
        percent = (count / total_pixels) * 100
        if percent < min_coverage:
            continue
        result.append((hex_code, count, percent))

    if max_colors is not None:
        result = result[:max_colors]

    return result


def find_skin_pngs(root_dir):
    """Yield (folder_name, full_path) for every subfolder containing skin.png."""
    results = []
    for entry in sorted(os.listdir(root_dir)):
        folder_path = os.path.join(root_dir, entry)
        if os.path.isdir(folder_path):
            skin_path = os.path.join(folder_path, "skin.png")
            if os.path.isfile(skin_path):
                results.append((entry, skin_path))
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Extract dominant hex colors (by pixel coverage) from every skin.png found in subfolders."
    )
    parser.add_argument("root", help="Path to the root folder containing subfolders")
    parser.add_argument("-o", "--output", help="Optional path to save the output")
    parser.add_argument(
        "--sort",
        choices=["hex", "count"],
        default="count",
        help="Sort colors by hex code or by pixel count/coverage (default: count, most-covering first)",
    )
    parser.add_argument(
        "--ignore-alpha",
        action="store_true",
        help="Ignore fully transparent pixels (alpha = 0)",
    )
    parser.add_argument(
        "--min-coverage",
        type=float,
        default=1.0,
        help="Drop colors covering less than this percent of the image's "
        "total pixels (default: 1.0). This is what keeps incidental "
        "shared colors (thin outlines, tiny highlights) from diluting "
        "a costume's actual dominant palette. Set to 0 to disable.",
    )
    parser.add_argument(
        "--max-colors",
        type=int,
        default=12,
        help="Keep at most this many colors per costume, after the "
        "coverage filter (default: 12). Set to 0 to disable the cap.",
    )
    parser.add_argument(
        "--show-percent",
        action="store_true",
        help="Print each color's pixel-coverage percentage alongside its hex code.",
    )
    args = parser.parse_args()

    skins = find_skin_pngs(args.root)

    if not skins:
        print(f"No skin.png files found in subfolders of {args.root}")
        return

    max_colors = None if args.max_colors == 0 else args.max_colors

    output_lines = []

    for folder_name, skin_path in skins:
        hex_counts, total_pixels = extract_hex_colors(
            skin_path, ignore_transparent=args.ignore_alpha
        )

        dominant = dominant_colors(
            hex_counts,
            total_pixels,
            min_coverage=args.min_coverage,
            max_colors=max_colors,
        )

        if args.sort == "hex":
            dominant = sorted(dominant, key=lambda x: x[0])
        # "count" sort is already coverage-descending from dominant_colors

        if args.show_percent:
            colors_str = " ".join(
                f"`{hex_code}` ({percent:.1f}%)" for hex_code, _, percent in dominant
            )
        else:
            colors_str = " ".join(f"`{hex_code}`" for hex_code, _, _ in dominant)

        line = f"{folder_name} {colors_str}"
        output_lines.append(line)
        print(line)

    if args.output:
        with open(args.output, "w") as f:
            f.write("\n".join(output_lines) + "\n")
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()