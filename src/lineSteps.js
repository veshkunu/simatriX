// lineSteps.js — pure data layer: the guided sequence (STEPS) + inline glossary
// (TERMS) for Projection of Straight Lines. Rendered by the stepper in lines.js.
// Same shape as the Points module's steps.js so the controller is reused verbatim.

import { LineCase } from './lineData.js';

const T = (k, label) => `<button class="term" data-t="${k}">${label}</button>`;

export const STEPS = [
  {
    id: 'intro',
    title: 'The two planes and the line',
    lead: 'A straight line is projected onto the same two planes you already know.',
    body: [
      `Every projection sits between the flat ${T('hp','Horizontal Plane')} and the upright ${T('vp','Vertical Plane')}, meeting at the ${T('xy','XY line')}.`,
      `We drop the two ends of the line onto each plane to get its <b>two views</b>. Where each view lands — and how long it looks — depends on how the line is tilted.`,
    ],
    set: {},
    controls: [],
    view: { showLine: false, showFV: false, showTV: false },
    orbitHint: true,
  },
  {
    id: 'parallel-both',
    title: 'Parallel to both HP and VP',
    lead: 'The simplest case — the line lies flat and square to both planes.',
    body: [
      `When a line is parallel to both planes, neither view is foreshortened. The ${T('fv','front view')} and the ${T('tv','top view')} are <b>both equal to the ${T('tl','true length')}</b>.`,
      `Both views also stay <b>parallel to the XY line</b>.`,
    ],
    hint: 'Drag the True Length slider — both views grow together and always match TL.',
    set: { case: LineCase.PARALLEL_BOTH },
    controls: ['tl', 'readout', 'fold', 'toggles', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'perp-vp',
    title: 'Perpendicular to VP',
    lead: 'Point the line straight into the vertical plane.',
    body: [
      `If the line is perpendicular to VP, every point of it projects to the <b>same spot</b> on VP — the ${T('fv','front view')} collapses to a <b>point</b>.`,
      `The ${T('tv','top view')} shows the full ${T('tl','true length')}, perpendicular to XY.`,
    ],
    set: { case: LineCase.PERP_VP },
    controls: ['tl', 'readout', 'fold', 'toggles', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'perp-hp',
    title: 'Perpendicular to HP',
    lead: 'Stand the line straight up off the horizontal plane.',
    body: [
      `A line perpendicular to HP projects to a single point on HP — now the ${T('tv','top view')} is the <b>point</b>.`,
      `The ${T('fv','front view')} stands vertical and shows the full ${T('tl','true length')}.`,
    ],
    set: { case: LineCase.PERP_HP },
    controls: ['tl', 'readout', 'fold', 'toggles', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'incl-hp',
    title: 'Inclined to HP, parallel to VP',
    lead: 'Tilt the line up by θ while keeping it parallel to VP.',
    body: [
      `Because the line stays parallel to VP, the ${T('fv','front view')} keeps its ${T('tl','true length')} and shows the <b>true inclination ${T('theta','θ')}</b> with XY.`,
      `The ${T('tv','top view')} is now <b>shorter than TL</b> (foreshortened) and stays parallel to XY.`,
    ],
    hint: 'Slide θ from 0° to 90°: the front view pivots at true angle; the top view shrinks to TL·cos θ.',
    set: { case: LineCase.INCL_HP },
    controls: ['tl', 'theta', 'readout', 'fold', 'toggles', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'incl-vp',
    title: 'Inclined to VP, parallel to HP',
    lead: 'Swing the line away from VP by φ while keeping it level.',
    body: [
      `Now the ${T('tv','top view')} keeps its ${T('tl','true length')} and shows the <b>true inclination ${T('phi','φ')}</b> with XY.`,
      `The ${T('fv','front view')} becomes <b>shorter than TL</b> and stays parallel to XY.`,
    ],
    hint: 'Slide φ: the top view holds true length and angle; the front view shortens to TL·cos φ.',
    set: { case: LineCase.INCL_VP },
    controls: ['tl', 'phi', 'readout', 'fold', 'toggles', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'incl-both',
    title: 'Inclined to both HP and VP',
    lead: 'The general case — tilted away from both planes at once.',
    body: [
      `With both ${T('theta','θ')} and ${T('phi','φ')} non-zero, <b>both</b> views are shorter than the ${T('tl','true length')}.`,
      `The angles you can measure in the drawing are the <b>apparent</b> inclinations ${T('alpha','α')} and ${T('beta','β')} — and they are always <b>larger</b> than the true angles: α > θ and β > φ.`,
    ],
    hint: 'A line is valid only while θ + φ ≤ 90°. Watch α and β stay above θ and φ as you tilt.',
    set: { case: LineCase.INCL_BOTH },
    controls: ['tl', 'theta', 'phi', 'readout', 'fold', 'toggles', 'traces', 'truelength'],
    view: { showLine: true, showFV: true, showTV: true },
  },
];

export const STEP_COUNT = STEPS.length;

export const TERMS = {
  hp:   { label: 'Horizontal Plane (HP)', def: 'The flat teal reference plane (the floor). The top view is projected onto it.' },
  vp:   { label: 'Vertical Plane (VP)',   def: 'The upright amber reference plane (the wall). The front view is projected onto it.' },
  xy:   { label: 'XY line',               def: 'The reference (ground) line where HP and VP meet. Every view is measured from it.' },
  tl:   { label: 'True Length (TL)',      def: 'The real, unforeshortened length of the line in space.' },
  fv:   { label: 'Front View (Elevation)',def: "The line's projection onto VP — what you see looking horizontally at the wall." },
  tv:   { label: 'Top View (Plan)',       def: "The line's projection onto HP — what you see looking straight down at the floor." },
  theta:{ label: 'θ — true inclination with HP', def: 'The real angle the line makes with the Horizontal Plane.' },
  phi:  { label: 'φ — true inclination with VP', def: 'The real angle the line makes with the Vertical Plane.' },
  alpha:{ label: 'α — apparent angle of FV', def: 'The angle the front view makes with XY in the drawing. Always ≥ θ.' },
  beta: { label: 'β — apparent angle of TV', def: 'The angle the top view makes with XY in the drawing. Always ≥ φ.' },
  projector: { label: 'Projector', def: 'A thin construction line dropped perpendicular from a point in space to a plane.' },
  trace:{ label: 'Trace', def: 'The point where a line — or its extension — meets a reference plane.' },
  ht:   { label: 'Horizontal Trace (HT)', def: 'Where the line (or its extension) meets HP. Found by extending the front view to XY at h, then projecting down to the top view.' },
  vt:   { label: 'Vertical Trace (VT)', def: 'Where the line (or its extension) meets VP. Found by extending the top view to XY at v, then projecting up to the front view.' },
  locus:{ label: 'Locus', def: 'The path traced by a point as the line is rotated — here, the horizontal line a rotated endpoint must stay on.' },
};
