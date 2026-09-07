/* ===================== RENDER ENGINE ===================== */
let scene,camera,renderer,clock;
let playerGroup,player,world={},intruders=[],marker=null;
let camYaw=Math.PI,camPitch=0.30,camDist=9.5;
let running=false,nightMode=false,interactTarget=null,raf=null;
let moveTarget=null,pendingSpot=null;
let drag={down:false,moved:false,x:0,y:0,t:0,id:null};

/* 'walk' (default) or 'drive' — see enterDriveMode()/exitDriveMode() */
let controlMode='walk';
/* Driving physics: js/vendor/cannon.js (MIT) when it loads — a real rigid-body
   chassis on 4 raycast wheels with actual suspension, driven by
   driveCarCannon() below — falling back to CarPhysics (js/carphysics.js, a
   dependency-free port of oseiskar/js-car's front/rear-axle constraint solver,
   driven by driveCarFallback()) if it doesn't. Same "a missing asset costs you
   the good version, never a broken game" pattern models.js uses for
   characters. USE_CANNON is decided once, from whether the vendored script
   defined the CANNON global by the time this file runs. */
const USE_CANNON=typeof CANNON!=='undefined';
let carPhys=null;                        // fallback physics (see driveCarFallback())
let physWorld=null,vehicle=null,chassisBody=null,carRideHeight=0;   // cannon.js state
const CAR_LENGTH=9.6, CAR_WIDTH=CAR_LENGTH*0.42;
const PLAYER_RADIUS=0.5, CAR_RADIUS=CAR_LENGTH*0.245;   // CAR_RADIUS: fallback-mode collision only

/* The house/garage/yard's shared x — a module constant, not a per-function
   literal, because every piece of that compound (house, garage, CAR_SPOT, the
   walkway, the front-door and board interaction spots, the security-upgrade
   props, the collider boxes) used to hardcode x=-2/x=9 independently, all
   assuming a house at x=-2. Moving the house to sit across C. Marginal from
   the colmado (per the owner's reference map) meant shifting all of them by
   the same amount, so HOME_X is that single anchor: every one of those sites
   reads HOME_X (or an offset from it) instead of its own copy of -2. Must be
   declared before CAR_SPOT/COLMADO_POS below, which read it immediately at
   module-load time — top-level `const` has no hoisting the way a function
   declaration does.
   Z was deliberately left untouched — the existing security-fence perimeter
   already reaches to within ~3 units of C. Marginal's south edge (matching
   the colmado's own ~3.5-unit clearance on the street's other side), so the
   two properties already face each other across the street without moving
   either one in z. This also detaches the garage from AVE_X=9 (the garage
   used to sit right on the avenue's pavement) — the car now crosses open,
   unobstructed ground to reach the avenue instead of pulling straight onto
   it, which is a real change to the geometry, not a bug. */
const HOME_X=-16;
/* Car handling. These are tuned numbers, not guesses — every one was measured
   in isolated Node against the real cannon.js vehicle (top speed, 0-to-stop
   distance, 180-degree turn time, peak slip angle, chassis uprightness) before
   being written here; see CLAUDE.md for the repro. Retune them the same way.

   CAR_TOP_SPEED is enforced by tapering engine force toward zero as the car
   approaches it rather than by clamping velocity — a hard velocity clamp
   fights the solver and reads as the car hitting an invisible wall. There is
   no drag in this world, so without the taper, holding W accelerates forever
   (measured: still climbing past 21 u/s after 6 seconds, which is what made
   driving feel uncontrollable). */
const CAR_TOP_SPEED=22;                                    // world units/sec (~35 km/h at this world's scale)
const CAR_MAX_ENGINE_FORCE=3400, CAR_REVERSE_FRAC=0.45;
const CAR_BRAKE_FORCE=220, CAR_IDLE_BRAKE=6;               // idle: coast down, don't stop dead
/* Max steering lock falls off with speed (STEER_LOW at a standstill toward
   STEER_HIGH at CAR_TOP_SPEED): full lock is what you want when parking and
   what spins you out at speed. CAR_STEER_RATE ramps the wheel toward that
   lock instead of snapping to it — instant full lock was the other half of
   why this felt broken. */
const CAR_STEER_LOW=0.66, CAR_STEER_HIGH=0.36, CAR_STEER_RATE=3.5;
const CAR_ANGULAR_DAMPING=0.4;   // bleeds off yaw spin so the car settles instead of pirouetting
const CAR_CREEP_SPEED=0.5;       // below this, the brake pedal means "reverse", not "stop"
const UNITS_PER_METRE=CAR_LENGTH/4.4;   // the car is a ~4.4m sedan — only used for the km/h readout
let carSteer=0;                  // current front-wheel angle, ramped toward the target each frame

/* Driving input, pedal-style (Car Parking Multiplayer's scheme), NOT tap-to-move:
   a car that drives itself to a tapped point can't be parked, which is the
   whole point of driving one. Both the on-screen pedals (#driveHud, bound in
   bindDriveHud()) and the keyboard write into this same object, so the two
   control schemes are literally the same input path and can't drift apart.

   `gas` and `brake` are 0..1 rather than booleans so an analog input (a
   pressure-sensitive pedal, a gamepad trigger) could feed them later without
   touching the physics. `brake` is one pedal doing two jobs, exactly like the
   mobile driving games this is modelled on: it brakes while the car is moving
   forward, and becomes reverse once it has stopped — see driveCarCannon(). */
const driveInput={gas:0,brake:0,left:false,right:false};

/* 'orbit' (default third-person follow-cam) or 'first' — see toggleCameraMode() */
let cameraMode='orbit';

/* ---- shader: anime cel + rim ---- */
/* ---- toon shading via three.js's built-in MeshToonMaterial ----
   No custom GLSL anywhere in this file. A hand-written shader that fails to
   compile doesn't throw a JS error — three.js just logs a warning and draws
   nothing — which is exactly the failure mode that produced a black screen
   with no error box. MeshToonMaterial is stock three.js, tested across every
   device three.js supports, so this trades a little visual customization for
   the render actually being guaranteed to show up. */
let TOON_GRADIENT=null;
function toonGradientMap(){
  if(TOON_GRADIENT) return TOON_GRADIENT;
  const c=document.createElement('canvas'); c.width=4; c.height=1;
  const ctx=c.getContext('2d');
  const bands=[70,140,200,255];
  bands.forEach((v,i)=>{ ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.fillRect(i,0,1,1); });
  const tex=new THREE.CanvasTexture(c);
  tex.minFilter=THREE.NearestFilter; tex.magFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  TOON_GRADIENT=tex;
  return tex;
}
function liftColor(hex, lift){
  if(!lift) return new THREE.Color(hex);
  const c=new THREE.Color(hex);
  c.lerp(new THREE.Color(0xffffff), Math.min(0.6, lift));
  return c;
}
function animeMat(color,rimCol,rimPow,lift,map){
  const p={ color: liftColor(color, lift), gradientMap: toonGradientMap() };
  if(map) p.map=map;
  return new THREE.MeshToonMaterial(p);
}

/* ---- procedural detail maps ----
   Generated on a <canvas> at runtime, so they add nothing to the download size.

   They are deliberately MULTIPLY maps: white base with the detail painted in as
   darker pixels only. MeshToonMaterial multiplies map * color, so a surface keeps
   both its base tint (set by the color argument, not baked into the image) and the
   same light-sum profile it had untextured — see buildLighting()'s note on how
   easily a top-lit face clips to solid white here. A texture that can only darken
   can never push a face into that clip.

   Cached per (kind, repeat) and never disposed, same as TOON_GRADIENT: the canvas
   is the expensive part, and backToTitle()'s material disposal doesn't touch
   textures, so the cache stays valid across MENU->ENTER round trips. */
const DETAIL_CANVAS={}, DETAIL_MAPS={};
function concreteCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const x=c.getContext('2d');
  x.fillStyle='#ffffff'; x.fillRect(0,0,128,128);
  for(let i=0;i<900;i++){                                   // mottled hand-rolled paint
    x.fillStyle='rgba(0,0,0,'+(0.02+Math.random()*0.07)+')';
    x.fillRect(Math.random()*128,Math.random()*128,2+Math.random()*7,2+Math.random()*7);
  }
  for(let i=0;i<128;i+=32){ x.fillStyle='rgba(0,0,0,.09)'; x.fillRect(0,i,128,1); }  // block courses
  // damp/grime creeping up from the ground. Canvas row 127 is v=0 (three.js flips
  // Y by default), so this band lands at the BOTTOM of the wall — which is why
  // walls below are mapped with a Y repeat of 1 and not tiled vertically.
  const grad=x.createLinearGradient(0,86,0,128);
  grad.addColorStop(0,'rgba(40,32,22,0)'); grad.addColorStop(1,'rgba(40,32,22,.40)');
  x.fillStyle=grad; x.fillRect(0,86,128,42);
  return c;
}
function zincCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=96;
  const x=c.getContext('2d');
  x.fillStyle='#ffffff'; x.fillRect(0,0,96,96);
  for(let i=0;i<96;i+=8){                                   // corrugation shading
    x.fillStyle='rgba(0,0,0,.24)'; x.fillRect(i,0,3,96);
    x.fillStyle='rgba(0,0,0,.06)'; x.fillRect(i+4,0,2,96);
  }
  for(let i=0;i<26;i++){                                    // rust streaks
    x.fillStyle='rgba(96,44,16,'+(0.12+Math.random()*0.24)+')';
    x.fillRect(Math.random()*96,Math.random()*96,3+Math.random()*6,8+Math.random()*26);
  }
  return c;
}
function detailMap(kind,rx,ry){
  const key=kind+'|'+rx+'|'+ry;
  if(DETAIL_MAPS[key]) return DETAIL_MAPS[key];
  if(!DETAIL_CANVAS[kind]) DETAIL_CANVAS[kind]=(kind==='zinc'?zincCanvas():concreteCanvas());
  const t=new THREE.CanvasTexture(DETAIL_CANVAS[kind]);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  DETAIL_MAPS[key]=t; return t;
}
function shade(hex,f){ const c=new THREE.Color(hex); c.multiplyScalar(f); return c.getHex(); }
function ink(mesh,t){
  const o=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color:0x0B0E13,side:THREE.BackSide}));
  o.scale.multiplyScalar(1+(t||0.028)); mesh.add(o); return mesh;
}
function M(geo,color,opts){
  opts=opts||{};
  const mesh=new THREE.Mesh(geo, animeMat(color,opts.rim,opts.rimPow,opts.lift,opts.map));
  if(opts.ink!==false){ try{ ink(mesh,opts.inkT); }catch(e){} }
  return mesh;
}
function limb(rTop,rBot,len,color,opts){
  const g=new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(rTop,rBot,len,14),color,opts));
  const j=M(new THREE.SphereGeometry(rTop*1.02,14,10),color,opts); j.position.y=len/2; g.add(j);
  const j2=M(new THREE.SphereGeometry(rBot*1.02,14,10),color,opts); j2.position.y=-len/2; g.add(j2);
  return g;
}
function torsoGeo(shoulder,waist,len){
  const pts=[];
  [[waist*.92,0],[waist,.16],[waist*1.02,.36],[shoulder*.90,.62],[shoulder,.82],[shoulder*.86,.96],[shoulder*.5,1.0]]
    .forEach(([r,t])=>pts.push(new THREE.Vector2(Math.max(r,.02), t*len-len/2)));
  return new THREE.LatheGeometry(pts,20);
}

/* ---- character ---- */
function makePerson(outfit,skin,build,opts){
  opts=opts||{};
  const g=new THREE.Group();
  const sw=0.42+build*0.14, hairCol=opts.hair||0x1C1610;
  const tankCol = opts.tank!==undefined ? opts.tank : 0xF3F1E7;
  const jeanCol = opts.jean!==undefined ? opts.jean : outfit;
  const bling = opts.bling!==false;

  // torso — white tank, slightly higher lift so it doesn't fall into deep shadow band
  const torso=M(torsoGeo(sw,sw*0.60,1.35),tankCol,{inkT:.026,lift:.10}); torso.position.y=2.02; g.add(torso);
  // strap hint at the shoulder
  [-sw*0.55,sw*0.55].forEach(x=>{
    const strap=M(new THREE.BoxGeometry(.14,.55,.10),tankCol,{ink:false,lift:.10});
    strap.position.set(x,2.62,0); g.add(strap);
  });
  const hips=M(new THREE.SphereGeometry(sw*.66,16,12),jeanCol,{inkT:.03});
  hips.scale.set(1,.72,.86); hips.position.y=1.30; g.add(hips);
  const neck=limb(.12,.14,.24,skin,{inkT:.05,lift:.06}); neck.position.y=2.82; g.add(neck);
  const head=M(new THREE.SphereGeometry(.40,22,18),skin,{inkT:.026,lift:.10});
  head.scale.set(.90,1.06,.94); head.position.y=3.26; g.add(head);
  const jaw=M(new THREE.SphereGeometry(.27,16,12),skin,{ink:false,lift:.10});
  jaw.scale.set(.90,.68,.86); jaw.position.set(0,2.98,.05); g.add(jaw);
  // eyes — dark almond shape; catchlight is a child OF the eye mesh itself (moves/depth-sorts with it,
  // can never float free or show through the head — that was the earlier bug)
  const eyeG=new THREE.SphereGeometry(.095,14,12), eyeM=new THREE.MeshBasicMaterial({color:0x1A1410});
  const eL=new THREE.Mesh(eyeG,eyeM); eL.scale.set(.60,1.08,.24); eL.position.set(-.155,3.28,.368); g.add(eL);
  const shine=new THREE.Mesh(new THREE.CircleGeometry(.022,10), new THREE.MeshBasicMaterial({color:0xFFFFFF}));
  shine.position.set(-.02,.02,.10); shine.renderOrder=1; eL.add(shine);
  const eR=eL.clone(true); eR.position.x=.155; g.add(eR);
  // simple mouth line
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(.10,.014,.01), new THREE.MeshBasicMaterial({color:0x6B3A2E}));
  mouth.position.set(0,3.06,.375); g.add(mouth);
  // hair — deliberate anime silhouette: swept base + layered angular spikes, not random cones
  const cap=M(new THREE.SphereGeometry(.43,20,16),hairCol,{inkT:.022,rimPow:1.9});
  cap.scale.set(.96,.92,1.0); cap.position.set(0,3.34,-.03); g.add(cap);
  const spikeAngles=[-0.95,-0.55,-0.18,0.18,0.55,0.95];
  spikeAngles.forEach((a,i)=>{
    const len=0.36+((i%3===1)?0.16:0);
    const spike=M(new THREE.ConeGeometry(.075,len,5),hairCol,{ink:false});
    spike.position.set(Math.sin(a)*.30, 3.52+Math.abs(Math.sin(a))*.05, Math.cos(a)*.26);
    spike.rotation.set(2.35, a*1.1, a*0.4);
    g.add(spike);
  });
  const crown=M(new THREE.ConeGeometry(.09,.5,6),hairCol,{ink:false});
  crown.position.set(0.02,3.78,-.14); crown.rotation.set(-0.35,0.2,-0.15); g.add(crown);
  // bare arms — sleeveless tank, arms are skin tone all the way
  const armL=limb(.115+build*.03,.095,.62,skin,{inkT:.05,lift:.06}); armL.position.set(-sw-.04,2.28,0); g.add(armL);
  const foreL=limb(.095,.08,.58,skin,{inkT:.05,lift:.06}); foreL.position.set(0,-.60,0); armL.add(foreL);
  const handL=M(new THREE.SphereGeometry(.10,12,10),skin,{inkT:.05,lift:.06});
  handL.scale.set(.85,.7,.6); handL.position.set(0,-.32,.02); foreL.add(handL);
  const armR=armL.clone(true); armR.position.x=sw+.04; g.add(armR);
  // legs: shorts (player) or full pants (NPCs), purple wash denim with distressing, not flat color
  const shortLen = opts.shorts ? 0.38 : 0.78;
  const legL=limb(.165,.135,shortLen,jeanCol,{inkT:.04});
  legL.position.set(-.20, 0.98 + (0.78-shortLen)/2, 0);
  g.add(legL);
  let footAttach;
  if(opts.shorts){
    // distress/whisker streaks — lighter purple patches, classic worn-denim streetwear look
    const wash=new THREE.MeshBasicMaterial({color:0xA070E0, transparent:true, opacity:.35});
    for(let i=0;i<3;i++){
      const streak=new THREE.Mesh(new THREE.PlaneGeometry(.10,.05), wash);
      streak.position.set((i-1)*.02, -.05+i*.09, .135);
      streak.rotation.z=(Math.random()-.5)*.6;
      legL.add(streak);
    }
    // bare shin, skin tone, down to the sneaker
    const shinL=limb(.10,.078,.62,skin,{inkT:.045,lift:.06}); shinL.position.set(0,-shortLen/2-.30,0); legL.add(shinL);
    footAttach=shinL;
  } else {
    const shinL=limb(.12,.09,.70,jeanCol,{inkT:.045}); shinL.position.set(0,-shortLen/2-.35,0); legL.add(shinL);
    footAttach=shinL;
  }
  if(bling){
    const gemM=new THREE.MeshBasicMaterial({color:0xE9E7DA});
    const gemCount = opts.shorts ? 3 : 5;
    for(let i=0;i<gemCount;i++){
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.026,0), gemM);
      gem.position.set((Math.random()-.5)*.16, -shortLen*0.55+i*(shortLen*0.35), .10+Math.random()*.04);
      legL.add(gem);
    }
  }
  const footL=M(new THREE.SphereGeometry(.14,12,10),0xF0EDE4,{inkT:.05});
  footL.scale.set(.8,.6,1.5); footL.position.set(0,-.40,.08); footAttach.add(footL);
  const legR=legL.clone(true); legR.position.x=.20; g.add(legR);
  g.userData={armL,armR,legL,legR,head};
  return g;
}

/* ---- car ---- */
function makeCar(){
  const tier=S.vehicle.tier, paint=S.vehicle.paint, mods=S.vehicle.mods;
  const g=new THREE.Group();
  const isTruck=tier===3, isSUV=(tier===2||tier===6), isCoupe=(tier===4||tier===5);
  const len=isTruck?5.6:isSUV?5.0:isCoupe?4.4:4.7;
  const hgt=isSUV?1.15:isTruck?1.20:isCoupe?.80:.95;
  const lo=mods.tune>=2?-.12:0;
  // Built nose-along-+Z, matching BOTH the loaded car model (its Headlights
  // material sits at z=+1.99, its TailLights at z=-1.88) and the cannon.js
  // chassis (a Box of CAR_LENGTH/2 along z). All three share one convention so
  // no rotation offset is needed anywhere — see the note above CAR_SPOT.
  const body=M(new THREE.BoxGeometry(2.05,hgt,len),paint,{inkT:.022});
  body.position.y=.86+hgt/2+lo; g.add(body);
  const nose=M(new THREE.SphereGeometry(1.05,18,14),paint,{ink:false});
  nose.scale.set(.98,hgt/2.1,.30); nose.position.set(0,.86+hgt/2+lo,len/2); g.add(nose);
  const tail=nose.clone(); tail.position.z=-len/2; g.add(tail);
  const glass=mods.tint>=1?0x090C10:0x35566B;
  const cabW=isTruck?2.1:len*.52;
  const cab=M(new THREE.SphereGeometry(1,20,14),glass,{inkT:.03,rimPow:1.5,rim:0xBBDDFF});
  cab.scale.set(.92,.46,cabW/2); cab.position.set(0,.86+hgt+.30+lo,isTruck?.4:0); g.add(cab);
  if(isTruck){ const bed=M(new THREE.BoxGeometry(1.95,.5,2.3),paint,{inkT:.026});
    bed.position.set(0,.86+hgt/2+.28+lo,-1.6); g.add(bed); }
  const rimCol=mods.wheels>=2?0xE9E7DA:mods.wheels>=1?0x9CA0AC:0x585D55;
  const wr=mods.wheels>=2?.50:.45;
  // wheels sit on the left/right flanks (x) and along the wheelbase (z), so
  // every axle points along X: a torus's hole axis is +Z by default, a
  // cylinder's is +Y, hence the two different rotations to reach the same axis
  [len/2-.95,-(len/2-.95)].forEach(z=>{
    [1.02,-1.02].forEach(x=>{
      const tyre=M(new THREE.TorusGeometry(wr*.78,wr*.30,10,18),0x13161A,{inkT:.05});
      tyre.rotation.y=Math.PI/2; tyre.position.set(x,wr+lo,z); g.add(tyre);
      const rim=M(new THREE.CylinderGeometry(wr*.55,wr*.55,.30,14),rimCol,{inkT:.05});
      rim.rotation.z=Math.PI/2; rim.position.set(x,wr+lo,z); g.add(rim);
    });
  });
  [.66,-.66].forEach(x=>{
    const hl=new THREE.Mesh(new THREE.SphereGeometry(.17,12,10),new THREE.MeshBasicMaterial({color:0xFFF6D0}));
    hl.scale.set(1,.7,.4); hl.position.set(x,1.05+lo,len/2+.06); g.add(hl);
  });
  g.scale.setScalar(CAR_LENGTH/4.7);   // every dimension above was tuned against a 4.7-unit default tier
  return g;
}

/* ---- world ---- */
function physiqueLocal(){ const s=workoutStreak(); return s>=60?1:s>=30?.75:s>=10?.48:.22; }

/* buildWorld() used to be one ~500-line function building every structure inline.
   Split into one function per structure (still called in the same order, same
   coordinates, purely moved code — no behavior change) so new additions like the
   car-visibility fix and drive mode below land in isolated functions instead of
   growing an already-large monolith further. */
function buildGround(){
  // bumped from 160x160 — the avenue now runs out to z=70 (see buildStreets())
  // to give the car somewhere real to drive, so the ground needs to reach past it
  const ground=M(new THREE.PlaneGeometry(240,240),nightMode?0x35392E:0xC9B896,{ink:false,lift:.06});
  ground.rotation.x=-Math.PI/2; scene.add(ground);
  // the walkway is a raised concrete sidewalk with a kerb either side, not a
  // painted stripe on the dirt — same footprint as before so nothing that keys
  // off the player's spawn or the door spot shifts
  const walk=M(new THREE.BoxGeometry(2.6,.22,12),nightMode?0x5B584F:0xACA492,{ink:false,lift:.04});
  walk.position.set(HOME_X+2,.11,7); scene.add(walk);
  [-1.45,1.45].forEach(x=>{
    const kerb=M(new THREE.BoxGeometry(.3,.34,12),nightMode?0x6B6659:0xC0B9A8,{ink:false,lift:.04});
    kerb.position.set(HOME_X+2+x,.17,7); scene.add(kerb);
  });
}

/* ---- named streets ----
   The old "drive" plane was just the driveway right outside the garage —
   this replaces it with an actual through street plus one cross street,
   loosely modeled on a real Santo Domingo intersection the owner shared
   (two gray paved roads meeting near the colmado's corner, with a named
   sign at each). This is a stylized approximation, not a traced map: real
   street angles/curves are collapsed onto this game's existing north-south/
   east-west grid rather than modeled as diagonals, since a rotated road
   would need its own (rotated) collision box, UV-rotated texture handling,
   and road-following logic none of the rest of the world has — not worth
   it for two decorative cross streets. AVE_X used to reuse the garage/
   CAR_SPOT's own x so the garage sat right on the pavement; now that the
   house (and garage with it) moved to HOME_X to face the colmado across
   C. Marginal, the garage sits off the avenue in open, unobstructed ground
   instead — the car just drives across that gap to reach the road, which
   is a real change to the geometry, not an oversight. */
const AVE_X=9, AVE_W=9, AVE_Z0=-20, AVE_Z1=70;
const MARG_Z=23, MARG_W=9;
function streetSign(text,x,z,rotY){
  const c=document.createElement('canvas'); c.width=512; c.height=96;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#1B6B3A'; ctx.fillRect(0,0,512,96);
  ctx.strokeStyle='#F2F0EA'; ctx.lineWidth=6; ctx.strokeRect(6,6,500,84);
  ctx.fillStyle='#F2F0EA'; ctx.font='bold 50px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,256,50);
  const tex=new THREE.CanvasTexture(c);
  const g=new THREE.Group();
  const post=M(new THREE.CylinderGeometry(.07,.09,3.2,8),0x3D3A32,{inkT:.06}); post.position.y=1.6; g.add(post);
  // two single-sided plates back to back rather than one DoubleSide plate — a
  // DoubleSide material mirrors the same texture onto its back face, which
  // reads as reversed, unreadable text to traffic approaching from behind it
  const mat=new THREE.MeshBasicMaterial({map:tex});
  const plateA=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.64),mat);
  plateA.position.set(0,3.05,.01); g.add(plateA);
  const plateB=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.64),mat);
  plateB.position.set(0,3.05,-.01); plateB.rotation.y=Math.PI; g.add(plateB);
  g.position.set(x,0,z); g.rotation.y=rotY;
  scene.add(g);
}
function buildStreets(){
  // AV. INDEPENDENCIA — the main through avenue. y slightly lower than the
  // cross street's plane so the two don't z-fight where they overlap.
  const ave=M(new THREE.PlaneGeometry(AVE_W,AVE_Z1-AVE_Z0),0x4E525A,{ink:false,lift:.05});
  ave.rotation.x=-Math.PI/2; ave.position.set(AVE_X,.02,(AVE_Z0+AVE_Z1)/2); scene.add(ave);
  streetSign('AV. INDEPENDENCIA',AVE_X+6.6,-9,Math.PI/2);

  // C. MARGINAL — crosses it between the house and the colmado
  const marg=M(new THREE.PlaneGeometry(130,MARG_W),0x53565C,{ink:false,lift:.05});
  marg.rotation.x=-Math.PI/2; marg.position.set(0,.035,MARG_Z); scene.add(marg);
  streetSign('C. MARGINAL',AVE_X-9,MARG_Z-6,0);
}

/* ---- shared Dominican building parts ----
   rejas (the ornate window/door bars on practically every DR building), corrugated
   zinc roofing, and the rooftop tinaco + rebar stubs of a second floor that never
   got built. The house and the colmado both assemble from these rather than each
   rolling its own version. Small repeated pieces (bars, ribs, lettering) use
   {ink:false} — a backface outline on every one of a few dozen adjacent slivers
   reads as noise and doubles the mesh count for nothing. */
function rejas(w,h,color,spacing){
  const g=new THREE.Group();
  const bar=(bw,bh,x,y)=>{
    const b=M(new THREE.BoxGeometry(bw,bh,.06),color,{ink:false});
    b.position.set(x,y,0); g.add(b);
  };
  bar(w,.09,0,h/2); bar(w,.09,0,-h/2);                     // frame
  const n=Math.max(3,Math.round(w/(spacing||.42)));
  for(let i=0;i<=n;i++) bar(.07,h,-w/2+i*(w/n),0);         // vertical bars
  bar(w,.07,0,0);                                          // mid rail
  for(let i=0;i<n;i++){                                    // decorative diamonds
    const d=M(new THREE.BoxGeometry(.14,.14,.05),color,{ink:false});
    d.position.set(-w/2+(i+.5)*(w/n),0,0); d.rotation.z=Math.PI/4; g.add(d);
  }
  return g;
}
/* techo de zinc. The mapped panel alone reads as a flat grey slab from any
   distance, so the corrugation is real rib geometry on top of it — that's the
   difference the hybrid look is built on. */
function zincRoof(w,d,color,tilt){
  const g=new THREE.Group();
  const panel=M(new THREE.BoxGeometry(w,.10,d),color,
    {inkT:.02,map:detailMap('zinc',Math.max(2,Math.round(w/1.8)),Math.max(2,Math.round(d/1.8)))});
  g.add(panel);
  // ribs straddle the panel rather than sitting on top of it: zinc is a thin sheet,
  // so the corrugation has to read from underneath too — the porch awning is at
  // head height and you spend most of the game looking up at its underside
  for(let i=-w/2+.34;i<w/2-.1;i+=.68){
    const rib=M(new THREE.BoxGeometry(.18,.30,d),shade(color,.86),{ink:false});
    rib.position.set(i,0,0); g.add(rib);
  }
  g.rotation.x=tilt||0;
  return g;
}
function roofKit(g,x,y,z,spanX,spanZ){
  const tank=M(new THREE.CylinderGeometry(.8,.8,1.2,12),nightMode?0x121822:0x1B2430,{inkT:.03});
  tank.position.set(x,y+.6,z); g.add(tank);
  const lid=M(new THREE.CylinderGeometry(.38,.38,.14,10),nightMode?0x272E38:0x39424E,{ink:false});
  lid.position.set(x,y+1.26,z); g.add(lid);
  // the column stubs have to clear the roof parapet or none of this reads from
  // ground level — that's the whole point of the detail
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{
    const col=M(new THREE.BoxGeometry(.34,1.3,.34),nightMode?0x4A3D2E:0x6E5A44,{inkT:.04});
    col.position.set(x+sx*spanX,y+.65,z+sz*spanZ); g.add(col);
    for(let i=0;i<3;i++){
      const r=M(new THREE.BoxGeometry(.06,.7,.06),nightMode?0x5C4C3A:0x8A7358,{ink:false});
      r.position.set(x+sx*spanX+(i-1)*.1,y+1.65,z+sz*spanZ); g.add(r);
    }
  });
}

/* The house keeps its 15 x 11 footprint, now at (HOME_X,0,-2) — see HOME_X's
   own comment for why it moved and why only x did. Its front-door spot stays
   at z=5.62; buildingColliders(), spots(), and the security props all key off
   HOME_X rather than their own copies of the old x=-2 literal. */
function buildHouse(){
  const house=new THREE.Group();
  const WALL=nightMode?0x8A3F53:0xE86A8A;                  // barrio pink
  const TRIM=nightMode?0x8C8474:0xE4DCC8;
  const ROOF=nightMode?0x7C7566:0xBFB6A4;
  const body=M(new THREE.BoxGeometry(15,6,11),WALL,{inkT:.014,map:detailMap('wall',4,1)});
  body.position.y=3; house.add(body);
  const skirt=M(new THREE.BoxGeometry(15.1,1.4,11.1),nightMode?0x5E2434:0x9E3B57,{inkT:.016});
  skirt.position.y=.7; house.add(skirt);

  // flat roof slab + parapet — DR houses are flat-topped, so there's somewhere to
  // put the tinaco and somewhere to build the next floor if the money ever shows up
  const slab=M(new THREE.BoxGeometry(15.8,.4,11.8),ROOF,{inkT:.018});
  slab.position.y=6.15; house.add(slab);
  [5.75,-5.75].forEach(pz=>{
    const p=M(new THREE.BoxGeometry(15.8,.7,.3),ROOF,{inkT:.02});
    p.position.set(0,6.7,pz); house.add(p);
  });
  [-7.75,7.75].forEach(px=>{
    const p=M(new THREE.BoxGeometry(.3,.7,11.8),ROOF,{inkT:.02});
    p.position.set(px,6.7,0); house.add(p);
  });
  roofKit(house,-3.2,6.35,-1.4,3.2,3.4);

  // galería — the covered front porch. Columns stay at z=7.4 (the old porch
  // posts' position): the default camera converges just behind the player's
  // spawn, and pulling the porch any further forward puts a post in that shot.
  const aw=zincRoof(10.4,3.6,nightMode?0x5F646A:0x9AA0A6,-.05);
  aw.position.set(0,4.75,6.2); house.add(aw);
  [-4.4,4.4].forEach(x=>{
    const col=M(new THREE.BoxGeometry(.34,4.7,.34),TRIM,{inkT:.04});
    col.position.set(x,2.35,7.4); house.add(col);
  });
  const step=M(new THREE.BoxGeometry(5.4,.3,1.6),nightMode?0x7E7768:0xC7BFAE,{inkT:.03});
  step.position.set(0,.15,6.2); house.add(step);

  const door=M(new THREE.BoxGeometry(2.2,3.7,.26),0x452F20,{inkT:.03});
  door.position.set(0,1.85,5.62); house.add(door);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0xC9A227}));
  knob.position.set(.75,1.85,5.78); house.add(knob);
  const gate=rejas(2.0,3.5,nightMode?0x1E2A32:0x2B3A44,.4);
  gate.position.set(0,1.85,5.92); house.add(gate);

  [[-5,5.62],[5,5.62],[-5,-5.62],[5,-5.62]].forEach(([x,z])=>{
    const front=z>0, s=front?1:-1;
    const fr=M(new THREE.BoxGeometry(2.7,2.3,.18),TRIM,{inkT:.03}); fr.position.set(x,3.5,z); house.add(fr);
    const gl=new THREE.Mesh(new THREE.BoxGeometry(2.3,1.9,.1),
      new THREE.MeshBasicMaterial({color:nightMode?0xFFD98A:0x24333D}));
    gl.position.set(x,3.5,z+s*.06); house.add(gl);
    // rejas only on the street side — a barred window is ~20 small meshes, and the
    // two rear windows face the empty back of the lot where nobody ever stands
    if(front){
      const r=rejas(2.4,2.0,nightMode?0xB9B2A2:0xE9E7DA,.48);
      r.position.set(x,3.5,z+s*.20); house.add(r);
    }
    const sill=M(new THREE.BoxGeometry(2.9,.16,.36),TRIM,{ink:false});
    sill.position.set(x,2.28,z+s*.12); house.add(sill);
  });

  const meter=M(new THREE.BoxGeometry(.5,.7,.24),nightMode?0x3D444C:0x5A6470,{inkT:.05});
  meter.position.set(6.4,3.7,5.6); house.add(meter);

  house.position.set(HOME_X,0,-2);
  scene.add(house); world.house=house;
}

/* the car is parked outside on the driveway (see buildCar()) — this box is a
   backdrop building only, not a hollow structure the car sits inside; it used
   to fully enclose the car at the same coordinates, which hid it completely. */
/* Same footprint and door position as before — objectHit() picks the garage out
   by mesh and CAR_SPOT parks the car right off its door face. Only restyled, so
   it doesn't sit next to the house looking like it came from a different game. */
function buildGarage(){
  const garage=new THREE.Group();
  const gbody=M(new THREE.BoxGeometry(7,4.4,8),nightMode?0x76705F:0xB8AE96,
    {inkT:.018,map:detailMap('wall',2,1)});
  gbody.position.y=2.2; garage.add(gbody);
  const gskirt=M(new THREE.BoxGeometry(7.1,1.0,8.1),nightMode?0x4E4A3F:0x8A8069,{inkT:.02});
  gskirt.position.y=.5; garage.add(gskirt);
  const groof=zincRoof(7.8,8.8,nightMode?0x5A5F65:0x8D9299,0); groof.position.y=4.5; garage.add(groof);
  const gdoor=M(new THREE.BoxGeometry(5.6,3.6,.22),nightMode?0x24272D:0x3A3E46,{inkT:.03});
  gdoor.position.set(0,1.9,4.05); garage.add(gdoor);
  for(let i=1;i<5;i++){   // roll-up door slats
    const line=M(new THREE.BoxGeometry(5.6,.05,.02),0x24262C,{ink:false}); line.position.set(0,.5+i*.62,4.16); garage.add(line);
  }
  garage.position.set(HOME_X+11,0,-3.5);   // +11: the same offset from the house it always had
  scene.add(garage); world.garage=garage;
}

/* ---- COLMADO (corner store) — down the street ----
   Depth stays at 6 (front face at colPos.z+3, back at colPos.z-3): the default
   camera converges around z=15 behind the player's spawn, and pushing the back
   wall any closer to that walks straight back into the camera-inside-a-building
   bug this building caused once already. The signage is deliberately generic —
   real colmados are plastered in beer and phone-company branding, but copying
   actual trademarks into a shipped app is brand impersonation, so this uses the
   same colours and layout with a made-up name. */
function buildColmado(colPos){
  const colmado=new THREE.Group();
  const WALL=nightMode?0x1C6058:0x2FA79B;                  // turquoise, a real colmado colour
  const BASE=nightMode?0x123640:0x1D4E5E;
  const cBody=M(new THREE.BoxGeometry(10,4.2,6),WALL,{inkT:.02,map:detailMap('wall',3,1)});
  cBody.position.y=2.1; colmado.add(cBody);
  const skirt=M(new THREE.BoxGeometry(10.1,1.1,6.1),BASE,{inkT:.02});
  skirt.position.y=.55; colmado.add(skirt);

  const roof=zincRoof(11.2,7.4,nightMode?0x5A5F65:0x8D9299,-.07);
  roof.position.y=4.45; colmado.add(roof);
  const eave=M(new THREE.BoxGeometry(10.6,.26,7.0),nightMode?0x8E8A7E:0xE0DCCF,{inkT:.02});
  eave.position.y=4.2; colmado.add(eave);

  // open counter behind rejas — how you actually buy at a colmado, through the bars
  const open=M(new THREE.BoxGeometry(6.0,2.1,.36),nightMode?0x0E1216:0x14181C,{inkT:.03});
  open.position.set(0,2.2,3.0); colmado.add(open);
  const bars=rejas(5.8,2.0,nightMode?0xB9B2A2:0xE9E7DA,.46);
  bars.position.set(0,2.2,3.24); colmado.add(bars);
  const counter=M(new THREE.BoxGeometry(6.4,.3,.95),nightMode?0x8F8168:0xC9B896,{inkT:.03});
  counter.position.set(0,1.15,3.3); colmado.add(counter);
  const cbase=M(new THREE.BoxGeometry(6.2,1.05,.8),BASE,{inkT:.03});
  cbase.position.set(0,.6,3.24); colmado.add(cbase);

  // hand-painted sign board standing above the roof edge
  const sign=M(new THREE.BoxGeometry(7.0,1.35,.18),nightMode?0xB08A22:0xF2C230,{inkT:.03});
  sign.position.set(0,5.15,3.0); colmado.add(sign);
  [4.44,5.86].forEach(y=>{
    const edge=M(new THREE.BoxGeometry(7.2,.16,.22),nightMode?0x952C1F:0xD8412F,{ink:false});
    edge.position.set(0,y,3.0); colmado.add(edge);
  });
  for(let i=0;i<7;i++){                                    // lettering, without needing a font
    const L=M(new THREE.BoxGeometry(.34,.5,.06),nightMode?0x14293A:0x1D3B4E,{ink:false});
    L.position.set(-2.4+i*.8,5.17,3.12); colmado.add(L);
  }
  // painted side panel — crate red, no logo
  const ad=M(new THREE.BoxGeometry(.16,2.4,4.0),nightMode?0x952C1F:0xD8412F,{inkT:.03});
  ad.position.set(-5.0,2.4,-.4); colmado.add(ad);

  // stacked crates, a gas cylinder, a bare bulb on a wire: standard colmado clutter
  const crateCols=[0xD8412F,0xF2C230,0x2F7A4F];
  for(let s=0;s<3;s++) for(let h=0;h<(s===1?3:2);h++){
    const c=M(new THREE.BoxGeometry(.82,.54,.82),crateCols[(s+h)%3],{inkT:.03});
    c.position.set(-3.6+s*1.0,.28+h*.56,4.3); colmado.add(c);
  }
  const cyl=M(new THREE.CylinderGeometry(.32,.32,.9,10),nightMode?0x9A6E16:0xE0A020,{inkT:.04});
  cyl.position.set(3.9,.45,4.1); colmado.add(cyl);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshBasicMaterial({color:0xFFE9A0}));
  bulb.position.set(1.8,3.9,3.4); colmado.add(bulb);
  if(nightMode){ const pl=new THREE.PointLight(0xFFD98A,.6,9); pl.position.copy(bulb.position); colmado.add(pl); }

  colmado.position.copy(colPos);
  scene.add(colmado); world.colmado=colmado;

  // colmado concrete patio (colorful painted slab, a barrio staple)
  const patio=M(new THREE.CircleGeometry(7,24), nightMode?0x4A4038:0xE0C878, {ink:false,lift:.04});
  patio.rotation.x=-Math.PI/2; patio.position.set(colPos.x,.015,colPos.z+7);
  scene.add(patio);
}

/* ---- domino table + seated players ---- */
function buildDominoScene(colPos){
  const dTable=new THREE.Group();
  const tTop=M(new THREE.CylinderGeometry(1.3,1.3,.12,16), 0x8B5A3C, {inkT:.03});
  tTop.position.y=1.0; dTable.add(tTop);
  const tLeg=limb(.09,.09,1.0, 0x3A2A1C, {inkT:.06}); tLeg.position.y=.5; dTable.add(tLeg);

  /* actual domino tiles scattered on the table — white with black pips */
  const tileM=new THREE.MeshBasicMaterial({color:0xF2EFE6});
  const pipM=new THREE.MeshBasicMaterial({color:0x1A1410});
  function domino(x,z,rot){
    const t=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,.32), tileM); t.add(body);
    const rim=new THREE.Mesh(new THREE.BoxGeometry(.17,.005,.005), pipM); rim.position.y=.014; t.add(rim);
    // pip dots — random small count per half for visual variety
    for(let half=-1;half<=1;half+=2){
      const n=1+Math.floor(Math.random()*5);
      for(let p=0;p<n;p++){
        const dot=new THREE.Mesh(new THREE.CircleGeometry(.018,8), pipM);
        dot.rotation.x=-Math.PI/2;
        dot.position.set((Math.random()-.5)*.09, .0135, half*.08+(Math.random()-.5)*.08);
        t.add(dot);
      }
    }
    t.position.set(x,1.065,z); t.rotation.y=rot;
    dTable.add(t);
  }
  for(let i=0;i<9;i++){
    domino((Math.random()-.5)*1.7, (Math.random()-.5)*1.7, Math.random()*Math.PI*2);
  }
  // a few tiles stood on edge, mid-play
  for(let i=0;i<3;i++){
    const standing=new THREE.Mesh(new THREE.BoxGeometry(.16,.32,.025), tileM);
    standing.position.set(-0.6+i*0.14, 1.22, 0.55);
    standing.rotation.y=(Math.random()-.5)*.3;
    dTable.add(standing);
  }

  dTable.position.set(colPos.x-1,0,colPos.z+9.5);
  scene.add(dTable); world.dominoTable=dTable;

  /* white plastic monobloc chairs — the classic colmado seat */
  function monoblocChair(x,z,facingY){
    const c=new THREE.Group();
    const seatM=0xF2F0EA;
    const seat=M(new THREE.BoxGeometry(.62,.06,.58), seatM, {inkT:.03});
    seat.position.y=.62; c.add(seat);
    const back=M(new THREE.BoxGeometry(.58,.62,.06), seatM, {inkT:.03});
    back.position.set(0,.95,-.27); back.rotation.x=-0.12; c.add(back);
    // ribbed backrest slats
    for(let i=0;i<4;i++){
      const slat=M(new THREE.BoxGeometry(.5,.09,.02), 0xDDD9CC, {ink:false});
      slat.position.set(0, .70+i*.13, -.29-i*.008); slat.rotation.x=-0.12; c.add(slat);
    }
    [[-.26,-.24],[.26,-.24],[-.26,.24],[.26,.24]].forEach(([lx,lz])=>{
      const leg=limb(.025,.03,.62, seatM, {inkT:.08}); leg.position.set(lx,.31,lz); c.add(leg);
    });
    c.position.set(x,0,z); c.rotation.y=facingY;
    scene.add(c);
  }

  const dominoSeats=[[1.7,0],[-1.7,0],[0,1.7],[0,-1.7]];
  const dominoNPCs=[];
  dominoSeats.forEach(([dx,dz],i)=>{
    const skin=[0x8D5524,0xC9884F,0x6B4226,0xA8703E][i];
    const shirt=[0x2F7A4F,0xE9E7DA,0x1A4E8C,0xB5432E][i];
    const seatAngle=Math.atan2(-dx,-dz);
    const sx=dTable.position.x+dx*1.55, sz=dTable.position.z+dz*1.55;
    monoblocChair(sx, sz, seatAngle);
    const p=modelPerson()||makePerson(shirt, skin, .5, {tank:shirt, jean:0x232833, bling:false, hair:0x14100C});
    if(p.userData.mixer){
      // rigged characters idle standing around the table (the rig has no sit clip)
      p.position.set(sx+dx*.35, 0, sz+dz*.35);
    }else{
      // primitive fallback can be posed by hand: seated, legs bent, dropped onto the chair
      p.userData.legL.rotation.x=-1.35; p.userData.legR.rotation.x=-1.35;
      p.userData.armL.rotation.x=-0.5; p.userData.armR.rotation.x=-0.5;
      p.position.set(sx, -.28, sz);
    }
    p.rotation.y=seatAngle;
    scene.add(p); dominoNPCs.push(p);
  });
  world.dominoNPCs=dominoNPCs;
}

/* ---- string lights across the colmado patio ---- */
function buildStreetLights(colPos){
  const lightPosts=[[colPos.x-6,colPos.z+4],[colPos.x+6,colPos.z+4],[colPos.x-6,colPos.z+13],[colPos.x+6,colPos.z+13]];
  lightPosts.forEach(([x,z])=>{
    const post=limb(.08,.10,3.4,0x4A3B2A,{inkT:.06}); post.position.set(x,1.7,z); scene.add(post);
  });
  const bulbM=new THREE.MeshBasicMaterial({color:0xFFE9A0});
  for(let i=0;i<18;i++){
    const t=i/17;
    const x=lightPosts[0][0]*(1-t)+lightPosts[1][0]*t;
    const z=lightPosts[0][1]+Math.sin(t*Math.PI)*-0.6;
    const sag=Math.sin(t*Math.PI)*0.7;
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.06,8,8), bulbM);
    bulb.position.set(x, 3.35-sag, z); scene.add(bulb);
    if(nightMode&&i%3===0){ const pl=new THREE.PointLight(0xFFD98A,.5,6); pl.position.copy(bulb.position); scene.add(pl); }
  }
}

/* ---- wandering NPC groups (ambient life) ---- */
function buildWanderers(colPos){
  const wanderers=[];
  for(let i=0;i<5;i++){
    const skin=[0x8D5524,0xC9884F,0x6B4226,0xA8703E,0x5C3A21][i];
    const shirt=[0xE63946,0x4FA88C,0xFFD23F,0xE9E7DA,0x2F4858][i];
    const p=modelPerson()||makePerson(shirt, skin, Math.random()*.4, {tank:shirt, jean:0x232833, bling:false, hair:0x14100C});
    const a=Math.random()*Math.PI*2, r=8+Math.random()*5;
    p.position.set(colPos.x+Math.cos(a)*r, 0, colPos.z+7+Math.sin(a)*r);
    p.userData.center=new THREE.Vector3(colPos.x,0,colPos.z+7);
    p.userData.radius=6+Math.random()*4;
    p.userData.angle=a;
    p.userData.speed=0.12+Math.random()*0.1;
    p.userData.wt=Math.random()*10;
    scene.add(p); wanderers.push(p);
  }
  world.wanderers=wanderers;
}

/* ---- palm trees along the street ---- */
function buildPalms(colPos){
  for(let i=0;i<9;i++){
    const palm=new THREE.Group();
    const trunkH=3.4+Math.random()*1.4;
    const trunk=limb(.14,.20,trunkH,0x6B5033,{inkT:.05}); trunk.position.y=trunkH/2; trunk.rotation.z=(Math.random()-.5)*.12; palm.add(trunk);
    for(let k=0;k<6;k++){
      const frond=M(new THREE.ConeGeometry(.14,1.7,6), nightMode?0x2E5240:0x4E9463, {ink:false});
      const fa=(k/6)*Math.PI*2;
      frond.position.set(0,trunkH+.1,0);
      frond.rotation.set(Math.PI/2 - 0.55, 0, fa);
      palm.add(frond);
    }
    const side=i%2===0?-1:1;
    palm.position.set(colPos.x+side*(9+Math.random()*3), 0, colPos.z-6+i*2.6);
    scene.add(palm);
  }
}

/* ---- power poles and the overhead wire tangle ----
   As much a part of a DR street as the buildings are. Placed at x=-30 — clear
   of both the perimeter fence line (x=-13.5, from the security upgrades) and
   the colmado's footprint (COLMADO_POS.x=-16, collider out to x=-21) now that
   it sits further west of the avenue. */
function buildPowerLines(){
  const tops=[];
  [-4,9,22,35].forEach(z=>{
    const pole=M(new THREE.CylinderGeometry(.18,.24,8,8),nightMode?0x5D5850:0x8A8378,{inkT:.03});
    pole.position.set(-30,4,z); scene.add(pole);
    const arm=M(new THREE.BoxGeometry(2.2,.16,.16),nightMode?0x4A463E:0x6E675C,{ink:false});
    arm.position.set(-30,7.4,z); scene.add(arm);
    tops.push(new THREE.Vector3(-30,7.4,z));
  });
  const wireM=new THREE.LineBasicMaterial({color:nightMode?0x0A0C10:0x1A1A1A});
  for(let i=0;i<tops.length-1;i++) for(let k=0;k<4;k++){
    const a=tops[i], b=tops[i+1], sag=.9+k*.18, off=(k-1.5)*.18, drop=k*.24, pts=[];
    for(let s=0;s<=8;s++){
      const t=s/8;
      pts.push(new THREE.Vector3(a.x+off, a.y-drop-Math.sin(t*Math.PI)*sag, a.z+(b.z-a.z)*t));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),wireM));
  }
}

/* lighting — MeshToonMaterial sums each light's own step-shaded contribution, so
   ambient + sun + fill on an upward-facing surface (ground, driveway, car roofs —
   high N·L against all three at once) used to add past 1.0 and clip solid white.
   Keeping the sum near ~1.0 on a top-lit face keeps toon banding visible everywhere. */
function buildLighting(){
  scene.add(new THREE.AmbientLight(0xffffff, nightMode?.22:.42));
  const sun=new THREE.DirectionalLight(0xffffff, nightMode?.20:.46);
  sun.position.set(-14,22,10); scene.add(sun);
  // fill light so the player character reads clearly from behind (third-person default view)
  const fill=new THREE.DirectionalLight(0xCFE0FF, nightMode?.14:.19);
  fill.position.set(6,10,-14); scene.add(fill);
}

/* security props */
function buildSecurityProps(){
  const sec=S.security;
  if(sec.cameras>0){
    const n=Math.min(4,sec.cameras+1);
    for(let i=0;i<n;i++){
      const c=new THREE.Group();
      const arm=limb(.05,.05,.6,0x2C3242,{inkT:.07}); arm.rotation.z=Math.PI/2; c.add(arm);
      const hd=M(new THREE.SphereGeometry(.24,14,12),0x1E232B,{inkT:.05}); hd.scale.set(1.5,.9,.9); hd.position.x=.55; c.add(hd);
      const led=new THREE.Mesh(new THREE.SphereGeometry(.06,8,8),new THREE.MeshBasicMaterial({color:0xE63946}));
      led.position.set(.86,.10,0); c.add(led);
      const a=(i/n)*Math.PI*2;
      c.position.set(HOME_X+Math.cos(a)*7.7,5.5,-2+Math.sin(a)*5.7); c.rotation.y=-a+Math.PI;
      scene.add(c);
    }
  }
  if(sec.lights>0){
    const n=Math.min(4,sec.lights);
    for(let i=0;i<n;i++){
      const L=M(new THREE.SphereGeometry(.32,12,10),0xF0EAD8,{inkT:.05}); L.scale.set(1.4,.8,.8);
      L.position.set(HOME_X+(i%2?7.9:-7.9),5.9,-2+(i<2?5.9:-5.9)); scene.add(L);
      if(nightMode){ const pl=new THREE.PointLight(0xFFE9A8,1.3,24); pl.position.copy(L.position); scene.add(pl); }
    }
  }
  if(sec.alarm>0){ const ab=M(new THREE.BoxGeometry(.7,.9,.3),0xE63946,{inkT:.05}); ab.position.set(HOME_X+2.4,4.7,5.72); scene.add(ab); }
  if(sec.doors>0){
    const fh=.9+sec.doors*.35;
    const mk=(x,z)=>{ const p=limb(.07,.09,fh,0x5A4630,{inkT:.07}); p.position.set(x,fh/2,z); scene.add(p); };
    for(let i=-13;i<=13;i+=1.7){ mk(i+HOME_X,15.5); mk(i+HOME_X,-17.5); }
    for(let i=-15;i<=15;i+=1.7){ mk(HOME_X-11.5,i-2); mk(HOME_X+15.5,i-2); }
  }
  if(sec.dog>0){
    const d=new THREE.Group();
    const b=M(new THREE.SphereGeometry(.5,16,12),0x77502F,{inkT:.035}); b.scale.set(1.5,.85,.8); b.position.y=.72; d.add(b);
    const h=M(new THREE.SphereGeometry(.32,14,12),0x77502F,{inkT:.04}); h.position.set(.86,1.02,0); d.add(h);
    const sn=M(new THREE.ConeGeometry(.15,.36,10),0x513520,{ink:false}); sn.rotation.z=-Math.PI/2; sn.position.set(1.20,.94,0); d.add(sn);
    [[-.42,.26],[.42,.26],[-.42,-.26],[.42,-.26]].forEach(([x,z])=>{
      const l=limb(.09,.07,.58,0x513520,{inkT:.07}); l.position.set(x,.34,z); d.add(l);
    });
    const t=limb(.07,.04,.55,0x77502F,{inkT:.08}); t.position.set(-.80,.95,0); t.rotation.z=-.8; d.add(t);
    d.position.set(HOME_X-6,0,6); scene.add(d); world.dog=d;
  }
  if(sec.detail>0){
    const guard=modelPerson()||makePerson(0x1A2028,0xC9884F,.62,{hair:0x14100C});
    guard.position.set(HOME_X+6.5,0,9); guard.rotation.y=-.6;
    scene.add(guard); world.guard=guard;
  }
}

/* car — parked on the driveway, just outside the garage door, so it's actually
   visible (see buildGarage() above) and has room to drive off from. CAR_SPOT
   is also used by spots() and rebuildCar() so all three stay in sync. */
/* z=7, not 4: the old AABB collision only ever checked a small CAR_RADIUS
   circle around the car's center point, so a spot whose circle cleared the
   garage was "safe" even though the car's true 9.6-unit length reached
   well past that circle. cannon.js's chassis is a real box the car's full
   length, and at z=4 its rear end penetrated the garage's static collider —
   the settle step in buildVehicle() then read as the car launching sideways
   over a dozen units, which is really a contact solver violently correcting
   a spawn-time interpenetration. z=7 clears the garage's z<=0.5 edge with
   real margin (rear bumper at 7-4.8=2.2). Found by tracing exactly that. */
/* There is deliberately NO car rotation offset. The loaded car model, the
   primitive makeCar() fallback and the cannon.js chassis are all built
   nose-along-+Z, which is also the game's forward at yaw 0 ((sin y, cos y)),
   so world.car.rotation.y IS the physics yaw. A CAR_ROT_OFFSET of PI/2 used
   to sit here and rotated the car a quarter turn off its direction of travel
   — the car visibly drove sideways. Verified from the asset itself: the OBJ's
   Headlights material centroids at z=+1.99, TailLights at z=-1.88. If you
   ever swap the car model, measure it the same way rather than adding an
   offset back. */
const CAR_SPOT=new THREE.Vector3(HOME_X+11,0,7);
function buildCar(){
  world.car=modelCar(S.vehicle.paint)||makeCar();
  world.car.position.copy(CAR_SPOT); world.car.rotation.y=0;
  scene.add(world.car);
  // the fallback physics is always built, cheap and ready, even when cannon.js
  // is driving — carPhys.rot uses the SAME convention as world.car.rotation.y
  carPhys=new CarPhysics({length:CAR_LENGTH,width:CAR_WIDTH});
  carPhys.pos=[CAR_SPOT.x,CAR_SPOT.z]; carPhys.rot=0;
}

/* the colmado's world position — a module constant (not a buildWorld() local)
   so the collision boxes below can reference the exact same numbers buildColmado()
   and its neighbours (domino table, street lights, wanderers, palms) build from.
   Shifted west and further out (see buildStreets()) so the colmado sits in its
   own corner block, off to the side of the avenue rather than dead ahead of the
   player's spawn, with enough gap for C. Marginal to cross the avenue between
   the house and the colmado without slicing through the security-fence
   perimeter or the colmado's own footprint. Moving z further AWAY from spawn
   (24->34) only widens the margin CLAUDE.md's camera-safety note is protecting
   (the default camera converges around z=15.5, well short of either value) —
   still re-verified after this change, same as any colmado-position edit should be. */
const COLMADO_POS=new THREE.Vector3(-16,0,34);

/* ---- generic placeholder buildings ----
   Fills out the block the way the owner's reference map showed it — several
   plain structures around the colmado and across the avenue — without
   inventing detail (colour, signage, a purpose) the reference doesn't
   actually specify for them. Deliberately plainer than the house/garage/
   colmado: a body, a roof cap, a skirt band, nothing else, so they read as
   "another building on the block" rather than competing with the three
   buildings that actually matter for gameplay. Real, solid buildings though
   — {w,d} feeds buildingColliders() below the same as any other structure,
   so the car can't drive through a placeholder any more than the colmado. */
const PLACEHOLDER_BUILDINGS=[
  {x:-36,z:34,w:8,d:8,h:4.2},     // west of the colmado, its side of C. Marginal
  {x:-31,z:44,w:7,d:7,h:3.6},
  {x:-46,z:35,w:9,d:7,h:4.8},
  {x:20,z:34,w:8,d:8,h:5.2},      // across the avenue from the colmado block
  {x:36,z:34,w:8,d:8,h:4.2},
  {x:28,z:46,w:7,d:9,h:3.8},
  {x:44,z:42,w:7,d:7,h:4.6},
  {x:-38,z:-6,w:6,d:8,h:4.0}      // south of C. Marginal, the house's side of the block
];
function buildPlaceholders(){
  const wallCols=[0xC9B896,0xB8AE96,0xA8A088,0xBFAE9E];
  PLACEHOLDER_BUILDINGS.forEach((b,i)=>{
    const g=new THREE.Group();
    const body=M(new THREE.BoxGeometry(b.w,b.h,b.d),nightMode?0x5E594D:wallCols[i%wallCols.length],
      {inkT:.018,map:detailMap('wall',Math.max(2,Math.round(b.w/3)),1)});
    body.position.y=b.h/2; g.add(body);
    const skirt=M(new THREE.BoxGeometry(b.w+.1,.8,b.d+.1),nightMode?0x3D3A30:0x8A8069,{inkT:.02});
    skirt.position.y=.4; g.add(skirt);
    const roof=M(new THREE.BoxGeometry(b.w+.4,.3,b.d+.4),nightMode?0x4A463E:0xBFB6A4,{inkT:.02});
    roof.position.y=b.h+.15; g.add(roof);
    g.position.set(b.x,0,b.z);
    scene.add(g);
  });
}

/* ---- building collision ----
   Solid walls that neither the player nor the driven car can pass through.
   Boxes are axis-aligned in world space, sized from each building's own known
   footprint (see buildHouse()/buildGarage()/buildColmado()) plus enough extra
   on the colmado's street-facing side to also block its counter, crates and
   gas cylinder, which stick out past the wall itself. Porch columns, awnings
   and the domino table are deliberately left out — thin single posts, not
   walls, and colliding with every one of them would make walking near the
   house feel like fighting the geometry. */
function buildingColliders(){
  return [
    {minX:HOME_X-7.5,maxX:HOME_X+7.5,minZ:-7.5,maxZ:3.5},                      // house (15x11 @ HOME_X,-2)
    {minX:HOME_X+7.5,maxX:HOME_X+14.5,minZ:-7.5,maxZ:0.5},                     // garage (7x8 @ HOME_X+11,-3.5)
    {minX:COLMADO_POS.x-5,maxX:COLMADO_POS.x+5,                                // colmado (10x6) + street clutter
     minZ:COLMADO_POS.z-3,maxZ:COLMADO_POS.z+4.6},
    ...PLACEHOLDER_BUILDINGS.map(b=>({minX:b.x-b.w/2,maxX:b.x+b.w/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2}))
  ];
}
/* Pushes pos out of any collider it has penetrated, along whichever axis needs
   the smaller correction — the same approach the house-only check used before
   this was generalized to all three buildings. Returns whether a push happened,
   so callers can kill a stale move/drive target and (for the car) momentum. */
function resolveCollisions(pos,radius){
  let hit=false;
  buildingColliders().forEach(b=>{
    const minX=b.minX-radius,maxX=b.maxX+radius,minZ=b.minZ-radius,maxZ=b.maxZ+radius;
    if(pos.x<=minX||pos.x>=maxX||pos.z<=minZ||pos.z>=maxZ) return;
    hit=true;
    const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
    const inX=Math.min(pos.x-minX,maxX-pos.x), inZ=Math.min(pos.z-minZ,maxZ-pos.z);
    if(inX<inZ) pos.x=pos.x>cx?maxX:minX;
    else pos.z=pos.z>cz?maxZ:minZ;
  });
  return hit;
}

/* ---- cannon.js physics world (only when USE_CANNON) ----
   One static box body per buildingColliders() entry — extruded well above
   head height, since cannon.js doesn't need the 2D-only shortcut
   resolveCollisions() uses — plus a ground plane, so the driven car collides
   with real walls through an actual rigid-body contact solve. Rebuilt fresh
   every buildWorld() call: cannon.js bodies are plain JS objects with no GPU
   resources, so unlike the THREE scene there's nothing to dispose. */
function buildPhysicsWorld(){
  if(!USE_CANNON) return;
  physWorld=new CANNON.World();
  physWorld.gravity.set(0,-9.82,0);
  physWorld.broadphase=new CANNON.SAPBroadphase(physWorld);
  physWorld.defaultContactMaterial.friction=0.3;

  const ground=new CANNON.Body({mass:0});
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI/2,0,0);
  physWorld.addBody(ground);

  buildingColliders().forEach(b=>{
    const hx=(b.maxX-b.minX)/2, hz=(b.maxZ-b.minZ)/2, hy=6;
    const body=new CANNON.Body({mass:0});
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx,hy,hz)));
    body.position.set((b.minX+b.maxX)/2,hy,(b.minZ+b.maxZ)/2);
    physWorld.addBody(body);
  });
}

/* ---- the driven car's rigid body (only when USE_CANNON) ----
   Chassis sized off CAR_LENGTH/CAR_WIDTH so it can never drift from the
   visual mesh. Suspension/friction/steering numbers here were tuned and
   verified numerically in isolated Node — settles flat with no roll, holds a
   hard turn at speed without flipping, stops cleanly against a wall rather
   than jittering — before this ever ran in a browser; see CLAUDE.md for the
   exact repro commands if you retune them. */
function buildVehicle(){
  if(!USE_CANNON) return;
  const chassisShape=new CANNON.Box(new CANNON.Vec3(CAR_WIDTH/2,1.0,CAR_LENGTH/2));
  chassisBody=new CANNON.Body({mass:1400});
  // CANNON.Body defaults allowSleep to true — a parked car sitting still for
  // even a few seconds goes to sleep, and applyEngineForce() on a sleeping
  // body is a silent no-op (found by simulating: the car sat still under full
  // throttle after idling). A drivable vehicle should always respond the
  // instant the player touches the controls, however long it's been parked.
  chassisBody.allowSleep=false;
  chassisBody.angularDamping=CAR_ANGULAR_DAMPING;
  chassisBody.addShape(chassisShape);
  chassisBody.position.set(CAR_SPOT.x,2.5,CAR_SPOT.z);
  physWorld.addBody(chassisBody);

  // This version of cannon.js defaults indexRightAxis/indexForwardAxis/
  // indexUpAxis to (y,x,z) — a different convention than our Y-up world —
  // so they're overridden here to match (x,z,y). This IS required: the
  // wheel's forward-rolling direction is ground-normal × axle in world
  // space, and with the wrong up-axis bookkeeping elsewhere in the solve it
  // comes out along the wrong world axis entirely (verified two ways: the
  // isolated Node tuning script this was built against, and — the hard way —
  // by wrongly removing this once, which looked like it fixed a sideways
  // launch that was actually a separate CAR_SPOT/garage overlap bug).
  vehicle=new CANNON.RaycastVehicle({chassisBody,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
  const wheelOptions={
    radius:0.9, directionLocal:new CANNON.Vec3(0,-1,0), suspensionStiffness:45,
    suspensionRestLength:0.7, frictionSlip:2.2, dampingRelaxation:2.8,
    dampingCompression:4.6, maxSuspensionForce:200000, rollInfluence:0.02,
    axleLocal:new CANNON.Vec3(1,0,0), maxSuspensionTravel:0.6,
    customSlidingRotationalSpeed:-40, useCustomSlidingRotationalSpeed:true
  };
  const hw=CAR_WIDTH/2-0.2, hl=CAR_LENGTH/2-1.4;   // wheel indices: 0=FL 1=FR 2=RL 3=RR
  [[-hw,0,hl],[hw,0,hl],[-hw,0,-hl],[hw,0,-hl]].forEach(([x,y,z])=>{
    vehicle.addWheel(Object.assign({},wheelOptions,{chassisConnectionPointLocal:new CANNON.Vec3(x,y,z)}));
  });
  vehicle.addToWorld(physWorld);

  // let the suspension settle onto the ground before the player ever sees or
  // drives it, then read back the resting ride height: the visual mesh's own
  // origin sits at ground level (at its wheels), not at the chassis body's
  // center, so every frame after this offsets by exactly this much
  for(let i=0;i<30;i++) physWorld.step(1/60);
  carRideHeight=chassisBody.position.y;
}

/* the board */
function buildBoard(){
  const board=new THREE.Group();
  const bp=limb(.09,.11,2.0,0x5A4630,{inkT:.07}); bp.position.y=1.0; board.add(bp);
  const pan=M(new THREE.BoxGeometry(2.4,1.5,.14),0xEFEADC,{inkT:.03}); pan.position.y=2.3; board.add(pan);
  const gr=M(new THREE.BoxGeometry(2.0,1.15,.06),0x5C7A4A,{ink:false}); gr.position.set(0,2.3,.10); board.add(gr);
  board.position.set(HOME_X-5.5,0,7.5);
  scene.add(board); world.board=board;
}

/* foliage */
function buildFoliage(){
  for(let i=0;i<20;i++){
    const t=new THREE.Group();
    const tr=limb(.16,.26,2.6,0x53381F,{inkT:.05}); tr.position.y=1.3; t.add(tr);
    for(let k=0;k<3;k++){
      const cr=M(new THREE.IcosahedronGeometry(1.25+Math.random()*.5,1),nightMode?0x25452F:0x54843F,{inkT:.026});
      cr.position.set((Math.random()-.5)*1.1,3.1+k*.55,(Math.random()-.5)*1.1);
      cr.rotation.set(Math.random(),Math.random(),Math.random()); t.add(cr);
    }
    const a=Math.random()*Math.PI*2, r=20+Math.random()*26;
    t.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    // floor raised well above 1.0: at the old .75-1.65 range the smallest trees
    // (apex ~4.2-5.95 units unscaled * .75) came out barely taller than the
    // 4-unit-tall player — a "tree" you could look nearly level with reads as a
    // shrub, not a tree, next to a person of fixed real height
    const s=1.3+Math.random()*.7; t.scale.set(s,s,s);
    t.userData.foliageTree=true;
    scene.add(t);
  }
}

/* player */
function buildPlayer(){
  const per=S.person;
  playerGroup=modelPerson(FITS[0])||makePerson(0x7C3AED, per.skin, physiqueLocal(), {tank:0xF3F1E7, jean:0x7C3AED, bling:true, shorts:true});
  // spawn on the walkway (walk plane spans z 1..13), close enough to the house that the
  // default over-the-shoulder camera (camYaw=PI, ~9.5 units behind the player) settles
  // in open street — at the old z=14 spawn it converged to roughly z=23, which sat
  // *inside* the colmado at z=24 and rendered as a wall of its mint-green trim filling the screen.
  playerGroup.position.set(HOME_X+2,0,6);
  scene.add(playerGroup);
  player={pos:playerGroup.position,yaw:Math.PI,walkT:0,targetYaw:Math.PI};
}

/* marker */
function buildMarker(){
  marker=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.62,26),
    new THREE.MeshBasicMaterial({color:0x8FAE7A,side:THREE.DoubleSide,transparent:true,opacity:.9}));
  ring.rotation.x=-Math.PI/2; marker.add(ring);
  marker.visible=false; marker.position.y=.06; scene.add(marker);
  // no offscreen post-processing pass — that custom composite shader can fail to
  // compile on some GPUs without ever throwing a JS error (three.js just logs a
  // warning), which produces a permanently black screen with no way to detect it
  // from here. Render straight to the canvas instead — reliable over stylized.
}

/* buildWorld() assembles every structure above, in the same order and coordinates
   as before the split — purely orchestration now. */
function buildWorld(){
  scene=new THREE.Scene();
  const sky=nightMode?0x0E1524:0x8FC3DE;
  scene.background=new THREE.Color(sky);
  scene.fog=new THREE.Fog(sky,30,86);
  camera=new THREE.PerspectiveCamera(54,1,.1,400);

  buildGround();
  buildStreets();
  buildPlaceholders();
  buildHouse();
  buildGarage();
  const colPos=COLMADO_POS;
  buildColmado(colPos);
  buildDominoScene(colPos);
  buildStreetLights(colPos);
  buildWanderers(colPos);
  buildPalms(colPos);
  buildPowerLines();
  buildLighting();
  buildSecurityProps();
  buildPhysicsWorld();
  buildCar();
  buildVehicle();
  buildBoard();
  buildFoliage();
  buildPlayer();
  buildMarker();
  // cameraMode persists across a MENU<->ENTER round trip (a deliberate preference,
  // not session state) — re-apply it to the fresh player mesh and HUD
  updatePlayerVisibility();
  syncCameraModeUI();
}

/* ---- interaction spots ---- */
function spots(){
  return [
    {key:'car',nm:'YOUR VEHICLE',hint:'Drive or view garage',p:CAR_SPOT,r:5,act:()=>openCarMenu()},
    {key:'door',nm:'FRONT DOOR',hint:'Home security',p:new THREE.Vector3(HOME_X,0,5.6),r:3.6,act:()=>openSecurity()},
    {key:'board',nm:'THE BOARD',hint:'Log your day',p:new THREE.Vector3(HOME_X-5.5,0,7.5),r:3.6,act:()=>openLog()},
    {key:'colmado',nm:'EL COLMADO',hint:'Say what\'s up',p:COLMADO_POS,r:6,act:()=>colmadoGreet()}
  ];
}
const COLMADO_LINES=[
  '"¿Qué lo que, manito?" someone calls out from the dominoes.',
  'A radio somewhere is playing a little too loud. Nobody minds.',
  'Someone slams a domino down — "¡CAPICÚA!"',
  'The colmado guy nods at you without looking up from the counter.',
  'Kids run past chasing a chichigua kite down the block.'
];
function colmadoGreet(){ toast(COLMADO_LINES[Math.floor(Math.random()*COLMADO_LINES.length)]); }
function checkInteract(){
  let best=null,bd=1e9;
  spots().forEach(s=>{ const d=Math.hypot(s.p.x-player.pos.x,s.p.z-player.pos.z); if(d<s.r&&d<bd){bd=d;best=s;} });
  interactTarget=best;
  const el=document.getElementById('prompt');
  if(best){
    el.style.display='flex';
    el.querySelector('.pl').textContent=best.nm;
    el.querySelector('.ph').textContent=best.hint;
    if(pendingSpot&&pendingSpot.key===best.key){ pendingSpot=null; moveTarget=null; best.act(); }
  } else el.style.display='none';
}
function useTarget(){ if(interactTarget) interactTarget.act(); }

/* ---- intruders ---- */
function spawnIntruders(){
  const inc=S.incident; if(!inc||inc.done) return;
  const n=Math.max(2,Math.ceil(inc.p/26));
  for(let i=0;i<n;i++){
    const f=modelPerson({model:'hoodie',Purple:0x14161B,White:0x1A1D24,LightBlue:0x0E0E12,Hair:0x0E0C0A,Skin:0x6B4226})
            ||makePerson(0x161A21,0x8D5524,.4,{hair:0x0E0C0A});
    const a=Math.random()*Math.PI*2, r=26+Math.random()*8;
    f.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    f.userData.resolve=50+inc.p*.5; f.userData.max=f.userData.resolve; f.userData.spotted=false; f.userData.wt=0;
    scene.add(f); intruders.push(f);
  }
}
/* ---- ambient NPCs wandering near the colmado ---- */
function updateWanderers(dt){
  if(!world.wanderers) return;
  world.wanderers.forEach(p=>{
    p.userData.angle += p.userData.speed*dt;
    const c=p.userData.center, r=p.userData.radius;
    const nx=c.x+Math.cos(p.userData.angle)*r, nz=c.z+Math.sin(p.userData.angle)*r;
    const dx=nx-p.position.x, dz=nz-p.position.z;
    p.rotation.y=Math.atan2(dx,dz);
    p.position.x=nx; p.position.z=nz;
    if(!stepAnim(p,true)){
      p.userData.wt+=dt*6;
      const sw=Math.sin(p.userData.wt)*.4;
      p.userData.legL.rotation.x=sw; p.userData.legR.rotation.x=-sw;
      p.userData.armL.rotation.x=-sw*.6; p.userData.armR.rotation.x=sw*.6;
    }
  });
}

/* ---- audio ----------------------------------------------------------------
   Everything here is SYNTHESIZED at runtime with the Web Audio API — there is
   not a single audio file in this repo, on purpose, for the same two reasons
   detailMap() paints its textures on a canvas instead of downloading them:

   1. Licensing. Real merengue/bachata/dembow recordings are somebody's
      copyright, and shipping them (or hotlinking them) in an app is
      infringement no matter how short the clip. Rhythm itself is not
      copyrightable, so the loops below play the actual PATTERNS you'd hear
      out of a colmado speaker — merengue's tambora and 2/4 güira, bachata's
      bongo/guira shuffle with a bass tumbao, dembow's boom-ch-boom-chick —
      without reproducing anyone's recording.
   2. It cannot fail to load. No download, no decode, no 5MB of assets, works
      offline and inside the single-file build.

   If you ever want the real thing, the hook is deliberate: drop licensed
   files in and give MUSIC[] entries a `src`, then have startTrack() play a
   decoded buffer instead of calling its pattern function. Don't remove the
   synth path — it's the fallback, same as makePerson() is for the models.

   Two independent buses hang off masterGain:
     musicGain   — the colmado's speaker, fades with distance from it
     engineGain  — the car, only alive while driving
   ------------------------------------------------------------------------- */
let audioCtx=null, audioMuted=false, audioStarted=false;
let masterGain=null, musicGain=null, engineGain=null;
let musicTimer=null, musicTrack=0;

function initAudio(){
  if(audioCtx) return;
  try{
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=audioCtx.createGain(); masterGain.gain.value=1; masterGain.connect(audioCtx.destination);
    musicGain=audioCtx.createGain();  musicGain.gain.value=0;  musicGain.connect(masterGain);
    engineGain=audioCtx.createGain(); engineGain.gain.value=0; engineGain.connect(masterGain);
    musicTrack=Math.floor(Math.random()*MUSIC.length);
    scheduleMusic();
    buildEngineVoice();
    audioStarted=true;
  }catch(e){ /* no audio available — fine, the world just runs silent */ }
}

/* ---- small synth voices, all reused by the pattern functions below ---- */
// short noise burst shaped by a filter: güira, maraca, hi-hat, tyre scrub
function noiseHit(t,dur,freq,q,vol,dest,type){
  if(!audioCtx) return;
  const n=Math.max(1,Math.floor(audioCtx.sampleRate*dur));
  const buf=audioCtx.createBuffer(1,n,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const src=audioCtx.createBufferSource(); src.buffer=buf;
  const f=audioCtx.createBiquadFilter(); f.type=type||'bandpass';
  f.frequency.value=freq; f.Q.value=q;
  const g=audioCtx.createGain();
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t); src.stop(t+dur);
}
// pitched drum: tambora head, bongo, conga, kick
function drumHit(t,f0,f1,dur,vol,dest,type){
  if(!audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type=type||'sine';
  o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur+0.02);
}
// plucked bass / guitar note
function pluck(t,freq,dur,vol,dest,type){
  if(!audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain(), f=audioCtx.createBiquadFilter();
  o.type=type||'triangle'; o.frequency.setValueAtTime(freq,t);
  f.type='lowpass'; f.frequency.setValueAtTime(freq*7,t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200,freq*2),t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t+dur+0.02);
}

/* ---- the three rhythms, as played out of a colmado speaker ----
   Each writes one bar starting at time t and returns the bar length, so
   scheduleMusic() can chain them without knowing anything about the style. */
const NOTE=n=>55*Math.pow(2,n/12);   // n = semitones above A1

function merengue(t,bar){
  // 2/4, fast. Tambora on the beat with the signature pickup, güira
  // straight-eighths on top, bass on 1 and the "and" of 2.
  const b=bar/4, G=musicGain;
  for(let i=0;i<4;i++){
    const k=t+i*b;
    drumHit(k,150,52,0.17,0.85,G);                       // tambora low
    noiseHit(k+b*0.5,0.055,5200,0.7,0.16,G,'highpass');  // güira
    noiseHit(k,0.045,4200,0.7,0.11,G,'highpass');
    if(i%2===1) drumHit(k+b*0.75,320,190,0.09,0.42,G,'triangle');  // tambora rim pickup
  }
  const root=NOTE(3);                                    // C
  [[0,root],[1.5,root*1.5],[2,root],[3.5,root*1.335]].forEach(([i,f])=>
    pluck(t+i*b,f/2,0.20,0.30,G,'sine'));
}
function bachata(t,bar){
  // 4/4 with the lift on beat 4. Bongo/güira shuffle, walking bass, and the
  // arpeggiated requinto figure that makes bachata instantly recognisable.
  const b=bar/4, G=musicGain;
  for(let i=0;i<4;i++){
    const k=t+i*b;
    drumHit(k,110,46,0.15,0.62,G);
    noiseHit(k+b*0.5,0.05,6000,0.8,0.13,G,'highpass');
    if(i===3){ noiseHit(k+b*0.5,0.09,3000,0.6,0.30,G,'bandpass');   // the beat-4 lift
               drumHit(k+b*0.75,420,240,0.08,0.35,G,'triangle'); }
  }
  const root=NOTE(-2);                                   // G
  [0,1,2,3].forEach(i=>pluck(t+i*b,root/2,0.26,0.28,G,'sine'));
  [0,3,5,7,5,3].forEach((semi,i)=>                       // requinto arpeggio
    pluck(t+i*(bar/6),root*4*Math.pow(2,semi/12),0.16,0.11,G,'sawtooth'));
}
function dembow(t,bar){
  // the boom-ch-boom-chick that every colmado plays after dark
  const b=bar/8, G=musicGain;
  [0,3,4,7].forEach(i=>drumHit(t+i*b,120,40,0.16,0.9,G));
  [2,6].forEach(i=>noiseHit(t+i*b,0.10,2400,0.9,0.34,G,'bandpass'));
  for(let i=0;i<8;i++) noiseHit(t+i*b,0.035,7000,0.8,0.07,G,'highpass');
  const root=NOTE(1);
  [0,4].forEach(i=>pluck(t+i*b,root/2,0.22,0.34,G,'square'));
}
const MUSIC=[
  {name:'merengue', bpm:132, beats:4, play:merengue},
  {name:'bachata',  bpm:124, beats:4, play:bachata},
  {name:'dembow',   bpm:96,  beats:4, play:dembow}
];

/* Schedules one bar at a time and re-arms itself. Tracks change every 8 bars
   so standing outside the colmado cycles through the styles rather than
   looping one four-bar phrase forever. */
function scheduleMusic(){
  if(!audioCtx) return;
  let t=audioCtx.currentTime+0.15, bars=0;
  function nextBar(){
    if(!audioCtx||audioCtx.state==='closed') return;
    const tr=MUSIC[musicTrack], bar=60/tr.bpm*tr.beats;
    // only actually synthesize when it would be audible — a muted or far-away
    // speaker shouldn't be building oscillators every bar
    if(!audioMuted&&musicGain.gain.value>0.004) tr.play(t,bar);
    t+=bar;
    if(++bars>=8){ bars=0; musicTrack=(musicTrack+1)%MUSIC.length; }
    musicTimer=setTimeout(nextBar, Math.max(30,(t-audioCtx.currentTime-0.12)*1000));
  }
  nextBar();
}

/* ---- street ambience: a rooster, a distant dog, a motoconcho horn ----
   Fired at random from tick() so the barrio isn't silent between bars. */
let nextAmbient=0;
function streetAmbience(now){
  if(!audioStarted||audioMuted||now<nextAmbient) return;
  nextAmbient=now+9+Math.random()*16;
  if(!musicGain||musicGain.gain.value<0.002) return;   // too far from anything
  const t=audioCtx.currentTime, pick=Math.random();
  const g=audioCtx.createGain(); g.gain.value=0.30; g.connect(musicGain);
  if(pick<0.34){
    // motoconcho: a small two-stroke buzzing past
    const o=audioCtx.createOscillator(), gg=audioCtx.createGain();
    o.type='sawtooth';
    o.frequency.setValueAtTime(60,t); o.frequency.linearRampToValueAtTime(150,t+0.9);
    o.frequency.linearRampToValueAtTime(70,t+2.2);
    gg.gain.setValueAtTime(0.0001,t); gg.gain.linearRampToValueAtTime(0.12,t+0.7);
    gg.gain.linearRampToValueAtTime(0.0001,t+2.3);
    o.connect(gg); gg.connect(g); o.start(t); o.stop(t+2.4);
  } else if(pick<0.67){
    // dog, a few streets over
    for(let i=0;i<2+Math.floor(Math.random()*2);i++)
      drumHit(t+i*0.34,300+Math.random()*90,140,0.16,0.22,g,'sawtooth');
  } else {
    // rooster — they do not wait for morning here
    const k=t;
    pluck(k,520,0.20,0.16,g,'sawtooth');
    pluck(k+0.2,660,0.34,0.14,g,'sawtooth');
    pluck(k+0.5,430,0.42,0.10,g,'sawtooth');
  }
}

/* ---- car engine ----
   Three detuned sawtooths an octave apart through a lowpass, all running
   continuously from the moment audio starts; "revving" is just moving their
   frequency and the filter cutoff. Starting/stopping oscillators per frame
   would click, and Web Audio nodes are one-shot — you cannot restart a stopped
   one — so they idle at zero gain instead. */
let engOsc=[], engFilter=null, engineOn=false;
function buildEngineVoice(){
  if(!audioCtx) return;
  engFilter=audioCtx.createBiquadFilter();
  engFilter.type='lowpass'; engFilter.frequency.value=700; engFilter.Q.value=3;
  engFilter.connect(engineGain);
  [1,2,3.02].forEach((mult,i)=>{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=i===2?'square':'sawtooth';
    o.frequency.value=42*mult;
    g.gain.value=[0.5,0.28,0.12][i];
    o.connect(g); g.connect(engFilter); o.start();
    engOsc.push({osc:o,mult:mult});
  });
}
/* Called every frame while driving. Engine note tracks speed the way a real
   one tracks RPM, and because there are no gears it just climbs — so it's
   deliberately capped, or it turns into a siren at top speed. */
function updateEngineAudio(speed,throttle,braking){
  if(!audioStarted||!engineGain) return;
  const t=audioCtx.currentTime;
  const frac=Math.min(1,speed/CAR_TOP_SPEED);
  const rpm=0.22+frac*0.78+throttle*0.16;            // idle floor + road speed + a little load
  engOsc.forEach(e=>e.osc.frequency.setTargetAtTime(42*e.mult*(0.75+rpm*1.5),t,0.08));
  engFilter.frequency.setTargetAtTime(400+rpm*1900+throttle*600,t,0.09);
  const vol=audioMuted?0:(0.09+throttle*0.10+frac*0.06);
  engineGain.gain.setTargetAtTime(vol,t,0.10);
  // tyre scrub when the brakes are hard on and the car is still rolling
  if(braking&&speed>4&&Math.random()<0.30)
    noiseHit(t,0.13,1500+Math.random()*900,1.2,0.10,masterGain,'bandpass');
}
function startEngineAudio(){
  if(!audioStarted) initAudio();
  if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume();
  engineOn=true;
}
function stopEngineAudio(){
  engineOn=false;
  if(engineGain&&audioCtx) engineGain.gain.setTargetAtTime(0,audioCtx.currentTime,0.18);
}

/* The colmado's speaker gets louder as you approach it — and audibly louder
   from inside the car, since you're closer to the street than the yard. */
function updateAmbientAudio(pos){
  if(!world.colmado||!audioStarted||!musicGain) return;
  const d=Math.hypot(world.colmado.position.x-pos.x, world.colmado.position.z+7-pos.z);
  const target=audioMuted?0:Math.max(0, Math.min(0.5, 1-(d/30)));
  musicGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.4);
  streetAmbience(performance.now()/1000);
}
function toggleMute(){
  if(!audioStarted) initAudio();
  audioMuted=!audioMuted;
  document.getElementById('muteBtn').textContent=audioMuted?'🔇':'🔊';
  if(audioMuted&&engineGain) engineGain.gain.setTargetAtTime(0,audioCtx.currentTime,0.1);
  if(audioCtx&&audioCtx.state==='suspended') audioCtx.resume();
}

function updateIntruders(dt){
  if(!intruders.length) return;
  const spotR=9+S.security.cameras*6.5;
  intruders.forEach(f=>{
    const d=Math.hypot(f.position.x,f.position.z);
    if(!f.userData.spotted&&d<spotR) f.userData.spotted=true;
    if(d>4){
      const a=Math.atan2(-f.position.z,-f.position.x);
      f.position.x+=Math.cos(a)*dt*1.8; f.position.z+=Math.sin(a)*dt*1.8;
      f.rotation.y=-a+Math.PI/2;
      if(!stepAnim(f,true)){
        f.userData.wt+=dt*7;
        const sw=Math.sin(f.userData.wt)*.55;
        f.userData.legL.rotation.x=sw; f.userData.legR.rotation.x=-sw;
        f.userData.armL.rotation.x=-sw*.8; f.userData.armR.rotation.x=sw*.8;
      }
    }
    f.visible=f.userData.spotted||d<13;
  });
  const rb=document.getElementById('raidBar');
  if(rb) rb.textContent='INTRUDERS '+intruders.length+' — tap them';
}
function tapIntruder(nx,ny){
  if(!intruders.length) return false;
  const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
  const hits=ray.intersectObjects(intruders,true);
  if(!hits.length) return false;
  let root=hits[0].object; while(root.parent&&!intruders.includes(root)) root=root.parent;
  if(!intruders.includes(root)||!root.userData.spotted) return false;
  root.userData.resolve-=34;
  if(root.userData.resolve<=0){
    scene.remove(root); intruders=intruders.filter(x=>x!==root); impact('SCATTERED');
    if(!intruders.length) finishRaid();
  } else impact('SPOOKED');
  return true;
}
function finishRaid(){
  if(!S.incident||S.incident.done) return;
  const rec=Math.round(S.incident.p*22);
  S.cash+=rec; S.standing+=2; S.defended++;
  ev(S.incident.nm+' stopped on the property. Recovered 💵'+rec.toLocaleString()+'.','win');
  S.incident.done=true; save();
  const rb=document.getElementById('raidBar'); if(rb) rb.textContent='PROPERTY SECURE';
  setTimeout(()=>{ const e=document.getElementById('raidBar'); if(e) e.style.display='none'; },2400);
}

/* ---- click to move ---- */
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function screenToGround(nx,ny){
  const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
  const hit=new THREE.Vector3();
  return ray.ray.intersectPlane(groundPlane,hit)?hit:null;
}
function objectHit(nx,ny){
  const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
  const targets=[world.car,world.board,world.house,world.garage].filter(Boolean);
  const hits=ray.intersectObjects(targets,true);
  if(!hits.length) return null;
  let o=hits[0].object; while(o.parent&&!targets.includes(o)) o=o.parent;
  if(o===world.car||o===world.garage) return spots()[0];
  if(o===world.house) return spots()[1];
  if(o===world.board) return spots()[2];
  return null;
}
function handleTap(nx,ny){
  // Driving is pedals only — a tap in drive mode does nothing (dragging still
  // orbits the camera). A car that steers itself toward a tapped point can't
  // be parked, and parking is the point of driving one.
  if(controlMode==='drive') return;
  if(intruders.length&&tapIntruder(nx,ny)) return;
  const spot=objectHit(nx,ny);
  if(spot){ moveTarget=spot.p.clone(); pendingSpot=spot; showMarker(spot.p,true); return; }
  const g=screenToGround(nx,ny);
  if(g){ g.x=Math.max(-45,Math.min(45,g.x)); g.z=Math.max(-45,Math.min(45,g.z));
    moveTarget=g.clone(); pendingSpot=null; showMarker(g,false); }
}
function showMarker(p,isSpot){
  marker.position.set(p.x,.06,p.z); marker.visible=true; marker.userData.t=0;
  marker.children[0].material.color.set(isSpot?0xFFE3B0:0x8FAE7A);
}

/* ---- loop ---- */
function resize(){
  const cv=document.getElementById('cv');
  const w=cv.clientWidth,h=cv.clientHeight;
  if(w<=0||h<=0){
    // canvas has no layout box yet (hidden ancestor, mid-transition) — retry
    // shortly rather than setting a NaN aspect ratio that silently renders nothing
    setTimeout(()=>{ if(renderer&&camera) resize(); }, 60);
    return;
  }
  const dpr=Math.min(devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr); renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
/* ---- shared seek-and-turn steering, used by both the walking player and the
   driven car below so neither duplicates the other's movement math ---- */
function seekTarget(pos, target, speed, dt){
  if(!target) return {moving:false};
  const dx=target.x-pos.x, dz=target.z-pos.z, d=Math.hypot(dx,dz);
  if(d<=.55) return {moving:false, arrived:true};
  pos.x+=(dx/d)*speed*dt; pos.z+=(dz/d)*speed*dt;
  return {moving:true, targetYaw:Math.atan2(dx,dz)};
}
function smoothYaw(current, target, rate, dt){
  let dy=target-current;
  while(dy>Math.PI) dy-=Math.PI*2; while(dy<-Math.PI) dy+=Math.PI*2;
  return current+dy*Math.min(1,dt*rate);
}
/* Drives world.car one physics step. Uses the real cannon.js RaycastVehicle
   when it loaded (driveCarCannon()); otherwise falls back to the from-scratch
   CarPhysics port (driveCarFallback()). Both read the same driveInput pedals,
   so the control feel matches either way; only the physics underneath differs. */
function driveCar(dt){
  if(USE_CANNON) driveCarCannon(dt); else driveCarFallback(dt);
}

/* Steers/throttles the cannon.js vehicle built in buildVehicle(). Heading is
   read fresh from the chassis quaternion each frame rather than tracked
   separately — the chassis stays flat (no roll/pitch) by construction, so a
   plain yaw angle via atan2 is exact, not an approximation. */
function driveCarCannon(dt){
  const q=chassisBody.quaternion;
  const fwdX=2*(q.x*q.z+q.y*q.w), fwdZ=1-2*(q.x*q.x+q.y*q.y);
  const yaw=Math.atan2(fwdX,fwdZ);
  let engineForce=0, steerTarget=0, brake=0;

  // Speed-dependent limits. `taper` is what enforces CAR_TOP_SPEED: full force
  // from a standstill, nothing left once you're there.
  const speed=Math.hypot(chassisBody.velocity.x,chassisBody.velocity.z);
  const speedFrac=Math.min(1,speed/CAR_TOP_SPEED);
  const taper=Math.max(0,1-speedFrac*speedFrac);
  const maxSteer=CAR_STEER_LOW+(CAR_STEER_HIGH-CAR_STEER_LOW)*speedFrac;
  // Signed speed along the car's own heading — the sign is what separates
  // "brake pedal should slow me down" from "brake pedal should reverse me",
  // which |velocity| alone can't tell you.
  const fwdSpeed=chassisBody.velocity.x*Math.sin(yaw)+chassisBody.velocity.z*Math.cos(yaw);

  if(driveInput.brake){
    // one pedal, two jobs: brake while rolling forward, reverse once stopped
    if(fwdSpeed>CAR_CREEP_SPEED) brake=CAR_BRAKE_FORCE*driveInput.brake;
    else engineForce=CAR_MAX_ENGINE_FORCE*CAR_REVERSE_FRAC*taper*driveInput.brake;
  } else if(driveInput.gas){
    // forward is a NEGATIVE engine force at the rear wheels in cannon's own
    // convention for this axle/direction setup — verified by simulating it,
    // not guessed; see CLAUDE.md
    engineForce=-CAR_MAX_ENGINE_FORCE*taper*driveInput.gas;
  } else {
    brake=CAR_IDLE_BRAKE;   // idle: coast to a gentle stop, not an instant one
  }
  steerTarget=((driveInput.right?1:0)-(driveInput.left?1:0))*maxSteer;

  // Ramp the wheel toward the target rather than snapping to it; self-centering
  // (no steering input) is faster than turning in, the way a real wheel returns.
  const steerRate=steerTarget?CAR_STEER_RATE:CAR_STEER_RATE*1.6;
  carSteer+=clampAbs(steerTarget-carSteer,steerRate*dt);
  carSteer=clampAbs(carSteer,maxSteer);

  vehicle.applyEngineForce(engineForce,2); vehicle.applyEngineForce(engineForce,3);
  vehicle.setSteeringValue(carSteer,0); vehicle.setSteeringValue(carSteer,1);
  for(let w=0;w<4;w++) vehicle.setBrake(brake,w);

  // NOT world.step(1/60, dt, 5) — cannon.js's own documented "recommended"
  // accumulator form. With dt already clamped near 1/60 in tick(), fixedStep
  // and timeSinceLastCalled land on almost the same value every frame, and
  // World.step()'s internalSteps calculation (Math.floor((time+dt)/fixedStep)
  // - Math.floor(time/fixedStep)) is a floating-point hair away from
  // computing 0 steps far more often than it should — found by simulating:
  // engine force and wheel contact both read correctly every frame, the car
  // just never actually moved. Passing a single argument runs exactly one
  // real step of that size, no accumulator — verified extensively in
  // isolated Node before this was ever wired up; see CLAUDE.md.
  physWorld.step(dt);

  world.car.position.set(chassisBody.position.x,chassisBody.position.y-carRideHeight,chassisBody.position.z);
  world.car.rotation.y=yaw;
}

/* The from-scratch CarPhysics port (js/carphysics.js) — used only when
   cannon.js failed to load. Reads the same driveInput pedals as the cannon
   path above and maps them onto this engine's own throttle / steering-rack
   rate, so the pedals behave the same way whichever physics is running. */
function driveCarFallback(dt){
  const c=carPhys.properties;
  let throttle=0, wheelTurnSpeed=0;
  // this engine tracks its own heading, so forward speed is a direct dot
  const fwdSpeed=carPhys.v[0]*Math.sin(carPhys.rot)+carPhys.v[1]*Math.cos(carPhys.rot);

  if(driveInput.brake){
    // same one-pedal-two-jobs rule as driveCarCannon()
    if(fwdSpeed>CAR_CREEP_SPEED) throttle=-driveInput.brake;
    else throttle=-CAR_REVERSE_FRAC*driveInput.brake;
  } else if(driveInput.gas){
    throttle=driveInput.gas;
  }

  if(driveInput.left||driveInput.right){
    wheelTurnSpeed=((driveInput.right?1:0)-(driveInput.left?1:0))*c.wheelTurnSpeed;
  } else {
    // no steering input: let the wheel self-center like a real steering rack
    wheelTurnSpeed=clampAbs(-carPhys.wheelAngle*8,c.wheelTurnSpeed);
  }

  carPhys.move(dt,{throttle,wheelTurnSpeed});

  const p=tmpVec3.set(carPhys.pos[0],0,carPhys.pos[1]);
  if(resolveCollisions(p,CAR_RADIUS)){
    carPhys.v=[0,0]; carPhys.vrot=0;
  }
  carPhys.pos=[p.x,p.z];
  world.car.position.set(p.x,0,p.z);
  world.car.rotation.y=carPhys.rot;
}
const tmpVec3=new THREE.Vector3();
/* Maps WASD and the arrow keys onto driveInput — read every frame by driveCar()
   above, only ever acted on while controlMode==='drive'. Harmless to update
   while walking; tick() simply never looks at driveInput outside drive mode.

   The keyboard is the desktop convenience, not the primary control scheme —
   the on-screen pedals are (see bindDriveHud()), since this is played on a
   phone where there is no keyboard. Both write the same driveInput fields, so
   whichever is used the physics sees identical input. */
function setDriveKey(key,down){
  switch(key.toLowerCase()){
    case 'w': case 'arrowup': driveInput.gas=down?1:0; break;
    case 's': case 'arrowdown': case ' ': driveInput.brake=down?1:0; break;
    case 'a': case 'arrowleft': driveInput.left=down; break;
    case 'd': case 'arrowright': driveInput.right=down; break;
  }
  syncPedalUI();
}
function clearDriveInput(){
  driveInput.gas=0; driveInput.brake=0; driveInput.left=false; driveInput.right=false;
  carSteer=0; syncPedalUI();
}
/* Mirrors driveInput onto the on-screen pedals' pressed styling, so driving
   with the keyboard lights up the same buttons a finger would — and so a
   pointer lost off the edge of a pedal can't leave it stuck looking held. */
function syncPedalUI(){
  const set=(id,on)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('held',!!on); };
  set('gasPedal',driveInput.gas); set('brakePedal',driveInput.brake);
  set('steerLeft',driveInput.left); set('steerRight',driveInput.right);
}
/* Wires the pedal HUD. Uses pointer events (not click, not touchstart alone)
   because driving needs several controls held AT ONCE — gas plus a steer
   button is the normal case — and pointer events report each finger as its
   own pointerId. Capturing the pointer on press means the release still lands
   on the right control even if the finger slides off it mid-corner, which is
   what otherwise leaves a pedal stuck down. */
function bindDriveHud(){
  const bind=(id,on,off)=>{
    const el=document.getElementById(id); if(!el) return;
    const press=e=>{ e.preventDefault(); e.stopPropagation();
      try{ el.setPointerCapture(e.pointerId); }catch(_){ }
      on(); syncPedalUI(); };
    const release=e=>{ e.preventDefault(); e.stopPropagation();
      try{ el.releasePointerCapture(e.pointerId); }catch(_){ }
      off(); syncPedalUI(); };
    el.addEventListener('pointerdown',press);
    el.addEventListener('pointerup',release);
    el.addEventListener('pointercancel',release);
    // a context menu (iOS long-press, right click) would swallow the pointerup
    el.addEventListener('contextmenu',e=>e.preventDefault());
  };
  bind('gasPedal',   ()=>driveInput.gas=1,      ()=>driveInput.gas=0);
  bind('brakePedal', ()=>driveInput.brake=1,    ()=>driveInput.brake=0);
  bind('steerLeft',  ()=>driveInput.left=true,  ()=>driveInput.left=false);
  bind('steerRight', ()=>driveInput.right=true, ()=>driveInput.right=false);
}
/* Speedometer readout. World units are converted through UNITS_PER_METRE so
   the number means something to a player — raw units/sec is meaningless. */
/* current speed in world units/sec, from whichever physics is driving */
function carSpeedNow(){
  if(USE_CANNON) return chassisBody?Math.hypot(chassisBody.velocity.x,chassisBody.velocity.z):0;
  return carPhys?carPhys.getSpeed():0;
}
function updateSpeedo(){
  const el=document.getElementById('speedo'); if(!el) return;
  el.textContent=Math.round(carSpeedNow()/UNITS_PER_METRE*3.6)+' KM/H';
}

function tick(){
  if(!running) return;
  raf=requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),.05);

  if(controlMode==='drive'){
    driveCar(dt);
    updateSpeedo();
    updateEngineAudio(carSpeedNow(), driveInput.gas, !!driveInput.brake);
  } else {
    let moving=false;
    const seek=seekTarget(player.pos, moveTarget, 7.2, dt);
    if(seek.arrived){ moveTarget=null; marker.visible=false; }
    else if(seek.moving){ moving=true; player.targetYaw=seek.targetYaw; player.walkT+=dt*9.5; }
    player.yaw=smoothYaw(player.yaw, player.targetYaw, 11, dt);

    if(resolveCollisions(player.pos,PLAYER_RADIUS)){ moveTarget=null; marker.visible=false; }

    playerGroup.position.set(player.pos.x,0,player.pos.z);
    playerGroup.rotation.y=player.yaw;
    if(!stepAnim(playerGroup,moving)){
      const ud=playerGroup.userData;
      const sw=Math.sin(player.walkT)*(moving?.72:.05);
      ud.legL.rotation.x=sw; ud.legR.rotation.x=-sw;
      ud.armL.rotation.x=-sw*.85; ud.armR.rotation.x=sw*.85;
      playerGroup.position.y=moving?Math.abs(Math.sin(player.walkT))*.055:0;
    }
  }

  if(marker.visible){
    marker.userData.t=(marker.userData.t||0)+dt;
    const s=1+Math.sin(marker.userData.t*5)*.13;
    marker.scale.set(s,1,s); marker.rotation.y+=dt*1.3;
  }

  // camera follows whichever transform is under control — the car while driving,
  // the player otherwise. camYaw/camPitch (drag-controlled) mean different things
  // depending on cameraMode: in orbit mode they place the camera behind the
  // target; in first-person they ARE the look direction, from the target's eyes.
  const followPos=controlMode==='drive'?world.car.position:player.pos;
  if(cameraMode==='first'){
    const eyeY=followPos.y+(controlMode==='drive'?2.0:2.9);
    camera.position.set(followPos.x,eyeY,followPos.z);
    // remap orbit's pitch range into a look up/down angle — inverted from camPitch's
    // own sense (dragging up decreases camPitch, and should look up, not down)
    const lookPitch=(0.44-camPitch)*1.2;
    const fx=followPos.x+Math.sin(camYaw)*Math.cos(lookPitch)*5;
    const fz=followPos.z+Math.cos(camYaw)*Math.cos(lookPitch)*5;
    const fy=eyeY+Math.sin(lookPitch)*5;
    camera.lookAt(fx,fy,fz);
  } else {
    const tx=followPos.x-Math.sin(camYaw)*camDist*Math.cos(camPitch);
    const tz=followPos.z-Math.cos(camYaw)*camDist*Math.cos(camPitch);
    const ty=2.6+camDist*Math.sin(camPitch);
    camera.position.lerp(new THREE.Vector3(tx,ty,tz), 1-Math.pow(.004,dt));
    camera.lookAt(followPos.x,2.4,followPos.z);
  }

  if(world.dog){
    world.dog.position.x=HOME_X-6+Math.sin(clock.elapsedTime*.5)*3.2;
    world.dog.rotation.y=Math.cos(clock.elapsedTime*.5)>0?0:Math.PI;
  }
  updateAnimated(dt);   // every rigged character, moving or standing
  updateIntruders(dt);
  updateWanderers(dt);
  if(controlMode==='walk') checkInteract();
  updateAmbientAudio(followPos);

  renderer.render(scene,camera);
}

/* ---- input ---- */
function bindControls(){
  const cv=document.getElementById('cv');
  // hard-block page scroll/bounce during any touch interaction with the 3D canvas.
  // Scoped to the canvas itself (not "is #game visible") — #game stays display:block
  // under every sheet/HUD button once the player has entered the world, so guarding
  // on visibility alone swallowed preventDefault (and with it, the browser's
  // synthesized click) for every touch anywhere on screen, including taps on the
  // LOG/STATS/MENU buttons and every row inside an open sheet. On a touchscreen this
  // made logging habits — and everything else — completely unresponsive once in-game.
  ['touchstart','touchmove','touchend'].forEach(evt=>{
    document.addEventListener(evt, e=>{
      if(e.target===cv) e.preventDefault();
    }, {passive:false});
  });
  cv.addEventListener('pointerdown',e=>{ drag.down=true; drag.moved=false; drag.id=e.pointerId; drag.x=e.clientX; drag.y=e.clientY; drag.t=Date.now(); });
  cv.addEventListener('pointermove',e=>{
    if(!drag.down||e.pointerId!==drag.id) return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)>12) drag.moved=true;
    if(drag.moved){ camYaw-=dx*.007; camPitch=Math.max(.06,Math.min(.82,camPitch+dy*.0042)); drag.x=e.clientX; drag.y=e.clientY; }
  });
  const up=e=>{
    if(e.pointerId!==drag.id) return;
    if(drag.down&&!drag.moved&&Date.now()-drag.t<520){
      const r=cv.getBoundingClientRect();
      handleTap(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
    }
    drag.down=false;
  };
  cv.addEventListener('pointerup',up);
  cv.addEventListener('pointercancel',()=>{drag.down=false;});
  window.addEventListener('keydown',e=>{ if(e.key.toLowerCase()==='e') useTarget(); setDriveKey(e.key,true); });
  window.addEventListener('keyup',e=>{ setDriveKey(e.key,false); });
  bindDriveHud();
  // a pedal held when the tab is backgrounded never gets its pointerup/keyup,
  // which would leave the car flooring it on return
  window.addEventListener('blur',clearDriveInput);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) clearDriveInput(); });
  window.addEventListener('resize',()=>{ if(running) resize(); });
  window.addEventListener('orientationchange',()=>{
    // iOS/Android report the new size a beat late — a bare resize() here often
    // grabs stale dimensions, so re-check shortly after the rotation settles.
    setTimeout(()=>{ if(running) resize(); }, 300);
  });
}

/* ---- lifecycle ---- */
function enterWorld(){
  document.getElementById('title').classList.remove('show');
  document.getElementById('boot').style.display='flex';
  initAudio(); // must start from a user gesture (this click) or browsers block audio
  if(!window.THREE){
    showErr('3D engine not found on the page. This file may have been edited or truncated — re-download it fresh.');
    document.getElementById('boot').style.display='none';
    openTitle();
    return;
  }
  // pull the rigged character/vehicle models in before building the world. This
  // always calls back — a failed download just means the primitive fallbacks get
  // used, never a hang on the loading screen.
  const boot=document.getElementById('boot').querySelector('p');
  if(boot&&!ASSETS.tried) boot.textContent='Loading models…';
  loadAssets(()=>{ if(boot) boot.textContent='Loading'; setTimeout(startWorld,50); });
}
let contextLost=false;
function startWorld(){
  try{
    const inc=S.incident; nightMode=!!(inc&&!inc.done);
    const cv=document.getElementById('cv');
    if(!renderer){
      renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
      bindControls();
      // iOS kills the WebGL context when the app backgrounds (a call, another app,
      // even a long lock-screen) and the canvas goes permanently black without this.
      cv.addEventListener('webglcontextlost', e=>{
        e.preventDefault();
        contextLost=true; running=false; if(raf) cancelAnimationFrame(raf);
        document.getElementById('boot').style.display='flex';
        document.getElementById('boot').querySelector('p').textContent='Reconnecting…';
      }, false);
      cv.addEventListener('webglcontextrestored', ()=>{
        contextLost=false;
        try{ buildWorld(); resize(); document.getElementById('boot').style.display='none';
          running=true; tick(); }
        catch(e){ showErr('Could not rebuild the world after the display reconnected: '+e.message); }
      }, false);
    }
    buildWorld();
    clock=new THREE.Clock();
    document.getElementById('boot').style.display='none';
    document.getElementById('game').style.display='block';
    resize(); // must run AFTER #game is visible — a hidden canvas reports 0x0,
              // which makes camera.aspect a NaN and silently renders nothing
    renderVitals();
    const rb=document.getElementById('raidBar');
    rb.style.display=nightMode?'block':'none';
    if(nightMode) spawnIntruders();
    running=true; tick();
  }catch(e){
    showErr('World build failed: '+e.message+(e.stack?'\n'+e.stack.split('\n').slice(0,5).join('\n'):''));
    document.getElementById('boot').style.display='none';
    backToTitle();
  }
}
/* ---- drive mode ---- */
// playerGroup is hidden whenever you wouldn't see it anyway — driving, or
// looking through its own eyes in first-person — centralized so toggling
// either mode never leaves it in a stale visibility state.
function updatePlayerVisibility(){
  playerGroup.visible = controlMode==='walk' && cameraMode!=='first';
}
function enterDriveMode(){
  if(!world.car||controlMode==='drive') return;
  controlMode='drive';
  updatePlayerVisibility();
  moveTarget=null; marker.visible=false;
  clearDriveInput();
  // re-seed whichever physics is driving from the car's current (parked or
  // previously-driven) position and rotation, inverting the fixed model
  // offset so the very first driven frame doesn't snap; velocity/steering
  // reset so a stale drive never carries momentum into a fresh one
  const yaw=world.car.rotation.y;
  if(USE_CANNON){
    chassisBody.position.set(world.car.position.x,world.car.position.y+carRideHeight,world.car.position.z);
    chassisBody.quaternion.setFromEuler(0,yaw,0);
    chassisBody.velocity.set(0,0,0); chassisBody.angularVelocity.set(0,0,0);
    vehicle.setSteeringValue(0,0); vehicle.setSteeringValue(0,1); carSteer=0;
  } else {
    carPhys.pos=[world.car.position.x,world.car.position.z];
    carPhys.rot=yaw;
    carPhys.v=[0,0]; carPhys.vrot=0; carPhys.wheelAngle=0;
  }
  clearDriveInput();
  startEngineAudio();
  document.getElementById('prompt').style.display='none';
  document.getElementById('exitVehicleBtn').style.display='block';
  const dh=document.getElementById('driveHud'); if(dh) dh.style.display='block';
  document.getElementById('game').classList.add('driving');
  const hint=document.getElementById('hint'); if(hint) hint.textContent='GAS + BRAKE TO DRIVE · BRAKE AGAIN TO REVERSE · DRAG TO LOOK';
}
function exitDriveMode(){
  if(controlMode!=='drive') return;
  controlMode='walk';
  // step out beside the car rather than reappearing on top of it
  player.pos.set(world.car.position.x+2.2, 0, world.car.position.z);
  player.yaw=player.targetYaw=world.car.rotation.y;
  updatePlayerVisibility();
  marker.visible=false;
  clearDriveInput();
  stopEngineAudio();
  document.getElementById('exitVehicleBtn').style.display='none';
  const dh=document.getElementById('driveHud'); if(dh) dh.style.display='none';
  document.getElementById('game').classList.remove('driving');
  const hint=document.getElementById('hint'); if(hint) hint.textContent='TAP GROUND TO WALK · TAP THINGS TO USE · DRAG TO LOOK';
}

/* ---- camera mode ---- */
function toggleCameraMode(){
  cameraMode = cameraMode==='orbit' ? 'first' : 'orbit';
  updatePlayerVisibility();
  syncCameraModeUI();
}
// button label + zoom slider (camDist is meaningless in first-person) both
// follow cameraMode — kept in one place so buildWorld() and the toggle can't drift
function syncCameraModeUI(){
  const btn=document.getElementById('camModeBtn');
  if(btn) btn.textContent = cameraMode==='orbit' ? '1ST PERSON' : '3RD PERSON';
  const zoom=document.getElementById('zoomWrap');
  if(zoom) zoom.style.display = cameraMode==='orbit' ? 'flex' : 'none';
}
function setZoom(v){ camDist=parseFloat(v); }

function backToTitle(){
  running=false; if(raf) cancelAnimationFrame(raf);
  document.getElementById('game').style.display='none';
  intruders=[]; world={}; moveTarget=null; pendingSpot=null;
  controlMode='walk'; carPhys=null;
  physWorld=null; vehicle=null; chassisBody=null;
  clearDriveInput();
  stopEngineAudio();   // leaving mid-drive must not carry the engine into the title screen
  if(musicGain&&audioCtx) musicGain.gain.setTargetAtTime(0,audioCtx.currentTime,0.2);
  clearAnimated();
  const evb=document.getElementById('exitVehicleBtn'); if(evb) evb.style.display='none';
  const dhb=document.getElementById('driveHud'); if(dhb) dhb.style.display='none';
  document.getElementById('game').classList.remove('driving');
  if(scene){
    // Dispose on exit or repeated title<->world trips leak GPU memory. Two things
    // to be careful about now that loaded models are in the scene:
    //  - a mesh's .material can be an ARRAY (multi-material models), which has no
    //    .dispose() of its own;
    //  - SkeletonUtils.clone() SHARES geometry with the cached source model, so
    //    disposing it would gut ASSETS and the next ENTER would render nothing.
    //    modelPerson()/modelCar() flag their clones (sharedGeo) for exactly this.
    //    Their materials are per-instance clones, so those still get freed.
    scene.traverse(o=>{
      if(o.geometry&&!(o.userData&&o.userData.sharedGeo)) o.geometry.dispose();
      const m=o.material;
      if(Array.isArray(m)) m.forEach(x=>{ if(x&&x.dispose) x.dispose(); });
      else if(m&&m.dispose) m.dispose();
    });
    scene=null;
  }
  openTitle();
}

