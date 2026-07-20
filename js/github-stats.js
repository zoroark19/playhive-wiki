/**
 * github-stats.js
 * -------------------------------------------------------------------------
 * Populates the homepage stats-row with live data from the GitHub REST API
 * for the repo named in #ghStats[data-repo] (e.g. "zoroark19/playhive-wiki").
 *
 * Uses the public, unauthenticated API — fine for a single page load, but
 * subject to GitHub's 60 req/hour per-IP rate limit, so results are cached
 * in sessionStorage for a while to avoid refetching on every navigation.
 *
 * Stats populated (by [data-role] on each .stat-card inside #ghStats):
 *   - commits       total commit count on the default branch
 *   - contributors  total unique contributor count
 *   - last-commit   human-relative time since the most recent commit
 *
 * Commit/contributor totals aren't returned directly by the API — instead
 * we request 1-per-page and read the last page number out of the
 * pagination `Link` response header, which equals the total count.
 */
(function () {
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  function cacheKey(repo, kind) {
    return `ghStats:${repo}:${kind}`;
  }

  function readCache(repo, kind) {
    try {
      const raw = sessionStorage.getItem(cacheKey(repo, kind));
      if (!raw) return null;
      const { value, at } = JSON.parse(raw);
      if (Date.now() - at > CACHE_TTL_MS) return null;
      return value;
    } catch {
      return null;
    }
  }

  function writeCache(repo, kind, value) {
    try {
      sessionStorage.setItem(
        cacheKey(repo, kind),
        JSON.stringify({ value, at: Date.now() }),
      );
    } catch {
      // sessionStorage unavailable/full — just skip caching
    }
  }

  // Reads the total-count trick: request page 1 with 1 item per page, then
  // pull the page number out of the Link header's rel="last" entry. If
  // there's no Link header at all, the whole collection fit on one page,
  // so the count is just however many items came back (0 or 1 here).
  async function fetchPaginatedCount(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    const link = res.headers.get("Link");
    if (link) {
      const match = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
      if (match) return parseInt(match[1], 10);
    }
    const body = await res.json();
    return Array.isArray(body) ? body.length : 0;
  }

  function formatRelativeTime(isoDate) {
    const then = new Date(isoDate).getTime();
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

  function setStat(container, role, text) {
    const card = container.querySelector(`[data-role="${role}"] .num`);
    if (card) card.textContent = text;
  }

  async function loadStats(container) {
    const repo = container.getAttribute("data-repo");
    if (!repo) return;
    const base = `https://api.github.com/repos/${repo}`;

    // Commits
    (async () => {
      try {
        let count = readCache(repo, "commits");
        if (count == null) {
          count = await fetchPaginatedCount(`${base}/commits?per_page=1`);
          writeCache(repo, "commits", count);
        }
        setStat(container, "commits", count.toLocaleString());
      } catch {
        setStat(container, "commits", "—");
      }
    })();

    // Contributors (anon=true counts commits by authors without a GitHub
    // account too, matching what the repo's sidebar "Contributors" count
    // includes)
    (async () => {
      try {
        let count = readCache(repo, "contributors");
        if (count == null) {
          count = await fetchPaginatedCount(
            `${base}/contributors?per_page=1&anon=true`,
          );
          writeCache(repo, "contributors", count);
        }
        setStat(container, "contributors", count.toLocaleString());
      } catch {
        setStat(container, "contributors", "—");
      }
    })();

    // Last commit date, taken from the repo's default branch HEAD
    (async () => {
      try {
        let pushedAt = readCache(repo, "last-commit");
        if (pushedAt == null) {
          const res = await fetch(base);
          if (!res.ok) throw new Error(`GitHub API ${res.status}`);
          const data = await res.json();
          pushedAt = data.pushed_at;
          writeCache(repo, "last-commit", pushedAt);
        }
        setStat(container, "last-commit", formatRelativeTime(pushedAt));
      } catch {
        setStat(container, "last-commit", "—");
      }
    })();
  }

  function init() {
    const container = document.getElementById("ghStats");
    if (!container) return;
    loadStats(container);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
