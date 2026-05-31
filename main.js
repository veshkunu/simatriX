import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  return {scene,cam,rend,ctrl,grp};
}

// ── Layout (JS owns canvas pixel sizes) ───────────────────────
function layout(){
  const W=area.clientWidth, H=area.clientHeight;
  if(!W||!H) return;
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
  S3.ctrl.update(); S2.ctrl.update();
  S3.rend.render(S3.scene,S3.cam);
  S2.rend.render(S2.scene,S2.cam);
}

// ── Rebuild both scenes for the current data + step view ──────
function rebuild(d){
  data=d;
  if(animating) return;
  const v=viewFor(step);
  const pos=resolvePosition(d);
  const wp={x:toW(pos.x),y:toW(pos.y),z:toW(pos.z)};
  const wd={distHP:toW(d.distHP),distVP:toW(d.distVP),distRP:toW(d.distRP),quadrant:d.quadrant};
  fill(S3,true,wp,wd,d,v); fill(S2,false,wp,wd,d,v);
  hiQ(d.quadrant); syncUI(d); announceState(d,v);
}

function fill(s,is3D,wp,wd,raw,v){
  const g=s.grp;
  for(const o of g.children){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}
  g.clear();
  is3D ? draw3D(g,wp,wd,raw,v) : draw2D(g,wp,wd,raw,v);
}

// ── 3D scene ──────────────────────────────────────────────────
// Two-cue rule: everything HP is teal + SOLID; everything VP is amber + DASHED.
function draw3D(g,p,d,r,v){
  const S=9;
  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,-Math.PI/2,0));
  alp(g,[[0,-S/2,-S/2],[0,S/2,-S/2],[0,S/2,S/2],[0,-S/2,S/2]],COL.vp);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                       // fold line
  alb(g,'HP',4.2,-.3,.3,COL.hp,.9,.4); alb(g,'VP',.3,4.2,.3,COL.vp,.9,.4);

  if(v.showQuad){
    [{t:'I',x:3.2,y:.3,z:3.2,q:'Q1'},{t:'II',x:-3.2,y:.3,z:3.2,q:'Q2'},
     {t:'III',x:-3.2,y:-.6,z:3.2,q:'Q3'},{t:'IV',x:3.2,y:-.6,z:3.2,q:'Q4'}]
    .forEach(l=>alb(g,l.t,l.x,l.y,l.z,l.q===d.quadrant?COL.ink:COL.bench,.65,.32));
  }

  if(!v.showPoint) return;
  asp(g,p.x,p.y,p.z,.14,COL.ink); alb(g,'P',p.x+.3,p.y+.35,p.z+.2,COL.ink,.55,.28);

  if(v.showHP){
    asg(g,[p.x,p.y,p.z],[p.x,0,p.z],COL.hp,0);                 // HP projector (solid)
    asg(g,[p.x,0,p.z],[0,0,p.z],COL.hp,0); asg(g,[0,0,p.z],[0,0,0],COL.hp,0);
    acr(g,p.x,0,p.z,.14,COL.hp,true); alb(g,'p',p.x+.28,.22,p.z,COL.hp,.55,.28);
  }
  if(v.showVP){
    asg(g,[p.x,p.y,p.z],[0,p.y,p.z],COL.vp,1);                 // VP projector (dashed)
    asg(g,[0,p.y,p.z],[0,p.y,0],COL.vp,1);
    acr(g,0,p.y,p.z,.14,COL.vp,true); alb(g,"p'",0.22,p.y+.28,p.z,COL.vp,.55,.28);
  }
  if(v.showCoord){
    const s=n=>n<0?'−':'', f=n=>Math.abs(n).toFixed(0);
    alb(g,`P(${s(p.x)}${f(r.distVP)}, ${s(p.y)}${f(r.distHP)}, ${s(p.z)}${f(r.distRP)})`,
        p.x+.4,p.y+.7,p.z+.3,COL.ink,2.8,.36,true);
  }
}

// ── 2D scene ──────────────────────────────────────────────────
// The drawing is only meaningful once both views exist; before that, show an
// empty-state inside the viewport.
function draw2D(g,p,d,r,v){
  const hw=6.5,hh=5.5;
  alp(g,[[-hw,-hh,0],[hw,-hh,0],[hw,hh,0],[-hw,hh,0]],COL.border);
  asg(g,[-hw,0,0],[hw,0,0],COL.ink,0);
  alb(g,'VP',-hw+.6,.35,0,COL.vp,.55,.26); alb(g,'HP',-hw+.6,-.35,0,COL.hp,.55,.26);

  if(!(v.showHP && v.showVP)){
    alb(g,'Top & front views appear here',0,0,0,COL.bench,4.4,.42);
    return;
  }

  const signLat=(r.quadrant==='Q2'||r.quadrant==='Q3')?-1:1, lx=signLat*d.distRP;
  const elevSign=(r.quadrant==='Q1'||r.quadrant==='Q2')?1:-1, ey=elevSign*d.distHP;  // p' (front view, VP)
  const planSign=(r.quadrant==='Q2'||r.quadrant==='Q3')?1:-1, py=planSign*d.distVP;  // p  (top view, HP)

  asg(g,[lx,ey,0],[lx,0,0],COL.vp,1);                          // VP projector (dashed amber)
  acr(g,lx,ey,0,.16,COL.vp,false); alb(g,"p'",lx+.32,ey+.28,0,COL.vp,.45,.25);
  adm(g,lx,0,lx,ey,COL.vp,`${r.distHP.toFixed(0)} cm`);

  asg(g,[lx,0,0],[lx,py,0],COL.hp,0);                          // HP projector (solid teal)
  acr(g,lx,py,0,.16,COL.hp,false); alb(g,'p',lx+.32,py-.28,0,COL.hp,.45,.25);
  adm(g,lx,0,lx,py,COL.hp,`${r.distVP.toFixed(0)} cm`);
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION — HP unfolds 90° downward about the X (fold) axis
// ═══════════════════════════════════════════════════════════════
function runAnimation(){
  if(animating) return;

  // Reduced motion: skip the swing; reveal the flattened result instead.
  if(reduceMotion.matches){
    if(mainIs3D) swap();    // show the 2D drawing (the unfolded outcome)
    announce('Planes unfolded. Showing the 2D drawing.');
    return;
  }

  animating = true;
  const btn=$('btn-anim'); btn.disabled=true; btn.textContent='Animating…';
  if(!mainIs3D) swap();

  const pos=resolvePosition(data);
  const wp={x:toW(pos.x),y:toW(pos.y),z:toW(pos.z)};
  const S=9, g=S3.grp;

  for(const o of g.children){o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}
  g.clear();

  // Static (do not rotate): VP, fold line, P, both projectors & p′ foot
  apl(g,S,COL.vp,.07,new THREE.Euler(0,-Math.PI/2,0));
  alp(g,[[0,-S/2,-S/2],[0,S/2,-S/2],[0,S/2,S/2],[0,-S/2,S/2]],COL.vp);
  alb(g,'VP',.3,4.2,.3,COL.vp,.9,.4);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);
  asg(g,[0,wp.y,wp.z],[0,wp.y,0],COL.vp,1);
  acr(g,0,wp.y,wp.z,.14,COL.vp,true); alb(g,"p'",0.22,wp.y+.28,wp.z,COL.vp,.55,.28);
  asg(g,[wp.x,wp.y,wp.z],[0,wp.y,wp.z],COL.vp,1);              // VP projector (dashed)
  asp(g,wp.x,wp.y,wp.z,.14,COL.ink); alb(g,'P',wp.x+.3,wp.y+.35,wp.z+.2,COL.ink,.55,.28);
  asg(g,[wp.x,wp.y,wp.z],[wp.x,0,wp.z],COL.hp,0);             // HP projector stays static (solid)

  // hpGroup — only the plane, its foot and connectors swing about the fold line
  const hpGroup=new THREE.Group(); g.add(hpGroup);
  const hpMesh=new THREE.Mesh(
    new THREE.PlaneGeometry(S,S),
    new THREE.MeshBasicMaterial({color:new THREE.Color(COL.hp),transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  hpMesh.rotation.x=-Math.PI/2; hpGroup.add(hpMesh);
  const bp=[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2],[-S/2,0,-S/2]].map(a=>new THREE.Vector3(...a));
  hpGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bp),new THREE.LineBasicMaterial({color:new THREE.Color(COL.hp)})));
  const fr=.14;
  const fp=[[wp.x-fr,0,wp.z],[wp.x+fr,0,wp.z],[wp.x,0,wp.z-fr],[wp.x,0,wp.z+fr]].map(a=>new THREE.Vector3(...a));
  hpGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fp),new THREE.LineBasicMaterial({color:new THREE.Color(COL.hp)})));
  const cp=[[wp.x,0,wp.z],[0,0,wp.z],[0,0,0]].map(a=>new THREE.Vector3(...a));
  hpGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cp),new THREE.LineBasicMaterial({color:new THREE.Color(COL.hp)})));
  alb(g,'HP',4.2,-.3,.3,COL.hp,.9,.4);
  hpGroup.position.set(0,0,0); hpGroup.rotation.set(0,0,0);

  const camStart=S3.cam.position.clone(), camEnd=new THREE.Vector3(0,0,14);
  const tgtStart=S3.ctrl.target.clone(), tgtEnd=new THREE.Vector3(0,0,0);
  const DURATION=2500, startTime=performance.now(), targetAngle=Math.PI/2;

  function animStep(now){
    const t=Math.min((now-startTime)/DURATION,1);
    const eased=1-Math.pow(1-t,3);
    if(t<0.65){
      hpGroup.rotation.x=targetAngle*(eased/0.65);
    }else{
      hpGroup.rotation.x=targetAngle;
      const phase=(eased-0.65)/0.35;
      S3.cam.position.lerpVectors(camStart,camEnd,phase);
      S3.ctrl.target.lerpVectors(tgtStart,tgtEnd,phase);
      S3.ctrl.update();
    }
    if(t<1){ requestAnimationFrame(animStep); }
    else{
      animating=false; btn.disabled=false; btn.textContent='▶ Animate Unfolding';
      S3.cam.position.copy(CAM3.p); S3.ctrl.target.copy(CAM3.t); S3.ctrl.update();
      const p2=resolvePosition(data);
      const wp2={x:toW(p2.x),y:toW(p2.y),z:toW(p2.z)};
      const wd2={distHP:toW(data.distHP),distVP:toW(data.distVP),distRP:toW(data.distRP),quadrant:data.quadrant};
      fill(S3,true,wp2,wd2,data,viewFor(step));
      announce('Planes unfolded. Try the 2D Drawing view to see the result.');
    }
  }
  requestAnimationFrame(animStep);
}

// ── Geometry helpers ──────────────────────────────────────────
function apl(g,s,c,o,e){const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));m.rotation.copy(e);g.add(m);}
function asg(g,a,b,c,dash){const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);const mat=dash?new THREE.LineDashedMaterial({color:new THREE.Color(c),dashSize:.18,gapSize:.10}):new THREE.LineBasicMaterial({color:new THREE.Color(c)});const l=new THREE.Line(geo,mat);if(dash)l.computeLineDistances();g.add(l);}
function alp(g,pts,c){const p=[...pts,pts[0]].map(([x,y,z])=>new THREE.Vector3(x,y,z||0));g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:new THREE.Color(c)})));}
function asp(g,x,y,z,r,c){const m=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshPhongMaterial({color:new THREE.Color(c),shininess:20}));m.position.set(x,y,z);g.add(m);}
function acr(g,cx,cy,cz,r,c,is3D){const pts=is3D?[new THREE.Vector3(cx-r,cy,cz),new THREE.Vector3(cx+r,cy,cz),new THREE.Vector3(cx,cy,cz-r),new THREE.Vector3(cx,cy,cz+r)]:[new THREE.Vector3(cx-r,cy,0),new THREE.Vector3(cx+r,cy,0),new THREE.Vector3(cx,cy-r,0),new THREE.Vector3(cx,cy+r,0)];g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:new THREE.Color(c)})));}
function adm(g,x1,y1,x2,y2,c,txt){
  const ox=x1-0.6, col=new THREE.Color(c);
  asg(g,[ox,y1,0],[ox,y2,0],c,0);
  asg(g,[x1-0.25,y1,0],[ox-0.02,y1,0],c,0);
  asg(g,[x2-0.25,y2,0],[ox-0.02,y2,0],c,0);
  function arrow(tipX,tipY,up){
    const h=0.2,w=0.08,d=up?1:-1,shape=new THREE.Shape();
    shape.moveTo(tipX,tipY); shape.lineTo(tipX-w,tipY-d*h); shape.lineTo(tipX+w,tipY-d*h); shape.closePath();
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide,depthTest:false}));
    m.renderOrder=1; g.add(m);
  }
  arrow(ox,y1,y2<y1); arrow(ox,y2,y2>y1);
  alb(g,txt,ox-0.65,(y1+y2)/2,0,c,1.0,0.30,true);
}
function alb(g,txt,x,y,z,c,sx=.7,sy=.35,mono=false){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=128;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,512,128);
  const wt=mono?'500':'bold', base=mono?40:44,
        fam=mono?'"IBM Plex Mono",ui-monospace,monospace':'"Atkinson Hyperlegible",system-ui,sans-serif';
  ctx.font=`${wt} ${base}px ${fam}`;
  // Shrink to fit so a long negative coordinate (e.g. P(−200, −200, −200)) can't clip the sprite.
  const maxW=512-24, w=ctx.measureText(txt).width;
  if(w>maxW) ctx.font=`${wt} ${Math.floor(base*maxW/w)}px ${fam}`;
  ctx.fillStyle=c; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,256,64);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthTest:false}));
  sp.position.set(x,y,z); sp.scale.set(sx,sy,1); g.add(sp);
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
  wire(); buildRail(); layout(); renderStep(0); loop();
  setTimeout(layout,100);
  // Mark success and clear the boot diagnostic (if it showed for a slow CDN load).
  window.__simStarted=true;
  document.getElementById('boot-error')?.remove();
  // Re-render sprite labels once the web fonts are ready (avoids fallback FOUT).
  document.fonts?.ready.then(()=>rebuild(data));
});
