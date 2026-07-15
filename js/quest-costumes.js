/* =========================================================
   quest-costumes.js — renders the "Quest Costumes" preview
   grid on any page from data/quest-costumes.json, instead of
   hand-editing the 7 <a class="costume-preview"> blocks in
   HTML every time a new one releases.

   To add/update the list: edit data/quest-costumes.json only.
   Newest entry goes first — this script does not sort for you.
   Each item only needs "slug", "name", "date" — the thumbnail
   path is always assets/costume/quest/{slug}.png, so it isn't
   stored in the JSON. The count badge next to the heading is
   the total number of items in the JSON, not just the ones
   shown on this page — it always reflects the full list.

   Usage on the page (root comes from <body data-root="...">,
   same attribute partials.js already reads):
     <section class="costume-section" data-quest-costumes></section>

   - data-limit: optional, how many items to show (default 7).
   ========================================================= */
(function () {
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function renderSection(section, data, root) {
    var allItems = data.items || [];
    var limit = parseInt(section.getAttribute("data-limit"), 10) || 7;
    var items = allItems.slice(0, limit);
    var total = allItems.length;

    var countHtml = '<span class="costume-section__count">' + total + "</span>";

    var descHtml = data.description
      ? "<p>" + escapeHtml(data.description) + "</p>"
      : "";

    var cardsHtml = items
      .map(function (item) {
        var href = root + "costumes/quest/" + item.slug + "/";
        var img = root + "assets/costume/quest/" + item.slug + ".png";
        return (
          '<a class="costume-preview" href="' +
          href +
          '">' +
          '<div class="costume-preview__thumb">' +
          '<img src="' +
          img +
          '" alt="' +
          escapeHtml(item.name) +
          '" />' +
          "</div>" +
          '<div class="costume-preview__name">' +
          escapeHtml(item.name) +
          "</div>" +
          '<div class="costume-preview__date">' +
          escapeHtml(item.date) +
          "</div>" +
          "</a>"
        );
      })
      .join("");

    section.innerHTML =
      '<div class="costume-section__head">' +
      "<h2>Quest Costumes" +
      countHtml +
      "</h2>" +
      '<a class="costume-section__more" href="' +
      root +
      'costumes/quest/">View all →</a>' +
      "</div>" +
      descHtml +
      '<div class="costume-preview-grid">' +
      cardsHtml +
      "</div>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll("[data-quest-costumes]"),
    );
    if (!sections.length) return;

    var root = document.body.getAttribute("data-root") || "";

    fetch(root + "data/quest-costumes.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load quest-costumes.json");
        return res.json();
      })
      .then(function (data) {
        sections.forEach(function (section) {
          renderSection(section, data, root);
        });
      })
      .catch(function (err) {
        console.error(err);
      });
  });
})();
