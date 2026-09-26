#!/usr/bin/env python3
"""
Batch-import a list of player UUIDs into the same owners JSON files that
owners_bot.py maintains, using the exact same Hive API check + hat-matching
logic (imported straight from owners_bot.py, not reimplemented).

This does NOT touch Discord at all - no messages, no reactions, no
submissions.json credit (there's no Discord submitter to credit for a bulk
import). It's purely: UUID in -> Hive API check -> owners.json update.

Setup:
    Put this file in the SAME folder as owners_bot.py (it imports from it).
    Put your UUIDs in a text file, one per line (blank lines and lines
    starting with # are ignored). Default expected name: uuids.txt

Usage:
    python3 batch_import_uuids.py uuids.txt
    python3 batch_import_uuids.py uuids.txt --delay 0.5
    python3 batch_import_uuids.py uuids.txt --dry-run

Behavior per UUID (mirrors handle_message's API-check branch):
    - Look the UUID up once via the Hive API.
    - Not found on the API at all -> logged as not-found, skipped.
    - Found -> for every configured hat in HATS, check if this profile has
      that hat. If so, add/update that hat's owners file, keyed by UUID,
      same shape as the live bot writes.
    - Already-on-file UUIDs are updated in place (fresh username/rank/etc.)
      but that's not treated as an error - just logged as "updated".

Output:
    Prints a per-UUID line as it goes, then a summary at the end:
    total processed, newly added per hat, updated per hat, not found,
    and any UUIDs that errored out (network hiccup, bad JSON, etc.) so you
    can re-run just those.
"""

import argparse
import sys
import time

# Reuse the bot's own config, API call, hat-matching, and file I/O so this
# script can never drift out of sync with what the live bot does.
from owners_bot import (
    HATS,
    fetch_profile,
    find_hat_edition,
    load_owners,
    save_owners,
)

DEFAULT_DELAY_SECONDS = 0.3  # be polite to the Hive API across 314 lookups


def read_uuids(path):
    uuids = []
    seen = set()
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            # tolerate a trailing comma or surrounding quotes, in case the
            # list was pasted out of a JSON array or spreadsheet column
            line = line.strip(",").strip('"').strip("'").strip()
            if not line:
                continue
            if line in seen:
                continue
            seen.add(line)
            uuids.append(line)
    return uuids


def process_uuid(uuid, dry_run):
    """
    Returns a dict describing what happened, e.g.:
        {"uuid": ..., "status": "not_found"}
        {"uuid": ..., "status": "error", "error": "..."}
        {"uuid": ..., "status": "ok", "username": ..., "new_hats": [...], "updated_hats": [...], "no_hat": bool}
    """
    try:
        data = fetch_profile(uuid)
    except Exception as e:  # belt-and-suspenders; fetch_profile already catches most
        return {"uuid": uuid, "status": "error", "error": repr(e)}

    if data is None:
        return {"uuid": uuid, "status": "not_found"}

    main_data = data.get("main", {})
    api_uuid = main_data.get("UUID") or uuid  # fall back to input if API omits it
    api_xuid = main_data.get("xuid")
    api_username = main_data.get("username_cc") or main_data.get("username")
    api_rank = main_data.get("rank")

    new_hats = []
    updated_hats = []

    for hat in HATS:
        edition = find_hat_edition(main_data, hat["name"])
        if edition is None:
            continue

        owners = load_owners(hat["owners_path"])
        is_new = api_uuid not in owners
        entry = {
            "edition": edition,
            "rank": api_rank,
            "username": api_username,
            "xuid": api_xuid,
        }

        if not dry_run:
            owners[api_uuid] = entry
            save_owners(hat["owners_path"], owners)

        if is_new:
            new_hats.append(hat["name"])
        else:
            updated_hats.append(hat["name"])

    return {
        "uuid": api_uuid,
        "status": "ok",
        "username": api_username,
        "new_hats": new_hats,
        "updated_hats": updated_hats,
        "no_hat": not new_hats and not updated_hats,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Batch-import player UUIDs into owners JSON files via the Hive API.")
    parser.add_argument("uuid_file", nargs="?", default="uuids.txt",
                         help="Path to a text file with one UUID per line (default: uuids.txt)")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS,
                         help=f"Seconds to sleep between API calls (default: {DEFAULT_DELAY_SECONDS})")
    parser.add_argument("--dry-run", action="store_true",
                         help="Check everything and print results, but don't write to any owners file")
    args = parser.parse_args()

    if not HATS:
        print("Error: HATS is empty in owners_bot.py - configure at least one hat.")
        sys.exit(1)

    # Fail fast if any owners file is missing/invalid, same check owners_bot.py does on startup
    for hat in HATS:
        try:
            load_owners(hat["owners_path"])
        except FileNotFoundError:
            print(f"Error: {hat['owners_path']} (for {hat['name']}) not found.")
            sys.exit(1)
        except Exception as e:
            print(f"Error: {hat['owners_path']} (for {hat['name']}) is not valid JSON: {e}")
            sys.exit(1)

    try:
        uuids = read_uuids(args.uuid_file)
    except FileNotFoundError:
        print(f"Error: couldn't find {args.uuid_file}")
        sys.exit(1)

    if not uuids:
        print(f"No UUIDs found in {args.uuid_file}")
        sys.exit(1)

    print(f"Loaded {len(uuids)} unique UUID(s) from {args.uuid_file}")
    if args.dry_run:
        print("--dry-run: no owners files will be modified\n")

    new_counts = {hat["name"]: 0 for hat in HATS}
    updated_counts = {hat["name"]: 0 for hat in HATS}
    not_found = []
    no_hat = []
    errors = []

    for i, uuid in enumerate(uuids, 1):
        result = process_uuid(uuid, args.dry_run)

        if result["status"] == "error":
            errors.append(uuid)
            print(f"[{i}/{len(uuids)}] {uuid}: ERROR - {result['error']}")
        elif result["status"] == "not_found":
            not_found.append(uuid)
            print(f"[{i}/{len(uuids)}] {uuid}: not found on API")
        else:
            for hat_name in result["new_hats"]:
                new_counts[hat_name] += 1
            for hat_name in result["updated_hats"]:
                updated_counts[hat_name] += 1

            label = result["username"] or uuid
            if result["no_hat"]:
                no_hat.append(uuid)
                print(f"[{i}/{len(uuids)}] {label}: found, no tracked hats")
            else:
                bits = []
                if result["new_hats"]:
                    bits.append("NEW: " + ", ".join(result["new_hats"]))
                if result["updated_hats"]:
                    bits.append("updated: " + ", ".join(result["updated_hats"]))
                print(f"[{i}/{len(uuids)}] {label}: " + " | ".join(bits))

        if i < len(uuids) and args.delay > 0:
            time.sleep(args.delay)

    print("\n--- Summary ---")
    print(f"Processed: {len(uuids)}")
    for hat in HATS:
        print(f"  {hat['name']}: {new_counts[hat['name']]} new, "
              f"{updated_counts[hat['name']]} updated")
    print(f"Not found on API: {len(not_found)}")
    print(f"Found but no tracked hat: {len(no_hat)}")
    print(f"Errors: {len(errors)}")

    if not_found:
        print("\nNot found:")
        for u in not_found:
            print(f"  {u}")
    if errors:
        print("\nErrored (re-run these):")
        for u in errors:
            print(f"  {u}")


if __name__ == "__main__":
    main()
