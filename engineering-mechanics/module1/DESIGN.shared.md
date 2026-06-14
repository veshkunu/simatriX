---
name: Simatrix Guided Stepper (Shared Core)
description: Platform-wide design system for Simatrix guided-stepper engineering simulations — shared across all modules.
colors:
  accent: "#1f66b5"
  accent-strong: "#17539b"
  accent-soft: "#e3ecf7"
  paper: "#faf8f3"
  panel: "#efebe1"
  geometry-fill: "#e7e1d4"
  ink: "#221f18"
  ink-secondary: "#564e3c"
  bench-grey: "#938b7b"
  border: "#d9d2c3"
  track: "#cfc8b8"
  hp-teal: "#007f7c"
  vp-amber: "#bc5d1e"
  success: "#2e7d52"
  success-soft: "#e2efe8"
typography:
  title:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.07em"
  value:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
  step-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px 16px"
  numeric-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.value}"
    rounded: "{rounded.xs}"
    padding: "8px"
  toggle-box:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xs}"
    size: "18px"
  toggle-box-checked:
    backgroundColor: "{colors.accent}"
  hint-callout:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px"
  rail-marker-current:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
  rail-marker-complete:
    backgroundColor: "{colors.success}"
    textColor: "{colors.paper}"
---

# Design System: Simatrix Guided Stepper — Shared Core

> **How to use this file.** This is the **platform-wide** visual contract that every Simatrix
> simulation module shares, across all disciplines (Engineering Graphics, Mechanical, Civil,
> EEE, CS). It was extracted from Module 2's `DESIGN.md` and generalized: anything that was a
> solids-only illustration (rotation hierarchy, face inclination, vertex labels, the square-pyramid
> example) has been removed or genericized here.
>
> **What's binding for every module:** the tokens (colors, type, radii, spacing), the components,
> the named rules, the North Star, and the do's/don'ts. A control labeled the same way must mean
> and behave the same way in every module — see PRODUCT.md Design Principle 3, "one language,
> many disciplines."
>
> **What each module adds on top:** its own domain encodings and viewport behaviour, documented in
> a module-local design appendix — not by re-defining tokens. The strategic context (users, brand,
> anti-references, principles, accessibility commitments) lives in the shared `PRODUCT.md`; read it
> alongside this file. Never hard-code design values in CSS or JS — consume the tokens defined here.

## 1. Overview

**Creative North Star: "The Patient Tutor's Paper"**

This is the surface a warm one-on-one tutor sketches on, sitting beside an anxious first-year who is sure they are "bad at this." It is warm off-white drafting paper with dark warm-grey ink, deliberately not clinical, because warmth lowers the intimidation a struggling learner feels. The chrome is near-monochrome and quiet so the only things that raise their voice are the content in the viewport and the single ink-blue accent that walks the learner from one step to the next. Saturated color is rationed to two jobs and two only: the functional engineering encodings inside the scene, and the one blue accent that guides attention through the wizard.

The system serves a guided stepper, not a sandbox: one idea per step, controls revealed only when their step needs them. Every surface is soft (generous radii, airy spacing) so nothing feels crowded, and every interactive target is at least 44px so an anxious mouse, a touch screen, or the back row of a classroom projector can all reach it. The aesthetic must read as real engineering software with the intimidation stripped out, never as a toy.

It explicitly rejects the lanes PRODUCT.md locks out: gamified edtech (mascots, confetti, badges, streaks, points), the glossy architectural-viz look (glassmorphism, PBR renders, drop-shadow-heavy cards), marketing-site polish (gradient text, hero imagery, parallax), dark IDE chrome, and the overwhelming all-controls-at-once dashboard the stepper was built to replace.

**Key Characteristics:**
- Warm drafting-paper light theme; no dark variant, no `#000`, no `#fff`.
- Near-monochrome chrome plus one technical-blue accent used for guidance only.
- Functional viewport color (e.g. HP teal, VP amber) that lives almost entirely inside the scene, never in the chrome.
- Flat ink-on-paper depth: tonal layering and hairlines over shadows.
- Legibility-first type (Atkinson Hyperlegible) and tabular mono numerics (IBM Plex Mono).
- Soft radii, generous spacing, 44px minimum targets, every color paired with a second cue.

## 2. Colors

Near-monochrome warm neutrals carry the chrome; saturation is reserved for guidance (one blue) and the functional domain encodings inside the viewport.

### Primary
- **Technical Blue** (`#1f66b5`, `oklch(0.52 0.14 252)`): the one interaction accent. Marks the current step, the primary action (Add, Next, Draw, Flatten), the selected toggle, the slider fill, and the focus ring. About 5.6:1 on paper. **Hover/Pressed** deepens to `#17539b` (`oklch(0.45 0.14 252)`); **Accent Wash** `#e3ecf7` (`oklch(0.94 0.025 252)`) backs the current-step pill, hint callouts, and term popovers.

### Functional Viewport Encodings (shared)
These two are the platform's standard projection-plane colours. They originate in the orthographic-projection work but apply to **any** module that projects onto the horizontal and vertical planes (e.g. projection of points and lines in Engineering Graphics basics). A module that has no HP/VP concept may leave them unused, but must not repurpose these hues for unrelated meanings.
- **HP Teal** (`#007f7c`, `oklch(0.53 0.11 192)`): the Horizontal Plane projection (the top view), drawn solid. Held deliberately off blue so it never reads as the chrome accent. 4.57:1 on paper.
- **VP Amber** (`#bc5d1e`, `oklch(0.58 0.12 55)`): the Vertical Plane projection (the front view), drawn dashed. Teal and amber form the color-blind-safe pair that carries the drawing. 4.19:1 on paper.

### Neutral
- **Drafting Paper** (`#faf8f3`, `oklch(0.985 0.008 90)`): the app and viewport background.
- **Panel** (`#efebe1`, `oklch(0.95 0.009 90)`): the wizard surface, one tonal step below paper.
- **Geometry Fill** (`#e7e1d4`, `oklch(0.90 0.013 88)`): the fill for rendered 3D geometry faces, light enough that dark ink edges read against them.
- **Ink** (`#221f18`, `oklch(0.24 0.012 80)`): primary text and the visible edges of rendered geometry, about 16:1 on paper.
- **Ink Secondary** (`#564e3c`, `oklch(0.44 0.016 80)`): secondary text, leads, helper copy.
- **Bench Grey** (`#938b7b`, `oklch(0.62 0.012 88)`): hidden-edge linework, reference grids, inactive linework, the disabled lock cue.
- **Border** (`#d9d2c3`, `oklch(0.865 0.012 88)`): hairline seams and dividers.
- **Track** (`#cfc8b8`, `oklch(0.83 0.013 88)`): the recessed slider groove, one step below border.

### Status
- **Success** (`#2e7d52`, `oklch(0.56 0.10 158)`): a completed step, always shown with a check glyph, never color alone. **Success Wash** `#e2efe8` backs completion states. There is no alarming red; gentle validation uses a clay tone, never red.

### Named Rules
**The Quiet Chrome Rule.** The blue accent covers at most ~10% of any screen. If more than a tenth of the chrome is blue, it is overused: the eye must land on the viewport, not the UI.

**The Chrome-Only Blue Rule.** Blue belongs to the guidance layer (steps, actions, focus) and never appears as a domain color inside the viewport. The drawing uses the functional encodings (e.g. teal/amber). This separation is non-negotiable: it is what lets a learner tell "the UI is guiding me" from "this is the domain content," even on a washed-out projector.

**The Two-Cue Rule.** No color carries meaning alone. Every functional encoding pairs its hue with a second cue — line weight, dash pattern, label, icon, arrow direction, or shape. Success is green plus a check. Disabled is faint plus reduced opacity plus a lock icon.

## 3. Typography

**Body / UI Font:** Atkinson Hyperlegible (with `system-ui, sans-serif` fallback), bundled as subset `woff2` in `./assets/fonts/`.
**Numeric Font:** IBM Plex Mono (with `ui-monospace, monospace` fallback), bundled alongside.

**Character:** Atkinson Hyperlegible is purpose-built for legibility with disambiguated letterforms (1/l/I, 0/O), chosen so the struggling, low-vision, or reading-fatigued learner reads with the least effort. IBM Plex Mono is warm and humanist enough to sit beside it while keeping live values from jittering.

### Hierarchy
- **Title** (700, `1.35rem`, line-height 1.2, `-0.01em`): the step title, the tutor's headline for the current idea.
- **Lead** (400, `1.125rem`, line-height 1.35): the step's one-sentence explanation under the title.
- **Body** (400, `1rem`, line-height 1.6): instructions, notes, hint copy. Capped at a comfortable measure; never set below the caption size.
- **Label** (700, `0.75rem`, `0.07em`, uppercase): group titles and the "Step X of N" eyebrow, the engineering-software register.
- **Value** (IBM Plex Mono, 400, `0.875rem`, tabular figures): every live numeric readout with its unit, plus precise text entry.

### Named Rules
**The Two-Weight Rule.** Atkinson ships Regular (400) and Bold (700) only. Build hierarchy from size and the 700 bold, never from a 500/600 weight that does not exist.

**The Tabular Rule.** Every value the math depends on is set in IBM Plex Mono with `font-variant-numeric: tabular-nums`, so a value does not shift width as it updates. Showing real values in real units is the line between an engineering instrument and a toy.

## 4. Elevation

The system is flat by conviction: engineering drawings are ink on a surface, so depth is conveyed by **tonal layering** (paper to panel to geometry-fill) and 1px hairline borders, not by shadows. Rendered geometry never casts a shadow. Shadows exist only as a thin exception for transient overlays that must float above the page.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 4px 16px color-mix(in srgb, var(--color-ink) 12%, transparent)`): warm-tinted, soft. Used only on transient surfaces that leave the flow: the term-definition popover, the orbit-hint chip, the mobile banner.
- **Focus Halo** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 26%, transparent)`): a diffuse accent ring on focused/dragged controls, derived from the accent so it stays a single source.

### Named Rules
**The Flat-Ink Rule.** Surfaces are flat at rest. Never cast a shadow on rendered geometry, and never use elevation as decoration. If a shadow is not lifting a transient overlay off the page, it is wrong.

**The Border-Over-Shadow Rule.** Structure comes from a single crisp hairline (`#d9d2c3`), not a drop shadow. Cards and panels are separated by tone and seam, not by float.

## 5. Components

Every component consumes tokens, carries soft radii, meets a 44px target, shows a visible focus ring, and pairs any color signal with a second cue.

### Buttons
- **Shape:** softly rounded (`6px`, `--radius-sm`), height at least 44px.
- **Primary:** Technical Blue fill (`#1f66b5`) with paper text; the one loud action per step (Add, Next, Draw, Flatten). **Hover** deepens to `#17539b`; **Active** nudges down 1px (transform only).
- **Secondary:** paper fill with a hairline border and ink text (Back).
- **Ghost:** text-only ink-secondary, transparent at rest (Reset, dismiss). Reset always routes through `window.simAPI.reset()`; there is no second reset path.
- **Focus:** the accent focus halo, never removed.

### Sliders
- **Track:** a thin 4px recessed groove in Track grey (`#cfc8b8`), pill-rounded; the travelled portion fills with the accent.
- **Thumb:** a 16px accent knob with a 2px paper gap-ring and a hairline edge, flat at rest; the diffuse halo appears only on hover/focus/drag.
- **Hit area:** the full 44px row is draggable even though the track reads as a thin line.
- **Readout:** an IBM Plex Mono tabular value sits beside every slider with its unit; arrow keys step by 1, with finer steps on Shift.

### Inputs / Fields
- **Numeric input:** IBM Plex Mono tabular, right-aligned, paper fill, hairline border, `4px` radius. Precise textbook entry; invalid text reverts to the last valid value, never an alarming red.
- **Select:** full-width, 44px tall, paper fill with a baked inline chevron, hairline border.

### Toggles
- **Style:** a custom 18px drafting-square checkbox (not a consumer switch). Empty box versus a filled accent box with a paper tick is a shape cue, not color alone.
- **Disabled by hierarchy:** rendered at reduced opacity with a small padlock icon at the row's end, so it reads as "locked for now," not broken. Use this pattern wherever a module needs mutually-exclusive control hierarchies (one mode disables another).

### Cards / Containers
- **Step card:** paper surface, `10px` (`--radius-md`) corners, hairline border, `24px/16px` padding. Holds only the current step's controls; content swaps with a short fade and translate.
- **Strategy:** no shadow (hairline border instead), and cards are never nested.

### Step Rail (signature)
A vertical numbered spine of the wizard. **Completed** = a Success-green disc with a check glyph and ink-secondary label; **Current** = a filled accent disc with a soft-accent halo and bold ink label; **Upcoming** = a hollow, faint disc. The shape (filled / check / hollow) plus the number carries state without relying on color. A live region announces "Step X of N" on change.

### Inline Term Definition (signature)
First appearance of engineering vocabulary (e.g. HP, VP, orthographic projection, ground line — plus each module's own terms) is a dotted-underline accent button. On hover, keyboard focus, or tap it reveals a small accent-wash popover (`#e3ecf7`, ink text, `6px` radius, overlay shadow) defining the term in plain language; screen readers get it via `aria-describedby`. The popover is `position: fixed` so it escapes the card's scroll clip, flips above when there is no room below, and dismisses on Escape.

### Hint Callout
A persistent accent-wash box with a line info icon for guidance that helps when a step might confuse. Full background tint, never a colored side-stripe border.

### Viewport Aids
- **Geometry label:** a small paper pill in IBM Plex Mono, nudged outward off the linework so it never sits on top of it (vertex names, point/line labels, etc.).
- **Empty-state overlay:** a faint wireframe glyph with "Your drawing will appear here" (adapt the copy per module), shown until the first content is added, orienting the eye toward the panel. Quiet, no card, never blocks.
- **Orbit hint:** for 3D viewports, a one-time dismissible chip ("Drag to rotate the view") shown with the first content; it auto-dismisses on the first view drag.

## 6. Do's and Don'ts

### Do:
- **Do** keep the blue accent to ~10% of the chrome and let the viewport be the loud subject.
- **Do** keep blue in the chrome only; functional meaning in the viewport uses the domain encodings (e.g. HP teal `#007f7c`, VP amber `#bc5d1e`).
- **Do** pair every color signal with a second cue (dash, weight, label, icon, arrow, shape).
- **Do** read every color from a CSS custom property (`var(--color-...)`); JS and Three.js materials read the live token, never a hard-coded hex.
- **Do** convey depth with tonal layering (paper to panel to geometry-fill) and 1px hairlines.
- **Do** keep every interactive target at least 44px, with a visible accent focus halo.
- **Do** build type hierarchy from size and the 700 bold; set all numerics in IBM Plex Mono tabular.
- **Do** collapse all motion to instant under `prefers-reduced-motion`; the simulation still updates.

### Don't:
- **Don't** put blue linework inside the viewport, or let a functional encoding read as the chrome accent.
- **Don't** use gamified edtech devices: no mascots, confetti, badges, streaks, points, or cartoon geometry.
- **Don't** drift glossy or architectural-viz: no glassmorphism, PBR renders, soft consumer gradients, or drop-shadow-heavy cards.
- **Don't** reach for marketing-site polish: no gradient text, `background-clip: text`, hero imagery, or parallax.
- **Don't** default to dark IDE chrome or expose every control at once (the overwhelming dashboard the stepper replaces).
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe; use a full background tint or a leading icon.
- **Don't** cast a shadow on rendered geometry, or use a shadow anywhere except a transient floating overlay.
- **Don't** use `#000` or `#fff`, a 500/600 font weight, or color as the only signal.

---

# Additional Engineering Mechanics Encodings

These are additional functional encodings for Engineering Mechanics simulations.

They extend the shared Simatrix design system without replacing existing tokens.

## Mechanics Functional Colors

* Applied Force: #c0392b
* Reaction Force: #2e7d52
* Resultant Force: #546e7a
* Moment / Torque: #7b1fa2
* Construction Lines: #938b7b

## Mechanics Visual Rules

* Applied forces use solid arrows.
* Reaction forces use double-arrow heads.
* Construction/helper lines use dashed grey strokes.
* Resultant vectors use thicker line weight.
* Moments use curved directional arrows.
* Equilibrium state should include a secondary cue beyond color.

## Mechanics Accessibility Rules

Every force type must use:

* color
* arrow style
* label
* thickness variation

Color alone must never carry meaning.

## Mechanics Animation Rules

Animations must:

* demonstrate physical intuition
* remain educational
* avoid decorative motion
* support reduced-motion mode

---
*Shared core extracted from Module 2's `DESIGN.md`. Module-specific encodings and viewport behaviour belong in a per-module appendix, not in this file. Where this file and a module appendix conflict on a token or named rule, this file wins.*
