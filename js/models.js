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
function modelCar(paint){
  if(!ASSETS.car) return null;
  const g=ASSETS.car.clone(true);
  g.traverse(o=>{ o.userData.sharedGeo=true; });   // geometry belongs to ASSETS, not this clone
  const box=new THREE.Box3().setFromObject(g);
  const len=Math.max(box.max.x-box.min.x, box.max.z-box.min.z, .001);
  g.scale.setScalar(CAR_LENGTH/len);   // CAR_LENGTH (js/game.js) is the one source of truth for car size
  g.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m&&CAR_BODY_MATS.indexOf(m.name)>=0) m.color.set(paint);
    });
  });
  return g;
}
