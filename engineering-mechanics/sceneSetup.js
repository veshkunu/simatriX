import * as THREE from 'three';

export const FORCE_SCALE = 0.02; // scene units per Newton (100 N → 2 units)
const VIEW_H = 3.5;

// Read once at startup; respects user OS setting
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

export function initScene(canvas) {
  // ─── Renderer + camera ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const a = w / h;
    camera.left   = -VIEW_H * a;
    camera.right  =  VIEW_H * a;
    camera.top    =  VIEW_H;
    camera.bottom = -VIEW_H;
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(cssVar('--color-paper'));
  }
  resize();

  // ─── Static objects ────────────────────────────────────────────────────
  const staticGroups = {};

  function makeGrid() {
    const pts = [];
    const R = 9;
    for (let i = -R; i <= R; i++) {
      pts.push(new THREE.Vector3(i, -R, 0), new THREE.Vector3(i,  R, 0));
      pts.push(new THREE.Vector3(-R, i, 0), new THREE.Vector3( R, i, 0));
    }
    return new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(cssVar('--color-border')),
        transparent: true, opacity: 0.38,
      })
    );
  }

  function makeAxes() {
    const g = new THREE.Group();
    // Use ink-secondary — darker than bench-grey, better contrast on paper
    const col = new THREE.Color(cssVar('--color-ink-secondary'));
    const L = 7.8;
    const hLen = 0.24, hWid = 0.12;

    g.add(new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-L / 2, 0, 0), L, col, hLen, hWid
    ));
    g.add(new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -L / 2, 0), L, col, hLen, hWid
    ));

    // Origin ring
    const N = 20;
    const rPts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      rPts.push(new THREE.Vector3(0.07 * Math.cos(a), 0.07 * Math.sin(a), 0));
    }
    g.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(rPts),
      new THREE.LineBasicMaterial({ color: col })
    ));
    return g;
  }

  staticGroups.grid = makeGrid();
  staticGroups.axes = makeAxes();
  scene.add(staticGroups.grid, staticGroups.axes);

  // ─── Arrow builders ────────────────────────────────────────────────────

  // Mesh-based thick arrow — solid, visible at any size
  function makeThickArrow(dx, dy, length, colorHex) {
    const col  = new THREE.Color(colorHex);
    const mat  = new THREE.MeshBasicMaterial({ color: col });
    const dir  = new THREE.Vector3(dx, dy, 0).normalize();
    const g    = new THREE.Group();

    const headH  = Math.min(0.30, length * 0.32);
    const shaftL = Math.max(0.02, length - headH);
    const shaftR = 0.040;
    const headR  = 0.115;

    // Shaft: CylinderGeometry default axis is +Y; rotate to direction
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftR, shaftR, shaftL, 10, 1),
      mat
    );
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.position.copy(dir).multiplyScalar(shaftL / 2);
    g.add(shaft);

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(headR, headH, 14, 1),
      mat.clone()
    );
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.position.copy(dir).multiplyScalar(shaftL + headH / 2);
    g.add(head);

    return g;
  }

  // Dashed shaft + solid arrowhead: dashing is the second visual cue for "derived component"
  function makeComponentArrow(fromV, toV, colorHex) {
    const g   = new THREE.Group();
    const col = new THREE.Color(colorHex);
    const len = fromV.distanceTo(toV);
    if (len < 0.02) return g;

    const dir = toV.clone().sub(fromV).normalize();

    const shaftGeo = new THREE.BufferGeometry().setFromPoints([fromV.clone(), toV.clone()]);
    const shaft    = new THREE.Line(shaftGeo,
      new THREE.LineDashedMaterial({ color: col, dashSize: 0.18, gapSize: 0.09 })
    );
    shaft.computeLineDistances();
    g.add(shaft);

    const coneH = 0.22, coneR = 0.10;
    const head  = new THREE.Mesh(
      new THREE.ConeGeometry(coneR, coneH, 12, 1),
      new THREE.MeshBasicMaterial({ color: col })
    );
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.position.copy(toV).addScaledVector(dir, -coneH / 2);
    g.add(head);

    return g;
  }

  function makeAngleArc(angleDeg, r) {
    const rad  = (angleDeg * Math.PI) / 180;
    const segs = Math.max(32, Math.abs(Math.round(angleDeg)));
    const pts  = [];
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * rad;
      pts.push(new THREE.Vector3(r * Math.cos(t), r * Math.sin(t), 0));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(cssVar('--color-bench-grey')),
        transparent: true, opacity: 0.7,
      })
    );
  }

  // Small square at the Fx/Fy corner — engineering convention for 90°
  function makeRightAngleMarker(sfx, sfy) {
    const s  = 0.15;
    const sx = sfx >= 0 ? -s : s;
    const sy = sfy >= 0 ?  s : -s;
    const c  = new THREE.Vector3(sfx, 0, 0);
    const pts = [
      c.clone().add(new THREE.Vector3(sx, 0, 0)),
      c.clone().add(new THREE.Vector3(sx, sy, 0)),
      c.clone().add(new THREE.Vector3(0, sy, 0)),
    ];
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(cssVar('--color-bench-grey')),
        transparent: true, opacity: 0.5,
      })
    );
  }

  // Drag-handle ring at force tip
  function makeDragHandle(x, y, hovered) {
    const r = 0.24, N = 36;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(new THREE.Vector3(x + r * Math.cos(a), y + r * Math.sin(a), 0));
    }
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(cssVar('--color-bench-grey')),
        transparent: true, opacity: hovered ? 0.85 : 0.40,
      })
    );
  }

  // ─── Animation state ───────────────────────────────────────────────────
  let compAnim     = null; // { startTime, duration }
  let compProgress = 1;   // 0 → 1; 1 = fully drawn

  // ─── Drag / hover state ────────────────────────────────────────────────
  let _dragging = false;
  let _hovering = false;
  let _dragCb   = null;
  let _curState = null;
  let _curVis   = null;

  canvas.style.touchAction = 'none'; // prevent scroll interfering with drag

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndcX =  ((clientX - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -(((clientY - rect.top)  / rect.height) * 2 - 1);
    const v = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
    return { x: v.x, y: v.y };
  }

  function isNearTip(wx, wy) {
    if (!_curState || !_curVis?.has('forceVector')) return false;
    const tx = _curState.fx * FORCE_SCALE;
    const ty = _curState.fy * FORCE_SCALE;
    return Math.hypot(wx - tx, wy - ty) < 0.38;
  }

  canvas.addEventListener('pointerdown', e => {
    const w = screenToWorld(e.clientX, e.clientY);
    if (isNearTip(w.x, w.y)) {
      _dragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  canvas.addEventListener('pointermove', e => {
    const w = screenToWorld(e.clientX, e.clientY);
    if (_dragging) {
      const rawMag = Math.hypot(w.x, w.y) / FORCE_SCALE;
      const angle  = ((Math.atan2(w.y, w.x) * 180 / Math.PI) + 360) % 360;
      _dragCb?.(Math.max(10, Math.min(200, rawMag)), angle);
    } else {
      const near = isNearTip(w.x, w.y);
      if (near !== _hovering) {
        _hovering = near;
        canvas.style.cursor = near ? 'grab' : '';
        // Rebuild handle to reflect hover state
        if (dynObjects.dragHandle && _curState) {
          scene.remove(dynObjects.dragHandle);
          dynObjects.dragHandle.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
          });
          const tx = _curState.fx * FORCE_SCALE;
          const ty = _curState.fy * FORCE_SCALE;
          dynObjects.dragHandle = makeDragHandle(tx, ty, _hovering);
          scene.add(dynObjects.dragHandle);
        }
      }
    }
  });

  const _endDrag = () => {
    _dragging = false;
    canvas.style.cursor = _hovering ? 'grab' : '';
  };
  canvas.addEventListener('pointerup',     _endDrag);
  canvas.addEventListener('pointercancel', _endDrag);

  // ─── Dynamic scene drawing ─────────────────────────────────────────────
  let dynObjects = {};

  function clearDyn() {
    Object.values(dynObjects).forEach(o => {
      if (!o) return;
      scene.remove(o);
      o.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    });
    dynObjects = {};
  }

  function drawDyn(state, visSet) {
    clearDyn();

    const { magnitude, angle, fx, fy } = state;
    const sfx  = fx * FORCE_SCALE;
    const sfy  = fy * FORCE_SCALE;
    const sLen = magnitude * FORCE_SCALE;

    // ── Force vector ──
    if (visSet.has('forceVector') && sLen > 0.05) {
      dynObjects.force = makeThickArrow(sfx, sfy, sLen, cssVar('--color-force-applied'));
      scene.add(dynObjects.force);

      dynObjects.dragHandle = makeDragHandle(sfx, sfy, _hovering);
      scene.add(dynObjects.dragHandle);
    }

    // ── Angle arc ──
    const normAngle = ((angle % 360) + 360) % 360;
    if (visSet.has('angleArc') && sLen > 0.12 && normAngle > 1 && normAngle < 359) {
      dynObjects.arc = makeAngleArc(angle, 0.60);
      scene.add(dynObjects.arc);
    }

    // ── Fx only (Step 2 — isolated horizontal component) ──
    if (visSet.has('fxOnly') && sLen > 0.05) {
      const prog = easeOutCubic(Math.min(1, compProgress));
      const O    = new THREE.Vector3(0, 0, 0);
      const FX   = new THREE.Vector3(sfx * prog, 0, 0);
      if (Math.abs(sfx * prog) > 0.03 && prog > 0.02) {
        dynObjects.fxArrow = makeComponentArrow(O, FX, cssVar('--color-hp-teal'));
        scene.add(dynObjects.fxArrow);
      }
    }

    // ── Fy only (Step 3 — isolated vertical component) ──
    if (visSet.has('fyOnly') && sLen > 0.05) {
      const prog = easeOutCubic(Math.min(1, compProgress));
      const O    = new THREE.Vector3(0, 0, 0);
      const FY   = new THREE.Vector3(0, sfy * prog, 0);
      if (Math.abs(sfy * prog) > 0.03 && prog > 0.02) {
        dynObjects.fyArrow = makeComponentArrow(O, FY, cssVar('--color-vp-amber'));
        scene.add(dynObjects.fyArrow);
      }
    }

    // ── Components (with animation progress) ──
    if (visSet.has('components') && sLen > 0.05) {
      // Sequential reveal: Fx grows during 0→0.62, Fy during 0.38→1.0
      const fxProg = easeOutCubic(Math.min(1, compProgress / 0.62));
      const fyProg = easeOutCubic(Math.max(0, Math.min(1, (compProgress - 0.38) / 0.62)));

      const animSfx = sfx * fxProg;
      const animSfy = sfy * fyProg;

      const O  = new THREE.Vector3(0, 0, 0);
      const FX = new THREE.Vector3(animSfx, 0, 0);
      const FY = new THREE.Vector3(animSfx, animSfy, 0);

      if (Math.abs(animSfx) > 0.03 && fxProg > 0.02) {
        dynObjects.fxArrow = makeComponentArrow(O, FX, cssVar('--color-hp-teal'));
        scene.add(dynObjects.fxArrow);
      }
      if (Math.abs(animSfy) > 0.03 && fyProg > 0.02) {
        dynObjects.fyArrow = makeComponentArrow(FX, FY, cssVar('--color-vp-amber'));
        scene.add(dynObjects.fyArrow);
      }

      // Right-angle marker at corner (only once Fy is substantially drawn)
      if (Math.abs(animSfx) > 0.15 && Math.abs(animSfy) > 0.15 && fyProg > 0.45) {
        dynObjects.rightAngle = makeRightAngleMarker(animSfx, animSfy);
        scene.add(dynObjects.rightAngle);
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────

  function update(state, visSet) {
    _curState = state;
    _curVis   = visSet;
    staticGroups.grid.visible = visSet.has('grid');
    staticGroups.axes.visible = visSet.has('axes');
    drawDyn(state, visSet);
  }

  // Called every rAF frame from main.js — advances component decomposition animation
  function tick() {
    if (!compAnim) return;
    const t = Math.min(1, (performance.now() - compAnim.startTime) / compAnim.duration);
    compProgress = t; // raw t for progress splitting; easing applied per-component in drawDyn
    if (t >= 1) { compAnim = null; compProgress = 1; }
    if (_curState && _curVis) drawDyn(_curState, _curVis);
  }

  // Trigger the decomposition animation (call when step first reveals components)
  function startComponentAnimation() {
    if (REDUCED_MOTION) { compProgress = 1; return; }
    compProgress = 0;
    compAnim = { startTime: performance.now(), duration: 700 };
  }

  function setDragCallback(fn) { _dragCb = fn; }

  function worldToScreen(wx, wy) {
    const v    = new THREE.Vector3(wx, wy, 0).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (v.x + 1) / 2 * rect.width,
      y: (-v.y + 1) / 2 * rect.height,
    };
  }

  return { scene, camera, renderer, resize, update, tick, worldToScreen, setDragCallback, startComponentAnimation };
}
