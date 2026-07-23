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

  // Bone/node name (case-insensitive) that some hats (e.g. the Propeller
  // hat) use for a spinning-prop idle animation. These models don't ship a
  // baked glTF animation clip — the spin only exists in the source
  // Blockbench project as a Bedrock-style Molang animation:
  //   rotation.y = anim_time * 360° / s, looped forever
  // Since that never gets exported into the .glb's `animations` array, we
  // reproduce the same motion procedurally here: any loaded slot model with
  // a node/bone by this name gets spun continuously for as long as it's
  // equipped (see _startPropellerSpin / _stopPropellerSpin).
  const PROPELLER_SPIN_NODE_NAME = "propeller";
  const PROPELLER_SPIN_DEGREES_PER_SECOND = 360;

  // Costume idle "bob" animation — arms gently swinging, applied to every
  // costume while toggled on (see _startBob/_stopBob). Reproduces the
  // source Bedrock rig's "animation.humanoid.bob":
  //   leftarm.rotation.z  = ((cos(life_time * 103.2°) * 2.865°) + 2.865°) * -1
  //   rightarm.rotation.z =  (cos(life_time * 103.2°) * 2.865°) + 2.865°
  // life_time is seconds elapsed since the bob loop (re)started, matching
  // Bedrock's query.life_time. Bone names are case-insensitive lookups
  // against the costume's skeleton, same convention as HELMET_NODE_NAME.
  const BOB_LEFT_ARM_BONE_NAME = "leftarm";
  const BOB_RIGHT_ARM_BONE_NAME = "rightarm";
  const BOB_FREQUENCY_DEGREES_PER_SECOND = 103.2;
  const BOB_AMPLITUDE_DEGREES = 2.865;

  // Node names (case-insensitive) inside a costume's hierarchy that should
  // be hidden whenever a Cape (not a Backbling) is equipped, so shoulder/back
  // armor doesn't clip through the cape geometry.
  const CAPE_HIDDEN_NODE_NAMES = ["leftarmarmor", "rightarmarmor", "bodyarmor"];

  // ------------------------------------------------------------------
  // Per-item procedural bone animations (ITEM_BONE_ANIMATIONS)
  // ------------------------------------------------------------------
  // Some cosmetics (e.g. the Propeller hat's spin, the costume idle bob
  // above) drive their motion from Bedrock-style Molang animation.json
  // files that never get exported into the .glb as a real glTF animation
  // clip — so there's nothing for Babylon's animation system to play back.
  // This table reproduces those source animations directly: for each item
  // slug, a set of named tracks describing how specific bones move over
  // time. It's applied generically via _startItemBoneAnimations, so adding
  // a new animated cosmetic is just a matter of adding an entry here
  // rather than writing bespoke per-item code.
  //
  // Track shapes (all fields optional per bone, mix and match freely):
  //   {
  //     bones: {
  //       "<boneName>": {
  //         loopSeconds: <number>,        // time base each bone's own
  //                                       // clock wraps at (see below)
  //         rotationZDegPerSec: <number>, // continuous linear spin (deg/s),
  //                                       // e.g. the propeller hat
  //         rotationYExpr: (t) => degrees,// continuous Molang-style Y
  //                                       // rotation, for anything more
  //                                       // than a flat linear spin
  //                                       // (e.g. wing flutter)
  //         rotationXExpr: (t) => degrees,// same, but for X rotation
  //         rotationZExpr: (t) => degrees,// same, but for Z rotation
  //         scaleExpr: (t) => number,     // continuous Molang-style scale
  //         scaleXExpr: (t) => number,    // continuous Molang-style scale,
  //                                       // X axis only (non-uniform, e.g.
  //                                       // a "puffing out" chest bone)
  //         positionYExpr: (t) => number, // continuous Molang-style
  //                                       // position offset, Y axis only —
  //                                       // added to the bone's bind-pose Y,
  //                                       // same convention as the rotation
  //                                       // exprs above
  //         positionKeys: [[time, [x,y,z]], ...],  // keyframed position
  //         scaleKeys:    [[time, [x,y,z]], ...],  // keyframed uniform-ish scale
  //       },
  //     },
  //   }
  //
  // `loopSeconds` is each bone's own local timeline length — bones can be
  // staggered (see snowflake-wings' star1..star6, each offset within one
  // shared 6.52s cycle) by giving keyframe times that already include the
  // stagger and using the SAME loopSeconds across the group, so they all
  // wrap together but peak at different points in the cycle.
  //
  // Position/scale keys are looked up by linear interpolation between the
  // two surrounding keyframes (falling back to the nearest edge outside the
  // given range), matching how Bedrock/Blockbench keyframe tracks behave
  // for anything other than explicit easing curves.
  // Shared "generic wings idle" flutter, reused across every winged
  // backbling rather than duplicated per item — matches the source
  // "animation.hive.backbling.generic.wings.idle", which is itself
  // written to apply to any wing rig sharing these bone names:
  //   rightWingLower.rotation.y = ((cos((t + 3.4) * 100°) * 5°)) - 5°
  //   leftWingLower.rotation.y  = -((cos((t + 3.4) * 100°) * 5°)) + 5°
  //   leftWing.rotation.y       = -cos(t * 100°) * 6° + 5°
  //   rightWing.rotation.y      =  cos(t * 100°) * 6° - 5°
  // Not every wing model has all four bones (e.g. Snowflake Wings only has
  // leftWing/rightWing, no *Lower variants) — _startItemBoneAnimations
  // already skips any bone the loaded model doesn't actually have, so
  // spreading this whole object into an item's `bones` is always safe.
  const GENERIC_WING_IDLE_BONES = {
    rightWingLower: {
      loopSeconds: null,
      rotationYExpr: (t) => Math.cos((t + 3.4) * 100 * (Math.PI / 180)) * 5 - 5,
    },
    leftWingLower: {
      loopSeconds: null,
      rotationYExpr: (t) =>
        -(Math.cos((t + 3.4) * 100 * (Math.PI / 180)) * 5) + 5,
    },
    leftWing: {
      loopSeconds: null,
      rotationYExpr: (t) => -Math.cos(t * 100 * (Math.PI / 180)) * 6 + 5,
    },
    rightWing: {
      loopSeconds: null,
      rotationYExpr: (t) => Math.cos(t * 100 * (Math.PI / 180)) * 6 - 5,
    },
  };

  const ITEM_BONE_ANIMATIONS = {
    "snowflake-wings": {
      bones: {
        // Shared wing-flutter idle, reused across winged backblings —
        // see GENERIC_WING_IDLE_BONES above.
        ...GENERIC_WING_IDLE_BONES,

        // Six sparkle "stars" scattered across both wings. Each spins
        // continuously and, once per 6.52s shared cycle, pops in (scale
        // 0 → 1 with an ease-out ramp) then drifts downward while
        // shrinking back to 0 — staggered ~1.16s apart so they twinkle
        // in a rolling sequence rather than all at once. Source:
        // "animation.hive.backbling.snowflake_wings.stars".
        star1: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [0.0, [0, 0, 0]],
            [0.52, [0, -0.08788, 0]],
            [0.88, [0, -0.31031, 0]],
            [1.12, [0, -0.58383, 0]],
            [1.36, [0, -1.00177, 0]],
            [1.56, [0, -1.48553, 0]],
            [1.8, [0, -2.23612, 0]],
            [2.32, [0, -4.30906, 0]],
            [2.48, [0, -5, 0]],
          ],
          scaleKeys: [
            [0.0, [0, 0, 0]],
            [0.04, [0.04123, 0.04123, 0.04123]],
            [0.08, [0.17331, 0.17331, 0.17331]],
            [0.12, [0.34309, 0.34309, 0.34309]],
            [0.16, [0.49173, 0.49173, 0.49173]],
            [0.2, [0.6096, 0.6096, 0.6096]],
            [0.24, [0.70223, 0.70223, 0.70223]],
            [0.28, [0.77548, 0.77548, 0.77548]],
            [0.32, [0.83368, 0.83368, 0.83368]],
            [0.36, [0.8799, 0.8799, 0.8799]],
            [0.4, [0.91637, 0.91637, 0.91637]],
            [0.44, [0.94473, 0.94473, 0.94473]],
            [0.48, [0.96623, 0.96623, 0.96623]],
            [0.52, [0.9818, 0.9818, 0.9818]],
            [0.64, [1, 1, 1]],
            [1.16, [0.83347, 0.83347, 0.83347]],
            [1.68, [0.52477, 0.52477, 0.52477]],
            [2.2, [0.16779, 0.16779, 0.16779]],
            [2.4, [0.03557, 0.03557, 0.03557]],
            [2.44, [0.01359, 0.01359, 0.01359]],
            [2.48, [0, 0, 0]],
          ],
        },
        star2: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [4.04, [0, 0, 0]],
            [4.56, [0, -0.08788, 0]],
            [4.92, [0, -0.31031, 0]],
            [5.16, [0, -0.58383, 0]],
            [5.4, [0, -1.00177, 0]],
            [5.6, [0, -1.48553, 0]],
            [5.84, [0, -2.23612, 0]],
            [6.36, [0, -4.30906, 0]],
            [6.52, [0, -5, 0]],
          ],
          scaleKeys: [
            [4.04, [0, 0, 0]],
            [4.08, [0.04123, 0.04123, 0.04123]],
            [4.12, [0.17331, 0.17331, 0.17331]],
            [4.16, [0.34309, 0.34309, 0.34309]],
            [4.2, [0.49173, 0.49173, 0.49173]],
            [4.24, [0.6096, 0.6096, 0.6096]],
            [4.28, [0.70223, 0.70223, 0.70223]],
            [4.32, [0.77548, 0.77548, 0.77548]],
            [4.36, [0.83368, 0.83368, 0.83368]],
            [4.4, [0.8799, 0.8799, 0.8799]],
            [4.44, [0.91637, 0.91637, 0.91637]],
            [4.48, [0.94473, 0.94473, 0.94473]],
            [4.52, [0.96623, 0.96623, 0.96623]],
            [4.56, [0.9818, 0.9818, 0.9818]],
            [4.68, [1, 1, 1]],
            [5.2, [0.83347, 0.83347, 0.83347]],
            [5.72, [0.52477, 0.52477, 0.52477]],
            [6.24, [0.16779, 0.16779, 0.16779]],
            [6.44, [0.03557, 0.03557, 0.03557]],
            [6.48, [0.01359, 0.01359, 0.01359]],
            [6.52, [0, 0, 0]],
          ],
        },
        star3: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [1.84, [0, 0, 0]],
            [2.36, [0, -0.08788, 0]],
            [2.72, [0, -0.31031, 0]],
            [2.96, [0, -0.58383, 0]],
            [3.2, [0, -1.00177, 0]],
            [3.4, [0, -1.48553, 0]],
            [3.64, [0, -2.23612, 0]],
            [4.16, [0, -4.30906, 0]],
            [4.32, [0, -5, 0]],
          ],
          scaleKeys: [
            [1.84, [0, 0, 0]],
            [1.88, [0.04123, 0.04123, 0.04123]],
            [1.92, [0.17331, 0.17331, 0.17331]],
            [1.96, [0.34309, 0.34309, 0.34309]],
            [2.0, [0.49173, 0.49173, 0.49173]],
            [2.04, [0.6096, 0.6096, 0.6096]],
            [2.08, [0.70223, 0.70223, 0.70223]],
            [2.12, [0.77548, 0.77548, 0.77548]],
            [2.16, [0.83368, 0.83368, 0.83368]],
            [2.2, [0.8799, 0.8799, 0.8799]],
            [2.24, [0.91637, 0.91637, 0.91637]],
            [2.28, [0.94473, 0.94473, 0.94473]],
            [2.32, [0.96623, 0.96623, 0.96623]],
            [2.36, [0.9818, 0.9818, 0.9818]],
            [2.48, [1, 1, 1]],
            [3.0, [0.83347, 0.83347, 0.83347]],
            [3.52, [0.52477, 0.52477, 0.52477]],
            [4.04, [0.16779, 0.16779, 0.16779]],
            [4.24, [0.03557, 0.03557, 0.03557]],
            [4.28, [0.01359, 0.01359, 0.01359]],
            [4.32, [0, 0, 0]],
          ],
        },
        star4: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [2.84, [0, 0, 0]],
            [3.36, [0, -0.08788, 0]],
            [3.72, [0, -0.31031, 0]],
            [3.96, [0, -0.58383, 0]],
            [4.2, [0, -1.00177, 0]],
            [4.4, [0, -1.48553, 0]],
            [4.64, [0, -2.23612, 0]],
            [5.16, [0, -4.30906, 0]],
            [5.32, [0, -5, 0]],
          ],
          scaleKeys: [
            [2.84, [0, 0, 0]],
            [2.88, [0.04123, 0.04123, 0.04123]],
            [2.92, [0.17331, 0.17331, 0.17331]],
            [2.96, [0.34309, 0.34309, 0.34309]],
            [3.0, [0.49173, 0.49173, 0.49173]],
            [3.04, [0.6096, 0.6096, 0.6096]],
            [3.08, [0.70223, 0.70223, 0.70223]],
            [3.12, [0.77548, 0.77548, 0.77548]],
            [3.16, [0.83368, 0.83368, 0.83368]],
            [3.2, [0.8799, 0.8799, 0.8799]],
            [3.24, [0.91637, 0.91637, 0.91637]],
            [3.28, [0.94473, 0.94473, 0.94473]],
            [3.32, [0.96623, 0.96623, 0.96623]],
            [3.36, [0.9818, 0.9818, 0.9818]],
            [3.48, [1, 1, 1]],
            [4.0, [0.83347, 0.83347, 0.83347]],
            [4.52, [0.52477, 0.52477, 0.52477]],
            [5.04, [0.16779, 0.16779, 0.16779]],
            [5.24, [0.03557, 0.03557, 0.03557]],
            [5.28, [0.01359, 0.01359, 0.01359]],
            [5.32, [0, 0, 0]],
          ],
        },
        star5: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [1.16, [0, 0, 0]],
            [1.68, [0, -0.08788, 0]],
            [2.04, [0, -0.31031, 0]],
            [2.28, [0, -0.58383, 0]],
            [2.52, [0, -1.00177, 0]],
            [2.72, [0, -1.48553, 0]],
            [2.96, [0, -2.23612, 0]],
            [3.48, [0, -4.30906, 0]],
            [3.64, [0, -5, 0]],
          ],
          scaleKeys: [
            [1.16, [0, 0, 0]],
            [1.2, [0.04123, 0.04123, 0.04123]],
            [1.24, [0.17331, 0.17331, 0.17331]],
            [1.28, [0.34309, 0.34309, 0.34309]],
            [1.32, [0.49173, 0.49173, 0.49173]],
            [1.36, [0.6096, 0.6096, 0.6096]],
            [1.4, [0.70223, 0.70223, 0.70223]],
            [1.44, [0.77548, 0.77548, 0.77548]],
            [1.48, [0.83368, 0.83368, 0.83368]],
            [1.52, [0.8799, 0.8799, 0.8799]],
            [1.56, [0.91637, 0.91637, 0.91637]],
            [1.6, [0.94473, 0.94473, 0.94473]],
            [1.64, [0.96623, 0.96623, 0.96623]],
            [1.68, [0.9818, 0.9818, 0.9818]],
            [1.8, [1, 1, 1]],
            [2.32, [0.83347, 0.83347, 0.83347]],
            [2.84, [0.52477, 0.52477, 0.52477]],
            [3.36, [0.16779, 0.16779, 0.16779]],
            [3.56, [0.03557, 0.03557, 0.03557]],
            [3.6, [0.01359, 0.01359, 0.01359]],
            [3.64, [0, 0, 0]],
          ],
        },
        star6: {
          loopSeconds: 6.52,
          rotationZDegPerSec: 70,
          positionKeys: [
            [3.08, [0, 0, 0]],
            [3.6, [0, -0.08788, 0]],
            [3.96, [0, -0.31031, 0]],
            [4.2, [0, -0.58383, 0]],
            [4.44, [0, -1.00177, 0]],
            [4.64, [0, -1.48553, 0]],
            [4.88, [0, -2.23612, 0]],
            [5.4, [0, -4.30906, 0]],
            [5.56, [0, -5, 0]],
          ],
          scaleKeys: [
            [3.08, [0, 0, 0]],
            [3.12, [0.04123, 0.04123, 0.04123]],
            [3.16, [0.17331, 0.17331, 0.17331]],
            [3.2, [0.34309, 0.34309, 0.34309]],
            [3.24, [0.49173, 0.49173, 0.49173]],
            [3.28, [0.6096, 0.6096, 0.6096]],
            [3.32, [0.70223, 0.70223, 0.70223]],
            [3.36, [0.77548, 0.77548, 0.77548]],
            [3.4, [0.83368, 0.83368, 0.83368]],
            [3.44, [0.8799, 0.8799, 0.8799]],
            [3.48, [0.91637, 0.91637, 0.91637]],
            [3.52, [0.94473, 0.94473, 0.94473]],
            [3.56, [0.96623, 0.96623, 0.96623]],
            [3.6, [0.9818, 0.9818, 0.9818]],
            [3.72, [1, 1, 1]],
            [4.24, [0.83347, 0.83347, 0.83347]],
            [4.76, [0.52477, 0.52477, 0.52477]],
            [5.28, [0.16779, 0.16779, 0.16779]],
            [5.48, [0.03557, 0.03557, 0.03557]],
            [5.52, [0.01359, 0.01359, 0.01359]],
            [5.56, [0, 0, 0]],
          ],
        },
        // Continuous scale "breathing" pulse on the spine's decorative
        // bit, independent of the star cycle above. Source:
        // "animation.hive.backbling.snowflake_wings.idle_spine".
        spineDecor: {
          loopSeconds: null, // no wrap — Molang expression runs forever
          scaleExpr: (t) =>
            1 + (Math.cos(t * ((100 * Math.PI) / 180)) * 0.03 + 0.1),
        },
      },
    },
    "angel-wings": {
      bones: {
        ...GENERIC_WING_IDLE_BONES,
      },
    },
    "black-ice-wings": {
      bones: {
        ...GENERIC_WING_IDLE_BONES,
      },
    },
    // Bittersweet Wings — combines two source clips that play together:
    // "animation.hive.backbling.bittersweet_wings.idle_flap" (continuous
    // wing rotation + heart scale via Molang expressions, plus a slow Y
    // position bob on heart/rightWing/leftWing) and "...idle_beat" (a
    // short 0.44s looped heart-scale pulse, keyframed). Both clips share
    // the SAME anim_time_update ("0.75 * q.delta_time + q.anim_time"),
    // i.e. Bedrock's anim_time advances at 0.75x real time — every
    // expression/keyframe time below is converted to real seconds
    // accordingly (continuous expressions multiply their input time `t`
    // by 0.75 inline; idle_beat's keyframe times and its 0.44s
    // animation_length are divided by 0.75, giving an effective ~0.587s
    // real-time loop for the heartbeat). Like book-of-souls, the
    // position exprs are in Bedrock's pixel-grid units (16 units = 1
    // block), so they're divided by 16 to land correctly in Babylon's
    // block-scale world units.
    "bittersweet-wings": {
      bones: {
        heart: {
          // idle_beat: quick "thump-thump" scale pulse, looping every
          // 0.44 Bedrock anim_time units (~0.5867s real time).
          loopSeconds: 0.44 / 0.75,
          scaleKeys: [
            [0.0 / 0.75, [1, 1, 1]],
            [0.24 / 0.75, [0.95, 0.95, 0.95]],
            [0.28 / 0.75, [0.92, 0.92, 0.92]],
            [0.32 / 0.75, [0.9, 0.9, 0.9]],
            [0.36 / 0.75, [0.975, 0.975, 0.975]],
            [0.44 / 0.75, [1, 1, 1]],
          ],
          // idle_flap: slow vertical bob, phase-offset from the wings'
          // own +4.1 offset (source uses +6.5 for the heart specifically).
          positionYExpr: (t) =>
            (Math.cos((t * 0.75 + 6.5) * 60 * (Math.PI / 180)) * 0.2) / 16,
        },
        rightWing: {
          rotationYExpr: (t) =>
            -(Math.cos((t * 0.75 + 4.1) * 800 * (Math.PI / 180)) * 20),
          rotationZExpr: (t) => -Math.cos(t * 0.75 * 60 * (Math.PI / 180)) * 5,
          positionYExpr: (t) =>
            (Math.cos(t * 0.75 * 60 * (Math.PI / 180)) * 1 + 1) / 16,
        },
        leftWing: {
          rotationYExpr: (t) =>
            Math.cos((t * 0.75 + 4.1) * 800 * (Math.PI / 180)) * 20,
          rotationZExpr: (t) => Math.cos(t * 0.75 * 60 * (Math.PI / 180)) * 5,
          positionYExpr: (t) =>
            (Math.cos(t * 0.75 * 60 * (Math.PI / 180)) * 1 + 1) / 16,
        },
        mid: {
          scaleXExpr: (t) =>
            1 + (Math.cos(t * 0.75 * 60 * (Math.PI / 180)) * 0.1 + 0.1),
        },
      },
    },
    // Cape idle sway — "animation.cape.idle". Unlike everything else in
    // this table (keyed per-item slug), every cape shares one model
    // (cape.glb) and only swaps texture, so this is keyed by category
    // instead and applies to whichever cape is currently equipped. No
    // custom anim_time_update in the source, so `t` is used directly
    // (1:1 with real time). The rotation is a constant -5° rest tilt
    // plus a small continuous back-and-forth sway on top.
    "category:cape": {
      bones: {
        cape: {
          rotationXExpr: (t) =>
            -5 + Math.cos((t + 2) * 120 * (Math.PI / 180)) * 1,
        },
      },
    },
    // No custom anim_time_update in the source, so Bedrock's anim_time
    // runs 1:1 with real time (unlike bittersweet-wings above) — `t` is
    // used directly with no speed-factor scaling. Every bone here just
    // rocks back and forth on X rotation (the book, hand, fingers, and
    // both tails), each with its own phase offset and amplitude so the
    // motion ripples rather than moving in lockstep; the book and hand
    // also drift very slightly on Y position, and the hand is scaled
    // down to 0.8 (a static, non-animated scale straight from the
    // source, not a Molang expression). Unlike rotation (unit-agnostic
    // degrees), the source's position values are in Bedrock's native
    // pixel-grid units (16 units = 1 block), so they're divided by 16
    // here to land correctly in Babylon's block-scale world units —
    // without this the book/hand drift looks ~16x too large.
    "book-of-souls": {
      bones: {
        soulBook: {
          rotationXExpr: (t) =>
            Math.cos((t + 3.4) * 120 * (Math.PI / 180)) * 0.7,
          positionYExpr: (t) =>
            (Math.cos((t + 4.1) * 120 * (Math.PI / 180)) * 0.2) / 16,
        },
        souldHand: {
          rotationXExpr: (t) =>
            Math.cos((t + 2.7) * 120 * (Math.PI / 180)) * 1.3,
          positionYExpr: (t) =>
            (Math.cos((t + 4.1) * 120 * (Math.PI / 180)) * 0.1) / 16,
          scaleExpr: () => 0.8,
        },
        thumb: {
          rotationXExpr: (t) =>
            -(Math.cos((t + 2) * 120 * (Math.PI / 180)) * 2),
        },
        finger1: {
          rotationXExpr: (t) => Math.cos((t + 2) * 120 * (Math.PI / 180)) * 2,
        },
        finger2: {
          rotationXExpr: (t) => Math.cos((t + 2) * 120 * (Math.PI / 180)) * 1.5,
        },
        finger3: {
          rotationXExpr: (t) => Math.cos((t + 1.9) * 120 * (Math.PI / 180)) * 2,
        },
        tailRight: {
          rotationXExpr: (t) => Math.cos((t + 2.1) * 120 * (Math.PI / 180)) * 2,
        },
        tailRight2: {
          rotationXExpr: (t) => Math.cos((t + 1.6) * 120 * (Math.PI / 180)) * 3,
        },
        tailLeft: {
          rotationXExpr: (t) => Math.cos((t + 2.4) * 120 * (Math.PI / 180)) * 2,
        },
        tailLeft2: {
          rotationXExpr: (t) => Math.cos((t + 2) * 120 * (Math.PI / 180)) * 3,
        },
      },
    },
    // Backroom Buddy — "animation.hive.backbling.backroom_buddy.idle":
    // balloon strings/balloons gently sway via Molang cosine expressions,
    // no animation_length — runs forever, no wrap. Balloon exprs are
    // swapped left/right vs. the source's bone naming, since the model's
    // leftballoon/rightballoon bones are mirrored from what the source
    // clip assumes.
    "backroom-buddy": {
      bones: {
        leftstring: {
          rotationXExpr: (t) =>
            -(Math.cos((t + 4.9) * 40 * (Math.PI / 180)) * 3.5),
          rotationZExpr: (t) =>
            Math.cos((t + 4.1) * 85 * (Math.PI / 180)) * 3.5,
        },
        leftballoon: {
          rotationXExpr: (t) =>
            -(Math.cos((t + 5.3) * 40 * (Math.PI / 180)) * 2.5),
          rotationYExpr: (t) => -(Math.cos((t + 4) * 68 * (Math.PI / 180)) * 4),
          rotationZExpr: (t) =>
            Math.cos((t + 3.2) * 85 * (Math.PI / 180)) * 6 + 5,
        },
        rightstring: {
          rotationXExpr: (t) =>
            -(Math.cos((t + 4.3) * 40 * (Math.PI / 180)) * 3.5),
          rotationZExpr: (t) =>
            -(Math.cos((t + 2.9) * 85 * (Math.PI / 180)) * 2.5),
        },
        rightballoon: {
          rotationXExpr: (t) =>
            -(Math.cos((t + 5.3) * 40 * (Math.PI / 180)) * 1.5),
          rotationYExpr: (t) => -(Math.cos((t + 4) * 65 * (Math.PI / 180)) * 4),
          rotationZExpr: (t) =>
            -(Math.cos((t + 3.8) * 85 * (Math.PI / 180)) * 6) - 15,
        },
      },
    },
  };

  // ------------------------------------------------------------------
  // Per-item idle particle effects (ITEM_PARTICLE_EFFECTS)
  // ------------------------------------------------------------------
  // Some cosmetics ship a Bedrock particle_effect JSON (an emitter that
  // spawns/animates little sprites) alongside their model — e.g. the
  // Starfire Crown's flame wisps. Bedrock's particle format can't run
  // directly in a browser, so each entry here is a hand-translated
  // Babylon.js ParticleSystem that reproduces the *look* of the source
  // effect (spawn rate, sphere emitter around the head, flipbook
  // texture, color-over-life gradient, upward drift + drag), keyed by
  // item slug. Applied generically via _startItemParticleEffect, mirroring
  // _startItemBoneAnimations/_startPropellerSpin above — the emitter is
  // started when the item is loaded into its slot and stopped/disposed
  // the moment that slot is cleared or swapped to something else.
  //
  // Entry shape:
  //   {
  //     textureUrl: "path/relative/to/data-root.png",
  //     spriteWidth / spriteHeight: sprite sheet frame size in px,
  //     frameCount: number of flipbook frames, played once per particle
  //                 lifetime (matches Bedrock's stretch_to_lifetime),
  //     startCellY: pixel row in the sprite sheet where frame 0 begins
  //                 (default 0) — lets a flipbook start partway down a
  //                 shared sheet instead of always at the very top.
  //     capacity: max simultaneous particles,
  //     emitRate: particles spawned per second,
  //     minLifeTime / maxLifeTime: seconds,
  //     minSize / maxSize: world-space sprite size,
  //     direction: [x,y,z] world-space drift applied as gravity (matches
  //                the source's upward drift + drag),
  //     dragFactor: exponential velocity damping per second (source uses
  //                 a flat linear_drag_coefficient; this is close enough
  //                 for the visual read at preview scale),
  //     colorGradient: [[stop 0-1, "#RRGGBBAA"], ...] — sampled the same
  //                    way as the source's color-over-life gradient,
  //     emitBox: [x, y, z] half-extents of the emission volume, centered
  //              on the emitter's local origin (approximates the source's
  //              small offset sphere without needing the full per-frame
  //              head-rotation Molang math — the crown itself already
  //              tracks head rotation since it's parented to the head).
  //     emitterBone: name of a bone/node (case-insensitive) within the
  //                  slot's loaded skeleton/nodes to parent the emitter
  //                  to, e.g. "head" for a Bedrock locator defined on
  //                  the head bone rather than the item's own bone.
  //                  Falls back to the slot's own parentless root node
  //                  if omitted.
  //     emitterOffset: [x, y, z] local offset from emitterBone (or the
  //                    slot root, if no emitterBone) to the emission
  //                    point, in the model's own local space units —
  //                    e.g. a Bedrock locator's [x,y,z] divided by 16.
  //   }
  const ITEM_PARTICLE_EFFECTS = {
    "starfire-crown": {
      textureUrl: "store/particles/starfire_crown_flame.png",
      spriteWidth: 16,
      spriteHeight: 16,
      frameCount: 14,
      // Flipbook playback starts at pixel row 32 of the sheet (frame
      // index 2 at 16px/frame) rather than row 0 — matches the source
      // JSON's base_UV being offset from the top of the strip.
      startCellY: 32,
      capacity: 60,
      emitRate: 10,
      minLifeTime: 1.4,
      maxLifeTime: 1.75,
      minSize: 0.25,
      maxSize: 0.35,
      direction: [0, 1, 0],
      dragFactor: 4,
      colorGradient: [
        [0.17, "#FFF0E2FF"],
        [0.69, "#B02D2939"],
        [1.0, "#66000000"],
      ],
      emitBox: [0.05, 0.05, 0.05],
      // The source geometry (starfire_crown.json) defines this effect's
      // spawn point as a named locator on the "head" bone, NOT on the
      // crown mesh's own bone: "head": { "pivot": [0,24,0], "locators":
      // { "locator": [0, 32, 0] } }. Locator/cube coordinates inside a
      // bone are given in the SAME absolute model-space frame as that
      // bone's own pivot (not a further offset from it) — confirmed by
      // the crown bone itself (pivot Y=30) showing up in the exported
      // glb as a mere +0.375 (=6 Bedrock units = 30-24) translation
      // relative to its head parent. So the locator's offset relative
      // to the head bone's own local origin is 32-24 = 8 Bedrock units
      // = 0.5 in the glTF's model-space units — that's what
      // emitterOffset needs to be, applied relative to the head bone
      // (see emitterBone below), not the crown mesh.
      emitterBone: "locator",
      emitterOffset: [0, 0.5, 0],
    },
  };

  // Tuning for the "reset view" stage button (see _resetView). Beta is
  // Babylon's polar angle from the top pole, so a positive offset tilts
  // the camera to look down at the model a bit more than the camera's
  // plain page-load default. The zoom multiplier is applied to the
  // normal auto-fit radius — < 1 zooms in tighter.
  const CAMERA_RESET_BETA_OFFSET = 0.12;
  const CAMERA_RESET_ZOOM_MULTIPLIER = 0.65;

  // Capes all share ONE globally-used mesh (same approach as player.html /
  // server.js): rather than each cape shipping its own .glb, every cape
  // loads this single model and gets its own look via a per-cape PNG
  // texture applied on top. Backblings are unaffected and keep loading
  // their own unique per-item .glb via item.model as before.
  const SHARED_CAPE_MODEL_URL = "store/cape.glb";

  // Fallback costume shown in the Costume slot whenever nothing is
  // actually equipped there (first load with no costumes available, or
  // the user explicitly unequips their costume) — same folder as
  // cape.glb. Keeps the stage from ever showing a completely empty
  // costume slot; equipped.costume itself stays null in this state (see
  // _loadFallbackCostume), so hat/cape bone-hiding logic and the equipped
  // panel still correctly show "Empty" / no costume equipped.
  const FALLBACK_COSTUME_MODEL_URL = "store/soon.glb";

  // Derive a cape item's texture URL, mirroring player.html's
  // getCapeTextureUrl(): "/models/{name}.png". Prefers an explicit
  // item.texture field if the data provides one.
  function getCapeTextureUrl(item) {
    if (item.texture) return item.texture;
    const name = item.slug || item.name;
    return name ? `/models/${encodeURIComponent(name)}.png` : null;
  }

  // ------------------------------------------------------------------
  // Per-item texture variants (ITEM_TEXTURE_VARIANTS)
  // ------------------------------------------------------------------
  // Some hats/backblings ship as ONE glb whose look is retextured per
  // variant (e.g. Cuddle Bear: blue / brown / pink), the same underlying
  // technique as capes (see SHARED_CAPE_MODEL_URL/_applyCapeTexture) —
  // just applied to an item's own unique model instead of one shared
  // mesh. Rather than the person picking a color, each *equip* advances
  // to the next variant in this list, wrapping back to the start —
  // tracked per-slug in _variantCycleIndex (see _nextItemVariant).
  //
  // Texture URL convention: "/backblings/{slug}-{variant}.png" (e.g.
  // "/backblings/cuddle-bear-blue.png") — same folder each item's own
  // .glb already lives in (see hats.json/backblings.json `model` paths).
  // An item can override this by giving each variant an explicit path
  // instead of a bare name — see getItemVariantTextureUrl below.
  const ITEM_TEXTURE_VARIANTS = {
    "cuddle-bear": ["blue", "brown", "pink"],
    "angel-wings": ["black", "pink", "white"],
    "axolotl-plush": ["endolotl", "pink", "sunflower"],
  };

  // Resolves the texture URL for one variant of an item. `variant` may
  // be a bare name ("blue") or, if an item ever needs a fully custom path
  // per variant, an object like { name: "blue", texture: "some/other/path.png" }.
  function getItemVariantTextureUrl(item, variant) {
    if (variant && typeof variant === "object") {
      if (variant.texture) return variant.texture;
      variant = variant.name;
    }
    const slug = item.slug || item.name;
    return slug
      ? `/backblings/${encodeURIComponent(slug)}-${encodeURIComponent(variant)}.png`
      : null;
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
      // User-toggleable idle "bob" animation (arms swinging), applied to
      // every costume — see _startBob/_stopBob. On by default to match
      // the source Bedrock rig's always-on humanoid.bob animation.
      this.bobbingEnabled = true;

      this.engine = null;
      this.scene = null;
      this.camera = null;
      this.loadedNodes = { costume: [], hat: [], cape_backbling: [] };
      this.loadedSkeletons = { costume: [], hat: [], cape_backbling: [] };
      // scene.onBeforeRenderObservable handle for each slot's idle-spin
      // loop (see _startPropellerSpin), or null if that slot has no
      // spinning part currently equipped. Tracked per-slot so equipping a
      // new hat/costume/cape cleanly stops any previous slot's spin
      // without touching a spin running in a different slot.
      this._propellerSpinObservers = {
        costume: null,
        hat: null,
        cape_backbling: null,
      };
      // scene.onBeforeRenderObservable handle for the costume's idle "bob"
      // (arm-swing) animation — see _startBob/_stopBob. null whenever
      // bobbing is off or no costume with left/rightarm bones is loaded.
      this._bobObserver = null;
      // Elapsed seconds fed into the bob formula, accumulated via engine
      // delta time (mirrors query.life_time from the source Bedrock
      // animation) rather than wall-clock Date.now(), so it stays in sync
      // with the scene's own render clock and pauses/resumes cleanly.
      this._bobLifeTime = 0;
      // Original (un-bobbed) local rotation for each arm bone, keyed by
      // bone name, so bobbing can be turned off mid-animation and the
      // arms snap cleanly back to their bind pose instead of freezing
      // wherever the bob motion last left them.
      this._bobOriginalRotations = null;
      // Original (unscaled) bone scaling cache, keyed by bone name, restored
      // when the corresponding hide condition (hat/cape) no longer applies.
      this._boneOriginalScales = null;

      // scene.onBeforeRenderObservable handle for each slot's generic
      // ITEM_BONE_ANIMATIONS playback (see _startItemBoneAnimations /
      // _stopItemBoneAnimations), or null if the currently equipped item
      // in that slot has no entry in the table.
      this._itemBoneAnimObservers = {
        costume: null,
        hat: null,
        cape_backbling: null,
      };

      // Babylon ParticleSystem instance currently playing for each slot
      // (see _startItemParticleEffect / _stopItemParticleEffect), or null
      // if the currently equipped item in that slot has no entry in
      // ITEM_PARTICLE_EFFECTS. Tracked per-slot for the same reason as
      // _propellerSpinObservers/_itemBoneAnimObservers — so clearing one
      // slot's effect never touches a different slot's.
      this._itemParticleSystems = {
        costume: null,
        hat: null,
        cape_backbling: null,
      };

      // Tracks which texture variant to apply NEXT for each item slug
      // that has an ITEM_TEXTURE_VARIANTS entry — e.g. Cuddle Bear cycles
      // blue → brown → pink → blue... on every equip (not a color the
      // person picks). Keyed by slug rather than per-slot, since the same
      // item could in principle be equipped again later after other
      // items and should resume the cycle where it left off for the
      // session. See _nextItemVariant / _applyItemVariantTexture.
      this._variantCycleIndex = {};

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
              <div class="locker__stage-controls">
                <button type="button" class="locker__stage-btn" data-role="toggle-bob" title="Toggle idle bobbing">
                  <svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M5 12H3M21 12h-2M7.5 7.5 6 6M18 18l-1.5-1.5M7.5 16.5 6 18M18 6l-1.5 1.5"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button type="button" class="locker__stage-btn" data-role="reset-view" title="Reset view">
                  <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
                </button>
                <button type="button" class="locker__stage-btn" data-role="screenshot" title="Save screenshot (transparent PNG)">
                  <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </button>
              </div>
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
        resetView: this.rootEl.querySelector('[data-role="reset-view"]'),
        screenshot: this.rootEl.querySelector('[data-role="screenshot"]'),
        toggleBob: this.rootEl.querySelector('[data-role="toggle-bob"]'),
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

      this.$.resetView.addEventListener("click", () => this._resetView());
      this.$.screenshot.addEventListener("click", () => this._takeScreenshot());
      this.$.toggleBob.addEventListener("click", () => this._toggleBobbing());
      this._updateBobButtonState();

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
        } else {
          // No costumes in the catalog at all — still show something
          // rather than an empty stage.
          this._loadFallbackCostume();
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
          const thumb =
            item.category === "costume" && item.page
              ? `${item.page.replace(/\/?$/, "/")}avatar.png`
              : item.thumbnail;
          return `<button type="button" class="locker__item-thumb${isEquipped ? " is-equipped" : ""}"
            data-slug="${esc(item.slug)}" data-category="${esc(item.category)}" title="${esc(item.name)}">
            <img src="${esc(resolveAsset(this.dataRoot, thumb))}" alt="${esc(item.name)}" loading="lazy">
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
      // Costume slot never shows fully empty — load the placeholder
      // model in its place. equipped.costume itself correctly stays
      // null, so the equipped panel still shows "Empty" and this doesn't
      // count as a real costume for hat/cape bone-hiding or the share URL.
      if (slot === "costume") this._loadFallbackCostume();

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
    //
    // A slug is only guaranteed unique WITHIN its own category's data
    // file(s), not globally — e.g. "rubber-ducky" is both a quest costume
    // and an unrelated backbling. A naive allItems.find(slug) always
    // returns whichever one happens to appear first once every category
    // is flattened together, regardless of which one the link actually
    // meant, silently equipping the wrong item into the wrong slot.
    //
    // Since a single URL can only ever carry one item per equip slot
    // anyway (costume / hat / cape_backbling), we resolve ambiguous slugs
    // by process of elimination against the OTHER tokens in the same URL
    // — in two passes so the result doesn't depend on token order:
    //   1. Every unambiguous token (slug used by exactly one item across
    //      all categories) is resolved first and claims its slot.
    //   2. Each ambiguous token then picks whichever of its candidates'
    //      slots isn't already claimed — by an unambiguous token OR by
    //      an ambiguous token resolved earlier in this same pass.
    // A lone ambiguous slug with no other tokens to eliminate against
    // still falls back to its first candidate, same as previous behavior.
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

      // Group every item (across all categories) by slug once, so each
      // token can see every same-slug candidate rather than just the
      // first one Array.find would have stopped at.
      const bySlug = new Map();
      this.allItems.forEach((item) => {
        if (!bySlug.has(item.slug)) bySlug.set(item.slug, []);
        bySlug.get(item.slug).push(item);
      });

      const resolved = tokens.map((slug) => ({
        slug,
        candidates: bySlug.get(slug) || [],
      }));

      const claimedSlots = new Set();

      // Pass 1: unambiguous tokens claim their slot first, independent of
      // where they appear in the URL.
      resolved.forEach((entry) => {
        if (entry.candidates.length === 1) {
          claimedSlots.add(CATEGORY_SLOT[entry.candidates[0].category]);
        }
      });

      // Pass 2: resolve every token against the now-complete claimed set.
      const matched = [];
      resolved.forEach((entry) => {
        if (!entry.candidates.length) return; // unknown slug

        const item =
          entry.candidates.length === 1
            ? entry.candidates[0]
            : entry.candidates.find(
                (candidate) =>
                  !claimedSlots.has(CATEGORY_SLOT[candidate.category]),
              ) || entry.candidates[0];

        matched.push(item);
        claimedSlots.add(CATEGORY_SLOT[item.category]);
      });
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
        const nameHtml = item.page
          ? `<a class="locker__slot-name" href="${esc(resolveAsset(this.dataRoot, item.page))}">${esc(item.name)}</a>`
          : `<div class="locker__slot-name">${esc(item.name)}</div>`;
        target.innerHTML = `
          <div class="locker__slot-thumb">
            <img src="${esc(resolveAsset(this.dataRoot, equippedImg))}" alt="${esc(item.name)}">
          </div>
          <div class="locker__slot-info">
            ${nameHtml}
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
      // antialias: false — MSAA smooths triangle edges, which blends
      // adjacent texel colors right at the model's silhouette and any
      // hard internal edges (the diamond gem, spikes, etc.). Pixel-art
      // models should render with hard, aliased edges, not smoothed
      // ones, to avoid that fringing.
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
      // Remembered so _refitCamera can restore the original orbit angle
      // on "reset view", not just re-center/re-zoom on whatever angle
      // the user last dragged to.
      this._defaultCameraAlpha = camera.alpha;
      this._defaultCameraBeta = camera.beta;

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

      // Blockbench-style lighting: a bright, even hemispheric fill plus a
      // "sun" directional light from up/front. Intensities are balanced
      // so no side of the model goes dark and there's no dramatic
      // falloff — this deliberately isn't a moody/dramatic lighting rig,
      // it's meant to read the texture as close to "true color" as
      // possible while still giving faces some shape.
      const light = new BABYLON.HemisphericLight(
        "lockerLight",
        new BABYLON.Vector3(0, 1, 0),
        scene,
      );
      light.intensity = 0.75;
      light.groundColor = new BABYLON.Color3(0.6, 0.6, 0.65);

      const sun = new BABYLON.DirectionalLight(
        "lockerSun",
        new BABYLON.Vector3(-0.4, -1, 0.6),
        scene,
      );
      sun.intensity = 0.9;
      sun.specular = new BABYLON.Color3(0, 0, 0);
      this.sun = sun;

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

    // Looks up a named bone's linked TransformNode on the costume's
    // skeleton (case-insensitive) — same lookup pattern as
    // _getCostumeBoneTransformNode, kept as its own small helper here since
    // bobbing needs both arm bones together and returns them as a lookup
    // table rather than one at a time.
    _getCostumeArmBoneNodes() {
      return {
        [BOB_LEFT_ARM_BONE_NAME]: this._getCostumeBoneTransformNode(
          BOB_LEFT_ARM_BONE_NAME,
        ),
        [BOB_RIGHT_ARM_BONE_NAME]: this._getCostumeBoneTransformNode(
          BOB_RIGHT_ARM_BONE_NAME,
        ),
      };
    }

    // Starts (or restarts) the costume's idle "bob" animation — gently
    // swinging left/rightarm bones on the Z axis. Reproduces the source
    // Bedrock rig's always-on "animation.humanoid.bob" (see the constants
    // above) since, like the propeller spin, it was never exported into
    // any costume .glb as a real glTF animation clip. No-ops quietly if
    // bobbing is toggled off, no costume is loaded, or the loaded costume
    // has no left/rightarm bones.
    _startBob() {
      this._stopBob();
      if (!this.bobbingEnabled || !this.scene) return;

      const armNodes = this._getCostumeArmBoneNodes();
      const leftArm = armNodes[BOB_LEFT_ARM_BONE_NAME];
      const rightArm = armNodes[BOB_RIGHT_ARM_BONE_NAME];
      if (!leftArm && !rightArm) return;

      if (!this._bobOriginalRotations) this._bobOriginalRotations = {};
      [
        [BOB_LEFT_ARM_BONE_NAME, leftArm],
        [BOB_RIGHT_ARM_BONE_NAME, rightArm],
      ].forEach(([name, node]) => {
        if (!node) return;
        // Bobbing only ever touches rotation.z, so Euler rotation (not a
        // quaternion) needs to be what's driving orientation, same
        // reasoning as the propeller spin's rotationQuaternion reset.
        node.rotationQuaternion = null;
        if (!(name in this._bobOriginalRotations)) {
          this._bobOriginalRotations[name] = node.rotation.z;
        }
      });

      const frequencyRadiansPerSecond =
        (BOB_FREQUENCY_DEGREES_PER_SECOND * Math.PI) / 180;
      const amplitudeRadians = (BOB_AMPLITUDE_DEGREES * Math.PI) / 180;

      this._bobLifeTime = 0;
      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
        this._bobLifeTime += deltaSeconds;

        const wave =
          Math.cos(this._bobLifeTime * frequencyRadiansPerSecond) *
            amplitudeRadians +
          amplitudeRadians;

        if (leftArm) leftArm.rotation.z = -wave;
        if (rightArm) rightArm.rotation.z = wave;
      });

      this._bobObserver = observer;
    }

    // Stops the idle-bob observer (if running) and snaps both arm bones
    // back to their original bind-pose rotation, so turning bobbing off
    // (or clearing/swapping the costume) never leaves an arm frozen
    // mid-swing.
    _stopBob() {
      if (this._bobObserver && this.scene) {
        this.scene.onBeforeRenderObservable.remove(this._bobObserver);
      }
      this._bobObserver = null;

      if (this._bobOriginalRotations) {
        const armNodes = this._getCostumeArmBoneNodes();
        Object.entries(this._bobOriginalRotations).forEach(
          ([name, originalZ]) => {
            const node = armNodes[name];
            if (node) node.rotation.z = originalZ;
          },
        );
      }
      this._bobOriginalRotations = null;
    }

    // Click handler for the stage's "toggle bobbing" button.
    _toggleBobbing() {
      this.bobbingEnabled = !this.bobbingEnabled;
      this._updateBobButtonState();
      if (this.bobbingEnabled) {
        this._startBob();
      } else {
        this._stopBob();
      }
    }

    // Reflects this.bobbingEnabled onto the toggle button's pressed/active
    // visual state (see .locker__stage-btn.is-active in the CSS) and its
    // accessible pressed-state + tooltip text.
    _updateBobButtonState() {
      if (!this.$.toggleBob) return;
      this.$.toggleBob.classList.toggle("is-active", this.bobbingEnabled);
      this.$.toggleBob.setAttribute(
        "aria-pressed",
        this.bobbingEnabled ? "true" : "false",
      );
      this.$.toggleBob.title = this.bobbingEnabled
        ? "Turn off idle bobbing"
        : "Turn on idle bobbing";
    }

    // Finds a node named PROPELLER_SPIN_NODE_NAME (case-insensitive) among
    // a slot's loaded nodes and/or skeleton bones, preferring an actual
    // TransformNode over a bare Bone since Babylon rotates a TransformNode
    // directly, while a Bone needs its linked TransformNode for that.
    _findPropellerSpinNode(slot) {
      const nodes = this.loadedNodes[slot] || [];
      const direct = nodes.find(
        (n) => n.name && n.name.toLowerCase() === PROPELLER_SPIN_NODE_NAME,
      );
      if (direct) return direct;

      const skeletons = this.loadedSkeletons[slot] || [];
      for (const skeleton of skeletons) {
        const bone = skeleton.bones.find(
          (b) => b.name && b.name.toLowerCase() === PROPELLER_SPIN_NODE_NAME,
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

    // Starts (or restarts) the idle spin for whatever's currently loaded in
    // `slot`, if it has a "propeller" node/bone. Reproduces the hat's
    // source Molang animation (continuous 360°/s Y-axis spin, looped
    // forever) since that never made it into the .glb as a real glTF
    // animation clip — see PROPELLER_SPIN_NODE_NAME above. Safe to call
    // even when nothing matches; it's then just a no-op.
    _startPropellerSpin(slot) {
      this._stopPropellerSpin(slot);
      if (!this.scene) return;

      const node = this._findPropellerSpinNode(slot);
      if (!node) return;

      // Ensure rotation.y (Euler) is actually what drives orientation —
      // _loadSlotModel clears rotationQuaternion on root nodes for the
      // 180° face-camera flip, but a nested bone's transform node might
      // still have one set by the glTF importer.
      node.rotationQuaternion = null;

      const radiansPerSecond =
        (PROPELLER_SPIN_DEGREES_PER_SECOND * Math.PI) / 180;

      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
        node.rotation.y += radiansPerSecond * deltaSeconds;
      });

      this._propellerSpinObservers[slot] = observer;
    }

    // Stops and detaches the idle-spin observer for `slot`, if one is
    // running. Called before re-loading a slot's model (so a stale
    // observer never spins a disposed/replaced node) and whenever the slot
    // is cleared/unequipped.
    _stopPropellerSpin(slot) {
      const observer = this._propellerSpinObservers[slot];
      if (observer && this.scene) {
        this.scene.onBeforeRenderObservable.remove(observer);
      }
      this._propellerSpinObservers[slot] = null;
    }

    // Finds a node/bone named `boneName` (case-insensitive) among a slot's
    // own loaded nodes and skeletons — same lookup pattern as
    // _findPropellerSpinNode, generalized to take an arbitrary name so
    // _startItemBoneAnimations can look up any bone the animation table
    // references (star1..star6, spineDecor, etc), not just "propeller".
    _findSlotBoneNode(slot, boneName) {
      const target = boneName.toLowerCase();

      // Special case: the shared cape's "cape" track targets the sway
      // hinge (_sharedCapeHinge), not the cape mesh itself. The mesh's
      // own local origin sits below its geometry (see
      // _fetchSharedCapeModel), so rotating it directly swings the cape
      // around the wrong point; the hinge is a TransformNode placed at
      // the mesh's authored top edge instead, with the mesh re-parented
      // underneath it.
      if (
        slot === "cape_backbling" &&
        target === "cape" &&
        this._sharedCapeHinge
      ) {
        return this._sharedCapeHinge;
      }

      const nodes = this.loadedNodes[slot] || [];
      const direct = nodes.find(
        (n) => n.name && n.name.toLowerCase() === target,
      );
      if (direct) return direct;

      const skeletons = this.loadedSkeletons[slot] || [];
      for (const skeleton of skeletons) {
        const bone = skeleton.bones.find(
          (b) => b.name && b.name.toLowerCase() === target,
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

    // Linear interpolation across a sorted [time, [x,y,z]] keyframe list —
    // matches Bedrock/Blockbench's default (non-eased) keyframe behavior.
    // `t` is expected to already be wrapped into the track's own local
    // loop range by the caller. Times outside the given range clamp to
    // the nearest edge keyframe rather than extrapolating.
    _sampleVectorKeyframes(keys, t) {
      if (!keys || !keys.length) return null;
      if (t <= keys[0][0]) return keys[0][1];
      if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];

      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, v0] = keys[i];
        const [t1, v1] = keys[i + 1];
        if (t < t0 || t > t1) continue;
        const span = t1 - t0;
        const ratio = span > 0 ? (t - t0) / span : 0;
        return [
          v0[0] + (v1[0] - v0[0]) * ratio,
          v0[1] + (v1[1] - v0[1]) * ratio,
          v0[2] + (v1[2] - v0[2]) * ratio,
        ];
      }
      return keys[keys.length - 1][1];
    }

    // Starts (or restarts) every procedural bone-animation track defined
    // for `item` in ITEM_BONE_ANIMATIONS, applying them to whatever's
    // currently loaded in `slot`. These reproduce source Bedrock/Molang
    // animation.json files that never made it into the .glb as real glTF
    // animation clips (see the table's own comment above) — same
    // rationale as _startPropellerSpin/_startBob, just generalized to
    // arbitrary keyframed + continuous-expression tracks instead of one
    // hardcoded motion. Bones the table lists but the model doesn't
    // actually have are skipped silently (e.g. snowflake-wings' table has
    // no star7/star8 since this model only has six stars).
    _startItemBoneAnimations(slot, item) {
      this._stopItemBoneAnimations(slot);
      if (!this.scene || !item) return;

      const config =
        ITEM_BONE_ANIMATIONS[item.slug] ||
        ITEM_BONE_ANIMATIONS[`category:${item.category}`];
      if (!config || !config.bones) return;

      const boneEntries = Object.entries(config.bones)
        .map(([boneName, track]) => {
          const node = this._findSlotBoneNode(slot, boneName);
          if (!node) return null;
          // Continuous expression tracks (rotationZDegPerSec/rotationYExpr/
          // scaleExpr) rotate/scale relative to the bone's own bind pose,
          // so it needs to be captured before any track starts mutating
          // it — mirrors _startBob's original-rotation cache.
          node.rotationQuaternion = null;
          return {
            node,
            track,
            originalRotationX: node.rotation.x,
            originalRotationY: node.rotation.y,
            originalRotationZ: node.rotation.z,
            originalScale: node.scaling.clone(),
            originalPosition: node.position.clone(),
          };
        })
        .filter(Boolean);

      if (!boneEntries.length) return;

      let elapsed = 0;
      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
        elapsed += deltaSeconds;

        boneEntries.forEach(({ node, track, originalPosition }) => {
          // Each bone's own timeline wraps independently at its
          // loopSeconds — this is what lets, e.g., snowflake-wings'
          // six stars share one 6.52s cycle but peak at staggered
          // offsets purely via where their keyframes fall in that
          // shared range. A null/undefined loopSeconds means "run
          // forever, no wrap" (used by continuous Molang expressions
          // like spineDecor's scale pulse).
          const t =
            track.loopSeconds != null ? elapsed % track.loopSeconds : elapsed;

          if (track.rotationZDegPerSec != null) {
            node.rotation.z =
              (elapsed * track.rotationZDegPerSec * Math.PI) / 180;
          }
          if (track.rotationYExpr) {
            node.rotation.y = (track.rotationYExpr(elapsed) * Math.PI) / 180;
          }
          if (track.rotationXExpr) {
            node.rotation.x = (track.rotationXExpr(elapsed) * Math.PI) / 180;
          }
          if (track.rotationZExpr) {
            node.rotation.z = (track.rotationZExpr(elapsed) * Math.PI) / 180;
          }
          if (track.positionYExpr) {
            node.position.y = originalPosition.y + track.positionYExpr(elapsed);
          }
          if (track.positionKeys) {
            const pos = this._sampleVectorKeyframes(track.positionKeys, t);
            if (pos) node.position.set(pos[0], pos[1], pos[2]);
          }
          if (track.scaleKeys) {
            const scale = this._sampleVectorKeyframes(track.scaleKeys, t);
            if (scale) node.scaling.set(scale[0], scale[1], scale[2]);
          }
          if (track.scaleExpr) {
            const s = track.scaleExpr(elapsed);
            node.scaling.set(s, s, s);
          }
          if (track.scaleXExpr) {
            node.scaling.x = track.scaleXExpr(elapsed);
          }
        });
      });

      this._itemBoneAnimObservers[slot] = { observer, boneEntries };
    }

    // Stops the running ITEM_BONE_ANIMATIONS playback for `slot` (if any)
    // and restores every affected bone's original rotation/scale, so
    // unequipping or swapping items never leaves a star frozen mid-pop or
    // a bone stuck at some mid-cycle scale.
    _stopItemBoneAnimations(slot) {
      const entry = this._itemBoneAnimObservers[slot];
      if (entry && this.scene) {
        this.scene.onBeforeRenderObservable.remove(entry.observer);
        entry.boneEntries.forEach(
          ({
            node,
            originalRotationX,
            originalRotationY,
            originalRotationZ,
            originalScale,
            originalPosition,
          }) => {
            try {
              node.rotation.x = originalRotationX;
              node.rotation.y = originalRotationY;
              node.rotation.z = originalRotationZ;
              node.scaling.copyFrom(originalScale);
              node.position.copyFrom(originalPosition);
            } catch {}
          },
        );
      }
      this._itemBoneAnimObservers[slot] = null;
    }

    // Starts (or restarts) the idle particle effect for `item` in `slot`,
    // if it has an entry in ITEM_PARTICLE_EFFECTS — e.g. the Starfire
    // Crown's flame wisps. Reproduces the source Bedrock particle_effect
    // JSON as a Babylon ParticleSystem (see the table's own comment
    // above for why this can't just run the Bedrock file directly).
    // Safe to call even when the item has no configured effect; it's
    // then just a no-op, same convention as _startPropellerSpin/
    // _startItemBoneAnimations.
    _startItemParticleEffect(slot, item) {
      this._stopItemParticleEffect(slot);
      if (!this.scene || !item) return;

      const config = ITEM_PARTICLE_EFFECTS[item.slug];
      if (!config) return;

      // Bedrock's source model defines this effect's spawn point as a
      // named locator on the "head" bone (locators: { locator: [0,32,0] }
      // in the crown's geometry JSON) — NOT on the crown mesh's own bone.
      // So the emitter needs to attach to the head node specifically,
      // using the same case-insensitive bone/node lookup as
      // _findSlotBoneNode, rather than just grabbing whatever loaded
      // node happens to have no parent (which is the crown mesh itself,
      // and has the wrong local origin for this offset).
      const emitterBoneName = config.emitterBone || null;
      const emitterNode = emitterBoneName
        ? this._findSlotBoneNode(slot, emitterBoneName)
        : (this.loadedNodes[slot] || []).find((n) => !n.parent) ||
          (this.loadedNodes[slot] || [])[0];
      if (!emitterNode) return;

      const textureUrl = resolveAsset(this.dataRoot, config.textureUrl);
      const particleSystem = new BABYLON.ParticleSystem(
        `itemParticles_${slot}`,
        config.capacity || 60,
        this.scene,
      );
      particleSystem.particleTexture = new BABYLON.Texture(
        textureUrl,
        this.scene,
        true, // noMipmap — matches the pixel-art sampling used elsewhere
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
      );

      // Flipbook playback: one full pass through the sprite sheet's
      // frames stretched across each particle's own lifetime, matching
      // the source's stretch_to_lifetime flag.
      if (config.frameCount && config.frameCount > 1) {
        particleSystem.spriteCellWidth = config.spriteWidth;
        particleSystem.spriteCellHeight = config.spriteHeight;
        const startCell = Math.round(
          (config.startCellY || 0) / config.spriteHeight,
        );
        particleSystem.startSpriteCellID = startCell;
        particleSystem.endSpriteCellID = startCell + config.frameCount - 1;
        particleSystem.spriteCellChangeSpeed = 0; // driven by lifetime below
        particleSystem.spriteCellLoop = false;
        particleSystem.isAnimationSheetEnabled = true;
      }

      const emitBox = config.emitBox || [0.05, 0.05, 0.05];
      particleSystem.emitter = emitterNode;
      particleSystem.particleEmitterType = new BABYLON.SphereParticleEmitter(
        Math.max(emitBox[0], emitBox[1], emitBox[2]) || 0.05,
      );
      if (config.emitterOffset) {
        particleSystem.minEmitBox = new BABYLON.Vector3(
          ...config.emitterOffset,
        );
        particleSystem.maxEmitBox = new BABYLON.Vector3(
          ...config.emitterOffset,
        );
      }

      particleSystem.minLifeTime = config.minLifeTime ?? 1;
      particleSystem.maxLifeTime = config.maxLifeTime ?? 1.5;
      particleSystem.minSize = config.minSize ?? 0.2;
      particleSystem.maxSize = config.maxSize ?? 0.3;
      particleSystem.emitRate = config.emitRate ?? 10;
      particleSystem.minEmitPower = 1;
      particleSystem.maxEmitPower = 1;
      particleSystem.updateSpeed = 1 / 60;

      const [gx, gy, gz] = config.direction || [0, 1, 0];
      particleSystem.gravity = new BABYLON.Vector3(gx, gy, gz);
      // Babylon has no built-in exponential drag; approximate the
      // source's linear_drag_coefficient by damping velocity a little
      // every update tick instead.
      const dragFactor = config.dragFactor ?? 0;
      const startCell = Math.round(
        (config.startCellY || 0) / (config.spriteHeight || 1),
      );
      particleSystem.updateFunction = (particles) => {
        const dt = particleSystem.updateSpeed * this.scene.getAnimationRatio();
        particles.forEach((particle) => {
          particle.age += dt;
          if (particle.age >= particle.lifeTime) {
            particleSystem.recycleParticle(particle);
            return;
          }
          if (dragFactor > 0) {
            const damping = Math.max(0, 1 - dragFactor * dt);
            particle.direction.scaleInPlace(damping);
          }
          particle.direction.addInPlace(particleSystem.gravity.scale(dt));
          particle.position.addInPlace(particle.direction.scale(dt));

          const ratio = particle.age / particle.lifeTime;
          if (config.colorGradient) {
            particle.color = this._sampleColorGradient(
              config.colorGradient,
              ratio,
            );
          }
          if (config.frameCount && config.frameCount > 1) {
            particle.cellIndex =
              startCell +
              Math.min(
                config.frameCount - 1,
                Math.floor(ratio * config.frameCount),
              );
          }
        });
      };

      particleSystem.start();
      this._itemParticleSystems[slot] = particleSystem;
    }

    // Reads a Babylon Color4 out of a [[stop, "#RRGGBBAA"], ...] gradient
    // at `ratio` (0-1 through the particle's life), linearly interpolating
    // between the two surrounding stops — same convention as the source
    // Bedrock gradient's "interpolant" sampling.
    _sampleColorGradient(gradient, ratio) {
      if (!gradient || !gradient.length) {
        return new BABYLON.Color4(1, 1, 1, 1);
      }
      const toColor4 = (hex) => {
        const clean = hex.replace("#", "");
        const r = parseInt(clean.slice(0, 2), 16) / 255;
        const g = parseInt(clean.slice(2, 4), 16) / 255;
        const b = parseInt(clean.slice(4, 6), 16) / 255;
        const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
        return new BABYLON.Color4(r, g, b, a);
      };

      if (ratio <= gradient[0][0]) return toColor4(gradient[0][1]);
      const last = gradient[gradient.length - 1];
      if (ratio >= last[0]) return toColor4(last[1]);

      for (let i = 0; i < gradient.length - 1; i++) {
        const [t0, c0] = gradient[i];
        const [t1, c1] = gradient[i + 1];
        if (ratio < t0 || ratio > t1) continue;
        const span = t1 - t0;
        const localRatio = span > 0 ? (ratio - t0) / span : 0;
        const color0 = toColor4(c0);
        const color1 = toColor4(c1);
        return new BABYLON.Color4(
          color0.r + (color1.r - color0.r) * localRatio,
          color0.g + (color1.g - color0.g) * localRatio,
          color0.b + (color1.b - color0.b) * localRatio,
          color0.a + (color1.a - color0.a) * localRatio,
        );
      }
      return toColor4(last[1]);
    }

    // Stops and disposes the running particle effect for `slot` (if any).
    // Called before re-loading a slot's model (so a stale emitter never
    // keeps spawning particles off a disposed node) and whenever the slot
    // is cleared/unequipped — same lifecycle as _stopPropellerSpin/
    // _stopItemBoneAnimations.
    _stopItemParticleEffect(slot) {
      const particleSystem = this._itemParticleSystems[slot];
      if (particleSystem) {
        try {
          particleSystem.stop();
          particleSystem.dispose();
        } catch {}
      }
      this._itemParticleSystems[slot] = null;
    }

    _clearSlotModel(slot) {
      this._stopPropellerSpin(slot);
      this._stopItemBoneAnimations(slot);
      this._stopItemParticleEffect(slot);
      if (slot === "costume") this._stopBob();
      // If we're about to dispose the costume's skeleton/nodes, detach any
      // currently-equipped shared cape first. The cape's sway hinge is
      // parented to a TransformNode linked to a bone on THIS skeleton
      // (see _fetchSharedCapeModel/_reattachSharedCape); disposing the
      // skeleton out from under it would dispose the hinge too (Babylon
      // disposes children along with their parent), which silently drops
      // the cape mesh hanging off it as well. Un-parenting (rather than
      // disposing) keeps everything alive so _reattachSharedCape() can
      // re-home the hinge onto the next costume once that finishes
      // loading.
      //
      // Important: un-parent the hinge itself, NOT the cape mesh or the
      // old chain-top wrapper directly — the mesh's local position is
      // only meaningful relative to the hinge (see _fetchSharedCapeModel),
      // and the hinge (not the mesh) is what's actually attached to this
      // skeleton's body bone since the sway-pivot fix.
      if (slot === "costume" && this._sharedCapeHinge) {
        try {
          this._sharedCapeHinge.parent = null;
        } catch {}
      } else if (slot === "costume" && this._sharedCapeChainTop) {
        // Fallback for any cape somehow still on the pre-hinge parenting
        // scheme (shouldn't normally happen, but keeps this defensive).
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
        true, // noMipmap — pixel art shouldn't blend across mip levels
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
        // Emissive fill keeps the cape's texture close to true color —
        // Blockbench-style shading is gentle, not high-contrast, so this
        // sits fairly high rather than letting the sun light create
        // strong falloff on its own.
        mesh.material.emissiveTexture = tex;
        mesh.material.emissiveColor = new BABYLON.Color3(0.45, 0.45, 0.45);
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
        this._startItemBoneAnimations("cape_backbling", item);
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

          // cape.glb's "cape" node/mesh has its own local origin (0,0,0)
          // sitting BELOW its geometry (the collar/top edge is at local Y
          // = boundingBox.maximum.y, not at the origin) — so rotating the
          // mesh's own rotation.x swings the whole cape around a point
          // beneath it, which looks inverted (the sway reads backwards
          // instead of hanging naturally from the shoulders). To hinge it
          // correctly, insert a TransformNode ("capeSwayHinge") at the
          // mesh's authored top-edge offset, parent it in the mesh's
          // place, then re-parent the mesh under the hinge preserving its
          // world transform (setParent adjusts local position for us).
          // ITEM_BONE_ANIMATIONS' "cape" track then rotates this hinge —
          // see _findSlotBoneNode's cape_backbling special case below.
          this._stopItemBoneAnimations("cape_backbling");
          if (this._sharedCapeHinge) {
            try {
              this._sharedCapeHinge.dispose();
            } catch {}
            this._sharedCapeHinge = null;
          }
          const capeMesh = this._sharedCapeChainTop;
          if (capeMesh) {
            const capeBbox = capeMesh.getBoundingInfo().boundingBox;
            const topLocalY = capeBbox.maximum.y;
            const hinge = new BABYLON.TransformNode(
              "capeSwayHinge",
              this.scene,
            );
            hinge.parent = capeMesh.parent;
            hinge.position = capeMesh.position.add(
              new BABYLON.Vector3(0, topLocalY, 0),
            );
            capeMesh.setParent(hinge);
            this._sharedCapeHinge = hinge;
          }

          // _applyCapeTexture / _refitCamera / etc. still operate on the
          // flat list of leaf meshes (they need actual Mesh instances for
          // materials and bounding boxes) — only the parenting/positioning
          // above needed to walk up to the wrapper node.
          this._sharedCapeMeshes = meshes;
          this.loadedNodes.cape_backbling = meshes;
          this._applyCapeTexture(textureUrl);
          this._startItemBoneAnimations("cape_backbling", item);
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
      this._stopItemBoneAnimations("cape_backbling");
      if (this._sharedCapeChainTop) {
        try {
          this._sharedCapeChainTop.dispose();
        } catch {}
      }
      if (this._sharedCapeHinge) {
        try {
          this._sharedCapeHinge.dispose();
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
      this._sharedCapeHinge = null;
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

      // Re-parent the tracked hinge node (not the mesh or the old
      // chain-top wrapper) onto the new costume's body bone, so the
      // cape's authored local offset — baked into the
      // hinge -> mesh relationship set up in _fetchSharedCapeModel —
      // stays intact across costume swaps. See _showSharedCape for why
      // re-parenting the mesh directly would put it at the wrong sway
      // pivot again.
      const node =
        this._sharedCapeHinge ||
        this._sharedCapeChainTop ||
        this._sharedCapeMeshes[0];
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

    // Loads the "coming soon" placeholder model into the Costume slot.
    // Used whenever the costume slot would otherwise be left completely
    // empty — first load with no costumes in the catalog, or the user
    // explicitly unequipping their costume — so the stage always shows
    // something in that slot. Deliberately goes through the exact same
    // _loadSlotModel path as a real costume (bone hiding, propeller/bob/
    // item-bone-animation hooks all still run correctly against it) but
    // with a synthetic item that isn't backed by any catalog entry, so it
    // never shows up as "equipped" in the UI or the shareable URL.
    _loadFallbackCostume() {
      this._loadSlotModel("costume", {
        slug: "__fallback_costume__",
        name: "Coming Soon",
        model: FALLBACK_COSTUME_MODEL_URL,
        category: "costume",
      });
    }

    // Advances and returns the texture variant to use for THIS equip of
    // `item`, if it has an ITEM_TEXTURE_VARIANTS entry — cycling forward
    // through the list each time (wrapping back to the start), rather
    // than letting the person choose a color. Returns null for items
    // with no variant entry, so callers can no-op cleanly. The index is
    // advanced (not just read) here, so calling this is itself "using
    // up" this equip's turn in the cycle — don't call it more than once
    // per equip.
    _nextItemVariant(item) {
      const variants = ITEM_TEXTURE_VARIANTS[item.slug];
      if (!variants || !variants.length) return null;

      const current = this._variantCycleIndex[item.slug] || 0;
      const variant = variants[current % variants.length];
      this._variantCycleIndex[item.slug] = current + 1;
      return variant;
    }

    // If `item` has a texture-variant entry, advances its cycle and
    // applies the resulting texture to every mesh just loaded for it in
    // `slot` — same underlying technique as _applyCapeTexture (swap the
    // color texture, keep nearest-neighbor sampling, add a matching
    // emissive fill), just targeting the item's own PBRMaterial
    // (albedoTexture) instead of forcing a shared StandardMaterial like
    // capes do, since these items load their own unique glb with its own
    // imported material rather than reusing one shared mesh. No-ops
    // quietly for items with no ITEM_TEXTURE_VARIANTS entry.
    _applyItemVariantIfAny(slot, item, meshes) {
      const variant = this._nextItemVariant(item);
      if (!variant || !this.scene) return;

      const textureUrl = getItemVariantTextureUrl(item, variant);
      if (!textureUrl) return;

      const tex = new BABYLON.Texture(
        resolveAsset(this.dataRoot, textureUrl),
        this.scene,
        true, // noMipmap — pixel art shouldn't blend across mip levels
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
      );
      tex.hasAlpha = true;

      meshes.forEach((mesh) => {
        if (!mesh.material) return;
        // PBRMaterial (the glTF importer's default) uses albedoTexture as
        // its base color map — mirrors the albedoTexture handling just
        // above in _loadSlotModel's own texture pass, not
        // diffuseTexture/StandardMaterial like the shared cape mesh.
        mesh.material.albedoTexture = tex;
        mesh.material.emissiveTexture = tex;
        mesh.material.emissiveColor = new BABYLON.Color3(0.45, 0.45, 0.45);
      });
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
            if (!mesh.material) return;
            // Pixel-art textures need nearest-neighbor sampling with no
            // mipmaps — Babylon's glTF loader defaults every imported
            // texture to trilinear filtering + generated mipmaps, which
            // blends neighboring texels (including across UV island
            // seams) into soft color bleed as the camera moves back.
            // Wrap mode is also clamped so the GPU can't sample from the
            // opposite edge of a texture at a UV seam, which is the
            // other common source of stray color fringing.
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
              // Emissive fill keeps the texture near its true color —
              // matches Blockbench's bright, evenly-lit viewport rather
              // than a high-contrast lit scene.
              mesh.material.emissiveTexture = mesh.material.albedoTexture;
              mesh.material.emissiveColor = new BABYLON.Color3(
                0.45,
                0.45,
                0.45,
              );
            }
          });
          this.loadedNodes[slot] = meshes;
          this.loadedSkeletons[slot] = skeletons;
          this._applyItemVariantIfAny(slot, item, meshes);
          this._updateStageEmptyState();
          this._syncHelmetVisibility();
          this._syncCapeArmorVisibility();
          if (slot === "costume") this._reattachSharedCape();
          if (slot === "costume") this._startBob();
          this._startPropellerSpin(slot);
          this._startItemBoneAnimations(slot, item);
          this._startItemParticleEffect(slot, item);
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

    // `resetRotation` restores the camera's original orbit angle too —
    // used only by the explicit "reset view" button (_resetView), not by
    // the many equip/unequip/model-load call sites below, which should
    // just re-center/re-zoom without yanking the camera away from
    // whatever angle the user has it at.
    //
    // Order matters here: ArcRotateCamera.setTarget() recomputes
    // alpha/beta/radius from the camera's CURRENT world position
    // relative to the new target. If the camera had been dragged
    // around, calling setTarget first derives angles from that stale,
    // dragged position — so restoring alpha/beta afterward still leaves
    // a subtly wrong radius/position baked in from that intermediate
    // step (this is what caused "reset" to end up tilted/raised versus
    // the true default). Setting alpha/beta BEFORE setTarget avoids
    // that entirely.
    _refitCamera({ resetRotation = false } = {}) {
      const allMeshes = [
        ...this.loadedNodes.costume,
        ...this.loadedNodes.hat,
        ...this.loadedNodes.cape_backbling,
      ].filter((m) => m.getBoundingInfo);

      if (!allMeshes.length) return;

      // Reset view uses a slightly steeper (larger beta = looking down
      // more) angle and a tighter zoom than the camera's true starting
      // defaults, per request — a dedicated offset/multiplier so the
      // plain page-load defaults (_defaultCameraAlpha/Beta) stay
      // unchanged for anything else that might reference them.
      const resetBeta = this._defaultCameraBeta + CAMERA_RESET_BETA_OFFSET;

      if (resetRotation) {
        this.camera.alpha = this._defaultCameraAlpha;
        this.camera.beta = resetBeta;
      }

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
      const baseRadius = Math.max(size.x, size.y, size.z) * 1.85 || 10;
      const radius = resetRotation
        ? baseRadius * CAMERA_RESET_ZOOM_MULTIPLIER
        : baseRadius;

      this.camera.setTarget(center);
      this.camera.radius = radius;
      this.camera.lowerRadiusLimit = radius * 0.4;
      this.camera.upperRadiusLimit = radius * 3;

      if (resetRotation) {
        // setTarget() can still nudge alpha/beta slightly when
        // re-deriving them from the (now-updated) camera position, so
        // pin them back to the exact default once more after everything
        // else has settled.
        this.camera.alpha = this._defaultCameraAlpha;
        this.camera.beta = resetBeta;
      }
    }

    // Handler for the stage's "reset view" button — restores the
    // original orbit angle (steepened slightly, see
    // CAMERA_RESET_BETA_OFFSET) and zooms in a bit tighter than the
    // page-load default (see CAMERA_RESET_ZOOM_MULTIPLIER), in addition
    // to re-centering. Also resets when the stage is empty, since
    // _refitCamera bails out early with nothing equipped to bound.
    _resetView() {
      const resetBeta = this._defaultCameraBeta + CAMERA_RESET_BETA_OFFSET;
      this.camera.alpha = this._defaultCameraAlpha;
      this.camera.beta = resetBeta;
      this._refitCamera({ resetRotation: true });
      // Final pin, after _refitCamera's own internal setTarget/reset
      // sequence, in case anything upstream nudged the angles again.
      this.camera.alpha = this._defaultCameraAlpha;
      this.camera.beta = resetBeta;
    }

    // Renders the current stage to an off-screen render target (so we
    // don't just grab whatever's already in the visible canvas buffer)
    // and downloads it as a transparent PNG. The scene's clearColor
    // already has alpha 0 (see _initBabylon), and engine.setHardwareScalingLevel
    // there also keeps this render crisp at the device's actual pixel
    // ratio rather than the CSS-scaled canvas size.
    _takeScreenshot() {
      if (!this.engine || !this.scene || !this.camera) return;

      const canvas = this.$.canvas;
      const width = Math.max(
        1,
        Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1)),
      );
      const height = Math.max(
        1,
        Math.floor(canvas.clientHeight * (window.devicePixelRatio || 1)),
      );

      const previewName = this._equippedFileName();

      BABYLON.Tools.CreateScreenshotUsingRenderTarget(
        this.engine,
        this.camera,
        { width, height, precision: 1 },
        (dataUrl) => {
          this._watermarkImage(dataUrl, width, height).then((finalDataUrl) => {
            const link = document.createElement("a");
            link.href = finalDataUrl;
            link.download = `${previewName}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
          });
        },
        "image/png",
        undefined,
        false, // antialiasing — off, matches the viewport's hard pixel-art edges
      );
    }

    // Scans a canvas's pixel alpha channel and returns the tightest
    // {x, y, width, height} box containing every non-transparent pixel,
    // or null if the image is fully transparent. This is how we crop
    // out the empty margin _refitCamera leaves around the model for
    // orbit/UI purposes in the live viewport — that margin is only
    // wasted space in an exported still image.
    _findOpaqueBounds(ctx, width, height) {
      const { data } = ctx.getImageData(0, 0, width, height);
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      // Walking row-by-row keeps this cheap even at high-DPI capture
      // resolutions; there's no need for anything fancier since this
      // only runs once per export click.
      for (let y = 0; y < height; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
          const alpha = data[rowOffset + x * 4 + 3];
          if (alpha === 0) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      if (maxX < minX || maxY < minY) return null; // fully transparent

      return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }

    // Draws the rendered screenshot onto a 2D canvas, crops it to the
    // model's actual bounding box (with a little breathing room), stamps
    // a small "playhive.wiki" watermark in the bottom-right corner, and
    // returns a new PNG data URL. Keeping this as a separate compositing
    // pass (rather than drawing into the Babylon scene itself, or
    // re-framing the 3D camera) means none of it affects the live
    // viewport or its orbit/zoom framing — only the exported file.
    _watermarkImage(dataUrl, width, height) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          // First pass: draw at full captured size purely so we can
          // read back pixel alpha and find the content bounds.
          const scratchCanvas = document.createElement("canvas");
          scratchCanvas.width = width;
          scratchCanvas.height = height;
          const scratchCtx = scratchCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          scratchCtx.drawImage(img, 0, 0, width, height);

          const bounds = this._findOpaqueBounds(scratchCtx, width, height);

          // Pad around the tight bounds so the crop doesn't feel
          // clipped, scaled relative to the content size itself.
          const paddingRatio = 0.06;
          let cropX = 0;
          let cropY = 0;
          let cropWidth = width;
          let cropHeight = height;

          if (bounds) {
            const padX = Math.round(bounds.width * paddingRatio);
            const padY = Math.round(bounds.height * paddingRatio);

            const left = Math.max(0, bounds.x - padX);
            const top = Math.max(0, bounds.y - padY);
            const right = Math.min(width, bounds.x + bounds.width + padX);
            const bottom = Math.min(height, bounds.y + bounds.height + padY);

            cropX = left;
            cropY = top;
            cropWidth = right - left;
            cropHeight = bottom - top;
          }

          const outCanvas = document.createElement("canvas");
          outCanvas.width = cropWidth;
          outCanvas.height = cropHeight;
          const ctx = outCanvas.getContext("2d");
          ctx.drawImage(
            scratchCanvas,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight,
          );

          // Scale the watermark relative to the cropped image size so
          // it stays legible (but unobtrusive) whether this is a small
          // preview or a large high-DPI capture.
          const fontSize = Math.max(12, Math.round(cropHeight * 0.028));
          const paddingX = Math.round(fontSize * 0.9);
          const paddingY = Math.round(fontSize * 0.9);
          const label = "playhive.wiki";

          ctx.font = `700 ${fontSize}px sans-serif`;
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";

          const x = cropWidth - paddingX;
          const y = cropHeight - paddingY;

          // Soft dark outline/shadow first so the label stays readable
          // over both light and dark parts of the render, then the
          // semi-transparent white fill on top.
          ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.18));
          ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
          ctx.lineJoin = "round";
          ctx.strokeText(label, x, y);

          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          ctx.fillText(label, x, y);

          resolve(outCanvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(dataUrl); // fall back to unwatermarked
        img.src = dataUrl;
      });
    }

    // Builds a readable filename out of whatever's currently equipped,
    // e.g. "endolotl_shark-hat_ender-pearl-cape", falling back to a
    // generic name if the stage is empty.
    _equippedFileName() {
      const slugs = [
        this.equipped.costume,
        this.equipped.hat,
        this.equipped.cape_backbling,
      ]
        .filter(Boolean)
        .map((item) => item.slug);
      return slugs.length ? slugs.join("_") : "cosmetic-locker";
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
