/* =========================================================
   profile.js — Player Profile widget.

   Fetches https://api.playhive.com/v0/game/all/main/{username}
   and renders a stat page: header, equipped cosmetics, and hub
   parkour progress.

   GitHub Pages can't do real dynamic routes, so this page reads
   the username from a query string instead of a path segment:
     /profile/?u=BehaviorPack

   Usage on the page (root comes from <body data-root="...">,
   same attribute partials.js already reads):
     <div id="profileWidget" data-root="../"></div>
     <script src="../js/profile.js"></script>
   ========================================================= */
(function () {
  var API_BASE = "https://api.playhive.com/v0/game/all/main/";

  /* ---------- helpers ---------- */

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function fmtNum(n) {
    if (typeof n !== "number" || isNaN(n)) return "—";
    return n.toLocaleString();
  }

  function fmtDate(unixSeconds) {
    if (!unixSeconds) return "—";
    var d = new Date(unixSeconds * 1000);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // best_run_time / best_checkpoint_times come back in ms, with
  // 2147483647 (int32 max) used as a "never completed" sentinel.
  function fmtDuration(ms) {
    if (ms == null || ms >= 2147483647) return "—";
    var totalMs = ms;
    var minutes = Math.floor(totalMs / 60000);
    var seconds = Math.floor((totalMs % 60000) / 1000);
    var millis = totalMs % 1000;
    return (
      minutes +
      ":" +
      String(seconds).padStart(2, "0") +
      "." +
      String(millis).padStart(3, "0")
    );
  }

  // Minecraft "&x" formatting codes -> inline color spans. Only
  // the standard 0-9/a-f color codes are mapped; anything else
  // (Hive's holiday/rank-exclusive codes like &t &i &j &p &q)
  // just gets its marker stripped so the text stays readable
  // instead of showing raw "&x" noise.
  var MC_COLORS = {
    0: "#000000",
    1: "#0000aa",
    2: "#00aa00",
    3: "#00aaaa",
    4: "#aa0000",
    5: "#aa00aa",
    6: "#ffaa00",
    7: "#aaaaaa",
    8: "#555555",
    9: "#5555ff",
    a: "#55ff55",
    b: "#55ffff",
    c: "#ff5555",
    d: "#ff55ff",
    e: "#ffff55",
    f: "#ffffff",
  };
  function mcFormat(str) {
    if (!str) return "";
    var parts = String(str).split("&");
    var html = esc(parts[0]);
    for (var i = 1; i < parts.length; i++) {
      var code = parts[i].charAt(0).toLowerCase();
      var rest = esc(parts[i].slice(1));
      if (MC_COLORS[code]) {
        html +=
          '<span style="color:' + MC_COLORS[code] + '">' + rest + "</span>";
      } else {
        html += rest;
      }
    }
    return html;
  }

  /* ---------- rendering ---------- */

  function renderSearchBar(root, currentValue) {
    return (
      '<div class="profile-search">' +
      '<input class="profile-search__input" type="text" id="profileSearchInput" ' +
      'placeholder="Look up a player..." value="' +
      esc(currentValue || "") +
      '" />' +
      '<button class="btn btn-primary" id="profileSearchBtn" type="button">View Profile</button>' +
      "</div>"
    );
  }

  function renderState(title, body, isError) {
    return (
      '<div class="profile-state' +
      (isError ? " is-error" : "") +
      '">' +
      '<div class="profile-state__title">' +
      esc(title) +
      "</div>" +
      "<div>" +
      esc(body) +
      "</div>" +
      "</div>"
    );
  }

  function rankClass(rank) {
    return (
      "rank-" +
      String(rank || "NONE")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase()
    );
  }

  function renderHeader(main) {
    var avatar = main.equipped_avatar && main.equipped_avatar.url;
    var avatarHtml = avatar
      ? '<img src="' +
        esc(avatar) +
        '" alt="' +
        esc(main.equipped_avatar.name || "") +
        '" />'
      : '<span class="profile-header__avatar-fallback">' +
        esc((main.username_cc || "?").charAt(0).toUpperCase()) +
        "</span>";

    var titleHtml = main.equipped_hub_title
      ? '<div class="profile-header__title">' +
        mcFormat(main.equipped_hub_title) +
        "</div>"
      : "";

    return (
      '<div class="profile-header">' +
      '<div class="profile-header__avatar">' +
      avatarHtml +
      "</div>" +
      '<div class="profile-header__main">' +
      '<div class="profile-header__name-row">' +
      '<h1 class="profile-header__name">' +
      esc(main.username_cc || main.username) +
      "</h1>" +
      '<span class="pill ' +
      rankClass(main.rank) +
      '">' +
      esc(main.rank || "NONE") +
      "</span>" +
      "</div>" +
      titleHtml +
      '<div class="profile-header__meta">' +
      "<span>Playing since <strong>" +
      fmtDate(main.first_played) +
      "</strong></span>" +
      "<span>Friends: <strong>" +
      fmtNum(main.friend_count) +
      "</strong></span>" +
      "<span>Daily Streak: <strong>" +
      fmtNum(main.daily_login_streak) +
      "</strong> (best " +
      fmtNum(main.longest_daily_login_streak) +
      ")</span>" +
      "<span>Quests Completed: <strong>" +
      fmtNum(main.quest_count) +
      "</strong></span>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderTopStats(main) {
    var cards = [
      { num: fmtNum(main.hub_title_count), label: "Hub Titles" },
      { num: fmtNum(main.costume_count), label: "Costumes" },
      { num: fmtNum(main.hat_count), label: "Hats" },
    ];

    return (
      '<div class="stats-row">' +
      cards
        .map(function (c) {
          return (
            '<div class="stat-card"><div class="num">' +
            c.num +
            '</div><div class="label">' +
            esc(c.label) +
            "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderSlot(label, thumb, name, sub) {
    var thumbHtml = thumb
      ? '<div class="profile-slot__thumb"><img src="' +
        esc(thumb) +
        '" alt="' +
        esc(name || "") +
        '" /></div>'
      : '<div class="profile-slot__thumb"><span class="profile-slot__empty">—</span></div>';
    return (
      '<div class="profile-slot">' +
      '<span class="profile-slot__label">' +
      esc(label) +
      "</span>" +
      thumbHtml +
      (name
        ? '<span class="profile-slot__name">' + esc(name) + "</span>"
        : "") +
      (sub
        ? '<span class="profile-slot__rarity rarity-' +
          esc(sub) +
          '">' +
          esc(sub) +
          "</span>"
        : "") +
      "</div>"
    );
  }

  function renderLoadout(main) {
    var hat = main.equipped_hat;
    var backbling = main.equipped_backbling;
    var avatar = main.equipped_avatar;

    return (
      '<div class="profile-loadout">' +
      renderSlot("Costume", null, main.equipped_costume) +
      renderSlot("Hat", hat && hat.icon, hat && hat.name, hat && hat.rarity) +
      renderSlot(
        "Back Bling",
        backbling && backbling.icon,
        backbling && backbling.name,
        backbling && backbling.rarity,
      ) +
      renderSlot("Avatar", avatar && avatar.url, avatar && avatar.name) +
      renderSlot(
        "Hub Title",
        null,
        main.equipped_hub_title ? stripCodes(main.equipped_hub_title) : null,
      ) +
      "</div>"
    );
  }

  function stripCodes(str) {
    return String(str).replace(/&./g, "").trim();
  }

  function renderParkour(parkour) {
    if (!parkour || !parkour.parkours) return "";
    var courses = parkour.parkours;
    var rows = Object.keys(courses)
      .map(function (courseName) {
        var course = courses[courseName];
        var mapNames = Object.keys(course).filter(function (k) {
          return k !== "parkour_stars" && k !== "total_stars";
        });
        var mapRows = mapNames
          .map(function (mapName) {
            var m = course[mapName];
            return (
              "<tr><td>" +
              esc(mapName) +
              "</td><td>" +
              esc(courseName) +
              "</td><td>" +
              fmtDuration(m.best_run_time) +
              '</td><td class="profile-parkour-stars">' +
              fmtNum(m.course_stars) +
              " ★</td></tr>"
            );
          })
          .join("");
        return mapRows;
      })
      .join("");

    var totalStars = 0;
    Object.keys(courses).forEach(function (c) {
      totalStars += courses[c].parkour_stars || 0;
    });

    return (
      '<h2 class="section-heading">Hub Parkour</h2>' +
      '<div class="panel">' +
      "<h4>Total Stars: " +
      fmtNum(totalStars) +
      " ★</h4>" +
      '<table class="data-table profile-parkour-table">' +
      "<thead><tr><th>Map</th><th>Course</th><th>Best Time</th><th>Stars</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>" +
      "</div>"
    );
  }

  /* ---------- controller ---------- */

  function ProfileWidget(el) {
    this.el = el;
    this.root =
      el.getAttribute("data-root") ||
      document.body.getAttribute("data-root") ||
      "";
    this.render();
  }

  ProfileWidget.prototype.getUsernameFromUrl = function () {
    var params = new URLSearchParams(window.location.search);
    return (params.get("u") || "").trim();
  };

  ProfileWidget.prototype.render = function () {
    var username = this.getUsernameFromUrl();
    var self = this;

    this.el.innerHTML =
      renderSearchBar(this.root, username) + '<div id="profileResults"></div>';
    this.wireSearch();

    var resultsEl = this.el.querySelector("#profileResults");

    if (!username) {
      resultsEl.innerHTML = renderState(
        "Look up a player",
        "Enter a Hive username above to view their profile.",
        false,
      );
      return;
    }

    resultsEl.innerHTML = renderState(
      "Loading…",
      'Fetching stats for "' + username + '"…',
      false,
    );

    fetch(API_BASE + encodeURIComponent(username))
      .then(function (res) {
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? "not-found" : "http-" + res.status,
          );
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.main) {
          resultsEl.innerHTML = renderState(
            "Player Not Found",
            '"' +
              username +
              "\" doesn't appear to be a player The Hive has data for. Check the spelling and try again.",
            true,
          );
          return;
        }
        self.renderProfile(resultsEl, data);
      })
      .catch(function (err) {
        var msg =
          err && err.message === "not-found"
            ? '"' +
              username +
              "\" doesn't appear to be a player The Hive has data for. Check the spelling and try again."
            : "Couldn't reach The Hive's stats API right now. This could be a temporary outage or a network issue — try again in a moment.";
        resultsEl.innerHTML = renderState(
          err && err.message === "not-found"
            ? "Player Not Found"
            : "Something Went Wrong",
          msg,
          true,
        );
      });
  };

  ProfileWidget.prototype.renderProfile = function (resultsEl, data) {
    var main = data.main;
    resultsEl.innerHTML =
      renderHeader(main) +
      renderTopStats(main) +
      '<div id="profileViewer" data-root="' +
      esc(this.root) +
      '"></div>' +
      renderLoadout(main) +
      renderParkour(data.parkour);

    // 3D preview of the equipped costume/hat/cape&backbling. Purely
    // additive — if Babylon or its loader script isn't present on the
    // page, or a model fails to resolve, the rest of the profile still
    // renders fine (see ProfileViewer's own internal guards).
    if (window.ProfileViewer) {
      var viewerEl = resultsEl.querySelector("#profileViewer");
      window.ProfileViewer.mount(viewerEl, main);
    }
  };

  ProfileWidget.prototype.wireSearch = function () {
    var self = this;
    var input = this.el.querySelector("#profileSearchInput");
    var btn = this.el.querySelector("#profileSearchBtn");

    function go() {
      var val = input.value.trim();
      if (!val) return;
      var params = new URLSearchParams(window.location.search);
      params.set("u", val);
      window.location.search = params.toString();
    }

    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") go();
    });
  };

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.getElementById("profileWidget");
    if (!el) return;
    new ProfileWidget(el);
  });
})();
