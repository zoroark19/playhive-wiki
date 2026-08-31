import asyncio
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import discord
from dotenv import load_dotenv

load_dotenv()

WATCHED_GUILD_ID = 985204393945231470
WATCHED_CHANNEL_ID = 1531759630043185162

API_URL_TEMPLATE = "https://api.playhive.com/v0/game/all/main/{gamertag}"
PLAYER_SEARCH_URL_TEMPLATE = "https://api.playhive.com/v0/player/search/{gamertag}"
MAX_SEARCH_SUGGESTIONS = 10

MAX_GAMERTAG_LENGTH = 15
REQUEST_TIMEOUT_SECONDS = 15

STATUS_CHECK_INTERVAL_SECONDS = 30
RECONNECT_STALE_SECONDS = 120

EMOJI_ALREADY_OWNED = "✅"
EMOJI_NOT_FOUND = "❌"
EMOJI_PLAYER_NOT_FOUND = "❓"

SUBMISSIONS_PATH = "submissions.json"

STATS_STATE_PATH = "stats_message.json"

HATS = [
    {
        "name": "Starfire Crown",
        "owners_path": "owners.json",
        "emoji_name": "starfire_crown",
        "emoji_id": 1532170690126680215,
    },
    {
        "name": "Soulfire Crown",
        "owners_path": "soulfire_owners.json",
        "emoji_name": "soulfire_crown",
        "emoji_id": 1532170704215343255,
    },
]

HUB_TITLES_PATH = "hub-titles.json"

TITLES = [
    {
        "name": "Translator",
        "emoji_name": "translator",
        "emoji_id": 1532838417866424352,
        "kind": "title",
    },
    {
        "name": "The Shipwright",
        "emoji_name": "skull",
        "emoji_id": 1532838419116327002,
        "kind": "title",
    },
    {
        "name": "Spooky Snapper",
        "emoji": "📸",
        "kind": "title",
    },
    {
        "name": "Disco Dynamo",
        "emoji": "🪩",
        "kind": "title",
    },
    {
        "name": "Buzztastic Creator",
        "emoji_name": "star",
        "emoji_id": 1532838416880767186,
        "kind": "title",
    },
    {
        "name": "Beeday Builder",
        "emoji": "🎂",
        "kind": "title",
    },
    {
        "name": "Legendary Shipwright",
        "emoji": "☠️",
        "kind": "title",
    },
    {
        "name": "Parkour Picasso",
        "emoji_name": "starcoin",
        "emoji_id": 1532838414817165384,
        "kind": "title",
    },
    {
        "name": "Award Winning Director",
        "emoji": "📽",
        "kind": "title",
    },
    {
        "name": "Deadly Designer",
        "emoji": "🖌️",
        "kind": "title",
    },
    {
        "name": "Spooky Storyteller",
        "emoji_name": "ghost",
        "emoji_id": 1532838406718099697,
        "kind": "title",
    },
    {
        "name": "Movie Maverick",
        "emoji": "✈️",
        "kind": "title",
    },
    {
        "name": "Snowflake Sculptor",
        "emoji": "❄",
        "kind": "title",
    },
    {
        "name": "Snowman Maestro",
        "emoji": "⛄",
        "kind": "title",
    },
    {
        "name": "Cake Connoisseur",
        "emoji_name": "cake1",
        "emoji_id": 1532848420325425362,
        "kind": "title",
    },
    {
        "name": "Orbital Illustrator",
        "emoji": "🌍",
        "kind": "title",
    },
    {
        "name": "Dancefloor Hero",
        "emoji": "💃",
        "kind": "title",
    },
    {
        "name": "Brrrilliant Artist",
        "emoji_name": "paintbrush",
        "emoji_id": 1532838416109146112,
        "kind": "title",
    },
    {
        "name": "The Bargain Hunter",
        "emoji": "🏷",
        "kind": "title",
    }
]

PLUSHIES_PATH = "plushies.json"

PLUSHIES = [
    {
        "name": "Cubee",
        "match": "pet",
        "emoji_name": "cubee",
        "emoji_id": 1533328017726767186,
        "kind": "plushie",
    },
    {
        "name": "Ender Wings",
        "match": "backbling",
        "emoji_name": "ender_wings",
        "emoji_id": 1533328016493645906,
        "kind": "plushie",
    },
    {
        "name": "Ghosty",
        "match": "pet",
        "emoji": "👻",
        "kind": "plushie",
    },
]

COSTUMES_PATH = "hive_bee.json"

COSTUMES = [
    {
        "name": "Hive Bee",
        "emoji": "🐝",
        "kind": "costume",
    },
]

ARTIST_CANVAS_AUTHORIZED_USER_ID = 1120916116328435812
ARTIST_CANVAS_TRIGGER_PREFIX = "!"

ARTIST_CANVAS_ITEM = {
    "name": "Artist's Canvas",
    "owners_path": "artist_canvas_owners.json",
    "emoji": "🖼️",
    "kind": "manual",
}

OTHER_TRACKED_ITEMS = PLUSHIES + COSTUMES + [ARTIST_CANVAS_ITEM]

DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN")

_owners_lock = threading.Lock()


def load_owners(path):
    with _owners_lock:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)


def save_owners(path, owners):
    with _owners_lock:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(owners, f, indent=2, ensure_ascii=False)


def load_hub_titles_file():
    with _owners_lock:
        try:
            with open(HUB_TITLES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}


def save_hub_titles_file(data):
    with _owners_lock:
        with open(HUB_TITLES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def load_title_owners(title_name):
    return load_hub_titles_file().get(title_name, {})


def save_title_owners(title_name, owners):
    data = load_hub_titles_file()
    data[title_name] = owners
    save_hub_titles_file(data)


def load_plushies_file():
    with _owners_lock:
        try:
            with open(PLUSHIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}


def save_plushies_file(data):
    with _owners_lock:
        with open(PLUSHIES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def load_plushie_owners(plushie_name):
    return load_plushies_file().get(plushie_name, {})


def save_plushie_owners(plushie_name, owners):
    data = load_plushies_file()
    data[plushie_name] = owners
    save_plushies_file(data)


def load_costumes_file():
    with _owners_lock:
        try:
            with open(COSTUMES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}


def save_costumes_file(data):
    with _owners_lock:
        with open(COSTUMES_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def load_costume_owners(costume_name):
    return load_costumes_file().get(costume_name, {})


def save_costume_owners(costume_name, owners):
    data = load_costumes_file()
    data[costume_name] = owners
    save_costumes_file(data)


def find_username_match(owners, gamertag):
    target = gamertag.lower()
    for key, entry in owners.items():
        if entry.get("username", "").lower() == target:
            return key, entry
    return None, None


def load_submissions():
    with _owners_lock:
        try:
            with open(SUBMISSIONS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}


def save_submissions(submissions):
    with _owners_lock:
        with open(SUBMISSIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(submissions, f, indent=2, ensure_ascii=False)


def record_submission_credit(discord_user_id, discord_display_name, hat_name):
    submissions = load_submissions()
    key = str(discord_user_id)
    entry = submissions.setdefault(
        key, {"username": discord_display_name, "total": 0, "by_hat": {}})
    entry["username"] = discord_display_name
    entry["total"] = entry.get("total", 0) + 1
    by_hat = entry.setdefault("by_hat", {})
    by_hat[hat_name] = by_hat.get(hat_name, 0) + 1
    save_submissions(submissions)
    return entry["total"]


def load_stats_state():
    with _owners_lock:
        try:
            with open(STATS_STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}


def save_stats_state(state):
    with _owners_lock:
        with open(STATS_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)


def compute_hat_stats():
    per_hat = {}
    uuid_sets = []
    for hat in HATS:
        owners = load_owners(hat["owners_path"])
        uuids = set(owners.keys())
        per_hat[hat["name"]] = len(uuids)
        uuid_sets.append(uuids)

    total_unique = set().union(*uuid_sets) if uuid_sets else set()
    owns_all = set.intersection(*uuid_sets) if uuid_sets else set()

    return {
        "total": len(total_unique),
        "per_hat": per_hat,
        "owns_all": len(owns_all),
    }


def compute_title_stats():
    per_title = {}
    for title in TITLES:
        owners = load_title_owners(title["name"])
        per_title[title["name"]] = len(owners)
    return {"per_title": per_title}


def compute_other_stats():
    per_item = {}
    for item in OTHER_TRACKED_ITEMS:
        owners = load_item_owners(item)
        per_item[item["name"]] = len(owners)
    return {"per_item": per_item}


def compute_top_submitters(limit=5):
    submissions = load_submissions()
    ranked = sorted(
        submissions.values(),
        key=lambda entry: entry.get("total", 0),
        reverse=True,
    )
    return [(entry.get("username", "unknown"), entry.get("total", 0))
            for entry in ranked[:limit]]


def format_stats_message(stats, title_stats, other_stats, top_submitters):
    columns = ["Total"] + [hat["name"] for hat in HATS] + ["Owns All"]
    values = [str(stats["total"])] + \
        [str(stats["per_hat"][hat["name"]]) for hat in HATS] + \
        [str(stats["owns_all"])]

    widths = [max(len(c), len(v)) for c, v in zip(columns, values)]
    header_row = " | ".join(c.ljust(w) for c, w in zip(columns, widths))
    value_row = " | ".join(v.ljust(w) for v, w in zip(values, widths))
    separator = "-+-".join("-" * w for w in widths)

    header_emoji = " ".join(hat_emoji(hat) for hat in HATS)
    header = f"**Crown Ownership List**  {header_emoji}"
    ownership_table = f"{header}\n```\n{header_row}\n{separator}\n{value_row}\n```"

    top_content = ownership_table

    if TITLES:
        title_lines = [
            f"{title['name']} {item_emoji(title)} {title_stats['per_title'][title['name']]}"
            for title in TITLES
        ]
        title_section = "**Rare Titles**\n" + "\n".join(title_lines)
        top_content += "\n\n" + title_section

    if OTHER_TRACKED_ITEMS:
        other_lines = [
            f"{item['name']} {item_emoji(item)} {other_stats['per_item'][item['name']]}"
            for item in OTHER_TRACKED_ITEMS
        ]
        other_section = "**Other Trackers**\n" + "\n".join(other_lines)
        top_content += "\n\n" + other_section

    leaderboard_lines = []
    for rank, (username, total) in enumerate(top_submitters, start=1):
        leaderboard_lines.append(f"{rank}. {username} - {total}")
    leaderboard = "**Top Submitters**\n```\n" + \
        "\n".join(leaderboard_lines) + "\n```"

    return top_content + "\n\n" + leaderboard


async def update_stats_message(client):
    channel = client.get_channel(WATCHED_CHANNEL_ID)
    if channel is None:
        print(
            f"[stats] couldn't find channel {WATCHED_CHANNEL_ID}, skipping stats update")
        return

    stats = compute_hat_stats()
    title_stats = compute_title_stats()
    other_stats = compute_other_stats()
    top_submitters = compute_top_submitters(limit=5)
    content = format_stats_message(
        stats, title_stats, other_stats, top_submitters)

    state = load_stats_state()
    message_id = state.get("message_id")

    if message_id is not None:
        try:
            existing = await channel.fetch_message(message_id)
            await existing.edit(content=content)
            print(f"[stats] updated pinned message {message_id}")
            return
        except discord.NotFound:
            print(
                f"[stats] previous stats message {message_id} no longer exists, posting a new one")
        except discord.Forbidden:
            print(
                "[stats] missing permissions to edit the stats message, posting a new one")

    new_message = await channel.send(content)
    try:
        await new_message.pin()
    except discord.Forbidden:
        print("[stats] missing 'Manage Messages' permission, couldn't pin stats message")
    except discord.HTTPException as e:
        print(f"[stats] failed to pin stats message: {e}")

    save_stats_state({"message_id": new_message.id})
    print(f"[stats] posted and pinned new stats message {new_message.id}")


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


def is_misspelled_name_response(data):
    """The Hive API responds with {"message": ""} (and no "main" data)
    when the gamertag doesn't correspond to any real player, which
    indicates the name was typed/spelled incorrectly."""
    if not isinstance(data, dict):
        return False
    return data.get("message", None) == "" and not data.get("main")


def fetch_profile(gamertag):
    url = API_URL_TEMPLATE.format(gamertag=urllib.parse.quote(gamertag))
    req = urllib.request.Request(url, headers={"User-Agent": "owners-bot/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read()
            data = json.loads(body)
            print(
                f"[api] profile lookup for {gamertag} -> keys={list(data.keys()) if isinstance(data, dict) else type(data)}")
            return data
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[api] 404 for {gamertag}, treating as not-found")
            return {"message": ""}
        print(f"[api] HTTP error {e.code} for {gamertag}: {e.reason}")
        return None
    except urllib.error.URLError as e:
        print(f"[api] network error for {gamertag}: {e.reason}")
        return None
    except json.JSONDecodeError:
        print(f"[api] bad JSON response for {gamertag}")
        return None


def search_players(gamertag):
    url = PLAYER_SEARCH_URL_TEMPLATE.format(
        gamertag=urllib.parse.quote(gamertag))
    req = urllib.request.Request(url, headers={"User-Agent": "owners-bot/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read()
            result = json.loads(body)
            if not isinstance(result, list):
                print(
                    f"[api] search for {gamertag} returned non-list JSON: {result!r}")
                return []
            print(
                f"[api] search for {gamertag} returned {len(result)} result(s)")
            return result
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        print(
            f"[api] HTTP error {e.code} searching for {gamertag}: {e.reason}")
        return []
    except urllib.error.URLError as e:
        print(f"[api] network error searching for {gamertag}: {e.reason}")
        return []
    except json.JSONDecodeError:
        print(f"[api] bad JSON search response for {gamertag}")
        return []


intents = discord.Intents.default()
intents.message_content = True


def build_client():
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        print(f"Logged in as {client.user} (id={client.user.id})")
        print(
            f"Watching guild {WATCHED_GUILD_ID}, channel {WATCHED_CHANNEL_ID}")
        client.loop.create_task(status_watchdog(client))
        await update_stats_message(client)

    @client.event
    async def on_disconnect():
        print("[connection] disconnected from Discord gateway (will auto-reconnect)")

    @client.event
    async def on_resumed():
        print("[connection] gateway connection resumed")

    @client.event
    async def on_message(message):
        await handle_message(client, message)

    return client


async def status_watchdog(client):
    disconnected_since = None

    while not client.is_closed():
        latency = client.latency
        connected = latency is not None and latency == latency
        latency_ms = round(latency * 1000) if connected else None

        if connected:
            disconnected_since = None
            print(f"[watchdog] connected, latency={latency_ms}ms")
        else:
            if disconnected_since is None:
                disconnected_since = time.monotonic()
            stale_for = time.monotonic() - disconnected_since
            print(f"[watchdog] not connected ({stale_for:.0f}s so far)")

            if stale_for >= RECONNECT_STALE_SECONDS:
                print(f"[watchdog] disconnected for over {RECONNECT_STALE_SECONDS}s, "
                      f"forcing a full restart")
                await client.close()
                return

        await asyncio.sleep(STATUS_CHECK_INTERVAL_SECONDS)


def load_item_owners(item):
    if item.get("kind") == "title":
        return load_title_owners(item["name"])
    if item.get("kind") == "plushie":
        return load_plushie_owners(item["name"])
    if item.get("kind") == "costume":
        return load_costume_owners(item["name"])
    return load_owners(item["owners_path"])


def save_item_owners(item, owners):
    if item.get("kind") == "title":
        save_title_owners(item["name"], owners)
    elif item.get("kind") == "plushie":
        save_plushie_owners(item["name"], owners)
    elif item.get("kind") == "costume":
        save_costume_owners(item["name"], owners)
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


def item_emoji(item):
    if "emoji" in item:
        return item["emoji"]
    return f"<:{item['emoji_name']}:{item['emoji_id']}>"


hat_emoji = item_emoji


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


async def handle_artist_canvas_submission(client, message, raw_content):
    gamertag = raw_content[len(ARTIST_CANVAS_TRIGGER_PREFIX):].strip()

    if not gamertag or len(gamertag) > MAX_GAMERTAG_LENGTH:
        await message.add_reaction(EMOJI_NOT_FOUND)
        return

    owners = load_item_owners(ARTIST_CANVAS_ITEM)
    _, existing = find_username_match(owners, gamertag)
    if existing is not None:
        await message.add_reaction(EMOJI_ALREADY_OWNED)
        await message.add_reaction(item_emoji(ARTIST_CANVAS_ITEM))
        return

    data = await client.loop.run_in_executor(None, fetch_profile, gamertag)
    if data is None:
        await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        return

    if is_misspelled_name_response(data):
        await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        await suggest_similar_usernames(client, message, gamertag)
        return

    main_data = data.get("main", {})
    api_uuid = main_data.get("UUID")
    api_xuid = main_data.get("xuid")
    api_username = main_data.get(
        "username_cc") or main_data.get("username") or gamertag
    api_rank = main_data.get("rank")

    if api_uuid is None:
        await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        return

    owners = load_item_owners(ARTIST_CANVAS_ITEM)
    is_new = api_uuid not in owners
    owners[api_uuid] = {
        "rank": api_rank,
        "username": api_username,
        "xuid": api_xuid,
    }
    save_item_owners(ARTIST_CANVAS_ITEM, owners)

    print(f"[owners] manually added {api_username} to "
          f"{item_source_label(ARTIST_CANVAS_ITEM)} via {message.author} "
          f"(id={message.author.id}), uuid={api_uuid}")
    await message.add_reaction(item_emoji(ARTIST_CANVAS_ITEM))

    if is_new:
        total = record_submission_credit(
            message.author.id, str(message.author), ARTIST_CANVAS_ITEM["name"])
        print(f"[submissions] +1 credit ({ARTIST_CANVAS_ITEM['name']}) to "
              f"{message.author} (id={message.author.id}), new total={total}")
        await update_stats_message(client)


async def suggest_similar_usernames(client, message, gamertag):
    results = await client.loop.run_in_executor(None, search_players, gamertag)
    if not results:
        print(
            f"[suggest] no search results for {gamertag}, skipping suggestion")
        return

    usernames = [r.get("username") for r in results if r.get("username")]
    if not usernames:
        print(
            f"[suggest] search results for {gamertag} had no usable usernames")
        return

    usernames = usernames[:MAX_SEARCH_SUGGESTIONS]
    all_items = HATS + TITLES + PLUSHIES + COSTUMES

    lines = []
    for name in usernames:
        emojis = await client.loop.run_in_executor(
            None, lookup_username_item_emojis, name, all_items)
        if emojis:
            lines.append(f"* {name} {' '.join(emojis)}")
        else:
            lines.append(f"* {name} {EMOJI_NOT_FOUND}")

    suggestion_list = "\n".join(lines)
    try:
        await message.reply(f"Did you mean?\n{suggestion_list}")
        print(
            f"[suggest] replied to {message.author} with {len(usernames)} suggestion(s) for {gamertag}")
    except discord.Forbidden:
        print(
            f"[suggest] missing permission to reply in channel {message.channel.id}")
    except discord.HTTPException as e:
        print(f"[suggest] failed to send suggestion reply: {e}")


def lookup_username_item_emojis(username, all_items):
    """Fetch a suggested username's profile and return the emoji list for
    every tracked item they already own (checking both saved owners files
    and a live API lookup), so suggestions show at a glance what a
    candidate player already has."""
    emojis = []

    for item in all_items:
        owners = load_item_owners(item)
        _, existing = find_username_match(owners, username)
        if existing is not None:
            emojis.append(item_emoji(item))

    remaining_items = [item for item in all_items
                       if item_emoji(item) not in emojis]
    if not remaining_items:
        return emojis

    data = fetch_profile(username)
    if data is None or is_misspelled_name_response(data):
        return emojis

    main_data = data.get("main", {})
    for item in remaining_items:
        matched, _ = find_item_match(main_data, item)
        if matched:
            emojis.append(item_emoji(item))

    return emojis


async def handle_message(client, message):
    if message.author.id == client.user.id:
        return

    if message.guild is None or message.guild.id != WATCHED_GUILD_ID:
        return
    if message.channel.id != WATCHED_CHANNEL_ID:
        return

    stripped = message.content.strip()

    if (message.author.id == ARTIST_CANVAS_AUTHORIZED_USER_ID
            and stripped.startswith(ARTIST_CANVAS_TRIGGER_PREFIX)):
        await handle_artist_canvas_submission(client, message, stripped)
        return

    gamertag = stripped

    if not gamertag or len(gamertag) > MAX_GAMERTAG_LENGTH:
        return

    all_items = HATS + TITLES + PLUSHIES + COSTUMES

    already_matched_items = []
    items_to_check = []
    for item in all_items:
        owners = load_item_owners(item)
        _, existing = find_username_match(owners, gamertag)
        if existing is not None:
            already_matched_items.append(item)
        else:
            items_to_check.append(item)

    if already_matched_items:
        await message.add_reaction(EMOJI_ALREADY_OWNED)
        for item in already_matched_items:
            await message.add_reaction(item_emoji(item))

    if not items_to_check:
        return

    data = await client.loop.run_in_executor(None, fetch_profile, gamertag)

    if data is None:
        if not already_matched_items:
            await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        return

    if is_misspelled_name_response(data):
        if not already_matched_items:
            await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        await suggest_similar_usernames(client, message, gamertag)
        return

    main_data = data.get("main", {})
    api_uuid = main_data.get("UUID")
    api_xuid = main_data.get("xuid")
    api_username = main_data.get(
        "username_cc") or main_data.get("username") or gamertag
    api_rank = main_data.get("rank")

    if api_uuid is None:
        if not already_matched_items:
            await message.add_reaction(EMOJI_PLAYER_NOT_FOUND)
        return

    found_any = False
    for item in items_to_check:
        matched, edition = find_item_match(main_data, item)
        if not matched:
            continue

        found_any = True
        owners = load_item_owners(item)
        is_new = api_uuid not in owners
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
        print(f"[owners] added {api_username} to {item_source_label(item)}"
              f"{edition_note}, uuid={api_uuid}")
        await message.add_reaction(item_emoji(item))

        if is_new:
            total = record_submission_credit(
                message.author.id, str(message.author), item["name"])
            print(f"[submissions] +1 credit ({item['name']}) to "
                  f"{message.author} (id={message.author.id}), new total={total}")

    if not found_any and not already_matched_items:
        await message.add_reaction(EMOJI_NOT_FOUND)

    if found_any:
        await update_stats_message(client)


def ensure_owners_file_exists(item):
    try:
        load_owners(item["owners_path"])
    except FileNotFoundError:
        save_owners(item["owners_path"], {})
        print(f"Created {item['owners_path']} (for {item['name']}).")
    except json.JSONDecodeError as e:
        print(
            f"Error: {item['owners_path']} (for {item['name']}) is not valid JSON: {e}")
        sys.exit(1)


def main():
    if len(sys.argv) != 1:
        print("Usage: python3 owners_bot.py")
        print("(owners files are configured per-hat in the HATS list near the top of this file)")
        sys.exit(1)

    if not HATS:
        print("Error: HATS is empty - add at least one hat to track near the top of this file.")
        sys.exit(1)

    for hat in HATS:
        try:
            load_owners(hat["owners_path"])
        except FileNotFoundError:
            print(
                f"Error: {hat['owners_path']} (for {hat['name']}) not found.")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(
                f"Error: {hat['owners_path']} (for {hat['name']}) is not valid JSON: {e}")
            sys.exit(1)

    ensure_owners_file_exists(ARTIST_CANVAS_ITEM)

    if PLUSHIES:
        try:
            plushies_data = load_plushies_file()
        except json.JSONDecodeError as e:
            print(f"Error: {PLUSHIES_PATH} is not valid JSON: {e}")
            sys.exit(1)

        changed = False
        for plushie in PLUSHIES:
            if plushie["name"] not in plushies_data:
                plushies_data[plushie["name"]] = {}
                changed = True
        if changed:
            save_plushies_file(plushies_data)
            print(
                f"{PLUSHIES_PATH} ready ({', '.join(p['name'] for p in PLUSHIES)}).")

    if TITLES:
        try:
            hub_titles = load_hub_titles_file()
            existed = True
        except json.JSONDecodeError as e:
            print(f"Error: {HUB_TITLES_PATH} is not valid JSON: {e}")
            sys.exit(1)

        changed = False
        for title in TITLES:
            if title["name"] not in hub_titles:
                hub_titles[title["name"]] = {}
                changed = True
        if changed:
            save_hub_titles_file(hub_titles)
            print(
                f"{HUB_TITLES_PATH} ready ({', '.join(t['name'] for t in TITLES)}).")

    if COSTUMES:
        try:
            costumes_data = load_costumes_file()
        except json.JSONDecodeError as e:
            print(f"Error: {COSTUMES_PATH} is not valid JSON: {e}")
            sys.exit(1)

        changed = False
        for costume in COSTUMES:
            if costume["name"] not in costumes_data:
                costumes_data[costume["name"]] = {}
                changed = True
        if changed:
            save_costumes_file(costumes_data)
            print(
                f"{COSTUMES_PATH} ready ({', '.join(c['name'] for c in COSTUMES)}).")

    token = DISCORD_BOT_TOKEN
    if not token:
        print("Error: set DISCORD_BOT_TOKEN in your .env file (see .env.example).")
        sys.exit(1)

    while True:
        client = build_client()
        try:
            client.run(token)
        except discord.LoginFailure:
            print("Error: login failed - check that DISCORD_BOT_TOKEN is correct.")
            sys.exit(1)
        except Exception as e:
            print(f"[main] client.run() raised {e!r}, restarting in 5s")

        print("[main] client stopped, restarting in 5s")
        time.sleep(5)


if __name__ == "__main__":
    main()
