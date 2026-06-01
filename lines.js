// lines.js — orchestrator for Projection of Straight Lines.
// Reuses the Points module's architecture verbatim: two independent renderer
// stacks (S3 = always-3D, S2 = always-2D), JS-owned canvas sizing, the guided
// stepper, term popovers, geometry helpers, and the no-camera HP-fold animation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

// Viewport toggles (Labels / Dimensions / Projectors) — default all on.
let tLabels = true, tDims = true, tProj = true;

const $ = id => document.getElementById(id);
const area=$('canvas-area'), c3=$('c3d'), c2=$('c2d');
const pipBox=$('pip-box'), pipLbl=$('pip-lbl'), live=$('live'), termPop=$('term-pop');

const DEFV = {showLine:false, showFV:false, showTV:false};
const viewFor = i => ({...DEFV, ...(STEPS[i]?.view || {})});

function readTokens(){
  const cs = getComputedStyle(document.documentElement);
  const t = n => cs.getPropertyValue(n).trim();
  COL = { paper:t('--paper'), ink:t('--ink'), ink2:t('--ink2'), bench:t('--bench'),
          border:t('--border'), hp:t('--hp'), vp:t('--vp'), accent:t('--accent') };
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
  return {scene,cam,rend,ctrl,grp};
}

function layout(){
  const Wd=area.clientWidth, H=area.clientHeight;
  if(!Wd||!H) return;
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
  const v=viewFor(step);
  const M=resolveLine(d);
  fill(S3,true,M,v); fill(S2,false,M,v);
  syncUI(d,M); updateReadout(M); announceState(M,v);
}

function fill(s,is3D,M,v){
  const g=s.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
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
    alb(g,'HP',3.4,-.45,1.1,COL.hp,2.0,.78);
    alb(g,'VP',-3.1,3.4,.06,COL.vp,2.0,.78);
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
    if(tLabels){ alb(g,"a'",aF[0]-.32,aF[1]+.32,.05,COL.vp,.62,.32); alb(g,"b'",bF[0]+.32,bF[1]+.32,.05,COL.vp,.62,.32); }
  }
  // Top view ab on HP — darkened/bold when it equals the true length
  if(v.showTV){
    tvTrue ? asgBold(g,aT,bT,COL.hp) : asg(g,aT,bT,COL.hp,0);
    acr(g,aT[0],0,aT[2],.13,COL.hp,true); acr(g,bT[0],0,bT[2],.13,COL.hp,true);
    if(tLabels){ alb(g,'a',aT[0]-.32,.18,aT[2],COL.hp,.56,.3); alb(g,'b',bT[0]+.32,.18,bT[2],COL.hp,.56,.3); }
  }

  // The true line AB in space — always the True Length, so always drawn dark + bold
  asgBold(g,A,B,COL.ink);
  asp(g,A[0],A[1],A[2],.15,COL.ink); asp(g,B[0],B[1],B[2],.15,COL.ink);
  if(tLabels){
    alb(g,'A',A[0]-.32,A[1]+.34,A[2]+.15,COL.ink,.56,.3);
    alb(g,'B',B[0]+.32,B[1]+.34,B[2]+.15,COL.ink,.56,.3);
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
    alb(g,'VP',-HW+.5,.9,0,COL.vp,1.5,.9,false,128); alb(g,'HP',-HW+.5,-.9,0,COL.hp,1.5,.9,false,128);
  }
  if(!(v.showFV && v.showTV)){
    alb(g,'Front & top views appear here',0,0,0,COL.bench,4.6,.42);
    return;
  }

  const cx=(M.A.x+M.B.x)/2;
  let ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  let aUp=W(M.A.y), bUp=W(M.B.y);      // FV heights (above XY)
  let aDn=W(M.A.z), bDn=W(M.B.z);      // TV depths (below XY)
  const maxX=Math.max(Math.abs(ax),Math.abs(bx),1e-3);
  const maxV=Math.max(aUp,bUp,aDn,bDn,1e-3);
  const fit=Math.min(1,(HW-0.9)/maxX,(HH-0.9)/maxV);
  const F=n=>n*fit;

  const A1=[F(ax),F(aUp),0], B1=[F(bx),F(bUp),0];               // a' b'  elevation (primed)
  const A2=[F(ax),-F(aDn),0], B2=[F(bx),-F(bDn),0];            // a  b   plan (unprimed)
  const fvTrue=Math.abs(M.fvLen-M.tl)<0.5, tvTrue=Math.abs(M.tvLen-M.tl)<0.5;
  const fvPoint=M.fvLen<0.6, tvPoint=M.tvLen<0.6;

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
    if(fvPoint){ alb(g,"a'b'",A1[0]+.55,A1[1]+.45,0,COL.vp,1.15,.44); }
    else { alb(g,"a'",A1[0]-.42,A1[1]+.42,0,COL.vp,.9,.44); alb(g,"b'",B1[0]+.42,B1[1]+.42,0,COL.vp,.9,.44); }
    if(tvPoint){ alb(g,'ab',A2[0]+.55,A2[1]-.45,0,COL.hp,1.0,.44); }
    else { alb(g,'a',A2[0]-.42,A2[1]-.42,0,COL.hp,.9,.44); alb(g,'b',B2[0]+.42,B2[1]-.42,0,COL.hp,.9,.44); }
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
// FOLD ANIMATION — identical mechanics to the Points module: only the
// HP group rotates +90° about the X-axis; the camera never moves; the
// 3D depth cues dissolve to leave a clean orthographic sheet, frozen.
// ═══════════════════════════════════════════════════════════════
function runFold(){
  if(animating) return;
  if(reduceMotion.matches){ if(mainIs3D) swap(); announce('Views unfolded. Showing the 2D drawing.'); return; }

  const v=viewFor(step);
  if(!(v.showFV && v.showTV)) return;     // nothing to fold yet

  animating=true;
  const btn=$('btn-fold'); btn.disabled=true; btn.textContent='Generating…';
  if(!mainIs3D) swap();

  const M=resolveLine(data);
  const S=9, g=S3.grp;
  g.traverse(o=>{if(o!==g){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();

  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const A=[ax,W(M.A.y),W(M.A.z)], B=[bx,W(M.B.y),W(M.B.z)];
  const aF=[ax,W(M.A.y),0], bF=[bx,W(M.B.y),0];

  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP (static)
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  alb(g,'VP',-3.1,3.4,.06,COL.vp,2.0,.78);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);

  // Front view a'b' + connectors to XY (stay in z=0 plane) — KEEP
  asg(g,aF,bF,COL.vp,0);
  asg(g,aF,[ax,0,0],COL.vp,1); asg(g,bF,[bx,0,0],COL.vp,1);
  acr(g,aF[0],aF[1],0,.16,COL.vp,false); acr(g,bF[0],bF[1],0,.16,COL.vp,false);
  alb(g,"a'",aF[0]-.34,aF[1]+.34,.05,COL.vp,.6,.3); alb(g,"b'",bF[0]+.34,bF[1]+.34,.05,COL.vp,.6,.3);

  // Depth cues (FADE): the true line AB, endpoints, and the VP perpendicular projectors
  asg(g,A,B,COL.ink,0); fade.push(last());
  asp(g,A[0],A[1],A[2],.15,COL.ink); fade.push(last());
  asp(g,B[0],B[1],B[2],.15,COL.ink); fade.push(last());
  alb(g,'A',A[0]-.32,A[1]+.34,A[2]+.15,COL.ink,.5,.26); fade.push(last());
  alb(g,'B',B[0]+.32,B[1]+.34,B[2]+.15,COL.ink,.5,.26); fade.push(last());
  asg(g,A,aF,COL.vp,1); fade.push(last());
  asg(g,B,bF,COL.vp,1); fade.push(last());

  // hpGroup (rotates +90° about X): HP plane + top view ab + connectors to XY
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  const hpMesh=new THREE.Mesh(new THREE.PlaneGeometry(S,S),
    new THREE.MeshBasicMaterial({color:new THREE.Color(COL.hp),transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  hpMesh.rotation.x=-Math.PI/2; hpGroup.add(hpMesh);
  const bp=[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2],[-S/2,0,-S/2]].map(a=>new THREE.Vector3(...a));
  hpGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bp),new THREE.LineBasicMaterial({color:new THREE.Color(COL.hp)})));
  alb(hpGroup,'HP',3.4,-.45,1.1,COL.hp,2.0,.78);
  const aT=[ax,0,W(M.A.z)], bT=[bx,0,W(M.B.z)];
  asg(hpGroup,aT,bT,COL.hp,0);
  asg(hpGroup,aT,[ax,0,0],COL.hp,0); asg(hpGroup,bT,[bx,0,0],COL.hp,0);
  acr(hpGroup,aT[0],0,aT[2],.16,COL.hp,true); acr(hpGroup,bT[0],0,bT[2],.16,COL.hp,true);
  alb(hpGroup,'a',aT[0]-.34,.18,aT[2],COL.hp,.6,.3); alb(hpGroup,'b',bT[0]+.34,.18,bT[2],COL.hp,.6,.3);

  // Dynamic HP perpendicular projectors (P→moving foot) — FADE
  const trackers=[{from:A,foot:aT},{from:B,foot:bT}].map(({from,foot})=>{
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from),new THREE.Vector3(...foot)]);
    const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
    line.computeLineDistances(); g.add(line); fade.push(line);
    const t=new THREE.Object3D(); t.position.set(...foot); hpGroup.add(t);
    return {geo,from,t};
  });

  for(const o of fade){ if(o.material) o.material.transparent=true; }

  const DURATION=2800, FOLD=0.72, startTime=performance.now(), targetAngle=Math.PI/2;
  const tmp=new THREE.Vector3();

  function animStep(now){
    for(const tr of trackers){ tr.t.getWorldPosition(tmp); tr.geo.setFromPoints([new THREE.Vector3(...tr.from),tmp.clone()]); }
    g.children.forEach(o=>{ if(o.isLine && o.material?.isLineDashedMaterial) o.computeLineDistances(); });

    const t=Math.min((now-startTime)/DURATION,1);
    const foldT=Math.min(t/FOLD,1), ease=1-Math.pow(1-foldT,3);
    hpGroup.rotation.x=targetAngle*ease;
    const fa = t<=FOLD ? 1 : Math.max(0,1-(t-FOLD)/(1-FOLD));
    for(const o of fade){ if(o.material) o.material.opacity=fa; }

    if(t<1){ requestAnimationFrame(animStep); }
    else {
      animating=false; btn.disabled=false; btn.textContent='▶ Generate Orthographic Projection';
      announce('Top view unfolded onto the vertical plane — the orthographic projection is complete.');
    }
  }
  requestAnimationFrame(animStep);
}

// ── Geometry helpers (identical to the Points module) ─────────
function apl(g,s,c,o,e){const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));m.rotation.copy(e);g.add(m);}
function asg(g,a,b,c,dash){const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);const mat=dash?new THREE.LineDashedMaterial({color:new THREE.Color(c),dashSize:.18,gapSize:.10}):new THREE.LineBasicMaterial({color:new THREE.Color(c)});const l=new THREE.Line(geo,mat);if(dash)l.computeLineDistances();g.add(l);}
function alp(g,pts,c){const p=[...pts,pts[0]].map(([x,y,z])=>new THREE.Vector3(x,y,z||0));g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:new THREE.Color(c)})));}
function asp(g,x,y,z,r,c){const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,16),new THREE.MeshBasicMaterial({color:new THREE.Color(c),depthTest:false}));m.renderOrder=3;m.position.set(x,y,z);g.add(m);}
function acr(g,cx,cy,cz,r,c,is3D){const pts=is3D?[new THREE.Vector3(cx-r,cy,cz),new THREE.Vector3(cx+r,cy,cz),new THREE.Vector3(cx,cy,cz-r),new THREE.Vector3(cx,cy,cz+r)]:[new THREE.Vector3(cx-r,cy,0),new THREE.Vector3(cx+r,cy,0),new THREE.Vector3(cx,cy-r,0),new THREE.Vector3(cx,cy+r,0)];g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:new THREE.Color(c)})));}
function alb(g,txt,x,y,z,c,sx=.7,sy=.35,mono=false,cw=512){
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=128;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cw,128);
  const wt=mono?'500':'bold', base=mono?40:44,
        fam=mono?'"IBM Plex Mono",ui-monospace,monospace':'"Atkinson Hyperlegible",system-ui,sans-serif';
  ctx.font=`${wt} ${base}px ${fam}`;
  const maxW=cw-24, w=ctx.measureText(txt).width;
  if(w>maxW) ctx.font=`${wt} ${Math.floor(base*maxW/w)}px ${fam}`;
  ctx.fillStyle=c; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,cw/2,64);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthTest:false}));
  sp.position.set(x,y,z); sp.scale.set(sx,sy,1); g.add(sp);
}
// Blend a token colour toward another (used to DARKEN true-length / true-angle
// elements toward ink). Returns a "#rrggbb" string usable by both asg() and alb().
const mix=(a,b,t)=>'#'+new THREE.Color(a).lerp(new THREE.Color(b),t).getHexString();

// True Length is drawn as ONE dark line (a single stroke darkened toward ink) —
// never multi-stroke — so it reads as a single clean bold line in 3D and in 2D.
function asgBold(g,a,b,colHex){
  const col=mix(colHex,COL.ink,0.55);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),
    new THREE.LineBasicMaterial({color:new THREE.Color(col)})));
}

// A 3D angle mark: a dashed reference ray from C along refDir, an arc swung to
// lineDir, and a label at the mid-angle — used to show θ (with HP) and φ (with VP).
function angle3(g,C,refDir,lineDir,len,colHex,label){
  const c=new THREE.Vector3(...C);
  const ref=new THREE.Vector3(...refDir); if(ref.lengthSq()<1e-6) return; ref.normalize();
  const ld=new THREE.Vector3(...lineDir); if(ld.lengthSq()<1e-6) return; ld.normalize();
  const axis=new THREE.Vector3().crossVectors(ref,ld); if(axis.lengthSq()<1e-6) return; axis.normalize();
  const refEnd=c.clone().add(ref.clone().multiplyScalar(len));
  asg(g,[c.x,c.y,c.z],[refEnd.x,refEnd.y,refEnd.z],colHex,1);     // dashed reference ray
  const r=len*0.62, ang=ref.angleTo(ld), segs=20, pts=[];
  for(let i=0;i<=segs;i++){ const q=new THREE.Quaternion().setFromAxisAngle(axis,ang*i/segs); pts.push(c.clone().add(ref.clone().multiplyScalar(r).applyQuaternion(q))); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:new THREE.Color(colHex)})));
  const qm=new THREE.Quaternion().setFromAxisAngle(axis,ang*0.5);
  const lp=c.clone().add(ref.clone().multiplyScalar(r+0.6).applyQuaternion(qm));
  alb(g,label,lp.x,lp.y,lp.z,colHex,1.6,.44,true,256);
}

// Arc in the z=0 plane (for angle marks). bold → double-stroke + darkened.
function arc(g,cx,cy,r,a0,a1,colHex,bold){
  const segs=24, mk=rr=>{const p=[];for(let i=0;i<=segs;i++){const a=a0+(a1-a0)*i/segs;p.push(new THREE.Vector3(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,0));}
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:new THREE.Color(colHex)}));};
  g.add(mk(r)); if(bold) g.add(mk(r+0.05));
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
  $('tlbl').textContent=mainIs3D?'3D shown large':'2D shown large';
  $('tb3').classList.toggle('on', mainIs3D);
  $('tb2').classList.toggle('on',!mainIs3D);
  $('tb3').setAttribute('aria-pressed', String(mainIs3D));
  $('tb2').setAttribute('aria-pressed', String(!mainIs3D));
  layout();
}

// ── Sliders / readout / notes ─────────────────────────────────
function syncUI(d,M){
  setRange('r-tl','n-tl',d.TL,90);
  setRange('r-th','n-th',d.theta,90);
  setRange('r-ph','n-ph',d.phi,90);
  setNote('note-valid', d.case===LineCase.INCL_BOTH && !M.valid
    ? 'θ + φ must stay ≤ 90° for a real line. Reduce one angle.' : '');
}
function setRange(r,n,val,max){
  const rEl=$(r), nEl=$(n); if(!rEl) return;
  const clamped=Math.min(max,Math.max(0,val));
  rEl.value=String(clamped);
  rEl.style.setProperty('--p',(clamped/max*100)+'%');
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
  $('r-tl').addEventListener('input',()=>rebuild({...data,TL:+$('r-tl').value||0}));
  $('r-th').addEventListener('input',()=>rebuild({...data,theta:+$('r-th').value||0}));
  $('r-ph').addEventListener('input',()=>rebuild({...data,phi:+$('r-ph').value||0}));
  [['n-tl','TL',90],['n-th','theta',90],['n-ph','phi',90]].forEach(([n,k,max])=>{
    $(n).addEventListener('change',()=>{
      const val=parseFloat($(n).value);
      if(!isFinite(val)||val<0){ syncUI(data,resolveLine(data)); }
      else rebuild({...data,[k]:Math.min(max,val)});
    });
  });

  const toggle=(id,get,set)=>{
    const el=$(id);
    el.addEventListener('click',()=>{ set(!get()); el.classList.toggle('on',get()); el.setAttribute('aria-pressed',String(get())); rebuild(data); });
  };
  toggle('tg-lbl',()=>tLabels,v=>tLabels=v);
  toggle('tg-dim',()=>tDims,v=>tDims=v);
  toggle('tg-proj',()=>tProj,v=>tProj=v);

  $('btn-fold').addEventListener('click',runFold);
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
  wire(); buildRail(); layout(); renderStep(0); loop();
  setTimeout(layout,100);
  window.__simStarted=true;
  document.getElementById('boot-error')?.remove();
  document.fonts?.ready.then(()=>rebuild(data));
});
