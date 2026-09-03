/* ===================== DATA LAYER ===================== */
const KEY='sprout_v2';
function today(d){ return (d||new Date()).toISOString().slice(0,10); }
function fmt(k){ return new Date(k+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

const HABITS=[
  {id:'water',  nm:'Drink enough water',  vital:'HYDRATION', ic:'💧', col:'#4FC3F7'},
  {id:'teeth',  nm:'Brush teeth',         vital:'HYGIENE',   ic:'🦷', col:'#B0BEC5'},
  {id:'floss',  nm:'Floss',               vital:'HYGIENE',   ic:'🦷', col:'#B0BEC5'},
  {id:'gym',    nm:'Gym',                 vital:'STRENGTH',  ic:'💪', col:'#EF5350'},
  {id:'stretch',nm:'Stretch',             vital:'MOBILITY',  ic:'🧘', col:'#AB47BC'},
  {id:'journal',nm:'Journal 5m',          vital:'MIND',      ic:'🧠', col:'#7E57C2'},
  {id:'bed',    nm:'Bed on time',         vital:'REST',      ic:'😴', col:'#5C6BC0'},
  {id:'wake',   nm:'Wake up on time',     vital:'REST',      ic:'😴', col:'#5C6BC0'},
  {id:'wstart', nm:'Start work on time',  vital:'DISCIPLINE',ic:'⚙️', col:'#FFA726'},
  {id:'wend',   nm:'End work on time',    vital:'DISCIPLINE',ic:'⚙️', col:'#FFA726'}
];
const VITALS=[
  {k:'HYDRATION', ic:'💧', col:'#4FC3F7', src:['water']},
  {k:'NUTRITION', ic:'🍎', col:'#66BB6A', src:'diet'},
  {k:'REST',      ic:'😴', col:'#5C6BC0', src:['bed','wake']},
  {k:'STRENGTH',  ic:'💪', col:'#EF5350', src:'workout'},
  {k:'HYGIENE',   ic:'🦷', col:'#B0BEC5', src:['teeth','floss']},
  {k:'MIND',      ic:'🧠', col:'#7E57C2', src:['journal']},
  {k:'MOBILITY',  ic:'🧘', col:'#AB47BC', src:['stretch']},
  {k:'DISCIPLINE',ic:'⚙️', col:'#FFA726', src:['wstart','wend']}
];

function blank(){
  return {
    log:{}, workout:{}, diet:{},
    cash:0, standing:0, lifetime:0, level:1, xp:0,
    security:{locks:0,lights:0,cameras:0,alarm:0,doors:0,dog:0,safe:0,detail:0},
    cond:{locks:100,lights:100,cameras:100,alarm:100,doors:100,dog:100,safe:100,detail:100},
    vehicle:{tier:0,mods:{tires:0,wheels:0,tint:0,tune:0},paint:'#6E7B8B'},
    person:{skin:'#C9884F',outfit:'#2C3242',wardrobe:0,grooming:0},
    incident:null, lastCheck:Date.now(), defended:0, breached:0, events:[]
  };
}
function migrate(obj){ const b=blank(); for(const k in b) if(obj[k]===undefined) obj[k]=b[k]; return obj; }
let S;
try{ S=migrate(JSON.parse(localStorage.getItem(KEY))||blank()); }catch(e){ S=blank(); }
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){ showErr('Save failed: '+e.message); } }

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
    const all=HABITS.every(h=>lg[h.id]);
    if(all){ miss=0; st++; }
    else if(k!==today()){ miss++; if(miss>=2) break; }
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
      else if(k!==today()){ miss++; if(miss>=2) break; }
    }
    d.setDate(d.getDate()-1);
  }
  return st;
}
function mult(){ return Math.min(1+Math.max(habitStreak(),workoutStreak())*0.05, 2.0); }

/* ---- vitals ---- */
function vitalLevel(v){
  const k=today(), lg=S.log[k]||{};
  if(v.src==='diet') return Math.min(1,(S.diet[k]||[]).length/DIET_TARGET);
  if(v.src==='workout'){
    const sc=workoutFor(new Date());
    if(sc==='Off') return 1;
    return S.workout[k]==='done'?1:0;
  }
  const done=v.src.filter(id=>lg[id]).length;
  return done/v.src.length;
}

/* ---- earning ---- */
const PAY={habit:12,workout:35,diet:6,perfect:140};
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

function toggleHabit(id, el){
  const k=today();
  S.log[k]=S.log[k]||{};
  if(S.log[k][id]) return false;
  S.log[k][id]=true;
  earn('habit', el);
  if(HABITS.every(h=>S.log[k][h.id])){
    setTimeout(()=>{ earn('perfect', el); toast('PERFECT DAY'); impact('PERFECT!'); },320);
  }
  save(); return true;
}
function markWorkout(el){
  const k=today();
  if(S.workout[k]==='done') return false;
  S.workout[k]='done'; earn('workout', el); save(); return true;
}

/* ---- diet: NUTRITION vital fills as real meals get logged, up to DIET_TARGET/day ---- */
const DIET_TARGET=2;
function logMeal(el){
  const k=today();
  S.diet[k]=S.diet[k]||[];
  if(S.diet[k].length>=DIET_TARGET) return false;
  S.diet[k].push(Date.now());
  earn('diet', el); save(); return true;
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

