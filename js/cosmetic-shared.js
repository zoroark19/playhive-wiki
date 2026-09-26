/**
 * cosmetic-shared.js
 * -------------------------------------------------------------------------
 * Small shared module for the two Babylon.js cosmetic viewers on the site
 * (cosmetic-locker.js — the full browsable/equip-able locker, and
 * profile-viewer.js — the read-only static preview embedded in a player
 * profile). Contains only the pieces that are genuinely identical between
 * the two today:
 *
 *   - resolveAsset / fetchJSON        — tiny fetch/path helpers
 *   - CATEGORY_FILES                  — the per-category data/*.json file
 *                                        lists (locker layers its own
 *                                        sidebar `label` per category on
 *                                        top of this locally; this module
 *                                        only owns the file lists)
 *   - loadCosmeticModel               — the shared "import a .glb, flip it
 *                                        to face the camera, fix pixel-art
 *                                        texture filtering" sequence used
 *                                        by both _loadSlotModel functions.
 *                                        Callers layer their own
 *                                        locker-only (variants, particles,
 *                                        shared cape, bob/propeller) or
 *                                        viewer-only (helmet/cape bone
 *                                        hiding) follow-up work on top of
 *                                        whatever this resolves with.
 *   - normalizeName / findByName      — matches a free-text cosmetic name
 *                                        (as reported by the Hive API)
 *                                        against a catalog's item list.
 *                                        Hardened against known API text
 *                                        quirks (stray whitespace, a
 *                                        leading rarity-tier word, a
 *                                        trailing edition/number marker)
 *                                        so lookups don't silently miss
 *                                        just because the API's free-text
 *                                        name doesn't exactly match the
 *                                        catalog's stored name.
 *
 * Deliberately NOT shared here: the two classes' state machines, UI
 * rendering, particle/propeller/idle-bob code, and the shared-cape-mesh
 * reuse logic. Those solve different problems (interactive editor vs.
 * static preview) and belong in each file, not this one.
 *
 * Load this script before cosmetic-locker.js and/or profile-viewer.js:
 *   <script src="../js/cosmetic-shared.js"></script>
 *   <script src="../js/cosmetic-locker.js"></script>
 * ========================================================= */
(function () {
  // Per-category data/*.json file lists. Costume is split across several
  // availability-tier files on disk but merged into one "costume" category
  // at runtime, same as before. This is just the base file-list data —
  // cosmetic-locker.js's sidebar label per category ("Costumes", "Hats",
  // ...) stays local to cosmetic-locker.js since profile-viewer.js has no
  // use for it.
  const CATEGORY_FILES = {
    costume: [
      "store-costumes.json",
      "quest-costumes.json",
      "unlockable-costumes.json",
      "unobtainable-costumes.json",
      "misc-costumes.json",
    ],
    hat: ["hats.json"],
    cape: ["capes.json"],
    backbling: ["backblings.json"],
  };

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

  // ------------------------------------------------------------------
  // Name matching (Hive API free-text names -> catalog items)
  // ------------------------------------------------------------------
  // The Hive API reports equipped cosmetics by display name, not slug, so
  // matching that text against a catalog's stored `name` needs to survive
  // a few known quirks in the API text rather than just a case-insensitive
  // equality check:
  //   - stray/irregular whitespace
  //   - a leading rarity-tier word (e.g. "Legendary Starfire Crown" where
  //     the catalog just stores "Starfire Crown") — this is what caused
  //     the Starfire Crown mismatch: the API prefixes some names with the
  //     item's own rarity, which the catalog's stored name doesn't include
  //   - a trailing edition/number marker (e.g. "Starfire Crown #12" or
  //     "Starfire Crown (Edition 3)")
  //
  // normalizeName does the cheap, always-safe part (case/whitespace).
  // stripNameNoise additionally strips the rarity-prefix/edition-suffix
  // noise above; it's applied as a fallback, not the primary comparison,
  // so it never causes a WORSE mismatch than a plain normalized compare
  // would have.
  function normalizeName(name) {
    return String(name || "")
      .normalize("NFKC")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  const RARITY_PREFIXES = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
    "exclusive",
    "limited",
    "seasonal",
  ];

  // `opts.rarity`, when the caller has it (e.g. the Hive API's own
  // equipped_hat.rarity field), is tried first since it's an exact
  // signal for which prefix to strip rather than a guess from a fixed
  // list.
  function stripNameNoise(normalized, opts) {
    let s = normalized;

    const knownRarity = opts && opts.rarity ? normalizeName(opts.rarity) : "";
    if (knownRarity && s.startsWith(knownRarity + " ")) {
      s = s.slice(knownRarity.length).trim();
    } else {
      for (const prefix of RARITY_PREFIXES) {
        if (s.startsWith(prefix + " ")) {
          s = s.slice(prefix.length).trim();
          break;
        }
      }
    }

    // Trailing "#123", "(Edition 3)", "Edition #3", "Ed. 3", etc.
    s = s
      .replace(/\s*[([]?\s*(edition|ed\.?)\s*#?\s*\d+\s*[)\]]?\s*$/i, "")
      .replace(/\s*#\s*\d+\s*$/, "")
      .trim();

    return s;
  }

  // Finds an item in `items` whose `name` matches `name`, trying (in
  // order): an exact normalized match, a noise-stripped match against the
  // input, then a noise-stripped match on both sides (in case the catalog
  // name itself ever picks up the same kind of noise). Returns null if
  // nothing matches at any stage. `opts.rarity` is an optional hint (see
  // stripNameNoise above).
  function findByName(items, name, opts) {
    const target = normalizeName(name);
    if (!target || !items || !items.length) return null;

    let match = items.find((i) => normalizeName(i.name) === target);
    if (match) return match;

    const strippedTarget = stripNameNoise(target, opts);
    if (strippedTarget && strippedTarget !== target) {
      match = items.find((i) => normalizeName(i.name) === strippedTarget);
      if (match) return match;
    }

    const fallbackTarget = strippedTarget || target;
    match = items.find(
      (i) => stripNameNoise(normalizeName(i.name)) === fallbackTarget,
    );
    return match || null;
  }

  // ------------------------------------------------------------------
  // Model loading
  // ------------------------------------------------------------------
  // Shared "import a slot's .glb and get it ready to display" sequence:
  // import -> flip root nodes to face the camera -> fix pixel-art texture
  // filtering. Resolves to {meshes, skeletons}, or null if the import
  // succeeded but produced no meshes (mirrors both callers' original
  // silent no-op in that case — not treated as an error). Rejects if the
  // import itself fails, same as before; callers keep their own
  // .catch()/.finally() for load-failure handling and gating since that
  // differs between locker (shared-cape load gate) and viewer (none).
  //
  // Everything AFTER this point — item-variant textures, bob, propeller
  // spin, particles, shared-cape reattachment (locker); helmet/cape bone
  // hiding (viewer) — stays in each caller, since those solve different
  // problems for an interactive editor vs. a static preview.
  async function loadCosmeticModel(scene, dataRoot, item) {
    if (!scene || !item || !item.model) return null;

    const url = resolveAsset(dataRoot, item.model);
    const dir = url.slice(0, url.lastIndexOf("/") + 1);
    const file = url.slice(url.lastIndexOf("/") + 1);

    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      null,
      dir,
      file,
      scene,
      null,
      ".glb",
    );

    const meshes = result.meshes;
    const skeletons = result.skeletons || [];
    if (!meshes || !meshes.length) return null;

    // Source models face away from the camera by default; flip every
    // top-level (parentless) node 180° around Y so they face forward
    // instead. We rotate ALL root-level nodes rather than assuming
    // meshes[0] is a single shared "__root__" wrapper, since that isn't
    // guaranteed across every exported glb.
    meshes.forEach((mesh) => {
      if (!mesh.parent) {
        mesh.rotationQuaternion = null;
        mesh.rotation.y += Math.PI;
      }
    });

    meshes.forEach((mesh) => {
      if (!mesh.material) return;
      // Pixel-art textures need nearest-neighbor sampling with no
      // mipmaps — Babylon's glTF loader defaults every imported texture
      // to trilinear filtering + generated mipmaps, which blends
      // neighboring texels (including across UV island seams) into soft
      // color bleed as the camera moves back. Wrap mode is also clamped
      // so the GPU can't sample from the opposite edge of a texture at a
      // UV seam, which is the other common source of stray color
      // fringing.
      [
        mesh.material.albedoTexture,
        mesh.material.bumpTexture,
        mesh.material.emissiveTexture,
        mesh.material.metallicTexture,
        mesh.material.opacityTexture,
      ].forEach((texture) => {
        if (!texture) return;
        texture.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
        texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      });
      if (mesh.material.albedoTexture) {
        // Emissive fill keeps the texture near its true color — matches
        // Blockbench's bright, evenly-lit viewport rather than a
        // high-contrast lit scene.
        mesh.material.emissiveTexture = mesh.material.albedoTexture;
        mesh.material.emissiveColor = new BABYLON.Color3(0.45, 0.45, 0.45);
      }
    });

    return { meshes, skeletons };
  }

  window.CosmeticShared = {
    CATEGORY_FILES,
    resolveAsset,
    fetchJSON,
    normalizeName,
    findByName,
    loadCosmeticModel,
  };
})();
