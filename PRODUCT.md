# Product

## Register

product

> **Scope note.** This document describes the **platform-wide design language for all Simatrix simulations** (Engineering Graphics, Mechanical, Civil, Electrical & Electronics, Computer Science). It lives at `Module2/PRODUCT.md` for now because that is the only repo currently in flight; it should move to a shared Simatrix root once that exists. Each per-module repo should reference this file rather than duplicate it.
>
> **Direction.** Simatrix sims are **Guided Steppers**, not free Live Sandboxes. This is the platform direction for every module; Module 2 (orthographic projection) is the first build to adopt it. A sim walks the learner through a concept one step at a time, revealing controls progressively as each idea lands, rather than presenting every parameter at once and hoping the student finds their own path.
>
> **What this design system covers — and what it doesn't.** Each Simatrix sim is a self-contained Three.js payload that ships as a sandboxed iframe embedded inside a host Simatrix website built by separate web developers. This design system governs only the **inside of that iframe**: the 3D viewport, the step rail, the parameter dock, sliders, toggles, numeric inputs, inline hints, term definitions, sim-internal buttons, and the animations / interactions of the simulation itself. The host website's top-level navbar, module browser, account UI, login flows, marketing pages, footer, and platform-wide chrome are **out of scope** and built separately. Conceptually, each sim is a teaching aid embedded in someone else's page — a guided 3D explainer, not a web app. PRODUCT.md and DESIGN.md describe the explainer; the host website has its own design contract that lives elsewhere.

## Users

**Primary persona — and the person every decision is optimized for: the struggling first-year** who finds orthographic projection abstract and intimidating. They may never have seen a technical drawing, have no CAD or MATLAB exposure, and quietly assume they are "bad at this." If a choice helps the confident student but risks losing this learner, the weaker learner wins. Stronger students are still well served by a clear guided path; they are never served at the expense of the struggling one.

This persona is used across three contexts that share one interface language:

- **Self-study.** Student alone on a personal laptop, no instructor present, often anxious. The dominant context. The sim must teach without a teacher: each step states what to do and why, defines vocabulary inline the first time it appears, and never advances faster than the idea.
- **Classroom.** Instructor demonstrates on a projector or shared screen. The current step, its controls, and the viewport must be readable from the back row. The sim defaults to a meaningful first step, not a blank canvas.
- **Assessment / homework.** Student reproducing textbook problems. Even inside a guided flow, the sim must support precise numeric parameter entry, hold state during a task, and reset cleanly without losing intent.

The interface must not assume prior tool fluency, but should make that fluency feel earned by the time the student meets professional software (AutoCAD, MATLAB, LTspice, LabVIEW) in senior courses or industry.

## Product Purpose

Simatrix is a platform of interactive simulations that help B.Tech students build intuition for engineering concepts and practice solving textbook problems, across multiple disciplines. Each simulation ships as a sandboxed iframe payload running inside the Simatrix host, and teaches as a **Guided Stepper**: a progressive-disclosure wizard that sequences one concept at a time.

Every sim must move the learner through the same arc, in order:

1. **Orient.** Start at a single, meaningful first step with one thing to look at. No wall of controls. The student always knows where they are and what this step is teaching.
2. **Intuition, step by step.** Each step reveals exactly the control(s) it needs, ties them to a live numeric value, and shows the model respond, so the mental model is built one verified idea at a time rather than discovered by trial and error.
3. **Problem-solving.** By the final steps, the student can set up a textbook/exam-style problem precisely enough that the sim becomes a verification tool, not just a toy.

Success looks like a struggling first-year opening the sim, understanding the first step within 30 seconds, completing the guided sequence without getting lost or feeling stupid, and finishing able to set up a textbook problem and verify their hand-calculation against the sim.

## Brand Personality

Three words: **patient, encouraging, clear.**

Voice: a warm one-on-one tutor sitting beside the student. Never rushes, never patronizes, never assumes the student should already know. Explains the *why* before the *how*. Labels stay exact (`angle ∠HP = 45°`, not "tilt it"), but the surrounding copy is plain-spoken and reassuring ("Good — the slant face is now parallel to HP"). Hints arrive exactly when a step might confuse and step out of the way once understood.

Encouragement is delivered through **tone and a quiet sense of progress only** — supportive microcopy and a calm step-progress indicator. It is never delivered through game mechanics. No points, no streaks, no badges, no confetti, no mascots. The student should feel privately capable, not rewarded by a machine.

Emotional goal: a student who arrived anxious leaves feeling the concept is learnable and that they, specifically, learned it. They should sense they are using *real* engineering software with the intimidation removed, quietly preparing them to recognize professional tools later. The aesthetic must never undercut the seriousness of the underlying math by drifting into children's-toy or marketing-site territory.

Reference lane: **best-in-class educational sims** — GeoGebra, Desmos, Wokwi, Falstad's circuit simulator, Tinkercad. Borrow from them: live-updating values tied to geometry, generous click targets, labels on things, parameter sliders with visible numeric values, undo-friendly defaults. Add to them the guided, one-step-at-a-time scaffolding those tools leave to the teacher. Industry tools (MATLAB, AutoCAD, LTspice) are aspirational endpoints — recognizable in our vocabulary and layout patterns, not in our chrome.

## Anti-references

Lock these out across every sim. These set the boundary for visual, interaction, and copy decisions on every screen.

- **Gamified EdTech** — Duolingo-style mascots, confetti animations, badges, streaks, points, character illustrations, cartoon-styled geometry. Engineering does not need bribes to be interesting. Encouragement lives in tone and a quiet progress indicator, never in game mechanics. (This boundary holds even though the personality is now warmer: warmth is voice, not reward systems.)
- **Glossy / architectural-viz aesthetic** — Lumion-style PBR renders, glassmorphism, soft consumer-app gradients, drop-shadow-heavy "card" UI, ambient occlusion baked into hero shots. Engineering drawings are flat ink-on-surface; the sims must respect that convention.
- **Marketing-site polish** — hero gradient text, oversized lifestyle imagery, parallax scroll, "look how modern we are" type treatments. The sim is the product, not its presentation layer.
- **Hard industry-tool mimicry** — dark IDE chrome by default, undocumented icon-only toolbars, dense panels with no labels, MATLAB-1998 visual density. Real tools look this way because of legacy, not because students benefit.
- **Overwhelming dashboard** — every slider, toggle, and readout exposed at once. This is exactly what the Guided Stepper replaces. Density without sequence intimidates the struggling learner; controls appear when their step needs them.

## Design Principles

Seven strategic principles. They override taste in conflicts and apply uniformly across Engineering Graphics, Mechanical, Civil, EEE, and CS sims.

1. **Design for the struggling learner first.** When a decision helps the confident student but risks losing the anxious first-year, the weaker learner wins. This is the tie-breaker that resolves every other conflict.

2. **One idea per step (progressive disclosure).** Reveal only the controls and information the current step needs. The learner is never asked to choose from a field of options they do not yet understand. Complexity unfolds as comprehension grows; nothing appears before it is needed.

3. **One language, many disciplines.** A control labeled the same way means the same thing in every sim. A slider in an orthographic-projection sim behaves the same as a slider in an RC-circuit sim, and a step rail works identically across modules. Students should move between Module 1 and Module 20 without re-learning the chrome. Shared tokens, shared component vocabulary, shared interaction patterns.

4. **Show real values, not vibes.** Every parameter the math depends on is visible as a number, in its real units (degrees, millimetres, volts, newtons). No "drag until it feels right" without a numeric readout. This is the single biggest separator between educational toys and engineering tools — and it matters more, not less, for a guided flow.

5. **Educational scaffolding, industry vocabulary.** Use the words the textbook uses — apothem, slant height, KVL, second moment of area — not consumer rewrites. Provide an inline explanation the first time a term appears, but never replace the term itself. For the struggling learner this inline definition is essential, not optional. The goal is fluency with the real vocabulary, not avoidance of it.

6. **Inclusive by default.** Every color-coded element carries a second non-color cue (dash pattern, line weight, label, icon, arrow direction). Animations respect reduced-motion preferences. All controls reachable by keyboard with visible focus. Screen readers narrate parameter changes and step transitions. Non-negotiable across the platform, not a per-sim decision.

7. **Quiet chrome, loud subject.** Every UI pixel that is not the simulation viewport stays quiet enough that the math, geometry, circuit, or structure is what the eye lands on. Restrained color, minimal decoration, no surface that competes with sim content. The guidance directs attention; it does not become the spectacle. The sim is the lesson; the UI is the instrument that exposes it.

## Accessibility & Inclusion

Accessibility is a defining goal of this product, not a compliance afterthought — the primary persona is precisely the learner most failed by inaccessible tools.

**Target: WCAG 2.2 AA across all Simatrix sims**, with these specific commitments:

- **Color is never the only signal.** HP vs VP projection lines, AC vs DC waveforms, tension vs compression in a truss, current direction in a circuit — every domain-specific color encoding also uses a second cue (dash style, weight, arrow direction, label).
- **Contrast.** Body text and meaningful linework meet WCAG AA against their immediate surface. Verified on the warm-paper surface and against a dim-projector scenario, not just a bright laptop screen.
- **Keyboard.** Every control reachable by keyboard with a visible focus ring. Tab order matches visual reading order and the step sequence. Sliders respond to arrow keys with sensible step sizes (e.g. 1° for angle sliders, Shift+arrow for finer steps). Step navigation (Next / Back) is keyboard-operable.
- **Reduced motion.** `prefers-reduced-motion: reduce` is respected. Step transitions, projection-line draw-on, camera-orbit easing, and any decorative animation collapse to instant state changes. The educational simulation itself still updates — only the motion is suppressed.
- **Screen readers.** Controls carry ARIA labels and `aria-valuetext` that read parameter names and current values aloud. A live region announces step changes and mode changes ("Step 3 of 6. Face inclination HP enabled. Manual Y rotation disabled."). The 3D viewport is acknowledged as non-narratable but is never the only path to understanding — every value driving it, and every step instruction, is surfaced as readable text.
- **Legibility-first typography.** The body typeface is chosen for maximum legibility (disambiguated letterforms), supporting low-vision learners and reducing reading load for anyone anxious or unfamiliar with the vocabulary.
- **Known accommodations.** ~8% color-blind male students, classroom-projector users in the back row, keyboard-only laptop users, motion-sensitive users, low-vision and reading-fatigued learners. All are first-class, all the time.
