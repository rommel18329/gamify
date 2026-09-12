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

  /* No car model is downloaded any more. The car is the Civic EK hatchback
     built by makeCar() in game.js, which is procedural like everything else in
     this world -- so modelCar() simply finds no ASSETS.car and the
     modelCar()||makeCar() call site falls through to it. modelCar() itself is
     kept intact and working: drop a vehicle .obj back into loadAssets() and it
     takes over again with no other change. */
  finish();
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
/* Picks walk/idle for a VRM character. A raw VRoid export ships a rig and
   NOTHING else -- no clips at all, unlike the Quaternius GLBs modelPerson()
   plays directly -- so the clips come from the Quaternius rig via
   makeVRMRetargeter() below. If retargeting is unavailable (models.js's own
   GLBs failed to download, so there is no source rig to borrow a walk from),
   this degrades to a forward lean on the measured `spine` bone rather than
   nothing: the same "a missing asset costs you the good version, never a
   broken game" rule the rest of this file lives by.

   Returns true unconditionally -- never falls through to tick()'s
   primitive-limb branch, which reaches for userData.legL/legR/armL/armR that
   only makePerson() ever sets and would throw on any VRM character. */
function stepVRM(vrm,moving){
  const h=vrm.humanoid; if(!h) return true;
  const rt=vrm.userData&&vrm.userData.retarget;
  if(rt){ rt.setAnim(moving?'walk':'idle'); return true; }
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
function updateVRM(dt){
  for(let i=0;i<VRM_ANIMATED.length;i++){
    const v=VRM_ANIMATED[i];
    // retarget FIRST -- it writes the normalized humanoid bones that
    // vrm.update() then copies onto the real skinned skeleton.
    const rt=v.userData&&v.userData.retarget;
    if(rt) rt.update(dt);
    v.update(dt);
  }
}
function clearVRM(){ VRM_ANIMATED.length=0; }

/* ---- BORROWING A WALK CYCLE FOR A VRM -------------------------------------
   A VRoid export has a skeleton and no animation whatsoever. The Quaternius
   GLBs already in assets/ ship 24 clips on a full humanoid rig. This maps one
   onto the other, so a VRM character walks with the same animation every other
   character in the world uses -- no new asset, no authoring.

   HOW: an invisible Quaternius rig (the "puppet") is driven by an ordinary
   THREE.AnimationMixer playing the real clip, and its pose is copied onto the
   VRM's humanoid bones every frame. Copying a POSE rather than converting the
   clip means all 24 clips work for free and the existing animation code is
   reused verbatim.

   Three things were measured before this worked, each of which produced a
   character that silently stayed in its T-pose:

   1. THE TWO RIGS REST IN DIFFERENT POSES. Measured: Quaternius rests with
      its arms hanging down (156 degrees off vertical), VRoid rests in a true
      T-pose (92 degrees). Plain delta retargeting -- take the source's
      rotation relative to its own rest, apply it to the target -- PRESERVES
      THE TARGET'S REST POSE by construction, so the VRM stayed T-posed with a
      small walk swing added on top. The fix is the per-bone `align` below:
      swing each target bone's rest direction onto the source bone's rest
      direction first, so the target adopts the source's pose rather than
      decorating its own.
   2. BONE DIRECTION CANNOT COME FROM "the first child that isBone". three-vrm
      builds its normalized rig out of plain Object3D nodes, NOT THREE.Bone,
      so that test found nothing on the target side and every alignment
      quietly fell back to identity. VRM_BONE_CHILD names the chain
      explicitly so both rigs answer the same question the same way.
   3. BOTH RIGS MUST BE IN ONE COORDINATE FRAME. Comparing a source rotation
      in world space against a target rotation relative to vrm.scene puts the
      alignment 180 degrees out (vrm.scene carries rotateVRM0's half turn).
      The puppet is therefore pinned to the VRM's own world transform every
      frame -- which also means the retarget never has to care which way the
      character is facing, since both rigs turn together.

   Verified by measurement, not by eye: the VRM's shoulder-to-hand angle
   tracks the puppet's to within a fraction of a degree, and the left foot
   swings through a 1.77-unit stride across the cycle. */
const VRM_BONE_MAP=[['Hips','hips'],['Abdomen','spine'],['Torso','chest'],
  ['Chest','upperChest'],['Neck','neck'],['Head','head']].concat(
  ['L','R'].map(S=>{ const s=S==='L'?'left':'right'; return [
    ['Shoulder'+S,s+'Shoulder'],['UpperArm'+S,s+'UpperArm'],
    ['LowerArm'+S,s+'LowerArm'],['Wrist'+S,s+'Hand'],
    ['Thumb1'+S,s+'ThumbMetacarpal'],['Thumb2'+S,s+'ThumbProximal'],
    ['Thumb3'+S,s+'ThumbDistal'],
    ['Index1'+S,s+'IndexProximal'],['Index2'+S,s+'IndexIntermediate'],
    ['Index3'+S,s+'IndexDistal'],
    ['Middle1'+S,s+'MiddleProximal'],['Middle2'+S,s+'MiddleIntermediate'],
    ['Middle3'+S,s+'MiddleDistal'],
    ['Ring1'+S,s+'RingProximal'],['Ring2'+S,s+'RingIntermediate'],
    ['Ring3'+S,s+'RingDistal'],
    ['Pinky1'+S,s+'LittleProximal'],['Pinky2'+S,s+'LittleIntermediate'],
    ['Pinky3'+S,s+'LittleDistal'],
    ['UpperLeg'+S,s+'UpperLeg'],['LowerLeg'+S,s+'LowerLeg'],
    ['Foot'+S,s+'Foot'],['PT'+S,s+'Toes']
  ];}).reduce(function(a,b){return a.concat(b);},[]));

/* Which humanoid bone continues the chain below each one -- see note 2 above
   for why this is spelled out instead of walked from the scene graph. */
const VRM_BONE_CHILD=(function(){
  const c={hips:'spine',spine:'chest',chest:'upperChest',upperChest:'neck',neck:'head'};
  ['L','R'].forEach(function(S){ const s=S==='L'?'left':'right';
    c[s+'Shoulder']=s+'UpperArm'; c[s+'UpperArm']=s+'LowerArm';
    c[s+'LowerArm']=s+'Hand';     c[s+'Hand']=s+'MiddleProximal';
    c[s+'UpperLeg']=s+'LowerLeg'; c[s+'LowerLeg']=s+'Foot'; c[s+'Foot']=s+'Toes';
    c[s+'ThumbMetacarpal']=s+'ThumbProximal'; c[s+'ThumbProximal']=s+'ThumbDistal';
    c[s+'IndexProximal']=s+'IndexIntermediate'; c[s+'IndexIntermediate']=s+'IndexDistal';
    c[s+'MiddleProximal']=s+'MiddleIntermediate'; c[s+'MiddleIntermediate']=s+'MiddleDistal';
    c[s+'RingProximal']=s+'RingIntermediate'; c[s+'RingIntermediate']=s+'RingDistal';
    c[s+'LittleProximal']=s+'LittleIntermediate'; c[s+'LittleIntermediate']=s+'LittleDistal';
  });
  return c;
})();
const VRM_SRC_OF=(function(){ const m={};
  VRM_BONE_MAP.forEach(function(p){ m[p[1]]=p[0]; }); return m; })();

/* Builds the puppet + pose-copier for one VRM. Returns null when there is no
   source rig to borrow from (the GLBs failed to load), and stepVRM() falls
   back to its lean -- never an exception, never a frozen character. */
function makeVRMRetargeter(vrm){
  if(typeof THREE==='undefined'||!THREE.SkeletonUtils||!vrm||!vrm.humanoid) return null;
  const srcName=Object.keys(ASSETS.chars)[0];
  const src=srcName&&ASSETS.chars[srcName];
  if(!src||!src.animations||!src.animations.length) return null;

  const puppet=THREE.SkeletonUtils.clone(src.scene);
  // The meshes are dead weight here -- only the bones are ever read. Dropping
  // them skips a full skinning pass per frame per VRM character.
  const junk=[]; puppet.traverse(function(o){ if(o.isMesh||o.isSkinnedMesh) junk.push(o); });
  junk.forEach(function(o){ if(o.parent) o.parent.remove(o); });

  const sB={}; puppet.traverse(function(o){ if(o.isBone) sB[o.name]=o; });

  const sync=function(){
    vrm.scene.getWorldPosition(puppet.position);
    vrm.scene.getWorldQuaternion(puppet.quaternion);
    puppet.updateMatrixWorld(true);
  };
  vrm.scene.updateMatrixWorld(true);
  sync();

  const wq=function(o){ return o.getWorldQuaternion(new THREE.Quaternion()); };
  const wp=function(o){ return o.getWorldPosition(new THREE.Vector3()); };
  const dirOf=function(a,b){ if(!a||!b) return null;
    const d=wp(b).sub(wp(a)); return d.lengthSq()<1e-10?null:d.normalize(); };

  const C={}, tgt={};
  VRM_BONE_MAP.forEach(function(pair){
    const sb=sB[pair[0]], tb=vrm.humanoid.getNormalizedBoneNode(pair[1]);
    if(!sb||!tb) return;
    tgt[pair[1]]=tb;
    const ct=VRM_BONE_CHILD[pair[1]], cs=ct?VRM_SRC_OF[ct]:null;
    const sd=dirOf(sb, cs?sB[cs]:null);
    const td=dirOf(tb, ct?vrm.humanoid.getNormalizedBoneNode(ct):null);
    const align=new THREE.Quaternion();
    // hips carries the spine AND both legs, so a single "chain child" is
    // meaningless for it; both rigs stand upright so it needs no alignment.
    if(sd&&td&&pair[1]!=='hips') align.setFromUnitVectors(td,sd);
    // C = S_rest^-1 * align * T_rest, so T = S * C lands the target bone
    // pointing where the source bone points. The multiply ORDER is the whole
    // trick: premultiplying gives a conjugation instead, which leaves the
    // target sitting in its own rest pose (measured: arms at 104 degrees,
    // still essentially the T-pose).
    C[pair[1]]=wq(sb).invert().multiply(align).multiply(wq(tb));
  });

  const mixer=new THREE.AnimationMixer(puppet);
  const clip=function(n){ return src.animations.find(function(a){
    return a.name.toLowerCase()===n; }); };
  const act=function(n){ const c=clip(n); return c?mixer.clipAction(c):null; };
  const actions={ idle:act('idle')||act('idle_neutral'), walk:act('walk'), run:act('run') };
  if(actions.idle) actions.idle.play();
  let current='idle';

  const Wt=new THREE.Quaternion(), pQ=new THREE.Quaternion();
  return {
    setAnim:function(name){
      if(current===name) return;
      const next=actions[name]; if(!next) return;
      const cur=actions[current];
      next.reset().setEffectiveWeight(1).fadeIn(.18).play();
      if(cur&&cur!==next) cur.fadeOut(.18);
      current=name;
    },
    /* Must run BEFORE vrm.update(dt): this writes the normalized humanoid
       bones, and vrm.update() is what copies the normalized rig onto the
       actual skinned skeleton. Reverse the order and the mesh renders one
       frame stale -- and on the very first frame, in its bind pose. */
    update:function(dt){
      mixer.update(dt);
      sync();
      VRM_BONE_MAP.forEach(function(pair){
        const sb=sB[pair[0]], tb=tgt[pair[1]], c=C[pair[1]];
        if(!sb||!tb||!c) return;
        sb.getWorldQuaternion(Wt).multiply(c);
        if(tb.parent){
          tb.parent.updateWorldMatrix(true,false);
          tb.parent.getWorldQuaternion(pQ);
          tb.quaternion.copy(pQ.invert().multiply(Wt));
        } else tb.quaternion.copy(Wt);
      });
    }
  };
}

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
    vrm.userData=vrm.userData||{};
    vrm.userData.retarget=makeVRMRetargeter(vrm);
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

/* ---- THE WARDROBE ---------------------------------------------------------
   VRoid names every material by the role it plays -- `..._SKIN`, `..._CLOTH`,
   `..._HAIR`, `..._FACE`, `..._EYE`, and the CLOTH ones additionally say
   Tops / Bottoms / Shoes. That is VRoid's own export convention, not a guess
   made here, which is what lets this work on any .vrm the player exports
   rather than only on the one file in this repo. Confirmed against the
   bundled sample before any of this was written: its Body mesh really does
   carry Tops, Bottoms and Shoes as separate primitives, and hair is its own
   mesh entirely.

   Two operations, and they are very different in cost:

   - SHOW/HIDE a slot is free and works on a single file. Enough on its own
     for "take the jacket off".
   - WEAR a garment from a DIFFERENT .vrm is the actual wardrobe, and needs
     the garment rebound onto this character's skeleton (vrmWear below).

   What this deliberately does NOT do is change a garment's SHAPE. A VRoid
   export bakes the cut of the clothes into the mesh, so an oversized tee and
   a fitted one are two different exports -- there is no slider. Different
   silhouettes come from more exports, not from code. */
const VRM_SLOTS=['hair','top','bottom','shoes'];

function vrmSlotOf(materialName){
  const n=String(materialName||'');
  if(/Tops/i.test(n))    return 'top';
  if(/Bottoms/i.test(n)) return 'bottom';
  if(/Shoes/i.test(n))   return 'shoes';
  if(/_HAIR/i.test(n))   return 'hair';
  if(/_SKIN/i.test(n))   return 'body';
  return null;   // face, eyes, eyelashes, brows -- never swappable
}

/* Every mesh of this character, bucketed by slot. 'body' is included (it is
   what a hidden garment exposes) but is not in VRM_SLOTS: you cannot take it
   off. */
function vrmParts(vrm){
  const out={};
  if(!vrm||!vrm.scene) return out;
  vrm.scene.traverse(function(o){
    if(!o.isMesh&&!o.isSkinnedMesh) return;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    const slot=vrmSlotOf(mats[0]&&mats[0].name);
    if(slot){ (out[slot]=out[slot]||[]).push(o); }
  });
  return out;
}

function vrmSkeleton(vrm){
  let sk=null;
  if(vrm&&vrm.scene) vrm.scene.traverse(function(o){
    if(!sk&&o.isSkinnedMesh&&o.skeleton) sk=o.skeleton; });
  return sk;
}

function vrmSetSlot(vrm,slot,visible){
  const parts=vrmParts(vrm)[slot]||[];
  parts.forEach(function(m){ m.visible=!!visible; });
  return parts.length;
}

/* Tints a slot. NOTE THE LIMIT, measured on the bundled sample: every VRoid
   material is texture-driven with a neutral white colour factor, so the
   garment's colour lives in the painted image. A tint therefore MULTIPLIES --
   it can darken and shift hue but it cannot brighten. Dark hair goes black or
   deep blue; it does not go platinum. Same rule as detailMap()'s "textures are
   multiply maps only" in game.js, arriving from the other direction. */
function vrmTint(vrm,slot,hex){
  (vrmParts(vrm)[slot]||[]).forEach(function(m){
    (Array.isArray(m.material)?m.material:[m.material]).forEach(function(mat){
      if(mat&&mat.color) mat.color.setHex(hex);
    });
  });
}

/* Wears a garment taken from ANOTHER .vrm. The donor mesh's skinIndex values
   are indices into the DONOR's bone array and mean nothing against this
   character's skeleton, so they are remapped BY BONE NAME. Trusting the two
   arrays to happen to share an order would work for two exports of the same
   base body and fail silently on any other pair -- the kind of bug that shows
   up as one sleeve turned inside out rather than as an error. Measured on a
   real pair: 103 of 103 bones remapped, zero unmatched, and a vertex high on
   the garment moves with the body once the character walks.

   Returns the new mesh, or null if the donor has nothing in that slot. */
function vrmWear(hostVrm,donorVrm,slot){
  const donorMesh=(vrmParts(donorVrm)[slot]||[])[0];
  const skel=vrmSkeleton(hostVrm);
  if(!donorMesh||!donorMesh.skeleton||!skel) return null;

  const idxByName={};
  skel.bones.forEach(function(b,i){ idxByName[b.name]=i; });
  const remap=donorMesh.skeleton.bones.map(function(b){ return idxByName[b.name]; });

  const geo=donorMesh.geometry.clone();
  const si=geo.attributes.skinIndex;
  const arr=si.array.slice();
  for(let i=0;i<arr.length;i++){
    const m=remap[arr[i]];
    arr[i]=(m===undefined?0:m);   // an unmatched bone falls back to the root
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(arr, si.itemSize));

  const mat=Array.isArray(donorMesh.material)
    ? donorMesh.material.map(function(m){ return m.clone(); })
    : donorMesh.material.clone();
  const worn=new THREE.SkinnedMesh(geo,mat);
  worn.frustumCulled=false;            // same reason as loadVRM(): this
  worn.userData.sharedGeo=false;       // geometry is a per-character clone
  worn.userData.vrmSlot=slot;
  worn.bind(skel,new THREE.Matrix4());

  vrmSetSlot(hostVrm,slot,false);      // take off what is already there
  const anchorMesh=(vrmParts(hostVrm).body||[])[0];
  (anchorMesh?anchorMesh.parent:hostVrm.scene).add(worn);
  (hostVrm.userData.worn=hostVrm.userData.worn||{})[slot]=worn;
  return worn;
}

/* Applies a saved fit record to a freshly-loaded character. The record is
   small and plain -- {hide:{top:1}, tint:{hair:1644825}} -- because it lives
   in S, which has to stay JSON-serialisable (see data.js). Nothing here
   throws on a slot the model does not have: a fit saved against one .vrm is
   applied to a different one all the time (the player swaps characters), and
   a missing slot is simply skipped. */
function applyVRMFit(vrm,fit){
  if(!vrm||!fit) return;
  const hide=fit.hide||{}, tint=fit.tint||{};
  VRM_SLOTS.forEach(function(slot){
    vrmSetSlot(vrm,slot,!hide[slot]);
    if(tint[slot]!==undefined&&tint[slot]!==null) vrmTint(vrm,slot,tint[slot]);
  });
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
