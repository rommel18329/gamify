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
  if(ud&&ud.vrmInstance) return stepVRM(ud.vrmInstance,moving);
  if(!ud||!ud.mixer) return false;
  setAnim(g, moving?'walk':'idle');
  return true;
}
/* VRM has no bundled walk/idle clips -- a raw VRoid export ships a rig and
   nothing else, unlike the Quaternius GLBs, which come with named clips
   modelPerson() plays directly. Retargeting THIS world's walk cycle onto an
   arbitrary VRM's humanoid skeleton is real work (mapping bone names,
   handling proportion differences) and is a deliberately separate step, not
   done here -- see "VRM has no walk animation yet" in CLAUDE.md. What IS
   honest to do with only a `moving` boolean and no elapsed-time input: a
   small forward lean, real geometry on real bones (measured against the
   actual humanoid bone names three-vrm exposes, not guessed), so a walking
   VRM character reads as leaning into a walk rather than sliding perfectly
   upright across the ground. Returns true unconditionally -- never falls
   through to tick()'s primitive-limb branch, which reaches for
   userData.legL/legR/armL/armR that only makePerson() ever sets and would
   throw on any VRM character. */
function stepVRM(vrm,moving){
  const h=vrm.humanoid; if(!h) return true;
  const spine=h.getNormalizedBoneNode('spine');
  if(spine) spine.rotation.x=moving?0.12:0;
  return true;
}

const ANIMATED=[];
function updateAnimated(dt){ for(let i=0;i<ANIMATED.length;i++) ANIMATED[i].update(dt); }
function clearAnimated(){ ANIMATED.length=0; }   // called on world teardown

/* ===================== VRM CHARACTERS =====================
   Real VRoid/VRM support, on top of the engine upgrade this needed (see
   "The engine is ES modules now" in CLAUDE.md — modern three.js ships no
   classic-script build, and VRM support needs modern three.js). Everything
   here follows the SAME rule the rest of this file lives by: a missing or
   failed asset costs you the good-looking character, never a broken game.
   modelPerson()||makePerson() stays completely unchanged; VRM sits ABOVE
   that pair as a third, optional, ASYNC upgrade layer — see loadPlayerBody()
   in game.js for how the three actually compose.

   Bundled presets are named files under assets/characters/vrm/. Only one
   ships in the repo (AvatarSample_A, pixiv's own official sample — licensed
   for alteration and distribution, not CC0; see CLAUDE.md for the exact
   terms and why UPLOAD is the recommended path rather than more presets: a
   VRM is ~15MB, roughly 10x every other character asset in this repo
   combined, and that cost is only worth paying for a character that's
   actually yours). */
const VRM_PRESETS={
  avatarA:{ file:'AvatarSample_A.vrm', name:'Avatar Sample A',
            credit:'pixiv VRoid Studio official sample — alteration & distribution permitted, not CC0' }
};

/* Spring bones (hair, ribbons) and look-at both need updating every frame,
   same reasoning as ANIMATED above for AnimationMixers — a VRM instance
   that never gets .update() called just sits in its bind/rest pose forever
   (though unlike a raw mixer-less mesh it won't T-pose, since VRM's rest
   pose is a normal standing pose to begin with). Kept as its own list
   rather than folded into ANIMATED: a THREE.AnimationMixer and a VRM
   instance both expose .update(dt) but are not interchangeable — a VRM's
   update() does springs/look-at/humanoid retargeting, not clip playback. */
const VRM_ANIMATED=[];
function updateVRM(dt){ for(let i=0;i<VRM_ANIMATED.length;i++) VRM_ANIMATED[i].update(dt); }
function clearVRM(){ VRM_ANIMATED.length=0; }

/* Loads one VRM file (a URL or a same-origin blob: URL from an uploaded
   file) and normalises it exactly the way modelPerson() normalises a GLB:
   ~4-units-tall to match the rest of the world, geometry flagged sharedGeo
   so backToTitle()'s material-only disposal doesn't gut it, frustumCulled
   off (VRM's own bounding info is tuned for its native scale, not this
   world's — same reason modelPerson() doesn't rely on it either).

   Genuinely async, unlike modelPerson() — a VRM is a per-character, possibly
   user-uploaded file, not a small pool preloaded once at boot alongside the
   GLBs. Callers must have something already on screen before calling this
   (see loadPlayerBody() in game.js) and swap it in on success; there is no
   synchronous fallback path the way modelPerson()||makePerson() has one,
   because there is nothing to synchronously fall back TO for an arbitrary
   uploaded file. */
function loadVRM(url,onReady,onError){
  if(typeof THREE.GLTFLoader!=='function'||typeof VRMLoaderPlugin==='undefined'){
    onError&&onError(new Error('VRM loader unavailable')); return;
  }
  const loader=new THREE.GLTFLoader();
  loader.register(parser=>new VRMLoaderPlugin(parser));
  loader.load(url, gltf=>{
    const vrm=gltf.userData.vrm;
    if(!vrm){ onError&&onError(new Error('not a VRM file')); return; }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    // VRM 0.x faces -Z; this world's convention (every other character, the
    // car) is +Z. rotateVRM0() is three-vrm's own fix for exactly this — see
    // CLAUDE.md's VRM section for how this was found (rendered the back of
    // the head on the first attempt, measured before assuming a fix).
    if(vrm.meta&&vrm.meta.metaVersion==='0'&&VRMUtils.rotateVRM0) VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse(o=>{ o.frustumCulled=false; o.userData.sharedGeo=true; });
    const box=new THREE.Box3().setFromObject(vrm.scene);
    const h=Math.max(box.max.y-box.min.y,.001);
    vrm.scene.scale.multiplyScalar(4.0/h);
    vrm.scene.userData.vrmInstance=vrm;
    VRM_ANIMATED.push(vrm);
    onReady(vrm);
  }, undefined, e=>onError&&onError(e));
}
/* Removes one VRM instance from the update registry (world teardown, or
   swapping a character out for a different one) — the inverse of the push
   in loadVRM(). Leaving a stale entry in VRM_ANIMATED would keep ticking
   springs/look-at on a character no longer in the scene. */
function unregisterVRM(vrm){
  const i=VRM_ANIMATED.indexOf(vrm);
  if(i>=0) VRM_ANIMATED.splice(i,1);
}

/* ---- storing an uploaded .vrm ----
   A VRM is ~15MB — nowhere near localStorage's realistic quota (5-10MB
   shared with the actual save), and it must never go anywhere near S itself
   (see the comment on S.person.character in data.js: S stays small and
   JSON-serialisable so exportSave()'s textarea and backup flow keep working).
   IndexedDB is the only browser storage built for a blob this size, so the
   uploaded file's bytes live there, entirely separate from S — S only ever
   holds the small marker {type:'custom'} saying ONE exists. */
const VRM_DB_NAME='sprout_vrm', VRM_DB_STORE='files', VRM_DB_KEY='player_custom';
function vrmDBOpen(onReady,onError){
  if(!('indexedDB' in window)){ onError&&onError(new Error('IndexedDB unavailable')); return; }
  const req=indexedDB.open(VRM_DB_NAME,1);
  req.onupgradeneeded=()=>{ req.result.createObjectStore(VRM_DB_STORE); };
  req.onsuccess=()=>onReady(req.result);
  req.onerror=()=>onError&&onError(req.error);
}
function saveCustomVRM(arrayBuffer,onDone,onError){
  vrmDBOpen(db=>{
    const tx=db.transaction(VRM_DB_STORE,'readwrite');
    tx.objectStore(VRM_DB_STORE).put(arrayBuffer,VRM_DB_KEY);
    tx.oncomplete=()=>onDone&&onDone();
    tx.onerror=()=>onError&&onError(tx.error);
  },onError);
}
/* Reads the stored bytes back out, makes a throwaway blob: URL for the
   GLTFLoader to fetch (it only takes a URL, not raw bytes), and revokes that
   URL the moment loading settles either way — nothing about a blob: URL
   needs to outlive this one load. */
function loadCustomVRM(onReady,onError){
  vrmDBOpen(db=>{
    const tx=db.transaction(VRM_DB_STORE,'readonly');
    const req=tx.objectStore(VRM_DB_STORE).get(VRM_DB_KEY);
    req.onsuccess=()=>{
      const buf=req.result;
      if(!buf){ onError&&onError(new Error('no custom VRM stored')); return; }
      const url=URL.createObjectURL(new Blob([buf]));
      loadVRM(url,
        vrm=>{ URL.revokeObjectURL(url); onReady(vrm); },
        e=>{ URL.revokeObjectURL(url); onError&&onError(e); });
    };
    req.onerror=()=>onError&&onError(req.error);
  },onError);
}

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
