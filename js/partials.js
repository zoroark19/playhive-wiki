/* =========================================================
   partials.js — loads shared header/footer markup so it only
   has to be maintained in one place (partials/header.html,
   partials/footer.html) instead of being copy-pasted into
   every page.

   Each page just needs:
     <body data-page="npc" data-root="../">
       <div data-include="header"></div>
       ...
       <div data-include="footer"></div>
     </body>

   - data-root: relative path back to the site root ("" for
     index.html, "../" for anything in /pages/).
   - data-page: which nav item(s) should be marked active /
     current on this page. Matches the data-nav / data-topnav
     values in partials/header.html.
   ========================================================= */
(function () {
  var body = document.body;
  var root = body.getAttribute("data-root") || "";
  var page = body.getAttribute("data-page") || "";

  function applyRoot(html) {
    return html.split("{{root}}").join(root);
  }

  function markActive(container) {
    if (!page) return;
    var topLink = container.querySelector('[data-topnav="' + page + '"]');
    if (topLink) topLink.classList.add("active");
    var sideLink = container.querySelector('[data-nav="' + page + '"]');
    if (sideLink) sideLink.classList.add("current");
  }

  function wireDropdown(container) {
    var btn = container.querySelector("#navToggle");
    var menu = container.querySelector("#navDropdown");
    if (!btn || !menu) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        menu.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* =========================================================
     Search index — one entry per real page/section on the wiki.
     "url" uses {{root}} the same way partials do; "#" means the
     page doesn't exist yet. Add an entry here any time a new
     page is added to the wiki.
     ========================================================= */
  var SEARCH_INDEX = [
    {
      title: "Main Page",
      url: "{{root}}index.html",
      category: "Navigation",
      keywords: "home main hive wiki overview",
    },
    {
      title: "Herald the Guide",
      url: "{{root}}pages/npc.html",
      category: "NPCs & Lore",
      keywords: "npc herald guide lobby dialogue lore",
    },
    {
      title: "Hoverboard Costume",
      url: "{{root}}costumes/misc/hoverboard/",
      category: "Store & Cosmetics",
      keywords:
        "hoverboard costume unreleased cosmetic bundle speed demon super fruit minecoins hub title",
    },
    {
      title: "BedWars",
      url: "#",
      category: "Games",
      keywords: "bedwars team pvp bed defend",
    },
    {
      title: "SkyWars",
      url: "#",
      category: "Games",
      keywords: "skywars party game island loot",
    },
    {
      title: "Survival Games",
      url: "#",
      category: "Games",
      keywords: "survival games battle royale deathmatch tribute",
    },
    {
      title: "Murder Mystery",
      url: "#",
      category: "Games",
      keywords: "murder mystery social deduction sheriff innocents",
    },
    {
      title: "Ground Wars",
      url: "#",
      category: "Games",
      keywords: "ground wars team pvp eggs defenses",
    },
    {
      title: "Hide and Seek",
      url: "#",
      category: "Games",
      keywords: "hide and seek disguise block seeker",
    },
    {
      title: "Rules & Guidelines",
      url: "#",
      category: "Navigation",
      keywords: "rules guidelines editing conduct",
    },
    {
      title: "Ranks & Perks",
      url: "#",
      category: "Navigation",
      keywords: "ranks perks vip mvp",
    },
    {
      title: "Shopkeepers",
      url: "#",
      category: "NPCs & Lore",
      keywords: "shopkeepers npc store vendor",
    },
    {
      title: "Hive Lore",
      url: "#",
      category: "NPCs & Lore",
      keywords: "lore story history hive",
    },
    {
      title: "Costumes",
      url: "#",
      category: "Store & Cosmetics",
      keywords: "costumes cosmetics store bundles",
    },
    {
      title: "Unreleased Content",
      url: "#",
      category: "Store & Cosmetics",
      keywords: "unreleased cancelled cut content",
    },
  ];

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function highlight(text, query) {
    var idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, idx)) +
      "<mark>" +
      escapeHtml(text.slice(idx, idx + query.length)) +
      "</mark>" +
      escapeHtml(text.slice(idx + query.length))
    );
  }

  function searchIndex(query) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(function (item) {
      return (
        item.title.toLowerCase().indexOf(q) !== -1 ||
        item.keywords.toLowerCase().indexOf(q) !== -1
      );
    }).slice(0, 8);
  }

  function wireSearch(container, root) {
    var input = container.querySelector("#wikiSearchInput");
    var results = container.querySelector("#wikiSearchResults");
    if (!input || !results) return;

    var activeIndex = -1;
    var currentItems = [];

    function closeResults() {
      results.classList.remove("is-open");
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    function render(query) {
      var matches = searchIndex(query);
      currentItems = matches;
      activeIndex = -1;

      if (!query.trim()) {
        closeResults();
        return;
      }

      if (!matches.length) {
        results.innerHTML =
          '<div class="search-results__empty">No results for "' +
          escapeHtml(query) +
          '"</div>';
        results.classList.add("is-open");
        input.setAttribute("aria-expanded", "true");
        return;
      }

      var byCategory = {};
      matches.forEach(function (item) {
        (byCategory[item.category] = byCategory[item.category] || []).push(
          item,
        );
      });

      var html = "";
      Object.keys(byCategory).forEach(function (cat) {
        html +=
          '<div class="search-results__group-label">' +
          escapeHtml(cat) +
          "</div>";
        byCategory[cat].forEach(function (item) {
          var href = item.url.split("{{root}}").join(root);
          html +=
            '<a class="search-results__item" href="' +
            href +
            '" role="option">' +
            highlight(item.title, query) +
            "</a>";
        });
      });

      results.innerHTML = html;
      results.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
    }

    input.addEventListener("input", function () {
      render(input.value);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) render(input.value);
    });

    input.addEventListener("keydown", function (e) {
      var items = results.querySelectorAll(".search-results__item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          window.location.href = items[activeIndex].getAttribute("href");
        }
        return;
      } else if (e.key === "Escape") {
        closeResults();
        input.blur();
        return;
      } else {
        return;
      }

      items.forEach(function (it, i) {
        it.classList.toggle("is-active", i === activeIndex);
      });
      items[activeIndex].scrollIntoView({ block: "nearest" });
    });

    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) {
        closeResults();
      }
    });
  }

  function loadInclude(el) {
    var name = el.getAttribute("data-include");
    var colonIdx = name.indexOf(":");
    var url;
    if (colonIdx !== -1) {
      var namespace = name.slice(0, colonIdx);
      var partialName = name.slice(colonIdx + 1);
      url = root + "partials/" + namespace + "s/" + partialName + ".html";
    } else {
      url = root + "partials/" + name + ".html";
    }
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load partial: " + url);
        return res.text();
      })
      .then(function (html) {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = applyRoot(html);
        el.replaceWith.apply(
          el,
          wrapper.childNodes.length
            ? Array.prototype.slice.call(wrapper.childNodes)
            : [wrapper],
        );
        if (name === "header") {
          markActive(document);
          wireDropdown(document);
          wireSearch(document, root);
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var includes = Array.prototype.slice.call(
      document.querySelectorAll("[data-include]"),
    );
    includes.forEach(loadInclude);
  });
})();

/* Open any content image in a new tab when clicked */
document.addEventListener("click", function (e) {
  const img = e.target.closest("img");
  if (!img) return;

  // Skip icons/logos in chrome (topbar, footer) — only wiki content images
  if (img.closest(".topbar, .site-footer, .hexmark")) return;

  window.open(img.currentSrc || img.src, "_blank", "noopener");
});

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("img").forEach(function (img) {
    if (img.closest(".topbar, .site-footer, .hexmark")) return;
    img.style.cursor = "zoom-in";
  });
});
