#!/usr/bin/env python3
"""
Removes duplicate UUIDs from players.log, in place.

For each line, the first UUID found on it (matched the same way
scan_uuids.py's load_uuids_from_log() does - the standard 8-4-4-4-12 hex
shape, anywhere in the line, case-insensitive) is used as that line's dedupe
key:
    - First time a UUID is seen -> the line is kept.
    - Any later line with a UUID already seen -> the line is dropped.
    - Lines with no UUID on them at all are left alone (kept as-is) - this
      script only removes genuine UUID duplicates, not unrelated log lines.

A backup of the original file is written to players.log.bak before
anything is overwritten, so a bad run is always recoverable.

Usage:
    python3 dedupe_players_log.py

Edit PLAYERS_LOG_PATH below if players.log lives somewhere else.
"""

import re
import sys

PLAYERS_LOG_PATH = "players.log"
BACKUP_SUFFIX = ".bak"

# Same pattern as scan_uuids.py's UUID_RE, so both scripts agree on what
# counts as a UUID regardless of the surrounding line format.
UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def dedupe_log(path):
    """
    Reads `path`, drops every line whose UUID has already appeared earlier
    in the file, and writes the result back to `path` (after backing up
    the original to `path + BACKUP_SUFFIX`).

    Returns a dict of counts: total_lines, kept_lines, removed_duplicates,
    unique_uuids, lines_without_uuid.
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Error: {path} not found.")
        sys.exit(1)

    seen_uuids = set()
    kept_lines = []
    removed_duplicates = 0
    lines_without_uuid = 0

    for line in lines:
        match = UUID_RE.search(line)
        if match is None:
            kept_lines.append(line)
            lines_without_uuid += 1
            continue

        uuid = match.group(0).lower()
        if uuid in seen_uuids:
            removed_duplicates += 1
            continue

        seen_uuids.add(uuid)
        kept_lines.append(line)

    if removed_duplicates == 0:
        print(f"No duplicate UUIDs found in {path} - nothing to do.")
        return {
            "total_lines": len(lines),
            "kept_lines": len(kept_lines),
            "removed_duplicates": 0,
            "unique_uuids": len(seen_uuids),
            "lines_without_uuid": lines_without_uuid,
        }

    backup_path = path + BACKUP_SUFFIX
    with open(backup_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(kept_lines)

    return {
        "total_lines": len(lines),
        "kept_lines": len(kept_lines),
        "removed_duplicates": removed_duplicates,
        "unique_uuids": len(seen_uuids),
        "lines_without_uuid": lines_without_uuid,
    }


def main():
    if len(sys.argv) != 1:
        print("Usage: python3 dedupe_players_log.py")
        print(
            "(edit PLAYERS_LOG_PATH near the top of this file to change which log is deduped)")
        sys.exit(1)

    stats = dedupe_log(PLAYERS_LOG_PATH)

    if stats["removed_duplicates"] > 0:
        print(f"Read {stats['total_lines']} line(s) from {PLAYERS_LOG_PATH}")
        print(f"  {stats['unique_uuids']} unique UUID(s) kept")
        print(f"  {stats['lines_without_uuid']} line(s) with no UUID left untouched")
        print(f"  {stats['removed_duplicates']} duplicate line(s) removed")
        print(f"Backup of the original saved to {PLAYERS_LOG_PATH}{BACKUP_SUFFIX}")
        print(f"{PLAYERS_LOG_PATH} updated.")


if __name__ == "__main__":
    main()
