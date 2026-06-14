# CLAUDE.md — Simatrix Engineering Mechanics · Module 1

Three.js simulation platform that teaches Engineering Mechanics Module 1 concepts using guided interactive visualizations.

The simulation follows the Simatrix Guided Stepper architecture and focuses on:

* vectors
* force systems
* moments
* equilibrium
* support reactions

---

# UI Model

The simulation is a Guided Stepper.

The learner progresses through concepts step-by-step.

Only the controls required for the current step are visible.

The UI follows:

* progressive disclosure
* low cognitive load
* intuition-first teaching

---

# Design System Rules

All visual styling follows DESIGN.shared.md.

Never hard-code:

* colors
* spacing
* typography
* UI dimensions

All colors must use CSS variables.

---

# Scope Boundary

This module contains:

* index.html → UI shell
* main.js → renderer and simulation orchestrator
* intro.html → topic introduction
* meta.json → module metadata
* forceData.js → force/vector data
* vectorMath.js → vector calculations
* equilibrium.js → equilibrium logic
* beamLogic.js → support reaction calculations
* steps.js → guided learning sequence

---

# Architecture Rules

* No npm
* No webpack
* No build tools
* Use Three.js CDN ES modules only
* All imports must use .js extension
* All paths must be relative

---

# Simulation Types

The module contains:

1. Vector Resolution
2. Resultant Forces
3. Moment of Force
4. Couple System
5. Equilibrium
6. Beam Reactions

---

# Guided Stepper Flow

Example flow:

1. Introduce coordinate system
2. Add a force vector
3. Show vector components
4. Display resultant force
5. Introduce equilibrium
6. Apply forces on beams
7. Solve support reactions

Each step reveals only the required controls.

---

# Mathematical Rules

Vector components:

Fx = F cos(θ)
Fy = F sin(θ)

Resultant magnitude:

R = √((ΣFx)^2 + (ΣFy)^2)

Equilibrium conditions:

ΣFx = 0
ΣFy = 0
ΣM = 0

Moment of force:

M = F × d

All displayed values must:

* update live
* show units
* remain visible during interaction

---

# Scene Conventions

The 3D scene uses:

* X-axis → horizontal direction
* Y-axis → vertical direction
* Z-axis → depth

Vectors are represented using:

* arrows
* labels
* color coding
* live magnitude display

---

# Color Conventions

Read all colors from DESIGN.shared.md.

Suggested mappings:

* Applied force → red
* Resultant force → blue-grey
* Reaction force → green
* Moment arrow → purple
* Construction/helper lines → dashed grey

Blue accent is reserved ONLY for UI controls.

---

# Interaction Rules

Users can:

* drag vectors
* rotate forces
* change magnitudes
* apply loads to beams
* toggle components
* animate equilibrium

Every interaction must:

* update geometry instantly
* update equations instantly
* preserve educational clarity

---

# Animation Rules

Animations must:

* teach the concept
* never feel decorative
* support reduced motion

Examples:

* vector decomposition animation
* moment rotation visualization
* equilibrium stabilization
* beam reaction balancing

---

# Beam Simulation Rules

Support types:

* roller
* pin
* fixed

Loads:

* point load
* uniformly distributed load (UDL)

Reaction forces must update dynamically.

---

# Accessibility Rules

Color is never the only cue.

Every engineering meaning must also use:

* labels
* dashed/solid styles
* arrow direction
* line thickness

Keyboard interaction is mandatory.

---

# Common Simulation Goals

The learner should:

* understand forces visually
* connect formulas with motion
* build mechanics intuition
* solve textbook problems confidently

The simulation is a teaching instrument, not a sandbox toy.
