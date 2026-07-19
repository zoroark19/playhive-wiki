/**
 * cosmetic-locker.js
 * -------------------------------------------------------------------------
 * A browsable 3D cosmetic "locker" widget: loads cosmetic catalogs from
 * /data/*.json, lets the user filter/search/browse them, and renders the
 * currently equipped items with Babylon.js.
 *
 * Equip model: 3 slots total —
 *   - costume
 *   - hat
 *   - cape_backbling   (capes and backblings share ONE slot; equipping
 *                        one clears the other)
 *
 * On first load, a random costume is equipped (hat / cape-backbling start
 * empty).
 *
 * Data files expected at (relative to data-root):
 *   data/store-costumes.json
 *   data/quest-costumes.json
 *   data/unlockable-costumes.json
 *   data/unobtainable-costumes.json
 *   data/misc-costumes.json
 *   data/hats.json
 *   data/capes.json
 *   data/backblings.json
 *
 * The 5 costume files above are all merged into a single "costume"
 * category at runtime (see CATEGORY_FILES) — availability (Free / Paid /
 * Quest / Unlockable / Unobtainable / Miscellaneous) is tracked per-item
 * via each item's own `availability` field, not by which file it came
 * from, so a file's items don't have to all share one tier.
 *
 * Each file: { "description": "...", "items": [ { slug, name, date,
 *   availability, price?, thumbnail, model, page?, tags? }, ... ] }
 *
 * Usage: drop a single element in the page —
 *   <div id="cosmeticLocker" data-root="../"></div>
 * — after Babylon core + loaders are included, then include this script.
 */
(function () {
  const CATEGORY_FILES = {
    // costume now loads from several files instead of one — each file
    // corresponds to a costume availability tier. All are merged into a
    // single "costume" category at runtime; the availability filter (see
    // AVAILABILITY_OPTIONS) is what actually distinguishes them for the
    // user, not which file they came from.
    costume: {
      files: [
        "store-costumes.json",
        "quest-costumes.json",
        "unlockable-costumes.json",
        "unobtainable-costumes.json",
        "misc-costumes.json",
      ],
      label: "Costumes",
    },
    hat: { files: ["hats.json"], label: "Hats" },
    cape: { files: ["capes.json"], label: "Capes" },
    backbling: { files: ["backblings.json"], label: "Backblings" },
  };

  // Availability tiers shown in the filter sidebar. Value is the lowercase
  // string expected/matched against each item's `availability` field in the
  // JSON data files; label is what's displayed to the user.
  const AVAILABILITY_OPTIONS = [
    ["free", "Free"],
    ["paid", "Paid"],
    ["quest", "Quest"],
    ["unlockable", "Unlockable"],
    ["unobtainable", "Unobtainable"],
    ["miscellaneous", "Miscellaneous"],
  ];

  // Which slot a category occupies. Cape + Backbling share one slot.
  const CATEGORY_SLOT = {
    costume: "costume",
    hat: "hat",
    cape: "cape_backbling",
    backbling: "cape_backbling",
  };

  // Node name (case-insensitive) inside a costume's hierarchy that should be
  // hidden whenever a Hat is equipped, so headwear doesn't clip through the
  // costume's own helmet/hood/hair geometry.
  const HELMET_NODE_NAME = "helmet";

  // Node names (case-insensitive) inside a costume's hierarchy that should
  // be hidden whenever a Cape (not a Backbling) is equipped, so shoulder/back
  // armor doesn't clip through the cape geometry.
  const CAPE_HIDDEN_NODE_NAMES = ["leftarmarmor", "rightarmarmor", "bodyarmor"];

  // Capes all share ONE globally-used mesh (same approach as player.html /
  // server.js): rather than each cape shipping its own .glb, every cape
  // loads this single model and gets its own look via a per-cape PNG
  // texture applied on top. Backblings are unaffected and keep loading
  // their own unique per-item .glb via item.model as before.
  const SHARED_CAPE_MODEL_URL = "store/cape.glb";

  // Derive a cape item's texture URL, mirroring player.html's
  // getCapeTextureUrl(): "/models/{name}.png". Prefers an explicit
  // item.texture field if the data provides one.
  function getCapeTextureUrl(item) {
    if (item.texture) return item.texture;
    const name = item.slug || item.name;
    return name ? `/models/${encodeURIComponent(name)}.png` : null;
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(str) {
    return String(str == null ? "" : str).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  // Resolve an asset path against the page's data root — but leave it
  // untouched if it's already an absolute URL (http(s)://, protocol-relative
  // //, or a root-relative /path), since those shouldn't be prefixed.
  function resolveAsset(dataRoot, path) {
    if (!path) return path;
    if (
      /^(https?:)?\/\//i.test(path) ||
      path.startsWith("/") ||
      path.startsWith("data:")
    ) {
      return path;
    }
    return dataRoot + path;
  }

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  class CosmeticLocker {
    constructor(rootEl) {
      this.rootEl = rootEl;
      this.dataRoot = rootEl.getAttribute("data-root") || "./";
      this.allItems = []; // flattened { ...item, category }
      this.equipped = { costume: null, hat: null, cape_backbling: null };
      this.availability = "any"; // any | free | paid | quest | unlockable | unobtainable | miscellaneous
      this.activeCategory = "all"; // all | costume | hat | cape | backbling
      this.activeTags = new Set();
      this.searchTerm = "";
      this.sort = "newest";

      this.engine = null;
      this.scene = null;
      this.camera = null;
      this.loadedNodes = { costume: [], hat: [], cape_backbling: [] };
      this.loadedSkeletons = { costume: [], hat: [], cape_backbling: [] };
      // Original (unscaled) bone scaling cache, keyed by bone name, restored
      // when the corresponding hide condition (hat/cape) no longer applies.
      this._boneOriginalScales = null;

      // The shared cape.glb is loaded once and reused for every Cape;
      // texture swaps happen on the same mesh instance instead of
      // reloading the model. Backblings still load their own unique .glb
      // through the normal loadedNodes.cape_backbling / _loadSlotModel path.
      this._sharedCapeMeshes = null; // Babylon Mesh[] once loaded
      // The top-most ancestor node of the cape's own local hierarchy (its
      // "chain top") that actually gets parented onto the costume's body
      // bone — see _showSharedCape for why this isn't the same as the
      // leaf meshes in _sharedCapeMeshes.
      this._sharedCapeChainTop = null;
      this._sharedCapeLoading = false;
      this._sharedCapeMaterial = null;
      this._pendingCapeItem = null; // item to apply once load finishes

      // Resolves once the most recently requested costume model has
      // finished loading (or immediately, if no costume load is in
      // flight). _showSharedCape awaits this before fetching cape.glb, so
      // the cape never tries to parent onto the costume's body bone
      // before that bone/skeleton actually exists.
      this._costumeLoadPromise = Promise.resolve();

      this._buildSkeleton();
      this._loadData();
    }

    // ---------------------------------------------------------------- DOM
    _buildSkeleton() {
      this.rootEl.classList.add("locker");
      this.rootEl.innerHTML = `
        <div class="locker__searchbar">
          <input class="locker__search" type="text" placeholder="Search models, taglines, and tags" />
          <select class="locker__sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A–Z</option>
          </select>
        </div>
        <div class="locker__layout">
          <aside class="locker__filters">
            <div class="locker__filter-group">
              <h4>Availability</h4>
              <div class="locker__radio-list" data-role="availability"></div>
            </div>
            <div class="locker__filter-group">
              <h4>Categories</h4>
              <div class="locker__category-grid" data-role="categories"></div>
            </div>
            <div class="locker__filter-group">
              <h4>Tags</h4>
              <input class="locker__tag-filter" type="text" placeholder="Filter tags" data-role="tag-filter" />
              <div class="locker__check-list" data-role="tags"></div>
            </div>
          </aside>

          <div class="locker__stage-col">
            <div class="locker__stage">
              <div class="locker__stage-empty" data-role="stage-empty" style="display:none">
                Select a costume, hat, or cape/backbling to preview it here.
              </div>
              <canvas data-role="canvas"></canvas>
            </div>
            <div class="locker__browse-grid" data-role="browse-grid"></div>
          </div>

          <aside class="locker__equipped">
            <h4>Equipped</h4>
            <div class="locker__equipped-row">
              <div class="locker__slot-group">
                <div class="locker__slot-label">Costume</div>
                <div class="locker__slot" data-role="slot-costume"></div>
              </div>
              <div class="locker__slot-group">
                <div class="locker__slot-label">Hat</div>
                <div class="locker__slot" data-role="slot-hat"></div>
              </div>
              <div class="locker__slot-group">
                <div class="locker__slot-label">Cape / Backbling</div>
                <div class="locker__slot" data-role="slot-cape_backbling"></div>
              </div>
            </div>
          </aside>
        </div>
      `;

      this.$ = {
        search: this.rootEl.querySelector(".locker__search"),
        sort: this.rootEl.querySelector(".locker__sort"),
        availability: this.rootEl.querySelector('[data-role="availability"]'),
        categories: this.rootEl.querySelector('[data-role="categories"]'),
        tagFilter: this.rootEl.querySelector('[data-role="tag-filter"]'),
        tags: this.rootEl.querySelector('[data-role="tags"]'),
        stageEmpty: this.rootEl.querySelector('[data-role="stage-empty"]'),
        canvas: this.rootEl.querySelector('[data-role="canvas"]'),
        browseGrid: this.rootEl.querySelector('[data-role="browse-grid"]'),
        slotCostume: this.rootEl.querySelector('[data-role="slot-costume"]'),
        slotHat: this.rootEl.querySelector('[data-role="slot-hat"]'),
        slotCape: this.rootEl.querySelector(
          '[data-role="slot-cape_backbling"]',
        ),
      };

      this.$.search.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this._renderBrowseGrid();
      });
      this.$.sort.addEventListener("change", (e) => {
        this.sort = e.target.value;
        this._renderBrowseGrid();
      });
      this.$.tagFilter.addEventListener("input", () => this._renderTagList());

      this._initBabylon();
    }

    // ---------------------------------------------------------------- data
    async _loadData() {
      const entries = await Promise.all(
        Object.entries(CATEGORY_FILES).map(async ([cat, meta]) => {
          // Fetch every file configured for this category in parallel,
          // then flatten them into one list of items tagged with `cat`.
          // A category with only one file (hat/cape/backbling) behaves
          // exactly as before; costume now merges 5 files together.
          const perFile = await Promise.all(
            meta.files.map((file) => fetchJSON(`${this.dataRoot}data/${file}`)),
          );
          const items = perFile.flatMap((data) => (data && data.items) || []);
          return items.map((item) => ({ ...item, category: cat }));
        }),
      );
      this.allItems = entries.flat();

      this._renderAvailabilityFilters();
      this._renderCategoryFilters();
      this._renderTagList();
      this._renderBrowseGrid();

      // If the URL already names equipped items (e.g. a shared link like
      // ?endolotl&shark-hat&ender-pearl-cape), restore those instead of
      // picking a random costume.
      const restoredFromURL = this._applyEquippedFromURL();
      if (!restoredFromURL) {
        // Random costume on first load
        const costumes = this.allItems.filter((i) => i.category === "costume");
        if (costumes.length) {
          const pick = costumes[Math.floor(Math.random() * costumes.length)];
          this._equip(pick);
        }
      }
      this._renderEquippedPanel();
    }

    _filteredItems() {
      let items = this.allItems;

      if (this.availability !== "any") {
        items = items.filter(
          (i) => (i.availability || "").toLowerCase() === this.availability,
        );
      }
      if (this.activeCategory !== "all") {
        items = items.filter((i) => i.category === this.activeCategory);
      }
      if (this.activeTags.size) {
        items = items.filter((i) =>
          (i.tags || []).some((t) => this.activeTags.has(t)),
        );
      }
      if (this.searchTerm) {
        items = items.filter(
          (i) =>
            (i.name || "").toLowerCase().includes(this.searchTerm) ||
            (i.tags || []).some((t) =>
              t.toLowerCase().includes(this.searchTerm),
            ),
        );
      }

      items = items.slice();
      if (this.sort === "az") {
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      } else if (this.sort === "oldest") {
        items.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      } else {
        items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      }
      return items;
    }

    // ---------------------------------------------------------- filter UI
    _renderAvailabilityFilters() {
      const counts = { any: this.allItems.length };
      AVAILABILITY_OPTIONS.forEach(([val]) => {
        counts[val] = 0;
      });
      this.allItems.forEach((i) => {
        const a = (i.availability || "").toLowerCase();
        if (counts[a] !== undefined) counts[a]++;
      });

      const opts = [["any", "Any"], ...AVAILABILITY_OPTIONS];

      this.$.availability.innerHTML = opts
        .map(
          ([val, label]) => `
        <label class="locker__radio">
          <span class="locker__radio-label">
            <input type="radio" name="locker-availability" value="${val}" ${val === this.availability ? "checked" : ""}/>
            ${esc(label)}
          </span>
          <span class="locker__count">${counts[val] || 0}</span>
        </label>`,
        )
        .join("");

      this.$.availability.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", (e) => {
          this.availability = e.target.value;
          this._renderCategoryFilters();
          this._renderBrowseGrid();
        });
      });
    }

    _renderCategoryFilters() {
      const cats = [["all", "All", null]].concat(
        Object.entries(CATEGORY_FILES).map(([cat, meta]) => {
          const sample = this.allItems.find((i) => i.category === cat);
          let thumb = sample ? sample.thumbnail : null;
          if (sample && cat === "costume" && sample.page) {
            thumb = `${sample.page.replace(/\/?$/, "/")}avatar.png`;
          }
          return [cat, meta.label, thumb];
        }),
      );

      this.$.categories.innerHTML = cats
        .map(([val, label, thumb]) => {
          const active = val === this.activeCategory ? " is-active" : "";
          const img = thumb
            ? `<img src="${esc(resolveAsset(this.dataRoot, thumb))}" alt="" loading="lazy">`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--hg-ink-dim);font-size:10px;">All</div>`;
          return `<button type="button" class="locker__category-thumb${active}" data-cat="${val}">
            ${img}
            <span class="locker__category-name">${esc(label)}</span>
          </button>`;
        })
        .join("");

      this.$.categories.querySelectorAll("[data-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.activeCategory = btn.getAttribute("data-cat");
          this._renderCategoryFilters();
          this._renderBrowseGrid();
        });
      });
    }

    _renderTagList() {
      const filterText = (this.$.tagFilter.value || "").toLowerCase();
      const tagCounts = new Map();
      this.allItems.forEach((i) => {
        (i.tags || []).forEach((t) =>
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1),
        );
      });

      const tags = Array.from(tagCounts.entries())
        .filter(([t]) => t.toLowerCase().includes(filterText))
        .sort((a, b) => b[1] - a[1]);

      this.$.tags.innerHTML = tags
        .map(
          ([tag, count]) => `
        <label class="locker__check">
          <span class="locker__check-label">
            <input type="checkbox" value="${esc(tag)}" ${this.activeTags.has(tag) ? "checked" : ""}/>
            #${esc(tag)}
          </span>
          <span class="locker__count">${count}</span>
        </label>`,
        )
        .join("");

      this.$.tags.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", (e) => {
          if (e.target.checked) this.activeTags.add(e.target.value);
          else this.activeTags.delete(e.target.value);
          this._renderBrowseGrid();
        });
      });
    }

    _renderBrowseGrid() {
      const items = this._filteredItems();

      if (!items.length) {
        this.$.browseGrid.innerHTML = `<div style="grid-column:1/-1;color:var(--hg-ink-dim);font-size:13px;padding:20px 0;">No cosmetics match these filters.</div>`;
        return;
      }

      this.$.browseGrid.innerHTML = items
        .map((item) => {
          const slot = CATEGORY_SLOT[item.category];
          const isEquipped =
            this.equipped[slot] &&
            this.equipped[slot].slug === item.slug &&
            this.equipped[slot].category === item.category;
          return `<button type="button" class="locker__item-thumb${isEquipped ? " is-equipped" : ""}"
            data-slug="${esc(item.slug)}" data-category="${esc(item.category)}" title="${esc(item.name)}">
            <img src="${esc(resolveAsset(this.dataRoot, item.thumbnail))}" alt="${esc(item.name)}" loading="lazy">
            <span class="locker__item-name">${esc(item.name)}</span>
          </button>`;
        })
        .join("");

      this.$.browseGrid.querySelectorAll("[data-slug]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const slug = btn.getAttribute("data-slug");
          const category = btn.getAttribute("data-category");
          const item = this.allItems.find(
            (i) => i.slug === slug && i.category === category,
          );
          if (!item) return;

          const slot = CATEGORY_SLOT[item.category];
          const current = this.equipped[slot];
          // Click again on an equipped item to unequip it
          if (
            current &&
            current.slug === item.slug &&
            current.category === item.category
          ) {
            this._unequipSlot(slot);
          } else {
            this._equip(item);
          }
        });
      });
    }

    // -------------------------------------------------------------- equip
    // `syncURL` defaults to true so every normal equip click updates the
    // address bar. It's passed as false only from _applyEquippedFromURL,
    // which equips several items back-to-back while restoring a shared
    // link and syncs the URL itself once at the end instead.
    _equip(item, { syncURL = true } = {}) {
      const slot = CATEGORY_SLOT[item.category];
      const previous = this.equipped[slot];
      this.equipped[slot] = item;
      this._renderEquippedPanel();
      this._renderBrowseGrid();

      if (item.category === "cape") {
        // If a Backbling glb was previously loaded in this slot, dispose
        // it. If a cape was already showing, leave loadedNodes alone —
        // _showSharedCape reuses the existing shared mesh and just swaps
        // its texture instead of reloading/disposing anything.
        if (previous && previous.category === "backbling") {
          this._clearSlotModel(slot);
        }
        this._showSharedCape(item);
      } else {
        if (slot === "cape_backbling") this._clearSharedCape();
        this._loadSlotModel(slot, item);
      }

      if (slot === "hat") this._syncHelmetVisibility();
      if (slot === "cape_backbling") this._syncCapeArmorVisibility();

      if (syncURL) this._syncURL();
    }

    _unequipSlot(slot, { syncURL = true } = {}) {
      this.equipped[slot] = null;
      this._renderEquippedPanel();
      this._renderBrowseGrid();
      this._clearSlotModel(slot);
      if (slot === "cape_backbling") this._clearSharedCape();
      if (slot === "hat") this._syncHelmetVisibility();
      if (slot === "cape_backbling") this._syncCapeArmorVisibility();

      if (syncURL) this._syncURL();
    }

    // ------------------------------------------------------------- URL sync
    // Reflects the currently equipped items in the address bar as bare,
    // "&"-joined slugs — e.g. ?endolotl&shark-hat&ender-pearl-cape —
    // rather than standard key=value query params, per the requested
    // format. Uses replaceState (not pushState) so clicking through the
    // locker doesn't spam the browser's back-button history; each equip
    // simply overwrites the current URL entry.
    _syncURL() {
      if (typeof window === "undefined" || !window.history) return;
      const slugs = [
        this.equipped.costume,
        this.equipped.hat,
        this.equipped.cape_backbling,
      ]
        .filter(Boolean)
        .map((item) => encodeURIComponent(item.slug));

      const newSearch = slugs.length ? `?${slugs.join("&")}` : "";
      const newUrl = `${location.pathname}${newSearch}${location.hash}`;
      // Avoid a redundant history entry if nothing actually changed.
      if (newUrl === `${location.pathname}${location.search}${location.hash}`)
        return;
      window.history.replaceState(null, "", newUrl);
    }

    // Reads bare slugs out of location.search (?slug&slug&slug, no "="),
    // looks each one up across every loaded category, and equips whatever
    // matches. Returns true if at least one item from the URL was
    // equipped, so the caller knows whether to fall back to the default
    // random costume. Unknown/stale slugs are silently ignored.
    _applyEquippedFromURL() {
      const raw = (location.search || "").replace(/^\?/, "");
      if (!raw) return false;

      const tokens = raw
        .split("&")
        .map((t) => {
          try {
            return decodeURIComponent(t);
          } catch {
            return t;
          }
        })
        .filter(Boolean);
      if (!tokens.length) return false;

      const matched = tokens
        .map((slug) => this.allItems.find((i) => i.slug === slug))
        .filter(Boolean);
      if (!matched.length) return false;

      // Equip the costume (if any) before hat/cape/backbling, regardless
      // of what order the slugs happened to appear in the URL. The cape
      // gate in _showSharedCape only has something to wait on once the
      // costume's load has actually been kicked off — equipping the
      // costume last would let the cape start (and finish) loading
      // before that gate is ever set, defeating the point of it.
      matched.sort((a, b) => {
        const aIsCostume = a.category === "costume" ? 0 : 1;
        const bIsCostume = b.category === "costume" ? 0 : 1;
        return aIsCostume - bIsCostume;
      });

      matched.forEach((item) => this._equip(item, { syncURL: false }));
      this._syncURL();
      return true;
    }

    _formatPrice(price) {
      if (price === undefined || price === null || price === "") return "";
      const display =
        typeof price === "number" ? `${price} Minecoins` : esc(price);
      return `<div class="locker__slot-price">${display}</div>`;
    }

    _renderEquippedPanel() {
      const render = (target, item, slotKey) => {
        if (!item) {
          target.innerHTML = `
            <div class="locker__slot-thumb">
              <div class="locker__slot-placeholder">Empty</div>
            </div>`;
          return;
        }
        const equippedImg =
          slotKey === "costume" && item.page
            ? `${item.page.replace(/\/?$/, "/")}avatar.png`
            : item.thumbnail;
        target.innerHTML = `
          <div class="locker__slot-thumb">
            <img src="${esc(resolveAsset(this.dataRoot, equippedImg))}" alt="${esc(item.name)}">
          </div>
          <div class="locker__slot-info">
            <div class="locker__slot-name">${esc(item.name)}</div>
            ${this._formatPrice(item.price)}
          </div>
          <button type="button" class="locker__slot-clear" title="Unequip">✕</button>`;
        target
          .querySelector(".locker__slot-clear")
          .addEventListener("click", () => this._unequipSlot(slotKey));
      };

      render(this.$.slotCostume, this.equipped.costume, "costume");
      render(this.$.slotHat, this.equipped.hat, "hat");
      render(this.$.slotCape, this.equipped.cape_backbling, "cape_backbling");
    }

    // ----------------------------------------------------------- Babylon
    _initBabylon() {
      if (!window.BABYLON) {
        console.warn("cosmetic-locker: BABYLON is not loaded");
        return;
      }
      const canvas = this.$.canvas;
      const engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
      });
      engine.loadingScreenEnabled = false;
      engine.setHardwareScalingLevel(1 / (window.devicePixelRatio || 1));
      this.engine = engine;

      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
      this.scene = scene;

      const camera = new BABYLON.ArcRotateCamera(
        "lockerCamera",
        Math.PI / 0.6,
        Math.PI / 2.63,
        10,
        BABYLON.Vector3.Zero(),
        scene,
      );
      camera.attachControl(canvas, true);
      camera.panningSensibility = 700;
      camera.wheelPrecision = 30;
      this.camera = camera;

      // Babylon's own wheel handling zooms the camera, but doesn't stop
      // the underlying page from also scrolling on the same wheel event.
      // touch-action: none (see cosmetic-locker.css) blocks touch-drag
      // page scroll, but has no effect on a desktop mouse wheel — so we
      // need an explicit non-passive wheel listener here to preventDefault
      // and stop the scroll from propagating past the canvas.
      canvas.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
        },
        { passive: false },
      );

      const light = new BABYLON.HemisphericLight(
        "lockerLight",
        new BABYLON.Vector3(0, 1, 0),
        scene,
      );
      light.intensity = 0.9;

      scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN)
          canvas.style.cursor = "grabbing";
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP)
          canvas.style.cursor = "grab";
      });

      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());

      this._updateStageEmptyState();
    }

    _updateStageEmptyState() {
      const anyEquipped =
        this.equipped.costume ||
        this.equipped.hat ||
        this.equipped.cape_backbling;
      this.$.stageEmpty.style.display = anyEquipped ? "none" : "flex";
    }

    // Find the linked TransformNode for a named bone on the costume's
    // skeleton (case-insensitive), or null if there's no skeleton loaded,
    // no bone with that name, or the bone has no linked transform node.
    // Bones (e.g. "body", "helmet") live inside Skeleton.bones and are NOT
    // scene-graph Nodes, so scene.getNodeByName() can never find them —
    // this is the correct way to get something mesh.parent can point at.
    _getCostumeBoneTransformNode(boneName) {
      const skeletons = this.loadedSkeletons.costume || [];
      for (const skeleton of skeletons) {
        const bone = skeleton.bones.find(
          (b) => b.name && b.name.toLowerCase() === boneName.toLowerCase(),
        );
        if (!bone) continue;
        const node =
          typeof bone.getTransformNode === "function"
            ? bone.getTransformNode()
            : null;
        if (node) return node;
      }
      return null;
    }

    // Hide/show a named bone inside the costume's skeleton by scaling the
    // bone itself to (near) zero, or restoring its original scale. Used
    // both for the "helmet" bone (hidden when a Hat is equipped) and the
    // arm/body armor bones (hidden when a Cape is equipped). Requires the
    // bone to be a leaf with no children, so collapsing it doesn't distort
    // the rest of the rig. We scale the Bone directly via setScale/scaling
    // rather than going through getTransformNode(), since not every
    // imported glTF joint ends up with a linked TransformNode, but every
    // Bone always supports direct scaling.
    _setCostumeBoneHidden(boneName, hidden) {
      const skeletons = this.loadedSkeletons.costume || [];
      if (!skeletons.length) return;

      if (!this._boneOriginalScales) this._boneOriginalScales = {};

      skeletons.forEach((skeleton) => {
        const bone = skeleton.bones.find(
          (b) => b.name && b.name.toLowerCase() === boneName,
        );
        if (!bone) {
          console.warn(
            `cosmetic-locker: no bone named "${boneName}" found on costume skeleton; skipping hide.`,
          );
          return;
        }

        if (!this._boneOriginalScales[boneName]) {
          this._boneOriginalScales[boneName] = bone.getScale
            ? bone.getScale().clone()
            : bone.scaling.clone();
        }
        const original = this._boneOriginalScales[boneName];

        if (hidden) {
          if (typeof bone.setScale === "function") {
            bone.setScale(new BABYLON.Vector3(0.0001, 0.0001, 0.0001));
          } else {
            bone.scaling.setAll(0.0001);
          }
        } else if (typeof bone.setScale === "function") {
          bone.setScale(original);
        } else {
          bone.scaling.copyFrom(original);
        }

        // Also mirror the change onto the linked transform node, if any,
        // since some Babylon versions read from the node rather than the
        // bone's own matrix when computing the final skin matrices.
        const target =
          typeof bone.getTransformNode === "function"
            ? bone.getTransformNode()
            : null;
        if (target) {
          if (hidden) {
            target.scaling.setAll(0.0001);
          } else {
            target.scaling.copyFrom(original);
          }
        }

        if (skeleton.markAsDirty) skeleton.markAsDirty();
      });
    }

    // Hide/show the costume's own "helmet" part based on whether a Hat is
    // currently equipped. The helmet is a bone (not a separate mesh) inside
    // the costume's single skinned mesh, so we hide it via bone scaling.
    _syncHelmetVisibility() {
      this._setCostumeBoneHidden(HELMET_NODE_NAME, !!this.equipped.hat);
    }

    // Hide/show the costume's arm/body armor bones based on whether a Cape
    // (as opposed to a Backbling, which shares the same equip slot) is
    // currently equipped, so the armor doesn't clip through the cape.
    _syncCapeArmorVisibility() {
      const capeEquipped =
        !!this.equipped.cape_backbling &&
        this.equipped.cape_backbling.category === "cape";
      CAPE_HIDDEN_NODE_NAMES.forEach((name) =>
        this._setCostumeBoneHidden(name, capeEquipped),
      );
    }

    _clearSlotModel(slot) {
      // If we're about to dispose the costume's skeleton/nodes, detach any
      // currently-equipped shared cape first. The cape is parented (via
      // its chain-top wrapper node) to a TransformNode linked to a bone on
      // THIS skeleton (see _showSharedCape/_reattachSharedCape); disposing
      // the skeleton out from under it orphans the cape and it silently
      // stops rendering. Un-parenting (rather than disposing) keeps it
      // alive so _reattachSharedCape() can re-parent it onto the next
      // costume once that finishes loading.
      //
      // Important: un-parent the tracked chain-top wrapper, NOT the leaf
      // meshes directly — the leaf's local position is only meaningful
      // relative to that wrapper (see _showSharedCape), so detaching the
      // leaf itself would silently corrupt the same offset this whole
      // chain-top approach exists to preserve.
      if (slot === "costume" && this._sharedCapeChainTop) {
        try {
          this._sharedCapeChainTop.parent = null;
        } catch {}
      }

      (this.loadedNodes[slot] || []).forEach((node) => {
        try {
          node.dispose();
        } catch {}
      });
      (this.loadedSkeletons[slot] || []).forEach((skeleton) => {
        try {
          skeleton.dispose();
        } catch {}
      });
      this.loadedNodes[slot] = [];
      this.loadedSkeletons[slot] = [];
      if (slot === "costume") this._boneOriginalScales = null;
      this._updateStageEmptyState();
      this._refitCamera();
    }

    // ---------------------------------------------------- shared cape.glb
    // Capes all reuse one globally-loaded mesh instead of a per-item .glb;
    // only the texture changes between capes. This mirrors player.html's
    // showCapeOnPlayer()/applyTextureToCape() so the two viewers behave and
    // look identical for capes.

    _applyCapeTexture(textureUrl) {
      if (!this.scene || !this._sharedCapeMeshes || !textureUrl) return;

      const tex = new BABYLON.Texture(
        resolveAsset(this.dataRoot, textureUrl),
        this.scene,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
      );
      tex.hasAlpha = true;
      tex.vScale = 1;
      tex.vOffset = 1;

      this._sharedCapeMeshes.forEach((mesh, index) => {
        // Always use our own StandardMaterial rather than reusing whatever
        // material the glb shipped with. cape.glb imports with its own
        // (untextured) PBRMaterial already attached, so relying on
        // "!mesh.material" to decide whether to create one meant this
        // branch was skipped and the texture assignments below landed on
        // properties (albedoTexture etc.) that the imported material
        // wasn't actually rendering from, silently doing nothing.
        if (
          !mesh.material ||
          mesh.material.getClassName() !== "StandardMaterial"
        ) {
          mesh.material = new BABYLON.StandardMaterial(
            `lockerCapeMaterial${index}`,
            this.scene,
          );
        }
        mesh.material.diffuseTexture = tex;
        mesh.material.emissiveTexture = tex;
        mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mesh.material.specularColor = new BABYLON.Color3(0, 0, 0);
        mesh.material.backFaceCulling = false;
      });
    }

    _showSharedCape(item) {
      const textureUrl = getCapeTextureUrl(item);
      if (!textureUrl || !this.scene) return;

      this._pendingCapeItem = item;

      if (this._sharedCapeMeshes && this._sharedCapeMeshes.length) {
        // Already loaded — just swap the texture on the existing mesh.
        // This doesn't touch parenting, so it's safe regardless of
        // whether a costume load happens to be in flight right now.
        this._applyCapeTexture(textureUrl);
        this.loadedNodes.cape_backbling = this._sharedCapeMeshes;
        this._updateStageEmptyState();
        this._refitCamera();
        return;
      }

      if (this._sharedCapeLoading) return;
      this._sharedCapeLoading = true;

      // Don't fetch cape.glb until any in-flight costume load has
      // finished. The cape gets parented onto the costume's "body"
      // skeleton bone (see below), and if that bone/skeleton doesn't
      // exist yet the cape ends up unparented and floating at the scene
      // origin instead of attached to the character — waiting here (the
      // promise resolves immediately if no costume load is pending)
      // guarantees the bone always exists first.
      this._costumeLoadPromise.then(() => {
        // The cape slot may have been unequipped, or swapped to a
        // different cape, while we were waiting — bail out if this
        // request is no longer the current one.
        if (
          !this._pendingCapeItem ||
          this._pendingCapeItem.slug !== item.slug
        ) {
          this._sharedCapeLoading = false;
          return;
        }
        this._fetchSharedCapeModel(item, textureUrl);
      });
    }

    // The actual cape.glb network load + parenting, split out of
    // _showSharedCape so the fetch itself can be deferred until after
    // the costume's model/skeleton is guaranteed to exist.
    _fetchSharedCapeModel(item, textureUrl) {
      const url = resolveAsset(this.dataRoot, SHARED_CAPE_MODEL_URL);
      const dir = url.slice(0, url.lastIndexOf("/") + 1);
      const file = url.slice(url.lastIndexOf("/") + 1);

      BABYLON.SceneLoader.ImportMeshAsync(
        null,
        dir,
        file,
        this.scene,
        null,
        ".glb",
      )
        .then((result) => {
          this._sharedCapeLoading = false;

          // If the cape slot was unequipped or swapped again before this
          // finished loading, discard the result instead of showing it.
          if (
            !this._pendingCapeItem ||
            this._pendingCapeItem.slug !== item.slug
          ) {
            (result.meshes || []).forEach((mesh) => {
              try {
                mesh.dispose();
              } catch {}
            });
            return;
          }

          // cape.glb bakes its own small local hierarchy (leaf mesh ->
          // one wrapper node -> the exporter's own body/waist/root chain).
          // The leaf mesh's translation is only meaningful relative to
          // that immediate wrapper — NOT relative to the costume's body
          // bone directly. Re-parenting the leaf mesh alone (dropping the
          // wrapper) silently discards part of the authored offset and
          // collapses the cape toward the body origin, which is why it
          // was rendering inside the costume instead of behind it.
          //
          // Fix: walk each leaf mesh up to the top-most ancestor whose OWN
          // parent is not also part of this same imported result (i.e. the
          // node the exporter's root would otherwise have parented), and
          // re-parent THAT node onto the costume's body bone. This keeps
          // the mesh's local translation relative to its original wrapper
          // fully intact; only the top of the chain gets re-homed.
          const importedNodeSet = new Set(result.meshes || []);
          const meshes = (result.meshes || []).filter(
            (mesh) => mesh.getClassName && mesh.getClassName() === "Mesh",
          );
          if (!meshes.length) return;

          function topOfImportedChain(node) {
            let current = node;
            while (current.parent && importedNodeSet.has(current.parent)) {
              current = current.parent;
            }
            return current;
          }

          // Parent the cape onto the costume's "body" bone. "body" is a
          // skeleton bone (like "helmet"/"bodyArmor"), not a scene-graph
          // Node, so scene.getNodeByName() can't find it — we have to look
          // it up on the costume's skeleton and use its linked transform
          // node, same approach as _setCostumeBoneHidden.
          const parentNode =
            this._getCostumeBoneTransformNode("body") ||
            (this.loadedNodes.costume && this.loadedNodes.costume[0]) ||
            null;
          const parentedToBone = !!this._getCostumeBoneTransformNode("body");

          const reparentedChainTops = new Set();
          meshes.forEach((mesh) => {
            const chainTop = topOfImportedChain(mesh);
            // Only re-parent each chain's top node once, even if multiple
            // leaf meshes share the same wrapper ancestor.
            if (!reparentedChainTops.has(chainTop)) {
              reparentedChainTops.add(chainTop);
              // Track it so _reattachSharedCape can re-home this same
              // wrapper on future costume swaps, instead of parenting the
              // leaf mesh directly (which would drop the authored offset
              // baked into the wrapper -> leaf relationship again).
              this._sharedCapeChainTop = chainTop;
              chainTop.parent = parentNode;
              // Leave the chain top's own local position/rotation exactly
              // as authored — it (and everything below it) is already
              // baked to sit correctly once anchored at the body bone.
              // Only fall back to a computed offset if there's no body
              // bone to attach to at all (nothing authored to rely on).
              if (!parentedToBone) {
                let capeY = 0;
                try {
                  const costumeRoot =
                    this.loadedNodes.costume && this.loadedNodes.costume[0];
                  const bbox = costumeRoot?.getBoundingInfo?.().boundingBox;
                  capeY = bbox ? bbox.maximum.y - 24 : 0;
                } catch {}
                chainTop.position = new BABYLON.Vector3(0, capeY, 0);
              }
              // No extra Y rotation here: the costume root is already
              // flipped 180° to face the camera (see _loadSlotModel), and
              // since the cape is parented onto a node inside that
              // rotated hierarchy, it inherits the flip automatically.
              // Adding player.html's own Math.PI on top would cancel it
              // back out.
              chainTop.rotation.y = 0;
            }
          });

          // _applyCapeTexture / _refitCamera / etc. still operate on the
          // flat list of leaf meshes (they need actual Mesh instances for
          // materials and bounding boxes) — only the parenting/positioning
          // above needed to walk up to the wrapper node.
          this._sharedCapeMeshes = meshes;
          this.loadedNodes.cape_backbling = meshes;
          this._applyCapeTexture(textureUrl);
          this._updateStageEmptyState();
          this._refitCamera();
        })
        .catch((exception) => {
          this._sharedCapeLoading = false;
          console.warn(
            "cosmetic-locker: failed to load shared cape model",
            url,
            exception,
          );
        });
    }

    _clearSharedCape() {
      this._pendingCapeItem = null;
      if (this._sharedCapeChainTop) {
        try {
          this._sharedCapeChainTop.dispose();
        } catch {}
      }
      if (this._sharedCapeMeshes) {
        this._sharedCapeMeshes.forEach((mesh) => {
          try {
            mesh.dispose();
          } catch {}
        });
      }
      this._sharedCapeMeshes = null;
      this._sharedCapeChainTop = null;
      this._sharedCapeLoading = false;
      this.loadedNodes.cape_backbling = [];
      this._updateStageEmptyState();
      this._refitCamera();
    }

    // Called after the costume model (re)loads, so an already-equipped
    // cape follows the new costume's body node instead of being left
    // parented to a disposed one.
    _reattachSharedCape() {
      if (!this._sharedCapeMeshes || !this._sharedCapeMeshes.length) return;

      const parentNode =
        this._getCostumeBoneTransformNode("body") ||
        (this.loadedNodes.costume && this.loadedNodes.costume[0]) ||
        null;
      const parentedToBone = !!this._getCostumeBoneTransformNode("body");

      // Re-parent the tracked chain-top wrapper (not the leaf meshes) so
      // the cape's authored local offset — baked into the wrapper -> leaf
      // relationship inside cape.glb — stays intact across costume swaps.
      // See _showSharedCape for why re-parenting the leaf mesh directly
      // would be wrong here.
      const node = this._sharedCapeChainTop || this._sharedCapeMeshes[0];
      node.parent = parentNode;
      // See _showSharedCape: leave the cape's authored local position
      // untouched when parented to the body bone; only the no-bone
      // fallback needs a computed offset.
      if (!parentedToBone) {
        let capeY = 0;
        try {
          const costumeRoot =
            this.loadedNodes.costume && this.loadedNodes.costume[0];
          const bbox = costumeRoot?.getBoundingInfo?.().boundingBox;
          capeY = bbox ? bbox.maximum.y - 24 : 0;
        } catch {}
        node.position = new BABYLON.Vector3(0, capeY, 0);
      }
      // See _showSharedCape: no extra rotation needed, the parent
      // costume hierarchy is already flipped to face the camera.
      node.rotation.y = 0;

      this.loadedNodes.cape_backbling = this._sharedCapeMeshes;
    }

    _loadSlotModel(slot, item) {
      if (!this.scene) return;
      this._clearSlotModel(slot);

      const url = resolveAsset(this.dataRoot, item.model);
      const dir = url.slice(0, url.lastIndexOf("/") + 1);
      const file = url.slice(url.lastIndexOf("/") + 1);

      // If this is a costume load, open a new gate that _showSharedCape
      // waits on before fetching cape.glb — see _costumeLoadPromise.
      let resolveCostumeLoad = null;
      if (slot === "costume") {
        this._costumeLoadPromise = new Promise((resolve) => {
          resolveCostumeLoad = resolve;
        });
      }

      BABYLON.SceneLoader.ImportMeshAsync(
        null,
        dir,
        file,
        this.scene,
        null,
        ".glb",
      )
        .then((result) => {
          const meshes = result.meshes;
          const skeletons = result.skeletons || [];
          if (!meshes || !meshes.length) return;
          // Source models face away from the camera by default; flip every
          // top-level (parentless) node 180° around Y so they face forward
          // instead. We rotate ALL root-level nodes rather than assuming
          // meshes[0] is a single shared "__root__" wrapper, since that
          // isn't guaranteed across every exported glb.
          meshes.forEach((mesh) => {
            if (!mesh.parent) {
              mesh.rotationQuaternion = null;
              mesh.rotation.y += Math.PI;
            }
          });
          meshes.forEach((mesh) => {
            if (mesh.material && mesh.material.albedoTexture) {
              mesh.material.emissiveTexture = mesh.material.albedoTexture;
              mesh.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
            }
          });
          this.loadedNodes[slot] = meshes;
          this.loadedSkeletons[slot] = skeletons;
          this._updateStageEmptyState();
          this._syncHelmetVisibility();
          this._syncCapeArmorVisibility();
          if (slot === "costume") this._reattachSharedCape();
          this._refitCamera();
        })
        .catch((exception) => {
          console.warn("cosmetic-locker: failed to load model", url, exception);
        })
        .finally(() => {
          // Open the gate whether the costume load succeeded or failed,
          // so a broken costume model can't permanently block a cape from
          // ever loading.
          if (slot === "costume" && resolveCostumeLoad) resolveCostumeLoad();
        });
    }

    _refitCamera() {
      const allMeshes = [
        ...this.loadedNodes.costume,
        ...this.loadedNodes.hat,
        ...this.loadedNodes.cape_backbling,
      ].filter((m) => m.getBoundingInfo);

      if (!allMeshes.length) return;

      const bounds = allMeshes.map((m) => m.getBoundingInfo().boundingBox);
      const min = bounds.reduce(
        (acc, box) => BABYLON.Vector3.Minimize(acc, box.minimumWorld),
        bounds[0].minimumWorld.clone(),
      );
      const max = bounds.reduce(
        (acc, box) => BABYLON.Vector3.Maximize(acc, box.maximumWorld),
        bounds[0].maximumWorld.clone(),
      );
      const center = min.add(max).scale(0.5);
      const size = max.subtract(min);
      const radius = Math.max(size.x, size.y, size.z) * 1.85 || 10;

      this.camera.setTarget(center);
      this.camera.radius = radius;
      this.camera.lowerRadiusLimit = radius * 0.4;
      this.camera.upperRadiusLimit = radius * 3;
    }
  }

  function init() {
    const rootEl = document.getElementById("cosmeticLocker");
    if (!rootEl) return;
    new CosmeticLocker(rootEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
