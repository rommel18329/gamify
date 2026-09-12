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
/* ENTER, with the one failure mode that can never resolve called out by name.
   The engine loads as ES modules (see CLAUDE.md, "The engine is ES modules
   now"), and Chrome refuses to fetch a module script from file:// outright —
   CORS, origin 'null'. Opened by double-clicking index.html the engine
   therefore never arrives, enterWorld never gets defined, and the old code
   here answered every tap with "STILL LOADING — ONE SECOND" forever. That is
   a lie: it is not still loading, it is never going to load, and the player
   has no way to tell those two apart. The core path (habits, LOG, STATS,
   BADGES, BACKUP) works perfectly over file:// and is untouched — only the
   3D world needs the server, so say exactly that instead. */
function enterWorldSafe(){
  if(typeof enterWorld==='function') return enterWorld();
  if(location.protocol==='file:'){
    toast('THE 3D WORLD NEEDS A SERVER — run: python3 -m http.server, then open localhost:8000. Habits work fine here.');
    return;
  }
  toast('STILL LOADING — ONE SECOND');
}
function chime(done,total){ if(typeof habitChime==='function') habitChime(done,total); }

/* What the streak is WORTH, not just how long it is — a number you can feel
   beats a day count. Framed as a consequence ("you earn X more a day") rather
   than as payment for compliance. */
function streakLine(){
  const w=streakWorth();
  if(w<=0) return '';
  return 'Consistency is worth 💵'+w.toLocaleString()+' more a day than starting over.';
}
function freezeLine(){
  if(!S.freezes) return '';
  return '<div class="frz">🧊 '+S.freezes+' neighbour'+(S.freezes>1?'s owe':' owes')+
    ' you one — a missed day gets covered</div>';
}
/* THE FLOOR, made visible. There is always a next thing and always a bar
   filling toward it. What is deliberately NOT shown is when it will land:
   that is uncertain by design, because a reward you can predict stops
   producing a response at all. */
/* ---- THE HEADLINE ---------------------------------------------------------
   This sits above the goal bar, i.e. above the money. That ordering is the
   whole argument of the app: what you are actually accumulating is behaviour
   that no longer needs the game, and the cash is scaffolding around it. It is
   shown HONESTLY — the real curve, the real day count, and the plateau it is
   measured against — rather than a flattering percentage. */
function autoLine(){
  const mc=masteryCount(), nx=nextToMaster();
  if(!nx) return '';
  const pct=Math.round(nx.a*100);
  const head=mc>0
    ? '<b>'+mc+'</b> habit'+(mc>1?'s':'')+' running without you'
    : 'Nothing runs without you yet';
  const sub=mc>0
    ? 'closest of the rest: '+nx.habit.nm.toLowerCase()
    : 'closest: '+nx.habit.nm.toLowerCase();
  return '<div class="auto" data-auto="1">'+
    '<div class="at">🧠 '+head+'</div>'+
    '<div class="abar"><i style="width:'+pct+'%"></i>'+
      '<u style="left:'+Math.round(AUTO_MASTER*100)+'%"></u></div>'+
    '<div class="as">'+sub+' · '+autoDays(nx.habit)+' of '+AUTO_PLATEAU_DAYS+
      ' days on the curve</div></div>';
}
/* Which tier of its line a habit is — 1 for an original, 2 for a successor. */
function habitTier(h){ let t=1,c=h; while(c&&c.after){ t++; c=habitById(c.after); } return t; }

/* ---- LO QUE YA ES TUYO ----------------------------------------------------
   The full picture: every habit still in the list against the curve, and the
   permanent shelf of the ones that came off it. The shelf is the point — it is
   the only screen in the game that only ever grows. */
function openAutomaticity(){
  const mc=masteryCount(), lines=linesComplete();
  let html='<div class="note">A habit is not a streak. This is the curve from '+
    'Lally 2010 — repetitions, not days, plateauing around '+AUTO_PLATEAU_DAYS+
    ' for most people (some in 18, some in 254). A missed day costs half a rep '+
    'and never resets it.</div>';

  html+='<div class="tkh wrap">🧠 STILL BUILDING<em>still a decision</em></div>';
  const live=activeHabits().slice().sort((a,b)=>automaticity(b)-automaticity(a));
  live.forEach(h=>{
    const f=habitFrame(h), pct=Math.round(f.a*100);
    html+='<div class="arow">'+
      '<div class="nm">'+h.ic+' '+h.nm+
        (h.after?'<em class="tw t2">tier '+habitTier(h)+'</em>':'')+
        '<span class="cue">'+f.note+'</span></div>'+
      '<div class="acurve"><i class="'+f.band+'" style="width:'+pct+'%"></i>'+
        '<u style="left:'+Math.round(AUTO_MASTER*100)+'%"></u></div>'+
      '<div class="apc"><b>'+pct+'%</b><span>'+autoDays(h)+'/'+AUTO_PLATEAU_DAYS+
        'd · 💵'+f.pay+'</span></div></div>';
  });

  html+='<div class="tkh wrap">🎖️ RUNS WITHOUT YOU<em>'+
    (mc?'with or without the game':'nothing here yet')+'</em></div>';
  if(!mc){
    html+='<div class="tkdone">The first one lands around day '+AUTO_PLATEAU_DAYS+
      '. When it does, that habit leaves the list for good and a harder version of '+
      'it takes its place.</div>';
  } else {
    masteredHabits().sort((a,b)=>habitTier(a)-habitTier(b)).forEach(h=>{
      html+='<div class="arow done"><div class="nm">'+h.ic+' '+h.nm+
        (h.after?'<em class="tw t2">tier '+habitTier(h)+'</em>':'')+
        '<span class="cue">since '+S.mastered[h.id]+'</span></div>'+
        '<div class="amast">✓</div></div>';
    });
  }

  /* What the fade paid for. Shown as a number, because "the game pays you less
     now" needs an answer standing next to it or it just reads as a takeaway. */
  html+='<div class="note tight">Every habit that comes off that list takes its '+
    'payout with it — you do not need paying for something you already do. '+
    'That money moves here instead: <b>'+masteryBonus().toFixed(2)+'x</b> on every '+
    'window bonus and every perfect day'+
    (mc?', worth about 💵'+Math.round((PAY.window*2+PAY.perfect)*(masteryBonus()-1))+
        ' a day you would not otherwise have':'')+
    '. And '+lines+' of 9 lines taken all the way to tier three.</div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('LO QUE YA ES TUYO');
}

/* ---- the handoff announcement ----
   data.js raises this the moment a habit crosses; the DOM stays here. It gets
   its own card rather than a toast because it is the biggest thing that
   happens in the app, and because it has to explain the trade in words: what
   is leaving, what is arriving, and what opened. */
/* #closeCard is a single element and BOTH the window-close card and this one
   want it. A mastery fires from inside toggleHabit(), i.e. before afterLog()
   runs, so without a queue the window card would silently overwrite the
   biggest moment in the app half a second after it appeared. */
let cardQueue=[];
function pushCard(render){
  cardQueue.push(render);
  if(cardQueue.length===1) cardQueue[0]();
}
function closeCloseCard(){
  document.getElementById('closeCard').classList.remove('show');
  cardQueue.shift();
  if(cardQueue.length) setTimeout(()=>cardQueue[0](),260);
}
onMastery=function(m){ pushCard(()=>renderMasteryCard(m)); };
function renderMasteryCard(m){
  const h=m.habit, nx=m.next;
  const el=document.getElementById('closeBody');
  if(!el) return;
  const opened=MAESTRIA.filter(it=>!maestriaLock(it)&&(S.maestria[it.f]||0)<it.lv);
  el.innerHTML=
    '<div class="cc-t">'+h.nm.toUpperCase()+' RUNS WITHOUT YOU</div>'+
    '<div class="cc-b small">'+Math.round(autoReps(h))+' reps</div>'+
    '<div class="cc-s">It comes off the list tomorrow. You will keep doing it; '+
      'you just do not need the game for it anymore.</div>'+
    (nx?'<div class="hand"><span>NEW TOMORROW</span><b>'+nx.ic+' '+nx.nm+'</b>'+
        '<em>Starts at zero on the curve — and pays full rate again.</em></div>'
       :'<div class="hand"><span>THAT LINE IS FINISHED</span><b>'+h.ic+' all three tiers</b>'+
        '<em>There is nothing harder to hand this one off to.</em></div>')+
    '<div class="cc-rows">'+
      '<div><b>'+masteryCount()+'</b><span>automatic</span></div>'+
      '<div><b>'+masteryBonus().toFixed(2)+'x</b><span>on bonuses</span></div>'+
      '<div><b>'+linesComplete()+'/9</b><span>lines done</span></div>'+
    '</div>'+
    (opened.length?'<div class="cc-n">MAESTRÍA opened: '+
       opened.map(o=>o.nm).join(' · ')+'</div>':'')+
    '<button class="bigbtn" onclick="closeCloseCard();renderHome()">GOOD</button>'+
    '<button class="bigbtn ghost" onclick="closeCloseCard();renderHome();openAutomaticity()">SEE THE REST</button>';
  document.getElementById('closeCard').classList.add('show');
}

function goalLine(){
  const g=nextGoal();
  if(!g) return '';
  const pct=Math.round(g.pct*100);
  return '<div class="goal" data-goal="1">'+
    '<div class="gt">'+TRACKS[g.track].ic+' '+g.entry.nm+
      (g.discounted?'<em class="deal">deal today</em>':'')+'</div>'+
    '<div class="gbar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="gs">💵 '+S.cash.toLocaleString()+' of '+g.price.toLocaleString()+
      ' · '+TRACKS[g.track].nm+'</div></div>';
}

function renderHome(){
  rollDay();      // settle yesterday before drawing today
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
        '<span>'+pr.done+'/'+pr.total+'</span></div>'+
        autoLine()+freezeLine()+goalLine();
  } else {
    const n=nextWindowIn();
    head.innerHTML=
      '<div class="hgreet lull">NOTHING DUE</div>'+
      '<div class="hsub">'+WINDOWS[n.key].nm.toLowerCase()+' opens in '+fmtIn(n.hours)+
        ' — the world is still open</div>'+
      '<div class="hstats"><span>💵 '+S.cash.toLocaleString()+'</span>'+
        '<span>🔥 '+streak+'d · '+m.toFixed(2)+'x</span></div>'+
        autoLine()+freezeLine()+goalLine();
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
    const done=habitDone(lg,h,win), f=habitFrame(h);
    /* THE AUTOMATICITY BAR IS ON THE ROW, not buried in a stats screen. It is
       the only number here that measures the thing the app is for, so it sits
       where you look every single day. The right-hand column switches with it:
       a cash figure while the habit is still new, the word for where it has
       got to once it is not. See habitFrame() in data.js. */
    html+='<div class="hrow2'+(done?' done':'')+'" data-habit="'+h.id+'">'+
      '<div class="ck">'+(done?'✓':'')+'</div>'+
      '<div class="nm">'+h.ic+' '+h.nm+
        (h.window==='both'?'<em class="tw">'+WINDOWS[win].nm.toLowerCase()+'</em>':'')+
        (h.after?'<em class="tw t2">tier '+habitTier(h)+'</em>':'')+
        '<span class="cue" data-anchor="'+h.id+'">'+anchorFor(h)+' ✎</span>'+
        '<span class="autow"><i class="autob '+f.band+'" style="width:'+
          Math.round(f.a*100)+'%"></i></span>'+
        '<span class="autol '+f.band+'">'+f.label+' · '+autoDays(h)+'/'+
          AUTO_PLATEAU_DAYS+' days</span>'+
      '</div>'+
      '<div class="hpay '+f.mode+'">'+(f.mode==='pay'
        ? '💵'+f.pay
        : '<span class="idw">'+Math.round(f.a*100)+'%</span><em>💵'+f.pay+'</em>')+
      '</div></div>';
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
  const gl=document.querySelector('#homeHead [data-goal]');
  if(gl) bindTap(gl,()=>openTracks());
  const al=document.querySelector('#homeHead [data-auto]');
  if(al) bindTap(al,()=>openAutomaticity());
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
  const gained=S.cash-before;
  setTimeout(()=>pushCard(()=>showCloseCard(win,gained)),420);
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
    (S.lastScratch?'<div class="scr'+(S.lastScratch.big?' big':'')+'">'+
       '🎟️ COLMADO SCRATCH — '+S.lastScratch.nm+
       '<b>+'+S.lastScratch.amount.toLocaleString()+'</b></div>':'')+
    '<div class="cc-rows">'+
      '<div><b>'+streak+'d</b><span>streak</span></div>'+
      '<div><b>'+mult().toFixed(2)+'x</b><span>earning</span></div>'+
      '<div><b>'+S.cash.toLocaleString()+'</b><span>cash</span></div>'+
    '</div>'+
    (streakLine()?'<div class="cc-n">'+streakLine()+'</div>':'')+
    (both?'<div class="cc-n">Both windows done today. Nothing else is due.</div>'
        :'<div class="cc-n">'+WINDOWS[n.key].nm.toLowerCase()+' opens in '+fmtIn(n.hours)+'</div>')+
    '<button class="bigbtn" onclick="closeCloseCard()">DONE</button>'+
    '<button class="bigbtn ghost" onclick="closeCloseCard();enterWorldSafe()">SPEND IT</button>';
  document.getElementById('closeCard').classList.add('show');
}
/* closeCloseCard() lives up by pushCard() — it has to advance the card queue,
   and a second plain definition down here would hoist over it and strand
   whatever was queued behind. */

/* The five tracks. Copy is deliberately informational — what a thing IS and
   what it changes about the place — never "do X to get Y". Controlling framing
   crowds out the motivation this whole app depends on; describing a
   consequence does not. */
function openTracks(only){
  const deal=todaysDeal();
  let html='<div class="note">'+(streakLine()||'Everything here is something you can point at afterwards.')+'</div>';
  const keys=only?[only]:Object.keys(TRACKS);
  keys.forEach(k=>{
    const es=trackEntries(k);
    html+='<div class="tkh">'+TRACKS[k].ic+' '+TRACKS[k].nm+
      '<em>'+TRACKS[k].blurb+'</em></div>';
    if(!es.length){ html+='<div class="tkdone">Nothing left on this one.</div>'; return; }
    es.slice(0,4).forEach(e=>{
      const p=priceOf(e), off=p<e.c, can=!e.lock&&S.cash>=p&&S.standing>=(e.s||0);
      /* A gated item renders WITH what it needs rather than being hidden. A
         thing you can see and cannot have yet is content; a thing you cannot
         see is nothing. */
      html+='<div class="row'+(can?'':' locked')+(e.lock?' gated':'')+
        '" data-buy="'+k+'|'+e.id+'">'+
        '<div class="nm">'+e.nm+'<span class="cue">'+
          (e.lock?'🔒 needs '+e.lock.txt+' — '+e.lock.have+' so far':e.d)+'</span></div>'+
        '<div class="pr'+(off?' off':'')+'">'+
          (off?'<s>'+e.c.toLocaleString()+'</s> ':'')+'💵'+p.toLocaleString()+
          (e.s?'<em> ⭐'+e.s+'</em>':'')+'</div></div>';
    });
    if(es.length>4) html+='<div class="tkmore">+'+(es.length-4)+' more on this track</div>';
  });
  document.getElementById('sheetBody').innerHTML=html;
  document.querySelectorAll('#sheetBody [data-buy]').forEach(el=>{
    bindTap(el,()=>{
      const [tk,id]=el.getAttribute('data-buy').split('|');
      const e=trackEntries(tk).find(x=>x.id===id);
      if(!e) return;
      if(e.buy()===true){ renderVitals(); refreshLogUI(); openTracks(only); }
    });
  });
  openSheet('WHAT YOU\'RE BUILDING — 💵 '+S.cash.toLocaleString());
}

/* ---- the badge gallery ----
   The collection has to be visible for the gaps to be, so a locked badge is
   the SAME drawing desaturated rather than a placeholder — you can see the
   shape you're missing. Hidden ones show as a marked silhouette: you know
   something is there, not what, which is the entire mechanic. */
function openBadges(){
  const cnt=achCounts();
  let html='<div class="note">'+cnt.got+' of '+cnt.total+
    ' — the greyed ones are still out there, and the marked ones you find out about '+
    'when they happen.</div><div class="bgrid">';
  const order=ACHIEVEMENTS.slice().sort((a,b)=>{
    const sa=achState(a), sb=achState(b);
    const rank=x=>x==='earned'?0:x==='locked'?1:2;
    return rank(sa)-rank(sb);
  });
  order.forEach(a=>{
    const st=achState(a);
    html+='<div class="bcard '+st+'">'+
      '<img alt="" src="'+badgeImg(a,104,st)+'">'+
      '<div class="bnm">'+(st==='hidden'?'???':a.nm)+'</div>'+
      '<div class="bd">'+(st==='hidden'?'Not telling.':a.d)+'</div>'+
      (st==='earned'?'<div class="bwhen">'+fmt(today(new Date(S.achieved[a.id])))+'</div>':'')+
    '</div>';
  });
  html+='</div>';
  document.getElementById('sheetBody').innerHTML=html;
  openSheet('BADGES — '+cnt.got+'/'+cnt.total);
}

/* ---- CHARACTER: real VRoid/VRM bodies -----------------------------------
   Reached from the title screen, same as WHAT YOU'RE BUILDING and BADGES,
   deliberately not from inside the 3D world — a selection here takes effect
   on the NEXT enterWorld(), so there is no live in-world swap to build or
   test; buildPlayer()/loadPlayerBody() in game.js do the actual loading.
   models.js is what defines loadVRM()/saveCustomVRM()/etc. — this sheet is
   pure DOM glue, the same division CLAUDE.md documents everywhere else in
   this file. */
/* ---- LIVE CHARACTER PREVIEW ------------------------------------------------
   A small, self-contained 3D view inside the CHARACTER sheet so the body
   sliders can be judged while they are dragged. This is the ONE place outside
   ENTER THE WORLD that creates a WebGL context, and it only does so when the
   player actually opens the sheet -- the title screen itself still renders
   with zero contexts, which is the whole point of the core path.

   Everything it needs (THREE, loadVRM, applyVRMBody) lives in the engine
   layer, so every entry point here guards on it being loaded and degrades to
   "no preview, sliders still work" rather than throwing. */
let charPrev=null;

function disposeCharPreview(){
  if(!charPrev) return;
  try{
    if(charPrev.raf) cancelAnimationFrame(charPrev.raf);
    if(charPrev.vrm&&typeof unregisterVRM==='function') unregisterVRM(charPrev.vrm);
    if(charPrev.renderer){ charPrev.renderer.dispose();
      /* forceContextLoss() is what actually hands the GPU context back; a bare
         dispose() leaves it allocated until GC gets round to it, and the limit
         is on LIVE contexts. */
      if(charPrev.renderer.forceContextLoss) charPrev.renderer.forceContextLoss(); }
  }catch(e){}
  charPrev=null;
}

function charPreviewReady(){
  return typeof THREE!=='undefined' && typeof loadVRM==='function'
      && typeof applyVRMBody==='function';
}

function startCharPreview(){
  const host=document.getElementById('charPrev');
  if(!host||!charPreviewReady()) return;
  disposeCharPreview();
  const w=host.clientWidth||300, h=260;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.setSize(w,h);
  if(THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.innerHTML=''; host.appendChild(renderer.domElement);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x2A313B);
  // the game's own lighting numbers, so the preview is not a different look
  scene.add(new THREE.AmbientLight(0xffffff,.42));
  const sun=new THREE.DirectionalLight(0xffffff,.46); sun.position.set(-4,8,6); scene.add(sun);
  const fill=new THREE.DirectionalLight(0xCFE0FF,.19); fill.position.set(4,4,-6); scene.add(fill);

  const cam=new THREE.PerspectiveCamera(32,w/h,.1,60);
  const rig=new THREE.Group(); scene.add(rig);
  charPrev={renderer,scene,cam,rig,vrm:null,raf:0,spin:0,host};

  const ch=(S.person&&S.person.character)||{type:'default'};
  const onReady=(vrm)=>{
    if(!charPrev) return;                 // sheet closed while it loaded
    charPrev.vrm=vrm; rig.add(vrm.scene);
    refreshCharPreview();
    /* The idle pose is BORROWED from the Quaternius rig (see "Borrowing a walk
       cycle"), and those GLBs are only fetched by loadAssets() on the way into
       the world -- on the title screen they have never been downloaded, so
       makeVRMRetargeter() found no source rig and returned null, and the
       preview rendered a dead T-pose. Pull them in now; the sheet is already
       loading a far larger .vrm, so this costs nothing extra in practice. */
    const pose=()=>{
      if(!charPrev||charPrev.vrm!==vrm) return;
      if(!vrm.userData.retarget&&typeof makeVRMRetargeter==='function')
        vrm.userData.retarget=makeVRMRetargeter(vrm);
      const rt=vrm.userData.retarget;
      if(rt) rt.setAnim('idle');
      /* Settle the spring bones before this is judged: hair starts at its rest
         offsets and springs into place over several frames, so without this
         the first impression is a head of hair standing on end. */
      for(let i=0;i<30;i++){ if(rt) rt.update(1/60); vrm.update(1/60); }
    };
    if(typeof loadAssets==='function') loadAssets(pose); else pose();
  };
  if(ch.type==='preset'&&typeof VRM_PRESETS!=='undefined'&&VRM_PRESETS[ch.id]){
    loadVRM(ASSET_BASE+'characters/vrm/'+VRM_PRESETS[ch.id].file,onReady,()=>{});
  } else if(ch.type==='custom'&&typeof loadCustomVRM==='function'){
    loadCustomVRM(onReady,()=>{});
  } else {
    host.innerHTML='<div class="tkdone">Pick a VRM character below to see it here.</div>';
    disposeCharPreview(); return;
  }

  const tick=()=>{
    if(!charPrev) return;
    charPrev.raf=requestAnimationFrame(tick);
    charPrev.spin+=.006;
    rig.rotation.y=charPrev.spin;
    if(charPrev.vrm){
      /* Drive the retargeter, THEN vrm.update(). Calling update() alone leaves
         the character in its bind pose -- a dead T-pose with the arms straight
         out, which is exactly how the preview first rendered. The retargeter
         is what puts it in the idle stance, and vrm.update() is what copies
         that onto the skinned mesh. */
      const rt=charPrev.vrm.userData&&charPrev.vrm.userData.retarget;
      if(rt){ rt.setAnim('idle'); rt.update(1/60); }
      charPrev.vrm.update(1/60);
      const box=new THREE.Box3().setFromObject(charPrev.vrm.scene);
      const hh=Math.max(box.max.y-box.min.y,.001);
      // pulled back enough that a wide Shoulders setting still fits the frame
      cam.position.set(0,hh*.52,hh*1.85);
      cam.lookAt(0,hh*.49,0);
    }
    renderer.render(scene,cam);
  };
  tick();
}

/* Re-applies body + fit to the preview model in place. Cheap enough to call
   on every slider input because it only writes bone scales and material
   colours -- nothing is reloaded. */
function refreshCharPreview(){
  if(!charPrev||!charPrev.vrm) return;
  const ch=(S.person&&S.person.character)||{};
  charPrev.vrm.scene.scale.setScalar(1);
  const box=new THREE.Box3().setFromObject(charPrev.vrm.scene);
  const hh=Math.max(box.max.y-box.min.y,.001);
  charPrev.vrm.scene.scale.setScalar(4.0/hh);      // same normalisation loadVRM does
  applyVRMBody(charPrev.vrm, ch.body);
  if(typeof applyVRMFit==='function') applyVRMFit(charPrev.vrm, ch.fit);
}

/* The dials. Ranges are deliberately narrow: these scale a real skeleton, and
   past roughly +/-25% the mesh starts to show the stretch rather than reading
   as a different build. `head` is tighter still (+/-8%) because the hair is a
   separate mesh on spring bones and a big head scale makes it spike. */
const BODY_DIALS=[
  {k:'height',   nm:'Height',        min:.86,max:1.16,step:.01},
  {k:'build',    nm:'Build',         min:.82,max:1.30,step:.01},
  {k:'shoulders',nm:'Shoulders',     min:.85,max:1.28,step:.01},
  {k:'legs',     nm:'Leg length',    min:.86,max:1.22,step:.01},
  {k:'arms',     nm:'Arm length',    min:.88,max:1.18,step:.01},
  {k:'head',     nm:'Head size',     min:.92,max:1.08,step:.01}
];

function openCharacter(){
  /* Reachable from the title screen, which is deliberately usable before the
     3D engine (and models.js, where VRM_PRESETS/loadVRM live) has finished
     loading — same race enterWorldSafe() exists to cover for ENTER itself.
     Only the PRESET rows need models.js; DEFAULT and the upload option are
     pure S.person.character bookkeeping and work with data.js/ui.js alone,
     so this degrades to "presets not shown yet" rather than a hard block. */
  const presetsReady=typeof VRM_PRESETS!=='undefined';
  const ch=(S.person&&S.person.character)||{type:'default'};
  const is=(type,id)=>ch.type===type&&(type!=='preset'||ch.id===id);
  let html='<div id="charPrev" class="charprev"></div>';
  html+='<div class="note">A real VRoid character, not a recolour — make your own free '+
    'at <b>vroid.com</b> (VRoid Studio) and upload the .vrm it exports, or start with the '+
    'bundled sample. Takes effect the next time you ENTER THE WORLD.</div>';
  html+='<div class="tkh">CHARACTER</div>';
  html+='<div class="row'+(ch.type==='default'?' done':'')+'" data-char="default">'+
    '<div class="ck">'+(ch.type==='default'?'✓':'')+'</div>'+
    '<div class="nm">Default<span class="cue">The original hand-built look</span></div></div>';
  if(presetsReady){
    Object.keys(VRM_PRESETS).forEach(id=>{
      const p=VRM_PRESETS[id], sel=is('preset',id);
      html+='<div class="row'+(sel?' done':'')+'" data-char="preset:'+id+'">'+
        '<div class="ck">'+(sel?'✓':'')+'</div>'+
        '<div class="nm">'+p.name+'<span class="cue">'+p.credit+'</span></div></div>';
    });
  } else {
    html+='<div class="tkdone">Presets are still loading — give it a second and reopen this.</div>';
  }
  const customSel=ch.type==='custom';
  html+='<div class="row'+(customSel?' done':'')+'" data-char="custom">'+
    '<div class="ck">'+(customSel?'✓':'')+'</div>'+
    '<div class="nm">Your own upload<span class="cue">'+
    (customSel?'Currently selected — tap to replace it':'Pick a .vrm file exported from VRoid Studio')+
    '</span></div></div>';
  html+='<input type="file" id="vrmFileInput" accept=".vrm" style="display:none">';

  /* BODY. Only meaningful on a VRM, because it reshapes a real skeleton —
     the default primitive character has no humanoid rig to scale. */
  if(ch.type==='preset'||ch.type==='custom'){
    const bd=Object.assign({height:1,build:1,shoulders:1,legs:1,arms:1,head:1},
                           (S.person.character&&S.person.character.body)||{});
    html+='<div class="tkh">BODY</div>';
    if(typeof applyVRMBody!=='function'){
      html+='<div class="tkdone">Still loading — reopen this in a second.</div>';
    } else {
      html+='<div class="note">Drag to reshape. Takes effect on the preview '+
        'immediately and in the world the next time you ENTER.</div>';
      BODY_DIALS.forEach(d=>{
        const v=bd[d.k];
        html+='<div class="dial"><label>'+d.nm+
          '<span id="dv_'+d.k+'">'+Math.round(v*100)+'%</span></label>'+
          '<input type="range" data-dial="'+d.k+'" min="'+d.min+'" max="'+d.max+
          '" step="'+d.step+'" value="'+v+'"></div>';
      });
      html+='<div class="row" id="bodyReset"><div class="ck"></div>'+
        '<div class="nm">Reset body<span class="cue">Back to the model as exported</span></div></div>';
    }
  }

  /* THE FIT. Only shown for a VRM body — the default GLB/primitive character
     has its own colour system (FITS/dripFit in models.js) and none of these
     slots. Deliberately honest about the limit rather than pretending: with
     one .vrm you get colourways, because the CUT of a garment is baked into
     the mesh by VRoid and only a different export can change it. */
  if(ch.type==='preset'||ch.type==='custom'){
    const fit=(S.person.character&&S.person.character.fit)||{hide:{},tint:{}};
    const catReady=typeof DRIP_FITS!=='undefined';
    html+='<div class="tkh">THE FIT</div>';
    if(!catReady){
      html+='<div class="tkdone">Still loading — reopen this in a second.</div>';
    } else {
      html+='<div class="note">Colours apply the next time you ENTER. Different '+
        '<b>cuts</b> — oversized, franela, baggy — are separate .vrm exports, not '+
        'colours; add one and it shows up here as its own option.</div>';
      FIT_SLOTS.forEach(slot=>{
        const label={hair:'HAIR',top:'TOP',bottom:'BOTTOM',shoes:'SHOES'}[slot];
        html+='<div class="tkh">'+label+'</div>';
        (DRIP_FITS[slot]||[]).forEach(f=>{
          const lock=fitLock(f);
          const cur=(fit.tint&&fit.tint[slot]!==undefined?fit.tint[slot]:null);
          const sel=(f.tint==null&&cur===null)||(f.tint!=null&&cur===f.tint);
          const sw=f.tint==null?'':'<span style="display:inline-block;width:.85em;height:.85em;'+
            'border-radius:3px;vertical-align:-1px;margin-right:.45em;background:#'+
            f.tint.toString(16).padStart(6,'0')+'"></span>';
          const cue = lock.ok
            ? (f.tier==='earned'?'Earned — '+f.why
               : f.tier==='cash'?'Owned' : 'Comes with the character')
            : (f.tier==='earned'?'Locked — '+lock.why : 'Tap to buy — '+lock.why);
          html+='<div class="row'+(sel?' done':'')+(lock.ok?'':' lk')+'" '+
            'data-fit="'+slot+':'+f.id+'">'+
            '<div class="ck">'+(sel?'✓':'')+'</div>'+
            '<div class="nm">'+sw+f.name+'<span class="cue">'+cue+'</span></div></div>';
        });
      });
    }
  }
  document.getElementById('sheetBody').innerHTML=html;

  /* Sliders write S on every input and repaint the preview in place. `input`
     rather than `change` so the model moves under the finger, and save() is
     deliberately NOT called on every pixel of drag — only when the finger
     lifts — since save() serialises the whole of S to localStorage. */
  document.querySelectorAll('#sheetBody [data-dial]').forEach(el=>{
    const k=el.getAttribute('data-dial');
    const apply=()=>{
      const c=S.person.character;
      c.body=c.body||{};
      c.body[k]=parseFloat(el.value);
      const lbl=document.getElementById('dv_'+k);
      if(lbl) lbl.textContent=Math.round(parseFloat(el.value)*100)+'%';
      refreshCharPreview();
    };
    el.addEventListener('input',apply);
    ['change','pointerup','touchend'].forEach(ev=>el.addEventListener(ev,()=>{apply();save();}));
  });
  const rst=document.getElementById('bodyReset');
  if(rst) bindTap(rst,()=>{
    S.person.character.body={}; save(); openCharacter();
    toast('Body reset');
  });
  startCharPreview();

  document.querySelectorAll('#sheetBody [data-fit]').forEach(el=>{
    bindTap(el,()=>{
      const parts=el.getAttribute('data-fit').split(':');
      const slot=parts[0], f=fitEntry(slot,parts[1]);
      if(!f) return;
      let lock=fitLock(f);
      if(!lock.ok){
        if(f.tier!=='cash'){ toast('Not yet — '+f.why); return; }
        if(!buyFit(f)){ toast('Short by 💵'+(f.price-S.cash).toLocaleString()); return; }
        toast('Bought '+f.name);
      }
      const c=S.person.character;
      c.fit=c.fit||{hide:{},tint:{}}; c.fit.tint=c.fit.tint||{};
      if(f.tint==null) delete c.fit.tint[slot]; else c.fit.tint[slot]=f.tint;
      save(); openCharacter();   // rebuilds the sheet, which restarts the preview
    });
  });
  document.querySelectorAll('#sheetBody [data-char]').forEach(el=>{
    bindTap(el,()=>{
      const v=el.getAttribute('data-char');
      if(v==='custom'){ document.getElementById('vrmFileInput').click(); return; }
      const [type,id]=v.split(':');
      S.person.character=id?{type,id}:{type};
      save(); openCharacter();
      toast(type==='default'?'Back to the original look — applies next ENTER'
                             :'Character set — applies next ENTER');
    });
  });
  document.getElementById('vrmFileInput').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    if(!/\.vrm$/i.test(f.name)){ toast('That is not a .vrm file'); return; }
    if(typeof saveCustomVRM!=='function'){ toast('VRM support did not load'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      saveCustomVRM(reader.result, ()=>{
        S.person.character={type:'custom'}; save();
        toast('Uploaded — applies next ENTER'); openCharacter();
      }, err=>toast('Could not save: '+err.message));
    };
    reader.onerror=()=>toast('Could not read that file');
    reader.readAsArrayBuffer(f);
  });
  openSheet('CHARACTER');
}

/* An unlock shows the badge itself. A line of text would be a notification;
   the point of drawing twenty different things is that you see the new one. */
function showAchToast(a){
  const el=document.getElementById('achToast');
  if(!el) return;
  el.innerHTML='<img alt="" src="'+badgeImg(a,80,'earned')+'">'+
    '<div><b>'+a.nm+'</b><span>'+a.d+'</span></div>';
  el.classList.add('show');
  clearTimeout(el.__t);
  el.__t=setTimeout(()=>el.classList.remove('show'),5200);
  if(typeof chime==='function') chime(1,1);
}
// data.js raises unlocks through this hook rather than touching the DOM itself
onAchievement=function(a){
  // stagger, so two landing together don't overwrite each other
  const n=(showAchToast.__q=(showAchToast.__q||0)+1);
  setTimeout(()=>{ showAchToast(a); showAchToast.__q--; },(n-1)*5400);
};

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
function closeSheet(){
  document.getElementById('sheet').classList.remove('show');
  /* The CHARACTER sheet spins up its own WebGL context for the live preview.
     A browser only allows a handful of them alive at once and silently drops
     the OLDEST when you exceed it -- which would eventually take out the
     GAME's context, not the preview's. So the preview is always torn down
     when the sheet closes, never left parked. */
  if(typeof disposeCharPreview==='function') disposeCharPreview();
}

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
  homePlot().upgrades=homePlotUpgrades();
  world.car=modelCar(homePlot().upgrades.vehicle)||makeCar();
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

