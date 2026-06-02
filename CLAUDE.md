# CLAUDE.md — Simatrix Engineering Graphics · Module 1: Projection of Points

Three.js simulation that teaches **projection of points** onto the Horizontal Plane (HP) and
Vertical Plane (VP) across all four dihedral quadrants. Follows **First Angle Projection**
(Indian standard, SP 46:2003 / BIS). Ships as a self-contained folder that runs via XAMPP
(`http://localhost/Module1/index.html`) or any static HTTP server.

**UI model:** The simulation is a **Guided Stepper** (progressive disclosure, one idea per
step) per the platform direction in `@PRODUCT.md` — not an all-controls-at-once dock. A step
rail walks the learner from "the two planes" through to "solve a problem"; each step reveals
only the controls it needs.

**Design system rules:** Follow `@DESIGN.shared.md` for all colour, typography, spacing, and
UI decisions. Strategic context lives in `@PRODUCT.md`. Never hard-code hex values in CSS or
JS — define them as CSS custom properties in `index.html :root {}`. `main.js` reads the live
colour tokens at runtime via `getComputedStyle` (`readTokens()`), so the viewport and the
chrome always share one source of truth.

**Scope boundary:** This module is a standalone Three.js simulation. It contains:
- `index.html` — UI shell, CSS design tokens, step rail + step card, toggle bar, PiP layout
- `main.js` — orchestrator: two renderer stacks, rebuild pipeline, animation, swap, stepper controller, term popovers
- `src/pointData.js` — pure data layer (no Three.js, no DOM)
- `src/steps.js` — pure data layer: the step sequence (`STEPS`) and term glossary (`TERMS`)
- `intro.html` — standalone introduction page (Topic 1: Technical Drawing)
- `meta.json` — Simatrix platform metadata

---

## Architecture (non-negotiable)

- **No build step.** No npm, Vite, Webpack, bundler, or `package.json`. Files run by
  opening `index.html` via a local HTTP server (XAMPP `htdocs/`). Direct `file://` opening
  will fail due to ES module CORS restrictions in Chrome.

- **CDN ES modules only**, via this exact import map pinned to `0.160.0`:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }}
  </script>
  ```
  Never use `@latest`. Never `npm install three`. Never use the UMD global build.

- **Imports must include `.js` extension** — `import { x } from './src/pointData.js'`.
  Extensionless imports 404 without a bundler.

- **All paths relative** — `./src/pointData.js`, never `/src/...`. The folder may be
  served from any URL prefix.

- **Requires internet on first load** for the Three.js CDN fetch. Once cached by the
  browser it works offline.

---

## File structure

```
Module1/
├── index.html          ← UI shell, all CSS tokens, step rail + step card, canvas area, toggle bar
├── main.js             ← orchestrator (two renderer stacks, rebuild, animation, swap, stepper, terms)
├── intro.html          ← Topic 1 introduction page (standalone, no Three.js)
├── meta.json           ← Simatrix platform metadata (title, description, difficulty, tags)
├── CLAUDE.md           ← this file
└── src/
    ├── pointData.js    ← pure data layer: defaultPointData(), resolvePosition(), QuadrantType
    ├── steps.js        ← pure data layer: STEPS (guided sequence) + TERMS (inline glossary)
    └── uiManager.js    ← stub (kept for import compatibility; main.js handles UI directly)
```

---

## Platform contract

- **`meta.json`** at root with all four fields: `title`, `description`, `difficulty`, `tags`.
- **`window.simAPI`** exposed in `main.js`:
  ```js
  window.simAPI = {
    pause(),   // cancel the rAF loop
    resume(),  // restart the rAF loop
    reset(),   // restore defaultPointData() + default cameras; rebuild both scenes
  };
  ```
- **Self-starting.** Simulation runs on `window load` event; no external `init()` call needed.
- **Mobile notice.** A dismissible banner (`#mobile-note`) appears at viewports `< 768px`.

---

## Guided Stepper (UI controller in main.js)

The lesson is a sequence defined as pure data in `src/steps.js` (`STEPS[]`) and rendered by
the stepper controller in `main.js`. The arc is Orient → Intuition → Problem-solving:

1. **The two reference planes** — planes only, no controls.
2. **Lift the point above HP** — reveals `distHP`; shows P + HP projector + top view `p`.
3. **Move the point in front of VP** — reveals `distVP`; adds VP projector + front view `p'`.
4. **Unfold the planes** — reveals the Animate button.
5. **Explore the four quadrants** — reveals the quadrant selector + quadrant labels.
6. **Set up and solve a problem** — reveals `distRP` and all numeric entry.

**Progressive disclosure.** Each step's `controls` array lists which `.ctrl` wrappers in
`#controls` are shown (`hidden` toggled); each step's `view` object sets the viewport flags
(`showPoint`, `showHP`, `showVP`, `showCoord`, `showQuad`) consumed by `draw3D`/`draw2D`.
`rebuild()` always renders for `viewFor(step)`, so navigating steps re-renders the viewport
without changing the data.

**2D drawing gate.** `draw2D` only plots `p`/`p'` once **both** `showHP` and `showVP` are
true (step 3+); before that it shows an in-viewport empty-state. This avoids displaying the
counterintuitive `distHP → p'` / `distVP → p` mapping before unfolding is taught.

**Step rail** (`#rail`) marks done (✓ / success) / current (accent + halo) / upcoming
(hollow) and is keyboard-navigable; learners can revisit any step up to `maxReached`.

**Term popovers.** Inline `<button class="term" data-t="…">` open the `#term-pop` tooltip
from `TERMS` on hover, focus, or click; Escape and scroll dismiss. Definitions live in
`src/steps.js`.

**Accessibility.** Live region (`#live`) announces step changes; sliders carry
`aria-valuetext`; focus rings everywhere; `prefers-reduced-motion` skips the unfold tween and
reveals the 2D result instead.

---

## Two-renderer architecture (critical — read before touching main.js)

Module 1 uses **two completely independent Three.js renderer stacks** — one always 3D, one
always 2D. This is the most important architectural decision in this module.

```
S3 = { scene, cam, rend, ctrl, grp }   ← always the 3D scene, always on canvas #c3d
S2 = { scene, cam, rend, ctrl, grp }   ← always the 2D scene, always on canvas #c2d
```

**The canvases never move. The scenes never swap. The renderers never cross.**

"Swapping views" means toggling CSS classes on the two `<canvas>` elements:
- `.pane-main` — fills the full viewport area
- `.pane-pip` — small Picture-in-Picture overlay (top-right, fixed size)

This is done purely in CSS via the `swap()` function in `main.js`. Do NOT move canvas
elements between DOM containers. Do NOT reassign renderers between stacks. Previous attempts
to move DOM elements caused the axes helper from S3 to bleed into S2, crashing the layout.

**Canvas sizing is JavaScript-controlled, not CSS-controlled.** The `layout()` function
reads `area.clientWidth / clientHeight` and calls `rend.setSize(w, h, false)` explicitly.
Canvas elements have no CSS width/height rules — Three.js owns their pixel dimensions.

---

## rebuild() pipeline (non-negotiable)

Every parameter change routes through `rebuild(pointData)`:

1. `resolvePosition(data)` — applies quadrant sign logic to get signed (x, y, z) in cm
2. `toW(cm)` — converts cm → world units (÷ 10, so 50 cm = 5 world units)
3. `fill(S3, true, wp, wd, raw)` — disposes S3.grp children, calls `draw3D()`
4. `fill(S2, false, wp, wd, raw)` — disposes S2.grp children, calls `draw2D()`
5. `hiQ(quadrant)` — updates the quadrant table highlight in the dock
6. `syncUI(data)` — syncs sliders and number fields to current values

**Disposal contract** (run inside `fill()` before every rebuild):
```js
for (const o of grp.children) {
  o.geometry?.dispose();
  [o.material].flat().forEach(m => { m?.map?.dispose(); m?.dispose(); });
}
grp.clear();
```

Do not skip disposal. Canvas textures from `alb()` (sprite labels) accumulate fast.

---

## Engineering graphics conventions (First Angle Projection — SP 46:2003)

### Point data (stored in cm, converted to world units for rendering)

```
distHP  = perpendicular distance of P above the Horizontal Plane
distVP  = perpendicular distance of P in front of the Vertical Plane
distRP  = perpendicular distance of P from the Profile (side) Plane
quadrant = Q1 | Q2 | Q3 | Q4
```

Scale: `CM_SCALE_DIV = 10` → 1 cm = 0.1 world units. Sliders accept 0–100 cm; typed
input accepts up to 200 cm.

### 3D scene conventions (right-handed, Y-up — Three.js default)

```
HP = XZ plane at Y = 0   (flat teal plane, horizontal floor)
VP = XY plane at Z = 0   (upright amber plane, facing +Z toward viewer)
Fold line = X axis (the TRUE HP ∩ VP intersection)
```

Both planes share the X-axis, so HP can fold flat onto VP about that exact
line (see the unfolding animation). `draw3D` **remaps** the resolved position
to world axes — `q = (lateral distRP → X, height distHP → Y, depth distVP → Z)`
— so distVP becomes the depth axis (+Z = in front of VP). `resolvePosition()`
itself is unchanged; only `draw3D`/`runAnimation` interpret its output via `q`.

**Sign table for resolvePosition()** (returns raw signed cm — `pointData.js`
is unchanged; the remap to world axes happens in `draw3D`):

| Quadrant | x = ±distVP | y = ±distHP | z = ±distRP |
|---|---|---|---|
| Q1 — Above HP, In front of VP | +distVP | +distHP | +distRP |
| Q2 — Above HP, Behind VP      | −distVP | +distHP | +distRP |
| Q3 — Below HP, Behind VP      | −distVP | −distHP | +distRP |
| Q4 — Below HP, In front of VP | +distVP | −distHP | +distRP |

In `draw3D` these map to world as `q.x = z (distRP)`, `q.y = y (distHP)`,
`q.z = x (distVP)` — so "in front of VP" is +Z (toward the camera).

### 2D drawing conventions (after HP unfolds 90° about the X fold line)

| View | Plane | Position relative to XY line | Controlled by |
|---|---|---|---|
| `p'` — front view | VP | Above XY for Q1/Q2, below for Q3/Q4 | `distHP` |
| `p`  — top view   | HP | Below XY for Q1/Q4, above for Q2/Q3 | `distVP` |

**Critical:** `distHP` controls `p'` distance from XY (how high P is above HP projects
onto VP as the front view elevation). `distVP` controls `p` distance from XY (how far P
is in front of VP projects onto HP as the top view after HP rotates down). This is
**opposite to what seems intuitive** — do not swap them back.

### 2D sign logic per quadrant

```js
// p' on VP (front view)
const elevSign = (quadrant==='Q1'||quadrant==='Q2') ? 1 : -1;
const ey = elevSign * d.distHP;   // distHP → p' distance from XY

// p on HP (top view)
const planSign = (quadrant==='Q2'||quadrant==='Q3') ? 1 : -1;
const py = planSign * d.distVP;   // distVP → p distance from XY

// Lateral X offset (PP distance)
const signLat = (quadrant==='Q2'||quadrant==='Q3') ? -1 : 1;
const lx = signLat * d.distRP;
```

### Colour convention (platform functional encodings — read from CSS tokens)

```
--hp = '#007f7c'  (teal,  SOLID)   → HP plane, p foot, projector to HP, p label
--vp = '#bc5d1e'  (amber, DASHED)  → VP plane, p' foot, projector to VP, p' label
```

HP is the **flat teal plane**; VP is the **upright amber plane** — the colour-blind-safe
pair from `DESIGN.shared.md`. **Two-Cue Rule:** colour is never the only signal, so
everything HP is drawn **solid** and everything VP is drawn **dashed**. The teal projector
drops vertically from P to HP (top view); the amber dashed projector reaches horizontally to
VP (front view).

**Chrome-Only Blue Rule:** the accent blue (`--accent #1f66b5`) is for guidance chrome only
(step rail, primary buttons, slider fill, focus rings) and never appears as linework inside
the viewport. The active-quadrant label in the 3D scene is **ink**, not accent. The
`AxesHelper` was removed because its red/green/blue is off-palette and leaked blue into the
viewport.

---

## HP unfolding animation (REVERSIBLE — fold ⇄ unfold)

Triggered by the fold button. Runs only in the 3D scene (S3). `runAnimation()` is a
**dispatcher on a module-level `folded` flag**: forward (`unfoldTo2D`→`animateFold(false)`)
or reverse (`foldBackTo3D`→`animateFold(true)`). The shared scene is built once by
`buildAnimScene()` in the SAME world axes as `draw3D`, so the first frame is
pixel-identical to the static scene — **no jump.** `foldStateAt(p)` returns `{rot,op}`
for the forward timeline; **reverse evaluates it at `1 − t`**, an exact mirror (same
duration, easing, hinge). The button text toggles `ANIM_LABEL` ('▶ Animate Unfolding')
⇄ `REFOLD_LABEL` ('↩ Fold back to 3D'); on reverse-complete it calls `rebuild()` to
restore the live 3D scene. `rebuild()` clears `folded` + calls `resetAnimButton()`, so
step navigation / control changes never strand a folded sheet. **Both the Points
(`main.js`) and Lines (`lines.js`) modules share this reversible design.**

**What happens:**
1. The scene is rebuilt: VP (XY plane, z=0), fold line, point P, and `p′` + its
   VP-side construction are **static**. A `THREE.Group` (`hpGroup`) holds the HP
   plane mesh, border, HP label, `p` foot/cross/label, and the `p → fold line`
   connector — everything that must rotate rigidly with HP.
2. `hpGroup.rotation.x` eases `0 → +Math.PI/2` (90°) about the X-axis (the hinge).
   Because both planes share the X-axis, HP lands **coplanar** with VP in the z=0
   plane: `p` swings to below the XY line, `p′` stays above — the textbook sheet.
3. **The camera NEVER moves** (this is a hard product requirement — see
   [[feedback-animation-no-camera-movement]]). The fold plays out entirely within
   the user's current viewpoint. `AUTO_ALIGN_CAMERA` (default `false`, top of
   main.js) optionally adds a post-fold head-on glide; leave it off.
4. The 3D **depth cues** (point P, its label, and the two *perpendicular*
   projectors `P→p` and `P→p′`) fade to opacity 0 over the last ~28 % of the
   timeline, leaving a clean 2D sheet. The `p′→fold` and `p→fold` connectors stay
   (they lie in the sheet plane and form the vertical projector through the XY line).
5. **Forward end = frozen flat sheet** (`folded=true`, no camera reset/rebuild). The
   sheet stays until the user clicks **Fold back to 3D** (reverse animation) or changes
   a control / navigates a step (normal `rebuild()` back to 3D). **Reverse end** sets
   `folded=false` and calls `rebuild()` to return to the live, interactive 3D scene.

**The HP projector `P → foot` is dynamic:** a `footTracker` Object3D rides inside
`hpGroup`, and each frame the projector is redrawn from the static P to the foot's
current world position, so it tracks the moving foot during the fold. It is one of
the depth cues that fades out at the end.

`animating` flag is set `true` during animation. `rebuild()` returns early if
`animating === true`; `loop()` skips `S3.ctrl.update()` while animating so
OrbitControls damping can't fight the (now stationary) camera. Button disabled
during animation.

---

## Geometry helpers (in main.js)

All geometry helpers take `g` (a `THREE.Group`) as their first argument:

| Helper | Purpose |
|---|---|
| `apl(g, size, color, opacity, euler)` | Add a semi-transparent plane mesh |
| `fatLine(g, flat[], color, width, dashed)` | Core stroke primitive — a `Line2` (thick, crisp). Registers its `LineMaterial` in `curMats` |
| `asg(g, a, b, color, dashed, w?)` | Add a line segment (solid or dashed) — routes through `fatLine` |
| `alp(g, points[], color, w?)` | Add a closed loop polyline — routes through `fatLine` |
| `asp(g, x, y, z, r, color)` | Add a sphere (point P marker) |
| `acr(g, cx, cy, cz, r, color, is3D)` | Add a cross marker (two `fatLine` strokes) |
| `adm(g, x1,y1,x2,y2, color, text)` | Add a dimension line with filled arrowheads |
| `alb(g, text, x,y,z, color, sx, sy, mono?, cw?)` | Add a canvas-texture sprite label |
| `albBox(g, text, x,y,z, color, h?)` | Boxed point label: coloured text on a white rounded-rect plate (P / p / p′) |

**Fat lines (`Line2`):** every stroke is a `Line2`/`LineMaterial` so line weight is
real and constant on-screen (widths live in the `LW` const, in CSS px). `LineMaterial`
needs `resolution` = the canvas pixel size; `fill()`/the fold builder set `curMats` +
`curRes` (via `sizeOf(is3D)`), and `layout()` calls `updateLineRes()` on resize/swap.
Each scene owns `lineMats[]`. Dynamic fold trackers stay thin `THREE.Line` (they fade).

`alb()` **supersamples** (SS=3) + anisotropic filtering so text stays sharp at small
sizes; same call signature and validated sprite scales. `albBox()` sizes its canvas to
the text so the white chip never distorts; `h` is the chip's world height. Plane names
(HP/VP/XY) stay plain `alb` with their token colours.

`adm()` uses `THREE.ShapeGeometry` for filled triangle arrowheads. Arrowheads point
**inward** (toward each other). The label is placed to the left of the dimension line.

---

## Dimension and layout rules

- **Slider range:** 0–100 cm (HTML `min=0 max=100 step=1`)
- **Typed input:** 0–200 cm (clamped in the `change` handler)
- **Default values:** `distHP=20, distVP=20, distRP=0, quadrant=Q1`
- **World scale:** 1 cm = 0.1 world units (`CM_SCALE_DIV = 10`)
- **Dimension labels:** show real cm values from `raw` data, not world-unit values

---

## Common bugs and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Blank 3D canvas on load | `layout()` runs before `window load`, dimensions are 0 | Use `window.addEventListener('load', ...)` + `setTimeout(layout, 100)` |
| Blue/green stray linework in viewport | `AxesHelper` (RGB) leaks into S2 / breaks Chrome-Only Blue | `AxesHelper` removed entirely; planes + fold line + quadrant labels orient the view |
| Sprite labels show fallback font | Web font not loaded when first texture is baked | `document.fonts.ready.then(() => rebuild(data))` re-bakes sprites once fonts load |
| Slider fill doesn't move (WebKit) | `--p` custom property not updated | `setRange()` sets `el.style.--p` on every sync; Firefox uses `::-moz-range-progress` |
| Swap breaks layout | Canvas CSS was fighting Three.js `setSize()` | Canvas elements have no CSS width/height; `layout()` owns sizing entirely |
| Labels clipped | Canvas texture too narrow (256px) for long text | Use 512px canvas width for `alb()` |
| Arrowheads wrong direction | `pointingUp` flag inverted | Arrow at y1 points toward y2; arrow at y2 points toward y1 |
| `distHP` moves wrong line in 2D | Variables swapped | `distHP` → `ey` (p' on VP); `distVP` → `py` (p on HP) |
| Animation rotates wrong way | Wrong sign on `hpGroup.rotation.x` | Use `+Math.PI/2` (positive X rotation swings HP forward/down) |
| Scene "jumps" when Animate is clicked | `runAnimation` built the scene in a different coord system than `draw3D` | Both must use VP=XY(z=0), HP=XZ(y=0); animation frame-1 must equal `draw3D` |
| Camera teleports/flies on Animate | Animation set/lerped `S3.cam` | Never touch `S3.cam`/`S3.ctrl` in `runAnimation` (`AUTO_ALIGN_CAMERA=false`) |
| Fold ends perpendicular, not flat | Planes didn't share the hinge line | VP must lie in the plane HP rotates *into* (z=0); they share the X-axis |
| Final frame still shows floating P + diagonal projectors | Depth cues not hidden | Fade `fade[]` (P, P label, `P→p`, `P→p′`) to opacity 0 over the last ~28 % |

---

## What is NOT in this module (out of scope)

- Projection of straight lines (Topic 3 of Module 1 syllabus — separate sim)
- True length and inclinations
- Traces of a line (HT, VT)
- Host Simatrix navbar, login, account UI, module browser
- Any server-side code, database, or API calls
- ZIP packaging (module runs as a plain folder via XAMPP)

---

*Module 1 — Projection of Points · Simatrix Engineering Graphics Platform*
*KTU B.Tech Syllabus · First Angle Projection · SP 46:2003 (BIS)*
*Built with Three.js 0.160.0 · No build tools required*
