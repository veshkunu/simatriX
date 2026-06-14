import { STEPS, TOTAL_STEPS } from './steps.js';
import { FORCE_SCALE } from './sceneSetup.js';

export class UIManager {
  constructor() {
    this._stepCounter   = document.getElementById('step-counter');
    this._stepTitle     = document.getElementById('step-title');
    this._stepLead      = document.getElementById('step-lead');
    this._stepHint      = document.getElementById('step-hint');
    this._stepGuide     = document.getElementById('step-guidance');
    this._controls      = document.getElementById('controls-area');
    this._equations     = document.getElementById('equations-area');
    this._btnBack       = document.getElementById('btn-back');
    this._btnNext       = document.getElementById('btn-next');
    this._rail          = document.querySelector('.step-rail');
    this._conceptPanel  = document.getElementById('concept-panel');
    this._insightEl     = document.getElementById('concept-insight');
    this._realWorldEl   = document.getElementById('realworld-callout');
    this._conceptCheckEl = document.getElementById('concept-check');
    this._currentStep   = null;
    this._on            = {};
  }

  on(event, fn) { this._on[event] = fn; }

  // ─── Step rail ───────────────────────────────────────────────────────
  buildRail(currentIndex) {
    const heading = '<div class="rail-heading" aria-hidden="true">Step Progress</div>';
    const markers = STEPS.map((step, i) => {
      const s = i < currentIndex ? 'complete' : i === currentIndex ? 'current' : 'upcoming';
      const dotContent = s === 'complete'
        ? `<svg aria-hidden="true" viewBox="0 0 14 14"><polyline points="2,7.5 5.5,11 12,3.5" stroke="currentColor" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : step.id;
      return `<div class="rail-marker rail-marker--${s}" role="listitem" aria-label="Step ${step.id}${s === 'complete' ? ', completed' : s === 'current' ? ', current' : ''}">
        <div class="rail-dot">${dotContent}</div>
        <span class="rail-label">${step.title}</span>
      </div>`;
    }).join('');
    this._rail.innerHTML = heading + markers;
  }

  // ─── Step card ───────────────────────────────────────────────────────
  buildStepCard(step, state) {
    this._currentStep = step;

    this._stepCounter.textContent = `Step ${step.id} of ${TOTAL_STEPS}`;
    this._stepTitle.textContent   = step.title;
    this._stepLead.textContent    = step.lead;

    // Hint callout
    this._stepHint.textContent   = step.hint || '';
    this._stepHint.style.display = step.hint ? '' : 'none';

    // "What You Are Seeing" panel
    if (this._conceptPanel) {
      if (step.whatYouSee) {
        this._conceptPanel.innerHTML = `
          <div class="concept-panel-title label">What You Are Seeing</div>
          <p>${step.whatYouSee}</p>`;
        this._conceptPanel.style.display = '';
      } else {
        this._conceptPanel.style.display = 'none';
        this._conceptPanel.innerHTML = '';
      }
    }

    // Guidance callout
    if (this._stepGuide) {
      this._stepGuide.textContent    = step.guidance || '';
      this._stepGuide.style.display  = step.guidance ? '' : 'none';
    }

    // Controls
    this._controls.innerHTML = '';
    step.controls.forEach(id => {
      if (id === 'magnitude') {
        this._controls.appendChild(this._makeSlider({
          id: 'ctrl-mag', label: 'Magnitude F', unit: 'N',
          min: 10, max: 200, step: 1, value: state.magnitude,
          onChange: v => this._on.magnitudeChange?.(v),
        }));
      }
      if (id === 'angle') {
        this._controls.appendChild(this._makeSlider({
          id: 'ctrl-ang', label: 'Angle θ', unit: '°',
          min: 0, max: 360, step: 1, value: state.angle,
          onChange: v => this._on.angleChange?.(v),
        }));
      }
    });

    // Concept insight (Step 5 only)
    if (this._insightEl) {
      if (step.insight) {
        this._insightEl.style.display = '';
        this._updateInsight(state.angle);
      } else {
        this._insightEl.style.display = 'none';
      }
    }

    // Equations
    this._equations.innerHTML = '';
    if (step.showEquations) {
      this._equations.appendChild(this._makeEquations(state));
    }

    // Real-world callout
    if (this._realWorldEl) {
      if (step.realWorld) {
        this._realWorldEl.innerHTML = `
          <div class="realworld-title label">Real-World Example</div>
          <p>${step.realWorld}</p>`;
        this._realWorldEl.style.display = '';
      } else {
        this._realWorldEl.style.display = 'none';
        this._realWorldEl.innerHTML = '';
      }
    }

    // Concept-check question
    if (this._conceptCheckEl) {
      if (step.conceptCheck) {
        this._buildConceptCheck(step.conceptCheck);
        this._conceptCheckEl.style.display = '';
      } else {
        this._conceptCheckEl.style.display = 'none';
        this._conceptCheckEl.innerHTML = '';
      }
    }

    // Nav buttons
    this._btnBack.disabled         = step.id === 1;
    this._btnBack.style.visibility = step.id === 1 ? 'hidden' : 'visible';
    this._btnNext.textContent      = step.id === TOTAL_STEPS ? 'Start over' : 'Next →';
  }

  // ─── Live readouts ────────────────────────────────────────────────────
  updateReadouts(state) {
    const magR = document.querySelector('[data-readout="ctrl-mag"]');
    if (magR) magR.textContent = `${Math.round(state.magnitude)} N`;

    const angR = document.querySelector('[data-readout="ctrl-ang"]');
    if (angR) angR.textContent = `${Math.round(state.angle)}°`;

    if (this._equations.children.length) this._updateEquations(state);

    if (this._currentStep?.insight) this._updateInsight(state.angle);
  }

  // Sync slider positions after a drag interaction
  setSliderValues(magnitude, angle) {
    const mi = document.getElementById('ctrl-mag');
    if (mi) {
      mi.value = magnitude;
      const mr = document.querySelector('[data-readout="ctrl-mag"]');
      if (mr) mr.textContent = `${Math.round(magnitude)} N`;
    }
    const ai = document.getElementById('ctrl-ang');
    if (ai) {
      ai.value = angle;
      const ar = document.querySelector('[data-readout="ctrl-ang"]');
      if (ar) ar.textContent = `${Math.round(angle)}°`;
    }
  }

  // ─── HTML labels over the canvas ─────────────────────────────────────
  updateLabels(state, visSet, worldToScreen) {
    const show = (id, pos, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = '';
      el.style.left    = pos.x + 'px';
      el.style.top     = pos.y + 'px';
      if (text !== undefined) el.textContent = text;
    };
    const hide = id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    };

    // Axis + origin labels
    if (visSet.has('axes')) {
      show('label-x',      worldToScreen(3.9,  -0.32), 'X');
      show('label-y',      worldToScreen(0.28,  3.75), 'Y');
      show('label-origin', worldToScreen(-0.32, -0.30), 'O');
    } else {
      hide('label-x'); hide('label-y'); hide('label-origin');
    }

    const { magnitude, angle, fx, fy } = state;
    const sfx = fx * FORCE_SCALE;
    const sfy = fy * FORCE_SCALE;
    const rad = (angle * Math.PI) / 180;

    // Force label
    if (visSet.has('forceLabel') && magnitude > 0.5) {
      const offset = 0.30;
      show('label-force',
        worldToScreen(sfx + offset * Math.cos(rad), sfy + offset * Math.sin(rad)),
        `F = ${Math.round(magnitude)} N`
      );
    } else {
      hide('label-force');
    }

    // Angle label
    const normAngle = ((angle % 360) + 360) % 360;
    if (visSet.has('angleLabel') && magnitude > 0.5 && normAngle > 2 && normAngle < 358) {
      const midRad = (angle / 2) * Math.PI / 180;
      show('label-theta', worldToScreen(1.0 * Math.cos(midRad), 1.0 * Math.sin(midRad)), 'θ');
    } else {
      hide('label-theta');
    }

    // Component labels — three exclusive cases
    if (visSet.has('fxOnly') && magnitude > 0.5) {
      if (Math.abs(sfx) > 0.05) {
        const yOff = sfy >= 0 ? -0.32 : 0.32;
        show('label-fx', worldToScreen(sfx / 2, yOff), `Fx = ${Math.round(fx)} N`);
      } else { hide('label-fx'); }
      hide('label-fy');
    } else if (visSet.has('fyOnly') && magnitude > 0.5) {
      hide('label-fx');
      if (Math.abs(sfy) > 0.05) {
        const xOff = sfx >= 0 ? 0.48 : -0.48;
        show('label-fy', worldToScreen(xOff, sfy / 2), `Fy = ${Math.round(fy)} N`);
      } else { hide('label-fy'); }
    } else if (visSet.has('components') && magnitude > 0.5) {
      if (Math.abs(sfx) > 0.05) {
        const yOff = sfy >= 0 ? -0.30 : 0.30;
        show('label-fx', worldToScreen(sfx / 2, yOff), `Fx = ${Math.round(fx)} N`);
      } else { hide('label-fx'); }
      if (Math.abs(sfy) > 0.05) {
        const xOff = sfx >= 0 ? 0.45 : -0.45;
        show('label-fy', worldToScreen(sfx + xOff, sfy / 2), `Fy = ${Math.round(fy)} N`);
      } else { hide('label-fy'); }
    } else {
      hide('label-fx'); hide('label-fy');
    }
  }

  // ─── Private: concept-check builder ──────────────────────────────────
  _buildConceptCheck(check) {
    const optionsHtml = check.options.map(opt =>
      `<button class="cc-option" data-correct="${opt.correct}">${opt.text}</button>`
    ).join('');

    this._conceptCheckEl.innerHTML = `
      <div class="cc-title label">Quick Check</div>
      <p class="cc-question">${check.question}</p>
      <div class="cc-options">${optionsHtml}</div>
      <div class="cc-feedback" style="display:none">${check.explanation}</div>`;

    this._conceptCheckEl.querySelectorAll('.cc-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const isCorrect = btn.dataset.correct === 'true';
        const feedback  = this._conceptCheckEl.querySelector('.cc-feedback');
        this._conceptCheckEl.querySelectorAll('.cc-option').forEach(b => { b.disabled = true; });
        btn.classList.add(isCorrect ? 'cc-option--correct' : 'cc-option--wrong');
        if (!isCorrect) {
          this._conceptCheckEl.querySelector('.cc-option[data-correct="true"]')
            ?.classList.add('cc-option--correct');
        }
        feedback.style.display = '';
      });
    });
  }

  // ─── Private: dynamic insight (Step 5) ───────────────────────────────
  _updateInsight(angle) {
    if (!this._insightEl) return;
    const textEl = this._insightEl.querySelector('[data-insight-text]');
    if (!textEl) return;

    const norm = ((angle % 360) + 360) % 360;
    let text;

    if (norm < 3 || norm > 357) {
      text = 'At θ ≈ 0°: all force acts horizontally. Fy is zero — the force has no vertical effect.';
    } else if (norm > 87 && norm < 93) {
      text = 'At θ = 90°: all force acts vertically. Fx is zero — the force has no horizontal effect.';
    } else if (norm > 43 && norm < 47) {
      text = 'At θ = 45°: Fx equals Fy — the force splits equally between horizontal and vertical.';
    } else if (norm > 3 && norm < 45) {
      text = `At θ = ${Math.round(norm)}°: the force is mostly horizontal. Fx is larger than Fy.`;
    } else if (norm > 45 && norm < 87) {
      text = `At θ = ${Math.round(norm)}°: the force is mostly vertical. Fy is larger than Fx.`;
    } else if (norm >= 93 && norm < 180) {
      text = `At θ = ${Math.round(norm)}°: Fx is negative — the force has a leftward horizontal component.`;
    } else if (norm >= 180 && norm < 270) {
      text = `At θ = ${Math.round(norm)}°: both components are negative — force acts into the third quadrant.`;
    } else {
      text = `At θ = ${Math.round(norm)}°: continue exploring to see how angle controls the balance between Fx and Fy.`;
    }

    textEl.textContent = text;
  }

  // ─── Private: slider builder ──────────────────────────────────────────
  _makeSlider({ id, label, unit, min, max, step, value, onChange }) {
    const row = document.createElement('div');
    row.className = 'control-row';
    row.innerHTML = `
      <label class="control-label" for="${id}">${label}</label>
      <div class="slider-row">
        <input type="range" id="${id}" class="slider"
               min="${min}" max="${max}" step="${step}" value="${value}"
               aria-label="${label} in ${unit}">
        <span class="slider-readout" data-readout="${id}">${Math.round(value)} ${unit}</span>
      </div>`;

    const input   = row.querySelector('input');
    const readout = row.querySelector('.slider-readout');
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      readout.textContent = `${Math.round(v)} ${unit}`;
      onChange(v);
    });
    input.addEventListener('keydown', e => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 0.5 : -0.5;
      const v = Math.min(max, Math.max(min, parseFloat(input.value) + delta));
      input.value = v;
      readout.textContent = `${v.toFixed(1)} ${unit}`;
      onChange(v);
    });
    return row;
  }

  // ─── Private: equation panel builder ─────────────────────────────────
  _makeEquations(state) {
    const div = document.createElement('div');
    div.className = 'equations-panel';
    div.setAttribute('aria-live', 'polite');
    div.setAttribute('aria-label', 'Resolution equations — values update as you move the sliders');
    div.innerHTML = `
      <div class="eq-title label">Resolution Equations</div>
      <div class="eq-grid">
        <span class="eq-lhs">F</span>
        <span class="eq-op">=</span>
        <span class="eq-val" data-eq="mag">${Math.round(state.magnitude)}</span>
        <span class="eq-unit">N</span>

        <span class="eq-lhs">θ</span>
        <span class="eq-op">=</span>
        <span class="eq-val" data-eq="ang">${Math.round(state.angle)}</span>
        <span class="eq-unit">°</span>

        <span class="eq-lhs">Fx = F cos θ</span>
        <span class="eq-op">=</span>
        <span class="eq-val" data-eq="fx">${Math.round(state.fx)}</span>
        <span class="eq-unit">N</span>

        <span class="eq-lhs">Fy = F sin θ</span>
        <span class="eq-op">=</span>
        <span class="eq-val" data-eq="fy">${Math.round(state.fy)}</span>
        <span class="eq-unit">N</span>
      </div>`;
    return div;
  }

  _updateEquations(state) {
    const set = (key, val) => {
      const el = this._equations.querySelector(`[data-eq="${key}"]`);
      if (el) el.textContent = Math.round(val);
    };
    set('mag', state.magnitude);
    set('ang', state.angle);
    set('fx',  state.fx);
    set('fy',  state.fy);
  }
}
