/* ===================== RENDER ENGINE ===================== */
let scene,camera,renderer,clock;
let playerGroup,player,world={},intruders=[],marker=null;
let camYaw=Math.PI,camPitch=0.30,camDist=9.5;
let running=false,nightMode=false,interactTarget=null,raf=null;
let moveTarget=null,pendingSpot=null;
let drag={down:false,moved:false,x:0,y:0,t:0,id:null};

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
function animeMat(color,rimCol,rimPow,lift){
  return new THREE.MeshToonMaterial({ color: liftColor(color, lift), gradientMap: toonGradientMap() });
}
function ink(mesh,t){
  const o=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({color:0x0B0E13,side:THREE.BackSide}));
  o.scale.multiplyScalar(1+(t||0.028)); mesh.add(o); return mesh;
}
function M(geo,color,opts){
  opts=opts||{};
  const mesh=new THREE.Mesh(geo, animeMat(color,opts.rim,opts.rimPow,opts.lift));
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
  const body=M(new THREE.BoxGeometry(len,hgt,2.05),paint,{inkT:.022});
  body.position.y=.86+hgt/2+lo; g.add(body);
  const nose=M(new THREE.SphereGeometry(1.05,18,14),paint,{ink:false});
  nose.scale.set(.30,hgt/2.1,.98); nose.position.set(len/2,.86+hgt/2+lo,0); g.add(nose);
  const tail=nose.clone(); tail.position.x=-len/2; g.add(tail);
  const glass=mods.tint>=1?0x090C10:0x35566B;
  const cabW=isTruck?2.1:len*.52;
  const cab=M(new THREE.SphereGeometry(1,20,14),glass,{inkT:.03,rimPow:1.5,rim:0xBBDDFF});
  cab.scale.set(cabW/2,.46,.92); cab.position.set(isTruck?.4:0,.86+hgt+.30+lo,0); g.add(cab);
  if(isTruck){ const bed=M(new THREE.BoxGeometry(2.3,.5,1.95),paint,{inkT:.026});
    bed.position.set(-1.6,.86+hgt/2+.28+lo,0); g.add(bed); }
  const rimCol=mods.wheels>=2?0xE9E7DA:mods.wheels>=1?0x9CA0AC:0x585D55;
  const wr=mods.wheels>=2?.50:.45;
  [len/2-.95,-(len/2-.95)].forEach(x=>{
    [1.02,-1.02].forEach(z=>{
      const tyre=M(new THREE.TorusGeometry(wr*.78,wr*.30,10,18),0x13161A,{inkT:.05});
      tyre.rotation.y=Math.PI/2; tyre.position.set(x,wr+lo,z); g.add(tyre);
      const rim=M(new THREE.CylinderGeometry(wr*.55,wr*.55,.30,14),rimCol,{inkT:.05});
      rim.rotation.x=Math.PI/2; rim.position.set(x,wr+lo,z); g.add(rim);
    });
  });
  [.66,-.66].forEach(z=>{
    const hl=new THREE.Mesh(new THREE.SphereGeometry(.17,12,10),new THREE.MeshBasicMaterial({color:0xFFF6D0}));
    hl.scale.set(.4,.7,1); hl.position.set(len/2+.06,1.05+lo,z); g.add(hl);
  });
  return g;
}

/* ---- world ---- */
function physiqueLocal(){ const s=workoutStreak(); return s>=60?1:s>=30?.75:s>=10?.48:.22; }

function buildWorld(){
  scene=new THREE.Scene();
  const sky=nightMode?0x0E1524:0x8FC3DE;
  scene.background=new THREE.Color(sky);
  scene.fog=new THREE.Fog(sky,30,86);
  camera=new THREE.PerspectiveCamera(54,1,.1,400);

  const ground=M(new THREE.PlaneGeometry(160,160),nightMode?0x35392E:0xC9B896,{ink:false,lift:.06});
  ground.rotation.x=-Math.PI/2; scene.add(ground);
  const drive=M(new THREE.PlaneGeometry(9,26),0x4E525A,{ink:false,lift:.05});
  drive.rotation.x=-Math.PI/2; drive.position.set(9,.02,6); scene.add(drive);
  const walk=M(new THREE.PlaneGeometry(2.6,12),0x6E727B,{ink:false,lift:.05});
  walk.rotation.x=-Math.PI/2; walk.position.set(0,.02,7); scene.add(walk);

  /* house */
  const house=new THREE.Group();
  const body=M(new THREE.BoxGeometry(15,6,11),nightMode?0x8C8474:0xCFC5AE,{inkT:.014});
  body.position.y=3; house.add(body);
  const roof=M(new THREE.ConeGeometry(11.9,4.3,4),0x6B3F2E,{inkT:.016});
  roof.position.y=8.15; roof.rotation.y=Math.PI/4; house.add(roof);
  const eave=M(new THREE.BoxGeometry(16.4,.32,12.4),0x4C2F22,{inkT:.02});
  eave.position.y=6.05; house.add(eave);
  [-3.4,3.4].forEach(x=>{ const p=limb(.16,.20,3.0,0xE4DCC8,{inkT:.05}); p.position.set(x,1.5,7.4); house.add(p); });
  const porchRoof=M(new THREE.BoxGeometry(8.4,.28,3.4),0x4C2F22,{inkT:.03}); porchRoof.position.set(0,3.1,6.6); house.add(porchRoof);
  const door=M(new THREE.BoxGeometry(2.2,3.7,.26),0x452F20,{inkT:.03}); door.position.set(0,1.85,5.62); house.add(door);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0xC9A227}));
  knob.position.set(.75,1.85,5.78); house.add(knob);
  [[-5,5.62],[5,5.62],[-5,-5.62],[5,-5.62]].forEach(([x,z])=>{
    const fr=M(new THREE.BoxGeometry(2.7,2.3,.18),0xE4DCC8,{inkT:.03}); fr.position.set(x,3.5,z); house.add(fr);
    const gl=new THREE.Mesh(new THREE.BoxGeometry(2.3,1.9,.1),
      new THREE.MeshBasicMaterial({color:nightMode?0xFFD98A:0x4E7C96}));
    gl.position.set(x,3.5,z+(z>0?.06:-.06)); house.add(gl);
  });
  house.position.set(-2,0,-2);
  scene.add(house); world.house=house;

  /* ---- GARAGE (attached, car lives inside) ---- */
  const garage=new THREE.Group();
  const gbody=M(new THREE.BoxGeometry(7,4.4,8),nightMode?0x76705F:0xB8AE96,{inkT:.018});
  gbody.position.y=2.2; garage.add(gbody);
  const groof=M(new THREE.BoxGeometry(7.6,.3,8.6),0x4C2F22,{inkT:.02}); groof.position.y=4.5; garage.add(groof);
  const gdoor=M(new THREE.BoxGeometry(5.6,3.6,.22),0x3A3E46,{inkT:.03}); gdoor.position.set(0,1.9,4.05); garage.add(gdoor);
  for(let i=1;i<5;i++){
    const line=M(new THREE.BoxGeometry(5.6,.05,.02),0x24262C,{ink:false}); line.position.set(0,.5+i*.62,4.16); garage.add(line);
  }
  garage.position.set(9,0,-3.5);
  scene.add(garage); world.garage=garage;

  /* ---- COLMADO (corner store) — down the street ---- */
  const colPos=new THREE.Vector3(-2,0,24);
  const colmado=new THREE.Group();
  const cBody=M(new THREE.BoxGeometry(8,3.6,6), nightMode?0x6B4A5C:0xD4667A, {inkT:.02});
  cBody.position.y=1.8; colmado.add(cBody);
  const cTrim=M(new THREE.BoxGeometry(8.2,.4,6.2), nightMode?0x3A6B5E:0x4FA88C, {inkT:.02});
  cTrim.position.y=3.6; colmado.add(cTrim);
  // awning — striped, angled
  const awning=M(new THREE.BoxGeometry(8.6,.18,2.6), 0xE9E7DA, {inkT:.02});
  awning.position.set(0,3.15,3.9); awning.rotation.x=-0.18; colmado.add(awning);
  for(let i=-4;i<4;i++){
    const stripe=M(new THREE.BoxGeometry(1.0,.02,2.65), i%2===0?0xE63946:0xE9E7DA, {ink:false});
    stripe.position.set(i*1.05+0.5,3.16,3.9); stripe.rotation.x=-0.18; colmado.add(stripe);
  }
  // counter window (open front, typical colmado)
  const win=M(new THREE.BoxGeometry(4.4,1.7,.2), nightMode?0x1A2028:0x2F4858, {inkT:.03});
  win.position.set(0,1.55,3.02); colmado.add(win);
  const counter=M(new THREE.BoxGeometry(4.6,.9,.6), 0xE4DCC8, {inkT:.03});
  counter.position.set(0,.95,3.3); colmado.add(counter);
  // painted sign
  const sign=M(new THREE.BoxGeometry(4.6,1.0,.15), 0xFFD23F, {inkT:.03});
  sign.position.set(0,3.9,2.9); colmado.add(sign);
  // crates of goods out front
  for(let i=0;i<3;i++){
    const crate=M(new THREE.BoxGeometry(.7,.6,.7), i%2?0xE63946:0x4FA88C, {inkT:.03});
    crate.position.set(-3.2+i*.85, .3, 4.6); colmado.add(crate);
  }
  colmado.position.copy(colPos);
  scene.add(colmado); world.colmado=colmado;

  // colmado concrete patio (colorful painted slab, a barrio staple)
  const patio=M(new THREE.CircleGeometry(7,24), nightMode?0x4A4038:0xE0C878, {ink:false,lift:.04});
  patio.rotation.x=-Math.PI/2; patio.position.set(colPos.x,.015,colPos.z+7);
  scene.add(patio);

  /* ---- domino table + seated players ---- */
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
    const p=makePerson(shirt, skin, .5, {tank:shirt, jean:0x232833, bling:false, hair:0x14100C});
    // seated pose: bend legs, lower torso
    p.userData.legL.rotation.x=-1.35; p.userData.legR.rotation.x=-1.35;
    p.userData.armL.rotation.x=-0.5; p.userData.armR.rotation.x=-0.5;
    p.position.set(sx, 0, sz);
    p.rotation.y=seatAngle;
    p.position.y=-.28; // seated height drop, resting on chair seat
    scene.add(p); dominoNPCs.push(p);
  });
  world.dominoNPCs=dominoNPCs;

  /* ---- string lights across the colmado patio ---- */
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

  /* ---- wandering NPC groups (ambient life) ---- */
  const wanderers=[];
  for(let i=0;i<5;i++){
    const skin=[0x8D5524,0xC9884F,0x6B4226,0xA8703E,0x5C3A21][i];
    const shirt=[0xE63946,0x4FA88C,0xFFD23F,0xE9E7DA,0x2F4858][i];
    const p=makePerson(shirt, skin, Math.random()*.4, {tank:shirt, jean:0x232833, bling:false, hair:0x14100C});
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

  /* ---- palm trees along the street ---- */
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

  /* lighting — MeshToonMaterial sums each light's own step-shaded contribution, so
     ambient + sun + fill on an upward-facing surface (ground, driveway, car roofs —
     high N·L against all three at once) used to add past 1.0 and clip solid white.
     Keeping the sum near ~1.0 on a top-lit face keeps toon banding visible everywhere. */
  scene.add(new THREE.AmbientLight(0xffffff, nightMode?.22:.42));
  const sun=new THREE.DirectionalLight(0xffffff, nightMode?.20:.46);
  sun.position.set(-14,22,10); scene.add(sun);
  // fill light so the player character reads clearly from behind (third-person default view)
  const fill=new THREE.DirectionalLight(0xCFE0FF, nightMode?.14:.19);
  fill.position.set(6,10,-14); scene.add(fill);

  /* security props */
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
      c.position.set(-2+Math.cos(a)*7.7,5.5,-2+Math.sin(a)*5.7); c.rotation.y=-a+Math.PI;
      scene.add(c);
    }
  }
  if(sec.lights>0){
    const n=Math.min(4,sec.lights);
    for(let i=0;i<n;i++){
      const L=M(new THREE.SphereGeometry(.32,12,10),0xF0EAD8,{inkT:.05}); L.scale.set(1.4,.8,.8);
      L.position.set(-2+(i%2?7.9:-7.9),5.9,-2+(i<2?5.9:-5.9)); scene.add(L);
      if(nightMode){ const pl=new THREE.PointLight(0xFFE9A8,1.3,24); pl.position.copy(L.position); scene.add(pl); }
    }
  }
  if(sec.alarm>0){ const ab=M(new THREE.BoxGeometry(.7,.9,.3),0xE63946,{inkT:.05}); ab.position.set(.4,4.7,5.72); scene.add(ab); }
  if(sec.doors>0){
    const fh=.9+sec.doors*.35;
    const mk=(x,z)=>{ const p=limb(.07,.09,fh,0x5A4630,{inkT:.07}); p.position.set(x,fh/2,z); scene.add(p); };
    for(let i=-13;i<=13;i+=1.7){ mk(i-2,15.5); mk(i-2,-17.5); }
    for(let i=-15;i<=15;i+=1.7){ mk(-13.5,i-2); mk(13.5,i-2); }
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
    d.position.set(-8,0,6); scene.add(d); world.dog=d;
  }
  if(sec.detail>0){
    const guard=makePerson(0x1A2028,0xC9884F,.62,{hair:0x14100C});
    guard.position.set(4.5,0,9); guard.rotation.y=-.6;
    scene.add(guard); world.guard=guard;
  }

  /* car — lives in the garage */
  world.car=makeCar();
  world.car.position.set(9,0,-3.5); world.car.rotation.y=Math.PI/2;
  scene.add(world.car);

  /* the board */
  const board=new THREE.Group();
  const bp=limb(.09,.11,2.0,0x5A4630,{inkT:.07}); bp.position.y=1.0; board.add(bp);
  const pan=M(new THREE.BoxGeometry(2.4,1.5,.14),0xEFEADC,{inkT:.03}); pan.position.y=2.3; board.add(pan);
  const gr=M(new THREE.BoxGeometry(2.0,1.15,.06),0x5C7A4A,{ink:false}); gr.position.set(0,2.3,.10); board.add(gr);
  board.position.set(-7.5,0,7.5);
  scene.add(board); world.board=board;

  /* foliage */
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
    const s=.75+Math.random()*.9; t.scale.set(s,s,s);
    scene.add(t);
  }

  /* player */
  const per=S.person;
  playerGroup=makePerson(0x7C3AED, per.skin, physiqueLocal(), {tank:0xF3F1E7, jean:0x7C3AED, bling:true, shorts:true});
  // spawn on the walkway (walk plane spans z 1..13), close enough to the house that the
  // default over-the-shoulder camera (camYaw=PI, ~9.5 units behind the player) settles
  // in open street — at the old z=14 spawn it converged to roughly z=23, which sat
  // *inside* the colmado at z=24 and rendered as a wall of its mint-green trim filling the screen.
  playerGroup.position.set(0,0,6);
  scene.add(playerGroup);
  player={pos:playerGroup.position,yaw:Math.PI,walkT:0,targetYaw:Math.PI};

  /* marker */
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

/* ---- interaction spots ---- */
function spots(){
  return [
    {key:'car',nm:'YOUR VEHICLE',hint:'View and upgrade',p:new THREE.Vector3(9,0,-3.5),r:5,act:()=>openGarage()},
    {key:'door',nm:'FRONT DOOR',hint:'Home security',p:new THREE.Vector3(-2,0,5.6),r:3.6,act:()=>openSecurity()},
    {key:'board',nm:'THE BOARD',hint:'Log your day',p:new THREE.Vector3(-7.5,0,7.5),r:3.6,act:()=>openLog()},
    {key:'colmado',nm:'EL COLMADO',hint:'Say what\'s up',p:new THREE.Vector3(-2,0,24),r:6,act:()=>colmadoGreet()}
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
    const f=makePerson(0x161A21,0x8D5524,.4,{hair:0x0E0C0A});
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
    p.userData.wt+=dt*6;
    const sw=Math.sin(p.userData.wt)*.4;
    p.userData.legL.rotation.x=sw; p.userData.legR.rotation.x=-sw;
    p.userData.armL.rotation.x=-sw*.6; p.userData.armR.rotation.x=sw*.6;
  });
}

/* ---- ambient audio: procedural, generic beat — not copyrighted material,
   just a low rhythmic loop that fades in near the colmado ---- */
let audioCtx=null, audioMuted=false, audioStarted=false, ambientGain=null;
function initAudio(){
  if(audioCtx) return;
  try{
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    ambientGain=audioCtx.createGain(); ambientGain.gain.value=0;
    ambientGain.connect(audioCtx.destination);
    scheduleBeatLoop();
    audioStarted=true;
  }catch(e){ /* audio not available — fine, silent world */ }
}
function scheduleBeatLoop(){
  if(!audioCtx) return;
  const bpm=96, beatLen=60/bpm;
  let t=audioCtx.currentTime+0.1;
  function bar(){
    for(let i=0;i<4;i++){
      const kt=t+i*beatLen;
      // kick
      const osc=audioCtx.createOscillator(), g=audioCtx.createGain();
      osc.type='sine'; osc.frequency.setValueAtTime(120,kt); osc.frequency.exponentialRampToValueAtTime(38,kt+0.14);
      g.gain.setValueAtTime(0.9,kt); g.gain.exponentialRampToValueAtTime(0.001,kt+0.16);
      osc.connect(g); g.connect(ambientGain); osc.start(kt); osc.stop(kt+0.18);
      // off-beat conga-ish tick
      if(i%2===1){
        const t2=kt+beatLen*0.5;
        const osc2=audioCtx.createOscillator(), g2=audioCtx.createGain();
        osc2.type='triangle'; osc2.frequency.setValueAtTime(320,t2);
        g2.gain.setValueAtTime(0.35,t2); g2.gain.exponentialRampToValueAtTime(0.001,t2+0.09);
        osc2.connect(g2); g2.connect(ambientGain); osc2.start(t2); osc2.stop(t2+0.1);
      }
    }
    t+=beatLen*4;
    if(audioCtx.state!=='closed') setTimeout(bar, beatLen*4*1000*0.9);
  }
  bar();
}
function updateAmbientAudio(){
  if(!world.colmado||!audioStarted||!ambientGain) return;
  const d=Math.hypot(world.colmado.position.x-player.pos.x, world.colmado.position.z+7-player.pos.z);
  const target=audioMuted?0:Math.max(0, Math.min(0.5, 1-(d/26)));
  ambientGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.4);
}
function toggleMute(){
  if(!audioStarted) initAudio();
  audioMuted=!audioMuted;
  document.getElementById('muteBtn').textContent=audioMuted?'🔇':'🔊';
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
      f.rotation.y=-a+Math.PI/2; f.userData.wt+=dt*7;
      const sw=Math.sin(f.userData.wt)*.55;
      f.userData.legL.rotation.x=sw; f.userData.legR.rotation.x=-sw;
      f.userData.armL.rotation.x=-sw*.8; f.userData.armR.rotation.x=sw*.8;
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
function tick(){
  if(!running) return;
  raf=requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),.05);
  let moving=false;

  if(moveTarget){
    const dx=moveTarget.x-player.pos.x, dz=moveTarget.z-player.pos.z, d=Math.hypot(dx,dz);
    if(d>.55){
      moving=true; const sp=7.2;
      player.pos.x+=(dx/d)*sp*dt; player.pos.z+=(dz/d)*sp*dt;
      player.targetYaw=Math.atan2(dx,dz); player.walkT+=dt*9.5;
    } else { moveTarget=null; marker.visible=false; }
  }
  let dy=player.targetYaw-player.yaw;
  while(dy>Math.PI) dy-=Math.PI*2; while(dy<-Math.PI) dy+=Math.PI*2;
  player.yaw+=dy*Math.min(1,dt*11);

  if(Math.abs(player.pos.x+2)<8.1&&Math.abs(player.pos.z+2)<6.1){
    const px=player.pos.x+2, pz=player.pos.z+2;
    if(Math.abs(px)/8.1>Math.abs(pz)/6.1) player.pos.x=(px>0?8.1:-8.1)-2;
    else player.pos.z=(pz>0?6.1:-6.1)-2;
    moveTarget=null; marker.visible=false;
  }

  playerGroup.position.set(player.pos.x,0,player.pos.z);
  playerGroup.rotation.y=player.yaw;
  const ud=playerGroup.userData;
  const sw=Math.sin(player.walkT)*(moving?.72:.05);
  ud.legL.rotation.x=sw; ud.legR.rotation.x=-sw;
  ud.armL.rotation.x=-sw*.85; ud.armR.rotation.x=sw*.85;
  playerGroup.position.y=moving?Math.abs(Math.sin(player.walkT))*.055:0;

  if(marker.visible){
    marker.userData.t=(marker.userData.t||0)+dt;
    const s=1+Math.sin(marker.userData.t*5)*.13;
    marker.scale.set(s,1,s); marker.rotation.y+=dt*1.3;
  }

  const tx=player.pos.x-Math.sin(camYaw)*camDist*Math.cos(camPitch);
  const tz=player.pos.z-Math.cos(camYaw)*camDist*Math.cos(camPitch);
  const ty=2.6+camDist*Math.sin(camPitch);
  camera.position.lerp(new THREE.Vector3(tx,ty,tz), 1-Math.pow(.004,dt));
  camera.lookAt(player.pos.x,2.4,player.pos.z);

  if(world.dog){
    world.dog.position.x=-8+Math.sin(clock.elapsedTime*.5)*3.2;
    world.dog.rotation.y=Math.cos(clock.elapsedTime*.5)>0?0:Math.PI;
  }
  updateIntruders(dt);
  updateWanderers(dt);
  checkInteract();
  updateAmbientAudio();

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
  window.addEventListener('keydown',e=>{ if(e.key.toLowerCase()==='e') useTarget(); });
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
  setTimeout(startWorld,50);
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
function backToTitle(){
  running=false; if(raf) cancelAnimationFrame(raf);
  document.getElementById('game').style.display='none';
  intruders=[]; world={}; moveTarget=null; pendingSpot=null;
  if(scene){
    // every material here is a fresh instance from M()/inline THREE.Mesh calls (never
    // shared, except the module-level TOON_GRADIENT texture, which stays alive on
    // purpose) — dispose them on exit or repeated title<->world trips leak GPU memory.
    scene.traverse(o=>{
      if(o.geometry) o.geometry.dispose();
      if(o.material) o.material.dispose();
    });
    scene=null;
  }
  openTitle();
}

