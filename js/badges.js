/* ===================== BADGE ART =====================
   Every achievement gets its OWN drawing — a different silhouette, a different
   interior motif and its own palette. This is deliberately not one frame
   recoloured with a number in it: a wall of identical discs is a spreadsheet,
   and the collection only reads as a collection when the shapes differ enough
   to tell apart at thumbnail size.

   Painted on a canvas at runtime, the same way detailMap() paints its textures
   in game.js, so the whole set costs nothing to download and there is no
   sprite sheet to keep in sync. Results are cached per (id,size) forever —
   they never change once drawn.

   No DOM beyond the canvas itself and no THREE, so this loads before ui.js on
   the core path without pulling the 3D engine in.

   ADDING ONE: give the achievement an `art` key in data.js and write a painter
   here under the same name. A missing painter falls back to plaque(), which is
   deliberately plain so an unfinished badge looks unfinished rather than
   quietly passing for a real one. */

const BADGE_CACHE={};

/* ---- small geometry helpers, shared by the painters below ---- */
function bgPoly(c,cx,cy,r,sides,rot){
  c.beginPath();
  for(let i=0;i<sides;i++){
    const a=(i/sides)*Math.PI*2+(rot||0);
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    i?c.lineTo(x,y):c.moveTo(x,y);
  }
  c.closePath();
}
function bgStar(c,cx,cy,rOut,rIn,points,rot){
  c.beginPath();
  for(let i=0;i<points*2;i++){
    const r=i%2?rIn:rOut, a=(i/(points*2))*Math.PI*2+(rot||0)-Math.PI/2;
    const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    i?c.lineTo(x,y):c.moveTo(x,y);
  }
  c.closePath();
}
function bgScallop(c,cx,cy,r,teeth){   // a crown-cap edge
  c.beginPath();
  const n=teeth*2;
  for(let i=0;i<n;i++){
    const rr=i%2?r:r*0.87, a=(i/n)*Math.PI*2;
    const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
    i?c.lineTo(x,y):c.moveTo(x,y);
  }
  c.closePath();
}
function bgShield(c,cx,cy,w,h){
  c.beginPath();
  c.moveTo(cx-w/2,cy-h/2);
  c.lineTo(cx+w/2,cy-h/2);
  c.lineTo(cx+w/2,cy+h*0.10);
  c.quadraticCurveTo(cx+w/2,cy+h/2, cx,cy+h/2);
  c.quadraticCurveTo(cx-w/2,cy+h/2, cx-w/2,cy+h*0.10);
  c.closePath();
}
function bgArch(c,cx,cy,w,h){
  c.beginPath();
  c.moveTo(cx-w/2,cy+h/2);
  c.lineTo(cx-w/2,cy-h*0.12);
  c.quadraticCurveTo(cx,cy-h/2-h*0.12, cx+w/2,cy-h*0.12);
  c.lineTo(cx+w/2,cy+h/2);
  c.closePath();
}
function bgRibbon(c,cx,cy,w,h){        // a banner with notched ends
  c.beginPath();
  c.moveTo(cx-w/2,cy-h/2);
  c.lineTo(cx+w/2,cy-h/2);
  c.lineTo(cx+w/2-h*0.32,cy);
  c.lineTo(cx+w/2,cy+h/2);
  c.lineTo(cx-w/2,cy+h/2);
  c.lineTo(cx-w/2+h*0.32,cy);
  c.closePath();
}
function bgTear(c,cx,cy,r){
  c.beginPath();
  c.moveTo(cx,cy-r*1.35);
  c.bezierCurveTo(cx+r*1.05,cy-r*0.25, cx+r*0.85,cy+r, cx,cy+r);
  c.bezierCurveTo(cx-r*0.85,cy+r, cx-r*1.05,cy-r*0.25, cx,cy-r*1.35);
  c.closePath();
}
function bgFill(c,fill,stroke,lw){
  if(fill){ c.fillStyle=fill; c.fill(); }
  if(stroke){ c.strokeStyle=stroke; c.lineWidth=lw||2; c.stroke(); }
}

/* ---- the painters. One per achievement, keyed by its `art` field ----
   Each is handed a context already sized to S x S with the origin at 0,0. */
const BADGE_ART={

  /* MADRUGADOR — dawn. A low sun over a hard horizon, rays cut by the line. */
  sunrise:function(c,S){
    const cx=S/2, cy=S*0.60;
    bgPoly(c,cx,S/2,S*0.44,3,-Math.PI/2); bgFill(c,'#F4C14E','#7A5A16',S*0.03);
    c.save(); c.beginPath(); bgPoly(c,cx,S/2,S*0.44,3,-Math.PI/2); c.clip();
    c.strokeStyle='#FFF0BE'; c.lineWidth=S*0.022;
    for(let i=0;i<7;i++){ const a=-Math.PI+ (i/6)*Math.PI;
      c.beginPath(); c.moveTo(cx,cy);
      c.lineTo(cx+Math.cos(a)*S*0.5, cy+Math.sin(a)*S*0.5); c.stroke(); }
    c.fillStyle='#E0733F'; c.beginPath(); c.arc(cx,cy,S*0.15,Math.PI,0); c.fill();
    c.fillStyle='#3A2A10'; c.fillRect(0,cy,S,S);
    c.restore();
  },

  /* COLMADERO — a crown cap, deliberately blank in the middle. Real colmados
     are covered in beer branding; copying a trademark would be impersonation,
     so this is the shape without anybody's mark on it. */
  bottlecap:function(c,S){
    const cx=S/2, cy=S/2;
    bgScallop(c,cx,cy,S*0.44,21); bgFill(c,'#2FA79B','#0F3A38',S*0.028);
    c.beginPath(); c.arc(cx,cy,S*0.30,0,7); bgFill(c,'#E9E7DA','#0F3A38',S*0.02);
    c.strokeStyle='#2FA79B'; c.lineWidth=S*0.035;
    for(let i=0;i<3;i++){ c.beginPath();
      c.moveTo(cx-S*0.18, cy-S*0.10+i*S*0.10);
      c.lineTo(cx+S*0.18, cy-S*0.10+i*S*0.10); c.stroke(); }
  },

  /* SIN FALTA — tally marks scratched into a slab. Five-bar gates, the way you
     actually count days on a wall. */
  tally:function(c,S){
    c.fillStyle='#5E594D'; c.fillRect(S*0.10,S*0.12,S*0.80,S*0.76);
    c.strokeStyle='#2A2620'; c.lineWidth=S*0.025;
    c.strokeRect(S*0.10,S*0.12,S*0.80,S*0.76);
    c.strokeStyle='#EDEAE0'; c.lineWidth=S*0.030; c.lineCap='round';
    for(let g=0;g<2;g++) for(let r=0;r<2;r++){
      const ox=S*0.20+g*S*0.36, oy=S*0.28+r*S*0.30;
      for(let i=0;i<4;i++){ c.beginPath();
        c.moveTo(ox+i*S*0.055, oy); c.lineTo(ox+i*S*0.055, oy+S*0.18); c.stroke(); }
      c.beginPath(); c.moveTo(ox-S*0.02,oy+S*0.16);
      c.lineTo(ox+S*0.19,oy+S*0.01); c.stroke();
    }
    c.lineCap='butt';
  },

  /* EL BLOQUE TE CONOCE — the block from above, streets crossing, your corner
     picked out. A map, not a medal. */
  blockplan:function(c,S){
    c.fillStyle='#C9B896'; c.fillRect(S*0.08,S*0.08,S*0.84,S*0.84);
    c.strokeStyle='#6E6A62'; c.lineWidth=S*0.02; c.strokeRect(S*0.08,S*0.08,S*0.84,S*0.84);
    c.fillStyle='#585D65';
    c.fillRect(S*0.08,S*0.44,S*0.84,S*0.14);        // C. Marginal
    c.fillRect(S*0.56,S*0.08,S*0.14,S*0.84);        // the avenue
    c.strokeStyle='#EDEAE0'; c.lineWidth=S*0.012; c.setLineDash([S*0.05,S*0.04]);
    c.beginPath(); c.moveTo(S*0.08,S*0.51); c.lineTo(S*0.92,S*0.51); c.stroke();
    c.beginPath(); c.moveTo(S*0.63,S*0.08); c.lineTo(S*0.63,S*0.92); c.stroke();
    c.setLineDash([]);
    [[0.16,0.16],[0.34,0.16],[0.16,0.66],[0.36,0.70],[0.76,0.18],[0.76,0.66]]
      .forEach(([x,y],i)=>{ c.fillStyle=i===2?'#E86A8A':'#9E9A90';
        c.fillRect(S*x,S*y,S*0.15,S*0.16);
        c.strokeStyle='#4A4740'; c.lineWidth=S*0.012;
        c.strokeRect(S*x,S*y,S*0.15,S*0.16); });
  },

  /* NADIE ENTRA — a riveted shield with a bar across it. */
  shield:function(c,S){
    bgShield(c,S/2,S*0.50,S*0.72,S*0.80);
    bgFill(c,'#2B3A44','#8FAE7A',S*0.035);
    c.save(); bgShield(c,S/2,S*0.50,S*0.72,S*0.80); c.clip();
    c.fillStyle='#8FAE7A'; c.fillRect(0,S*0.44,S,S*0.11);
    c.fillStyle='rgba(233,231,218,.14)'; c.fillRect(0,0,S,S*0.44);
    c.restore();
    c.fillStyle='#C8CBD0';
    [[0.28,0.24],[0.72,0.24],[0.28,0.68],[0.72,0.68]].forEach(([x,y])=>{
      c.beginPath(); c.arc(S*x,S*y,S*0.030,0,7); c.fill(); });
  },

  /* DIABLO CON DRIP — a chain, links overlapping, with a pendant. */
  chain:function(c,S){
    c.strokeStyle='#C9A227'; c.lineWidth=S*0.055;
    for(let i=0;i<7;i++){
      const t=i/6, a=Math.PI*0.15+t*Math.PI*0.70;
      const x=S/2-Math.cos(a)*S*0.34, y=S*0.30+Math.sin(a)*S*0.24;
      c.beginPath(); c.ellipse(x,y,S*0.062,S*0.045,a,0,7); c.stroke();
    }
    c.fillStyle='#FFD23F';
    bgPoly(c,S/2,S*0.70,S*0.15,4,Math.PI/4); bgFill(c,'#FFD23F','#8A6A10',S*0.022);
    c.fillStyle='#8A6A10'; c.beginPath(); c.arc(S/2,S*0.70,S*0.045,0,7); c.fill();
  },

  /* VUELTA LARGA — the avenue as a ribbon of road, end to end. */
  route:function(c,S){
    bgRibbon(c,S/2,S/2,S*0.86,S*0.52); bgFill(c,'#3B4048','#8A8F98',S*0.026);
    c.save(); bgRibbon(c,S/2,S/2,S*0.86,S*0.52); c.clip();
    c.strokeStyle='#FFD23F'; c.lineWidth=S*0.035; c.setLineDash([S*0.09,S*0.07]);
    c.beginPath(); c.moveTo(0,S/2); c.lineTo(S,S/2); c.stroke(); c.setLineDash([]);
    c.restore();
    c.fillStyle='#8FAE7A';
    [[0.14],[0.86]].forEach(([x])=>{ c.beginPath(); c.arc(S*x,S/2,S*0.055,0,7); c.fill(); });
  },

  /* PILOTO AUTOMÁTICO — a dial that has gone all the way round to locked. */
  dial:function(c,S){
    c.beginPath(); c.arc(S/2,S/2,S*0.42,0,7); bgFill(c,'#171D26','#3B4552',S*0.03);
    c.strokeStyle='#2C3542'; c.lineWidth=S*0.055;
    c.beginPath(); c.arc(S/2,S/2,S*0.30,0,Math.PI*2); c.stroke();
    c.strokeStyle='#8FAE7A'; c.lineCap='round';
    c.beginPath(); c.arc(S/2,S/2,S*0.30,-Math.PI/2,Math.PI*1.5); c.stroke();
    c.lineCap='butt';
    for(let i=0;i<12;i++){ const a=(i/12)*Math.PI*2;
      c.strokeStyle=i%3?'#3B4552':'#8FAE7A'; c.lineWidth=S*0.016;
      c.beginPath();
      c.moveTo(S/2+Math.cos(a)*S*0.36, S/2+Math.sin(a)*S*0.36);
      c.lineTo(S/2+Math.cos(a)*S*0.40, S/2+Math.sin(a)*S*0.40); c.stroke(); }
    c.fillStyle='#8FAE7A'; c.beginPath(); c.arc(S/2,S/2,S*0.085,0,7); c.fill();
  },

  /* SIN PENSARLO — a hand letting go of a wheel that keeps turning. The
     handoff badge: the grip is drawn OPEN and offset from the rim. */
  handoff:function(c,S){
    bgPoly(c,S/2,S/2,S*0.44,8,Math.PI/8); bgFill(c,'#141A22','#3B4552',S*0.03);
    c.strokeStyle='#8FAE7A'; c.lineWidth=S*0.05;
    c.beginPath(); c.arc(S*0.54,S*0.48,S*0.24,0,Math.PI*2); c.stroke();
    c.strokeStyle='#5E7A50'; c.lineWidth=S*0.03;
    [0.2,1.4,2.6,3.8,5.0].forEach(a=>{ c.beginPath();
      c.moveTo(S*0.54,S*0.48);
      c.lineTo(S*0.54+Math.cos(a)*S*0.22, S*0.48+Math.sin(a)*S*0.22); c.stroke(); });
    // the open hand, clear of the rim
    c.strokeStyle='#E8C48A'; c.lineWidth=S*0.045; c.lineCap='round';
    c.beginPath(); c.moveTo(S*0.20,S*0.70); c.lineTo(S*0.20,S*0.50); c.stroke();
    [[0.145,0.50,0.145,0.36],[0.20,0.48,0.21,0.32],[0.255,0.50,0.275,0.35]].forEach(v=>{
      c.lineWidth=S*0.032; c.beginPath();
      c.moveTo(S*v[0],S*v[1]); c.lineTo(S*v[2],S*v[3]); c.stroke(); });
    c.lineCap='butt';
  },

  /* EL RELEVO — a baton passing between two hands: one bar handed to the next,
     with the gap between them deliberately visible. */
  relay:function(c,S){
    bgShield(c,S/2,S/2,S*0.72,S*0.80); bgFill(c,'#1A1520','#4A3A55',S*0.03);
    c.save(); c.translate(S/2,S/2); c.rotate(-0.5);
    c.fillStyle='#B08CC8';
    c.fillRect(-S*0.30,-S*0.045,S*0.24,S*0.09);
    c.fillStyle='#E8C48A';
    c.fillRect(S*0.06,-S*0.045,S*0.24,S*0.09);
    c.strokeStyle='#6E5A80'; c.lineWidth=S*0.022; c.setLineDash([S*0.035,S*0.035]);
    c.beginPath(); c.moveTo(-S*0.05,0); c.lineTo(S*0.05,0); c.stroke();
    c.setLineDash([]);
    c.restore();
    c.fillStyle='#E8C48A'; c.beginPath(); c.arc(S*0.74,S*0.30,S*0.055,0,7); c.fill();
    c.fillStyle='#B08CC8'; c.beginPath(); c.arc(S*0.26,S*0.70,S*0.055,0,7); c.fill();
  },

  /* OTRA PERSONA — two profiles facing each other across a seam, the right one
     drawn a shade further along. Not a mirror: a comparison. */
  mirror:function(c,S){
    c.beginPath(); c.rect(S*0.10,S*0.10,S*0.80,S*0.80);
    bgFill(c,'#101820','#3B4552',S*0.03);
    const face=(x,dir,col)=>{
      c.fillStyle=col; c.beginPath();
      c.moveTo(x,S*0.76);
      c.lineTo(x,S*0.34);
      c.quadraticCurveTo(x+dir*S*0.10,S*0.20, x+dir*S*0.19,S*0.32);
      c.quadraticCurveTo(x+dir*S*0.24,S*0.42, x+dir*S*0.15,S*0.46);
      c.lineTo(x+dir*S*0.18,S*0.56);
      c.lineTo(x+dir*S*0.10,S*0.58);
      c.lineTo(x+dir*S*0.12,S*0.76);
      c.closePath(); c.fill();
    };
    face(S*0.44,-1,'#4E5A68');
    face(S*0.56, 1,'#8FAE7A');
    c.strokeStyle='#C9D4C0'; c.lineWidth=S*0.018;
    c.beginPath(); c.moveTo(S/2,S*0.13); c.lineTo(S/2,S*0.87); c.stroke();
  },

  /* CASA DE MAESTRO — a roofline crowned. A house silhouette whose ridge is a
     row of points, so it reads as a crown AND as a roof at thumbnail size. */
  crown:function(c,S){
    c.beginPath();
    c.moveTo(S*0.16,S*0.82); c.lineTo(S*0.16,S*0.50);
    c.lineTo(S*0.28,S*0.30); c.lineTo(S*0.38,S*0.48);
    c.lineTo(S*0.50,S*0.24); c.lineTo(S*0.62,S*0.48);
    c.lineTo(S*0.72,S*0.30); c.lineTo(S*0.84,S*0.50);
    c.lineTo(S*0.84,S*0.82); c.closePath();
    bgFill(c,'#C8A24E','#5E4718',S*0.03);
    c.fillStyle='#2A2110';
    c.fillRect(S*0.44,S*0.58,S*0.12,S*0.24);
    [[0.28,0.30],[0.50,0.24],[0.72,0.30]].forEach(v=>{
      c.fillStyle='#F2E3B0'; c.beginPath(); c.arc(S*v[0],S*v[1],S*0.045,0,7); c.fill(); });
    c.strokeStyle='#8A6E22'; c.lineWidth=S*0.02;
    c.beginPath(); c.moveTo(S*0.16,S*0.66); c.lineTo(S*0.84,S*0.66); c.stroke();
  },

  /* TERCER NIVEL — three rungs, the top one lit and well clear of the others. */
  ladder:function(c,S){
    bgPoly(c,S/2,S/2,S*0.44,3,-Math.PI/2); bgFill(c,'#181214','#5A3A3A',S*0.03);
    c.strokeStyle='#6E5A50'; c.lineWidth=S*0.045;
    c.beginPath(); c.moveTo(S*0.34,S*0.84); c.lineTo(S*0.38,S*0.30); c.stroke();
    c.beginPath(); c.moveTo(S*0.66,S*0.84); c.lineTo(S*0.62,S*0.30); c.stroke();
    [[0.76,'#6E5A50'],[0.60,'#9A8070'],[0.42,'#EF7A5A']].forEach(([y,col],i)=>{
      c.strokeStyle=col; c.lineWidth=S*(i===2?0.055:0.038);
      c.beginPath(); c.moveTo(S*0.33,S*y); c.lineTo(S*0.67,S*y); c.stroke(); });
    c.fillStyle='#EF7A5A'; c.beginPath(); c.arc(S/2,S*0.24,S*0.055,0,7); c.fill();
  },

  /* AGUA VA — a drop with the ring it lands in. */
  droplet:function(c,S){
    c.strokeStyle='#2E6B8A'; c.lineWidth=S*0.018;
    [0.30,0.40].forEach(r=>{ c.beginPath(); c.ellipse(S/2,S*0.74,S*r,S*r*0.30,0,0,7); c.stroke(); });
    bgTear(c,S/2,S*0.40,S*0.26); bgFill(c,'#4FC3F7','#12455E',S*0.028);
    c.fillStyle='rgba(255,255,255,.55)';
    c.beginPath(); c.ellipse(S*0.43,S*0.36,S*0.055,S*0.085,-0.4,0,7); c.fill();
  },

  /* TECHO PROPIO — corrugated zinc, the roof of every house here. */
  zinc:function(c,S){
    bgArch(c,S/2,S/2,S*0.80,S*0.78); bgFill(c,'#8D9299','#454A52',S*0.030);
    c.save(); bgArch(c,S/2,S/2,S*0.80,S*0.78); c.clip();
    for(let x=S*0.08;x<S*0.94;x+=S*0.075){
      c.fillStyle='rgba(255,255,255,.22)'; c.fillRect(x,0,S*0.030,S);
      c.fillStyle='rgba(0,0,0,.20)';       c.fillRect(x+S*0.038,0,S*0.026,S);
    }
    c.fillStyle='#2E6B8A'; c.fillRect(S*0.56,S*0.14,S*0.16,S*0.16);   // the tinaco
    c.restore();
  },

  /* CAPICÚA — a domino, read the same both ways. */
  domino:function(c,S){
    c.fillStyle='#EDEAE0';
    c.beginPath();
    if(c.roundRect) c.roundRect(S*0.22,S*0.07,S*0.56,S*0.86,S*0.07);
    else c.rect(S*0.22,S*0.07,S*0.56,S*0.86);
    bgFill(c,'#EDEAE0','#2A2620',S*0.028);
    c.strokeStyle='#2A2620'; c.lineWidth=S*0.022;
    c.beginPath(); c.moveTo(S*0.24,S/2); c.lineTo(S*0.76,S/2); c.stroke();
    c.fillStyle='#14161B';
    const pip=(x,y)=>{ c.beginPath(); c.arc(S*x,S*y,S*0.045,0,7); c.fill(); };
    [[0.36,0.18],[0.64,0.18],[0.36,0.32],[0.64,0.32],[0.50,0.25]].forEach(p=>pip(p[0],p[1]));
    [[0.36,0.68],[0.64,0.68],[0.36,0.82],[0.64,0.82],[0.50,0.75]].forEach(p=>pip(p[0],p[1]));
  },

  /* TODO CON REJAS — the ornamental bars on every window on the block. */
  rejas:function(c,S){
    c.fillStyle='#171D26'; c.fillRect(S*0.10,S*0.10,S*0.80,S*0.80);
    c.strokeStyle='#C8C2B2'; c.lineWidth=S*0.030;
    for(let i=0;i<4;i++){ const x=S*0.22+i*S*0.187;
      c.beginPath(); c.moveTo(x,S*0.12); c.lineTo(x,S*0.88); c.stroke(); }
    c.beginPath(); c.moveTo(S*0.12,S/2); c.lineTo(S*0.88,S/2); c.stroke();
    c.lineWidth=S*0.022;
    for(let i=0;i<3;i++){ const cx=S*0.313+i*S*0.187;
      bgPoly(c,cx,S/2,S*0.075,4,0); c.stroke(); }
    c.strokeStyle='#8A8069'; c.lineWidth=S*0.032;
    c.strokeRect(S*0.10,S*0.10,S*0.80,S*0.80);
  },

  /* MOTOR SANO — a gear with a piston through it. */
  gear:function(c,S){
    const cx=S/2, cy=S/2, teeth=10;
    c.beginPath();
    for(let i=0;i<teeth*2;i++){
      const r=i%2?S*0.44:S*0.34, a=(i/(teeth*2))*Math.PI*2;
      const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r; i?c.lineTo(x,y):c.moveTo(x,y);
    }
    c.closePath(); bgFill(c,'#6E7B8B','#2A3038',S*0.028);
    c.beginPath(); c.arc(cx,cy,S*0.19,0,7); bgFill(c,'#171D26','#2A3038',S*0.022);
    c.fillStyle='#E0733F'; c.fillRect(cx-S*0.045,cy-S*0.30,S*0.09,S*0.26);
    c.fillStyle='#C8CBD0'; c.fillRect(cx-S*0.10,cy-S*0.36,S*0.20,S*0.08);
  },

  /* CUARTOS — a stack of notes, no denomination on it. */
  notes:function(c,S){
    for(let i=2;i>=0;i--){
      const y=S*0.30+i*S*0.13;
      c.save(); c.translate(S/2,y); c.rotate((i-1)*0.06); c.translate(-S/2,-y);
      c.fillStyle=['#8FAE7A','#7FA06B','#6F925D'][i];
      c.fillRect(S*0.14,y-S*0.11,S*0.72,S*0.24);
      c.strokeStyle='#2E4A22'; c.lineWidth=S*0.018;
      c.strokeRect(S*0.14,y-S*0.11,S*0.72,S*0.24);
      c.beginPath(); c.arc(S/2,y,S*0.055,0,7); c.stroke();
      c.restore();
    }
  },

  /* TRASNOCHADO (hidden) — moon phases, the late one filled. */
  moon:function(c,S){
    c.fillStyle='#0F1620'; c.beginPath(); c.arc(S/2,S/2,S*0.44,0,7); c.fill();
    c.strokeStyle='#3B4552'; c.lineWidth=S*0.025; c.stroke();
    c.fillStyle='#EDEAE0';
    c.beginPath(); c.arc(S/2,S/2,S*0.27,0,7); c.fill();
    c.fillStyle='#0F1620';
    c.beginPath(); c.arc(S*0.60,S*0.44,S*0.24,0,7); c.fill();
    c.fillStyle='#FFD23F';
    [[0.22,0.24,0.020],[0.80,0.30,0.015],[0.74,0.76,0.018],[0.26,0.72,0.013]]
      .forEach(([x,y,r])=>{ c.beginPath(); c.arc(S*x,S*y,S*r,0,7); c.fill(); });
  },

  /* EL PREMIO GORDO (hidden) — a scratch ticket, partly scratched. */
  ticket:function(c,S){
    c.fillStyle='#E9E7DA';
    c.fillRect(S*0.08,S*0.24,S*0.84,S*0.52);
    c.strokeStyle='#8A6A10'; c.lineWidth=S*0.024;
    c.setLineDash([S*0.05,S*0.035]);
    c.strokeRect(S*0.08,S*0.24,S*0.84,S*0.52);
    c.setLineDash([]);
    c.fillStyle='#C9A227'; c.fillRect(S*0.16,S*0.34,S*0.68,S*0.32);
    c.fillStyle='#171D26';
    for(let i=0;i<3;i++){ bgStar(c,S*0.30+i*S*0.20,S*0.50,S*0.075,S*0.032,5,0); c.fill(); }
    c.fillStyle='rgba(201,162,39,.92)';
    c.beginPath(); c.moveTo(S*0.16,S*0.34);
    c.lineTo(S*0.52,S*0.34); c.lineTo(S*0.38,S*0.66); c.lineTo(S*0.16,S*0.66);
    c.closePath(); c.fill();
  },

  /* EL VECINO TE CUBRIÓ (hidden) — an umbrella held over a small square. */
  cover:function(c,S){
    c.fillStyle='#E86A8A';
    c.beginPath(); c.arc(S/2,S*0.52,S*0.38,Math.PI,0); c.closePath();
    bgFill(c,'#E86A8A','#7A2A3E',S*0.026);
    c.strokeStyle='#7A2A3E'; c.lineWidth=S*0.018;
    for(let i=1;i<4;i++){ const x=S*0.12+i*S*0.19;
      c.beginPath(); c.moveTo(x,S*0.52);
      c.quadraticCurveTo(x,S*0.30,S/2,S*0.14); c.stroke(); }
    c.strokeStyle='#9C7449'; c.lineWidth=S*0.030;
    c.beginPath(); c.moveTo(S/2,S*0.52); c.lineTo(S/2,S*0.82);
    c.quadraticCurveTo(S/2,S*0.90,S*0.40,S*0.88); c.stroke();
    c.fillStyle='#8FAE7A'; c.fillRect(S*0.60,S*0.66,S*0.16,S*0.16);
  },

  /* TERCO (hidden) — a cracked slab, mended with a bright seam. */
  mend:function(c,S){
    c.fillStyle='#5E594D'; c.fillRect(S*0.12,S*0.12,S*0.76,S*0.76);
    c.strokeStyle='#2A2620'; c.lineWidth=S*0.026;
    c.strokeRect(S*0.12,S*0.12,S*0.76,S*0.76);
    c.strokeStyle='#FFD23F'; c.lineWidth=S*0.045; c.lineJoin='round';
    c.beginPath();
    c.moveTo(S*0.30,S*0.12); c.lineTo(S*0.44,S*0.40); c.lineTo(S*0.32,S*0.56);
    c.lineTo(S*0.52,S*0.72); c.lineTo(S*0.46,S*0.88); c.stroke();
    c.strokeStyle='#8A6A10'; c.lineWidth=S*0.016;
    for(let i=0;i<4;i++){ const y=S*0.22+i*S*0.18;
      c.beginPath(); c.moveTo(S*0.28,y); c.lineTo(S*0.50,y+S*0.03); c.stroke(); }
    c.lineJoin='miter';
  },

  /* MANO DE PINTURA (hidden) — a swatch card, one chip still wet. */
  swatch:function(c,S){
    const cols=['#E86A8A','#33B3A6','#FFD23F','#6E7B8B'];
    cols.forEach((col,i)=>{
      c.save(); c.translate(S/2,S/2); c.rotate((i-1.5)*0.20); c.translate(-S/2,-S/2);
      c.fillStyle=col; c.fillRect(S*0.34,S*0.10,S*0.32,S*0.62);
      c.strokeStyle='rgba(0,0,0,.35)'; c.lineWidth=S*0.014;
      c.strokeRect(S*0.34,S*0.10,S*0.32,S*0.62);
      c.restore();
    });
    c.fillStyle='#33B3A6';
    c.beginPath(); c.ellipse(S*0.50,S*0.86,S*0.16,S*0.07,0,0,7); c.fill();
  },

  /* FANTASMA (hidden) — an empty frame. Nothing got in; nothing to show. */
  empty:function(c,S){
    c.strokeStyle='#8A8069'; c.lineWidth=S*0.05;
    c.strokeRect(S*0.16,S*0.16,S*0.68,S*0.68);
    c.strokeStyle='#4A4740'; c.lineWidth=S*0.018;
    c.strokeRect(S*0.22,S*0.22,S*0.56,S*0.56);
    c.setLineDash([S*0.045,S*0.045]);
    c.strokeStyle='#5E6873'; c.lineWidth=S*0.022;
    c.beginPath(); c.moveTo(S*0.26,S*0.26); c.lineTo(S*0.74,S*0.74); c.stroke();
    c.beginPath(); c.moveTo(S*0.74,S*0.26); c.lineTo(S*0.26,S*0.74); c.stroke();
    c.setLineDash([]);
  },

  /* fallback — deliberately plain, so a badge nobody drew looks undrawn */
  plaque:function(c,S){
    c.fillStyle='#2C3542'; c.fillRect(S*0.18,S*0.30,S*0.64,S*0.40);
    c.strokeStyle='#5E6873'; c.lineWidth=S*0.022;
    c.strokeRect(S*0.18,S*0.30,S*0.64,S*0.40);
  }
};

/* Returns a canvas for this achievement, cached. `state` is 'earned',
   'locked' or 'hidden' — a locked badge is the same drawing desaturated and
   dimmed rather than a different picture, so the shape you are missing is
   still legible in the gallery and you can see what you're working toward.
   A hidden one is a silhouette with a question mark: you know something is
   there, not what. */
function badgeCanvas(ach,size,state){
  const S=size||96;
  const key=ach.id+'@'+S+'@'+state;
  if(BADGE_CACHE[key]) return BADGE_CACHE[key];
  const cv=document.createElement('canvas');
  cv.width=S; cv.height=S;
  const c=cv.getContext('2d');

  if(state==='hidden'){
    bgPoly(c,S/2,S/2,S*0.42,6,Math.PI/6);
    bgFill(c,'#1B2029','#39424E',S*0.03);
    c.fillStyle='#4C5765';
    c.font='700 '+Math.round(S*0.42)+'px ui-monospace, monospace';
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText('?',S/2,S*0.54);
    BADGE_CACHE[key]=cv; return cv;
  }

  (BADGE_ART[ach.art]||BADGE_ART.plaque)(c,S);

  if(state!=='earned'){
    // grey it out IN PLACE rather than drawing a second "locked" picture, so
    // the silhouette you're missing stays readable
    const img=c.getImageData(0,0,S,S), d=img.data;
    for(let i=0;i<d.length;i+=4){
      const g=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)*0.55;
      d[i]=d[i+1]=d[i+2]=g; d[i+3]=Math.round(d[i+3]*0.55);
    }
    c.putImageData(img,0,0);
  }
  BADGE_CACHE[key]=cv;
  return cv;
}
/* An <img> is easier to drop into innerHTML than a live canvas, and the data
   URI is generated once per (id,size,state) because the canvas itself is cached. */
function badgeImg(ach,size,state){
  return badgeCanvas(ach,size,state).toDataURL('image/png');
}
