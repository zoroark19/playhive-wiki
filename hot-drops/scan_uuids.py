import os
import re
import json
import socket
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

API_URL_TEMPLATE = "https://api.playhive.com/v0/game/all/main/{ident}"
REQUEST_TIMEOUT_SECONDS = 15

MIN_SECONDS_BETWEEN_REQUESTS = 0.5

RATE_LIMIT_SAFETY_MARGIN = 5

ASSUMED_WINDOW_SECONDS = 60

OVERWRITE_EXISTING = False

# --- Connectivity handling -------------------------------------------------
# If the connection drops (wifi goes out, router hiccups, etc.) the scanner
# pauses and waits for it to come back instead of burning through retries or
# crashing. It checks connectivity by trying to open a TCP connection to a
# couple of well-known, highly-reliable hosts (not the Hive API itself,
# since we want to distinguish "internet is down" from "Hive's API happens
# to be down/slow").
CONNECTIVITY_CHECK_HOSTS = [
    ("1.1.1.1", 53),
    ("8.8.8.8", 53),
]
CONNECTIVITY_CHECK_TIMEOUT_SECONDS = 5
CONNECTIVITY_RECHECK_INTERVAL_SECONDS = 5
# After connectivity looks back up, wait this long before actually retrying,
# since the first moment a router comes back online it's often still flaky.
CONNECTIVITY_SETTLE_SECONDS = 3

# UUIDs to scan are read from PLAYERS_LOG_PATH at runtime (see
# load_uuids_from_log() below) instead of being hardcoded here - point this
# at your server's players.log (or any log file that contains player
# UUIDs anywhere in its text).
PLAYERS_LOG_PATH = "players.log"

# Matches the standard 8-4-4-4-12 hex UUID shape anywhere in a line, so it
# works regardless of the surrounding log format (timestamps, "UUID of
# player X is ...", JSON, plain one-per-line, etc.) - whatever actually
# produced players.log.
UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def load_uuids_from_log(path):
    """
    Extracts every UUID found in players.log, de-duplicated and in
    first-seen order. Exits with a clear error if the file doesn't exist,
    same as the old fail-fast behavior for a missing/misconfigured list.
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except FileNotFoundError:
        print(f"Error: {path} not found.")
        print(
            "Point PLAYERS_LOG_PATH near the top of this file at your players log, "
            "or create it first.")
        sys.exit(1)

    seen = set()
    uuids = []
    for match in UUID_RE.finditer(text):
        candidate = match.group(0).lower()
        if candidate not in seen:
            seen.add(candidate)
            uuids.append(candidate)
    return uuids


HATS = [
    {
        "name": "Starfire Crown",
        "owners_path": "owners.json",
    },
    {
        "name": "Soulfire Crown",
        "owners_path": "soulfire_owners.json",
    },
]

HUB_TITLES_PATH = "hub-titles.json"

TITLES = [
    {"name": "Translator", "kind": "title"},
    {"name": "The Shipwright", "kind": "title"},
    {"name": "Spooky Snapper", "kind": "title"},
    {"name": "Disco Dynamo", "kind": "title"},
    {"name": "Buzztastic Creator", "kind": "title"},
    {"name": "Beeday Builder", "kind": "title"},
    {"name": "Legendary Shipwright", "kind": "title"},
    {"name": "Parkour Picasso", "kind": "title"},
    {"name": "Award Winning Director", "kind": "title"},
    {"name": "Deadly Designer", "kind": "title"},
    {"name": "Spooky Storyteller", "kind": "title"},
    {"name": "Movie Maverick", "kind": "title"},
    {"name": "Snowflake Sculptor", "kind": "title"},
    {"name": "Snowman Maestro", "kind": "title"},
    {"name": "Cake Connoisseur", "kind": "title"},
    {"name": "Orbital Illustrator", "kind": "title"},
    {"name": "Dancefloor Hero", "kind": "title"},
    {"name": "Brrrilliant Artist", "kind": "title"},
    {"name": "The Bargain Hunter", "kind": "title"},
]

# Each plushie is checked individually (like a hat/title), but all plushies
# share ONE file (PLUSHIES_PATH) the same way titles all share
# HUB_TITLES_PATH. "match" says where to look on the profile: "pet" checks
# the flat "pets" list for that exact name; "backbling" checks
# "cosmetics.backbling" (flat or nested) for an entry whose "name" matches.
# See find_plushie_match() below. Kept in sync with owners_bot.py's
# PLUSHIES list - update both if a plushie is added/renamed.
#
# NOTE: Artist's Canvas is deliberately NOT included here (or anywhere in
# this scanner). Hive's API has no field exposing whether a player owns
# it, so unlike hats/titles/plushies it can't be detected from a profile
# scan - owners_bot.py only adds it manually via a Discord command.
PLUSHIES_PATH = "plushies.json"

PLUSHIES = [
    {"name": "Cubee", "match": "pet", "kind": "plushie"},
    {"name": "Ender Wings", "match": "backbling", "kind": "plushie"},
    {"name": "Ghosty", "match": "pet", "kind": "plushie"},
]

# Costumes share one file (COSTUMES_PATH) the same way plushies share
# PLUSHIES_PATH and titles share HUB_TITLES_PATH. Kept in sync with
# owners_bot.py's COSTUMES list - update both if a costume is added/renamed.
COSTUMES_PATH = "hive_bee.json"

COSTUMES = [
    {"name": "Hive Bee", "kind": "costume"},
]

# Artist's Canvas is tracked by owners_bot.py but deliberately NOT included
# in scanning here (see note on PLUSHIES_PATH above) - Hive's API has no
# field exposing ownership of it, so it can only be added manually via a
# Discord command in owners_bot.py. Listed here only so this file's item
# list/labels stay consistent with owners_bot.py if ever referenced.
ARTIST_CANVAS_ITEM = {
    "name": "Artist's Canvas",
    "owners_path": "artist_canvas_owners.json",
    "kind": "manual",
}


def load_owners(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        print(f"[warn] {path} has invalid JSON ({e}); treating as empty "
              f"for this run rather than crashing. Fix or delete the file "
              f"to clear this warning.")
        return {}


def save_owners(path, owners):
    # Write to a temp file and atomically replace, so a crash/power-loss
    # mid-write can never leave owners.json (etc.) truncated/corrupted.
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(owners, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def _load_json_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        print(f"[warn] {path} has invalid JSON ({e}); treating as empty "
              f"for this run rather than crashing. Fix or delete the file "
              f"to clear this warning.")
        return {}


def _save_json_file(path, data):
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def load_hub_titles_file():
    return _load_json_file(HUB_TITLES_PATH)


def save_hub_titles_file(data):
    _save_json_file(HUB_TITLES_PATH, data)


def load_plushies_file():
    return _load_json_file(PLUSHIES_PATH)


def save_plushies_file(data):
    _save_json_file(PLUSHIES_PATH, data)


def load_costumes_file():
    return _load_json_file(COSTUMES_PATH)


def save_costumes_file(data):
    _save_json_file(COSTUMES_PATH, data)


def load_item_owners(item):
    if item.get("kind") == "title":
        return load_hub_titles_file().get(item["name"], {})
    if item.get("kind") == "plushie":
        return load_plushies_file().get(item["name"], {})
    if item.get("kind") == "costume":
        return load_costumes_file().get(item["name"], {})
    return load_owners(item["owners_path"])


def save_item_owners(item, owners):
    if item.get("kind") == "title":
        data = load_hub_titles_file()
        data[item["name"]] = owners
        save_hub_titles_file(data)
    elif item.get("kind") == "plushie":
        data = load_plushies_file()
        data[item["name"]] = owners
        save_plushies_file(data)
    elif item.get("kind") == "costume":
        data = load_costumes_file()
        data[item["name"]] = owners
        save_costumes_file(data)
    else:
        save_owners(item["owners_path"], owners)


def item_source_label(item):
    if item.get("kind") == "title":
        return f"{HUB_TITLES_PATH} ({item['name']})"
    if item.get("kind") == "plushie":
        return f"{PLUSHIES_PATH} ({item['name']})"
    if item.get("kind") == "costume":
        return f"{COSTUMES_PATH} ({item['name']})"
    return item["owners_path"]


def normalize_hat_name(s):
    return "".join(ch for ch in s.lower() if ch.isalpha() or ch == " ").strip()


def find_hat_edition(main_data, hat_name):
    target = normalize_hat_name(hat_name)

    def is_match(hat):
        if not hat:
            return False
        return target in normalize_hat_name(hat.get("name", ""))

    equipped = main_data.get("equipped_hat")
    if is_match(equipped):
        return equipped.get("edition")

    for hat in main_data.get("hat_unlocked", []) or []:
        if is_match(hat):
            return hat.get("edition")

    return None


def normalize_title_name(s):
    s = re.sub(r"&.", "", s)
    return "".join(ch for ch in s.lower() if ch.isalpha() or ch == " ").strip()


def find_title_match(main_data, title_name):
    target = normalize_title_name(title_name)
    for title in main_data.get("hub_title_unlocked", []) or []:
        if target in normalize_title_name(title):
            return True
    return False


def find_plushie_match(main_data, item):
    """
    Checks whether the profile has the specific plushie-tied cosmetic
    described by `item` (a PLUSHIES entry) - "pet" checks the flat "pets"
    list for that exact name; "backbling" checks the backbling list (flat
    "cosmetics.backbling" key or nested cosmetics -> backbling) for an
    entry whose "name" matches. Kept in sync with owners_bot.py's version.
    """
    if item["match"] == "pet":
        pets = main_data.get("pets", []) or []
        return item["name"] in pets

    if item["match"] == "backbling":
        backblings = main_data.get("cosmetics.backbling")
        if backblings is None:
            backblings = (main_data.get("cosmetics") or {}).get("backbling")
        return any(
            isinstance(b, dict) and b.get("name") == item["name"]
            for b in (backblings or [])
        )

    return False


def find_costume_match(main_data, item):
    costumes = main_data.get("costume_unlocked", []) or []
    return item["name"] in costumes


def find_item_match(main_data, item):
    kind = item.get("kind")
    if kind == "title":
        return find_title_match(main_data, item["name"]), None
    if kind == "plushie":
        return find_plushie_match(main_data, item), None
    if kind == "costume":
        return find_costume_match(main_data, item), None
    edition = find_hat_edition(main_data, item["name"])
    return edition is not None, edition


class RateLimiter:
    """
    Tracks x-ratelimit-limit / x-ratelimit-remaining headers from the API
    and paces requests to avoid ever hitting 429. Also enforces a fixed
    floor between requests (MIN_SECONDS_BETWEEN_REQUESTS) as a backstop.
    """

    def __init__(self):
        self.last_request_time = 0.0
        self.limit = None
        self.remaining = None

    def wait_before_request(self):
        # Fixed floor between any two requests.
        elapsed = time.monotonic() - self.last_request_time
        if elapsed < MIN_SECONDS_BETWEEN_REQUESTS:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - elapsed)

        # If we're close to exhausting the window, pause for a full window
        # rather than risk a 429.
        if self.remaining is not None and self.remaining <= RATE_LIMIT_SAFETY_MARGIN:
            print(f"[ratelimit] only {self.remaining} requests left in window, "
                  f"pausing {ASSUMED_WINDOW_SECONDS}s to let it reset")
            time.sleep(ASSUMED_WINDOW_SECONDS)
            # Assume a fresh window after waiting; real value confirmed on
            # next response.
            self.remaining = self.limit

    def update_from_headers(self, headers):
        limit = headers.get("x-ratelimit-limit")
        remaining = headers.get("x-ratelimit-remaining")
        if limit is not None:
            try:
                self.limit = int(limit)
            except ValueError:
                pass
        if remaining is not None:
            try:
                self.remaining = int(remaining)
            except ValueError:
                pass

    def note_request_sent(self):
        self.last_request_time = time.monotonic()


_rate_limiter = RateLimiter()


def is_connected():
    """
    Best-effort check for a working internet connection. Tries to open a
    plain TCP connection to a couple of well-known, highly-reliable hosts
    (not the Hive API), so we can tell "wifi/internet is down" apart from
    "Hive's API specifically is down or slow".
    """
    for host, port in CONNECTIVITY_CHECK_HOSTS:
        try:
            with socket.create_connection((host, port), timeout=CONNECTIVITY_CHECK_TIMEOUT_SECONDS):
                return True
        except OSError:
            continue
    return False


def wait_for_connection():
    """
    Blocks until is_connected() reports success, printing periodic status
    so the user can see it's waiting rather than looking hung/crashed.
    """
    print("[network] no internet connection detected - waiting for it to "
          "come back (will keep checking, no need to restart the script)...")
    waited = 0
    while not is_connected():
        time.sleep(CONNECTIVITY_RECHECK_INTERVAL_SECONDS)
        waited += CONNECTIVITY_RECHECK_INTERVAL_SECONDS
        if waited % 30 == 0:
            print(f"[network] still waiting for connection "
                  f"({waited}s so far)...")
    print("[network] connection is back, settling for "
          f"{CONNECTIVITY_SETTLE_SECONDS}s before resuming")
    time.sleep(CONNECTIVITY_SETTLE_SECONDS)


def looks_like_connectivity_error(exc):
    """
    Heuristic for "this failure is because the local connection is down"
    rather than a normal server-side problem (404, 429, transient 5xx,
    etc.) that retrying immediately won't fix by waiting for wifi.
    """
    if isinstance(exc, (socket.timeout, TimeoutError, ConnectionError)):
        return True
    if isinstance(exc, urllib.error.URLError):
        reason = exc.reason
        if isinstance(reason, (socket.timeout, TimeoutError, ConnectionError, OSError)):
            return True
        # e.g. "[Errno -3] Temporary failure in name resolution" when DNS
        # can't resolve because there's no network at all.
        reason_text = str(reason).lower()
        if "temporary failure in name resolution" in reason_text:
            return True
        if "network is unreachable" in reason_text:
            return True
    return False


def fetch_profile(ident, max_retries=3):
    """
    Fetch a Hive profile by gamertag or UUID (same endpoint accepts both).
    Returns the parsed JSON dict, or None if not found / failed after
    retries. Honors rate-limit headers, retries on 429, and if the local
    connection appears to be down (wifi out, etc.) waits for it to come
    back instead of burning through retries or giving up.
    """
    url = API_URL_TEMPLATE.format(ident=urllib.parse.quote(ident))
    req = urllib.request.Request(
        url, headers={"User-Agent": "uuid-scanner/1.0"})

    attempt = 1
    while attempt <= max_retries:
        _rate_limiter.wait_before_request()
        _rate_limiter.note_request_sent()

        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                _rate_limiter.update_from_headers(resp.headers)
                body = resp.read()
                return json.loads(body)
        except urllib.error.HTTPError as e:
            _rate_limiter.update_from_headers(e.headers or {})
            if e.code == 404:
                return None
            if e.code == 429:
                retry_after = e.headers.get(
                    "Retry-After") if e.headers else None
                try:
                    wait_seconds = float(
                        retry_after) if retry_after else ASSUMED_WINDOW_SECONDS
                except ValueError:
                    wait_seconds = ASSUMED_WINDOW_SECONDS
                print(f"[api] 429 rate limited on {ident}, "
                      f"waiting {wait_seconds:.0f}s (attempt {attempt}/{max_retries})")
                time.sleep(wait_seconds)
                attempt += 1
                continue
            if 500 <= e.code < 600:
                print(f"[api] server error {e.code} for {ident}, "
                      f"retrying in 10s (attempt {attempt}/{max_retries})")
                time.sleep(10)
                attempt += 1
                continue
            print(f"[api] HTTP error {e.code} for {ident}")
            return None
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
            if looks_like_connectivity_error(e):
                print(f"[network] lost connection while fetching {ident}: {e}")
                wait_for_connection()
                # Don't burn a retry attempt on a connectivity outage -
                # just try again once we're back online.
                continue
            print(f"[api] network error for {ident}: {e}")
            attempt += 1
            time.sleep(5)
            continue
        except json.JSONDecodeError:
            print(f"[api] bad JSON response for {ident}")
            return None
        except Exception as e:
            # Catch-all so a weird/unexpected error for one UUID can never
            # take down the whole scan.
            print(f"[api] unexpected error for {ident}: {e!r}")
            traceback.print_exc()
            return None

    print(f"[api] giving up on {ident} after {max_retries} attempts")
    return None


# ---------------------------------------------------------------------------
# Main scan
# ---------------------------------------------------------------------------

def scan_uuid(uuid):
    """
    Scans one UUID against the API and updates owners files for any
    matched hat/title/plushie. Returns a short status string so main() can
    tally real results across the whole run: "null" (API returned no
    profile for this UUID - Hive appears to hand these out arbitrarily
    across the range, not just one fixed placeholder, so this can only be
    detected per-UUID from the response, not skipped in advance), "not_found"
    (request failed / 404), "no_uuid" (response had no UUID field), or "ok".
    """
    print(f"\n--- {uuid} ---")

    data = fetch_profile(uuid)
    if data is None:
        print("  not found / request failed")
        return "not_found"

    main_data = data.get("main", {})
    if not isinstance(main_data, dict):
        # e.g. {"main": []} - the API's way of saying there's no profile
        # data here (a null/placeholder UUID), distinct from a normal
        # profile dict. Still costs an API call/rate-limit slot to find
        # out, since there's no way to know in advance which UUIDs these
        # are.
        print("  empty/null profile data (main is not an object), skipping")
        return "null"

    api_uuid = main_data.get("UUID")
    if api_uuid is None:
        print("  no UUID in response, skipping")
        return "no_uuid"

    api_xuid = main_data.get("xuid")
    api_username = main_data.get(
        "username_cc") or main_data.get("username") or uuid
    api_rank = main_data.get("rank")

    print(f"  found: {api_username} (uuid={api_uuid})")

    all_items = HATS + TITLES + PLUSHIES + COSTUMES
    any_match = False

    for item in all_items:
        matched, edition = find_item_match(main_data, item)
        if not matched:
            continue

        any_match = True
        owners = load_item_owners(item)
        already_on_file = api_uuid in owners

        if already_on_file and not OVERWRITE_EXISTING:
            print(
                f"  [{item['name']}] already on file in {item_source_label(item)}")
            continue

        entry = {
            "rank": api_rank,
            "username": api_username,
            "xuid": api_xuid,
        }
        if edition is not None:
            entry["edition"] = edition

        owners[api_uuid] = entry
        save_item_owners(item, owners)

        edition_note = f" (edition #{edition})" if edition is not None else ""
        status = "updated" if already_on_file else "NEW"
        print(
            f"  [{item['name']}] {status}{edition_note} -> {item_source_label(item)}")

    if not any_match:
        print("  no tracked hats/titles/plushies/costumes found on this profile")

    return "ok"


def safe_scan_uuid(uuid):
    """
    Wraps scan_uuid() so that literally nothing about processing a single
    UUID - a malformed API response, a disk write hiccup, an unexpected
    exception of any kind - can crash the whole run. Any unhandled error
    is logged and treated as a per-UUID failure so the scan moves on to
    the next one.
    """
    try:
        return scan_uuid(uuid)
    except Exception as e:
        print(f"[scan] unexpected error scanning {uuid}, skipping it: {e!r}")
        traceback.print_exc()
        return "error"


def run_scan():
    uuids = load_uuids_from_log(PLAYERS_LOG_PATH)

    print(f"Found {len(uuids)} unique UUID(s) in {PLAYERS_LOG_PATH}")
    print(f"Scanning against {len(HATS)} hat(s), {len(TITLES)} title(s), "
          f"{len(PLUSHIES)} plushie(s), and {len(COSTUMES)} costume(s)...")

    counts = {"ok": 0, "null": 0, "not_found": 0, "no_uuid": 0, "error": 0}
    for uuid in uuids:
        status = safe_scan_uuid(uuid)
        counts[status] = counts.get(status, 0) + 1

    print(f"\nDone. {counts['ok']} scanned, {counts['null']} null/placeholder, "
          f"{counts['not_found']} not found/failed, {counts['no_uuid']} malformed response, "
          f"{counts['error']} unexpected error(s).")


def main():
    if len(sys.argv) != 1:
        print("Usage: python3 scan_uuids.py")
        print(
            "(edit PLAYERS_LOG_PATH near the top of this file to change which log is scanned)")
        sys.exit(1)

    # Top-level safety net: even if something outside run_scan()'s own
    # per-UUID handling goes wrong (e.g. the log file becomes unreadable
    # mid-run, or an unforeseen bug), the process reports the problem and
    # exits cleanly instead of dumping a raw traceback / silently dying.
    try:
        run_scan()
    except KeyboardInterrupt:
        print("\n[main] interrupted by user, stopping.")
        sys.exit(1)
    except Exception as e:
        print(f"[main] scan failed with an unexpected error: {e!r}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
