/* ===================== DATA LAYER ===================== */
const KEY='sprout_v2';
function today(d){ return (d||new Date()).toISOString().slice(0,10); }
function fmt(k){ return new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

/* Every habit belongs to a window: 'am', 'pm', or 'both' (loggable once in
   EACH window — brushing genuinely is a twice-a-day thing). `anchor` is the
   default routine cue; the player can rewrite it in their own words and that
   override lives in S.anchors. Routine-based cues ("after I brush") build
   automaticity better than bare clock times, which is why every habit ships
   with one rather than leaving it blank. */
const HABITS=[
  {id:'wake',   nm:'Wake up on time',     vital:'REST',      ic:'😴', col:'#5C6BC0', window:'am',   anchor:'when the alarm goes'},
  {id:'teeth',  nm:'Brush teeth',         vital:'HYGIENE',   ic:'🦷', col:'#B0BEC5', window:'both', anchor:'after I get up / before bed'},
  {id:'floss',  nm:'Floss',               vital:'HYGIENE',   ic:'🦷', col:'#B0BEC5', window:'both', anchor:'right after I brush'},
  {id:'stretch',nm:'Stretch',             vital:'MOBILITY',  ic:'🧘', col:'#AB47BC', window:'am',   anchor:'before I sit down'},
  {id:'gym',    nm:'Gym',                 vital:'STRENGTH',  ic:'💪', col:'#EF5350', window:'am',   anchor:'after coffee'},
  {id:'wstart', nm:'Start work on time',  vital:'DISCIPLINE',ic:'⚙️', col:'#FFA726', window:'am',   anchor:'when I sit at the desk'},
  {id:'wend',   nm:'End work on time',    vital:'DISCIPLINE',ic:'⚙️', col:'#FFA726', window:'pm',   anchor:'when I close the laptop'},
  {id:'journal',nm:'Journal 5m',          vital:'MIND',      ic:'🧠', col:'#7E57C2', window:'pm',   anchor:'after dinner'},
  {id:'bed',    nm:'Bed on time',         vital:'REST',      ic:'😴', col:'#5C6BC0', window:'pm',   anchor:'when I get in bed'}
];
const WINDOWS={
  am:{key:'am', nm:'MORNING', greet:'BUENOS DÍAS'},
  pm:{key:'pm', nm:'NIGHT',   greet:'BUENAS NOCHES'}
};
const VITALS=[
  {k:'HYDRATION', ic:'💧', col:'#4FC3F7', src:'water'},
  {k:'NUTRITION', ic:'🍎', col:'#66BB6A', src:'diet'},
  {k:'REST',      ic:'😴', col:'#5C6BC0', src:['bed','wake']},
  {k:'STRENGTH',  ic:'💪', col:'#EF5350', src:'workout'},
  {k:'HYGIENE',   ic:'🦷', col:'#B0BEC5', src:['teeth','floss']},
  {k:'MIND',      ic:'🧠', col:'#7E57C2', src:['journal']},
  {k:'MOBILITY',  ic:'🧘', col:'#AB47BC', src:['stretch']},
  {k:'DISCIPLINE',ic:'⚙️', col:'#FFA726', src:['wstart','wend']}
];

/* A stable per-player id, generated once and never changed. Nothing uses it
   yet — it exists because this world goes multiplayer later, and an anonymous
   save can't be attributed to a character, merged, or synced. Cheap now,
   impossible to backfill onto saves that already exist. crypto.randomUUID is
   unavailable on http:// and in older mobile browsers, hence the fallback. */
function newPlayerId(){
  try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  let out='';
  for(let i=0;i<32;i++){
    out+=Math.floor(Math.random()*16).toString(16);
    if(i===7||i===11||i===15||i===19) out+='-';
  }
  return out;
}
/* Bumped when S's SHAPE changes in a way migrate() alone can't reconcile.
   migrate() only ever ADDS missing keys from blank(), so additive changes
   don't need a bump — this is for the day something has to be rewritten. */
const SCHEMA_VERSION=1;

function blank(){
  return {
    playerId:newPlayerId(), schemaVersion:SCHEMA_VERSION,
    log:{}, workout:{}, diet:{}, water:{}, perfectDone:{},
    /* Window hours are USER-CONFIGURABLE on purpose — the owner does not keep
       normal hours, and a hardcoded window makes the whole loop unusable.
       Hours are local, fractional (13.5 = 1:30pm). A window whose end is <=
       its start wraps past midnight, which the night window does by default. */
    windows:{am:{start:4,end:12}, pm:{start:18,end:3}},
    anchors:{},            // habit id -> the player's own cue wording
    claims:{},             // sessionDay -> {am:timestamp, pm:timestamp}
    cash:0, standing:0, lifetime:0, level:1, xp:0,
    security:{locks:0,lights:0,cameras:0,alarm:0,doors:0,dog:0,safe:0,detail:0},
    cond:{locks:100,lights:100,cameras:100,alarm:100,doors:100,dog:100,safe:100,detail:100},
    vehicle:{tier:0,mods:{tires:0,wheels:0,tint:0,tune:0},paint:'#6E7B8B'},
    person:{skin:'#C9884F',outfit:'#2C3242',wardrobe:0,grooming:0},
    incident:null, lastCheck:Date.now(), defended:0, breached:0, events:[]
  };
}
/* Only ever ADDS keys missing from blank(); stale keys in an old save are
   simply ignored. An existing save with no playerId gets one here — that is
   the whole point of doing this before the save format matters to anyone. */
function migrate(obj){
  const b=blank();
  for(const k in b) if(obj[k]===undefined) obj[k]=b[k];
  if(!obj.playerId) obj.playerId=newPlayerId();
  obj.schemaVersion=SCHEMA_VERSION;
  return obj;
}
let S;
try{ S=migrate(JSON.parse(localStorage.getItem(KEY))||blank()); }catch(e){ S=blank(); }
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){ showErr('Save failed: '+e.message); } }
// every mutation site already calls save() itself right after changing S, but this is
// a cheap backstop against ever losing progress to a spot that forgets to — a mobile
// browser can background/kill a tab at any point, so catch that moment explicitly
// rather than trusting every future S-mutating change to remember the explicit call.
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) save(); });
window.addEventListener('pagehide', save);

/* ---- backup/restore: localStorage is the ONLY copy of progress — a cleared
   browser, a private window, or a new device loses everything with no server
   to recover from. Export/import gives the player their own copy. ---- */
function exportSave(){ return JSON.stringify(S,null,2); }
function importSave(text){
  let obj;
  try{ obj=JSON.parse(text); }catch(e){ throw new Error("That doesn't look like a valid backup (invalid JSON)."); }
  if(!obj||typeof obj!=='object'||Array.isArray(obj)) throw new Error("That doesn't look like a valid backup.");
  S=migrate(obj); save();
}

function toast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1600); }
function impact(w){ const e=document.createElement('div'); e.className='impact'; e.textContent=w;
  e.style.left=(innerWidth/2-60+(Math.random()-.5)*80)+'px';
  e.style.top=(innerHeight/2+(Math.random()-.5)*100)+'px';
  document.body.appendChild(e); setTimeout(()=>e.remove(),560); }
function float(txt,el,col){ const f=document.createElement('div'); f.className='float'; f.textContent=txt;
  if(col) f.style.color=col;
  let x=innerWidth/2,y=innerHeight/2;
  if(el&&el.getBoundingClientRect){const r=el.getBoundingClientRect();x=r.left+r.width/2;y=r.top;}
  f.style.left=x+'px'; f.style.top=y+'px'; document.body.appendChild(f); setTimeout(()=>f.remove(),1050); }
function ev(text,cls){ S.events.unshift({t:Date.now(),text,cls:cls||''}); S.events=S.events.slice(0,40); save(); }

/* ---- workout schedule: Mon Push, Tue Pull, Wed Legs, Thu off, Fri Push, Sat Pull, Sun off ---- */
const SCHED={0:'Off',1:'Push',2:'Pull',3:'Legs',4:'Off',5:'Push',6:'Pull'};
function workoutFor(d){ return SCHED[d.getDay()]; }

/* ---- streaks: 1 miss survives, 2 consecutive breaks ---- */
function habitStreak(){
  let st=0,miss=0,d=new Date();
  for(let i=0;i<1200;i++){
    const k=today(d), lg=S.log[k]||{};
    // water used to be one of HABITS itself before it became a counter — keep it
    // part of "did everything today" for the streak, same as the perfect-day bonus
    const all=HABITS.every(h=>habitFullyDone(lg,h)) && (S.water[k]||[]).length>=WATER_TARGET;
    if(all){ miss=0; st++; }
    else if(k!==sessionDay()){ miss++; if(miss>=2) break; }
    d.setDate(d.getDate()-1);
  }
  return st;
}
function workoutStreak(){
  let st=0,miss=0,d=new Date();
  for(let i=0;i<1200;i++){
    const k=today(d);
    if(workoutFor(d)!=='Off'){
      if(S.workout[k]==='done'){ miss=0; st++; }
      else if(k!==sessionDay()){ miss++; if(miss>=2) break; }
    }
    d.setDate(d.getDate()-1);
  }
  return st;
}
function mult(){ return Math.min(1+Math.max(habitStreak(),workoutStreak())*0.05, 2.0); }

/* ---- vitals ---- */
function vitalLevel(v){
  const k=sessionDay(), lg=S.log[k]||{};
  if(v.src==='diet') return Math.min(1,(S.diet[k]||[]).length/DIET_TARGET);
  if(v.src==='water') return Math.min(1,(S.water[k]||[]).length/WATER_TARGET);
  if(v.src==='workout'){
    const sc=workoutFor(new Date());
    if(sc==='Off') return 1;
    return S.workout[k]==='done'?1:0;
  }
  // a vital fed by a 'both' habit has two slots a day (one per window), so the
  // meter fills across the day instead of maxing on the morning tap alone
  let done=0,total=0;
  v.src.forEach(id=>{
    const h=HABITS.find(x=>x.id===id);
    if(h&&h.window==='both'){ total+=2; done+=(habitDone(lg,h,'am')?1:0)+(habitDone(lg,h,'pm')?1:0); }
    else { total+=1; done+=lg[id]?1:0; }
  });
  return total?done/total:0;
}

/* ---- earning ---- */
const PAY={habit:12,workout:35,diet:6,water:2,perfect:140,window:40};
function earn(kind, el){
  const p=PAY[kind]; if(!p) return;
  const m=mult();
  const c=Math.round(p*m);
  S.cash+=c; S.lifetime+=c;
  let sTxt='';
  if(kind==='workout'||kind==='perfect'){
    const st=kind==='perfect'?6:1; S.standing+=st; sTxt=' ⭐+'+st;
  }
  S.xp+=Math.round(p*m*0.8);
  while(S.xp>=xpNeed()){ S.xp-=xpNeed(); S.level++; impact('LEVEL '+S.level); }
  save();
  float('💵+'+c+sTxt, el, '#FFD23F');
}
function xpNeed(){ return Math.round(100*Math.pow(1.18,S.level-1)); }

/* ---- undo: mirrors earn() exactly in reverse, for accidental taps. Recomputes
   the same PAY[kind]*mult() rather than storing the original amount — mult()
   only depends on streaks, which don't change between logging something and
   immediately undoing it, so this stays exact for the "I tapped by mistake"
   case this exists for. Does NOT claw back an already-awarded perfect-day
   bonus (see checkPerfectDay/S.perfectDone) — undoing one habit after a
   perfect day already paid out isn't "this never happened," just "changed my
   mind about today," so the bonus stands. */
function unearn(kind, el){
  const p=PAY[kind]; if(!p) return;
  const m=mult();
  const c=Math.round(p*m);
  S.cash=Math.max(0,S.cash-c); S.lifetime=Math.max(0,S.lifetime-c);
  if(kind==='workout'||kind==='perfect'){
    const st=kind==='perfect'?6:1; S.standing=Math.max(0,S.standing-st);
  }
  S.xp-=Math.round(p*m*0.8);
  while(S.xp<0){
    if(S.level<=1){ S.xp=0; break; }
    S.level--; S.xp+=xpNeed();
  }
  save();
  float('-'+c+'💵', el, '#E63946');
}

/* Logs a habit into the window that is open right now. Returns false when the
   tap isn't allowed (no window open, or this habit belongs to the other one) —
   the UI never offers those rows, but this is the actual gate. */
function toggleHabit(id, el){
  const h=HABITS.find(x=>x.id===id); if(!h) return false;
  if(!canLogNow(h)) return false;
  const win=currentWindow(), k=sessionDay(), key=habitKey(h,win);
  S.log[k]=S.log[k]||{};
  if(S.log[k][key]||S.log[k][h.id]===true){
    delete S.log[k][key];
    if(h.window==='both'&&S.log[k][h.id]===true) delete S.log[k][h.id];  // legacy row
    unearn('habit', el);
    return true;
  }
  S.log[k][key]=true;
  earn('habit', el);            // paid on the tap, never batched
  checkPerfectDay(el);
  save(); return true;
}
function markWorkout(el){
  const k=sessionDay();
  if(S.workout[k]==='done'){
    delete S.workout[k];
    unearn('workout', el);
    return true;
  }
  S.workout[k]='done'; earn('workout', el); save(); return true;
}

/* ---- counter-based dailies: NUTRITION and HYDRATION fill as meals/cups get
   logged, up to their own target/day, instead of being a single checkbox ---- */
const DIET_TARGET=2, WATER_TARGET=8;
function logCounter(field, target, payKind, el){
  const k=sessionDay();
  S[field][k]=S[field][k]||[];
  if(S[field][k].length>=target) return false;
  S[field][k].push(Date.now());
  earn(payKind, el); save(); return true;
}
function unlogCounter(field, payKind, el){
  const k=sessionDay();
  if(!S[field][k]||!S[field][k].length) return false;
  S[field][k].pop();
  unearn(payKind, el);
  return true;
}
function logMeal(el){ return logCounter('diet', DIET_TARGET, 'diet', el); }
function unlogMeal(el){ return unlogCounter('diet', 'diet', el); }
function logWater(el){
  const done=logCounter('water', WATER_TARGET, 'water', el);
  if(done) checkPerfectDay(el);
  return done;
}
function unlogWater(el){ return unlogCounter('water', 'water', el); }

/* ---- perfect day: every boolean habit AND today's water target, since water
   used to be one of HABITS itself before it became a counter. S.perfectDone
   guards against re-earning it by undoing and redoing a habit/cup on a day
   it already paid out — undo doesn't claw the bonus back (see unearn()), so
   without this a habit could be toggled off and back on for free cash. ---- */
function checkPerfectDay(el){
  const k=sessionDay(), lg=S.log[k]||{};
  if(S.perfectDone[k]) return;
  // a 'both' habit counts only when BOTH windows logged it — habitFullyDone()
  if(HABITS.every(h=>habitFullyDone(lg,h)) && (S.water[k]||[]).length>=WATER_TARGET){
    S.perfectDone[k]=true; save();
    setTimeout(()=>{ earn('perfect', el); toast('PERFECT DAY'); impact('PERFECT!'); },320);
  }
}

/* ---- security (real products / real prices) ---- */
const SEC={
  locks:{ic:'🔒',nm:'Locks & entry',t:[
    {nm:'Builder-grade knob lock',c:0,s:0,d:2},{nm:'Deadbolt + reinforced strike',c:180,s:0,d:6},
    {nm:'Smart lock, keyed alike',c:520,s:5,d:11},{nm:'High-security cylinders',c:1400,s:18,d:18},
    {nm:'Commercial-grade hardware',c:3600,s:45,d:26}]},
  lights:{ic:'💡',nm:'Exterior lighting',t:[
    {nm:'No exterior lighting',c:0,s:0,d:0},{nm:'Motion floodlight, one side',c:140,s:0,d:5},
    {nm:'Full perimeter motion lights',c:600,s:6,d:10},{nm:'Landscape + dusk-to-dawn',c:1900,s:20,d:16},
    {nm:'No dark corners',c:4200,s:50,d:22}]},
  cameras:{ic:'📹',nm:'Cameras',t:[
    {nm:'No cameras',c:0,s:0,d:0},{nm:'Video doorbell',c:220,s:0,d:6},
    {nm:'4-camera kit, cloud clips',c:900,s:8,d:13},{nm:'8-cam PoE + local NVR',c:3200,s:25,d:22},
    {nm:'AI detection, plate capture',c:9500,s:60,d:34}]},
  alarm:{ic:'🚨',nm:'Alarm system',t:[
    {nm:'No alarm',c:0,s:0,d:0},{nm:'DIY sensors, phone alerts',c:350,s:0,d:8},
    {nm:'Monitored 24/7, cell backup',c:1300,s:12,d:17},{nm:'Glass-break + interior motion',c:3400,s:30,d:27},
    {nm:'Verified response, direct line',c:8800,s:70,d:40}]},
  doors:{ic:'🚪',nm:'Doors & windows',t:[
    {nm:'Standard doors and glass',c:0,s:0,d:0},{nm:'Security film, ground floor',c:480,s:4,d:7},
    {nm:'Steel-core exterior doors',c:2600,s:22,d:15},{nm:'Impact-rated glass',c:7500,s:48,d:25},
    {nm:'Hardened core, safe room',c:22000,s:95,d:38}]},
  dog:{ic:'🐕',nm:'Dog',t:[
    {nm:'No dog',c:0,s:0,d:0},{nm:'Family dog, barks at strangers',c:900,s:5,d:9},
    {nm:'Obedience + alert trained',c:3500,s:20,d:18},{nm:'Protection trained (PPD 1)',c:12000,s:55,d:30},
    {nm:'Certified PPD + handler',c:38000,s:100,d:45}]},
  safe:{ic:'🔐',nm:'Safe',t:[
    {nm:'Cash box in a drawer',c:0,s:0,d:0,p:.05},{nm:'Bolted fireproof safe',c:450,s:3,d:3,p:.25},
    {nm:'In-floor safe, concealed',c:2200,s:18,d:5,p:.50},{nm:'TL-15 rated safe',c:6800,s:42,d:7,p:.72},
    {nm:'Walk-in vault room',c:26000,s:88,d:10,p:.90}]},
  detail:{ic:'🕴️',nm:'Security detail',t:[
    {nm:'No detail',c:0,s:0,d:0},{nm:'Off-duty patrol drive-bys',c:2400,s:35,d:14},
    {nm:'Part-time guard, evenings',c:11000,s:65,d:28},{nm:'Full-time residential officer',c:34000,s:105,d:46},
    {nm:'Close protection team, 24/7',c:95000,s:160,d:70}]}
};
function deter(){ let d=0; for(const k in SEC) d+=SEC[k].t[S.security[k]].d*(S.cond[k]/100); return Math.round(d); }
function safeProt(){ return SEC.safe.t[S.security.safe].p||.05; }
function buySec(k){
  const cur=S.security[k], nx=SEC[k].t[cur+1];
  if(!nx){ toast('Top tier'); return; }
  if(S.standing<nx.s){ toast('Need ⭐'+nx.s); return; }
  if(S.cash<nx.c){ toast('Need 💵'+nx.c.toLocaleString()); return; }
  S.cash-=nx.c; S.security[k]=cur+1; S.cond[k]=100;
  ev('Installed: '+nx.nm,'win'); save(); impact('INSTALLED'); renderSecurity(); rebuildProps();
}
function serviceAll(){
  let cost=0;
  for(const k in SEC) if(S.security[k]>0&&S.cond[k]<100) cost+=Math.round(SEC[k].t[S.security[k]].c*(100-S.cond[k])/100*.35);
  if(cost<=0){ toast('All in working order'); return; }
  if(S.cash<cost){ toast('Service would cost 💵'+cost.toLocaleString()); return; }
  S.cash-=cost; for(const k in SEC) S.cond[k]=100;
  ev('Repairs and servicing — 💵'+cost.toLocaleString(),'win'); save(); impact('SERVICED'); renderSecurity();
}

/* ---- vehicles ---- */
const VEH=[
  {nm:'1998 Civic, 210k miles',c:0,s:0,p:2,body:'sedan'},
  {nm:'2011 Camry, clean title',c:6500,s:4,p:5,body:'sedan'},
  {nm:'2016 4Runner',c:24000,s:20,p:12,body:'suv'},
  {nm:'2021 F-150 Lariat',c:46000,s:40,p:20,body:'truck'},
  {nm:'Restored Eclipse Spyder',c:38000,s:55,p:26,body:'coupe'},
  {nm:'Porsche 911 Carrera',c:118000,s:95,p:48,body:'coupe'},
  {nm:'Range Rover Autobiography',c:165000,s:130,p:62,body:'suv'}
];
const MODS={
  tires:[{nm:'Worn all-seasons',c:0},{nm:'New all-seasons',c:700},{nm:'Performance tires',c:1600},{nm:'Track-spec',c:3200}],
  wheels:[{nm:'Steel wheels',c:0},{nm:'Factory alloys',c:1200},{nm:'Aftermarket forged',c:4400}],
  tint:[{nm:'No tint',c:0},{nm:'Ceramic tint',c:450},{nm:'Full ceramic',c:1100}],
  tune:[{nm:'Stock',c:0},{nm:'Intake + exhaust',c:2100},{nm:'ECU tune',c:4800},{nm:'Built motor',c:16000}]
};
const PAINTS=['#6E7B8B','#E63946','#0A0D10','#E9E7DA','#00E5FF','#8FAE7A','#FFD23F','#7B2CBF'];
function buyVeh(){
  const nx=VEH[S.vehicle.tier+1]; if(!nx){ toast('Top of the ladder'); return; }
  if(S.standing<nx.s){ toast('Need ⭐'+nx.s); return; }
  if(S.cash<nx.c){ toast('Need 💵'+nx.c.toLocaleString()); return; }
  S.cash-=nx.c; S.vehicle.tier++; S.vehicle.mods={tires:0,wheels:0,tint:0,tune:0};
  ev('Bought: '+nx.nm,'win'); save(); impact('DELIVERED'); renderGarage(); rebuildCar();
}
function buyMod(cat,i){
  const m=MODS[cat][i];
  if(S.vehicle.mods[cat]>=i){ toast('Already installed'); return; }
  if(S.cash<m.c){ toast('Need 💵'+m.c.toLocaleString()); return; }
  S.cash-=m.c; S.vehicle.mods[cat]=i;
  ev('Installed: '+m.nm,'win'); save(); impact('INSTALLED'); renderGarage(); rebuildCar();
}

/* ---- visibility & incidents ---- */
function visibility(){ return Math.round(VEH[S.vehicle.tier].p + Math.floor(S.lifetime/900) + S.level*2 + S.standing*.4); }
const THREATS=[
  {max:25,nm:'Package theft',d:'Someone grabbing deliveries off porches.',p:12},
  {max:55,nm:'Vehicle break-in',d:'Car doors getting pulled at 3am.',p:26},
  {max:95,nm:'Attempted burglary',d:'Someone checking doors and windows.',p:45},
  {max:150,nm:'Targeted burglary',d:'Your place got cased.',p:78},
  {max:1e9,nm:'Organized crew',d:'A crew is working the neighborhood.',p:125}
];
function threat(){ const v=visibility(); return THREATS.find(t=>v<=t.max); }
const GAP=20*36e5, GRACE=36*36e5;
function checkIncident(){
  if(S.incident&&!S.incident.done){
    if(Date.now()>S.incident.deadline){
      const d=deter();
      if(d>=S.incident.p){ S.defended++; ev(S.incident.nm+' — systems handled it while you were out.','win'); }
      else{
        const lost=Math.floor(S.cash*Math.min(.45,(S.incident.p-d)/160)*(1-safeProt()));
        S.cash-=lost;
        for(const k in SEC) if(S.security[k]>0) S.cond[k]=Math.max(0,S.cond[k]-35);
        S.breached++;
        ev(S.incident.nm+' succeeded while you were away. Lost 💵'+lost.toLocaleString()+'.','loss');
      }
      S.incident.done=true; save();
    }
    return;
  }
  if(Date.now()-S.lastCheck<GAP) return;
  S.lastCheck=Date.now();
  if(S.cash<250){ save(); return; }
  const t=threat(), p=Math.round(t.p*(.8+Math.random()*.5)), d=deter();
  if(d>p*1.7){ ev(t.nm+' attempt — deterred before it started.','win'); save(); return; }
  S.incident={spawn:Date.now(),deadline:Date.now()+GRACE,p,nm:t.nm,d:t.d,done:false};
  ev(t.nm+' in progress.','loss'); save();
  if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
    try{ new Notification('🚨 SECURITY ALERT',{body:t.nm+' at your property.'}); }catch(e){}
  }
}


/* ===================== WINDOWS & THE CORE PATH =====================
   Two windows a day, morning and night. This is an appointment mechanic AND
   the cue that builds automaticity: repetition in a consistent context is
   what makes a behaviour automatic, more than the size of the reward.

   ONLY EARNING IS GATED. Nothing here should ever stop the player walking,
   driving, browsing or buying — locking someone out of the world is
   punishment, not anticipation. canLogNow() gates logging and nothing else. */

/* Is `h` (a fractional local hour) inside window `w`? A window whose end is
   at or before its start wraps past midnight — the default night window
   (18:00 -> 03:00) does exactly this. */
function inWindow(w,h){
  return (w.start<w.end) ? (h>=w.start&&h<w.end) : (h>=w.start||h<w.end);
}
function hourOf(now){ now=now||new Date(); return now.getHours()+now.getMinutes()/60; }

/* THE DAY BOUNDARY IS THE MORNING WINDOW'S START, NOT MIDNIGHT.
   Logging "in bed on time" at 1am is last night's habit, not today's, so
   anything before the morning window opens belongs to the previous day. One
   rule, and it makes a night window that wraps past midnight behave the way
   a person would expect. Everything that records or reads "what happened
   today" uses this rather than today(). */
function sessionDay(now){
  now=now||new Date();
  if(hourOf(now)<S.windows.am.start){
    const d=new Date(now); d.setDate(d.getDate()-1); return today(d);
  }
  return today(now);
}
/* The window open right now, or null during the lull between them. If the two
   are configured to overlap, morning wins — deterministic beats clever. */
function currentWindow(now){
  const h=hourOf(now);
  if(inWindow(S.windows.am,h)) return 'am';
  if(inWindow(S.windows.pm,h)) return 'pm';
  return null;
}
function windowHabits(win){
  return HABITS.filter(x=>x.window===win||x.window==='both');
}
/* A 'both' habit is stored once per window ('teeth:am'), single-window habits
   keep their bare id — so saves written before windows existed still read
   correctly, and habitDone() treats a legacy `true` as satisfying either. */
function habitKey(h,win){ return h.window==='both' ? h.id+':'+win : h.id; }
function habitDone(lg,h,win){ return lg[h.id]===true || !!lg[habitKey(h,win)]; }
function habitFullyDone(lg,h){
  if(lg[h.id]===true) return true;                                   // legacy
  return h.window==='both' ? (!!lg[h.id+':am']&&!!lg[h.id+':pm']) : !!lg[h.id];
}
/* The gate. False means the tap does nothing: either no window is open, or
   this habit belongs to the other one. There is deliberately no retroactive
   logging — a window that has closed is closed, which is what makes the
   appointment real. */
function canLogNow(h,now){
  const win=currentWindow(now);
  if(!win) return false;
  return h.window===win||h.window==='both';
}
function windowProgress(win,now){
  const lg=S.log[sessionDay(now)]||{}, hs=windowHabits(win);
  const done=hs.filter(h=>habitDone(lg,h,win)).length;
  return {done, total:hs.length, complete:done>=hs.length};
}
/* Paid once per window per day, the first time every habit in it is logged.
   The second attempt is rejected by the S.claims record, and an attempt
   outside the window is rejected before that. */
function claimWindow(win,el,now){
  if(currentWindow(now)!==win) return false;
  const k=sessionDay(now);
  S.claims[k]=S.claims[k]||{};
  if(S.claims[k][win]) return false;
  if(!windowProgress(win,now).complete) return false;
  S.claims[k][win]=Date.now();
  earn('window',el); save();
  return true;
}
function windowClaimed(win,now){
  const c=S.claims[sessionDay(now)];
  return !!(c&&c[win]);
}
/* When does the next window open, in ms? Used by the close card so the loop
   has a visible ending and a stated next appointment. */
function nextWindowIn(now){
  now=now||new Date();
  const h=hourOf(now);
  let best=null;
  ['am','pm'].forEach(k=>{
    const w=S.windows[k];
    let d=w.start-h; if(d<=0) d+=24;
    if(best===null||d<best.hours) best={key:k,hours:d};
  });
  return best;
}
function fmtIn(hours){
  const m=Math.round(hours*60);
  return m<60 ? m+'m' : Math.floor(m/60)+'h '+(m%60?(m%60)+'m':'');
}
function anchorFor(h){ return S.anchors[h.id]||h.anchor||''; }
function setAnchor(id,text){
  const t=(text||'').trim().slice(0,60);
  if(t) S.anchors[id]=t; else delete S.anchors[id];
  save();
}
