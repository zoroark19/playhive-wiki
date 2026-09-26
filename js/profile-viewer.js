/**
 * profile-viewer.js
 * -------------------------------------------------------------------------
 * A minimal, read-only 3D preview of a player's currently equipped
 * cosmetics, reusing the same Babylon.js rendering conventions as
 * cosmetic-locker.js (pixel-art texture filtering, forward-facing flip,
 * helmet-bone hiding when a hat is worn) but with everything that isn't
 * needed just to *display* a static loadout stripped out: no idle bob, no
 * propeller spin, no per-item particle effects, no texture-variant
 * cycling, and no shared/reusable cape mesh — every equipped slot just
 * loads its own .glb directly.
 *
 * The Hive API (api.playhive.com) only reports equipped cosmetics by
 * name (equipped_costume: "Some Name", equipped_hat: {name, icon,
 * rarity}, equipped_backbling: {...}) — no model path and no slug. To
 * find the actual .glb, this module loads the same wiki catalog files
 * cosmetic-locker.js uses (data/*.json) and looks each equipped name up
 * against the matching category's catalog.
 *
 * Usage (after Babylon core + loaders are included):
 *   <script src="../js/cosmetic-shared.js"></script>
 *   <div id="profileViewer" data-root="../"></div>
 *   <script src="../js/profile-viewer.js"></script>
 *   ProfileViewer.mount(document.getElementById("profileViewer"), main);
 * — where `main` is the "main" block from the Hive API response (the
 * same object profile.js already has as `main` when rendering the
 * loadout panel).
 *
 * The catalog file lists, resolveAsset/fetchJSON, the free-text
 * name-matching (normalizeName/findByName), and the .glb import/flip/
 * texture-filter sequence in _loadSlotModel all live in cosmetic-shared.js
 * now, shared with cosmetic-locker.js — see that file for what's actually
 * doing the matching/loading work. This file only keeps what's genuinely
 * specific to a static read-only preview: no idle bob, no propeller spin,
 * no per-item particle effects, no texture-variant cycling, no shared/
 * reusable cape mesh, and the helmet/cape bone-hiding follow-up below.
 */
(function () {
  const { CATEGORY_FILES, fetchJSON, findByName, loadCosmeticModel } =
    window.CosmeticShared;

  const HELMET_NODE_NAME = "helmet";
  const CAPE_HIDDEN_NODE_NAMES = ["leftarmarmor", "rightarmarmor", "bodyarmor"];

  class ProfileViewer {
    constructor(rootEl) {
      this.rootEl = rootEl;
      this.dataRoot = rootEl.getAttribute("data-root") || "./";
      this.engine = null;
      this.scene = null;
      this.camera = null;
      this.loadedNodes = { costume: [], hat: [], cape_backbling: [] };
      this.loadedSkeletons = { costume: [], hat: [], cape_backbling: [] };
      this.equipped = { costume: null, hat: null, cape_backbling: null };
      this._catalogPromise = null;

      this._buildSkeleton();
      this._initBabylon();
    }

    _buildSkeleton() {
      this.rootEl.classList.add("profile-viewer");
      this.rootEl.innerHTML = `
        <div class="profile-viewer__stage">
          <div class="profile-viewer__empty" data-role="empty" style="display:none">
            No cosmetics equipped.
          </div>
          <canvas data-role="canvas"></canvas>
        </div>
      `;
      this.$ = {
        empty: this.rootEl.querySelector('[data-role="empty"]'),
        canvas: this.rootEl.querySelector('[data-role="canvas"]'),
      };
    }

    _initBabylon() {
      if (!window.BABYLON) {
        console.warn("profile-viewer: BABYLON is not loaded");
        return;
      }
      const canvas = this.$.canvas;
      const engine = new BABYLON.Engine(canvas, false, {
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
        "profileViewerCamera",
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

      canvas.addEventListener("wheel", (event) => event.preventDefault(), {
        passive: false,
      });

      const light = new BABYLON.HemisphericLight(
        "profileViewerLight",
        new BABYLON.Vector3(0, 1, 0),
        scene,
      );
      light.intensity = 0.75;
      light.groundColor = new BABYLON.Color3(0.6, 0.6, 0.65);

      const sun = new BABYLON.DirectionalLight(
        "profileViewerSun",
        new BABYLON.Vector3(-0.4, -1, 0.6),
        scene,
      );
      sun.intensity = 0.9;
      sun.specular = new BABYLON.Color3(0, 0, 0);

      scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN)
          canvas.style.cursor = "grabbing";
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP)
          canvas.style.cursor = "grab";
      });

      engine.runRenderLoop(() => scene.render());
      window.addEventListener("resize", () => engine.resize());

      this._updateEmptyState();
    }

    _updateEmptyState() {
      const anyEquipped =
        this.equipped.costume ||
        this.equipped.hat ||
        this.equipped.cape_backbling;
      this.$.empty.style.display = anyEquipped ? "none" : "flex";
    }

    // Loads (and caches) every catalog file used for lookups, flattened
    // into one array per category so names can be matched regardless of
    // which tier/file an item actually lives in on disk.
    _loadCatalog() {
      if (this._catalogPromise) return this._catalogPromise;
      this._catalogPromise = Promise.all(
        Object.entries(CATEGORY_FILES).map(async ([category, files]) => {
          const perFile = await Promise.all(
            files.map((file) => fetchJSON(`${this.dataRoot}data/${file}`)),
          );
          const items = perFile.flatMap((data) => (data && data.items) || []);
          return [category, items];
        }),
      ).then((entries) => Object.fromEntries(entries));
      return this._catalogPromise;
    }

    // Finds a catalog item matching a free-text equipped name within a
    // given category's item list. `opts.rarity`, when available (e.g. the
    // Hive API's own equipped_hat.rarity), helps the shared matcher strip
    // a rarity prefix the API sometimes adds ahead of the item's actual
    // name (this is what caused the Starfire Crown mismatch — see
    // cosmetic-shared.js's findByName for the full matching strategy).
    _findByName(catalog, category, name, opts) {
      const items = catalog[category] || [];
      const match = findByName(items, name, opts);
      if (!match) {
        console.warn(
          `profile-viewer: no ${category} catalog entry for "${name}" — ` +
            `add it to the matching data/*.json file to fix the 3D preview.`,
        );
      }
      return match;
    }

    // Loads a single equipped model into a slot. `slot` is one of
    // costume / hat / cape_backbling; `item` must have a `model` glb
    // path (from the wiki catalog, not the API).
    _loadSlotModel(slot, item) {
      if (!this.scene || !item || !item.model) return;
      this._clearSlotModel(slot);

      loadCosmeticModel(this.scene, this.dataRoot, item)
        .then((result) => {
          if (!result) return;
          this.loadedNodes[slot] = result.meshes;
          this.loadedSkeletons[slot] = result.skeletons;
          this._updateEmptyState();
          this._syncHelmetVisibility();
          this._syncCapeArmorVisibility();
          this._refitCamera();
        })
        .catch((exception) => {
          console.warn(
            "profile-viewer: failed to load model",
            item.model,
            exception,
          );
        });
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
      this._updateEmptyState();
    }

    _setCostumeBoneHidden(boneName, hidden) {
      const skeletons = this.loadedSkeletons.costume || [];
      if (!skeletons.length) return;
      skeletons.forEach((skeleton) => {
        const bone = skeleton.bones.find(
          (b) => b.name && b.name.toLowerCase() === boneName,
        );
        if (!bone) return;
        const scale = hidden
          ? new BABYLON.Vector3(0.0001, 0.0001, 0.0001)
          : new BABYLON.Vector3(1, 1, 1);
        if (typeof bone.setScale === "function") {
          bone.setScale(scale);
        } else {
          bone.scaling.copyFrom(scale);
        }
        const target =
          typeof bone.getTransformNode === "function"
            ? bone.getTransformNode()
            : null;
        if (target) target.scaling.copyFrom(scale);
        if (skeleton.markAsDirty) skeleton.markAsDirty();
      });
    }

    _syncHelmetVisibility() {
      this._setCostumeBoneHidden(HELMET_NODE_NAME, !!this.equipped.hat);
    }

    _syncCapeArmorVisibility() {
      const capeEquipped =
        !!this.equipped.cape_backbling &&
        this.equipped.cape_backbling.category === "cape";
      CAPE_HIDDEN_NODE_NAMES.forEach((name) =>
        this._setCostumeBoneHidden(name, capeEquipped),
      );
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

    // Public entry point: given the API's `main` block, look each
    // equipped name up against the wiki catalog and load whatever
    // matches. Silently no-ops any slot it can't find a model for.
    async showEquipped(main) {
      const catalog = await this._loadCatalog();

      const costumeItem = main.equipped_costume
        ? this._findByName(catalog, "costume", main.equipped_costume)
        : null;
      const hatItem = main.equipped_hat
        ? this._findByName(catalog, "hat", main.equipped_hat.name, {
            rarity: main.equipped_hat.rarity,
          })
        : null;
      // Cape/backbling share one slot; prefer a backbling match if both
      // somehow resolve, matching cosmetic-locker.js's slot model.
      const backblingItem = main.equipped_backbling
        ? this._findByName(catalog, "backbling", main.equipped_backbling.name, {
            rarity: main.equipped_backbling.rarity,
          })
        : null;
      const capeItem = main.equipped_cape
        ? this._findByName(catalog, "cape", main.equipped_cape.name, {
            rarity: main.equipped_cape.rarity,
          })
        : null;
      const capeBacklingItem = backblingItem || capeItem;

      this.equipped.costume = costumeItem;
      this.equipped.hat = hatItem;
      this.equipped.cape_backbling = capeBacklingItem;

      if (costumeItem) this._loadSlotModel("costume", costumeItem);
      else this._clearSlotModel("costume");

      if (hatItem) this._loadSlotModel("hat", hatItem);
      else this._clearSlotModel("hat");

      if (capeBacklingItem)
        this._loadSlotModel("cape_backbling", capeBacklingItem);
      else this._clearSlotModel("cape_backbling");

      this._syncHelmetVisibility();
      this._syncCapeArmorVisibility();
      this._updateEmptyState();
    }
  }

  window.ProfileViewer = {
    // Creates a viewer bound to rootEl and immediately loads `main`'s
    // equipped cosmetics into it. Returns the ProfileViewer instance in
    // case the caller wants to call showEquipped() again later (e.g. on
    // a fresh lookup for a different username).
    mount(rootEl, main) {
      if (!rootEl) return null;
      const viewer = new ProfileViewer(rootEl);
      if (main) viewer.showEquipped(main);
      return viewer;
    },
  };
})();
