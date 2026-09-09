/* ===================== MODEL ASSETS =====================
   Rigged CC0 characters (Quaternius "Ultimate Modular Men", CC0 1.0) plus a
   CC0 car, loaded at runtime. Everything here degrades gracefully: if an
   asset 404s or a loader is missing, loadAssets() still calls back and
   game.js falls back to the hand-built primitive meshes, so a bad deploy
   costs you the good-looking characters — never a black screen. */

const ASSET_BASE='assets/';
const CHAR_MODELS={ hoodie:'characters/Casual_Hoodie.glb', casual:'characters/Casual_2.glb' };

/* Santo Domingo street fits, keyed by each model's own material names.
   One model + a colour swap = a different person, so a couple of downloads
   populate a whole block. Material names differ per model, so unknown keys
   are simply ignored (see modelPerson()). */
const FITS=[
  { model:'hoodie', Purple:0x1D4E9C, White:0xE9E7DA, LightBlue:0xE8C567, Hair:0x14100C, Skin:0x8D5A38 },
  { model:'hoodie', Purple:0x14161B, White:0xD8412F, LightBlue:0xF2F0EA, Hair:0x1A1208, Skin:0x6B4226 },
  { model:'hoodie', Purple:0x3F4A3A, White:0xD8D4C8, LightBlue:0x2B2F36, Hair:0x241A10, Skin:0xC9884F },
  { model:'casual', LightBrown:0xE9E7DA, Red_Dark:0x1D4E9C, White:0xF2F0EA, Hair:0x14100C, Skin:0x8D5A38 },
  { model:'casual', LightBrown:0x2B2F36, Red_Dark:0xE8C567, White:0xD8D4C8, Hair:0x1A1208, Skin:0xA8703E },
  { model:'casual', LightBrown:0xD8412F, Red_Dark:0x14161B, White:0xE9E7DA, Hair:0x241A10, Skin:0x6B4226 }
];
function randomFit(){ return FITS[Math.floor(Math.random()*FITS.length)]; }

/* ---- EL DRIP ---------------------------------------------------------------
   Clothing bought on the DRIP track, applied to the PLAYER. Built on the same
   material-name system FITS uses, so it works on the loaded rigged models
   whose materials are named Purple/White/LightBlue/LightBrown/Red_Dark — and
   dripFallback() below covers makePerson(), because a missing download must
   never cost you an upgrade you paid for.

   Takes a drip RECORD, not S, so a friend's character wears their own clothes
   through this same path. */
const DRIP_COLS={
  shirt:[null,0xE9E7DA,0x0F1418],        // fresh white -> a real fit, near-black
  pants:[null,0x2B3A56],                 // proper indigo
  shoes:[null,0xF2F0EA,0xD8412F],        // clean -> the good ones
  hat:  [null,0x14161B],
  glasses:[null,0x14161B],
  chain:[null,0xC9A227,0xFFD23F]         // gold -> the statement piece
};
/* FITS[0] is the fixed base, deliberately NOT randomFit(): the player's
   character rerolling its outfit on every world entry is wrong on its own
   terms, and it also made a purchased colour impossible to tell apart from a
   fresh roll that happened to land on the same value. NPCs still randomise. */
function dripFit(drip){
  const f=Object.assign({},FITS[0]);
  if(!drip) return f;
  const c=(k)=>DRIP_COLS[k][Math.min((drip[k]||0),DRIP_COLS[k].length-1)];
  // shirt drives whichever key that model uses for its torso
  if(drip.shirt){ const v=c('shirt');
    if(f.Purple!==undefined) f.Purple=v; if(f.LightBrown!==undefined) f.LightBrown=v; }
  if(drip.pants){ const v=c('pants');
    if(f.LightBlue!==undefined) f.LightBlue=v; if(f.Red_Dark!==undefined) f.Red_Dark=v; }
  if(drip.shoes){ f.White=c('shoes'); }
  return f;
}
/* Accessories are geometry, not colour, so they are added to whichever body
   the caller ended up with — loaded model or primitive fallback. Positions are
   in the model's own local space and scaled off its height, since the rigged
   models and makePerson() are not the same size. */
function dripAccessories(group,drip){
  if(!drip||!group) return;
  const box=new THREE.Box3().setFromObject(group);
  const h=Math.max(0.5,box.max.y-box.min.y);
  const headY=h*0.90, fwd=h*0.055;
  if(drip.hat){
    const cap=new THREE.Group();
    const crown=M(new THREE.SphereGeometry(h*0.062,12,10),DRIP_COLS.hat[1],{ink:false});
    crown.scale.set(1,.72,1); cap.add(crown);
    const brim=M(new THREE.BoxGeometry(h*0.13,h*0.012,h*0.075),DRIP_COLS.hat[1],{ink:false});
    brim.position.set(0,-h*0.018,fwd*1.5); cap.add(brim);
    cap.position.set(0,headY+h*0.045,0);
    cap.userData.drip='hat'; group.add(cap);
  }
  if(drip.glasses){
    const gl=M(new THREE.BoxGeometry(h*0.10,h*0.017,h*0.012),DRIP_COLS.glasses[1],{ink:false});
    gl.position.set(0,headY-h*0.005,fwd*1.35);
    gl.userData.drip='glasses'; group.add(gl);
  }
  if(drip.chain){
    const col=DRIP_COLS.chain[Math.min(drip.chain,2)];
    const ch=new THREE.Group();
    for(let i=0;i<9;i++){
      const a=(i/8)*Math.PI-Math.PI/2;
      const link=M(new THREE.SphereGeometry(h*0.011,6,5),col,{ink:false});
      link.position.set(Math.sin(a)*h*0.045,-Math.abs(Math.cos(a))*h*0.022,h*0.028);
      ch.add(link);
    }
    if(drip.chain>=2){   // the statement piece hangs a pendant
      const p=M(new THREE.BoxGeometry(h*0.028,h*0.034,h*0.008),col,{ink:false});
      p.position.set(0,-h*0.048,h*0.030); ch.add(p);
    }
    ch.position.set(0,h*0.775,0);
    ch.userData.drip='chain'; group.add(ch);
  }
}

const ASSETS={ chars:{}, car:null, tried:false };
function assetsReady(){ return Object.keys(ASSETS.chars).length>0; }

/* Loads every asset, then always calls done() — success or failure. */
function loadAssets(done){
  if(ASSETS.tried){ done(); return; }
  ASSETS.tried=true;
  if(typeof THREE==='undefined'||typeof THREE.GLTFLoader!=='function'){ done(); return; }

  const names=Object.keys(CHAR_MODELS);
  let pending=names.length+1;
  const finish=()=>{ if(--pending<=0) done(); };

  const gl=new THREE.GLTFLoader();
  names.forEach(n=>{
    gl.load(ASSET_BASE+CHAR_MODELS[n],
      g=>{ ASSETS.chars[n]={scene:g.scene, animations:g.animations}; finish(); },
      undefined,
      ()=>finish());   // missing character -> primitive fallback, not a crash
  });

  if(typeof THREE.MTLLoader==='function'&&typeof THREE.OBJLoader==='function'){
    const dir=ASSET_BASE+'vehicles/';
    new THREE.MTLLoader().setPath(dir).load('NormalCar1.mtl',
      mats=>{
        mats.preload();
        new THREE.OBJLoader().setMaterials(mats).setPath(dir)
          .load('NormalCar1.obj', o=>{ ASSETS.car=o; finish(); }, undefined, ()=>finish());
      }, undefined, ()=>finish());
  } else finish();
}

/* ---- characters ---- */
/* Clones a loaded rig (SkeletonUtils.clone, not .clone() — a plain clone shares
   the skeleton and every copy would animate identically), recolours it into a
   fit, and wires up its own AnimationMixer. */
function modelPersonDripped(fit,drip){
  const g=modelPerson(fit)||makePerson(
    (fit&&(fit.Purple||fit.LightBrown))||0x2C3242, 0xC9884F, .62, {hair:0x14100C});
  dripAccessories(g,drip);
  return g;
}
function modelPerson(fit){
  fit=fit||randomFit();
  const src=ASSETS.chars[fit.model];
  if(!src||typeof THREE.SkeletonUtils==='undefined') return null;

  const g=THREE.SkeletonUtils.clone(src.scene);
  g.traverse(o=>{ o.userData.sharedGeo=true; });   // geometry belongs to ASSETS, not this clone
  // normalise to the world's ~4-units-per-person scale rather than assuming metres
  const box=new THREE.Box3().setFromObject(g);
  const h=Math.max(box.max.y-box.min.y,.001);
  g.scale.setScalar(4.0/h);

  // per-instance materials, or recolouring one person would repaint everybody
  g.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m&&fit[m.name]!==undefined) m.color.setHex(fit[m.name]);
    });
  });

  const mixer=new THREE.AnimationMixer(g);
  const clip=n=>src.animations.find(a=>a.name.toLowerCase()===n);
  const act=n=>{ const c=clip(n); return c?mixer.clipAction(c):null; };
  const actions={ idle:act('idle')||act('idle_neutral'), walk:act('walk'), run:act('run') };
  if(actions.idle) actions.idle.play();
  g.userData.mixer=mixer;
  g.userData.actions=actions;
  g.userData.anim='idle';
  ANIMATED.push(mixer);
  return g;
}

/* Crossfades to a named clip. No-op if the character is a primitive fallback
   (no mixer) or already playing that clip. */
function setAnim(g,name){
  const ud=g&&g.userData;
  if(!ud||!ud.actions||ud.anim===name) return;
  const next=ud.actions[name]; if(!next) return;
  const cur=ud.actions[ud.anim];
  next.reset().setEffectiveWeight(1).fadeIn(.18).play();
  if(cur&&cur!==next) cur.fadeOut(.18);
  ud.anim=name;
}

/* Picks walk/idle for a character. Returns true if it handled the character,
   false if the caller should fall back to hand-rotating primitive limbs.
   Does NOT advance time — every mixer is ticked once per frame by
   updateAnimated(), including standing characters, because a mixer that never
   updates leaves its model frozen in the bind pose (a T-pose). */
function stepAnim(g,moving){
  const ud=g&&g.userData;
  if(!ud||!ud.mixer) return false;
  setAnim(g, moving?'walk':'idle');
  return true;
}

const ANIMATED=[];
function updateAnimated(dt){ for(let i=0;i<ANIMATED.length;i++) ANIMATED[i].update(dt); }
function clearAnimated(){ ANIMATED.length=0; }   // called on world teardown

/* ---- vehicle ---- */
/* The CC0 car ships colour-only named materials, so the existing paint system
   maps straight onto it: recolour the body material, leave glass/tyres alone. */
const CAR_BODY_MATS=['Blue','Body','Red','White','Grey'];
/* Takes the whole vehicle RECORD, not just a paint string: tint, wheels and
   tier all have to be visible on the loaded model, not only on the primitive
   fallback. They were not — every CARRO purchase rendered nothing whenever the
   OBJ loaded, because carExtras() ran inside makeCar() only. */
const CAR_TINTS=[0x35566B,0x14202A,0x090C10];      // none -> ceramic -> full
const CAR_RIMS =[0x585D55,0x9CA0AC,0xE9E7DA];      // steel -> alloy -> forged
function modelCar(veh){
  if(!ASSETS.car) return null;
  const v=(typeof veh==='string')?{paint:veh,mods:{tires:0,wheels:0,tint:0,tune:0},tier:0}:(veh||{});
  const mods=v.mods||{tires:0,wheels:0,tint:0,tune:0};
  const g=ASSETS.car.clone(true);
  g.traverse(o=>{ o.userData.sharedGeo=true; });   // geometry belongs to ASSETS, not this clone
  const box=new THREE.Box3().setFromObject(g);
  const len=Math.max(box.max.x-box.min.x, box.max.z-box.min.z, .001);
  const s0=CAR_LENGTH/len;                          // CAR_LENGTH is the one source of truth
  /* Tier changes the silhouette. The pack ships one body, so a higher tier is
     expressed as proportions — taller and wider for the SUV/truck tiers,
     lower and tighter for the coupes — rather than pretending a purchase you
     can't see happened. */
  const body=(VEH[v.tier||0]||{}).body||'sedan';
  const prof={sedan:[1,1,1], suv:[1.10,1.20,1.02], truck:[1.12,1.14,1.12], coupe:[1.02,.90,1.0]}[body];
  /* Consecutive tiers can share a body (VEH[0] and VEH[1] are both sedans), so
     body profile alone leaves a purchase invisible. A small per-tier growth
     guarantees every tier looks different and is true to the ladder — the cars
     do get bigger as you climb it. */
  const t=1+(v.tier||0)*0.018;
  g.scale.set(s0*prof[0]*t, s0*prof[1]*t, s0*prof[2]*t);
  g.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m) return;
      if(CAR_BODY_MATS.indexOf(m.name)>=0) m.color.set(v.paint||'#6E7B8B');
      if(m.name==='Windows') m.color.setHex(CAR_TINTS[Math.min(mods.tint||0,2)]);
      if(m.name==='Grey')    m.color.setHex(CAR_RIMS[Math.min(mods.wheels||0,2)]);
      // better tyres read as a deeper, newer black rather than grey rubber
      if(m.name==='Black')   m.color.setHex((mods.tires||0)>=2?0x05070A:0x13161A);
    });
  });
  if(typeof carExtras==='function'){
    const bb=new THREE.Box3().setFromObject(g);
    g.userData.tier=v.tier||0;
    carExtras(g,mods,(bb.max.z-bb.min.z),(bb.max.y-bb.min.y),0);
  }
  return g;
}
