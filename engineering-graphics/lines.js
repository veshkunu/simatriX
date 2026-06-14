// lines.js — orchestrator for Projection of Straight Lines.
// Reuses the Points module's architecture verbatim: two independent renderer
// stacks (S3 = always-3D, S2 = always-2D), JS-owned canvas sizing, the guided
// stepper, term popovers, geometry helpers, and the no-camera HP-fold animation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { defaultLineData, resolveLine, LineCase } from './src/lineData.js';
import { STEPS, TERMS, STEP_COUNT } from './src/lineSteps.js';

const CM = 10, toW = cm => cm / CM, W = toW;
const CAM3 = { p:new THREE.Vector3(9,7,9),  t:new THREE.Vector3(0,0,0) };
const CAM2 = { p:new THREE.Vector3(0,0,18), t:new THREE.Vector3(0,0,0) };
const PIP_W=255, PIP_H=182, PIP_R=14, PIP_T=14;

let COL = {};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MOBILE_Q = matchMedia('(max-width: 768px)');

let data = defaultLineData(), mainIs3D = true;
let S3 = {}, S2 = {}, rafId = null;
let step = 0, maxReached = 0, orbitDismissed = false, animating = false;
// folded === true once the orthographic sheet is laid flat (frozen). The fold
// button then reverses the animation, folding the sheet back up into 3D.
let folded = false;
let MAX_ANISO = 1;

// Fat-line (Line2) plumbing: every Line2 needs its LineMaterial.resolution kept
// in sync with the pixel size of the canvas it is drawn on. fill()/runFold set
// curMats to the active scene's material list so helpers can register, and
// layout() refreshes every material's resolution on resize / view swap.
let curMats = null;
const curRes = new THREE.Vector2(1, 1);

// Viewport toggles (Labels / Dimensions / Projectors) — default all on.
let tLabels = true, tDims = true, tProj = true;

// Construction overlays (Traces / True-Length). conMode ∈ null | 'trace' | 'tl'.
// Each is a self-contained animated construction drawn into the 2D scene (S2),
// frozen when finished; any rebuild() tears it down and restores the live scene.
let conMode = null, conRAF = null;
let conApply = null;                 // applies a 0..1 progress to the current build
let tlPhase = 0, tlPlaying = false, tlPhaseT = 0, tlPrevTime = 0;

const $ = id => document.getElementById(id);
const area=$('canvas-area'), c3=$('c3d'), c2=$('c2d');
const pipBox=$('pip-box'), pipLbl=$('pip-lbl'), live=$('live'), termPop=$('term-pop');

const DEFV = {showLine:false, showFV:false, showTV:false};
const viewFor = i => ({...DEFV, ...(STEPS[i]?.view || {})});

function readTokens(){
  const cs = getComputedStyle(document.documentElement);
  const t = n => cs.getPropertyValue(n).trim();
  COL = { paper:t('--paper'), ink:t('--ink'), ink2:t('--ink2'), bench:t('--bench'),
          border:t('--border'), hp:t('--hp'), vp:t('--vp'), accent:t('--accent'),
          construct:t('--construct'), locus:t('--locus'), tlg:t('--tl-green') };
}

function build(canvas, is3D){
  const scene=new THREE.Scene(); scene.background=new THREE.Color(COL.paper);
  const cam=new THREE.PerspectiveCamera(45,1,0.1,200);
  const pr=is3D?CAM3:CAM2; cam.position.copy(pr.p);
  const rend=new THREE.WebGLRenderer({canvas,antialias:true});
  rend.setPixelRatio(Math.min(devicePixelRatio,2));
  scene.add(new THREE.AmbientLight(0xffffff,.9));
  const dl=new THREE.DirectionalLight(0xffffff,.5); dl.position.set(6,10,8); scene.add(dl);
  const ctrl=new OrbitControls(cam,canvas);
  ctrl.target.copy(pr.t); ctrl.enableDamping=true; ctrl.dampingFactor=0.08;
  ctrl.enableRotate=is3D; ctrl.update();
  const grp=new THREE.Group(); scene.add(grp);
  return {scene,cam,rend,ctrl,grp,lineMats:[]};
}

// Pixel size (CSS px) of the canvas a scene currently occupies — main pane or
// PiP. LineMaterial.resolution must match this for correct on-screen thickness.
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

function layout(){
  const Wd=area.clientWidth, H=area.clientHeight;
  if(!Wd||!H) return;
  updateLineRes();
  const mainC=mainIs3D?c3:c2, pipC=mainIs3D?c2:c3;
  const mainS=mainIs3D?S3:S2, pipS=mainIs3D?S2:S3;
  mainC.style.cssText=`left:0;top:0;z-index:1;cursor:default;position:absolute;display:block;`;
  mainS.rend.setSize(Wd,H,false); mainS.cam.aspect=Wd/H; mainS.cam.updateProjectionMatrix();
  if(MOBILE_Q.matches){ pipC.style.display='none'; pipBox.style.display='none'; return; }
  pipBox.style.display='';
  pipC.style.cssText=`left:${Wd-PIP_W-PIP_R}px;top:${PIP_T}px;z-index:10;cursor:pointer;position:absolute;display:block;`;
  pipS.rend.setSize(PIP_W,PIP_H,false); pipS.cam.aspect=PIP_W/PIP_H; pipS.cam.updateProjectionMatrix();
  pipBox.style.left=`${Wd-PIP_W-PIP_R}px`; pipBox.style.top=`${PIP_T}px`;
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
  // A normal rebuild restores the live, interactive scene — tear down any
  // construction overlay (Traces / True-Length) and clear the flattened state.
  if(conMode) teardownConUI();
  if(folded){ folded=false; resetFoldButton(); }
  const v=viewFor(step);
  const M=resolveLine(d);
  fill(S3,true,M,v); fill(S2,false,M,v);
  syncUI(d,M); updateReadout(M); announceState(M,v);
}

function fill(s,is3D,M,v){
  const g=s.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=s.lineMats; curMats.length=0;
  const [rw,rh]=sizeOf(is3D); curRes.set(rw,rh);
  is3D ? draw3D(g,M,v) : draw2D(g,M,v);
}

// ═══════════════════════════════════════════════════════════════
// 3D SCENE
// Axes: x = lateral (along XY) · y = height above HP · z = depth in front of VP
// HP = XZ plane (y=0, teal) · VP = XY plane (z=0, amber) · fold line = X-axis
// The line is centred on its own mid-lateral so it always sits in frame.
// ═══════════════════════════════════════════════════════════════
function draw3D(g,M,v){
  const S=9;
  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                        // XY fold line
  if(tLabels){
    alb(g,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78);
    alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
    alb(g,'XY',S/2-.5,-.35,0,COL.ink,1.0,.5);
  }
  if(!v.showLine) return;

  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const A=[ax,W(M.A.y),W(M.A.z)], B=[bx,W(M.B.y),W(M.B.z)];

  // Front view feet on VP (z=0) and Top view feet on HP (y=0)
  const aF=[ax,W(M.A.y),0], bF=[bx,W(M.B.y),0];   // a', b'  (elevation — PRIMED)
  const aT=[ax,0,W(M.A.z)], bT=[bx,0,W(M.B.z)];   // a , b   (plan — UNPRIMED)
  const fvTrue=Math.abs(M.fvLen-M.tl)<0.5, tvTrue=Math.abs(M.tvLen-M.tl)<0.5;

  // Projectors (perpendicular construction) — drawn first, beneath the views
  if(tProj){
    asg(g,A,aF,COL.vp,1); asg(g,B,bF,COL.vp,1);   // P→VP (dashed amber)
    asg(g,A,aT,COL.hp,1); asg(g,B,bT,COL.hp,1);   // P→HP (dashed teal)
  }

  // Front view a'b' on VP — darkened/bold when it equals the true length
  if(v.showFV){
    fvTrue ? asgBold(g,aF,bF,COL.vp) : asg(g,aF,bF,COL.vp,0);
    acr(g,aF[0],aF[1],0,.13,COL.vp,false); acr(g,bF[0],bF[1],0,.13,COL.vp,false);
    if(tLabels){ albBox(g,"a'",aF[0]-.32,aF[1]+.34,.05,COL.vp,.34); albBox(g,"b'",bF[0]+.32,bF[1]+.34,.05,COL.vp,.34); }
  }
  // Top view ab on HP — darkened/bold when it equals the true length
  if(v.showTV){
    tvTrue ? asgBold(g,aT,bT,COL.hp) : asg(g,aT,bT,COL.hp,0);
    acr(g,aT[0],0,aT[2],.13,COL.hp,true); acr(g,bT[0],0,bT[2],.13,COL.hp,true);
    if(tLabels){ albBox(g,'a',aT[0]-.32,.2,aT[2],COL.hp,.32); albBox(g,'b',bT[0]+.32,.2,bT[2],COL.hp,.32); }
  }

  // The true line AB in space — always the True Length, so always drawn dark + bold
  asgBold(g,A,B,COL.ink);
  asp(g,A[0],A[1],A[2],.15,COL.ink); asp(g,B[0],B[1],B[2],.15,COL.ink);
  if(tLabels){
    albBox(g,'A',A[0]-.32,A[1]+.36,A[2]+.15,COL.ink,.34);
    albBox(g,'B',B[0]+.32,B[1]+.36,B[2]+.15,COL.ink,.34);
  }
  if(tDims){
    const mid=[(A[0]+B[0])/2,(A[1]+B[1])/2+.35,(A[2]+B[2])/2];
    alb(g,`TL ${M.tl.toFixed(0)}`,mid[0],mid[1],mid[2],COL.ink,1.7,.4,true);
  }

  // True inclinations marked in 3D: θ with HP (dark teal) measured at A from the
  // horizontal; φ with VP (dark amber) measured at B from the VP-parallel direction.
  const dL=[B[0]-A[0],B[1]-A[1],B[2]-A[2]];
  if(M.theta>1 && M.theta<89.5)
    angle3(g,A,[dL[0],0,dL[2]],dL,1.4,mix(COL.hp,COL.ink,.42),`θ=${M.theta.toFixed(0)}°`);
  if(M.phi>1 && M.phi<89.5){
    const dB=[-dL[0],-dL[1],-dL[2]];
    angle3(g,B,[dB[0],dB[1],0],dB,1.4,mix(COL.vp,COL.ink,.42),`φ=${M.phi.toFixed(0)}°`);
  }
}

// Shared 2D layout — the single source of truth for where the front view (FV,
// above XY) and top view (TV, below XY) land on the sheet. draw2D and the Traces /
// True-Length overlays all consume this so their geometry is pixel-aligned.
function sheet2D(M){
  const HW=6.2, HH=4.6;
  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const aUp=W(M.A.y), bUp=W(M.B.y), aDn=W(M.A.z), bDn=W(M.B.z);
  const maxX=Math.max(Math.abs(ax),Math.abs(bx),1e-3);
  const maxV=Math.max(aUp,bUp,aDn,bDn,1e-3);
  const fit=Math.min(1,(HW-0.9)/maxX,(HH-0.9)/maxV);
  const F=n=>n*fit;
  return { HW, HH, F,
    A1:[F(ax),F(aUp),0], B1:[F(bx),F(bUp),0],     // a' b'  elevation (primed)
    A2:[F(ax),-F(aDn),0], B2:[F(bx),-F(bDn),0],   // a  b   plan (unprimed)
    fvTrue:Math.abs(M.fvLen-M.tl)<0.5, tvTrue:Math.abs(M.tvLen-M.tl)<0.5,
    fvPoint:M.fvLen<0.6, tvPoint:M.tvLen<0.6 };
}

// ═══════════════════════════════════════════════════════════════
// 2D SCENE — the orthographic sheet: FV above XY, TV below XY,
// joined by vertical projectors. Auto-fits so any line stays in frame.
// ═══════════════════════════════════════════════════════════════
function draw2D(g,M,v){
  const HW=6.2, HH=4.6;
  alp(g,[[-HW-.3,-HH-.3,0],[HW+.3,-HH-.3,0],[HW+.3,HH+.3,0],[-HW-.3,HH+.3,0]],COL.border);
  asg(g,[-HW-.3,0,0],[HW+.3,0,0],COL.ink,0);                    // XY line
  if(tLabels){
    alb(g,'x',-HW-.05,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',HW+.05,.38,0,COL.ink,.85,.72,false,128);
    alb(g,'VP',-HW+.5,2.4,0,COL.vp,1.5,.9,false,128); alb(g,'HP',-HW+.5,-2.4,0,COL.hp,1.5,.9,false,128);
  }
  if(!(v.showFV && v.showTV)){
    alb(g,'Front & top views appear here',0,0,0,COL.bench,4.6,.42);
    return;
  }

  const L=sheet2D(M);
  const {F,A1,B1,A2,B2,fvTrue,tvTrue,fvPoint,tvPoint}=L;

  // Vertical projectors linking the two views through XY
  if(tProj){
    asg(g,[A1[0],A1[1],0],[A2[0],A2[1],0],COL.bench,1);
    asg(g,[B1[0],B1[1],0],[B2[0],B2[1],0],COL.bench,1);
  }

  // FRONT VIEW (elevation) — amber, darkened + bold when it equals true length
  if(fvPoint){ acr(g,A1[0],A1[1],0,.2,COL.vp,false); }
  else {
    fvTrue ? asgBold(g,A1,B1,COL.vp) : asg(g,A1,B1,COL.vp,0);
    acr(g,A1[0],A1[1],0,.16,COL.vp,false); acr(g,B1[0],B1[1],0,.16,COL.vp,false);
  }
  // TOP VIEW (plan) — teal, darkened + bold when it equals true length
  if(tvPoint){ acr(g,A2[0],A2[1],0,.2,COL.hp,false); }
  else {
    tvTrue ? asgBold(g,A2,B2,COL.hp) : asg(g,A2,B2,COL.hp,0);
    acr(g,A2[0],A2[1],0,.16,COL.hp,false); acr(g,B2[0],B2[1],0,.16,COL.hp,false);
  }

  // Names: elevation is PRIMED (a'b'), plan is UNPRIMED (ab); plus a clear caption
  if(tLabels){
    if(fvPoint){ albBox(g,"a'b'",A1[0]+.58,A1[1]+.48,0,COL.vp,.40); }
    else { albBox(g,"a'",A1[0]-.45,A1[1]+.45,0,COL.vp,.38); albBox(g,"b'",B1[0]+.45,B1[1]+.45,0,COL.vp,.38); }
    if(tvPoint){ albBox(g,'ab',A2[0]+.58,A2[1]-.48,0,COL.hp,.40); }
    else { albBox(g,'a',A2[0]-.45,A2[1]-.45,0,COL.hp,.38); albBox(g,'b',B2[0]+.45,B2[1]-.45,0,COL.hp,.38); }
    alb(g,'ELEVATION (a′b′)',-HW+2.0,HH-.35,0,COL.vp,3.0,.5,false,256);
    alb(g,'PLAN (ab)',-HW+1.4,-HH+.35,0,COL.hp,2.1,.5,false,256);
  }

  // Angle marks — each view's inclination to XY. A TRUE angle (θ when the FV is
  // true length, φ when the TV is) is drawn darkened/bold; apparent α/β are normal.
  if(!fvPoint && M.alpha>1.0){
    const V=A1[1]<=B1[1]?A1:B1, P=A1[1]<=B1[1]?B1:A1;
    markAngle(g,V,P,COL.vp, fvTrue?`θ=${M.theta.toFixed(0)}°`:`α=${M.alpha.toFixed(0)}°`, fvTrue);
  }
  if(!tvPoint && M.beta>1.0){
    const V=Math.abs(A2[1])<=Math.abs(B2[1])?A2:B2, P=Math.abs(A2[1])<=Math.abs(B2[1])?B2:A2;
    markAngle(g,V,P,COL.hp, tvTrue?`φ=${M.phi.toFixed(0)}°`:`β=${M.beta.toFixed(0)}°`, tvTrue);
  }

  // Dimensions — view lengths. The view that equals the True Length is tagged
  // "= TL" and darkened, so it is clear at a glance whether the elevation or the
  // plan carries the true length.
  if(tDims){
    if(!fvPoint){ const m=[(A1[0]+B1[0])/2,(A1[1]+B1[1])/2,0];
      alb(g,`${M.fvLen.toFixed(0)} cm${fvTrue?' = TL':''}`,m[0],m[1]+.6,0,fvTrue?mix(COL.vp,COL.ink,.55):COL.vp,fvTrue?2.5:1.7,.5,true,256); }
    if(!tvPoint){ const m=[(A2[0]+B2[0])/2,(A2[1]+B2[1])/2,0];
      alb(g,`${M.tvLen.toFixed(0)} cm${tvTrue?' = TL':''}`,m[0],m[1]-.6,0,tvTrue?mix(COL.hp,COL.ink,.55):COL.hp,tvTrue?2.5:1.7,.5,true,256); }
  }
}

// ═══════════════════════════════════════════════════════════════
// FOLD ANIMATION — REVERSIBLE. Only the HP group rotates about the X-axis;
// the camera never moves. Forward (flatten) swings HP +90° and dissolves the
// 3D depth cues to leave a clean orthographic sheet. Reverse (fold back) plays
// the exact same timeline backwards: HP swings home and the depth cues return,
// ending in the live 3D scene. The button toggles between the two.
// ═══════════════════════════════════════════════════════════════
const FOLD_LABEL   = '▶ Generate Orthographic Projection';
const UNFOLD_LABEL = '↩ Fold back to 3D';
const FOLD_DURATION = 2800, FOLD_SPLIT = 0.72, FOLD_ANGLE = Math.PI/2;

function resetFoldButton(){ const b=$('btn-fold'); if(b){ b.disabled=false; b.textContent=FOLD_LABEL; } }

// The forward (flatten) state at normalised progress p ∈ [0,1]: HP rotation and
// the shared opacity of the fading depth cues. Reverse simply evaluates this at
// (1 − t), so the two directions are exact mirror images.
function foldStateAt(p){
  const foldT=Math.min(p/FOLD_SPLIT,1), ease=1-Math.pow(1-foldT,3);
  const op = p<=FOLD_SPLIT ? 1 : Math.max(0,1-(p-FOLD_SPLIT)/(1-FOLD_SPLIT));
  return { rot: FOLD_ANGLE*ease, op };
}

function runFold(){
  if(animating) return;
  if(conMode) exitCon();                  // leave any construction overlay first
  const v=viewFor(step);
  if(!(v.showFV && v.showTV)) return;     // nothing to fold yet
  folded ? foldBackTo3D() : flattenTo2D();
}

function flattenTo2D(){
  if(reduceMotion.matches){
    if(mainIs3D) swap();
    folded=true; $('btn-fold').textContent=UNFOLD_LABEL;
    announce('Views unfolded. Showing the 2D drawing.');
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

// Build the fold scene (static VP + front view, the rotating hpGroup with the top
// view, and the dynamic HP projectors). Returns the rotating group, the fading
// cue list, and the projector trackers. Mirrors draw3D's coordinate system so the
// transition is seamless in either direction.
function buildFoldScene(){
  const M=resolveLine(data);
  const S=9, g=S3.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=S3.lineMats; curMats.length=0;
  const [rw,rh]=sizeOf(true); curRes.set(rw,rh);

  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const A=[ax,W(M.A.y),W(M.A.z)], B=[bx,W(M.B.y),W(M.B.z)];
  const aF=[ax,W(M.A.y),0], bF=[bx,W(M.B.y),0];
  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP (static)
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);

  // Front view a'b' + connectors to XY (stay in z=0 plane) — KEEP
  asg(g,aF,bF,COL.vp,0);
  asg(g,aF,[ax,0,0],COL.vp,1); asg(g,bF,[bx,0,0],COL.vp,1);
  acr(g,aF[0],aF[1],0,.16,COL.vp,false); acr(g,bF[0],bF[1],0,.16,COL.vp,false);
  albBox(g,"a'",aF[0]-.34,aF[1]+.36,.05,COL.vp,.32); albBox(g,"b'",bF[0]+.34,bF[1]+.36,.05,COL.vp,.32);

  // Depth cues (FADE): the true line AB, endpoints, and the VP perpendicular projectors
  asgBold(g,A,B,COL.ink); fade.push(last());
  asp(g,A[0],A[1],A[2],.15,COL.ink); fade.push(last());
  asp(g,B[0],B[1],B[2],.15,COL.ink); fade.push(last());
  albBox(g,'A',A[0]-.32,A[1]+.36,A[2]+.15,COL.ink,.3); fade.push(last());
  albBox(g,'B',B[0]+.32,B[1]+.36,B[2]+.15,COL.ink,.3); fade.push(last());
  asg(g,A,aF,COL.vp,1); fade.push(last());
  asg(g,B,bF,COL.vp,1); fade.push(last());

  // hpGroup (rotates about X): HP plane + top view ab + connectors to XY
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  const hpMesh=new THREE.Mesh(new THREE.PlaneGeometry(S,S),
    new THREE.MeshBasicMaterial({color:new THREE.Color(COL.hp),transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  hpMesh.rotation.x=-Math.PI/2; hpGroup.add(hpMesh);
  alp(hpGroup,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  alb(hpGroup,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78);
  const aT=[ax,0,W(M.A.z)], bT=[bx,0,W(M.B.z)];
  asg(hpGroup,aT,bT,COL.hp,0);
  asg(hpGroup,aT,[ax,0,0],COL.hp,0); asg(hpGroup,bT,[bx,0,0],COL.hp,0);
  acr(hpGroup,aT[0],0,aT[2],.16,COL.hp,true); acr(hpGroup,bT[0],0,bT[2],.16,COL.hp,true);
  albBox(hpGroup,'a',aT[0]-.34,.2,aT[2],COL.hp,.3); albBox(hpGroup,'b',bT[0]+.34,.2,bT[2],COL.hp,.3);

  // Dynamic HP perpendicular projectors (P→moving foot) — FADE
  const trackers=[{from:A,foot:aT},{from:B,foot:bT}].map(({from,foot})=>{
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from),new THREE.Vector3(...foot)]);
    const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
    line.computeLineDistances(); g.add(line); fade.push(line);
    const t=new THREE.Object3D(); t.position.set(...foot); hpGroup.add(t);
    return {geo,from,t};
  });

  for(const o of fade){ if(o.material) o.material.transparent=true; }
  return { hpGroup, fade, trackers };
}

function animateFold(reverse){
  animating=true;
  const btn=$('btn-fold'); btn.disabled=true; btn.textContent = reverse ? 'Folding…' : 'Generating…';
  if(!mainIs3D) swap();

  const g=S3.grp;
  const { hpGroup, fade, trackers } = buildFoldScene();
  const tmp=new THREE.Vector3();

  // Apply a given timeline state to the scene (rotation, fade, projector geometry).
  const apply=p=>{
    const { rot, op }=foldStateAt(p);
    hpGroup.rotation.x=rot;
    for(const o of fade){ if(o.material) o.material.opacity=op; }
    for(const tr of trackers){ tr.t.getWorldPosition(tmp); tr.geo.setFromPoints([new THREE.Vector3(...tr.from),tmp.clone()]); }
    g.children.forEach(o=>{ if(o.isLine && o.material?.isLineDashedMaterial) o.computeLineDistances(); });
  };

  apply(reverse ? 1 : 0);          // freeze the correct first frame (no flash / no jump)
  const startTime=performance.now();

  function frame(now){
    const t=Math.min((now-startTime)/FOLD_DURATION,1);
    apply(reverse ? 1-t : t);
    if(t<1){ requestAnimationFrame(frame); return; }

    if(reverse){
      animating=false; folded=false;
      rebuild(data);               // restore the live, interactive 3D scene
      resetFoldButton();
      announce('Folded back into the 3D view — the line is restored in space.');
    } else {
      animating=false; folded=true;
      btn.disabled=false; btn.textContent=UNFOLD_LABEL;
      announce('Top view unfolded onto the vertical plane — the orthographic projection is complete.');
    }
  }
  requestAnimationFrame(frame);
}

// ═══════════════════════════════════════════════════════════════
// CONSTRUCTION OVERLAYS — Traces (HT/VT) and the True-Length rotating-line
// method. Both are pure-2D constructions animated on the orthographic sheet (S2),
// frozen when complete. Any rebuild() (slider, step nav, reset) tears them down.
// ═══════════════════════════════════════════════════════════════
const clamp01=x=>Math.min(1,Math.max(0,x));
const lc=(x,a,b)=>clamp01((x-a)/(b-a));
const lerp2=(P,Q,t)=>[P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t];
const easeOut=t=>1-Math.pow(1-t,3);

// Thin construction line (kept thin on purpose — these are drafting aids). Returns
// the THREE.Line; update its ends with setSeg / its arc with setArc.
function conLine(g,colHex,dashed){
  const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const mat=dashed?new THREE.LineDashedMaterial({color:new THREE.Color(colHex),dashSize:.16,gapSize:.12,transparent:true})
                  :new THREE.LineBasicMaterial({color:new THREE.Color(colHex),transparent:true});
  const l=new THREE.Line(geo,mat); g.add(l); return l;
}
function setSeg(l,a,b){ l.geometry.setFromPoints([new THREE.Vector3(a[0],a[1],a[2]||0),new THREE.Vector3(b[0],b[1],b[2]||0)]); if(l.material.isLineDashedMaterial) l.computeLineDistances(); }
function setArc(l,cx,cy,r,a0,a1){
  const n=Math.max(2,Math.ceil(Math.abs(a1-a0)/0.12)), pts=[];
  for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; pts.push(new THREE.Vector3(cx+Math.cos(a)*r,cy+Math.sin(a)*r,0)); }
  l.geometry.setFromPoints(pts); if(l.material.isLineDashedMaterial) l.computeLineDistances();
}
function setFat(line,a,b){ line.geometry.setPositions([a[0],a[1],a[2]||0,b[0],b[1],b[2]||0]); line.computeLineDistances(); }
function setOp(o,val){ o.traverse(c=>{ if(c.material){ c.material.transparent=true; c.material.opacity=val; } }); }

// Marker = optional soft glow disc + a crisp cross + a boxed label, grouped at (x,y).
function conMarker(parent,x,y,colHex,txt,glow,h=0.3,dx=0.0,dy=0.42){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  if(glow){ const m=new THREE.Mesh(new THREE.CircleGeometry(0.3,28),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,opacity:.32,depthTest:false})); m.renderOrder=2; grp.add(m); }
  acr(grp,0,0,0,.16,colHex,false);
  if(txt) albBox(grp,txt,dx,dy,0,colHex,h);
  return grp;
}
function conLabel(parent,x,y,colHex,txt,h=0.34){ const grp=new THREE.Group(); parent.add(grp); albBox(grp,txt,x,y,0,colHex,h); return grp; }

// Small engineering circle (drafting point — a thin ring + a tiny centre dot), at
// roughly endpoint-marker scale. Used for HT / VT instead of a large filled blob.
function engCircle(parent,x,y,colHex,r=0.15){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  const n=36, flat=[]; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2; flat.push(Math.cos(a)*r,Math.sin(a)*r,0); }
  fatLine(grp,flat,colHex,2.0,false);
  const dot=new THREE.Mesh(new THREE.CircleGeometry(r*0.3,16),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,depthTest:false})); dot.renderOrder=3; grp.add(dot);
  return grp;
}
// Tiny filled point (for h / v on XY).
function smallDot(parent,x,y,colHex,r=0.07){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  const d=new THREE.Mesh(new THREE.CircleGeometry(r,18),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,depthTest:false})); d.renderOrder=3; grp.add(d);
  return grp;
}
// Right-angle (⊥) symbol where a projector crosses XY at (x,0). down=true opens into
// HP (−y, for HT); down=false opens into VP (+y, for VT).
function raSymbol(parent,x,down,colHex,s=0.2){
  const grp=new THREE.Group(); parent.add(grp);
  const dy=down?-s:s;
  fatLine(grp,[x+s,0,0, x+s,dy,0, x,dy,0],colHex,1.7,false);
  return grp;
}

// Reusable sheet pieces (frame + the two views) so overlays match draw2D exactly.
function drawSheetFrame(g,L){
  const {HW,HH}=L;
  alp(g,[[-HW-.3,-HH-.3,0],[HW+.3,-HH-.3,0],[HW+.3,HH+.3,0],[-HW-.3,HH+.3,0]],COL.border);
  asg(g,[-HW-.3,0,0],[HW+.3,0,0],COL.ink,0);
  if(tLabels){
    alb(g,'x',-HW-.05,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',HW+.05,.38,0,COL.ink,.85,.72,false,128);
    alb(g,'VP',-HW+.5,2.4,0,COL.vp,1.5,.9,false,128); alb(g,'HP',-HW+.5,-2.4,0,COL.hp,1.5,.9,false,128);
  }
}
function drawSheetViews(g,M,L){
  const {A1,B1,A2,B2,fvTrue,tvTrue,fvPoint,tvPoint}=L;
  if(tProj){ asg(g,[A1[0],A1[1],0],[A2[0],A2[1],0],COL.bench,1); asg(g,[B1[0],B1[1],0],[B2[0],B2[1],0],COL.bench,1); }
  if(fvPoint){ acr(g,A1[0],A1[1],0,.2,COL.vp,false); }
  else { fvTrue?asgBold(g,A1,B1,COL.vp):asg(g,A1,B1,COL.vp,0); acr(g,A1[0],A1[1],0,.16,COL.vp,false); acr(g,B1[0],B1[1],0,.16,COL.vp,false); }
  if(tvPoint){ acr(g,A2[0],A2[1],0,.2,COL.hp,false); }
  else { tvTrue?asgBold(g,A2,B2,COL.hp):asg(g,A2,B2,COL.hp,0); acr(g,A2[0],A2[1],0,.16,COL.hp,false); acr(g,B2[0],B2[1],0,.16,COL.hp,false); }
  if(tLabels){
    if(fvPoint) albBox(g,"a'b'",A1[0]+.58,A1[1]+.48,0,COL.vp,.34);
    else { albBox(g,"a'",A1[0]-.45,A1[1]+.45,0,COL.vp,.32); albBox(g,"b'",B1[0]+.45,B1[1]+.45,0,COL.vp,.32); }
    if(tvPoint) albBox(g,'ab',A2[0]+.58,A2[1]-.48,0,COL.hp,.34);
    else { albBox(g,'a',A2[0]-.45,A2[1]-.45,0,COL.hp,.32); albBox(g,'b',B2[0]+.45,B2[1]-.45,0,COL.hp,.32); }
  }
}

// Clear S2 and prepare it for an overlay build (mirrors fill()'s bookkeeping).
function beginConScene(){
  const g=S2.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=S2.lineMats; curMats.length=0;
  const [rw,rh]=sizeOf(false); curRes.set(rw,rh);
  return g;
}

// ── Mode lifecycle ────────────────────────────────────────────
// The launchers are disclosure toggles: expose both pressed (on/off) and expanded
// (panel shown) so screen readers announce state on activation.
function setConBtn(id,on){ const b=$(id); if(!b) return; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); b.setAttribute('aria-expanded',String(on)); }
// Single source of truth for the play/pause control's label, icon, and state.
function setPlayBtn(playing){ const b=$('tl-play'); if(!b) return; b.textContent=playing?'⏸':'▶'; b.setAttribute('aria-label',playing?'Pause construction':'Play construction'); b.setAttribute('aria-pressed',String(playing)); }
function teardownConUI(){
  cancelAnimationFrame(conRAF); conRAF=null; conApply=null;
  tlPlaying=false; conMode=null;
  setConBtn('btn-traces',false); setConBtn('btn-tl',false);
  const tp=$('traces-panel'); if(tp) tp.hidden=true;
  const lp=$('tl-panel'); if(lp) lp.hidden=true;
  setPlayBtn(false);
}
function exitCon(){ teardownConUI(); rebuild(data); }
// Used by value-editing controls (sliders / number fields / toggles). If a
// construction overlay is open, editing values tears it down — so say so once,
// rather than letting the drawing vanish without explanation.
function rebuildFromEdit(d){ const wasCon=conMode; rebuild(d); if(wasCon) announce('Construction closed — now showing live values. Reopen Traces or True Length to rebuild it.'); }
function runConAnim(dur){
  cancelAnimationFrame(conRAF);
  const start=performance.now();
  const step=now=>{ const t=Math.min((now-start)/dur,1); conApply && conApply(t); if(t<1) conRAF=requestAnimationFrame(step); };
  conRAF=requestAnimationFrame(step);
}

// ── Traces (HT / VT) ──────────────────────────────────────────
function xAtY(P,Q,y){ const dy=Q[1]-P[1]; if(Math.abs(dy)<1e-4) return null; return P[0]+(Q[0]-P[0])*(y-P[1])/dy; }
function yAtX(P,Q,x){ const dx=Q[0]-P[0]; if(Math.abs(dx)<1e-4) return null; return P[1]+(Q[1]-P[1])*(x-P[0])/dx; }
function computeTraces(L){
  const {A1,B1,A2,B2}=L;
  let h=null,HT=null,v=null,VT=null;
  const xh=xAtY(A1,B1,0);                                  // FV produced → XY
  if(xh!==null){ h=[xh,0]; let y=yAtX(A2,B2,xh); if(y===null) y=A2[1]; HT=[xh,y]; }
  const xv=xAtY(A2,B2,0);                                  // TV produced → XY
  if(xv!==null){ v=[xv,0]; let y=yAtX(A1,B1,xv); if(y===null) y=A1[1]; VT=[xv,y]; }
  return { h,HT,v,VT, noHT:!HT, noVT:!VT };
}
function enterTrace(){
  if(conMode==='trace') return;
  teardownConUI();
  if(folded){ folded=false; resetFoldButton(); }
  rebuild(data);                       // restore clean scenes first
  conMode='trace';
  if(mainIs3D) swap();                 // show the 2D drawing large
  setConBtn('btn-traces',true);
  $('traces-panel').hidden=false;
  buildTraceScene();
  // Reduced motion: skip the construction tween, show the finished traces at once
  // (the lesson still updates — only the animation is suppressed).
  reduceMotion.matches ? conApply(1) : runConAnim(5400);
}
// Standard EG trace construction (per view): SOLID original projection (drawn by
// drawSheetViews) → DASHED extension to XY at h/v → DASHED perpendicular projector
// (slightly darker) with a ⊥ symbol → DASHED extension of the OTHER view → the
// small engineering-circle trace (HT teal / VT amber) at the intersection.
function buildTraceScene(){
  const M=resolveLine(data), L=sheet2D(M), g=beginConScene();
  drawSheetFrame(g,L); drawSheetViews(g,M,L);
  const {A1,B1,A2,B2}=L, T=computeTraces(L), cap=$('trace-cap');
  const PCOL=mix(COL.construct,COL.ink,0.5);     // projector: darker than extensions
  const both=!T.noHT && !T.noVT;

  const feNear=Math.abs(A1[1])<=Math.abs(B1[1])?A1:B1;   // FV end nearest XY → starts the extension
  const teNear=Math.abs(A2[1])<=Math.abs(B2[1])?A2:B2;

  let extFV,projHT,tvExt,hG,htG,raH, extTV,projVT,fvExt,vG,vtG,raV, tvNear,fvNear;
  if(!T.noHT){
    tvNear=Math.abs(A2[0]-T.HT[0])<=Math.abs(B2[0]-T.HT[0])?A2:B2;   // TV end nearest HT
    extFV=conLine(g,COL.construct,true);
    projHT=conLine(g,PCOL,true);
    tvExt=conLine(g,COL.construct,true);
    raH=raSymbol(g,T.h[0],true,PCOL);
    hG=smallDot(g,T.h[0],T.h[1],COL.ink); albBox(hG,'h',0,-0.34,0,COL.ink,.26);
    htG=engCircle(g,T.HT[0],T.HT[1],COL.hp,.15); albBox(htG,'HT',0.46,-0.04,0,COL.hp,.3);
  }
  if(!T.noVT){
    fvNear=Math.abs(A1[0]-T.VT[0])<=Math.abs(B1[0]-T.VT[0])?A1:B1;
    extTV=conLine(g,COL.construct,true);
    projVT=conLine(g,PCOL,true);
    fvExt=conLine(g,COL.construct,true);
    raV=raSymbol(g,T.v[0],false,PCOL);
    vG=smallDot(g,T.v[0],T.v[1],COL.ink); albBox(vG,'v',0,0.34,0,COL.ink,.26);
    vtG=engCircle(g,T.VT[0],T.VT[1],COL.vp,.15); albBox(vtG,'VT',0.5,0.04,0,COL.vp,.3);
  }

  // Six-step windows (extend · find h/v · perpendicular projector · extend other
  // view · reveal trace). `both` runs HT then VT; a lone trace gets the full span.
  const HT_E=both?[0,.12]:[0,.16], HT_P=both?[.14,.26]:[.18,.42],
        HT_X=both?[.27,.39]:[.44,.66], HT_R=both?.42:.74;
  const VT_E=both?[.50,.62]:[0,.16], VT_P=both?[.64,.76]:[.18,.42],
        VT_X=both?[.77,.89]:[.44,.66], VT_R=both?.92:.74;

  conApply = prog=>{
    if(!T.noHT){
      setSeg(extFV, feNear, lerp2(feNear,T.h, easeOut(lc(prog,HT_E[0],HT_E[1])))); setOp(extFV, prog>HT_E[0]?1:0);
      setOp(hG, lc(prog,HT_E[1]-.03,HT_E[1]+.03));
      setSeg(projHT, T.h, [T.h[0], T.h[1]+(T.HT[1]-T.h[1])*easeOut(lc(prog,HT_P[0],HT_P[1]))]); setOp(projHT, prog>=HT_P[0]?1:0);
      setOp(raH, lc(prog,HT_P[0]+.02,HT_P[0]+.08));
      setSeg(tvExt, tvNear, lerp2(tvNear,T.HT, easeOut(lc(prog,HT_X[0],HT_X[1])))); setOp(tvExt, prog>=HT_X[0]?1:0);
      setOp(htG, lc(prog,HT_R-.02,HT_R+.05));
    }
    if(!T.noVT){
      setSeg(extTV, teNear, lerp2(teNear,T.v, easeOut(lc(prog,VT_E[0],VT_E[1])))); setOp(extTV, prog>VT_E[0]?1:0);
      setOp(vG, lc(prog,VT_E[1]-.03,VT_E[1]+.03));
      setSeg(projVT, T.v, [T.v[0], T.v[1]+(T.VT[1]-T.v[1])*easeOut(lc(prog,VT_P[0],VT_P[1]))]); setOp(projVT, prog>=VT_P[0]?1:0);
      setOp(raV, lc(prog,VT_P[0]+.02,VT_P[0]+.08));
      setSeg(fvExt, fvNear, lerp2(fvNear,T.VT, easeOut(lc(prog,VT_X[0],VT_X[1])))); setOp(fvExt, prog>=VT_X[0]?1:0);
      setOp(vtG, lc(prog,VT_R-.02,VT_R+.05));
    }
    let msg;
    if(T.noHT&&T.noVT) msg='Line ∥ to both planes — it has no traces.';
    else if(both){
      if(prog<HT_P[0]) msg='Extend the front view to XY → h';
      else if(prog<HT_X[0]) msg='From h, drop a projector ⊥ to XY';
      else if(prog<HT_R) msg='Extend the top view to meet the projector';
      else if(prog<VT_E[0]) msg='HT — front view extension meets the top view';
      else if(prog<VT_P[0]) msg='Extend the top view to XY → v';
      else if(prog<VT_X[0]) msg='From v, raise a projector ⊥ to XY';
      else if(prog<VT_R) msg='Extend the front view to meet the projector';
      else msg='VT — top view extension meets the front view';
    } else if(!T.noHT){
      msg = prog<HT_P[0] ? 'Extend the front view to XY → h'
          : prog<HT_X[0] ? 'From h, drop a projector ⊥ to XY'
          : prog<HT_R    ? 'Extend the top view to meet the projector'
          : 'HT found · line ∥ VP, so there is no VT';
    } else {
      msg = prog<VT_P[0] ? 'Extend the top view to XY → v'
          : prog<VT_X[0] ? 'From v, raise a projector ⊥ to XY'
          : prog<VT_R    ? 'Extend the front view to meet the projector'
          : 'VT found · line ∥ HP, so there is no HT';
    }
    if(cap && cap.textContent!==msg) cap.textContent=msg;
  };
  conApply(0);
}

// ── True Length & Angles (Rotating-Line method) ───────────────
const TL_N = 12, TL_PHASE_MS = 1150;
const TL_STEP_TEXT = [
  'Step 1 · Rotate the top view about a until it is parallel to XY.',
  'Step 2 · Draw the locus arc swept by the rotated end.',
  'Step 3 · Project the rotated end upward.',
  'Step 4 · Meet the horizontal locus of the front-view end → b₁′.',
  'Step 5 · Join a′–b₁′ — this is the True Length.',
  'Step 6 · Measure θ — the true inclination with HP.',
  'Step 1 · Rotate the front view about a until it is parallel to XY.',
  'Step 2 · Draw the locus arc swept by the rotated end.',
  'Step 3 · Project the rotated end downward.',
  'Step 4 · Meet the horizontal locus of the top-view end → b₁.',
  'Step 5 · Join a–b₁ — the True Length (same value).',
  'Step 6 · Measure φ — the true inclination with VP.',
];
function setTLCaption(){
  // Only write when the text actually changes — these are aria-live regions and
  // applyTLState runs every frame during play; re-setting identical text re-announces.
  const c=$('tl-cap'), s=$('tl-step');
  const cap = tlPhase<6 ? 'Part A — Top-View Rotation → TL & θ' : 'Part B — Front-View Rotation → TL & φ';
  if(c && c.textContent!==cap) c.textContent=cap;
  const st = TL_STEP_TEXT[tlPhase];
  if(s && s.textContent!==st) s.textContent=st;
}
function enterTL(){
  if(conMode==='tl') return;
  teardownConUI();
  if(folded){ folded=false; resetFoldButton(); }
  rebuild(data);
  conMode='tl';
  if(mainIs3D) swap();
  setConBtn('btn-tl',true);
  $('tl-panel').hidden=false;
  buildTLScene();
  tlPhase=0; tlPhaseT=0; tlPlaying=false; setPlayBtn(false);
  applyTLState();
}
function buildTLScene(){
  const M=resolveLine(data), L=sheet2D(M), g=beginConScene();
  drawSheetFrame(g,L);

  const {A1,B1,A2,B2}=L;
  const pivotIsA = A1[0]<=B1[0];
  const fvPiv=pivotIsA?A1:B1, fvOth=pivotIsA?B1:A1;
  const tvPiv=pivotIsA?A2:B2, tvOth=pivotIsA?B2:A2;
  const pivX=fvPiv[0];
  const Lplan=Math.hypot(tvOth[0]-tvPiv[0],tvOth[1]-tvPiv[1]);
  const Lelev=Math.hypot(fvOth[0]-fvPiv[0],fvOth[1]-fvPiv[1]);
  const tvRot=[pivX+Lplan,tvPiv[1]], fvRot=[pivX+Lelev,fvPiv[1]];
  const bTLA=[pivX+Lplan,fvOth[1]],  bTLB=[pivX+Lelev,tvOth[1]];
  const startA=Math.atan2(tvOth[1]-tvPiv[1],tvOth[0]-tvPiv[0]);
  const startB=Math.atan2(fvOth[1]-fvPiv[1],fvOth[0]-fvPiv[0]);

  // Fit everything (incl. the rightward rotation extents) into the sheet. Scale is
  // uniform about the origin so XY (y=0) stays put; only x is recentred.
  const xs=[pivX,fvOth[0],tvRot[0],fvRot[0],-L.HW*0.5], ys=[fvPiv[1],fvOth[1],tvPiv[1],tvOth[1]];
  const maxX=Math.max(...xs), minX=Math.min(...xs), maxAbsY=Math.max(...ys.map(Math.abs),0.5);
  const s=Math.min(1,(2*L.HW*0.9)/Math.max(maxX-minX,0.5),(L.HH*0.92)/maxAbsY);
  const root=new THREE.Group(); g.add(root);
  root.scale.set(s,s,1); root.position.set(-s*(minX+maxX)/2,0,0);
  drawSheetViews(root,M,L);

  // Part A elements
  const rotTV=conLine(root,COL.hp,false);
  const arcA =conLine(root,COL.locus,false);
  const projA=conLine(root,COL.construct,true);
  const fvLoc=conLine(root,COL.locus,true);
  const markA=conMarker(root,bTLA[0],bTLA[1],COL.tlg,'b₁′',false,.3,.34,.0);
  const tlA  =fatLine(root,[fvPiv[0],fvPiv[1],0,bTLA[0],bTLA[1],0],COL.tlg,LW.bold,false);
  const thetaA=conLine(root,COL.tlg,false);
  const dirA=Math.atan2(bTLA[1]-fvPiv[1],bTLA[0]-fvPiv[0]);
  const thLbl=conLabel(root,fvPiv[0]+Math.cos(dirA/2)*1.15,fvPiv[1]+Math.sin(dirA/2)*1.0,COL.tlg,`θ=${M.theta.toFixed(0)}°`,.34);
  const tlLblA=conLabel(root,(fvPiv[0]+bTLA[0])/2,(fvPiv[1]+bTLA[1])/2+.55,COL.tlg,`TL ${M.tl.toFixed(0)}`,.34);

  // Part B elements
  const rotFV=conLine(root,COL.vp,false);
  const arcB =conLine(root,COL.locus,false);
  const projB=conLine(root,COL.construct,true);
  const tvLoc=conLine(root,COL.locus,true);
  const markB=conMarker(root,bTLB[0],bTLB[1],COL.tlg,'b₁',false,.3,.34,.0);
  const tlB  =fatLine(root,[tvPiv[0],tvPiv[1],0,bTLB[0],bTLB[1],0],COL.tlg,LW.bold,false);
  const phiB =conLine(root,COL.tlg,false);
  const dirB=Math.atan2(bTLB[1]-tvPiv[1],bTLB[0]-tvPiv[0]);
  const phLbl=conLabel(root,tvPiv[0]+Math.cos(dirB/2)*1.15,tvPiv[1]+Math.sin(dirB/2)*1.0,COL.tlg,`φ=${M.phi.toFixed(0)}°`,.34);
  const tlLblB=conLabel(root,(tvPiv[0]+bTLB[0])/2,(tvPiv[1]+bTLB[1])/2-.55,COL.tlg,`TL ${M.tl.toFixed(0)}`,.34);

  const aidsA=[rotTV,arcA,projA,fvLoc], aidsB=[rotFV,arcB,projB,tvLoc];

  conApply = p=>{
    const G=p*TL_N;
    // ---- Part A ----
    { const t=easeOut(lc(G,0,1)), ang=startA+(0-startA)*t;
      setSeg(rotTV,tvPiv,[tvPiv[0]+Math.cos(ang)*Lplan,tvPiv[1]+Math.sin(ang)*Lplan]); setOp(rotTV,G>0?1:0); }
    { const t=easeOut(lc(G,1,2)); setArc(arcA,tvPiv[0],tvPiv[1],Lplan,startA,startA+(0-startA)*t); setOp(arcA,G>=1?1:0); }
    { const t=easeOut(lc(G,2,3)); setSeg(projA,tvRot,[tvRot[0],tvRot[1]+(bTLA[1]-tvRot[1])*t]); setOp(projA,G>=2?1:0);
      setSeg(fvLoc,[fvOth[0],fvOth[1]],[bTLA[0],fvOth[1]]); setOp(fvLoc,lc(G,2.5,3.2)); }
    setOp(markA,lc(G,3,3.5));
    { const t=easeOut(lc(G,4,5)); setFat(tlA,fvPiv,lerp2(fvPiv,bTLA,t)); setOp(tlA,G>=4?1:0); }
    setArc(thetaA,fvPiv[0],fvPiv[1],0.8,0,dirA); setOp(thetaA,lc(G,5,5.4));
    setOp(thLbl,lc(G,5,5.6)); setOp(tlLblA,lc(G,4.3,4.9));
    // ---- Part B ----
    { const t=easeOut(lc(G,6,7)), ang=startB+(0-startB)*t;
      setSeg(rotFV,fvPiv,[fvPiv[0]+Math.cos(ang)*Lelev,fvPiv[1]+Math.sin(ang)*Lelev]); setOp(rotFV,G>=6?1:0); }
    { const t=easeOut(lc(G,7,8)); setArc(arcB,fvPiv[0],fvPiv[1],Lelev,startB,startB+(0-startB)*t); setOp(arcB,G>=7?1:0); }
    { const t=easeOut(lc(G,8,9)); setSeg(projB,fvRot,[fvRot[0],fvRot[1]+(bTLB[1]-fvRot[1])*t]); setOp(projB,G>=8?1:0);
      setSeg(tvLoc,[tvOth[0],tvOth[1]],[bTLB[0],tvOth[1]]); setOp(tvLoc,lc(G,8.5,9.2)); }
    setOp(markB,lc(G,9,9.5));
    { const t=easeOut(lc(G,10,11)); setFat(tlB,tvPiv,lerp2(tvPiv,bTLB,t)); setOp(tlB,G>=10?1:0); }
    setArc(phiB,tvPiv[0],tvPiv[1],0.8,0,dirB); setOp(phiB,lc(G,11,11.4));
    setOp(phLbl,lc(G,11,11.6)); setOp(tlLblB,lc(G,10.3,10.9));
    // Part B started → dim the Part A aids so the sheet stays readable
    if(G>=6){ aidsA.forEach(o=>setOp(o,.18)); }
    if(G< 6){ aidsB.forEach(o=>setOp(o,0)); markB.children&&setOp(markB,0); setOp(tlB,0); setOp(phiB,0); setOp(phLbl,0); setOp(tlLblB,0); }
  };
  conApply(0);
}
function applyTLState(){ const p=(tlPhase+tlPhaseT)/TL_N; conApply && conApply(p); setTLCaption(); }
function tlLoop(now){
  if(conMode!=='tl'||!tlPlaying) return;
  const dt=Math.min(now-tlPrevTime,50); tlPrevTime=now;
  tlPhaseT += dt/TL_PHASE_MS;
  if(tlPhaseT>=1){
    if(tlPhase>=TL_N-1){ tlPhaseT=1; tlPlaying=false; setPlayBtn(false); applyTLState(); return; }
    tlPhase++; tlPhaseT=0;
  }
  applyTLState();
  conRAF=requestAnimationFrame(tlLoop);
}
function playTL(){
  if(conMode!=='tl') return;
  // Reduced motion: no continuous play — jump to the completed construction. The
  // learner reviews it step-by-step with the (instant) Previous / Next controls.
  if(reduceMotion.matches){ tlPhase=TL_N-1; tlPhaseT=1; applyTLState(); return; }
  if(tlPhase>=TL_N-1&&tlPhaseT>=1){ tlPhase=0; tlPhaseT=0; }
  tlPlaying=true; setPlayBtn(true); tlPrevTime=performance.now(); cancelAnimationFrame(conRAF); conRAF=requestAnimationFrame(tlLoop);
}
function pauseTL(){ tlPlaying=false; setPlayBtn(false); cancelAnimationFrame(conRAF); }
function stepTL(dir){
  pauseTL();
  if(dir>0){ if(tlPhaseT<1) tlPhaseT=1; else if(tlPhase<TL_N-1){ tlPhase++; tlPhaseT=1; } }
  else { if(tlPhase>0){ tlPhase--; tlPhaseT=1; } else tlPhaseT=0; }
  applyTLState();
}

// ── Geometry helpers ──────────────────────────────────────────
// Line weights (in CSS pixels — Line2 keeps a constant on-screen thickness at
// any zoom, which is exactly the crisp engineering-drawing look we want).
const LW = { edge:2.6, bold:3.6, border:1.6, proj:1.7, cross:2.4, ref:1.6, arc:2.0, arcBold:2.8 };

function apl(g,s,c,o,e){const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));m.rotation.copy(e);g.add(m);}

// fatLine — the single primitive every stroke now routes through. flat is a flat
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
function asp(g,x,y,z,r,c){const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,18),new THREE.MeshBasicMaterial({color:new THREE.Color(c),depthTest:false}));m.renderOrder=3;m.position.set(x,y,z);g.add(m);}
// Cross marker — two crisp fat strokes (clear engineering-style point symbol).
function acr(g,cx,cy,cz,r,c,is3D){
  if(is3D){ asg(g,[cx-r,cy,cz],[cx+r,cy,cz],c,0,LW.cross); asg(g,[cx,cy,cz-r],[cx,cy,cz+r],c,0,LW.cross); }
  else { asg(g,[cx-r,cy,0],[cx+r,cy,0],c,0,LW.cross); asg(g,[cx,cy-r,0],[cx,cy+r,0],c,0,LW.cross); }
}

// roundRect path (Path2D.roundRect / ctx.roundRect aren't universal yet).
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// High-resolution sprite label. Supersamples the canvas (SS) and uses anisotropic
// filtering so text stays sharp when zoomed out or on small canvases. Sprite
// scales (sx,sy) are unchanged from the validated values — only crispness improves.
function alb(g,txt,x,y,z,c,sx=.7,sy=.35,mono=false,cw=512){
  const SS=3, W=cw*SS, H=128*SS;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,W,H);
  const wt=mono?'600':'bold', base=(mono?40:44)*SS,
        fam=mono?'"IBM Plex Mono",ui-monospace,monospace':'"Atkinson Hyperlegible",system-ui,sans-serif';
  let fs=base; ctx.font=`${wt} ${fs}px ${fam}`;
  const maxW=(cw-24)*SS; let w=ctx.measureText(txt).width;
  if(w>maxW){ fs=Math.floor(base*maxW/w); ctx.font=`${wt} ${fs}px ${fam}`; }
  ctx.fillStyle=c; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,W/2,H/2);
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=MAX_ANISO;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  sp.position.set(x,y,z); sp.scale.set(sx,sy,1); g.add(sp);
}

// Boxed point label — the "engineering software" look for vertex/point names
// (A, B, a′, b′, a, b …): coloured text on a white rounded-rectangle plate with a
// thin tinted border. The canvas is sized to the text so the plate never distorts;
// h is the target world height of the chip and the width follows the text.
function albBox(g,txt,x,y,z,c,h=0.34){
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
// Blend a token colour toward another (used to DARKEN true-length / true-angle
// elements toward ink). Returns a "#rrggbb" string usable by both asg() and alb().
const mix=(a,b,t)=>'#'+new THREE.Color(a).lerp(new THREE.Color(b),t).getHexString();

// True Length is drawn as ONE dark line (a single stroke darkened toward ink) —
// never multi-stroke — so it reads as a single clean bold line in 3D and in 2D.
function asgBold(g,a,b,colHex){
  return fatLine(g,[a[0],a[1],a[2]||0, b[0],b[1],b[2]||0], mix(colHex,COL.ink,0.55), LW.bold, false);
}

// A 3D angle mark: a dashed reference ray from C along refDir, an arc swung to
// lineDir, and a label at the mid-angle — used to show θ (with HP) and φ (with VP).
function angle3(g,C,refDir,lineDir,len,colHex,label){
  const c=new THREE.Vector3(...C);
  const ref=new THREE.Vector3(...refDir); if(ref.lengthSq()<1e-6) return; ref.normalize();
  const ld=new THREE.Vector3(...lineDir); if(ld.lengthSq()<1e-6) return; ld.normalize();
  const axis=new THREE.Vector3().crossVectors(ref,ld); if(axis.lengthSq()<1e-6) return; axis.normalize();
  const refEnd=c.clone().add(ref.clone().multiplyScalar(len));
  asg(g,[c.x,c.y,c.z],[refEnd.x,refEnd.y,refEnd.z],colHex,1,LW.ref);     // dashed reference ray
  const r=len*0.62, ang=ref.angleTo(ld), segs=24, pts=[];
  for(let i=0;i<=segs;i++){ const q=new THREE.Quaternion().setFromAxisAngle(axis,ang*i/segs); const p=c.clone().add(ref.clone().multiplyScalar(r).applyQuaternion(q)); pts.push(p.x,p.y,p.z); }
  fatLine(g,pts,colHex,LW.arc,false);
  const qm=new THREE.Quaternion().setFromAxisAngle(axis,ang*0.5);
  const lp=c.clone().add(ref.clone().multiplyScalar(r+0.6).applyQuaternion(qm));
  alb(g,label,lp.x,lp.y,lp.z,colHex,1.6,.44,true,256);
}

// Arc in the z=0 plane (for angle marks). bold → thicker + darkened.
function arc(g,cx,cy,r,a0,a1,colHex,bold){
  const segs=28, flat=[];
  for(let i=0;i<=segs;i++){ const a=a0+(a1-a0)*i/segs; flat.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r,0); }
  fatLine(g,flat,colHex,bold?LW.arcBold:LW.arc,false);
}

// Mark the angle a 2D view makes with XY: dashed horizontal reference at the
// vertex, an arc up/down to the view line, and a "θ=..°"/"α=..°" label.
// bold=true (a TRUE angle) draws it darkened so it stands out.
function markAngle(g,V,P,colHex,label,bold){
  const dx=P[0]-V[0], dy=P[1]-V[1];
  const dir=Math.atan2(dy,dx), horiz=dx>=0?0:Math.PI;
  const col=bold?mix(colHex,COL.ink,0.55):colHex, r=0.9, tick=1.3;
  asg(g,[V[0],V[1],0],[V[0]+Math.cos(horiz)*tick,V[1],0],col,1);   // dashed horizontal reference
  arc(g,V[0],V[1],r,horiz,dir,col,bold);
  const mid=(horiz+dir)/2;
  alb(g,label,V[0]+Math.cos(mid)*(r+0.7),V[1]+Math.sin(mid)*(r+0.55),0,col,1.7,0.46,true,256);
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

// ── Sliders / readout / notes ─────────────────────────────────
function syncUI(d,M){
  setRange('r-tl','n-tl',d.TL,90, v=>`${v} centimetres true length`);
  setRange('r-th','n-th',d.theta,90, v=>`${v} degrees, inclination with HP`);
  setRange('r-ph','n-ph',d.phi,90, v=>`${v} degrees, inclination with VP`);
  setNote('note-valid', d.case===LineCase.INCL_BOTH && !M.valid
    ? 'θ + φ must stay ≤ 90° for a real line. Reduce one angle.' : '');
}
function setRange(r,n,val,max,vt){
  const rEl=$(r), nEl=$(n); if(!rEl) return;
  const clamped=Math.min(max,Math.max(0,val));
  rEl.value=String(clamped);
  rEl.style.setProperty('--p',(clamped/max*100)+'%');
  rEl.setAttribute('aria-valuetext', vt ? vt(val) : String(val));   // unit-bearing value for screen readers
  nEl.value=String(val);
}
const NOTE_ICO='<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>';
function setNote(id,msg){
  const el=$(id); if(!el) return;
  if(msg){ el.innerHTML=NOTE_ICO+`<span>${msg}</span>`; el.hidden=false; } else { el.textContent=''; el.hidden=true; }
}
function updateReadout(M){
  const set=(id,txt)=>{ const e=$(id); if(e) e.textContent=txt; };
  const near=(a,b)=>Math.abs(a-b)<0.5;
  set('val-tl',`${M.tl.toFixed(0)} cm`);
  set('val-fv',`${M.fvLen.toFixed(0)} cm`);
  set('val-tv',`${M.tvLen.toFixed(0)} cm`);
  set('val-th',`${M.theta.toFixed(0)}°`);
  set('val-ph',`${M.phi.toFixed(0)}°`);
  set('val-al',`${M.alpha.toFixed(0)}°`);
  set('val-be',`${M.beta.toFixed(0)}°`);
  $('val-fv')?.parentElement.classList.toggle('hot',near(M.fvLen,M.tl));
  $('val-tv')?.parentElement.classList.toggle('hot',near(M.tvLen,M.tl));
  const both=data.case===LineCase.INCL_BOTH;
  $('row-al')?.classList.toggle('hot',both); $('row-be')?.classList.toggle('hot',both);
}

function announce(msg){ live.textContent=''; live.textContent=msg; }
let stateTimer=null;
function announceState(M,v){
  clearTimeout(stateTimer);
  stateTimer=setTimeout(()=>{
    const el=$('vp-status'); if(!el) return;
    if(!v.showLine){ el.textContent=''; return; }
    el.textContent=`True length ${M.tl.toFixed(0)} centimetres. Front view ${M.fvLen.toFixed(0)}, top view ${M.tvLen.toFixed(0)}. True inclinations theta ${M.theta.toFixed(0)} degrees with HP, phi ${M.phi.toFixed(0)} with VP.`;
  },250);
}

// ═══════════════════════════════════════════════════════════════
// STEPPER CONTROLLER (reused from the Points module)
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
  if(s.set) data={...data,...s.set};        // each case step sets the line orientation

  document.querySelectorAll('.rail-item').forEach((el,idx)=>{
    el.classList.toggle('done', idx<step);
    el.classList.toggle('current', idx===step);
    el.querySelector('.disc').textContent = idx<step ? '✓' : String(idx+1);
    el.disabled = idx>maxReached;
    if(idx===step) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });

  $('eyebrow').textContent=`Step ${step+1} of ${STEP_COUNT}`;
  $('step-title').textContent=s.title;
  $('step-lead').textContent=s.lead;
  $('step-body').innerHTML=s.body.map(p=>`<p>${p}</p>`).join('');
  const hintEl=$('hint');
  if(s.hint){ $('hint-text').innerHTML=s.hint; hintEl.hidden=false; } else { hintEl.hidden=true; }

  document.querySelectorAll('#controls .ctrl').forEach(el=>{ el.hidden=!s.controls.includes(el.dataset.ctrl); });

  $('btn-back').disabled = step===0;
  const next=$('btn-next');
  next.disabled = step===STEP_COUNT-1;
  next.textContent = step===STEP_COUNT-1 ? 'Done' : 'Next →';

  $('orbit-hint').classList.toggle('show', !!s.orbitHint && !orbitDismissed);

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
  $('r-tl').addEventListener('input',()=>rebuildFromEdit({...data,TL:+$('r-tl').value||0}));
  $('r-th').addEventListener('input',()=>rebuildFromEdit({...data,theta:+$('r-th').value||0}));
  $('r-ph').addEventListener('input',()=>rebuildFromEdit({...data,phi:+$('r-ph').value||0}));
  [['n-tl','TL',90],['n-th','theta',90],['n-ph','phi',90]].forEach(([n,k,max])=>{
    $(n).addEventListener('change',()=>{
      const val=parseFloat($(n).value);
      if(!isFinite(val)||val<0){ syncUI(data,resolveLine(data)); }
      else rebuildFromEdit({...data,[k]:Math.min(max,val)});
    });
  });

  const toggle=(id,get,set)=>{
    const el=$(id);
    el.addEventListener('click',()=>{ set(!get()); el.classList.toggle('on',get()); el.setAttribute('aria-pressed',String(get())); rebuildFromEdit(data); });
  };
  toggle('tg-lbl',()=>tLabels,v=>tLabels=v);
  toggle('tg-dim',()=>tDims,v=>tDims=v);
  toggle('tg-proj',()=>tProj,v=>tProj=v);

  $('btn-fold').addEventListener('click',runFold);

  // Traces (HT/VT)
  $('btn-traces').addEventListener('click',()=> conMode==='trace' ? exitCon() : enterTrace());
  $('trace-replay').addEventListener('click',()=>{ if(conMode==='trace'){ reduceMotion.matches ? conApply(1) : runConAnim(5400); } });
  // True Length & Angles (Rotating-Line method) + playback transport
  $('btn-tl').addEventListener('click',()=> conMode==='tl' ? exitCon() : enterTL());
  $('tl-play').addEventListener('click',()=>{ if(conMode!=='tl') return; tlPlaying ? pauseTL() : playTL(); });
  $('tl-next').addEventListener('click',()=>{ if(conMode==='tl') stepTL(1); });
  $('tl-prev').addEventListener('click',()=>{ if(conMode==='tl') stepTL(-1); });
  $('tl-replay').addEventListener('click',()=>{ if(conMode!=='tl') return; tlPhase=0; tlPhaseT=0; applyTLState(); playTL(); });

  $('btn-reset').addEventListener('click',()=>window.simAPI.reset());
  $('btn-next').addEventListener('click',goNext);
  $('btn-back').addEventListener('click',goBack);

  $('rail').addEventListener('click',e=>{
    const b=e.target.closest('.rail-item'); if(!b||b.disabled) return;
    renderStep(+b.dataset.idx);
  });

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
  MOBILE_Q.addEventListener('change',layout);
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
    data={...defaultLineData(),...(STEPS[step].set||{})};
    rebuild(data);
  },
};

window.addEventListener('load',()=>{
  readTokens();
  S3=build(c3,true); S2=build(c2,false);
  MAX_ANISO=Math.max(S3.rend.capabilities.getMaxAnisotropy(),1);
  wire(); buildRail(); layout(); renderStep(0); loop();
  setTimeout(layout,100);
  window.__simStarted=true;
  document.getElementById('boot-error')?.remove();
  document.fonts?.ready.then(()=>rebuild(data));
});
