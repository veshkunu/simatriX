import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { defaultPointData, resolvePosition } from './src/pointData.js';
import { STEPS, TERMS, STEP_COUNT } from './src/steps.js';

const CM = 10, toW = cm => cm / CM;
const CAM3 = { p:new THREE.Vector3(9,7,9),  t:new THREE.Vector3(0,0,0) };
const CAM2 = { p:new THREE.Vector3(0,0,18), t:new THREE.Vector3(0,0,0) };
const PIP_W=255, PIP_H=182, PIP_R=14, PIP_T=14;

// Colours are read from the live CSS tokens (never hard-coded) — see readTokens().
let COL = {};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MOBILE_Q = matchMedia('(max-width: 768px)');   // mirrors the CSS stacking breakpoint

let data = defaultPointData(), mainIs3D = true;
let S3 = {}, S2 = {}, rafId = null;
let step = 0, maxReached = 0, orbitDismissed = false, animating = false;
// folded === true once HP is laid flat (frozen 2D sheet). The Animate button then
// reverses the fold, folding HP back up into 3D — see runAnimation()/animateFold().
let folded = false;
let MAX_ANISO = 1;

// Fat-line (Line2) plumbing: every Line2 needs its LineMaterial.resolution kept in
// sync with the pixel size of the canvas it is drawn on. fill()/the fold builder set
// curMats to the active scene's material list so helpers register; layout() refreshes
// every material's resolution on resize / view swap.
let curMats = null;
const curRes = new THREE.Vector2(1, 1);

// When true the camera glides to a front-facing view after HP finishes folding.
// When false the camera stays exactly where the user left it throughout.
const AUTO_ALIGN_CAMERA = false;

const $ = id => document.getElementById(id);
const area=$('canvas-area'), c3=$('c3d'), c2=$('c2d');
const pipBox=$('pip-box'), pipLbl=$('pip-lbl'), live=$('live'), termPop=$('term-pop');

// ── View flags per step (what the viewport renders) ───────────
const DEFV = {showPoint:false,showHP:false,showVP:false,showCoord:false,showQuad:false};
const viewFor = i => ({...DEFV, ...(STEPS[i]?.view || {})});

// ── Read design tokens from CSS custom properties ─────────────
function readTokens(){
  const cs = getComputedStyle(document.documentElement);
  const t = n => cs.getPropertyValue(n).trim();
  COL = {
    paper:t('--paper'), ink:t('--ink'), ink2:t('--ink2'), bench:t('--bench'),
    border:t('--border'), hp:t('--hp'), vp:t('--vp'), accent:t('--accent'),
  };
}

// ── Build a renderer stack ────────────────────────────────────
function build(canvas, is3D){
  const scene=new THREE.Scene(); scene.background=new THREE.Color(COL.paper);
  const cam=new THREE.PerspectiveCamera(45,1,0.1,200);
  const pr=is3D?CAM3:CAM2; cam.position.copy(pr.p);
  const rend=new THREE.WebGLRenderer({canvas,antialias:true});
  rend.setPixelRatio(Math.min(devicePixelRatio,2));
  scene.add(new THREE.AmbientLight(0xffffff,.9));
  const dl=new THREE.DirectionalLight(0xffffff,.5); dl.position.set(6,10,8); scene.add(dl);
  // No AxesHelper: its red/green/blue is off-palette and puts blue inside the
  // viewport (violates the Chrome-Only Blue rule). The labelled planes + fold
  // line + quadrant labels carry orientation instead.
  const ctrl=new OrbitControls(cam,canvas);
  ctrl.target.copy(pr.t); ctrl.enableDamping=true; ctrl.dampingFactor=0.08;
  ctrl.enableRotate=is3D; ctrl.update();
  const grp=new THREE.Group(); scene.add(grp);
  return {scene,cam,rend,ctrl,grp,lineMats:[]};
}

// Pixel size (CSS px) of the canvas a scene currently occupies — main pane or PiP.
// LineMaterial.resolution must match this for correct on-screen line thickness.
function sizeOf(is3D){
  const isMain = (is3D===mainIs3D);
  if(isMain || MOBILE_Q.matches) return [area.clientWidth||1, area.clientHeight||1];
  return [PIP_W, PIP_H];
}
function updateLineRes(){
  const a=sizeOf(true), b=sizeOf(false);
  S3.lineMats?.forEach(m=>m.resolution.set(a[0],a[1]));
  S2.lineMats?.forEach(m=>m.resolution.set(b[0],b[1]));
}

// ── Layout (JS owns canvas pixel sizes) ───────────────────────
function layout(){
  const W=area.clientWidth, H=area.clientHeight;
  if(!W||!H) return;
  updateLineRes();
  const mainC=mainIs3D?c3:c2, pipC=mainIs3D?c2:c3;
  const mainS=mainIs3D?S3:S2, pipS=mainIs3D?S2:S3;
  mainC.style.cssText=`left:0;top:0;z-index:1;cursor:default;position:absolute;display:block;`;
  mainS.rend.setSize(W,H,false); mainS.cam.aspect=W/H; mainS.cam.updateProjectionMatrix();

  // Narrow screens: one full-bleed canvas, no PiP. The toggle bar switches views,
  // so the PiP (255px wide — most of a phone) would only crowd the subject.
  if(MOBILE_Q.matches){
    pipC.style.display='none';
    pipBox.style.display='none';
    return;
  }
  pipBox.style.display='';
  pipC.style.cssText=`left:${W-PIP_W-PIP_R}px;top:${PIP_T}px;z-index:10;cursor:pointer;position:absolute;display:block;`;
  pipS.rend.setSize(PIP_W,PIP_H,false); pipS.cam.aspect=PIP_W/PIP_H; pipS.cam.updateProjectionMatrix();
  pipBox.style.left=`${W-PIP_W-PIP_R}px`; pipBox.style.top=`${PIP_T}px`;
  pipBox.style.width=`${PIP_W}px`; pipBox.style.height=`${PIP_H}px`;
}

function loop(){
  rafId=requestAnimationFrame(loop);
  if(!animating){ S3.ctrl.update(); } S2.ctrl.update();
  S3.rend.render(S3.scene,S3.cam);
  S2.rend.render(S2.scene,S2.cam);
}

// ── Rebuild both scenes for the current data + step view ──────
function rebuild(d){
  data=d;
  if(animating) return;
  // A normal rebuild always redraws the live, interactive 3D scene, so we are no
  // longer showing a flattened sheet — clear the fold state and reset the button.
  if(folded){ folded=false; resetAnimButton(); }
  const v=viewFor(step);
  const pos=resolvePosition(d);
  const wp={x:toW(pos.x),y:toW(pos.y),z:toW(pos.z)};
  const wd={distHP:toW(d.distHP),distVP:toW(d.distVP),distRP:toW(d.distRP),quadrant:d.quadrant};
  fill(S3,true,wp,wd,d,v); fill(S2,false,wp,wd,d,v);
  hiQ(d.quadrant); syncUI(d); announceState(d,v);
}

function fill(s,is3D,wp,wd,raw,v){
  const g=s.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=s.lineMats; curMats.length=0;
  const [rw,rh]=sizeOf(is3D); curRes.set(rw,rh);
  is3D ? draw3D(g,wp,wd,raw,v) : draw2D(g,wp,wd,raw,v);
}

// ── 3D scene ──────────────────────────────────────────────────
// Two-cue rule: everything HP is teal + SOLID; everything VP is amber + DASHED.
//
// World axes (engineering-correct — both planes share the X-axis fold line):
//   HP = XZ plane (y=0)   horizontal floor
//   VP = XY plane (z=0)   vertical wall, facing +Z toward the viewer
//   Fold line = X-axis (the TRUE intersection HP ∩ VP)
//   lateral distRP → X · height distHP → Y · depth distVP → Z (in front of VP = +Z)
//
// `p` arrives as world (toW(distVP), toW(distHP), toW(distRP)); we remap it to
// q = (distRP, distHP, distVP) so distVP becomes the depth axis (+Z). This is
// what lets HP fold flat onto VP about the X-axis without any camera movement.
function draw3D(g,p,d,r,v){
  const S=9;
  const q={x:p.z, y:p.y, z:p.x};                               // remap to (lateral, height, depth)

  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));         // HP floor (XZ, y=0)
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));                  // VP wall  (XY, z=0)
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                       // fold line (X-axis)
  alb(g,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78); alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  alb(g,'XY',S/2-.5,-.35,0,COL.ink,1.0,.5);                    // label the fold line (matches Lines)

  if(v.showQuad){
    [{t:'I',x:.25,y:2.7,z:2.7,q:'Q1'},{t:'II',x:.25,y:2.7,z:-2.7,q:'Q2'},
     {t:'III',x:.25,y:-2.7,z:-2.7,q:'Q3'},{t:'IV',x:.25,y:-2.7,z:2.7,q:'Q4'}]
    .forEach(l=>alb(g,l.t,l.x,l.y,l.z,l.q===d.quadrant?COL.ink:COL.bench,.65,.32));
  }

  if(!v.showPoint) return;
  asp(g,q.x,q.y,q.z,.16,COL.ink); albBox(g,'P',q.x+.32,q.y+.37,q.z+.2,COL.ink,.3);

  if(v.showHP){
    asg(g,[q.x,q.y,q.z],[q.x,0,q.z],COL.hp,1);                 // HP projector P→foot (dashed)
    asg(g,[q.x,0,q.z],[q.x,0,0],COL.hp,0);                     // foot→fold line (in HP plane)
    acr(g,q.x,0,q.z,.14,COL.hp,true); albBox(g,'p',q.x+.3,.24,q.z,COL.hp,.3);
  }
  if(v.showVP){
    asg(g,[q.x,q.y,q.z],[q.x,q.y,0],COL.vp,1);                 // VP projector P→foot (dashed)
    asg(g,[q.x,q.y,0],[q.x,0,0],COL.vp,1);                     // foot→fold line (in VP plane)
    acr(g,q.x,q.y,0,.14,COL.vp,true); albBox(g,"p'",q.x+.26,q.y+.3,.06,COL.vp,.3);
  }
  if(v.showCoord){
    const s=n=>n<0?'−':'', f=n=>Math.abs(n).toFixed(0);
    alb(g,`P(${s(p.x)}${f(r.distVP)}, ${s(p.y)}${f(r.distHP)}, ${s(p.z)}${f(r.distRP)})`,
        q.x+.4,q.y+.7,q.z+.3,COL.ink,2.8,.36,true);
  }
}

// ── 2D scene ──────────────────────────────────────────────────
// The drawing is only meaningful once both views exist; before that, show an
// empty-state inside the viewport.
function draw2D(g,p,d,r,v){
  const hw=6.5,hh=5.5;
  alp(g,[[-hw,-hh,0],[hw,-hh,0],[hw,hh,0],[-hw,hh,0]],COL.border);
  asg(g,[-hw,0,0],[hw,0,0],COL.ink,0);
  alb(g,'x',-hw+.55,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',hw-.55,.38,0,COL.ink,.85,.72,false,128);
  alb(g,'VP',-hw+1.1,2.8,0,COL.vp,1.6,.92,false,128); alb(g,'HP',-hw+1.1,-2.8,0,COL.hp,1.6,.92,false,128);

  if(!(v.showHP && v.showVP)){
    alb(g,'Top & front views appear here',0,0,0,COL.bench,4.4,.42);
    return;
  }

  const signLat=(r.quadrant==='Q2'||r.quadrant==='Q3')?-1:1, lx=signLat*d.distRP;
  const elevSign=(r.quadrant==='Q1'||r.quadrant==='Q2')?1:-1, ey=elevSign*d.distHP;  // p' (front view, VP)
  const planSign=(r.quadrant==='Q2'||r.quadrant==='Q3')?1:-1, py=planSign*d.distVP;  // p  (top view, HP)

  asg(g,[lx,ey,0],[lx,0,0],COL.vp,1);                          // VP projector (dashed amber)
  acr(g,lx,ey,0,.18,COL.vp,false); albBox(g,"p'",lx+.6,ey+.5,0,COL.vp,.6);
  adm(g,lx,0,lx,ey,COL.vp,`${r.distHP.toFixed(0)} cm`);

  asg(g,[lx,0,0],[lx,py,0],COL.hp,1);                          // HP projector (dashed teal)
  acr(g,lx,py,0,.18,COL.hp,false); albBox(g,'p',lx+.6,py-.5,0,COL.hp,.6);
  adm(g,lx,0,lx,py,COL.hp,`${r.distVP.toFixed(0)} cm`);
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION — REVERSIBLE Engineering-Graphics unfolding (book about its spine)
//
// Uses the SAME world axes as draw3D, so the first animation frame is
// pixel-identical to the static 3D scene — no jump when Animate is clicked:
//   HP = XZ plane (y=0)   VP = XY plane (z=0)   fold line = X-axis
//
// Only hpGroup rotates about the X-axis (the hinge). Forward (unfold): +90°,
// landing HP coplanar with VP — p below XY, p′ above → the standard sheet, then
// the 3D depth cues (point P + perpendicular projectors) dissolve. Reverse (fold
// back): plays the exact same timeline backwards — HP swings home and the depth
// cues return, ending in the live 3D scene. The button toggles between the two.
//
//        VP  (above XY line)
//   ─────── XY ───────
//        HP  (below XY line)
//
// The CAMERA NEVER MOVES in either direction — the fold plays out entirely
// inside the user's current viewpoint. AUTO_ALIGN_CAMERA is retained but unused
// (kept off by product requirement; see CLAUDE.md).
// ═══════════════════════════════════════════════════════════════
const ANIM_LABEL   = '▶ Animate Unfolding';
const REFOLD_LABEL = '↩ Fold back to 3D';
const ANIM_DURATION = 2800, ANIM_SPLIT = 0.72, ANIM_ANGLE = Math.PI/2;

function resetAnimButton(){ const b=$('btn-anim'); if(b){ b.disabled=false; b.textContent=ANIM_LABEL; } }

// Forward (unfold) state at normalised progress p ∈ [0,1]: HP rotation and the
// shared opacity of the fading depth cues. Reverse evaluates this at (1 − t), so
// the two directions are exact mirror images (same duration, easing, hinge).
function foldStateAt(p){
  const foldT=Math.min(p/ANIM_SPLIT,1), ease=1-Math.pow(1-foldT,3);
  const op = p<=ANIM_SPLIT ? 1 : Math.max(0,1-(p-ANIM_SPLIT)/(1-ANIM_SPLIT));
  return { rot: ANIM_ANGLE*ease, op };
}

function runAnimation(){
  if(animating) return;
  folded ? foldBackTo3D() : unfoldTo2D();
}

function unfoldTo2D(){
  if(reduceMotion.matches){
    if(mainIs3D) swap();
    folded=true; $('btn-anim').textContent=REFOLD_LABEL;
    announce('Planes unfolded. Showing the 2D drawing.');
    return;
  }
  animateFold(false);
}
function foldBackTo3D(){
  if(reduceMotion.matches){
    if(!mainIs3D) swap();
    rebuild(data);            // rebuild clears `folded` and resets the button
    announce('Folded back into the 3D view.');
    return;
  }
  animateFold(true);
}

// Builds the fold scene (static VP + p′, the rotating hpGroup with p, and the
// dynamic HP projector). Returns the rotating group, the fading-cue list, the
// dynamic projector + its geometry, the foot tracker, and P's coordinates.
function buildAnimScene(){
  const pos=resolvePosition(data);
  const S=9, g=S3.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=S3.lineMats; curMats.length=0;
  const [rw,rh]=sizeOf(true); curRes.set(rw,rh);

  // Same remap as draw3D: lateral distRP → X, height distHP → Y, depth distVP → Z.
  const ax=toW(pos.z), ay=toW(pos.y), az=toW(pos.x);
  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP — XY plane (z=0), stationary
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                     // fold line (hinge)

  // p′ on VP (stays in z=0): connector, cross, label — KEEP
  asg(g,[ax,ay,0],[ax,0,0],COL.vp,1);
  acr(g,ax,ay,0,.14,COL.vp,true);
  albBox(g,"p'",ax+.26,ay+.3,.06,COL.vp,.3);

  // Depth cues — FADE: P, its label, VP projector P→p′
  asp(g,ax,ay,az,.16,COL.ink);                 fade.push(last());
  albBox(g,'P',ax+.32,ay+.37,az+.2,COL.ink,.3); fade.push(last());
  asg(g,[ax,ay,az],[ax,ay,0],COL.vp,1);        fade.push(last());

  // hpGroup — the ONLY thing that rotates (about the X hinge)
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  const hpMesh=new THREE.Mesh(new THREE.PlaneGeometry(S,S),
    new THREE.MeshBasicMaterial({color:new THREE.Color(COL.hp),transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  hpMesh.rotation.x=-Math.PI/2; hpGroup.add(hpMesh);
  alp(hpGroup,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  alb(hpGroup,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78);
  acr(hpGroup,ax,0,az,.14,COL.hp,true);
  albBox(hpGroup,'p',ax+.3,.24,az,COL.hp,.3);
  asg(hpGroup,[ax,0,az],[ax,0,0],COL.hp,0);                  // foot → fold line (in HP)

  // HP projector P→foot (dynamic, follows the moving foot) — FADE
  const projGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az),new THREE.Vector3(ax,0,az)]);
  const dynProj=new THREE.Line(projGeo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
  dynProj.computeLineDistances(); g.add(dynProj); fade.push(dynProj);
  const footTracker=new THREE.Object3D(); footTracker.position.set(ax,0,az); hpGroup.add(footTracker);

  for(const o of fade){ if(o.material) o.material.transparent=true; }
  return { hpGroup, fade, projGeo, dynProj, footTracker, P:[ax,ay,az] };
}

function animateFold(reverse){
  animating=true;
  const btn=$('btn-anim'); btn.disabled=true; btn.textContent = reverse ? 'Folding…' : 'Animating…';
  if(!mainIs3D) swap();

  const { hpGroup, fade, projGeo, dynProj, footTracker, P } = buildAnimScene();
  const tmpV=new THREE.Vector3();

  // Apply a given timeline state to the scene (rotation, fade, projector geometry).
  const apply=p=>{
    const { rot, op }=foldStateAt(p);
    hpGroup.rotation.x=rot;
    for(const o of fade){ if(o.material) o.material.opacity=op; }
    footTracker.getWorldPosition(tmpV);
    projGeo.setFromPoints([new THREE.Vector3(...P), tmpV.clone()]);
    dynProj.computeLineDistances();
  };

  apply(reverse ? 1 : 0);          // freeze the correct first frame (no flash / no jump)
  const startTime=performance.now();

  function frame(now){
    const t=Math.min((now-startTime)/ANIM_DURATION,1);
    apply(reverse ? 1-t : t);
    if(t<1){ requestAnimationFrame(frame); return; }

    if(reverse){
      animating=false; folded=false;
      rebuild(data);               // restore the live, interactive 3D scene
      resetAnimButton();
      announce('Folded back into the 3D view — the point is restored in space.');
    } else {
      animating=false; folded=true;
      btn.disabled=false; btn.textContent=REFOLD_LABEL;
      announce('Horizontal plane unfolded onto the vertical plane — the 2D drawing is complete.');
    }
  }
  requestAnimationFrame(frame);
}

// ── Geometry helpers ──────────────────────────────────────────
// Line weights in CSS pixels — Line2 keeps a constant on-screen thickness at any
// zoom, the crisp engineering-drawing look. (No accent/off-palette colour added.)
const LW = { edge:2.6, border:1.6, proj:1.7, cross:2.4, dim:1.8 };

// Blend a token colour toward another. Returns "#rrggbb" (used for the boxed-label
// border tint). No new palette colours — only blends of existing tokens.
const mix=(a,b,t)=>'#'+new THREE.Color(a).lerp(new THREE.Color(b),t).getHexString();

function apl(g,s,c,o,e){const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));m.rotation.copy(e);g.add(m);}

// fatLine — the single primitive every stroke routes through. flat is a flat
// [x,y,z,x,y,z,…] array; width is in pixels; dashed uses world-space dash sizing.
// The material is registered in curMats so layout() can refresh its resolution.
function fatLine(g,flat,colHex,width,dashed){
  const geo=new LineGeometry(); geo.setPositions(flat);
  const mat=new LineMaterial({
    color:new THREE.Color(colHex).getHex(), linewidth:width, worldUnits:false,
    transparent:true, dashed:!!dashed, dashSize:0.20, gapSize:0.13, dashScale:1,
  });
  mat.resolution.set(curRes.x||1, curRes.y||1);
  const ln=new Line2(geo,mat); ln.computeLineDistances();
  if(curMats) curMats.push(mat);
  g.add(ln); return ln;
}

function asg(g,a,b,c,dash,w){
  return fatLine(g,[a[0],a[1],a[2]||0, b[0],b[1],b[2]||0], c, w!=null?w:(dash?LW.proj:LW.edge), !!dash);
}
function alp(g,pts,c,w){
  const flat=[]; [...pts,pts[0]].forEach(p=>flat.push(p[0],p[1],p[2]||0));
  return fatLine(g,flat,c,w!=null?w:LW.border,false);
}
// Point P: flat unlit marker drawn on top of the translucent planes, so it reads
// as a crisp solid dot (MeshPhong + lighting made it catch a bluish specular tint
// and the teal HP plane in front muddied it). depthTest:false keeps it clear.
function asp(g,x,y,z,r,c){const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,18),new THREE.MeshBasicMaterial({color:new THREE.Color(c),depthTest:false}));m.renderOrder=3;m.position.set(x,y,z);g.add(m);}
// Cross marker — two crisp fat strokes (clear engineering-style foot symbol).
function acr(g,cx,cy,cz,r,c,is3D){
  if(is3D){ asg(g,[cx-r,cy,cz],[cx+r,cy,cz],c,0,LW.cross); asg(g,[cx,cy,cz-r],[cx,cy,cz+r],c,0,LW.cross); }
  else { asg(g,[cx-r,cy,0],[cx+r,cy,0],c,0,LW.cross); asg(g,[cx,cy-r,0],[cx,cy+r,0],c,0,LW.cross); }
}
function adm(g,x1,y1,x2,y2,c,txt){
  const ox=x1-0.6, col=new THREE.Color(c);
  asg(g,[ox,y1,0],[ox,y2,0],c,0,LW.dim);
  asg(g,[x1-0.25,y1,0],[ox-0.02,y1,0],c,0,LW.dim);
  asg(g,[x2-0.25,y2,0],[ox-0.02,y2,0],c,0,LW.dim);
  function arrow(tipX,tipY,up){
    const h=0.26,w=0.11,d=up?1:-1,shape=new THREE.Shape();
    shape.moveTo(tipX,tipY); shape.lineTo(tipX-w,tipY-d*h); shape.lineTo(tipX+w,tipY-d*h); shape.closePath();
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide,depthTest:false}));
    m.renderOrder=1; g.add(m);
  }
  arrow(ox,y1,y2<y1); arrow(ox,y2,y2>y1);
  alb(g,txt,ox-0.9,(y1+y2)/2,0,c,2.0,0.68,true,256);
}

// roundRect path (Path2D.roundRect / ctx.roundRect aren't universal yet).
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
// Boxed point label — the "engineering software" look for point names (P, p, p′):
// coloured text on a white rounded-rect plate with a thin tinted border. The canvas
// is sized to the text so the chip never distorts; h is the target world height.
function albBox(g,txt,x,y,z,c,h=0.3){
  const SS=3, fam='"Atkinson Hyperlegible",system-ui,sans-serif', wt='bold', fs=64*SS;
  const meas=document.createElement('canvas').getContext('2d');
  meas.font=`${wt} ${fs}px ${fam}`;
  const tw=meas.measureText(txt).width, padX=24*SS, padY=15*SS;
  const W=Math.ceil(tw+padX*2), H=Math.ceil(fs*1.12+padY*2);
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  roundRect(ctx,2*SS,2*SS,W-4*SS,H-4*SS,H*0.34);
  ctx.fillStyle='#ffffff'; ctx.fill();
  ctx.lineWidth=3*SS; ctx.strokeStyle=mix(c,COL.ink,0.22); ctx.stroke();
  ctx.font=`${wt} ${fs}px ${fam}`; ctx.fillStyle=c;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,W/2,H/2);
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=MAX_ANISO;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sp.position.set(x,y,z); sp.scale.set(h*W/H, h, 1); sp.renderOrder=4; g.add(sp);
}
// cw: canvas pixel width — use 128 for 1-3 char labels, 256 for short words, 512 for long strings.
// Narrower cw means the text occupies more of the texture, yielding sharper sprites at the same world-unit scale.
function alb(g,txt,x,y,z,c,sx=.7,sy=.35,mono=false,cw=512){
  const SS=3, W=cw*SS, H=128*SS;          // supersample for crisp text at small sizes
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,W,H);
  const wt=mono?'600':'bold', base=(mono?40:44)*SS,
        fam=mono?'"IBM Plex Mono",ui-monospace,monospace':'"Atkinson Hyperlegible",system-ui,sans-serif';
  let fs=base; ctx.font=`${wt} ${fs}px ${fam}`;
  // Shrink to fit so long text can't clip the sprite.
  const maxW=(cw-24)*SS; let w=ctx.measureText(txt).width;
  if(w>maxW){ fs=Math.floor(base*maxW/w); ctx.font=`${wt} ${fs}px ${fam}`; }
  ctx.fillStyle=c; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,W/2,H/2);
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=MAX_ANISO;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sp.position.set(x,y,z); sp.scale.set(sx,sy,1); g.add(sp);
}

// ── Swap main / PiP views ─────────────────────────────────────
function swap(){
  if(animating) return;
  mainIs3D=!mainIs3D;
  S3.ctrl.enableRotate=mainIs3D;
  pipLbl.textContent=mainIs3D?'2D Drawing':'3D View';
  $('tb3').classList.toggle('on', mainIs3D);
  $('tb2').classList.toggle('on',!mainIs3D);
  $('tb3').setAttribute('aria-pressed', String(mainIs3D));
  $('tb2').setAttribute('aria-pressed', String(!mainIs3D));
  layout();
}

function hiQ(q){['Q1','Q2','Q3','Q4'].forEach(id=>$('qr-'+id)?.classList.toggle('qa',id===q));}

function syncUI(d){
  setRange('r-hp','n-hp',d.distHP,v=>`${v} centimetres above HP`);
  setRange('r-vp','n-vp',d.distVP,v=>`${v} centimetres in front of VP`);
  setRange('r-pp','n-pp',d.distRP,v=>`${v} centimetres from the profile plane`);
  $('sel-q').value=d.quadrant;
}
function setRange(r,n,v,vt){
  const rEl=$(r), nEl=$(n), max=+rEl.max||100, clamped=Math.min(max,Math.max(0,v));
  rEl.value=String(clamped);
  rEl.style.setProperty('--p',(clamped/max*100)+'%');
  rEl.setAttribute('aria-valuetext',vt(v));
  nEl.value=String(v);
  nEl.setAttribute('aria-invalid','false');
  // The typed field accepts up to 200; the slider only reaches its max. When the
  // value sits beyond the slider, say so plainly rather than letting the thumb lie.
  setNote('note-'+r.slice(2), v>max ? `The slider only reaches ${max} cm. Your typed value of ${v} cm is still used.` : '');
}

// Inline control feedback (validation + over-range). Icon matches the hint callout.
const NOTE_ICO='<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>';
function setNote(id,msg){
  const el=$(id); if(!el) return;
  if(msg){ el.innerHTML=NOTE_ICO+`<span>${msg}</span>`; el.hidden=false; }
  else { el.textContent=''; el.hidden=true; }
}

// ── Live-region announcements ─────────────────────────────────
function announce(msg){ live.textContent=''; live.textContent=msg; }

// ── Screen-reader mirror of the viewport result ───────────────
// The WebGL scenes carry the payoff (the coordinate, where p and p′ land) but
// are unreadable by assistive tech. describe() restates that result as text;
// announceState() debounces it so a slider drag yields one announcement, not
// dozens, and never clobbers the step-change announcement on #live.
const QNAME={Q1:'one',Q2:'two',Q3:'three',Q4:'four'};
function describe(d,v){
  if(!v.showPoint) return '';
  const q=d.quadrant, aboveHP=(q==='Q1'||q==='Q2'), frontVP=(q==='Q1'||q==='Q4');
  const s=[];
  if(v.showQuad) s.push(`Quadrant ${QNAME[q]}.`);
  const loc=[];
  if(v.showHP) loc.push(`${d.distHP} centimetres ${aboveHP?'above':'below'} the horizontal plane`);
  if(v.showVP) loc.push(`${d.distVP} centimetres ${frontVP?'in front of':'behind'} the vertical plane`);
  if(d.distRP>0) loc.push(`${d.distRP} centimetres from the profile plane`);
  if(loc.length) s.push(`Point P is ${loc.join(', ')}.`);
  if(v.showHP && v.showVP){
    const epAbove=(q==='Q1'||q==='Q2');   // front view p′ vs XY (matches draw2D elevSign)
    const pAbove=(q==='Q2'||q==='Q3');     // top view p  vs XY (matches draw2D planSign)
    s.push(`In the drawing, front view p-prime is ${d.distHP} centimetres ${epAbove?'above':'below'} the XY line; top view p is ${d.distVP} centimetres ${pAbove?'above':'below'} it.`);
  }
  return s.join(' ');
}
let stateTimer=null;
function announceState(d,v){
  clearTimeout(stateTimer);
  stateTimer=setTimeout(()=>{ const el=$('vp-status'); if(el) el.textContent=describe(d,v); },250);
}

// ═══════════════════════════════════════════════════════════════
// STEPPER CONTROLLER
// ═══════════════════════════════════════════════════════════════
function buildRail(){
  const rail=$('rail'); rail.innerHTML='';
  STEPS.forEach((s,i)=>{
    const li=document.createElement('li');
    const b=document.createElement('button');
    b.className='rail-item'; b.type='button'; b.dataset.idx=String(i);
    b.innerHTML=`<span class="disc">${i+1}</span><span class="rail-label">${s.title}</span>`;
    li.appendChild(b); rail.appendChild(li);
  });
}

function renderStep(i){
  step=Math.max(0,Math.min(STEP_COUNT-1,i));
  maxReached=Math.max(maxReached,step);
  const s=STEPS[step];

  // Rail state
  document.querySelectorAll('.rail-item').forEach((el,idx)=>{
    el.classList.toggle('done', idx<step);
    el.classList.toggle('current', idx===step);
    el.querySelector('.disc').textContent = idx<step ? '✓' : String(idx+1);
    el.disabled = idx>maxReached;
    if(idx===step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });

  // Card content
  $('eyebrow').textContent=`Step ${step+1} of ${STEP_COUNT}`;
  $('step-title').textContent=s.title;
  $('step-lead').textContent=s.lead;
  $('step-body').innerHTML=s.body.map(p=>`<p>${p}</p>`).join('');
  const hintEl=$('hint');
  if(s.hint){ $('hint-text').innerHTML=s.hint; hintEl.hidden=false; } else { hintEl.hidden=true; }

  // Progressive disclosure of controls
  document.querySelectorAll('#controls .ctrl').forEach(el=>{
    el.hidden = !s.controls.includes(el.dataset.ctrl);
  });

  // Navigation
  $('btn-back').disabled = step===0;
  const next=$('btn-next');
  next.disabled = step===STEP_COUNT-1;
  next.textContent = step===STEP_COUNT-1 ? 'Done' : 'Next →';

  // Orbit hint chip
  $('orbit-hint').classList.toggle('show', !!s.orbitHint && !orbitDismissed);

  // Short fade + translate on content swap (collapses to instant under reduced-motion).
  const card=document.querySelector('.step-card');
  card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');

  closeTerm();
  announce(`Step ${step+1} of ${STEP_COUNT}. ${s.title}.`);
  rebuild(data);
}

const goNext=()=>{ if(step<STEP_COUNT-1) renderStep(step+1); };
const goBack=()=>{ if(step>0) renderStep(step-1); };

// ── Inline term popover ───────────────────────────────────────
let activeTerm=null;
function openTerm(btn){
  const key=btn.dataset.t, def=TERMS[key]; if(!def) return;
  activeTerm=btn;
  termPop.innerHTML=`<span class="pt">${def.label}</span>${def.def}`;
  termPop.classList.add('show');
  btn.setAttribute('aria-describedby','term-pop');
  const r=btn.getBoundingClientRect(), pw=termPop.offsetWidth, ph=termPop.offsetHeight, m=8;
  let top=r.bottom+6; if(top+ph>innerHeight-m) top=Math.max(m,r.top-ph-6);
  let left=Math.min(Math.max(m,r.left),innerWidth-pw-m);
  termPop.style.top=`${top}px`; termPop.style.left=`${left}px`;
}
function closeTerm(){
  if(!activeTerm) return;
  termPop.classList.remove('show');
  activeTerm.removeAttribute('aria-describedby');
  activeTerm=null;
}

// ── Wire up everything ────────────────────────────────────────
function wire(){
  [['r-hp','n-hp','distHP'],['r-vp','n-vp','distVP'],['r-pp','n-pp','distRP']].forEach(([r,n,k])=>{
    $(r).addEventListener('input',()=>rebuild({...data,[k]:+$(r).value||0}));
    $(n).addEventListener('change',()=>{
      const v=parseFloat($(n).value), note='note-'+r.slice(2);
      if(!isFinite(v)||v<0){                          // reject: restore + explain (no silent revert)
        syncUI(data); $(n).setAttribute('aria-invalid','true');
        setNote(note,'Enter a number from 0 to 200 cm.');
      } else if(v>200){                               // clamp: accept the cap, but say so
        rebuild({...data,[k]:200}); setNote(note,'The maximum is 200 cm, so 200 cm is used.');
      } else {
        rebuild({...data,[k]:v});
      }
    });
  });
  $('sel-q').addEventListener('change',()=>rebuild({...data,quadrant:$('sel-q').value}));
  $('btn-anim').addEventListener('click',runAnimation);
  $('btn-reset').addEventListener('click',()=>window.simAPI.reset());
  $('btn-next').addEventListener('click',goNext);
  $('btn-back').addEventListener('click',goBack);

  $('rail').addEventListener('click',e=>{
    const b=e.target.closest('.rail-item'); if(!b||b.disabled) return;
    renderStep(+b.dataset.idx);
  });

  // View toggles
  $('tb3').setAttribute('aria-pressed','true'); $('tb2').setAttribute('aria-pressed','false');
  $('tb3').addEventListener('click',()=>{if(!mainIs3D)swap();});
  $('tb2').addEventListener('click',()=>{if(mainIs3D)swap();});
  c2.addEventListener('click',()=>{if(mainIs3D)swap();});
  c3.addEventListener('click',()=>{if(!mainIs3D)swap();});
  [c2,c3].forEach(c=>{
    c.addEventListener('mouseenter',()=>{ if(c.style.zIndex==='10') pipBox.style.borderColor='var(--accent)'; });
    c.addEventListener('mouseleave',()=>{ pipBox.style.borderColor='var(--border)'; });
  });
  c3.addEventListener('pointerdown',()=>{ orbitDismissed=true; $('orbit-hint').classList.remove('show'); });

  // Term popover (delegated within the stepper panel)
  const sp=$('stepper');
  sp.addEventListener('click',e=>{const t=e.target.closest('.term'); if(t){e.preventDefault(); activeTerm===t?closeTerm():openTerm(t);}});
  sp.addEventListener('mouseover',e=>{const t=e.target.closest('.term'); if(t)openTerm(t);});
  sp.addEventListener('mouseout',e=>{const t=e.target.closest('.term'); if(t&&t===activeTerm&&document.activeElement!==t)closeTerm();});
  sp.addEventListener('focusin',e=>{const t=e.target.closest('.term'); if(t)openTerm(t);});
  sp.addEventListener('focusout',e=>{const t=e.target.closest('.term'); if(t&&t===activeTerm)closeTerm();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTerm();});
  window.addEventListener('scroll',closeTerm,true);

  $('mobile-dismiss').addEventListener('click',()=>$('mobile-note').style.display='none');
  new ResizeObserver(layout).observe(area);
  MOBILE_Q.addEventListener('change',layout);   // re-fit canvas + PiP when crossing the breakpoint
}

// ── Platform contract ─────────────────────────────────────────
window.simAPI={
  pause(){cancelAnimationFrame(rafId);rafId=null;},
  resume(){if(!rafId)loop();},
  reset(){
    if(animating) return;
    if(!mainIs3D)swap();
    S3.cam.position.copy(CAM3.p);S3.ctrl.target.copy(CAM3.t);S3.ctrl.update();
    S2.cam.position.copy(CAM2.p);S2.ctrl.target.copy(CAM2.t);S2.ctrl.update();
    rebuild(defaultPointData());
  },
};

window.addEventListener('load',()=>{
  readTokens();
  S3=build(c3,true); S2=build(c2,false);
  MAX_ANISO=Math.max(S3.rend.capabilities.getMaxAnisotropy(),1);
  wire(); buildRail(); layout(); renderStep(0); loop();
  setTimeout(layout,100);
  // Mark success and clear the boot diagnostic (if it showed for a slow CDN load).
  window.__simStarted=true;
  document.getElementById('boot-error')?.remove();
  // Re-render sprite labels once the web fonts are ready (avoids fallback FOUT).
  document.fonts?.ready.then(()=>rebuild(data));
});
