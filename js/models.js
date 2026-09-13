/* Recolours whatever is in a slot, without swapping any geometry. Works for
   the cut slots (top/bottom/hair) and for the two that are never swapped —
   `skin`, which lives on whichever body parts are currently worn, and
   `shoes`, which is whatever is not skin inside the feet.

   `hex` of null/undefined means "as it was", restored from the material's own
   recorded baseHex rather than guessed. */
const TINT_SLOTS=['skin','hair','top','bottom','shoes'];
function tintSlot(host,slot,hex){
  if(!host) return false;
  let targets=[];
  if(slot==='skin'){
    host.traverse(o=>{ if(o.isMesh&&o.material&&/^(Skin|Skin_Darker)$/.test(o.material.name||''))
      targets.push(o); });
  } else {
    targets=slotMeshes(host,slot);
  }
  if(!targets.length) return false;
  // on a cut slot only the garment material takes the colour, not the skin it carries
  const partId=host.userData.worn&&host.userData.worn[slot];
  const def=partId?GARMENT_PARTS[partId]:null;
  let touched=false;
  targets.forEach(t=>t.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m||!m.name) return;
      if(slot==='top'||slot==='bottom'){ if(def&&m.name!==def.mat) return;
        if(!def&&CLOTH_MAT_SKIP.test(m.name)) return; }
      if(slot==='hair'&&/^(Skin|Skin_Darker|Eye|Eyebrows)$/.test(m.name)) return;
      if(m.userData.baseHex===undefined) m.userData.baseHex=m.color.getHex();
      /* A fade is two VALUES of one colour, not two colours. The faded sides
         are the picked colour darkened, so picking a hair colour moves both
         pieces together and the player never has to choose twice. */
      /* A faded cap carries its colour in a vertex ramp between hair and
         skin, so it is REBUILT rather than assigned — setting a flat colour
         on it would throw the gradient away. */
      if(o.userData&&o.userData.hairCap){
        const want=(hex===undefined||hex===null)?(o.userData.hairHex||0x1A1410):hex;
        recolorCap(o,want,o.userData.skinHex||0x8D5A38);
        return;
      }
      if(m.userData.baseHex===undefined) m.userData.baseHex=m.color.getHex();
      if(hex===undefined||hex===null){ m.color.setHex(m.userData.baseHex); m.userData.tinted=false; }
      else { m.color.setHex(hex); m.userData.tinted=true; }
      touched=true;
    });
  }));
  return touched;
}
/* Kept as the name the wardrobe code already calls. */
function tintCut(host,slot,hex){ return tintSlot(host,slot,hex); }

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

/* ---- BODY SHAPE ----------------------------------------------------------
   Reshapes a VRM by scaling its skeleton. This is what makes an in-app
   character builder possible at all, because a VRoid export ships NO
   face-or-body shape morphs -- all 56 of its morph targets are `Fcl_*`
   EXPRESSIONS (blink, joy, the vowels), verified by reading the file. Bones
   are the only handle on proportion there is.

   TWO things were measured before this worked:

   1. SCALE MUST GO ON THE **RAW** BONES. three-vrm's normalized humanoid rig
      is a parallel skeleton that only carries ROTATIONS across to the real
      one, so any scale written there is silently dropped -- three differently
      "scaled" bodies all came back exactly 1.613 units tall, with the same
      vertex positions. getRawBoneNode(), not getNormalizedBoneNode().
   2. `Box3.setFromObject` CANNOT verify any of this. It transforms the
      geometry's BIND-POSE bounds by the world matrix, so a reshaped skinned
      mesh reports an identical box every time. Sample a real vertex through
      `applyBoneTransform` instead (the same trap the garment transplant hit).

   Scaling a bone scales everything BELOW it, so each dial counter-scales its
   own children: widening the chest would otherwise stretch the arms sideways
   with it, and thickening the torso would inflate the head. Every dial is
   1.0 = unchanged. */
const VRM_BODY_DEFAULT={height:1,build:1,shoulders:1,legs:1,arms:1,head:1};

/* Resolves a humanoid bone name against WHATEVER rig it is handed. The
   builder has to work on the default Quaternius character as well as on a
   VRM, because the single-file build ships no bundled .vrm at all (it is
   ~14MB, well past the artifact size cap) -- so on the published build the
   player HAS no VRM, and a builder that only shaped VRMs was a builder that
   did nothing at all there. Both rigs are already mapped to each other for
   the walk-cycle retargeting, so VRM_SRC_OF is reused rather than inventing a
   second bone table that could drift from it. */
function bodyBones(target){
  if(!target) return null;
  if(target.humanoid&&target.humanoid.getRawBoneNode){
    // a VRM: RAW bones only -- the normalized rig carries rotations, not scale
    return n=>target.humanoid.getRawBoneNode(n);
  }
  const root=target.scene||target;
  if(!root||!root.traverse) return null;
  const byName={};
  root.traverse(function(o){ if(o.isBone) byName[o.name]=o; });
  return n=>{ const src=VRM_SRC_OF[n]; return src?(byName[src]||null):null; };
}
function bodyRoot(target){
  return (target&&target.scene)?target.scene:target;
}

/* Reshapes a character by scaling its skeleton. Works on a VRM or on the
   default GLB rig -- see bodyBones() above.

   Scaling exists because a VRoid export ships NO shape morphs: all 56 of its
   morph targets are `Fcl_*` EXPRESSIONS (blink, joy, the vowels), verified by
   reading the file. Bones are the only handle on proportion there is.

   TWO things were measured before this worked:

   1. On a VRM, scale must go on the **RAW** bones. three-vrm's normalized
      humanoid rig is a parallel skeleton that only carries ROTATIONS across to
      the real one, so any scale written there is silently dropped -- three
      differently "scaled" bodies all came back exactly 1.613 units tall with
      identical vertex positions.
   2. `Box3.setFromObject` CANNOT verify any of this. It transforms the
      geometry's BIND-POSE bounds by the world matrix, so a reshaped skinned
      mesh reports an identical box every time. Sample a real vertex through
      `applyBoneTransform` instead (the same trap the garment transplant hit).

   Scaling a bone scales everything BELOW it, so each dial counter-scales its
   own children: widening the chest would otherwise stretch the arms sideways
   with it, and thickening the torso would inflate the head. Every dial is
   1.0 = unchanged. */
function applyBodyShape(target,body){
  const B=bodyBones(target);
  if(!B) return false;
  const b=Object.assign({},VRM_BODY_DEFAULT,body||{});
  const set=(n,x,y,z)=>{ const o=B(n); if(o) o.scale.set(x,y,z); };

  set('spine', b.build,1,b.build);
  set('chest', b.shoulders,1,1);

  /* Counter-scale what hangs off the torso so it keeps its own proportions:
     without this a broad-shouldered character gets wide arms and a heavy one
     gets a fat head. */
  set('neck', 1/(b.build*b.shoulders),1,1/b.build);
  const shX=1/(b.shoulders*b.build), shZ=1/b.build;
  set('leftShoulder', shX,1,shZ);
  set('rightShoulder',shX,1,shZ);

  set('leftUpperArm', 1,b.arms,1);
  set('rightUpperArm',1,b.arms,1);
  set('leftUpperLeg', 1,b.legs,1);
  set('rightUpperLeg',1,b.legs,1);
  const invA=1/b.arms, invL=1/b.legs;
  set('leftHand',1,invA,1); set('rightHand',1,invA,1);
  set('leftFoot',1,invL,1); set('rightFoot',1,invL,1);

  set('head', b.head/b.build,b.head,b.head/b.build);

  /* Height is the one dial that does NOT go through the skeleton: it scales
     the whole model, which cannot distort anything and cannot fight the
     retargeter. Both loaders have already normalised to the world's 4-unit
     person, so this multiplies that. */
  const root=bodyRoot(target);
  if(root) root.scale.multiplyScalar(b.height);
  return true;
}

/* Kept as the VRM-shaped name the rest of the code already calls. */
function applyVRMBody(vrm,body){ return applyBodyShape(vrm,body); }

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


/* ===================== THE WARDROBE (garment cuts) =====================
   Swapping the SHAPE of a garment, not its colour. Everything here moves
   geometry that already exists: the Quaternius "Ultimate Modular Men" pack
   (CC0 1.0) ships all eleven characters on one shared 62-bone rig with
   Body/Head/Legs/Feet as separately-named, deliberately interchangeable
   nodes. Nothing in this project models a garment; a cut is a part of that
   pack, loaded and re-bound onto whichever character the player is wearing.

   `node` is the pack's own node name and `mat` is the material name that IS
   the garment (the rest of the node is skin, waistbands, trim), so a tint
   lands on the cloth and not on the arms. `src` names an already-loaded
   CHAR_MODELS entry — those two files are downloaded for the world anyway,
   so four of the seven cuts cost nothing extra; only the other three are
   their own (small, mesh-only, animation-free) download. */
const GARMENT_PARTS={
  hoodie_top:  {slot:'top', src:'hoodie', node:'Casual_Body',  mat:'Purple'},
  tee_top:     {slot:'top', src:'casual', node:'Casual2_Body', mat:'LightBrown'},
  franela_top: {slot:'top', file:'characters/parts/Beach_Body.glb', node:'Beach_Body', mat:'LightBrown'},

  /* The two shorts are the pack's own full-length trousers CUT TO LENGTH --
     Casual_2's slim jeans hemmed 2.5in below the knee, the Farmer's baggy
     pair 1.5in above it. The pack ships exactly two shorts and neither sits
     where a real pair does, so the length comes from tailoring premade
     geometry rather than from a mesh anyone modelled. Each carries the bare
     leg it exposes (see assets/characters/parts/README.md). */
  denimshorts: {slot:'bottom', file:'characters/parts/Shorts_Denim.glb', node:'Shorts_Denim', mat:'LightBlue'},
  gymshorts:   {slot:'bottom', file:'characters/parts/Shorts_Gym.glb',   node:'Shorts_Gym',   mat:'LightBlue'},
  jeans:       {slot:'bottom', src:'casual', node:'Casual2_Legs', mat:'LightBlue'},
  baggy:       {slot:'bottom', file:'characters/parts/Farmer_Pants.glb', node:'Farmer_Pants', mat:'LightBlue'},

  /* HAIR. A hairstyle is one mesh weighted to the Head bone alone, so it
     swaps the same way a garment does -- but it is matched by MATERIAL, not
     by node name: hair lives inside the character's own *_Head group next to
     the face, eyes and brows, and only the hair mesh may be replaced. */
  hair_stock:  {slot:'hair', src:'hoodie', node:'Casual_Head', mats:['Hair'], mat:'Hair'},
  hair_waves:  {slot:'hair', file:'characters/parts/Hair_Waves.glb',  node:'Beach_Head',      mats:['Hair'], mat:'Hair'},
  hair_fade:   {slot:'hair', file:'characters/parts/Hair_Fade.glb',   node:'Suit_Head',       mats:['Hair'], mat:'Hair'},
  hair_long:   {slot:'hair', file:'characters/parts/Hair_Long.glb',   node:'Adventurer_Head', mats:['Hair'], mat:'Hair'},
  hair_mohawk: {slot:'hair', file:'characters/parts/Hair_Mohawk.glb', node:'Punk_Head',       mats:['Red','Red_Dark'], mat:'Red'},

  /* Derived from the character's own head — see HAIR_CAPS below. No file, no
     download, and they fit whatever head is being worn by construction. */
  hair_bald:     {slot:'hair', derive:'cap_bald'},
  hair_buzz:     {slot:'hair', derive:'cap_buzz'},
  hair_lowfade:  {slot:'hair', derive:'cap_lowfade'},
  hair_taper:    {slot:'hair', derive:'cap_taper'},
  hair_curlfade: {slot:'hair', derive:'cap_curlfade'},
  hair_curls:    {slot:'hair', derive:'cap_curls'},
  hair_afro:     {slot:'hair', derive:'cap_afro'},
  hair_coils:    {slot:'hair', derive:'cap_coils'},
  hair_hightop:  {slot:'hair', derive:'cap_hightop'},

  /* SHOES. Casual_2's are a low-top trainer with a separate sole, which is
     what makes a chunky white pair possible: tint the upper white and puff
     the sole. Shape only and no marking of any kind — the same rule the
     Civic EK and the colmado signage follow, since a silhouette is not a
     trademark but a logo is. */
  shoes_stock: {slot:'shoes', src:'hoodie', node:'Casual_Feet',  mat:'Purple'},
  /* defaultTint because the point of this pair IS that they are white —
     inheriting the outgoing shoe's colour, which is what every other cut
     rightly does, handed back a blue pair. */
  shoes_court: {slot:'shoes', src:'casual', node:'Casual2_Feet', mat:'Red_Dark',
                sole:'White', solePuff:.010, defaultTint:0xF2F0EA}
};
/* Which node names a character's own top/bottom already go by. Every model in
   the pack follows <Character>_Body / _Legs (the Farmer calls its bottom
   _Pants), so this matches the character you start in as well as anything
   worn over it. */
const CUT_SLOT_RE={ top:/_Body$/, bottom:/_(Legs|Pants|Shorts)$/, shoes:/_Feet$/, hair:null };
/* Material names that are the BODY, not the clothes — used when reading a
   garment's colour off a node whose `mat` we don't know (the character's own
   original top/bottom, before any cut has been worn). */
const CLOTH_MAT_SKIP=/^(Skin|Skin_Darker|Eye|Eyebrows|Hair|Hair_White|Moustache)$/;
const HAIR_MAT=/^(Hair|Hair_White)$/;
/* What counts as "the thing currently in this slot" on a character. The top
   and bottom are whole nodes; hair is a mesh identified by its material
   inside the head, and shoes are whatever is not skin inside the feet. */
function slotMeshes(host,slot){
  const out=[];
  if(slot==='hair'){
    host.traverse(o=>{
      if(!o.isMesh) return;
      if(o.userData.cutSlot==='hair'){ out.push(o); return; }
      if(o.material&&HAIR_MAT.test(o.material.name||'')&&o.parent&&/_Head$/.test(o.parent.name))
        out.push(o);
    });
    return out;
  }
  if(slot==='shoes'){
    host.traverse(o=>{ if(o.isMesh&&o.parent&&/_Feet$/.test(o.parent.name)
      &&o.material&&!CLOTH_MAT_SKIP.test(o.material.name||'')) out.push(o); });
    return out;
  }
  const re=CUT_SLOT_RE[slot];
  host.traverse(o=>{
    if(o.userData.cutSlot===slot||(re&&re.test(o.name)&&(o.isMesh||o.type==='Group'))) out.push(o);
  });
  return out;
}

/* Downloaded-once cache for the parts that aren't already in ASSETS.chars.
   A value of `null` means "tried and failed" — a missing garment leaves the
   character in what it had on, the same rule modelPerson()||makePerson()
   follows for the character itself. */
const GARMENT_CACHE={};
function loadGarment(partId,done){
  const def=GARMENT_PARTS[partId];
  if(!def){ done(null); return; }
  if(def.src){                       // already downloaded for the world
    const src=ASSETS.chars[def.src];
    done(src?src.scene:null); return;
  }
  if(GARMENT_CACHE[partId]!==undefined){ done(GARMENT_CACHE[partId]); return; }
  if(typeof THREE==='undefined'||typeof THREE.GLTFLoader!=='function'){ done(null); return; }
  /* build_single.js swaps this branch for a parse() of inlined base64 — a
     data: URI would go through FileLoader's XHR and be refused by the
     artifact host's connect-src. See "One file, no server, no CSP". */
  new THREE.GLTFLoader().load(ASSET_BASE+def.file,
    g=>{ GARMENT_CACHE[partId]=g.scene; done(g.scene); },
    undefined,
    ()=>{ GARMENT_CACHE[partId]=null; done(null); });
}

/* Re-index a donor garment's skinIndex values from the DONOR's bone array to
   the HOST's, BY BONE NAME. The two arrays happen to agree today — every file
   in the pack exports the same rig in the same order — but trusting that is
   exactly the bug vrmWear() already documents: a wrong order shows up as one
   sleeve inside-out, never as an error. Measured on every cut here: 62 of 62
   bones matched, zero misses.

   The remapped geometry is cached per part, so wearing a cut twice (a preview
   repaint, a second ENTER) re-uses one buffer instead of rebuilding it. */
const GARMENT_GEO={};
function bindGarment(mesh,donorSkel,hostSkel,key,mod){
  let geo=GARMENT_GEO[key];
  if(!geo){
    geo=mesh.geometry.clone();
    const map=new Int32Array(donorSkel.bones.length);
    let miss=0;
    for(let i=0;i<donorSkel.bones.length;i++){
      const nm=donorSkel.bones[i].name;
      let j=-1;
      for(let k=0;k<hostSkel.bones.length;k++){ if(hostSkel.bones[k].name===nm){ j=k; break; } }
      map[i]=j; if(j<0) miss++;
    }
    if(miss===0||miss<donorSkel.bones.length){
      const si=geo.attributes.skinIndex, arr=si.array.slice();
      for(let i=0;i<arr.length;i++){ const m=map[arr[i]]; arr[i]=m<0?0:m; }
      geo.setAttribute('skinIndex',new THREE.BufferAttribute(arr,4));
    }
    /* Any reshaping happens ONCE, here, and is cached with the geometry —
       re-deriving an oversized fit on every repaint would rebuild the mesh
       under the player's finger. */
    if(mod) geo=mod(geo)||geo;
    GARMENT_GEO[key]=geo;
  }
  mesh.geometry=geo;
  mesh.bind(hostSkel,mesh.bindMatrix);
}

/* Puts one cut on one character. Synchronous once the part is loaded; returns
   false if there was nothing to wear, in which case the character keeps
   whatever it already had on. */
function wearCutNow(host,slot,partId,donorScene,tint){
  const def=GARMENT_PARTS[partId];
  if(!host||!def||!donorScene||typeof THREE.SkeletonUtils==='undefined') return false;

  let hostSkel=null;
  host.traverse(o=>{ if(!hostSkel&&o.isSkinnedMesh) hostSkel=o.skeleton; });
  if(!hostSkel) return false;        // a primitive makePerson() body — nothing to dress

  const donor=THREE.SkeletonUtils.clone(donorScene);
  let donorSkel=null,node=null;
  donor.traverse(o=>{ if(!donorSkel&&o.isSkinnedMesh) donorSkel=o.skeleton; });
  donor.traverse(o=>{ if(!node&&o.name===def.node) node=o; });
  if(!donorSkel||!node) return false;

  /* Take the OLD garment off first, and find the armature to hang the new one
     from while doing it. Matching on userData.cutSlot as well as the name is
     what stops outfits STACKING: a worn cut keeps its donor's node name
     (Beach_Body on a Casual character), so name-matching alone misses it on
     the next change and you end up wearing both. */
  let arm=null;
  const doomed=slotMeshes(host,slot);
  /* Inherit the colour the outgoing garment was wearing, unless the caller
     asked for a specific tint. Changing your CUT should not silently change
     your COLOUR back to whatever the donor file happened to export -- the
     Farmer's pants ship near-black, so picking "baggy" over a pair of indigo
     shorts turned the character's legs black with nothing having asked for
     that. Colour and cut are separate choices and neither may reset the
     other. */
  const inheritMap={}; let inherited=null;
  doomed.forEach(o=>o.traverse(m=>{
    if(!m.isMesh||!m.material) return;
    (Array.isArray(m.material)?m.material:[m.material]).forEach(mat=>{
      if(!mat||!mat.name||inheritMap[mat.name]!==undefined) return;
      inheritMap[mat.name]=mat.color.getHex();
      /* What counts as "the body" depends on the slot: Hair is part of the
         body for a shirt, and is the garment itself for a hairstyle. */
      const bodyRe=(slot==='hair')?/^(Skin|Skin_Darker|Eye|Eyebrows)$/:CLOTH_MAT_SKIP;
      if(inherited===null&&!bodyRe.test(mat.name)) inherited=mat.color.getHex();
    });
  }));
  doomed.forEach(o=>{ if(!arm) arm=o.parent; if(o.parent) o.parent.remove(o); });
  if(!arm) host.traverse(o=>{ if(!arm&&o.name==='CharacterArmature') arm=o; });
  if(!arm) arm=host;

  /* For hair, only the hair MESHES travel -- the donor's head brings a face,
     eyes and brows with it, and swapping a hairstyle must not swap the head. */
  const wanted=[];
  node.traverse(o=>{
    if(!o.isSkinnedMesh) return;
    if(def.mats&&def.mats.indexOf(o.material&&o.material.name)<0) return;
    wanted.push(o);
  });
  /* The build is part of the geometry's identity, so it belongs in the cache
     key — without it the first fit worn would be handed back for the other. */
  const build=(typeof currentBuild==='function')?currentBuild():'normal';
  const boxy=(build==='boxy')&&BOXY[slot];
  wanted.forEach(o=>{
    const mname=o.material&&o.material.name;
    const mod=geo=>{
      /* The oversized build inflates the CLOTH only. A top carries the arm
         skin with it and the legs carry a bare shin — puffing those would
         inflate the body inside the clothes, not the clothes. */
      if(boxy&&mname===def.mat) return puffGeometry(geo,boxy);
      /* A chunky sole is the same operation aimed at one material. */
      if(def.sole&&mname===def.sole)
        return puffGeometry(geo,{puff:def.solePuff,hem:0,band:1});
      return null;
    };
    bindGarment(o,donorSkel,hostSkel,partId+'|'+o.name+'|'+build,mod);
    o.userData.sharedGeo=true;             // geometry is GARMENT_GEO's, not this clone's
    o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m||!m.name) return;
      /* Every material the outgoing part had, by name -- not just the cloth.
         A top carries the TORSO AND ARM SKIN with it (that is what makes a
         franela sleeveless at all), so wearing one straight from the donor
         file changed the character's skin tone along with the shirt. */
      if(inheritMap[m.name]!==undefined) m.color.setHex(inheritMap[m.name]);
      if(def.sole&&m.name===def.sole&&def.defaultTint!==undefined){
        m.userData.baseHex=def.defaultTint; m.color.setHex(def.defaultTint); return; }
      if(m.name!==def.mat) return;
      /* baseHex is what this garment sits at when NO colourway is chosen, and
         that is the colour it inherited -- not the donor file's own export.
         Recording the donor's value here instead is what made a second pass
         (applyCuts runs again on every slider input, and tintCut() resets an
         untinted slot to baseHex) quietly undo the inheritance one frame
         later: the shorts changed colour by themselves after a repaint. */
      m.userData.baseHex=(def.defaultTint!==undefined) ? def.defaultTint
        : (inherited!==null&&inherited!==undefined) ? inherited : m.color.getHex();
      const c=(tint!==undefined&&tint!==null)?tint:m.userData.baseHex;
      m.color.setHex(c); m.userData.tinted=(tint!==undefined&&tint!==null);
    });
    /* Bind-pose bounds put a skinned garment's bounding sphere somewhere the
       posed mesh is not, which culls a worn garment at some camera angles and
       not others. */
    o.frustumCulled=false;
    o.userData.cutSlot=slot;
  });
  if(!wanted.length) return false;
  if(def.slot==='hair'){
    /* Hair hangs off the character's OWN head, not the donor's node, so it
       follows the head bone and the head the player is actually wearing. */
    let head=null; host.traverse(o=>{ if(!head&&/_Head$/.test(o.name)) head=o; });
    (head||arm).add.apply(head||arm, wanted);
  } else {
    node.userData.cutSlot=slot;
    arm.add(node);
  }
  return true;
}




/* ---- FACES --------------------------------------------------------------
   Every head in the Quaternius pack carries the IDENTICAL 48-vertex `Eye`
   mesh — checked across all eleven characters — so there is no second face
   anywhere in the pack to source, anime or otherwise. Nor is there a face
   TEXTURE to swap: these materials are flat colours, and this project paints
   no face maps (see "Textures are multiply maps only").

   What the eye mesh does give is a shape to work with. Each entry rescales
   the eyes about their OWN centres — anime reads as eye size and slant more
   than anything else — and nudges the brows to match. Derived from the
   pack's mesh, not drawn.

   Measured: the eyes sit at y 1.684-1.709, x +/-0.057, z 0.130-0.158, and
   the pair lives in one mesh, so each eye is scaled about its own centroid
   rather than about the face, or they would slide apart. */
const FACE_SHAPES={
  face_stock: null,
  face_wide:  {eye:{x:1.34,y:1.70,z:1.0, dy:.002}, brow:{y:1.25, dy:.006}},
  face_sharp: {eye:{x:1.30,y:0.72,z:1.0, dy:.001}, brow:{y:0.85, dy:.004}},
  face_soft:  {eye:{x:1.18,y:1.42,z:1.0, dy:-.002},brow:{y:1.10, dy:.003}},
  face_stoic: {eye:{x:0.92,y:0.78,z:1.0, dy:.000}, brow:{y:0.80, dy:.000}},
  face_bright:{eye:{x:1.46,y:1.92,z:1.0, dy:.003}, brow:{y:1.30, dy:.008}}
};
/* Rescales one mesh's vertices about each SIDE's own centroid. */
function reshapeFacePart(mesh,spec){
  if(!mesh||!spec) return null;
  const src=mesh.userData.faceOrig||mesh.geometry;
  mesh.userData.faceOrig=src;
  const geo=src.clone(), P=geo.attributes.position;
  const c={};
  [1,-1].forEach(sg=>{ let sx=0,sy=0,sz=0,n=0;
    for(let i=0;i<P.count;i++){ const x=P.getX(i); if((x<0?-1:1)!==sg) continue;
      sx+=x; sy+=P.getY(i); sz+=P.getZ(i); n++; }
    c[sg]=n?{x:sx/n,y:sy/n,z:sz/n}:{x:0,y:0,z:0}; });
  for(let i=0;i<P.count;i++){
    const x=P.getX(i), a=c[x<0?-1:1];
    P.setXYZ(i, a.x+(x-a.x)*spec.x,
                a.y+(P.getY(i)-a.y)*spec.y+(spec.dy||0),
                a.z+(P.getZ(i)-a.z)*spec.z);
  }
  P.needsUpdate=true;
  geo.computeBoundingSphere();
  return geo;
}
/* Applies a face to whichever head is on the body. Reversible: the untouched
   geometry is kept on the mesh, so picking "As exported" really restores it
   rather than re-deriving an approximation of it. */
function applyFace(host,faceId){
  if(!host) return false;
  const spec=FACE_SHAPES[faceId!==undefined?faceId:'face_stock'];
  let eye=null, brow=null;
  host.traverse(o=>{
    if(!o.isMesh||!o.material||!o.parent||!/_Head$/.test(o.parent.name)) return;
    if(o.material.name==='Eye') eye=o;
    if(o.material.name==='Eyebrows') brow=o;
  });
  if(!eye) return false;
  if(!spec){
    if(eye.userData.faceOrig) eye.geometry=eye.userData.faceOrig;
    if(brow&&brow.userData.faceOrig) brow.geometry=brow.userData.faceOrig;
    return true;
  }
  const g1=reshapeFacePart(eye,spec.eye);   if(g1) eye.geometry=g1;
  if(brow&&spec.brow){
    const g2=reshapeFacePart(brow,{x:1,y:spec.brow.y,z:1,dy:spec.brow.dy});
    if(g2) brow.geometry=g2;
  }
  return true;
}
function currentFace(){
  const f=(S.person&&S.person.character&&S.person.character.fit)||{};
  return FACE_SHAPES[f.face]!==undefined?f.face:'face_stock';
}

/* ---- FIT: normal vs oversized ------------------------------------------
   2026 oversized is a BUILD, not a garment: the same tee in a boxy cut.
   Rather than shipping every top twice, the boxy version is derived from the
   normal one by inflating it — vertices pushed out along the surface and the
   hem dropped, which is exactly what a bigger size does to a pattern.

   Normals are welded first for the same measured reason makeHairCap() welds
   them: these meshes are faceted, so offsetting along raw per-vertex normals
   pushes adjacent triangles' shared corner apart and the garment tears into
   loose facets. */
const FIT_BUILDS=['normal','boxy'];
/* Per slot: how far to inflate, how far to drop the hem, and over what height
   band the drop eases in. Tuned against the real meshes, whose torso garment
   runs y 1.00-1.57 and whose legs run 0.13-1.05. */
const BOXY={
  top:    {puff:.032, hem:.085, band:.18},
  bottom: {puff:.026, hem:.030, band:.20}
};
function puffGeometry(geo,opts){
  const P=geo.attributes.position, N=geo.attributes.normal;
  if(!P||!N) return geo;
  const out=geo.clone();
  const OP=out.attributes.position;
  const key=i=>P.getX(i).toFixed(4)+','+P.getY(i).toFixed(4)+','+P.getZ(i).toFixed(4);
  const wn={};
  for(let i=0;i<P.count;i++){ const k=key(i);
    const a=wn[k]||(wn[k]=[0,0,0]);
    a[0]+=N.getX(i); a[1]+=N.getY(i); a[2]+=N.getZ(i); }
  Object.keys(wn).forEach(k=>{ const a=wn[k];
    const L=Math.hypot(a[0],a[1],a[2])||1; a[0]/=L; a[1]/=L; a[2]/=L; });
  let lo=Infinity, hi=-Infinity;
  for(let i=0;i<P.count;i++){ const y=P.getY(i); if(y<lo)lo=y; if(y>hi)hi=y; }
  for(let i=0;i<P.count;i++){
    const n=wn[key(i)], y=P.getY(i);
    /* The hem drops, the shoulders do not — an oversized tee gets longer and
       squarer at the bottom while still sitting on the same shoulders. */
    const t=Math.max(0,Math.min(1,(y-lo)/Math.max(opts.band,1e-4)));
    const drop=opts.hem*(1-(t*t*(3-2*t)));
    OP.setXYZ(i, P.getX(i)+n[0]*opts.puff,
                 y+n[1]*opts.puff-drop,
                 P.getZ(i)+n[2]*opts.puff);
  }
  OP.needsUpdate=true;
  out.computeBoundingSphere();
  return out;
}
function currentBuild(){
  const f=(S.person&&S.person.character&&S.person.character.fit)||{};
  return FIT_BUILDS.indexOf(f.build)>=0?f.build:'normal';
}

/* The REAL vertical extent of a posed character, sampled through
   applyBoneTransform.

   Box3.setFromObject cannot do this: it transforms the geometry's BIND-POSE
   bounds by the world matrix, and this rig's bind pose flings the arms out.
   Measured on the default character: the bind box is 4.000 tall while the
   character actually standing there is 2.146 — so anything that sizes or
   frames a character off Box3 is working from a figure nearly twice too big.
   Same trap the garment transplant and the body dials already hit, arriving
   through a third door.

   Sampled, not exhaustive: a couple of hundred vertices per mesh is plenty for
   a silhouette and cheap enough to run on a wardrobe change (never per frame). */
function posedBounds(root){
  if(!root||typeof THREE==='undefined') return null;
  root.updateMatrixWorld(true);
  const v=new THREE.Vector3();
  let lo=Infinity, hi=-Infinity;
  root.traverse(o=>{
    if(!o.isSkinnedMesh||!o.geometry||!o.geometry.attributes.position) return;
    const P=o.geometry.attributes.position;
    const step=Math.max(1,Math.floor(P.count/240));
    for(let i=0;i<P.count;i+=step){
      v.fromBufferAttribute(P,i);
      if(o.applyBoneTransform) o.applyBoneTransform(i,v);
      o.localToWorld(v);
      if(v.y<lo) lo=v.y;
      if(v.y>hi) hi=v.y;
    }
  });
  return hi>lo ? {min:lo, max:hi, height:hi-lo, mid:(lo+hi)/2} : null;
}

/* ===================== DERIVED HAIRCUTS (fades, curls) =====================
   A fade, a taper, a line-up or a buzz is NOT a silhouette — it is a
   millimetre of hair hugging the skull, and all of its identity lives in the
   HAIRLINE and the two tones. There is nothing to model, which is why no
   asset library ships one, and a downloaded cap would be cut to someone
   else's skull anyway.

   So these are derived from the character's OWN head mesh: every vertex
   pushed out along the surface by a few millimetres and the result cut at a
   hairline. That makes them fit by construction, on any head, and costs ZERO
   download — nothing here is a file.

   Measured on this rig, in head-space: the crown sits at y=1.826, the brow at
   1.715, the nape around 1.575, and one local unit is about 0.94 m, so a
   millimetre of hair is 0.00106. `grow` is therefore roughly hair length in
   metres/1000; `yF`/`yB` are where the hairline crosses at the front and the
   back; `flatY` is the level guard line a fade is cut to; `yMax` stops the
   short sides where the long top begins; `curl`/`clump` break the shell into
   clumps. */
const HAIR_CAPS={
  /* lineY  — the line-up: a FLAT line across the forehead, absolute head Y
     lineBack — where the hairline sits at the nape
     fadeLo/fadeHi — zero hair at Lo, full length at Hi
     grow   — hair length; the head is 0.327 local units for roughly 17cm,
              so one millimetre is about 0.0019 here
     curl/clump — depth and size of the clumps
     tight  — how much length survives on a vertical surface: 1 keeps the
              cap uniform, low values crop the sides in to the skull
     cap    — flat top, clamped to this height

     The fade bands are short AND sit high. Placed low they left the temple
     at nearly full darkness where it hangs forward past the eye, which read
     as a mushroom rather than a fade; by the time the hairline comes forward
     at the temple the fade should already be mostly skin.

     They are also deliberately SHORT. A first pass spread them over
     0.134 local units — some 7cm of scalp — and the result read as hair
     softly petering out rather than as a fade; a real low fade does the
     whole transition in three or four centimetres. */
  cap_bald:     null,
  /* Clipper-short all over: barely off the skin, no curl, fade almost
     immediate. */
  cap_buzz:     {tight:0.80, lineY:1.732, lineBack:1.620, fadeLo:1.640, fadeHi:1.668,
                 grow:.0065},
  /* Short on top, skin at the bottom, fade sitting low near the ear. */
  cap_lowfade:  {tight:0.26, lineY:1.735, lineBack:1.618, fadeLo:1.630, fadeHi:1.700,
                 grow:.0205},
  /* Longer on top and a softer, higher transition than the low fade. */
  cap_taper:    {tight:0.46, lineY:1.733, lineBack:1.628, fadeLo:1.656, fadeHi:1.726,
                 grow:.0300},
  /* The fresh-haircut one: real curl on top taking a smooth skin fade all
     the way down to zero, with a crisp line-up across the front. */
  cap_curlfade: {tight:0.24, lineY:1.735, lineBack:1.618, fadeLo:1.628, fadeHi:1.702,
                 grow:.0330, curl:.0165, clump:.0150},
  /* Curl everywhere rather than only on top — grown out, not faded. */
  cap_curls:    {tight:0.62, lineY:1.733, lineBack:1.622, fadeLo:1.636, fadeHi:1.694,
                 grow:.0300, curl:.0150, clump:.0155},
  /* Bigger, chunkier clumps. */
  cap_coils:    {tight:0.52, lineY:1.735, lineBack:1.619, fadeLo:1.632, fadeHi:1.698,
                 grow:.0420, curl:.0230, clump:.0285},
  /* Volume all round, only the very bottom taken in. */
  cap_afro:     {tight:0.90, lineY:1.736, lineBack:1.620, fadeLo:1.628, fadeHi:1.688,
                 grow:.0580, curl:.0165, clump:.0205},
  /* A tall flat box on top over cropped sides — the cap has to sit BELOW
     crown+grow or it never clamps and the shape stays a dome. */
  cap_hightop:  {tight:0.16, lineY:1.740, lineBack:1.622, fadeLo:1.646, fadeHi:1.734,
                 grow:.0900, cap:1.884}
};


/* Builds a haircut from the head's own skin mesh.

   A FADE IS A GRADIENT. The first version cut the scalp at a line and filled
   it with one flat colour, plus a second flat piece on top — and it rendered
   as a swim cap with a staircase along its bottom edge, because two flat
   tones separated by a hard line is the one thing a fade is not.

   So there is no bottom cut any more. The cap covers the whole scalp, and
   BOTH its thickness and its colour ramp from full hair at the top to
   nothing at the bottom: at the low end the mesh sits a fraction of a
   millimetre off the skin in exactly the skin's own colour, which is what
   skin-faded-to-zero actually looks like. No cut edge means no staircase,
   and the fade is continuous rather than stepped.

   The one place a real cut exists is the FRONT, because that is what a
   line-up is: a sharp straight edge across the forehead. It is found by
   NORMAL rather than by position — a vertex below the hairline whose normal
   faces forward is face, one whose normal faces sideways is the temple in
   front of the ear and is still hair — so the line-up stays crisp without
   shaving the sideburns off.

   Colour lives in VERTEX COLOURS, which is the only way to get a smooth ramp
   without a custom shader (see "No custom GLSL, ever"). recolorCap() rebuilds
   them when the hair or skin colour changes. */
function makeHairCap(head,spec,hairHex,skinHex){
  if(typeof THREE==='undefined'||!head||!head.geometry) return null;
  const g=head.geometry, P=g.attributes.position, N=g.attributes.normal;
  const SI=g.attributes.skinIndex, SW=g.attributes.skinWeight, UV=g.attributes.uv;
  if(!P||!N||!SI||!SW) return null;
  const ZB=-0.062, ZF=0.175;

  /* Weld normals: the head is faceted, so offsetting along raw per-vertex
     normals pushes adjacent triangles' shared corner apart and tears the
     shell into loose facets. */
  const key=i=>P.getX(i).toFixed(4)+','+P.getY(i).toFixed(4)+','+P.getZ(i).toFixed(4);
  const wn={};
  for(let i=0;i<P.count;i++){ const k=key(i);
    const a=wn[k]||(wn[k]=[0,0,0]);
    a[0]+=N.getX(i); a[1]+=N.getY(i); a[2]+=N.getZ(i); }
  Object.keys(wn).forEach(k=>{ const a=wn[k];
    const L=Math.hypot(a[0],a[1],a[2])||1; a[0]/=L; a[1]/=L; a[2]/=L; });

  /* THE HAIRLINE, FITTED TO THE PACK'S OWN HAIRSTYLE. The authored hair mesh
     is ground truth for where a haircut sits on this head; sampling its
     lowest vertex per (|x|, z) cell gives the line to match:

        |x|=0.00  front z=0.12 -> 1.730     back z=-0.05 -> 1.625
        |x|=0.04  front z=0.10 -> 1.723
        |x|=0.08  front z=0.10 -> 1.648     z=0.05 -> 1.676

     So the line falls going backwards AND falls steeply going outwards — the
     temple sits a good 8cm below the centre of the forehead. Three earlier
     attempts guessed at this instead of measuring: by depth alone (a bald
     patch from the ear up), then by surface normal (a bowl cut over the
     eyes, because a faceted head's welded normals do not separate forehead
     from cheek). This is a plane fitted to those samples and clamped. */
  const LB=(spec.lineY-spec.lineBack)/0.17;
  const LA=spec.lineY-LB*0.12;
  const lineAt=(x,z)=>Math.max(spec.lineBack,
    Math.min(spec.lineY, LA+LB*z-0.875*Math.abs(x)));
  /* How much hair is at this height: 0 at the bottom of the fade, 1 where it
     reaches full length. smoothstepped, so the blend has no visible seam. */
  const fadeAt=y=>{ const t=Math.max(0,Math.min(1,(y-spec.fadeLo)/(spec.fadeHi-spec.fadeLo)));
    return t*t*(3-2*t); };
  /* The measured ear: |x|>0.095, y 1.668-1.699, z 0.071-0.079. A looser box
     takes both temples with it — see the histogram in CLAUDE.md. */
  const isEar=i=>Math.abs(P.getX(i))>0.095&&P.getY(i)>1.660&&P.getY(i)<1.712
               &&P.getZ(i)>0.050&&P.getZ(i)<0.100;
  /* The face: anything below the hairline that is not the side or the back
     of the skull. The sideburn strip in front of the ear sits past |x|=0.084
     and has to survive, which is why this is not simply "the front half" —
     but a normal test alone kept the cheeks and jaw, and the cap painted
     them a near-skin panel that flattened the whole face. */
  /* THE ONLY CUT IS THE FOREHEAD, and it is found by NORMAL rather than by
     depth. A z threshold cannot separate forehead from temple: the two sit
     at nearly the same depth, so cutting by z either shaved a bald patch
     from the ear upward (threshold too far back) or left the line-up ragged
     (too far forward). The forehead faces FORWARD and the temple faces
     SIDEWAYS, which tells them apart cleanly.

     Everywhere else the hair simply shortens to nothing and takes the skin's
     colour, which needs no cut at all — and a cut there was what put a hard
     diagonal seam across the temple. */
  /* The face is the front of the skull, and measurement puts that at
     z>0.088: every front-facing skin vertex sits beyond it. Behind that is
     temple and side, which are never cut — the hair there just shortens to
     nothing and takes the skin's colour. */
  const ZCUT=0.088;
  const isFace=i=>P.getZ(i)>ZCUT&&P.getY(i)<lineAt(P.getX(i),P.getZ(i));

  const idx=g.index?g.index.array:null;
  const tri=idx||{length:P.count};
  const at=n=>idx?idx[n]:n;
  const V=i=>({p:[P.getX(i),P.getY(i),P.getZ(i)], n:wn[key(i)].slice(),
    u:UV?[UV.getX(i),UV.getY(i)]:null,
    si:[0,1,2,3].map(c=>SI.getComponent(i,c)),
    sw:[0,1,2,3].map(c=>SW.getComponent(i,c))});
  const mid=(a,b)=>({p:a.p.map((v,k)=>(v+b.p[k])/2), n:a.n.map((v,k)=>(v+b.n[k])/2),
    u:a.u?a.u.map((v,k)=>(v+b.u[k])/2):null, si:a.si.slice(), sw:a.sw.slice()});

  /* SUBDIVISION, uniform at two passes. Three over the whole scalp produced
     a 45,870-vertex haircut on a character that is otherwise about 10,000,
     and this game is played on a phone. Refining only the band around the
     line-up looked like the obvious saving and is not: fine triangles beside
     coarse ones meet at T-junctions, which crack open along the seam — the
     fringe came back over the eyebrows through the gaps. Uniform density
     cannot crack, and the crisp line-up comes from SNAPPING the straddling
     vertices onto the line rather than from sheer triangle count. */
  let work=[];
  for(let t=0;t+2<tri.length;t+=3){
    let face=0, ear=0, low=0;
    for(let k=0;k<3;k++){ const i=at(t+k);
      if(isFace(i)) face++;
      if(isEar(i)) ear++;
      if(P.getY(i)<spec.fadeLo-0.030) low++; }
    if(face===3||ear>=2||low===3) continue;
    work.push([V(at(t)),V(at(t+1)),V(at(t+2))]);
  }
  for(let pass=0;pass<2;pass++){
    const next=[];
    work.forEach(([a,b,c])=>{ const ab=mid(a,b), bc=mid(b,c), ca=mid(c,a);
      next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]); });
    work=next;
  }

  const pos=[],nrm=[],si=[],sw=[],uv=[],fade=[];
  work.forEach(t=>{
    /* Drop what is left of the face at full subdivision, so the line-up lands
       on the fine mesh rather than on the head's own coarse triangles. */
    let face=0;
    t.forEach(v=>{ if(v.p[2]>ZCUT&&v.p[1]<lineAt(v.p[0],v.p[2])) face++; });
    if(face===3) return;
    t.forEach(v=>{
      const y0=v.p[1];
      let f=fadeAt(y0);
      /* Above the line-up at the front the hair is full length and stops
         dead — a line-up is cut, not faded. */
      /* THE LINE-UP, which is two separate jobs that must not be tied
         together.

         SNAP: any vertex of a straddling triangle that falls below the
         hairline on the front of the skull is pulled up onto the line.
         Triangles are kept or dropped whole, so without this their lower
         corners carry hair down over the forehead — and tying the snap to
         the flat region alone put the fringe back over the eyebrows.

         FULL LENGTH: only along the FLAT part of the line, the line-up
         proper across the middle of the forehead. Applying it to the whole
         front band handed the temple full-length hair at full darkness where
         it hangs forward past the eye, which is why the fade read as a
         mushroom however the band was tuned — it was being overridden. */
      const L=lineAt(v.p[0],v.p[2]);
      const flat=(LA+LB*v.p[2]-0.875*Math.abs(v.p[0]))>=spec.lineY-1e-6;
      let snapY=null;
      if(v.p[2]>ZCUT&&y0<L){ snapY=L; f=fadeAt(L); }
      if(flat&&v.p[2]>ZCUT) f=1;
      /* VOLUME ON TOP, TIGHT AT THE SIDES. Length cannot be uniform: with one
         `grow` for the whole cap the sides stood as far off the skull as the
         crown did and every cut read as a rounded mass. `tight` is how much
         length survives on a vertical surface, so the shape follows the
         normal — full on top, cropped down the sides, which is what a fade
         with a curly top actually looks like. */
      const up=Math.max(0,v.n[1]);
      const shape=(spec.tight===undefined)?1:(spec.tight+(1-spec.tight)*up);
      let gr=spec.grow*f*shape;
      if(spec.curl&&f>0.02){
        const q=spec.clump;
        const s=Math.sin(Math.round(v.p[0]/q)*127.1+Math.round(v.p[1]/q)*311.7
                        +Math.round(v.p[2]/q)*74.7)*43758.5453;
        gr+=spec.curl*((s-Math.floor(s))-0.35)*f*f*shape;
      }
      /* Never exactly zero: the shell has to stay outside the skin or the two
         surfaces z-fight across the whole faded area. */
      gr=Math.max(gr,0.0010);
      let y=(snapY!==null)?snapY:(y0+v.n[1]*gr);
      if(spec.cap&&y>spec.cap) y=spec.cap;
      pos.push(v.p[0]+v.n[0]*gr, y, v.p[2]+v.n[2]*gr);
      nrm.push(v.n[0],v.n[1],v.n[2]);
      if(v.u) uv.push(v.u[0],v.u[1]);
      for(let c=0;c<4;c++){ si.push(v.si[c]); sw.push(v.sw[c]); }
      fade.push(f);
    });
  });
  if(!pos.length) return null;

  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  if(uv.length) geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(fade.length*3),3));
  geo.userData.fade=Float32Array.from(fade);

  const mat=head.material.clone();
  mat.name='Hair';
  mat.vertexColors=true;
  mat.color.setHex(0xffffff);        // the colour lives in the vertex ramp
  const m=new THREE.SkinnedMesh(geo,mat);
  m.bind(head.skeleton,head.bindMatrix);
  m.frustumCulled=false;
  m.userData.cutSlot='hair';
  m.userData.hairCap=1;
  recolorCap(m,hairHex,skinHex);
  return m;
}

/* Writes the hair->skin ramp into a cap's vertex colours. Called whenever
   either colour changes, since the ramp is a blend BETWEEN the two and
   neither can move on its own. */
function recolorCap(mesh,hairHex,skinHex){
  const geo=mesh&&mesh.geometry;
  const f=geo&&geo.userData.fade, C=geo&&geo.attributes.color;
  if(!f||!C) return false;
  const hair=new THREE.Color(hairHex), skin=new THREE.Color(skinHex);
  const c=new THREE.Color();
  for(let i=0;i<f.length;i++){
    c.copy(skin).lerp(hair,f[i]);
    C.setXYZ(i,c.r,c.g,c.b);
  }
  C.needsUpdate=true;
  mesh.userData.hairHex=hairHex; mesh.userData.skinHex=skinHex;
  return true;
}

/* Wears a derived haircut. Returns true if anything was put on — `cap_bald`
   legitimately puts nothing on and still counts as worn. */
function wearHairCap(host,partId,hex){
  if(!host||!(partId in HAIR_CAPS)) return false;
  const spec=HAIR_CAPS[partId];
  let head=null, headSkin=null;
  host.traverse(o=>{ if(!head&&/_Head$/.test(o.name)) head=o; });
  host.traverse(o=>{ if(!headSkin&&o.isSkinnedMesh&&o.material&&o.material.name==='Skin'
    &&o.parent&&/_Head$/.test(o.parent.name)) headSkin=o; });
  if(!head||!headSkin) return false;
  slotMeshes(host,'hair').forEach(o=>{ if(o.parent) o.parent.remove(o); });
  if(!spec) return true;                                  // bald: nothing to add
  /* The fade blends INTO the skin, so it needs the skin's actual colour —
     read off the head that is on the body, not assumed. */
  const skinHex=headSkin.material.color.getHex();
  const m=makeHairCap(headSkin,spec,(hex===undefined||hex===null)?0x1A1410:hex,skinHex);
  if(m) head.add(m);
  return true;
}

/* Applies every saved cut to a character, loading whatever it needs first.
   Async and entirely optional: a cut that fails to load leaves the character
   in what it already had on, never a half-dressed body or a thrown error. */
function applyCuts(host,fit,done){
  if(typeof CUT_SLOTS==='undefined'||!host){ done&&done(); return; }
  const tints=(fit&&fit.tint)||{};
  host.userData.worn=host.userData.worn||{};
  let pending=CUT_SLOTS.length, changed=false;
  const finish=()=>{ if(--pending>0) return;
    /* The face last: a head that arrives with a cut brings its own untouched
       eyes, so the shape has to be re-applied once everything has landed. */
    if(typeof applyFace==='function') applyFace(host,(fit&&fit.face));
    /* Again after the garments have actually landed: a newly worn top brings
       its own skin with it, and a swap that resolves late would otherwise
       leave that skin at the donor's tone until the next repaint. */
    ['skin','shoes'].forEach(slot=>{ tintSlot(host,slot,tints[slot]); });
    /* The fade ends in SKIN, so a skin change moves the bottom of the ramp.
       Re-derive it from whatever the head is actually wearing now. */
    let sk=null;
    host.traverse(o=>{ if(!sk&&o.isMesh&&o.material&&o.material.name==='Skin'
      &&o.parent&&/_Head$/.test(o.parent.name)) sk=o; });
    if(sk) host.traverse(o=>{ if(o.userData&&o.userData.hairCap)
      recolorCap(o,o.userData.hairHex||0x1A1410,sk.material.color.getHex()); });
    done&&done(changed); };
  CUT_SLOTS.forEach(slot=>{
    const cut=(typeof currentCut==='function')?currentCut(slot):null;
    if(!cut||!cut.part){ finish(); return; }
    /* Already wearing it -> re-tint in place and stop. The preview calls this
       on every slider input, and a full re-wear clones a 62-bone rig each
       time; only an actual CHANGE of cut is worth that. */
    if(host.userData.worn[slot]===cut.part){ tintSlot(host,slot,tints[slot]); finish(); return; }
    /* A derived haircut has no file to fetch — it is computed from the head
       that is already on screen, so it lands synchronously. */
    const def=GARMENT_PARTS[cut.part];
    if(def&&def.derive){
      if(wearHairCap(host,def.derive,tints[slot])){
        host.userData.worn[slot]=cut.part; changed=true;
      }
      finish(); return;
    }
    loadGarment(cut.part,scene=>{
      if(scene&&wearCutNow(host,slot,cut.part,scene,tints[slot])){
        host.userData.worn[slot]=cut.part; changed=true;
      }
      finish();
    });
  });
  /* The slots that are never swapped, only coloured. Run after the cut slots
     are requested but independently of them: skin lives on whatever body
     parts are worn right now, so it is re-applied on every pass. */
  ['skin','shoes'].forEach(slot=>{ tintSlot(host,slot,tints[slot]); });
}

/* Recolours the garment already on the body, without swapping any geometry.
   `hex` of null/undefined means "as exported", which is the colour the fit
   system (dripFit/FITS) put there when the character was built, so it is
   restored from the material's own record rather than guessed. */
function tintCut(host,slot,hex){
  if(!host) return false;
  let node=null;
  host.traverse(o=>{ if(!node&&o.userData.cutSlot===slot) node=o; });
  if(!node) return false;
  const partId=host.userData.worn&&host.userData.worn[slot];
  const def=partId?GARMENT_PARTS[partId]:null;
  node.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(!m||(def&&m.name!==def.mat)) return;
      if(m.userData.baseHex===undefined) m.userData.baseHex=m.color.getHex();
      if(hex===undefined||hex===null){ m.color.setHex(m.userData.baseHex); m.userData.tinted=false; }
      else { m.color.setHex(hex); m.userData.tinted=true; }
    });
  });
  return true;
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
