/* ===================== UI GLUE ===================== */

/* ---- THE CORE PATH ---------------------------------------------------------
   The default screen. Open the app, see this window's habits, tap them, get
   paid instantly, done — with no 3D scene loaded. That path is the product;
   the world is optional depth hanging off it.

   Two rules to keep if you touch this:
     - Pay on the tap. Never batch a window's earnings into a "collect" step.
       The delay between action and reward is the thing being optimised, and
       immediate rewards are what make a behaviour automatic fastest.
     - Only EARNING is gated by the window. The world button is always live.
       Locking someone out of the world is punishment, not anticipation. */
function openTitle(){
  checkIncident();
  renderHome();
  document.getElementById('title').classList.add('show');
}

/* Rows respond to POINTER events, not onclick. Two reasons, both about the
   core path being fast on a phone: a pointerup fires immediately where a
   synthesised click can lag behind it, and it matches how the drive pedals
   already work. The tradeoff is that scrolling has to be told apart from
   tapping by hand — a click would have done that for free — so a pointer that
   travels more than a few pixels is a scroll and logs nothing. */
function bindTap(el,fn){
  let sx=0,sy=0,moved=false,last=0;
  const start=(x,y)=>{ sx=x; sy=y; moved=false; };
  const move =(x,y)=>{ if(Math.hypot(x-sx,y-sy)>10) moved=true; };   // a scroll, not a tap
  /* One finger press produces a DIFFERENT set of events depending on the
     engine — measured here: pointerdown, touchstart, touchend, mousedown,
     mouseup, with NO pointerup and NO click at all. Real mobile Safari and
     Chrome do send pointerup and click. So listen for every ending an engine
     might give and collapse them: the first one wins, the rest land inside the
     dedupe window and are ignored. Binding only 'click' (or only 'pointerup')
     silently does nothing on some engines, which is exactly the bug this
     replaced. */
  const fire=e=>{
    if(moved) return;
    const now=Date.now();
    if(now-last<350) return;
    last=now;
    if(e.cancelable) e.preventDefault();
    fn(el);
  };
  el.addEventListener('pointerdown',e=>start(e.clientX,e.clientY));
  el.addEventListener('pointermove',e=>move(e.clientX,e.clientY));
  el.addEventListener('mousedown',  e=>start(e.clientX,e.clientY));
  el.addEventListener('touchstart',e=>{const t=e.touches[0]; if(t) start(t.clientX,t.clientY);},{passive:true});
  el.addEventListener('touchmove', e=>{const t=e.touches[0]; if(t) move(t.clientX,t.clientY);},{passive:true});
  // every ending an engine might send; the dedupe window collapses them to one
  ['pointerup','touchend','mouseup','click'].forEach(t=>el.addEventListener(t,fire));
}

/* The 3D engine loads behind this screen, so ENTER can be tapped a beat before
   game.js has parsed. Say so rather than being a dead button. */
function enterWorldSafe(){
  if(typeof enterWorld==='function') return enterWorld();
  toast('STILL LOADING — ONE SECOND');
}
function chime(done,total){ if(typeof habitChime==='function') habitChime(done,total); }

function renderHome(){
  const win=currentWindow(), k=sessionDay(), lg=S.log[k]||{};
  const head=document.getElementById('homeHead');
  const streak=habitStreak(), m=mult();

  if(win){
    const pr=windowProgress(win);
    const w=S.windows[win];
    // how long this window has left, handling one that wraps past midnight
    let left=w.end-hourOf(); if(left<=0) left+=24;
    head.innerHTML=
      '<div class="hgreet">'+WINDOWS[win].greet+'</div>'+
      '<div class="hsub">'+WINDOWS[win].nm+' · closes in '+fmtIn(left)+'</div>'+
      '<div class="hbar"><i style="width:'+Math.round(pr.done/pr.total*100)+'%"></i></div>'+
      '<div class="hstats"><span>💵 '+S.cash.toLocaleString()+'</span>'+
        '<span>🔥 '+streak+'d · '+m.toFixed(2)+'x</span>'+
        '<span>'+pr.done+'/'+pr.total+'</span></div>';
  } else {
    const n=nextWindowIn();
    head.innerHTML=
      '<div class="hgreet lull">NOTHING DUE</div>'+
      '<div class="hsub">'+WINDOWS[n.key].nm.toLowerCase()+' opens in '+fmtIn(n.hours)+
        ' — the world is still open</div>'+
      '<div class="hstats"><span>💵 '+S.cash.toLocaleString()+'</span>'+
        '<span>🔥 '+streak+'d · '+m.toFixed(2)+'x</span></div>';
  }

  const inc=S.incident&&!S.incident.done?S.incident:null;
  document.getElementById('tAlert').innerHTML=inc
    ?'<div class="t-alert">🚨 '+inc.nm.toUpperCase()+' IN PROGRESS — go handle it.</div>':'';

  const list=document.getElementById('homeList');
  if(!win){ list.innerHTML='<div class="lullnote">Come back when the '+
      WINDOWS[nextWindowIn().key].nm.toLowerCase()+' window opens. Nothing to do until then — '+
      'that\'s the point.</div>'; return; }

  let html='';
  windowHabits(win).forEach(h=>{
    const done=habitDone(lg,h,win);
    html+='<div class="hrow2'+(done?' done':'')+'" data-habit="'+h.id+'">'+
      '<div class="ck">'+(done?'✓':'')+'</div>'+
      '<div class="nm">'+h.ic+' '+h.nm+
        (h.window==='both'?'<em class="tw">'+WINDOWS[win].nm.toLowerCase()+'</em>':'')+
        '<span class="cue" data-anchor="'+h.id+'">'+anchorFor(h)+' ✎</span></div></div>';
  });
  // counters — both windows accept them, they just fill toward one daily target
  const cups=(S.water[k]||[]).length, cupsDone=cups>=WATER_TARGET;
  html+='<div class="hrow2'+(cupsDone?' done':'')+'"'+(cupsDone?'':' data-act="water"')+'>'+
    '<div class="ck">'+(cupsDone?'✓':cups)+'</div><div class="nm">💧 Water'+
    '<span class="cue">'+cups+' of '+WATER_TARGET+' cups today</span></div></div>';
  const meals=(S.diet[k]||[]).length, mealsDone=meals>=DIET_TARGET;
  html+='<div class="hrow2'+(mealsDone?' done':'')+'"'+(mealsDone?'':' data-act="meal"')+'>'+
    '<div class="ck">'+(mealsDone?'✓':meals)+'</div><div class="nm">🍎 Real meal'+
    '<span class="cue">'+meals+' of '+DIET_TARGET+' today</span></div></div>';
  const sched=workoutFor(new Date()), wDone=S.workout[k]==='done';
  if(sched!=='Off'&&win==='am'){
    html+='<div class="hrow2'+(wDone?' done':'')+'" data-act="workout">'+
      '<div class="ck">'+(wDone?'✓':'')+'</div><div class="nm">🏋️ '+sched+' day'+
      '<span class="cue">today\'s split</span></div></div>';
  }
  list.innerHTML=html;
  // bind after render — the rows are rebuilt on every log, so listeners go on
  // the fresh nodes rather than surviving via delegation
  list.querySelectorAll('[data-habit]').forEach(el=>
    bindTap(el,()=>onHabitTap(el,el.getAttribute('data-habit'))));
  list.querySelectorAll('[data-act="water"]').forEach(el=>bindTap(el,()=>onWaterTap(el)));
  list.querySelectorAll('[data-act="meal"]').forEach(el=>bindTap(el,()=>onMealTap(el)));
  list.querySelectorAll('[data-act="workout"]').forEach(el=>bindTap(el,()=>onWorkoutTap(el)));
  list.querySelectorAll('[data-anchor]').forEach(el=>{
    // the cue sits inside a habit row, so its own tap must not log the habit
    ['pointerup','touchend','click'].forEach(t=>
      el.addEventListener(t,e=>e.stopPropagation()));
    bindTap(el,()=>editAnchor(el.getAttribute('data-anchor')));
  });
}

/* Every tap pays immediately (earn() inside toggleHabit) and gets its own
   feedback moment. The chime rises with how far into the window you are, so
   finishing one sounds like finishing rather than like the tap before it —
   deliberately varied so it never becomes wallpaper. */
function onHabitTap(el,id){
  const win=currentWindow();
  if(!toggleHabit(id,el)) return;
  const pr=windowProgress(win);
  chime(pr.done,pr.total);
  renderVitals(); renderHome();
  afterLog(win);
}
function onWorkoutTap(el){ if(markWorkout(el)){ chime(1,2); renderVitals(); refreshLogUI(); } }
function onMealTap(el){ if(logMeal(el)){ chime(1,3); renderVitals(); refreshLogUI(); } }
function onMealUndoTap(el){ if(unlogMeal(el)){ renderVitals(); refreshLogUI(); } }
function onWaterTap(el){ if(logWater(el)){ chime(1,4); renderVitals(); refreshLogUI(); afterLog(currentWindow()); } }
function onWaterUndoTap(el){ if(unlogWater(el)){ renderVitals(); refreshLogUI(); } }
// the same rows appear on the home screen and in the in-world LOG sheet
function refreshLogUI(){
  if(document.getElementById('title').classList.contains('show')) renderHome();
  if(document.getElementById('sheet').classList.contains('show')) openLog();
}
/* The window's ending. Pays the completion bonus once, then shows the card. */
function afterLog(win){
  if(!win||!windowProgress(win).complete) return;
  if(windowClaimed(win)) return;
  const before=S.cash;
  if(!claimWindow(win,document.getElementById('homeHead'))) return;
  renderHome();
  setTimeout(()=>showCloseCard(win,S.cash-before),420);
}

/* The loop must have an ending — this is it. What you earned, where the streak
   stands, and when the next appointment is. Then it tells you to go away. */
function showCloseCard(win,bonus){
  const n=nextWindowIn(), streak=habitStreak();
  const both=windowClaimed('am')&&windowClaimed('pm');
  document.getElementById('closeBody').innerHTML=
    '<div class="cc-t">'+WINDOWS[win].nm+' DONE</div>'+
    '<div class="cc-b">+'+bonus.toLocaleString()+'</div>'+
    '<div class="cc-s">window bonus · everything else already paid as you tapped</div>'+
    '<div class="cc-rows">'+
      '<div><b>'+streak+'d</b><span>streak</span></div>'+
      '<div><b>'+mult().toFixed(2)+'x</b><span>earning</span></div>'+
      '<div><b>'+S.cash.toLocaleString()+'</b><span>cash</span></div>'+
    '</div>'+
    (both?'<div class="cc-n">Both windows done today. Nothing else is due.</div>'
        :'<div class="cc-n">'+WINDOWS[n.key].nm.toLowerCase()+' opens in '+fmtIn(n.hours)+'</div>')+
    '<button class="bigbtn" onclick="closeCloseCard()">DONE</button>'+
    '<button class="bigbtn ghost" onclick="closeCloseCard();enterWorldSafe()">SPEND IT</button>';
  document.getElementById('closeCard').classList.add('show');
}
function closeCloseCard(){ document.getElementById('closeCard').classList.remove('show'); }

/* Cues, in the player's own words. Routine anchors ("when I get in bed") build
   automaticity better than clock times, so every habit carries one and this
   lets it be rewritten to match a real routine. */
function editAnchor(id){
  const h=HABITS.find(x=>x.id===id); if(!h) return;
  const cur=anchorFor(h);
  const next=prompt('When do you do "'+h.nm+'"?\nA real cue works better than a time — "right after I brush", "when I get in bed".',cur);
  if(next===null) return;
  setAnchor(id,next);
  refreshLogUI();
}

/* Window hours are configurable because the owner does not keep normal hours;
   a hardcoded window would make the whole loop unusable for them. */
function openWindowSettings(){
  const f=(h)=>{ const hh=Math.floor(h), mm=Math.round((h-hh)*60);
    return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'); };
  let html='<div class="note">When are you actually up? Logging only pays inside these hours — that is what makes the two sessions an appointment rather than a checklist you can fill in at any time.</div>';
  ['am','pm'].forEach(k=>{
    const w=S.windows[k];
    html+='<div class="wset"><div class="wnm">'+WINDOWS[k].nm+'</div>'+
      '<label>opens <input type="time" id="w_'+k+'_s" value="'+f(w.start)+'"></label>'+
      '<label>closes <input type="time" id="w_'+k+'_e" value="'+f(w.end)+'"></label></div>';
  });
  html+='<div class="note">A closing time earlier than its opening time wraps past midnight — that is how a night window reaching 3am works. The day itself rolls over when the morning window opens, so a habit logged at 1am counts for the night before.</div>';
  html+='<button class="gb" onclick="saveWindowSettings()">SAVE HOURS</button>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('YOUR HOURS');
}
function saveWindowSettings(){
  const g=id=>{ const v=document.getElementById(id).value;
    if(!v) return null; const [h,m]=v.split(':').map(Number); return h+m/60; };
  ['am','pm'].forEach(k=>{
    const st=g('w_'+k+'_s'), en=g('w_'+k+'_e');
    if(st!==null) S.windows[k].start=st;
    if(en!==null) S.windows[k].end=en;
  });
  save(); closeSheet(); renderHome(); toast('HOURS SAVED');
}

/* ---- vitals HUD (habits shown as survival meters) ---- */
function renderVitals(){
  const el=document.getElementById('vitals');
  if(!el) return;
  el.innerHTML='';
  VITALS.forEach(v=>{
    const lvl=vitalLevel(v);
    const pct=Math.round(lvl*100);
    const full=pct>=100, empty=pct<=0;
    const tile=document.createElement('div');
    tile.className='vtile'+(full?' full':empty?' empty':'');
    tile.title=v.k;
    tile.innerHTML='<div class="fill" style="height:'+pct+'%;background:'+v.col+'"></div><div class="ic">'+v.ic+'</div>';
    tile.onclick=openStats;
    el.appendChild(tile);
  });
  document.getElementById('cashChip').textContent='💵 '+S.cash.toLocaleString();
  document.getElementById('standChip').textContent='⭐ '+S.standing;
}
setInterval(()=>{ if(document.getElementById('game').style.display==='block'){ renderVitals(); checkIncident(); } },4000);

/* ---- sheet helpers ---- */
function openSheet(title){
  document.getElementById('sheetTitle').textContent=title;
  document.getElementById('sheet').classList.add('show');
}
function closeSheet(){ document.getElementById('sheet').classList.remove('show'); }

/* ---- quick log ---- */
function openStats(){
  let html='';
  VITALS.forEach(v=>{
    const pct=Math.round(vitalLevel(v)*100);
    html+='<div class="row"><div style="font-size:20px;width:28px;text-align:center">'+v.ic+'</div>'+
      '<div style="flex:1"><div class="nm" style="font-size:13.5px">'+v.k+'</div>'+
      '<div style="height:7px;background:rgba(0,0,0,.5);border:1px solid var(--line);border-radius:1px;overflow:hidden;margin-top:5px;">'+
      '<div style="height:100%;width:'+pct+'%;background:'+v.col+'"></div></div></div>'+
      '<div class="sub" style="min-width:32px;text-align:right">'+pct+'%</div></div>';
  });
  html+='<div class="note">Tap LOG to check off today\'s habits and workout — these fill as you go.</div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('YOUR VITALS');
}

/* The in-world LOG sheet. Same window rules as the home screen — it has to be,
   or the world would be a way around the gate. Habits outside the open window
   are shown greyed so you can see what's coming, but they don't accept a tap. */
function openLog(){
  const win=currentWindow(), k=sessionDay(), lg=S.log[k]||{};
  let html='';
  if(!win){
    const n=nextWindowIn();
    html+='<div class="note">No window open. '+WINDOWS[n.key].nm.toLowerCase()+
      ' opens in '+fmtIn(n.hours)+' — logging pays then. Nothing else is locked.</div>';
  }
  const cups=(S.water[k]||[]).length, cupsDone=cups>=WATER_TARGET;
  html+='<div class="row'+(cupsDone?' done':'')+'" '+(cupsDone||!win?'':'onclick="onWaterTap(this)"')+'>'+
    '<div class="ck">'+(cupsDone?'✓':cups)+'</div><div class="nm">💧 Drink a cup of water ('+cups+'/'+WATER_TARGET+')</div>'+
    (cups>0?'<button class="gb sm" onclick="event.stopPropagation();onWaterUndoTap(this)">UNDO</button>':'')+
    '</div>';
  HABITS.forEach(h=>{
    const mine=win&&(h.window===win||h.window==='both');
    const done=win?habitDone(lg,h,win):habitFullyDone(lg,h);
    html+='<div class="row'+(done?' done':'')+(mine?'':' locked')+'" '+
      (mine&&!done?'onclick="onHabitTap(this,\''+h.id+'\')"':'')+'>'+
      '<div class="ck">'+(done?'✓':'')+'</div><div class="nm">'+h.ic+' '+h.nm+
      (mine?'':' <em class="tw">'+(h.window==='both'?'both':WINDOWS[h.window].nm.toLowerCase())+'</em>')+
      '</div></div>';
  });
  const sched=workoutFor(new Date()), wDone=S.workout[k]==='done';
  if(sched!=='Off'){
    html+='<div class="row'+(wDone?' done':'')+(win?'':' locked')+'" '+(win?'onclick="onWorkoutTap(this)"':'')+'>'+
      '<div class="ck">'+(wDone?'✓':'')+'</div><div class="nm">🏋️ '+sched+' day</div></div>';
  }
  const meals=(S.diet[k]||[]).length, mealsDone=meals>=DIET_TARGET;
  html+='<div class="row'+(mealsDone?' done':'')+'" '+(mealsDone||!win?'':'onclick="onMealTap(this)"')+'>'+
    '<div class="ck">'+(mealsDone?'✓':meals)+'</div><div class="nm">🍎 Log a real meal ('+meals+'/'+DIET_TARGET+')</div>'+
    (meals>0?'<button class="gb sm" onclick="event.stopPropagation();onMealUndoTap(this)">UNDO</button>':'')+
    '</div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet((win?WINDOWS[win].nm:'BETWEEN WINDOWS')+' — 💵 '+S.cash.toLocaleString());
}

/* ---- security sheet ---- */
function openSecurity(){
  let html='<div class="stats">'+
    '<div class="st"><div class="n">'+deter()+'</div><div class="l">DETERRENCE</div></div>'+
    '<div class="st"><div class="n">'+S.defended+'W '+S.breached+'L</div><div class="l">RECORD</div></div></div>';
  const t=threat();
  html+='<div class="note" style="margin-bottom:12px">Visibility <b style="color:var(--yel)">'+visibility()+
    '</b> · threat class <b style="color:var(--red)">'+t.nm+'</b><br>'+t.d+'</div>';
  for(const k in SEC){
    const sys=SEC[k], cur=S.security[k], t2=sys.t[cur], nx=sys.t[cur+1];
    const locked=nx&&S.standing<nx.s, afford=nx&&S.cash>=nx.c&&!locked;
    html+='<div class="row"><div style="font-size:20px;width:28px;text-align:center">'+sys.ic+'</div>'+
      '<div style="flex:1"><div class="nm" style="font-size:13.5px">'+t2.nm+'</div>'+
      '<div class="sub">'+sys.nm+' · deters '+t2.d+' · tier '+cur+'/'+(sys.t.length-1)+'</div>'+
      '<div class="pips">'+sys.t.map((_,i)=>'<div class="pip '+(i<=cur&&cur>0?'on':'')+'"></div>').join('')+'</div></div>'+
      (nx?'<button class="gb sm" '+(!afford?'disabled':'')+' onclick="buySec(\''+k+'\')">'+
        (locked?'⭐'+nx.s:'💵'+(nx.c>=1000?Math.round(nx.c/1000)+'k':nx.c))+'</button>':'<span class="sub">MAX</span>')+
      '</div>';
  }
  html+='<button class="gb" style="margin-top:12px" onclick="serviceAll()">SERVICE SYSTEMS</button>';
  html+='<div style="margin-top:16px"><div class="sub" style="margin-bottom:6px">RECENT</div><div id="secLog"></div></div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('HOME SECURITY');
  renderEventLog();
}
function renderSecurity(){ if(document.getElementById('sheetTitle').textContent==='HOME SECURITY') openSecurity(); }
function renderEventLog(){
  const el=document.getElementById('secLog'); if(!el) return;
  el.innerHTML=S.events.length
    ? S.events.slice(0,10).map(l=>'<div class="logline '+l.cls+'">'+fmt(today(new Date(l.t)))+' — '+l.text+'</div>').join('')
    : '<div class="empty">Nothing yet.</div>';
}

/* ---- car interaction: drive it, or go straight to the garage/upgrade sheet ---- */
function openCarMenu(){
  const html=
    '<button class="gb" style="width:100%;margin-bottom:10px" onclick="closeSheet();enterDriveMode()">🚗 DRIVE</button>'+
    '<button class="gb" style="width:100%" onclick="openGarage()">🔧 VIEW GARAGE</button>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('YOUR VEHICLE');
}

/* ---- garage sheet ---- */
function openGarage(){
  const v=VEH[S.vehicle.tier], nx=VEH[S.vehicle.tier+1];
  let html='<div class="stats">'+
    '<div class="st"><div class="n" style="font-size:12px">'+v.nm.split(',')[0]+'</div><div class="l">CURRENT</div></div>'+
    '<div class="st"><div class="n">'+v.p+'</div><div class="l">VISIBILITY</div></div></div>';
  html+='<div class="sub" style="margin-bottom:6px">PAINT</div><div style="margin-bottom:14px">'+
    PAINTS.map(c=>'<div class="sw '+(S.vehicle.paint===c?'sel':'')+'" style="background:'+c+'" onclick="setPaint(\''+c+'\')"></div>').join('')+
    '</div>';
  html+='<div class="sub" style="margin-bottom:6px">UPGRADE</div>';
  html+=nx?('<div class="row"><div style="font-size:20px;width:28px;text-align:center">🔑</div>'+
    '<div style="flex:1"><div class="nm" style="font-size:13.5px">'+nx.nm+'</div>'+
    '<div class="sub">💵'+nx.c.toLocaleString()+' · ⭐'+nx.s+' standing</div></div>'+
    '<button class="gb sm" '+((S.cash<nx.c||S.standing<nx.s)?'disabled':'')+' onclick="buyVeh()">BUY</button></div>')
    :'<div class="empty">Top of the ladder.</div>';
  html+='<div class="sub" style="margin:14px 0 4px">MODS</div>';
  for(const cat in MODS){
    html+='<div class="sub" style="margin:8px 0 2px;text-transform:uppercase">'+cat+'</div>';
    MODS[cat].forEach((m,i)=>{
      const owned=S.vehicle.mods[cat]>=i;
      html+='<div class="row"><div style="font-size:18px;width:28px;text-align:center">'+(owned?'✅':'🔧')+'</div>'+
        '<div style="flex:1"><div class="nm" style="font-size:13.5px">'+m.nm+'</div>'+
        '<div class="sub">'+(m.c?'💵'+m.c.toLocaleString():'stock')+'</div></div>'+
        (owned?'<span class="sub">ON</span>':'<button class="gb sm" '+(S.cash<m.c?'disabled':'')+' onclick="buyMod(\''+cat+'\','+i+')">BUY</button>')+
        '</div>';
    });
  }
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('YOUR VEHICLE');
}
function renderGarage(){ if(document.getElementById('sheetTitle').textContent==='YOUR VEHICLE') openGarage(); }
function setPaint(c){ S.vehicle.paint=c; save(); renderGarage(); rebuildCar(); }
function rebuildCar(){
  if(!world.car||!scene) return;
  // preserve wherever the car currently is (not necessarily CAR_SPOT anymore,
  // once it's drivable) rather than snapping it back to its parked position
  const pos=world.car.position.clone(), rot=world.car.rotation.y;
  scene.remove(world.car);
  world.car=modelCar(S.vehicle.paint)||makeCar();
  world.car.position.copy(pos); world.car.rotation.y=rot;
  scene.add(world.car);
}
function rebuildProps(){ /* security props rebuild on next world entry */ }

/* ---- backup/restore ---- */
function openBackup(){
  const html=
    '<div class="note">Your progress lives only in this browser\'s storage — nothing is saved to a server. '+
    'Clearing site data, switching browsers, or a new device wipes it with no way back. Download a backup now and again after big milestones.</div>'+
    '<button class="gb" style="margin-top:12px;width:100%" onclick="downloadBackup()">DOWNLOAD BACKUP</button>'+
    '<div class="sub" style="margin:16px 0 6px">RESTORE FROM BACKUP</div>'+
    '<textarea id="restoreInput" rows="4" placeholder="Paste a backup .json file\'s contents here"'+
    ' style="width:100%;background:var(--panel2);color:var(--paper);border:1px solid var(--line);'+
    'border-radius:2px;font-family:inherit;font-size:10.5px;padding:8px;resize:vertical"></textarea>'+
    '<button class="gb" style="margin-top:8px;width:100%" onclick="restoreFromInput()">RESTORE (OVERWRITES CURRENT SAVE)</button>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('BACKUP & RESTORE');
}
function downloadBackup(){
  const blob=new Blob([exportSave()],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='sprout-backup-'+today()+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Backup downloaded');
}
function restoreFromInput(){
  const text=document.getElementById('restoreInput').value.trim();
  if(!text){ toast('Paste a backup first'); return; }
  if(!confirm('This replaces everything in your current save. Continue?')) return;
  try{
    importSave(text);
    toast('Restored'); closeSheet(); renderVitals(); openTitle();
  }catch(e){ toast(e.message); }
}

/* ---- boot ----
   Runs the instant ui.js parses rather than waiting for DOMContentLoaded,
   because DOMContentLoaded also waits for Three.js and cannon.js and the core
   path must not. The markup this touches sits above the script tags, so it is
   already parsed; the retry is only for a future reorder that moves them. */
function bootHome(){
  const boot=document.getElementById('boot');
  if(!boot||!document.getElementById('homeList')){
    return window.addEventListener('DOMContentLoaded',bootHome,{once:true});
  }
  boot.style.display='none';
  openTitle();
}
bootHome();

