// steps.js — Pure data layer for the Guided Stepper (no Three.js, no DOM nodes).
// Defines the teaching sequence and the inline term glossary. main.js renders
// these into the step card and wires the term popovers. Body/hint copy is authored
// HTML (trusted, no user input) so it can embed <button class="term"> definitions.
//
// Each step declares:
//   id        — stable key
//   title     — the tutor's headline for this idea (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout shown when a step might confuse
//   controls  — which parameter controls are revealed this step (progressive disclosure)
//               keys: 'hp' | 'vp' | 'pp' | 'quad' | 'anim'
//   view      — what the 3D/2D viewport renders this step (booleans default false)
//               keys: showPoint, showHP, showVP, showCoord, showQuad
//   orbitHint — show the one-time "drag to rotate" chip on this step

/** Term glossary. Keys match data-t="…" on term buttons in the copy. */
export const TERMS = Object.freeze({
  hp: {
    label: 'HP',
    def: 'Horizontal Plane — the flat reference plane you picture lying down like a tabletop. A point’s top view lands on it.',
  },
  vp: {
    label: 'VP',
    def: 'Vertical Plane — the upright reference plane standing up like a wall behind the object. A point’s front view lands on it.',
  },
  foldline: {
    label: 'fold line',
    def: 'The fold line (XY) — the edge where HP and VP meet. Once HP is folded down flat, every height and depth is measured from this line.',
  },
  projection: {
    label: 'projection',
    def: 'Projection — dropping a point straight onto a plane along a perpendicular, like the shadow it would cast directly onto that plane.',
  },
  projector: {
    label: 'projector',
    def: 'Projector — the thin perpendicular line from the point to a plane. It always meets the plane at 90°.',
  },
  topview: {
    label: 'top view',
    def: 'Top view (p) — what you see looking straight down from above. It lands on HP and is written with a lower-case letter, p.',
  },
  frontview: {
    label: 'front view',
    def: 'Front view (p′) — what you see looking straight from the front. It lands on VP and is written p-prime, p′.',
  },
  quadrant: {
    label: 'quadrant',
    def: 'Quadrant — one of the four “rooms” that HP and VP divide space into. A point’s quadrant decides whether its views sit above or below the XY line.',
  },
  dihedral: {
    label: 'dihedral angle',
    def: 'Dihedral angle — the angle between two intersecting planes. HP and VP form four of them; we call those four the quadrants.',
  },
  firstangle: {
    label: 'first-angle projection',
    def: 'First-angle projection — the Indian / European convention (SP 46:2003) where the object sits between you and the plane, so the top view ends up below the XY line.',
  },
  pp: {
    label: 'Profile Plane',
    def: 'Profile Plane (PP) — a third plane on the side, at right angles to both HP and VP. Distance from it fixes the point’s side-to-side position.',
  },
});

/** The guided sequence, in order. */
export const STEPS = Object.freeze([
  {
    id: 'planes',
    title: 'The two reference planes',
    lead: 'Every projection begins with two imaginary planes that meet at a right angle.',
    body: [
      'Look at the 3D scene. The flat teal plane lying down is the <button type="button" class="term" data-t="hp">Horizontal Plane</button>. The upright amber plane standing behind it is the <button type="button" class="term" data-t="vp">Vertical Plane</button>.',
      'Where they meet is the <button type="button" class="term" data-t="foldline">fold line</button> — the single line we measure everything from. That’s all the apparatus we need.',
    ],
    hint: 'No numbers yet — just get oriented. Teal is always HP, amber is always VP. That colour pairing never changes across the whole module.',
    controls: [],
    view: {},
    orbitHint: true,
  },
  {
    id: 'above-hp',
    title: 'Lift the point above HP',
    lead: 'A point in space is located by its perpendicular distances from the planes. Start with its height.',
    body: [
      'Drag the slider to raise point <b>P</b> above the <button type="button" class="term" data-t="hp">HP</button>. The thin teal line dropping straight down is its <button type="button" class="term" data-t="projector">projector</button> — always perpendicular to the plane.',
      'Where that projector meets HP is the <button type="button" class="term" data-t="topview">top view</button>, written <b>p</b>. This is the <button type="button" class="term" data-t="projection">projection</button> of P onto HP.',
    ],
    hint: 'Watch the small teal cross (p) on HP. It is the shadow P would cast looking straight down.',
    controls: ['hp'],
    view: { showPoint: true, showHP: true },
  },
  {
    id: 'front-vp',
    title: 'Move the point in front of VP',
    lead: 'Now fix how far the point sits in front of the vertical plane.',
    body: [
      'Drag the new slider to push <b>P</b> forward, away from the <button type="button" class="term" data-t="vp">VP</button>. A second projector — amber, dashed — reaches horizontally back to the plane.',
      'Where it lands is the <button type="button" class="term" data-t="frontview">front view</button>, written <b>p′</b>. The point now has both a top view and a front view, so its position is fully fixed.',
    ],
    hint: 'Two cues tell the views apart: HP / top view is teal and solid; VP / front view is amber and dashed. Colour is never the only signal.',
    controls: ['hp', 'vp'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true },
  },
  {
    id: 'unfold',
    title: 'Unfold the planes into a drawing',
    lead: 'A drawing is flat. To draw both views on one sheet, we fold HP down onto VP.',
    body: [
      'Press <b>Animate Unfolding</b>. HP swings 90° about the <button type="button" class="term" data-t="foldline">fold line</button> until it lies in the same flat plane as VP — exactly what your paper does.',
      'After the fold, <b>p′</b> sits above the XY line and <b>p</b> below it. That stacked layout is <button type="button" class="term" data-t="firstangle">first-angle projection</button>. Toggle the 2D Drawing view to see the finished result.',
    ],
    hint: 'The projector from P to HP does not rotate — it marks a fixed perpendicular distance, no matter how the plane is folded.',
    controls: ['hp', 'vp', 'anim'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true },
  },
  {
    id: 'quadrants',
    title: 'Explore the four quadrants',
    lead: 'HP and VP carve space into four regions. Where the point lives changes where its views land.',
    body: [
      'Switch the <button type="button" class="term" data-t="quadrant">quadrant</button>. Each is one of the four <button type="button" class="term" data-t="dihedral">dihedral angles</button> between the planes.',
      'Watch the 2D drawing: in Quadrant I, p′ is above XY and p below. As you move through II, III, IV the views cross the line. The first quadrant is the one used in practice.',
    ],
    hint: 'Keep an eye on the highlighted row in the quadrant table — it always names where P is: above or below HP, in front of or behind VP.',
    controls: ['quad', 'hp', 'vp', 'anim'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true, showQuad: true },
  },
  {
    id: 'solve',
    title: 'Set up and solve a problem',
    lead: 'You now have every control. Reproduce a textbook problem and check your own drawing against it.',
    body: [
      'All distances are open, including distance from the <button type="button" class="term" data-t="pp">Profile Plane</button> for a third dimension. Type exact values into any field for precise entry.',
      'Read the coordinate label on P and the dimensioned distances on the 2D drawing to verify your hand-drawn answer.',
    ],
    hint: 'Try it: 30 above HP, 45 in front of VP, Quadrant I. Confirm p′ sits 30 above XY and p sits 45 below it.',
    controls: ['quad', 'hp', 'vp', 'pp', 'anim'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true, showQuad: true },
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
