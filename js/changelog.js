/**
 * changelog.js
 * -------------------------------------------------------------------------
 * Renders live Hive changelog entries (fetched ahead of time by the
 * `.github/workflows/changelog.yml` Action into data/changelog.json) into
 * the "Recent Updates" panel identified by [data-role="hive-changelog"].
 *
 * This does NOT hit updates.playhive.com directly from the browser — that
 * feed doesn't send CORS headers, so a client-side fetch would fail. The
 * Action fetches it ahead of time and commits a same-origin JSON file
 * instead, which this script simply reads.
 */
(function () {
  const DATA_URL = "data/changelog.json";
  const MAX_ITEMS = 6;

  function formatRelativeTime(isoDate) {
    const then = new Date(isoDate).getTime();
    if (isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  }

  function renderItems(list, items) {
    list.innerHTML = "";
    items.slice(0, MAX_ITEMS).forEach((item) => {
      const li = document.createElement("li");

      const link = document.createElement("a");
      link.href = item.link;
      link.textContent = item.title;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = item.pubDate ? formatRelativeTime(item.pubDate) : "";

      li.appendChild(link);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  async function init() {
    const list = document.querySelector('[data-role="hive-changelog"]');
    if (!list) return;

    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("No changelog items in data file");
      }
      renderItems(list, data.items);
    } catch (err) {
      // Leave whatever static fallback content is already in the panel.
      console.warn("Hive changelog: falling back to static content.", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
