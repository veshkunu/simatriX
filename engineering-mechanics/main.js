import { initScene } from './sceneSetup.js';
import { resolve } from './vectorMath.js';
import { UIManager } from './uiManager.js';
import { STEPS } from './steps.js';

const canvas = document.getElementById('sim-canvas');
const {
  scene, camera, renderer,
  resize, update: sceneUpdate, tick,
  worldToScreen, setDragCallback, startComponentAnimation,
} = initScene(canvas);

const ui = new UIManager();

let stepIndex = 0;
let state     = resolve(100, 45);

function step() { return STEPS[stepIndex]; }

function refresh(triggerDecompAnim = false) {
  const s = step();
  ui.buildRail(stepIndex);
  ui.buildStepCard(s, state);

  if (triggerDecompAnim) startComponentAnimation();

  sceneUpdate(state, s.scene);
  ui.updateLabels(state, s.scene, worldToScreen);
  document.getElementById('empty-state').style.display = 'none';

  // Announce step to screen readers
  const counter = document.getElementById('step-counter');
  counter.setAttribute('aria-live', 'assertive');
  requestAnimationFrame(() => counter.setAttribute('aria-live', 'polite'));
}

// ─── Slider callbacks ──────────────────────────────────────────────────
ui.on('magnitudeChange', val => {
  state = resolve(val, state.angle);
  sceneUpdate(state, step().scene);
  ui.updateReadouts(state);
  ui.updateLabels(state, step().scene, worldToScreen);
});

ui.on('angleChange', val => {
  state = resolve(state.magnitude, val);
  sceneUpdate(state, step().scene);
  ui.updateReadouts(state);
  ui.updateLabels(state, step().scene, worldToScreen);
});

// ─── Drag callback (canvas → sliders → math) ──────────────────────────
setDragCallback((magnitude, angle) => {
  state = resolve(magnitude, angle);
  sceneUpdate(state, step().scene);
  ui.setSliderValues(magnitude, angle);
  ui.updateReadouts(state);
  ui.updateLabels(state, step().scene, worldToScreen);
});

// ─── Navigation ────────────────────────────────────────────────────────
document.getElementById('btn-next').addEventListener('click', () => {
  const hasComp = s => s.scene.has('components') || s.scene.has('fxOnly') || s.scene.has('fyOnly');
  const prevHasComp = hasComp(step());

  if (stepIndex < STEPS.length - 1) {
    stepIndex++;
  } else {
    stepIndex = 0;
    state = resolve(100, 45);
  }

  const shouldAnimate = hasComp(step()) && !prevHasComp;
  refresh(shouldAnimate);
});

document.getElementById('btn-back').addEventListener('click', () => {
  if (stepIndex > 0) { stepIndex--; refresh(); }
});

// ─── Keyboard navigation ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    document.getElementById('btn-next').click();
  } else if (e.key === 'ArrowLeft') {
    document.getElementById('btn-back').click();
  }
});

// ─── Resize ─────────────────────────────────────────────────────────────
const ro = new ResizeObserver(() => {
  resize();
  ui.updateLabels(state, step().scene, worldToScreen);
});
ro.observe(canvas.parentElement);

// ─── Render loop ───────────────────────────────────────────────────────
(function animate() {
  requestAnimationFrame(animate);
  tick();                              // advance decomposition animation if active
  renderer.render(scene, camera);
})();

// ─── Boot ──────────────────────────────────────────────────────────────
refresh();
