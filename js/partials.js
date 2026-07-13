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

  function loadInclude(el) {
    var name = el.getAttribute("data-include");
    var url = root + "partials/" + name + ".html";
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
