#!/usr/bin/env python3
"""
Walks a directory tree of costume wiki HTML pages and, for each file:

  1. Extracts the costume name from the <div class="infobox__header">...</div>.
  2. Finds the paragraph (whitespace/line-ending tolerant):
       <p>
         Aside from the costume itself, purchasing grants the player
         the following cosmetics:
       </p>
     and rewrites it to insert the costume name after "purchasing":
       <p>
         Aside from the costume itself, purchasing <NAME> grants the player
         the following cosmetics:
       </p>
Matching is done against the exact wording ("Aside from the costume itself,
purchasing grants the player the following cosmetics:") but is tolerant of
whitespace differences (spaces/newlines/CRLF vs LF) between words, since the
actual files use CRLF line endings and slightly different line-wrapping than
originally pasted. Files that don't match this exact wording are skipped and
reported, so nothing is silently missed.

Original line endings (CRLF or LF) of each file are preserved.

Run it with no arguments. It automatically scans every "index.html" file in
the same folder as this script and all of its subfolders (recursively) —
no path argument needed.

Usage:
    python3 update_costumes.py
"""

import re
import sys
from pathlib import Path

# Whitespace-tolerant pattern for the original paragraph. \s+ matches any
# run of spaces/tabs/newlines/CRLF between words.
OLD_P_RE = re.compile(
    r'<p>\s*'
    r'Aside from the costume itself,\s*purchasing\s*grants the player\s*'
    r'the\s*following cosmetics:\s*'
    r'</p>',
    re.DOTALL,
)

# Regex to locate the infobox header value, e.g.:
# <div class="infobox__header">Archy</div>
INFOBOX_HEADER_RE = re.compile(
    r'<div class="infobox__header">(.*?)</div>', re.DOTALL
)


def process_file(path: Path):
    # Read raw bytes to detect original line ending style, then normalize
    # to \n for matching, and restore \r\n on write if that's what was used.
    raw = path.read_bytes()
    uses_crlf = b'\r\n' in raw
    text = raw.decode('utf-8')
    text_lf = text.replace('\r\n', '\n')

    match = OLD_P_RE.search(text_lf)
    if not match:
        return "skipped-no-paragraph-match"

    header_match = INFOBOX_HEADER_RE.search(text_lf)
    if not header_match:
        return "skipped-no-infobox-header"

    name = header_match.group(1).strip()
    if not name:
        return "skipped-empty-infobox-header"

    new_block = (
        "<p>\n"
        f"              Aside from the costume itself, purchasing {name} grants the player\n"
        "              the following cosmetics:\n"
        "            </p>"
    )

    new_text_lf = text_lf[:match.start()] + new_block + text_lf[match.end():]

    if new_text_lf == text_lf:
        return "skipped-no-change"

    final_text = new_text_lf.replace('\n', '\r\n') if uses_crlf else new_text_lf
    path.write_bytes(final_text.encode('utf-8'))
    return f"updated ({name})"


def main():
    # Root = the folder this script lives in.
    root = Path(__file__).resolve().parent

    html_files = sorted(root.rglob("index.html"))
    if not html_files:
        print(f"No index.html files found under {root}")
        sys.exit(0)

    updated = []
    skipped = []
    for f in html_files:
        status = process_file(f)
        if status.startswith("updated"):
            updated.append((f, status))
        else:
            skipped.append((f, status))

    print(f"Total HTML files scanned: {len(html_files)}")
    print(f"Updated: {len(updated)}")
    for f, status in updated:
        print(f"  [OK] {f.relative_to(root)} -> {status}")

    if skipped:
        print(f"\nSkipped: {len(skipped)}")
        for f, status in skipped:
            print(f"  [SKIP] {f.relative_to(root)} -> {status}")


if __name__ == "__main__":
    main()