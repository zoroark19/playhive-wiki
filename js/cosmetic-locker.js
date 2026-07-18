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
 *   data/costumes.json
 *   data/hats.json
 *   data/capes.json
 *   data/backblings.json
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
    costume: { file: "costumes.json", label: "Costumes" },
    hat: { file: "hats.json", label: "Hats" },
    cape: { file: "capes.json", label: "Capes" },
    backbling: { file: "backblings.json", label: "Backblings" },
  };

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
      this.availability = "any"; // any | free | paid | showcase
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
            <div class="locker__count-line" data-role="count-line"></div>
            <div class="locker__stage">
              <div class="locker__hint">Drag to orbit · scroll to zoom</div>
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
        countLine: this.rootEl.querySelector('[data-role="count-line"]'),
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
          const data = await fetchJSON(`${this.dataRoot}data/${meta.file}`);
          const items = (data && data.items) || [];
          return items.map((item) => ({ ...item, category: cat }));
        }),
      );
      this.allItems = entries.flat();

      this._renderAvailabilityFilters();
      this._renderCategoryFilters();
      this._renderTagList();
      this._renderBrowseGrid();

      // Random costume on first load
      const costumes = this.allItems.filter((i) => i.category === "costume");
      if (costumes.length) {
        const pick = costumes[Math.floor(Math.random() * costumes.length)];
        this._equip(pick);
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
      const counts = {
        any: this.allItems.length,
        free: 0,
        paid: 0,
        showcase: 0,
      };
      this.allItems.forEach((i) => {
        const a = (i.availability || "").toLowerCase();
        if (counts[a] !== undefined) counts[a]++;
      });

      const opts = [
        ["any", "Any"],
        ["free", "Free"],
        ["paid", "Paid"],
        ["showcase", "Showcase"],
      ];

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
      this.$.countLine.innerHTML = `<strong>${items.length}</strong> <span class="locker__count-accent">cosmetics</span>`;

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
    _equip(item) {
      const slot = CATEGORY_SLOT[item.category];
      this.equipped[slot] = item;
      this._renderEquippedPanel();
      this._renderBrowseGrid();
      this._loadSlotModel(slot, item);
      if (slot === "hat") this._syncHelmetVisibility();
      if (slot === "cape_backbling") this._syncCapeArmorVisibility();
    }

    _unequipSlot(slot) {
      this.equipped[slot] = null;
      this._renderEquippedPanel();
      this._renderBrowseGrid();
      this._clearSlotModel(slot);
      if (slot === "hat") this._syncHelmetVisibility();
      if (slot === "cape_backbling") this._syncCapeArmorVisibility();
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
      camera.panningSensibility = 0;
      camera.wheelPrecision = 30;
      this.camera = camera;

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

    _loadSlotModel(slot, item) {
      if (!this.scene) return;
      this._clearSlotModel(slot);

      const url = resolveAsset(this.dataRoot, item.model);
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
          const meshes = result.meshes;
          const skeletons = result.skeletons || [];
          if (!meshes || !meshes.length) return;
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
          this._refitCamera();
        })
        .catch((exception) => {
          console.warn("cosmetic-locker: failed to load model", url, exception);
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
