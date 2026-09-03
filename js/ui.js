/* ===================== UI GLUE ===================== */

/* ---- title ---- */
function openTitle(){
  checkIncident();
  const t=document.getElementById('title');
  const inc=S.incident&&!S.incident.done?S.incident:null;
  document.getElementById('tAlert').innerHTML=inc
    ?'<div class="t-alert">🚨 '+inc.nm.toUpperCase()+' IN PROGRESS — the property is dark. Go handle it.</div>':'';
  document.getElementById('tStats').innerHTML=
    '<div class="t-stat">💵 <b>'+S.cash.toLocaleString()+'</b></div>'+
    '<div class="t-stat">⭐ <b>'+S.standing+'</b></div>'+
    '<div class="t-stat">LV <b>'+S.level+'</b></div>'+
    '<div class="t-stat">STREAK <b>'+habitStreak()+'d</b></div>';
  t.classList.add('show');
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

function openLog(){
  const k=today(), lg=S.log[k]||{};
  let html='';
  HABITS.forEach(h=>{
    const done=!!lg[h.id];
    html+='<div class="row'+(done?' done':'')+'" onclick="onHabitTap(this,\''+h.id+'\')">'+
      '<div class="ck">'+(done?'✓':'')+'</div><div class="nm">'+h.ic+' '+h.nm+'</div></div>';
  });
  const sched=workoutFor(new Date()), wDone=S.workout[k]==='done';
  if(sched!=='Off'){
    html+='<div class="row'+(wDone?' done':'')+'" onclick="onWorkoutTap(this)">'+
      '<div class="ck">'+(wDone?'✓':'')+'</div><div class="nm">🏋️ '+sched+' day</div></div>';
  }
  const meals=(S.diet[k]||[]).length, mealsDone=meals>=DIET_TARGET;
  html+='<div class="row'+(mealsDone?' done':'')+'" '+(mealsDone?'':'onclick="onMealTap(this)"')+'>'+
    '<div class="ck">'+(mealsDone?'✓':meals)+'</div><div class="nm">🍎 Log a real meal ('+meals+'/'+DIET_TARGET+')</div></div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('LOG TODAY — 💵 '+S.cash.toLocaleString());
}
function onHabitTap(el,id){
  if(toggleHabit(id,el)){ renderVitals(); openLog(); }
}
function onWorkoutTap(el){
  if(markWorkout(el)){ renderVitals(); openLog(); }
}
function onMealTap(el){
  if(logMeal(el)){ renderVitals(); openLog(); }
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
  scene.remove(world.car);
  world.car=makeCar();
  world.car.position.set(9,0,-3.5); world.car.rotation.y=Math.PI/2;
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

/* ---- boot ---- */
window.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('boot').style.display='none';
  openTitle();
});

