import { useState, useEffect, useRef, useCallback } from "react";

// ─── 공유 전역 변수 (다른 게임 / 최종 성적표와 통합용) ────────────────────────
export let currentHouse = "Ravenclaw"; // 심리테스트 결과와 연동 예정
export let game4Score   = 0;           // 최종 정규화 점수 (0 ~ 100)
const MAX_NORMALIZED_SCORE = 3000;     // 이 게임의 100점 기준 원점수

// ─── constants ────────────────────────────────────────────────────────────────
const CW = 800, CH = 300, GY = 240;
const PX = 100, PW = 28, PH = 56;
const SLIDE_H = 23, SLIDE_FRAMES = 44;
const GRAV = 0.58, JUMP = -13.5;
const BASE_SPD = 5.2, RUSH_SPD = 11.0, RUSH_MS = 5000;
const MAX_LIVES = 3, INVINCIBLE_FRAMES = 90, HIT_FLASH_F = 14;
const BONUS_PER_OBS = 30;
const POLYJUICE_MS = 4500;          // Polyjuice potion duration
const POLYJUICE_SCALE = 2;          // player size multiplier
const POLYJUICE_BONUS = 15;         // score per obstacle smashed
const EAGLE_MS   = 3000;            // 래번클로 독수리 버프 지속시간 (ms)
const EAGLE_SPD  = 13.0;            // 독수리 모드 속도
const EAGLE_BONUS = 20;             // 독수리 모드 장애물 파괴 보너스

// Jump arc analysis (player is airborne ~47 frames, covers speed×47 pixels)
const JUMP_FRAMES = 47;

// ─── utils ────────────────────────────────────────────────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);

function rRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hit(a, b, p = 8) {
  return (
    a.x + p < b.x + b.w - p &&
    a.x + a.w - p > b.x + p &&
    a.y + p < b.y + b.h - p &&
    a.y + a.h - p > b.y + p
  );
}

// Returns the correct hitbox based on current player state
function getHitbox(p, poly) {
  if (poly) {
    // 2× scale centred on normal feet position
    return {
      x: p.x - PW / 2,
      y: GY - PH * POLYJUICE_SCALE,
      w: PW * POLYJUICE_SCALE,
      h: PH * POLYJUICE_SCALE,
    };
  }
  if (p.sliding && !p.isJumping) {
    return { x: p.x - 5, y: GY - SLIDE_H, w: PW + 14, h: SLIDE_H };
  }
  return { x: p.x, y: p.y, w: p.w, h: p.h };
}

// ─── obstacle passability helpers ─────────────────────────────────────────────
// Returns true if a bat at this y can be passed WITHOUT jumping (runs under)
function batPassableStanding(batY) {
  // player standing effective bottom: GY-PH+PH-9 = GY-9 = 231
  // bat effective top: batY+9
  // no collision if player effective top(193) >= bat effective bottom(batY+h-9)
  // player passes UNDER bat if bat bottom < player top: batY+42 < GY-PH = 184 → batY < 142
  return batY + 42 <= GY - PH + 9; // bat clears player head
}
// Returns true if a bat can be slid under
function batSlideable(batY) {
  // slide hitbox top effective: GY-SLIDE_H+5=222; bat effective bottom: batY+33
  return batY + 33 <= GY - SLIDE_H + 5; // bat clears slide hitbox
}

// ─── background ───────────────────────────────────────────────────────────────
function drawBg(ctx, rush, poly, eagle, stars) {
  ctx.fillStyle = eagle ? "#0e0c02" : poly ? "#061a08" : rush ? "#0c0320" : "#040210";
  ctx.fillRect(0, 0, CW, GY);
  ctx.fillStyle = "#030110";
  ctx.fillRect(0, GY, CW, CH - GY);

  stars.forEach(s => {
    s.t += 0.017;
    const a = 0.28 + Math.sin(s.t) * 0.24;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = eagle ? `rgba(255,220,100,${a})` :
                    poly  ? `rgba(100,255,140,${a})` :
                    rush  ? `rgba(175,140,255,${a})` :
                            `rgba(210,195,255,${a})`;
    ctx.fill();
  });

  if (rush || poly || eagle) {
    for (let i = 0; i < 18; i++) {
      const ly = Math.random() * GY, lx = Math.random() * CW, ll = rnd(25, 130);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + ll, ly);
      ctx.strokeStyle = eagle ? `rgba(255,190,30,${rnd(0.06,0.2)})` :
                        poly  ? `rgba(40,220,80,${rnd(0.05,0.18)})` :
                                `rgba(100,50,240,${rnd(0.05,0.18)})`;
      ctx.lineWidth = rnd(0.4, 1.5); ctx.stroke();
    }
  }

  ctx.fillStyle = "#ccc070"; ctx.beginPath(); ctx.arc(700, 44, 20, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = poly?"#061a08":rush?"#0c0320":"#040210";
  ctx.beginPath(); ctx.arc(709, 40, 18, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "#0a0815"; ctx.fillRect(508, GY-70, 186, 70);
  for (const [tx,th] of [[500,94],[554,81],[606,91],[655,105],[693,87]]) {
    ctx.fillStyle = "#0a0815"; ctx.fillRect(tx, GY-th, 24, th);
    for (let bx=tx; bx<tx+24; bx+=7) ctx.fillRect(bx, GY-th-6, 4, 6);
    ctx.fillStyle = eagle?"#2a2a08":rush?"#2a1a50":poly?"#0a2a10":"#14102a";
    ctx.fillRect(tx+8, GY-th+18, 8, 10);
  }
}

function drawGround(ctx, off) {
  ctx.fillStyle = "#181430"; ctx.fillRect(0, GY, CW, 3);
  ctx.fillStyle = "#080616"; ctx.fillRect(0, GY+3, CW, CH-GY-3);
  ctx.fillStyle = "#201e3e";
  for (let i=0; i<22; i++) {
    const gx = ((i*96 + off*1.6) % (CW+20)) - 10;
    ctx.fillRect(gx, GY+2, 4, 2); ctx.fillRect(gx+48, GY+5, 2, 2);
  }
}

// ─── wizard drawings ──────────────────────────────────────────────────────────
function wizNormal(ctx, f, jumping) {
  const fr = Math.floor(f/7)%4, sw = jumping?0:Math.sin(fr*Math.PI/2);
  ctx.fillStyle = "#3c2b60";
  ctx.beginPath();
  if (jumping) { ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.lineTo(10,-36);ctx.lineTo(-10,-36); }
  else { ctx.moveTo(-12-sw*3,0);ctx.lineTo(12+sw*3,0);ctx.lineTo(11,-36);ctx.lineTo(-11,-36); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2c1c50"; ctx.fillRect(-3, 0, 6, -35);
  if (!jumping) {
    const ls=sw*10, as=sw*11;
    ctx.strokeStyle="#160822"; ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(-5,-14+ls);ctx.stroke();
    ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(5,-14-ls);ctx.stroke();
    ctx.fillStyle="#080414";
    ctx.beginPath();ctx.ellipse(-5,-11+ls,5.5,2.5,0.1,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(5,-11-ls,5.5,2.5,-0.1,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#3c2b60";ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(-10,-26);ctx.lineTo(-20,-26+as);ctx.stroke();
    ctx.beginPath();ctx.moveTo(10,-26);ctx.lineTo(21,-26-as);ctx.stroke();
    ctx.strokeStyle="#7a5520";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(21,-26-as);ctx.lineTo(30,-34-as);ctx.stroke();
    ctx.fillStyle="rgba(255,230,100,0.6)";
    ctx.beginPath();ctx.arc(30,-34-as,2,0,Math.PI*2);ctx.fill();
  } else {
    ctx.strokeStyle="#3c2b60";ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(-10,-26);ctx.lineTo(-22,-40);ctx.stroke();
    ctx.beginPath();ctx.moveTo(10,-26);ctx.lineTo(22,-40);ctx.stroke();
  }
  ctx.fillStyle="#ddb888";ctx.beginPath();ctx.arc(0,-44,9,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#160d04";ctx.fillRect(-9,-52,18,9);
  ctx.strokeStyle="#c0392b";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-2,-51);ctx.lineTo(1.5,-46);ctx.lineTo(-1,-41);ctx.stroke();
  ctx.fillStyle="#12051c";
  ctx.beginPath();ctx.moveTo(-12,-51);ctx.lineTo(12,-51);ctx.lineTo(3,-70);ctx.closePath();ctx.fill();
  ctx.fillRect(-13,-53,26,3);
  ctx.strokeStyle="#9a7f60";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(-4,-44,3.5,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(4,-44,3.5,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-0.5,-44);ctx.lineTo(0.5,-44);ctx.stroke();
}

function wizSlide(ctx) {
  for (let i=0;i<5;i++) {
    ctx.beginPath();ctx.moveTo(-22,-4-i*3.5);ctx.lineTo(-40-i*5,-4-i*3.5);
    ctx.strokeStyle=`rgba(140,80,255,${0.45-i*0.07})`;ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.fillStyle="#3c2b60";
  ctx.beginPath();ctx.moveTo(-24,0);ctx.lineTo(20,0);ctx.lineTo(20,-20);ctx.lineTo(-24,-20);ctx.closePath();ctx.fill();
  ctx.fillStyle="#2c1c50";ctx.fillRect(-3,0,6,-19);
  ctx.strokeStyle="#160822";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(-24,-4);ctx.lineTo(-36,-2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-22,-14);ctx.lineTo(-32,-20);ctx.stroke();
  ctx.fillStyle="#080414";
  ctx.beginPath();ctx.ellipse(-35,-1,5,2.5,-0.15,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(-31,-19,4.5,2,-0.3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#ddb888";ctx.beginPath();ctx.arc(15,-11,9,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#160d04";ctx.fillRect(7,-19,17,9);
  ctx.strokeStyle="#c0392b";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(13,-18);ctx.lineTo(16.5,-13);ctx.lineTo(14,-9);ctx.stroke();
  ctx.save();ctx.translate(7,-18);ctx.rotate(0.55);
  ctx.fillStyle="#12051c";ctx.beginPath();ctx.moveTo(-10,-6);ctx.lineTo(10,-6);ctx.lineTo(1,-24);ctx.closePath();ctx.fill();ctx.fillRect(-11,-8,22,3);ctx.restore();
  ctx.strokeStyle="#9a7f60";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(11,-11,3.2,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(18.5,-11,3.2,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle="#3c2b60";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(20,-11);ctx.lineTo(30,-8);ctx.stroke();
  ctx.strokeStyle="#7a5520";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(30,-8);ctx.lineTo(40,-5);ctx.stroke();
  ctx.fillStyle="rgba(255,220,80,0.9)";ctx.beginPath();ctx.arc(40,-5,2.5,0,Math.PI*2);ctx.fill();
  for(let i=0;i<3;i++){ctx.globalAlpha=0.18-i*0.05;ctx.fillStyle="#a090d0";ctx.beginPath();ctx.arc(-10-i*14,0,5+i*2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
}

function broomCore(ctx) {
  ctx.strokeStyle="#7B3F10";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(-34,-22);ctx.lineTo(30,-22);ctx.stroke();
  ctx.strokeStyle="#5a2e08";ctx.lineWidth=2;
  for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(14+i*3,-23);ctx.lineTo(18+i*4,-10);ctx.stroke();}
  ctx.strokeStyle="#160822";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(-4,-22);ctx.lineTo(-3,-2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(4,-22);ctx.lineTo(5,-2);ctx.stroke();
  ctx.fillStyle="#5c28a8";
  ctx.beginPath();ctx.moveTo(-12,-22);ctx.lineTo(8,-22);ctx.lineTo(8,-40);ctx.lineTo(-12,-40);ctx.closePath();ctx.fill();
  ctx.fillStyle="#ddb888";ctx.beginPath();ctx.arc(-2,-48,9,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#160d04";ctx.fillRect(-10,-56,18,9);
  ctx.save();ctx.translate(-2,-50);ctx.rotate(-0.35);
  ctx.fillStyle="#12051c";ctx.beginPath();ctx.moveTo(-11,-8);ctx.lineTo(11,-8);ctx.lineTo(1,-26);ctx.closePath();ctx.fill();ctx.fillRect(-12,-10,24,3);ctx.restore();
  ctx.strokeStyle="#9a7f60";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(-6,-47,3.2,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(1,-48,3.2,0,Math.PI*2);ctx.stroke();
  const aura=ctx.createRadialGradient(0,-28,4,0,-28,44);
  aura.addColorStop(0,"rgba(110,50,230,0.2)");aura.addColorStop(1,"rgba(80,20,180,0)");
  ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(0,-28,50,28,0,0,Math.PI*2);ctx.fill();
}

function drawPlayer(ctx, p, rush, poly, eagle, f) {
  const cx = p.x + PW/2;
  const cy = p.y + PH; // feet

  ctx.save();
  ctx.translate(cx, cy);

  if (eagle) {
    // ── Ravenclaw Eagle mode: gold glow + eagle wings ────────────────────
    ctx.shadowBlur = 24; ctx.shadowColor = "#ffd700";
    // Speed trail (gold)
    for(let i=5;i>=1;i--){
      ctx.save();ctx.globalAlpha=0.04+i*0.02;ctx.translate(-i*16,0);
      wizNormal(ctx,f,p.isJumping);ctx.restore();
    }
    if(p.sliding&&!p.isJumping) wizSlide(ctx); else wizNormal(ctx,f,p.isJumping);
    ctx.shadowBlur=0;
    drawEagleWings(ctx, f);
    // Gold ground sparks
    const eagleAura=ctx.createRadialGradient(0,-PH*0.45,4,0,-PH*0.45,38);
    eagleAura.addColorStop(0,"rgba(255,200,30,0.18)"); eagleAura.addColorStop(1,"rgba(255,180,0,0)");
    ctx.fillStyle=eagleAura; ctx.beginPath(); ctx.ellipse(0,-PH*0.45,44,26,0,0,Math.PI*2); ctx.fill();
  } else if (poly) {
    // ── Polyjuice: scale 2× from feet, green glow ────────────────────────
    ctx.shadowBlur = 22; ctx.shadowColor = "#30ff70";
    ctx.scale(POLYJUICE_SCALE, POLYJUICE_SCALE);
    if (rush) {
      ctx.rotate(-0.25);
      for(let i=5;i>=1;i--){ctx.save();ctx.globalAlpha=0.05+i*0.025;ctx.translate(-i*13,0);broomCore(ctx);ctx.restore();}
      broomCore(ctx);
    } else if (p.sliding && !p.isJumping) {
      wizSlide(ctx);
    } else {
      wizNormal(ctx, f, p.isJumping);
    }
    ctx.shadowBlur = 0;
    const aura = ctx.createRadialGradient(0,-PH/2,4,0,-PH/2,36);
    aura.addColorStop(0,"rgba(40,220,80,0.25)"); aura.addColorStop(1,"rgba(40,220,80,0)");
    ctx.fillStyle = aura; ctx.beginPath(); ctx.ellipse(0,-PH/2,42,28,0,0,Math.PI*2); ctx.fill();
  } else if (rush) {
    ctx.rotate(-0.25);
    for(let i=5;i>=1;i--){ctx.save();ctx.globalAlpha=0.05+i*0.025;ctx.translate(-i*13,0);broomCore(ctx);ctx.restore();}
    broomCore(ctx);
  } else if (p.sliding && !p.isJumping) {
    wizSlide(ctx);
  } else {
    wizNormal(ctx, f, p.isJumping);
  }

  ctx.restore();
}

function drawDjRing(ctx, rings) {
  rings.forEach(r=>{
    ctx.save();ctx.globalAlpha=r.a;ctx.strokeStyle="#b080ff";ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(r.x,r.y,r.rad,0,Math.PI*2);ctx.stroke();ctx.restore();
  });
}

// ─── obstacles (bright, visible) ─────────────────────────────────────────────
function drawObs(ctx, obs, f) {
  obs.forEach(o => {
    ctx.save();
    if (o.type === "bat") {
      const cx=o.x+o.w/2, cy=o.y+o.h/2, fl=Math.sin(f*0.18)*0.7;
      ctx.translate(cx, cy);
      ctx.shadowBlur=14; ctx.shadowColor="#cc44ff";
      [-1,1].forEach(s=>{
        ctx.save();ctx.rotate(s*(Math.PI*0.08-fl*s));
        ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(s*14,-6,s*28,fl*8,s*22,10);ctx.bezierCurveTo(s*14,6,s*8,5,0,9);
        ctx.fillStyle="#7a22bb";ctx.fill();
        ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(s*14,-6,s*28,fl*8,s*22,10);
        ctx.strokeStyle="#cc88ff";ctx.lineWidth=1.2;ctx.stroke();
        ctx.restore();
      });
      ctx.fillStyle="#5a1488";ctx.beginPath();ctx.ellipse(0,0,7,10,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#cc88ff";ctx.lineWidth=1.2;ctx.stroke();
      [[-3,-8,-7,-17],[3,-8,7,-17]].forEach(([x1,y1,x2,y2])=>{
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x1>0?0.5:-0.5,y1);
        ctx.fillStyle="#7a22bb";ctx.fill();ctx.strokeStyle="#cc88ff";ctx.lineWidth=0.8;ctx.stroke();
      });
      ctx.shadowBlur=0;
      ctx.shadowBlur=8;ctx.shadowColor="#ff2020";ctx.fillStyle="#ff2020";
      ctx.beginPath();ctx.arc(-3,-1,2.8,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(3,-1,2.8,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle="#ffaaaa";
      ctx.beginPath();ctx.arc(-2.2,-1.6,1,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(3.8,-1.6,1,0,Math.PI*2);ctx.fill();
    } else if (o.type==="bludger") {
      ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate(f*0.045);
      ctx.shadowBlur=16;ctx.shadowColor="#4488ff";
      const sg=ctx.createRadialGradient(-5,-6,2,0,0,19);
      sg.addColorStop(0,"#c0cce8");sg.addColorStop(0.3,"#7090c8");sg.addColorStop(0.7,"#3050a0");sg.addColorStop(1,"#101838");
      ctx.beginPath();ctx.arc(0,0,19,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();
      ctx.strokeStyle="#88aaee";ctx.lineWidth=1.8;ctx.stroke();ctx.shadowBlur=0;
      ctx.strokeStyle="#101838";ctx.lineWidth=2.2;
      ctx.beginPath();ctx.ellipse(0,0,19,8,0,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,0,8,19,0,0,Math.PI*2);ctx.stroke();
      const hl=ctx.createRadialGradient(-6,-7,1,-5,-6,9);
      hl.addColorStop(0,"rgba(255,255,255,0.7)");hl.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle=hl;ctx.beginPath();ctx.arc(-5,-6,9,0,Math.PI*2);ctx.fill();
    } else {
      const{x,y,w,h}=o;
      ctx.shadowBlur=12;ctx.shadowColor="#c07830";
      const tg=ctx.createLinearGradient(x,y,x+w,y);
      tg.addColorStop(0,"#7a4018");tg.addColorStop(0.3,"#b05e28");tg.addColorStop(0.7,"#c87030");tg.addColorStop(1,"#7a4018");
      ctx.fillStyle=tg;ctx.fillRect(x,y,w,h);
      ctx.shadowBlur=0;
      ctx.strokeStyle="#5a2c0e";ctx.lineWidth=1.5;
      for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+w*i/4,y+6);ctx.lineTo(x+w*i/4,y+h);ctx.stroke();}
      const topG=ctx.createRadialGradient(x+w/2,y+5,2,x+w/2,y+5,w/2);
      topG.addColorStop(0,"#e8a050");topG.addColorStop(0.5,"#c07030");topG.addColorStop(1,"#8a4820");
      ctx.fillStyle=topG;ctx.beginPath();ctx.ellipse(x+w/2,y+5,w/2-1,6,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#7a3c14";ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(x+w/2,y+5,w/3,4,0,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.ellipse(x+w/2,y+5,w/5.5,2.5,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle="#e89040";ctx.lineWidth=1.5;ctx.strokeRect(x,y,w,h);
      ctx.strokeStyle="#8a4818";ctx.lineWidth=4;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(x+6,y+h);ctx.lineTo(x-9,y+h+10);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w-6,y+h);ctx.lineTo(x+w+9,y+h+10);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+w/2,y+h);ctx.lineTo(x+w/2-3,y+h+8);ctx.stroke();
    }
    ctx.restore();
  });
}

// ─── Eagle Potion (Ravenclaw buff) ────────────────────────────────────────────
function drawEaglePotion(ctx, pot, f) {
  const bY = pot.y + Math.sin(f * 0.09) * 5;
  ctx.save(); ctx.translate(pot.x, bY);
  ctx.shadowBlur = 28; ctx.shadowColor = "#4466ff";

  // Feathers (left & right)
  [-1,1].forEach(sx => {
    ctx.save(); ctx.scale(sx, 1);
    for (let i=0;i<3;i++) {
      ctx.beginPath();
      ctx.moveTo(14+i*5, -18+i*8);
      ctx.bezierCurveTo(22+i*5,-28+i*8, 26+i*5,-14+i*8, 18+i*5,-6+i*8);
      ctx.strokeStyle=`rgba(212,160,23,${0.85-i*0.15})`; ctx.lineWidth=2.5; ctx.stroke();
    }
    ctx.restore();
  });

  // Cork
  ctx.fillStyle="#a07820";
  ctx.beginPath(); ctx.roundRect(-6,-36,12,9,3); ctx.fill();

  // Neck
  const nG=ctx.createLinearGradient(-6,-27,6,-27);
  nG.addColorStop(0,"#1a2a4a"); nG.addColorStop(0.5,"#2a4a8a"); nG.addColorStop(1,"#1a2a4a");
  ctx.fillStyle=nG; ctx.fillRect(-5,-27,10,11);

  // Bottle body (larger than polyjuice)
  const bG=ctx.createRadialGradient(-4,-4,2,0,2,20);
  bG.addColorStop(0,"#1a2a5a"); bG.addColorStop(0.5,"#0a1638"); bG.addColorStop(1,"#050a18");
  ctx.fillStyle=bG;
  ctx.beginPath(); ctx.ellipse(0,2,20,24,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="#5577dd"; ctx.lineWidth=1.8; ctx.stroke();

  // Blue & gold liquid
  const wf=Math.sin(f*0.14)*2;
  const lG=ctx.createRadialGradient(0,wf,2,0,wf,18);
  lG.addColorStop(0,"rgba(120,180,255,0.9)");
  lG.addColorStop(0.4,"rgba(60,110,230,0.85)");
  lG.addColorStop(1,"rgba(20,50,150,0.7)");
  ctx.fillStyle=lG;
  ctx.beginPath(); ctx.ellipse(0,wf+3,18,20,0,0,Math.PI*2); ctx.fill();

  // Gold sparkle swirls
  ctx.shadowBlur=8; ctx.shadowColor="#ffd700";
  for(let i=0;i<5;i++){
    const sx=Math.sin(f*0.14+i*1.4)*10;
    const sy=-14+((f*0.45+i*22)%30)-6;
    ctx.fillStyle=`rgba(255,210,60,${0.55+Math.sin(f*0.3+i)*0.3})`;
    ctx.beginPath(); ctx.arc(sx,sy+wf,2.2,0,Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur=0;

  // Shine
  ctx.fillStyle="rgba(170,210,255,0.3)";
  ctx.beginPath(); ctx.ellipse(-6,-7,5,9,-0.3,0,Math.PI*2); ctx.fill();

  // "R" crest label
  ctx.fillStyle="rgba(80,120,255,0.55)";
  ctx.fillRect(-8,-7,16,12);
  ctx.strokeStyle="rgba(200,220,255,0.5)"; ctx.lineWidth=0.8; ctx.strokeRect(-8,-7,16,12);
  ctx.fillStyle="#ffd700"; ctx.font="bold 10px serif"; ctx.textAlign="center";
  ctx.shadowBlur=4; ctx.shadowColor="#ffd700";
  ctx.fillText("R",0,1);
  ctx.shadowBlur=0;

  ctx.restore();
}

// ─── Eagle wings overlay (Ravenclaw buff on player) ───────────────────────────
function drawEagleWings(ctx, f) {
  const flap = Math.sin(f * 0.22) * 0.45;
  ctx.save();
  ctx.shadowBlur = 14; ctx.shadowColor = "#ffd700";
  [-1,1].forEach(sx => {
    ctx.save(); ctx.scale(sx, 1);
    ctx.translate(8, -26); ctx.rotate(flap);
    // Wing fill
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(12,-18, 34,-22, 46,-8);
    ctx.bezierCurveTo(38,4, 22,6, 0,0);
    const wG=ctx.createLinearGradient(0,-18,46,0);
    wG.addColorStop(0,"#e8a820"); wG.addColorStop(0.5,"#c06c10"); wG.addColorStop(1,"#7a3808");
    ctx.fillStyle=wG; ctx.fill();
    ctx.strokeStyle="#ffd700"; ctx.lineWidth=1; ctx.stroke();
    // Feather lines
    ctx.strokeStyle="rgba(255,200,50,0.45)"; ctx.lineWidth=0.9;
    for(let i=1;i<6;i++){
      ctx.beginPath();ctx.moveTo(i*7,-i*3.5);ctx.lineTo(i*7+4,i*2);ctx.stroke();
    }
    ctx.restore();
  });
  ctx.shadowBlur=0;
  ctx.restore();
}

// ─── Golden Snitch ────────────────────────────────────────────────────────────
function drawSnitch(ctx, sn, f) {
  if(!sn) return;
  const bY=sn.y+Math.sin(f*0.07)*8;
  ctx.save();ctx.translate(sn.x,bY);
  ctx.shadowBlur=18;ctx.shadowColor="#ffd700";
  const wf=Math.sin(f*0.28)*0.5;
  [-1,1].forEach(s=>{
    ctx.save();ctx.rotate(s*(Math.PI*0.08+wf*s));
    ctx.beginPath();ctx.ellipse(s*14,0,16,7,s*-0.2,0,Math.PI*2);
    ctx.fillStyle="rgba(255,255,195,0.5)";ctx.fill();
    ctx.strokeStyle="rgba(255,210,80,0.75)";ctx.lineWidth=1;ctx.stroke();ctx.restore();
  });
  const sg=ctx.createRadialGradient(-3,-3,1,0,0,10);
  sg.addColorStop(0,"#fff8a0");sg.addColorStop(0.4,"#ffd700");sg.addColorStop(1,"#b8860b");
  ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();
  ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(-3,-3,3,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.55)";ctx.fill();
  ctx.restore();
}

// ─── Polyjuice Potion item ────────────────────────────────────────────────────
function drawPotion(ctx, pot, f) {
  if (!pot) return;
  const bY = pot.y + Math.sin(f * 0.09) * 5;
  ctx.save(); ctx.translate(pot.x, bY);
  ctx.shadowBlur = 18; ctx.shadowColor = "#30ff80";

  // Cork
  ctx.fillStyle = "#8B6914";
  ctx.beginPath(); ctx.roundRect(-4, -26, 8, 7, 2); ctx.fill();

  // Neck
  const neckG = ctx.createLinearGradient(-4,-19,4,-19);
  neckG.addColorStop(0,"#1a3a1a"); neckG.addColorStop(0.5,"#2a5a2a"); neckG.addColorStop(1,"#1a3a1a");
  ctx.fillStyle = neckG; ctx.fillRect(-4, -19, 8, 9);

  // Bottle body
  const bodyG = ctx.createRadialGradient(-3,-2,1,0,0,14);
  bodyG.addColorStop(0,"#1a4a1a"); bodyG.addColorStop(0.5,"#0a2a0a"); bodyG.addColorStop(1,"#050e05");
  ctx.fillStyle = bodyG;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#30aa50"; ctx.lineWidth = 1.2; ctx.stroke();

  // Liquid (animated green fill)
  const fillY = 3 + Math.sin(f * 0.15) * 2;
  const liqG = ctx.createRadialGradient(0, fillY, 1, 0, fillY, 11);
  liqG.addColorStop(0, "rgba(60,240,100,0.85)");
  liqG.addColorStop(0.6,"rgba(20,160,60,0.75)");
  liqG.addColorStop(1, "rgba(10,80,30,0.6)");
  ctx.fillStyle = liqG;
  ctx.beginPath(); ctx.ellipse(0, fillY, 11, 13, 0, 0, Math.PI*2); ctx.fill();

  // Bubbles
  ctx.shadowBlur = 4; ctx.shadowColor = "#80ff80";
  for (let i=0; i<4; i++) {
    const bx = Math.sin(f*0.12 + i*1.8) * 5;
    const by = -10 + ((f*0.4 + i*18) % 22) - 8;
    ctx.fillStyle = `rgba(120,255,150,${0.55+Math.sin(f*0.3+i)*0.25})`;
    ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Bottle shine
  ctx.fillStyle = "rgba(180,255,200,0.28)";
  ctx.beginPath(); ctx.ellipse(-4, -5, 3.5, 7, -0.3, 0, Math.PI*2); ctx.fill();

  // Label (small scroll)
  ctx.fillStyle = "rgba(200,255,180,0.5)";
  ctx.fillRect(-6, -4, 12, 8);
  ctx.strokeStyle = "rgba(30,100,30,0.4)"; ctx.lineWidth = 0.8;
  ctx.strokeRect(-6, -4, 12, 8);

  ctx.restore();
}

function drawParts(ctx, parts) {
  parts.forEach(p=>{
    ctx.save();ctx.globalAlpha=Math.max(0,p.life);
    ctx.beginPath();ctx.arc(p.x,p.y,p.sz,0,Math.PI*2);
    ctx.fillStyle=p.col;ctx.fill();ctx.restore();
  });
}

function drawFloats(ctx, floats) {
  floats.forEach(f=>{
    ctx.save();ctx.globalAlpha=Math.min(1,f.life*2.5);
    ctx.font="bold 15px monospace";ctx.textAlign="center";
    ctx.strokeStyle="rgba(0,0,0,0.65)";ctx.lineWidth=3;
    ctx.strokeText(f.text,f.x,f.y);
    ctx.fillStyle=f.col||"#ffd700";ctx.fillText(f.text,f.x,f.y);
    ctx.restore();
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD(ctx, g) {
  const {score,best,rush,rushStart,player:p,lives,polyjuiceActive,polyjuiceStart}=g;
  ctx.save();

  // Hearts
  for(let i=0;i<MAX_LIVES;i++){
    ctx.font="18px serif";ctx.textAlign="left";
    ctx.fillStyle=i<lives?"#e03050":"#3a1020";
    ctx.fillText("♥",10+i*22,20);
  }
  // Jump pips
  for(let i=0;i<2;i++){
    const filled=i<(2-p.jumpCount);
    ctx.beginPath();ctx.arc(17+i*18,34,5,0,Math.PI*2);
    if(filled){ctx.fillStyle="#9060ff";ctx.fill();ctx.strokeStyle="#c0a0ff";}
    else ctx.strokeStyle="#3a2060";
    ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.font="8px monospace";ctx.textAlign="left";
  ctx.fillStyle="rgba(128,100,185,0.6)";ctx.fillText("JUMP",9,47);
  if(p.sliding&&!p.isJumping){
    ctx.fillStyle="rgba(0,0,0,0.52)";rRect(ctx,8,51,56,14,7);ctx.fill();
    ctx.fillStyle="#c080ff";ctx.font="bold 9px monospace";ctx.textAlign="left";ctx.fillText("SLIDE!",14,62);
  }

  // Score
  ctx.font="bold 17px monospace";ctx.textAlign="right";
  ctx.fillStyle="rgba(200,180,255,0.92)";ctx.fillText(`SCORE: ${Math.floor(score)}`,CW-14,27);
  ctx.fillStyle="rgba(148,128,190,0.72)";ctx.fillText(`BEST: ${Math.floor(best)}`,CW-14,48);

  // Power-up bars (center top)
  let barY = 7;
  if(g.eagleActive){
    const rem=Math.max(0,EAGLE_MS/1000-(Date.now()-g.eagleStart)/1000),pct=rem/(EAGLE_MS/1000);
    ctx.fillStyle="rgba(0,0,0,0.52)";rRect(ctx,CW/2-110,barY,220,26,13);ctx.fill();
    const bg=ctx.createLinearGradient(CW/2-108,0,CW/2+108,0);
    bg.addColorStop(0,"#1144cc");bg.addColorStop(0.4,"#4488ff");bg.addColorStop(0.7,"#ffd700");bg.addColorStop(1,"#ffaa00");
    ctx.fillStyle=bg;rRect(ctx,CW/2-108,barY+2,216*pct,22,11);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 11px monospace";ctx.textAlign="center";
    ctx.shadowBlur=6;ctx.shadowColor="#ffd700";
    ctx.fillText(`🦅 독수리 모드!  ${rem.toFixed(1)}s`,CW/2,barY+17);
    ctx.shadowBlur=0;
    barY+=30;
  }
  if(rush){
    const rem=Math.max(0,5-(Date.now()-rushStart)/1000),pct=rem/5;
    ctx.fillStyle="rgba(0,0,0,0.52)";rRect(ctx,CW/2-110,barY,220,26,13);ctx.fill();
    const bg=ctx.createLinearGradient(CW/2-108,0,CW/2+108,0);
    bg.addColorStop(0,"#ff6600");bg.addColorStop(0.5,"#ffd700");bg.addColorStop(1,"#bb00ff");
    ctx.fillStyle=bg;rRect(ctx,CW/2-108,barY+2,216*pct,22,11);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 11px monospace";ctx.textAlign="center";
    ctx.fillText(`🧹 BROOM RUSH!  ${rem.toFixed(1)}s`,CW/2,barY+17);
    barY += 30;
  }
  if(polyjuiceActive){
    const rem=Math.max(0,POLYJUICE_MS/1000-(Date.now()-polyjuiceStart)/1000),pct=rem/(POLYJUICE_MS/1000);
    ctx.fillStyle="rgba(0,0,0,0.52)";rRect(ctx,CW/2-110,barY,220,26,13);ctx.fill();
    const bg=ctx.createLinearGradient(CW/2-108,0,CW/2+108,0);
    bg.addColorStop(0,"#00cc44");bg.addColorStop(0.5,"#88ff44");bg.addColorStop(1,"#00ddaa");
    ctx.fillStyle=bg;rRect(ctx,CW/2-108,barY+2,216*pct,22,11);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="bold 11px monospace";ctx.textAlign="center";
    ctx.fillText(`🧪 POLYJUICE!  ${rem.toFixed(1)}s`,CW/2,barY+17);
  }

  ctx.restore();
}

function drawIdleScreen(ctx, f) {
  ctx.save();ctx.textAlign="center";
  ctx.shadowBlur=16;ctx.shadowColor="rgba(255,215,0,0.5)";
  ctx.font="bold 30px Georgia,serif";ctx.fillStyle="#ffd700";
  ctx.fillText("⚡  HOGWARTS BROOM RUSH  ⚡",CW/2,86);
  ctx.shadowBlur=0;
  const pulse=0.5+Math.sin(f*0.06)*0.5;
  ctx.globalAlpha=pulse;ctx.font="16px monospace";ctx.fillStyle="#c0a0ff";
  ctx.fillText("SPACE / ↑  to  Begin",CW/2,CH/2+20);
  ctx.globalAlpha=0.6;ctx.font="11px monospace";ctx.fillStyle="#7060b0";
  ctx.fillText("↑↑ Double Jump  ·  ↓ Slide  ·  🥇 Snitch=RUSH  ·  🧪 Polyjuice=GIANT  ·  ♥♥♥ 3 Lives",CW/2,CH/2+46);
  ctx.restore();
}

function drawGameOverScreen(ctx, score, best) {
  ctx.save();
  ctx.fillStyle="rgba(4,2,18,0.78)";ctx.fillRect(0,0,CW,CH);
  ctx.textAlign="center";
  ctx.shadowBlur=14;ctx.shadowColor="rgba(180,0,0,0.5)";
  ctx.font="bold 42px Georgia,serif";ctx.fillStyle="#c0392b";
  ctx.fillText("GAME  OVER",CW/2,CH/2-35);
  ctx.shadowBlur=0;
  ctx.font="19px monospace";ctx.fillStyle="rgba(200,178,255,0.92)";
  ctx.fillText(`Score: ${Math.floor(score)}`,CW/2,CH/2+8);
  if(score>0&&score>=best){
    ctx.fillStyle="#ffd700";ctx.font="bold 13px monospace";
    ctx.fillText("✨  NEW HIGH SCORE!  ✨",CW/2,CH/2+34);
  }
  ctx.font="13px monospace";ctx.fillStyle="rgba(148,128,190,0.78)";
  ctx.fillText("SPACE / ↑  to  play again",CW/2,CH/2+62);
  ctx.restore();
}

function burst(x,y,count,colors,speed=10){
  return Array.from({length:count},()=>({
    x,y,vx:(Math.random()-.5)*speed,vy:(Math.random()-.5)*speed-2,
    sz:rnd(2,6),life:1,col:colors[Math.floor(Math.random()*colors.length)],
  }));
}

// ─── component ────────────────────────────────────────────────────────────────
export default function HogwartsBroomRush({ currentHouse: selectedHouse = "Ravenclaw", onComplete }) {
  currentHouse = selectedHouse;
  const canvasRef = useRef(null);
  const rafRef   = useRef(null);

  const gRef = useRef({
    state:"idle", f:0, score:0, best:0, spd:BASE_SPD, gOff:0,
    player:{x:PX,y:GY-PH,vy:0,isJumping:false,jumpCount:0,sliding:false,slideTimer:0,w:PW,h:PH},
    obs:[], obsT:200,
    snitch:null,   snitchT:600,
    potion:null,   potionT:900,   // Polyjuice item on screen
    parts:[], djRings:[], floats:[],
    rush:false,         rushStart:0,
    polyjuiceActive:false, polyjuiceStart:0,
    eagleActive:false,  eagleStart:0,   // Ravenclaw 독수리 버프
    eaglePotion:null,                   // 래번클로 시작 시 강제 배치 아이템
    lives:MAX_LIVES, invincible:0, hitFlash:0,
    downHeld:false,
    lastObsType:null,  // tracks previous obstacle type for gap logic
    stars:Array.from({length:80},()=>({
      x:rnd(0,CW),y:rnd(0,GY-10),r:rnd(0.4,2),t:rnd(0,Math.PI*2),
    })),
  });

  const [rushActive, setRushActive] = useState(false);
  const [polyActive, setPolyActive] = useState(false);
  const [eagleOn,    setEagleOn   ] = useState(false);

  // ── spawn obstacle (passability-guaranteed) ──────────────────────────────
  const spawn = useCallback(() => {
    const g = gRef.current;

    // Choose type – weight bats to appear more often
    const roll = Math.random();
    const t = roll < 0.38 ? "bat" : roll < 0.58 ? "bludger" : "stump";

    let w, h, y;

    if (t === "bat") {
      w = 52; h = 42;
      if (g.lastObsType === "stump") {
        // After stump: player was airborne; only spawn bats the player
        // can pass under while on the ground OR while in the air safely.
        // Safe categories:
        //   HIGH bat (y < 130): player runs under naturally (bat above head)
        //   LOW  bat (y > 175): player slides or jumps normally on the ground
        // Avoid mid-height bats (130-175) directly after a stump.
        y = Math.random() < 0.5
          ? GY - h - rnd(110, 140)   // HIGH: y = 58-70 → well above player
          : GY - h - rnd(18, 38);    // LOW:  y = 160-180 → slides or low jump
      } else {
        // Any height, but ensure it's either clearly passable overhead (y<130)
        // or clearly slideable/jumpable (y 150-185)
        y = Math.random() < 0.45
          ? GY - h - rnd(100, 140)   // HIGH — run under
          : GY - h - rnd(18, 80);    // NORMAL range
      }
    } else if (t === "bludger") {
      w = 40; h = 40;
      // Bludgers: restrict to ranges guaranteed passable
      // y < 145: player passes underneath standing; y > 145: must jump
      y = Math.random() < 0.5
        ? GY - h - rnd(60, 100)    // high bludger — runs under
        : GY - h - rnd(5, 55);     // low bludger — must jump/slide
    } else {
      // Stump – always on ground
      w = 42; h = 58; y = GY - h;
    }

    g.lastObsType = t;
    g.obs.push({ type: t, x: CW + 10, y, w, h });
  }, []);

  // ── reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const g = gRef.current;
    g.state="playing"; g.f=0; g.score=0; g.spd=BASE_SPD; g.gOff=0;
    g.player={x:PX,y:GY-PH,vy:0,isJumping:false,jumpCount:0,sliding:false,slideTimer:0,w:PW,h:PH};
    g.obs=[]; g.obsT=200;
    g.snitch=null; g.snitchT=rnd(500,900);
    g.potion=null; g.potionT=rnd(700,1100);
    g.parts=[]; g.djRings=[]; g.floats=[];
    g.rush=false; g.rushStart=0;
    g.polyjuiceActive=false; g.polyjuiceStart=0;
    g.eagleActive=false; g.eagleStart=0; g.eaglePotion=null;
    g.lives=MAX_LIVES; g.invincible=0; g.hitFlash=0;
    g.lastObsType=null;
    setRushActive(false); setPolyActive(false);

    // ── Ravenclaw 버프: 시작 직후 독수리 물약 강제 배치 ──────────────────────
    if (currentHouse === "Ravenclaw") {
      // x=310: 플레이어(100)로부터 210px → 속도 5.2 기준 약 0.7초 후 수집
      g.eaglePotion = { x: 310, y: GY - PH - 12 };
      g.obsT = 380; // 첫 장애물 등장 지연 (버프 수집 후에 장애물 시작)
    }
  }, []);

  const jump = useCallback(() => {
    const g = gRef.current;
    if(g.state==="idle"||g.state==="gameover"){reset();return;}
    const p=g.player;
    if(p.sliding){p.sliding=false;p.slideTimer=0;}
    if(p.jumpCount<2){
      const isDouble=p.jumpCount===1;
      p.vy=isDouble?JUMP*0.92:JUMP;
      p.isJumping=true; p.jumpCount++;
      if(isDouble){
        g.djRings.push({x:p.x+PW/2,y:p.y+PH*0.4,rad:8,a:0.9});
        g.parts.push(...burst(p.x+PW/2,p.y+PH*0.4,16,["#c0a0ff","#9060ff","#ffffff","#e0c8ff"],7));
      }
    }
  },[reset]);

  const slide = useCallback(() => {
    const g=gRef.current;
    if(g.state!=="playing") return;
    const p=g.player;
    if(p.isJumping){if(p.vy<5)p.vy=8;}
    else if(!p.sliding){p.sliding=true;p.slideTimer=SLIDE_FRAMES;}
  },[]);

  useEffect(()=>{
    const onDown=e=>{
      if(e.code==="Space"||e.code==="ArrowUp"){e.preventDefault();jump();}
      if(e.code==="ArrowDown"){e.preventDefault();gRef.current.downHeld=true;slide();}
    };
    const onUp=e=>{if(e.code==="ArrowDown")gRef.current.downHeld=false;};
    window.addEventListener("keydown",onDown);
    window.addEventListener("keyup",onUp);
    return()=>{window.removeEventListener("keydown",onDown);window.removeEventListener("keyup",onUp);};
  },[jump,slide]);

  // ── game loop ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const ctx=canvas.getContext("2d");

    const tick=()=>{
      const g=gRef.current;
      const eagle=g.eagleActive;
      const poly=g.polyjuiceActive;
      ctx.clearRect(0,0,CW,CH);
      drawBg(ctx,g.rush,poly,eagle,g.stars);
      drawGround(ctx,g.gOff);

      if(g.state==="playing"){
        g.f++;
        const eagle=g.eagleActive;
        g.spd=eagle?EAGLE_SPD:g.rush?RUSH_SPD:Math.min(BASE_SPD+g.score*0.005,10);
        g.score+=g.spd*0.04;
        g.gOff=(g.gOff+g.spd)%CW;

        const p=g.player;

        // Physics
        p.vy+=GRAV; p.y+=p.vy;
        if(p.y>=GY-PH){
          p.y=GY-PH; p.vy=0;
          if(p.isJumping){p.isJumping=false;p.jumpCount=0;}
        }

        // Slide (continuous while ↓ held – prevents the stand-up glitch)
        if(!p.isJumping){
          if(g.downHeld){p.sliding=true;p.slideTimer=SLIDE_FRAMES;}
          else{p.sliding=false;p.slideTimer=0;}  // release = stand up immediately
        } else {
          p.sliding=false;
        }

        // ── Obstacle spawning (passability-enforced gaps) ──────────────────
        g.obsT-=g.spd*0.65;
        if(g.obsT<=0){
          spawn();
          // Gap in "obsT units" (pixels = obsT / 0.65)
          // After a STUMP the player is airborne; next obstacle must not appear
          // until they've fully landed → gap ≥ JUMP_FRAMES × speed pixels.
          const jumpArcPx = JUMP_FRAMES * g.spd + 80;
          const minPx = g.lastObsType==="stump"
            ? Math.max(240, jumpArcPx)            // guaranteed landing room
            : Math.max(160, 220-g.score*0.1);     // normal – never below 160px
          const maxPx = Math.max(minPx+80, 340-g.score*0.15);
          g.obsT = rnd(minPx, maxPx) * 0.65;
        }

        g.obs=g.obs.filter(o=>{o.x-=g.spd;return o.x+o.w>-20;});
        drawObs(ctx,g.obs,g.f);

        // ── Snitch ────────────────────────────────────────────────────────
        g.snitchT-=g.spd*0.55;
        if(!g.snitch&&!g.rush&&!poly&&g.snitchT<=0&&g.score>10){
          // Allow both on screen ~10% of the time
          if(!g.potion||Math.random()<0.10){
            g.snitch={x:CW+20,y:rnd(GY-155,GY-65)};
            g.snitchT=rnd(600,1100);
          } else {
            g.snitchT=rnd(150,280); // retry soon
          }
        }
        if(g.snitch){g.snitch.x-=g.spd*0.65;if(g.snitch.x<-50)g.snitch=null;}
        if(g.snitch){
          drawSnitch(ctx,g.snitch,g.f);
          if(!g.rush){
            const sb={x:g.snitch.x-10,y:g.snitch.y-10,w:20,h:20};
            if(hit(getHitbox(p,poly),sb,3)){
              g.snitch=null; g.rush=true; g.rushStart=Date.now();
              setRushActive(true);
              g.parts.push(...burst(p.x+PW/2,p.y+PH/2,30,["#ffd700","#ff9900","#cc00ff","#ffffff","#00ffcc"],14));
            }
          }
        }

        // ── Polyjuice Potion item ──────────────────────────────────────────
        g.potionT-=g.spd*0.62;
        if(!g.potion&&!poly&&!g.rush&&g.potionT<=0&&g.score>20){
          if(!g.snitch||Math.random()<0.10){
            g.potion={x:CW+20,y:rnd(GY-110,GY-60)};
            g.potionT=rnd(900,1400);
          } else {
            g.potionT=rnd(300,500);
          }
        }
        if(g.potion){g.potion.x-=g.spd*0.6;if(g.potion.x<-50)g.potion=null;}
        if(g.potion){
          drawPotion(ctx,g.potion,g.f);
          const pb={x:g.potion.x-13,y:g.potion.y-26,w:26,h:42};
          if(hit(getHitbox(p,poly),pb,4)){
            g.potion=null; g.polyjuiceActive=true; g.polyjuiceStart=Date.now();
            setPolyActive(true);
            g.parts.push(...burst(p.x+PW/2,p.y+PH/2,32,["#30ff80","#88ff44","#ffffff","#00ddaa"],13));
            g.floats.push({x:p.x+PW/2,y:p.y,text:"GIANT!",life:1.2,vy:-1.8,col:"#44ff88"});
          }
        }

        // ── Rush / Polyjuice / Eagle timers ───────────────────────────────
        if(g.rush&&Date.now()-g.rushStart>=RUSH_MS){g.rush=false;setRushActive(false);}
        if(g.polyjuiceActive&&Date.now()-g.polyjuiceStart>=POLYJUICE_MS){
          g.polyjuiceActive=false;setPolyActive(false);
        }
        if(g.eagleActive&&Date.now()-g.eagleStart>=EAGLE_MS){g.eagleActive=false;setEagleOn(false);}

        // ── Eagle Potion (Ravenclaw 강제 버프 아이템) ─────────────────────
        if(g.eaglePotion){
          g.eaglePotion.x-=g.spd*0.65;
          if(g.eaglePotion.x<-70) g.eaglePotion=null;
        }
        if(g.eaglePotion){
          drawEaglePotion(ctx,g.eaglePotion,g.f);
          // 수직 전체(화면 높이)를 커버하는 히트박스 → 어떤 높이에서도 반드시 수집
          const eb={x:g.eaglePotion.x-22,y:-10,w:44,h:CH+20};
          if(hit(getHitbox(p,poly),eb,2)){
            g.eaglePotion=null; g.eagleActive=true; g.eagleStart=Date.now();
            setEagleOn(true);
            g.parts.push(...burst(p.x+PW/2,p.y+PH/2,36,["#ffd700","#ffaa00","#4488ff","#ffffff","#88ccff"],14));
            g.floats.push({x:p.x+PW/2,y:p.y-10,text:"🦅 독수리!",life:1.4,vy:-2,col:"#ffd700"});
          }
        }

        // ── Invincibility & flash timers ───────────────────────────────────
        if(g.invincible>0)g.invincible--;
        if(g.hitFlash>0)g.hitFlash--;

        // ── Collision / destruction ────────────────────────────────────────
        const pBox=getHitbox(p,poly);
        const slidePad=(p.sliding&&!p.isJumping)?5:9;
        const isInvincible=g.rush||poly||eagle||g.invincible>0;

        if(!isInvincible){
          // Mortal collision → lose life
          for(const o of g.obs){
            if(hit(pBox,o,slidePad)){
              g.lives--;
              if(g.lives<=0){
                g.state="gameover";
                if(g.score>g.best)g.best=g.score;
                // 점수 정규화 (0~100점)
                game4Score=Math.min(100,Math.floor((g.score/MAX_NORMALIZED_SCORE)*100));
                onComplete?.(game4Score);
                console.log(`[HogwartsBroomRush] game4Score: ${game4Score} (원점수: ${Math.floor(g.score)})`);
                // TODO: 최종 양피지 성적표 화면 호출
              } else {
                g.invincible=INVINCIBLE_FRAMES; g.hitFlash=HIT_FLASH_F;
                g.parts.push(...burst(p.x+PW/2,p.y+PH/2,12,["#ff2020","#ff8040","#ffffff"],5));
              }
              break;
            }
          }
        } else if(g.rush||poly||eagle){
          // Invincible via Rush / Polyjuice / Eagle → destroy obstacles
          const smashBox=poly
            ?{x:pBox.x,y:pBox.y,w:pBox.w+10,h:pBox.h}
            :{x:pBox.x,y:pBox.y,w:pBox.w+22,h:pBox.h};
          const bonusPts=eagle?EAGLE_BONUS:poly?POLYJUICE_BONUS:BONUS_PER_OBS;
          const partColors=eagle
            ?["#ffd700","#ffaa00","#4488ff","#88ccff"]
            :poly?["#30ff80","#88ff44","#ffffff","#00ddaa"]
            :["#ffd700","#ff6600","#cc00ff","#00ccff"];
          g.obs=g.obs.filter(o=>{
            if(hit(smashBox,o,5)){
              g.score+=bonusPts;
              g.floats.push({x:o.x+o.w/2,y:o.y-4,text:`+${bonusPts}`,life:1,vy:-1.6,
                col:eagle?"#ffd700":poly?"#44ff88":"#ffd700"});
              g.parts.push(...burst(o.x+o.w/2,o.y+o.h/2,10,partColors,8));
              return false;
            }
            return true;
          });
          if(g.rush&&g.f%3===0)g.parts.push({
            x:p.x+4,y:p.y+PH*0.5,vx:-g.spd*0.4+rnd(-1,1),vy:rnd(-2,2),
            sz:rnd(2,4),life:0.7,col:["#8040ff","#6020cc","#cc50ff"][Math.floor(Math.random()*3)],
          });
          if(eagle&&g.f%2===0)g.parts.push({
            x:p.x+PW/2+rnd(-10,10),y:p.y+rnd(0,PH),
            vx:-g.spd*0.5+rnd(-2,2),vy:rnd(-3,1),
            sz:rnd(2,5),life:0.6,
            col:["#ffd700","#ffaa00","#4488ff"][Math.floor(Math.random()*3)],
          });
          if(poly&&g.f%2===0)g.parts.push({
            x:p.x+PW/2+rnd(-PW,PW),y:GY+rnd(-4,4),
            vx:rnd(-3,3),vy:rnd(-3,0),sz:rnd(3,6),life:0.6,
            col:["#30ff80","#88ff44","#00ddaa"][Math.floor(Math.random()*3)],
          });
        }

        // ── Particles & effects ───────────────────────────────────────────
        g.parts=g.parts.filter(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=0.15;pt.life-=0.022;return pt.life>0;});
        g.djRings=g.djRings.filter(r=>{r.rad+=3.5;r.a-=0.07;return r.a>0;});
        g.floats=g.floats.filter(f=>{f.y+=f.vy;f.life-=0.024;return f.life>0;});
        drawParts(ctx,g.parts);
        drawDjRing(ctx,g.djRings);
        drawFloats(ctx,g.floats);

        // Polyjuice ground stomp shockwave ring
        if(poly&&!p.isJumping&&g.f%12===0){
          g.djRings.push({x:p.x+PW/2,y:GY,rad:10,a:0.6});
        }

        // Player (blink while post-hit invincible, not while rush/poly)
        const showP=g.invincible<=0||eagle||g.rush||poly||Math.floor(g.invincible/5)%2===0;
        if(showP)drawPlayer(ctx,p,g.rush,poly,eagle,g.f);

        // Hit-flash overlay
        if(g.hitFlash>0){
          ctx.fillStyle=`rgba(255,20,20,${0.32*(g.hitFlash/HIT_FLASH_F)})`;
          ctx.fillRect(0,0,CW,CH);
        }

        // Polyjuice green edge glow
        if(poly){
          const edge=ctx.createLinearGradient(0,0,0,CH);
          edge.addColorStop(0,"rgba(30,200,70,0.18)");
          edge.addColorStop(0.5,"rgba(30,200,70,0)");
          edge.addColorStop(1,"rgba(30,200,70,0.18)");
          ctx.fillStyle=edge; ctx.fillRect(0,0,CW,CH);
          ctx.strokeStyle=`rgba(40,255,100,${0.25+Math.sin(g.f*0.12)*0.1})`;
          ctx.lineWidth=4; ctx.strokeRect(2,2,CW-4,CH-4);
        }

        // Eagle gold border
        if(eagle){
          ctx.strokeStyle=`rgba(255,200,30,${0.3+Math.sin(g.f*0.15)*0.12})`;
          ctx.lineWidth=5; ctx.strokeRect(2,2,CW-4,CH-4);
        }

      } else if(g.state==="idle"){
        g.f++;
        drawPlayer(ctx,g.player,false,false,false,g.f);
        drawIdleScreen(ctx,g.f);
      } else {
        drawPlayer(ctx,g.player,false,false,false,g.f);
        drawGameOverScreen(ctx,g.score,g.best);
      }

      drawHUD(ctx,g);
      rafRef.current=requestAnimationFrame(tick);
    };

    rafRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(rafRef.current);
  },[spawn]);

  const anyPower = rushActive || polyActive || eagleOn;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-3 p-4 select-none" style={{fontFamily:"monospace"}}>
      <div className="text-center">
        <h1 style={{
          fontFamily:'Georgia,"Times New Roman",serif',
          fontSize:"1.45rem",fontWeight:700,letterSpacing:"0.18em",color:"#ffd700",
          textShadow:"0 0 18px rgba(255,215,0,0.45),0 0 40px rgba(150,80,255,0.28)",margin:0,
        }}>⚡ HOGWARTS BROOM RUSH ⚡</h1>
        <p style={{color:"#5a408a",fontSize:"0.68rem",letterSpacing:"0.22em",marginTop:"3px"}}>
          A MAGICAL ENDLESS RUNNER
        </p>
      </div>

      <div onClick={jump} style={{
        position:"relative",borderRadius:"10px",overflow:"hidden",cursor:"pointer",maxWidth:"100%",
        boxShadow: eagleOn
          ? "0 0 0 3px #ffd700,0 0 40px rgba(255,210,30,0.4),0 0 80px rgba(68,136,255,0.3)"
          : polyActive
          ? "0 0 0 3px #30ff80,0 0 40px rgba(30,255,100,0.35),0 0 80px rgba(30,200,80,0.2)"
          : rushActive
          ? "0 0 0 3px #ffd700,0 0 40px rgba(255,215,0,0.32),0 0 80px rgba(170,70,255,0.25)"
          : "0 0 0 1px rgba(80,40,160,0.4),0 0 32px rgba(50,16,100,0.5)",
        transition:"box-shadow 0.3s ease",
      }}>
        <canvas ref={canvasRef} width={CW} height={CH} style={{display:"block",maxWidth:"100%",height:"auto"}}/>
        {anyPower&&<div style={{
          position:"absolute",inset:0,pointerEvents:"none",
          background: eagleOn
            ?"linear-gradient(135deg,rgba(255,190,30,.06),rgba(255,220,80,.04),rgba(68,136,255,.06))"
            :polyActive
            ?"linear-gradient(135deg,rgba(30,180,60,.06),rgba(100,255,80,.04),rgba(0,200,100,.06))"
            :"linear-gradient(135deg,rgba(255,90,0,.05),rgba(255,210,0,.04),rgba(170,0,255,.06))",
          animation:"powerFlicker .35s ease-in-out infinite alternate",
        }}/>}
      </div>

      <div style={{display:"flex",gap:"1.2rem",fontSize:"0.65rem",letterSpacing:"0.08em",flexWrap:"wrap",justifyContent:"center"}}>
        <span style={{color:"#4a3880"}}><span style={{color:"#8060c0"}}>SPACE/↑</span> Jump &nbsp;<span style={{color:"#8060c0"}}>↑↑</span> Double &nbsp;<span style={{color:"#8060c0"}}>↓</span> Slide</span>
        <span style={{color:"#8a6a18"}}>🥇 Snitch → BROOM RUSH (+{BONUS_PER_OBS}/obs)</span>
        <span style={{color:"#1a7a3a"}}>🧪 Polyjuice → GIANT (+{POLYJUICE_BONUS}/obs)</span>
        {currentHouse==="Ravenclaw"&&<span style={{color:"#4466cc"}}>🦅 래번클로 버프 활성</span>}
        <span style={{color:"#a02030"}}>♥♥♥ 3 Lives</span>
      </div>

      <style>{`@keyframes powerFlicker{from{opacity:.42;}to{opacity:1;}}`}</style>
    </div>
  );
}
