/* dialogue-table.js
   -----------------------------------------------------------
   Renders a Dialogue/Conditions table from raw §-coded strings.

   Usage in HTML:
     <table class="data-table dialogue-table" data-dialogue></table>
     <script src="../js/dialogue-table.js"></script>
     <script>
       renderDialogueTable(document.querySelector('[data-dialogue]'), [
         {
           body: "§jHowdy, §mBehaviorPack§j!\n\n§7You can view the progress of your special quest(s), or activate an additional daily quest.\n\n§fWhat would you like to do?",
           condition: "§8Pick Quest"
         },
         // ...more entries
       ]);
     </script>

   Each §-code switches color for everything that follows it,
   until the next code or a line break (\n -> <br>), matching
   vanilla Minecraft §-code behavior. Codes map straight to the
   .mc-code-X classes defined in cosmetic.css.
   ----------------------------------------------------------- */
(function (global) {
  "use strict";

  // Valid §-code characters this renderer understands.
  // Vanilla: 0-9, a-f. Hive-custom: h, i, j, m, n, p, q, s, t, u.
  var VALID_CODES = "0123456789abcdefhijmnpqstu";

  /**
   * Converts a single raw §-coded string into an HTML string,
   * wrapping color runs in <span class="mc-code-X"> and turning
   * \n into <br>.
   */
  function parseMcString(raw) {
    if (!raw) return "";

    var html = "";
    var currentCode = null;
    var buffer = "";

    function flush() {
      if (!buffer) return;
      // Preserve line breaks within the current color run
      var escaped = escapeHtml(buffer).replace(/\n/g, "<br>");
      if (currentCode) {
        html +=
          '<span class="mc-code-' + currentCode + '">' + escaped + "</span>";
      } else {
        html += escaped;
      }
      buffer = "";
    }

    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (
        ch === "§" &&
        i + 1 < raw.length &&
        VALID_CODES.indexOf(raw[i + 1].toLowerCase()) !== -1
      ) {
        flush();
        currentCode = raw[i + 1].toLowerCase();
        i++; // skip the code letter
        continue;
      }
      buffer += ch;
    }
    flush();

    return html;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Renders a full Dialogue/Conditions table into `tableEl`.
   * `entries` is an array of { body, condition } objects, each
   * using raw §-coded strings with \n for line breaks.
   */
  function renderDialogueTable(tableEl, entries) {
    if (!tableEl) return;

    var rows = ["<tr><th>Dialogue</th><th>Conditions</th></tr>"];

    entries.forEach(function (entry) {
      var bodyHtml = parseMcString(entry.body);
      var conditionHtml = parseMcString(entry.condition);
      rows.push(
        "<tr><td>" + bodyHtml + "</td><td>" + conditionHtml + "</td></tr>",
      );
    });

    tableEl.innerHTML = rows.join("");
  }

  global.renderDialogueTable = renderDialogueTable;
  global.parseMcString = parseMcString;
})(window);
