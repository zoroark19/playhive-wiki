// fetch-changelog.mjs
// ---------------------------------------------------------------------------
// Fetches the Hive changelog RSS feed and writes a small JSON file the
// homepage can load client-side (data/changelog.json).
//
// No external dependencies — uses a minimal hand-rolled RSS <item> parser,
// since the feed's structure is simple and stable (Featurebase/RSS 2.0).
//
// Run with: node fetch-changelog.mjs
// ---------------------------------------------------------------------------

const FEED_URL = "https://updates.playhive.com/api/v1/changelog/feed.rss";
const OUTPUT_PATH = "data/changelog.json";
const MAX_ITEMS = 5;

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&"); // must run last, after numeric entities are resolved
}

function stripCdata(str) {
  const m = str.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : str;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1]).trim());
}

// Strips any HTML tags out of a description, then trims to a short excerpt.
function excerptFromHtml(html, maxLen = 160) {
  const text = decodeEntities(stripCdata(html))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "playhive-wiki-changelog-bot" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch feed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  if (itemBlocks.length === 0) {
    throw new Error("No <item> entries found in feed — feed format may have changed");
  }

  const items = itemBlocks.slice(0, MAX_ITEMS).map((block) => {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDateRaw = extractTag(block, "pubDate");
    const description = extractTag(block, "description");

    let pubDateIso = null;
    if (pubDateRaw) {
      const d = new Date(pubDateRaw);
      if (!isNaN(d.getTime())) pubDateIso = d.toISOString();
    }

    return {
      title,
      link,
      pubDate: pubDateIso,
      excerpt: description ? excerptFromHtml(description) : "",
    };
  });

  const output = {
    source: FEED_URL,
    fetchedAt: new Date().toISOString(),
    items,
  };

  const fs = await import("node:fs/promises");
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${items.length} changelog items to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
