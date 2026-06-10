"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";

/* ══════════════════════════════════════════════════════════════
   ★ 공유 전역 변수  (다른 게임 / 심리테스트 / 성적표와 공유)
   ─────────────────────────────────────────────────────────────
   [실제 프로젝트 연동 방법]
   아티팩트 뷰어는 named export를 지원하지 않으므로,
   실제 Next.js 프로젝트에서는 아래 두 가지 방식 중 선택하세요.

   방법 A) 별도 공유 모듈 (권장)
     // gameState.js
     let currentHouse = "Gryffindor";
     let game1Score   = 0;
     // 각 게임 파일에서 import 해서 읽기/쓰기

   방법 B) window 전역 (간단)
     window.currentHouse = "Gryffindor";  // 심리테스트 후 설정
     // 게임 내부에서 window.currentHouse 참조

   [기숙사별 버프 규칙 — 이 게임(1번, 산성비)]
   ✅ Gryffindor : 목숨 0 → 5초 그리핀도르 타임 (추가 타이핑 가능)
   ❌ Hufflepuff  : 버프 없음 (2번 방향키 게임에서 하트 +1)
   ❌ Slytherin   : 버프 없음 (3번 슈팅 게임에서 뱀 펫)
   ❌ Ravenclaw   : 버프 없음 (4번 쿠키런 게임에서 독수리 물약)
══════════════════════════════════════════════════════════════ */
/**
 * 플레이어 기숙사.
 * - 개발/테스트용 기본값: "Gryffindor"
 * - 실제 배포 시: 심리테스트 결과로 외부에서 덮어씀
 * - 가능한 값: "Gryffindor" | "Hufflepuff" | "Slytherin" | "Ravenclaw"
 */
let currentHouse = "Gryffindor"; // ← 테스트 기본값 (심리테스트 후 교체)

/** 이 게임의 최종 정규화 점수 (0 – 100). 성적표 화면에서 참조 */
let game1Score = 0;

/**
 * 100점 만점 기준 원점수.
 * - 단어 10 pts × 콤보 최대 6배 × 약 60 단어 처치 ≈ 1 200 pts가 이론상 최대지만
 *   콤보 유지 + 연속 클리어를 고려해 1 000을 100점 기준으로 설정.
 *   빠른 스폰·높은 속도 환경에서 콤보 유지하며 2500pts 달성이 진짜 도전.
 *   (2000pts → 80점, 2500pts 이상 → 상한 100점)
 */
const MAX_NORMALIZED_SCORE = 1500;

/* ══════════════════════════════════════════════════════════════
   WORD LIST  —  길이별 그룹 + 배치(Bag) 기반 균등 스폰
   ─────────────────────────────────────────────────────────────
   순수 랜덤이면 긴 단어가 연속 등장해 난이도가 스파이크됨.
   10단어 1배치를 미리 생성해 셔플한 뒤 순서대로 소모함으로써
   어느 유저든 동일한 길이 비율(짧:중간:긴:매우긴 = 2:5:2:1)을
   경험하도록 보장.
══════════════════════════════════════════════════════════════ */

/** 짧은 단어 (2–3글자) */
const W_SHORT    = ["녹스","루모스","말포이","스니치","디멘터","마법부","불의잔","퀴디치"];

/** 중간 단어 (4–5글자) */
const W_MEDIUM   = [
  "알로호모라","크루시오","임페리오","해리포터","덤블도어",
  "볼드모트","스네이프","호그와트","그리핀도르","슬리데린",
  "래번클로","후플푸프","버터맥주","호크룩스","투명망토",
  "부활의돌","아즈카반","폴리주스",
];

/** 긴 단어 (6–7글자) */
const W_LONG     = ["시리우스블랙","다이애건앨리","아바다케다브라","딱총나무지팡이"];

/** 매우 긴 단어 (8글자 이상) */
const W_VERYLONG = ["익스펙토패트로눔","익스펠리아르무스","윙가르디움레비오사"];

/** 배열에서 무작위 1개 선택 */
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Fisher-Yates 셔플 */
const shuffleArr = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 10단어 배치 생성 후 셔플하여 반환.
 * 비율: 짧은(2) : 중간(5) : 긴(2) : 매우긴(1)
 * 배치가 소진될 때마다 새 배치를 만들어 연속 어려운 단어 방지.
 */
const makeBatch = () => shuffleArr([
  rnd(W_SHORT),    rnd(W_SHORT),
  rnd(W_MEDIUM),   rnd(W_MEDIUM),   rnd(W_MEDIUM),
  rnd(W_MEDIUM),   rnd(W_MEDIUM),
  rnd(W_LONG),     rnd(W_LONG),
  rnd(W_VERYLONG),
]);

/* ══════════════════════════════════════════════════════════════
   GAME CONSTANTS
══════════════════════════════════════════════════════════════ */
const MAX_LIVES           = 5;
const SPAWN_MS            = 1400;   // 스폰 주기 (1200 → 1400ms)
const BASE_SPEED          = 1.5;    // 시작 속도 (2.0 → 1.5)
const MAX_SPEED           = 5.5;    // 최대 속도 (7.0 → 5.5)
const SPEED_INC           = 0.30;   // 가속량 (0.40 → 0.30)
const SPEED_EVERY_S       = 10;     // 가속 주기 (7 → 10s)
const PTS                 = 10;
const COMBO_MS            = 2500;
const KILL_EMOJIS         = ["✨","💫","⭐","🌟","✦","❄️","🔵","💠"];
const GRYFFINDOR_TIME_SEC = 5; // 그리핀도르 버프 지속 시간

/* ══════════════════════════════════════════════════════════════
   DEMENTOR SIZING
══════════════════════════════════════════════════════════════ */
const DEMENTOR_H = 92;
const CHAR_W     = 16.5;
const DEM_PAD    = 28;

/* ══════════════════════════════════════════════════════════════
   HOGWARTS CASTLE PROFILE  (x: 0–1, h: px from bottom)
══════════════════════════════════════════════════════════════ */
const CP = [
  {x:0.000,h:0  },{x:0.012,h:58 },{x:0.028,h:58 },
  {x:0.030,h:72 },{x:0.060,h:72 },{x:0.062,h:58 },
  {x:0.082,h:58 },{x:0.085,h:88 },{x:0.130,h:88 },
  {x:0.132,h:58 },{x:0.165,h:58 },{x:0.168,h:100},
  {x:0.225,h:100},{x:0.228,h:68 },{x:0.260,h:68 },
  {x:0.262,h:85 },{x:0.295,h:85 },{x:0.298,h:68 },
  {x:0.322,h:68 },{x:0.325,h:115},{x:0.388,h:115},
  {x:0.390,h:78 },{x:0.422,h:78 },{x:0.425,h:128},
  {x:0.448,h:128},{x:0.455,h:155},{x:0.545,h:155},
  {x:0.552,h:128},{x:0.575,h:128},{x:0.578,h:78 },
  {x:0.610,h:78 },{x:0.612,h:118},{x:0.675,h:118},
  {x:0.678,h:72 },{x:0.712,h:72 },{x:0.715,h:90 },
  {x:0.762,h:90 },{x:0.765,h:62 },{x:0.792,h:62 },
  {x:0.795,h:96 },{x:0.852,h:96 },{x:0.855,h:62 },
  {x:0.878,h:62 },{x:0.880,h:78 },{x:0.920,h:78 },
  {x:0.922,h:58 },{x:0.988,h:58 },{x:1.000,h:0  },
];
const CASTLE_SVG_H = 160;

const getHogwartsH = (xf) => {
  const xc = Math.max(0, Math.min(1, xf));
  for (let i = 0; i < CP.length - 1; i++) {
    if (xc >= CP[i].x && xc <= CP[i+1].x) {
      const t = (xc - CP[i].x) / Math.max(CP[i+1].x - CP[i].x, 1e-5);
      return CP[i].h + t * (CP[i+1].h - CP[i].h);
    }
  }
  return 0;
};

const CASTLE_FILL_PATH = (() => {
  const W = 1000, H = CASTLE_SVG_H;
  return `M 0 ${H} ${CP.map(p=>`L ${(p.x*W).toFixed(0)} ${(H-p.h).toFixed(0)}`).join(" ")} L ${W} ${H} Z`;
})();

const CASTLE_EDGE_PATH = CP.slice(1,-1)
  .map((p,i)=>`${i===0?"M":"L"} ${(p.x*1000).toFixed(0)} ${(CASTLE_SVG_H-p.h).toFixed(0)}`)
  .join(" ");

const SPIRES = [
  {x1:448,x2:552,mx:500,py:-32,by:5  },
  {x1:168,x2:228,mx:198,py:44, by:60 },
  {x1:322,x2:390,mx:356,py:28, by:45 },
  {x1:612,x2:678,mx:644,py:26, by:42 },
  {x1:795,x2:855,mx:825,py:48, by:64 },
];

const WINS = [
  {cx:107,cy:100,w:6,h:9 },{cx:107,cy:114,w:6,h:9 },
  {cx:186,cy:78, w:7,h:11},{cx:212,cy:82, w:7,h:11},
  {cx:350,cy:55, w:7,h:12},{cx:350,cy:72, w:7,h:12},{cx:360,cy:89,w:7,h:12},
  {cx:370,cy:55, w:7,h:12},{cx:370,cy:72, w:7,h:12},
  {cx:462,cy:55, w:6,h:10},{cx:462,cy:70, w:6,h:10},
  {cx:500,cy:34, w:6,h:10},{cx:500,cy:50, w:6,h:10},
  {cx:538,cy:55, w:6,h:10},{cx:538,cy:70, w:6,h:10},
  {cx:634,cy:48, w:7,h:12},{cx:634,cy:65, w:7,h:12},{cx:644,cy:82,w:7,h:12},
  {cx:654,cy:48, w:7,h:12},{cx:654,cy:65, w:7,h:12},
  {cx:824,cy:80, w:6,h:9 },{cx:824,cy:95, w:6,h:9 },{cx:900,cy:78,w:6,h:9 },
];

/* ══════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════ */
const mkLightning = () => {
  const steps = 5 + Math.floor(Math.random() * 4);
  const h = 100 + Math.random() * 220;
  const pts = [[0,0]];
  for (let i = 1; i <= steps; i++) pts.push([(Math.random()-0.5)*28, h/steps*i]);
  return {
    d: pts.map((p,i)=>`${i===0?"M":"L"} ${p[0]+14} ${p[1]}`).join(" "),
    h, x: 3 + Math.random() * 94,
  };
};

function makeCloakPath(text, W, H, cx, hoodR) {
  const seed = text.split("").reduce((a,c,i)=>a+c.charCodeAt(0)*(i+1), 0);
  const numStrips = Math.max(3, Math.floor(W / 30));
  const sw = W / numStrips, gap = sw * 0.20, inn = sw - gap;
  let strips = "";
  for (let i = 0; i < numStrips; i++) {
    const x1  = (i*sw+gap/2).toFixed(1);
    const xm  = (i*sw+sw/2).toFixed(1);
    const x2  = (i*sw+gap/2+inn).toFixed(1);
    const tip = (H+4+Math.abs(Math.sin(seed*0.007+i*2.137))*14).toFixed(1);
    strips += ` L ${x1} ${(H-18).toFixed(1)} L ${xm} ${tip} L ${x2} ${(H-18).toFixed(1)}`;
  }
  return [
    `M ${cx} 7`,
    `C ${(cx-hoodR).toFixed(1)} 7, ${(cx-W/2+7).toFixed(1)} 24, ${(cx-W/2).toFixed(1)} 46`,
    `L ${(cx-W/2).toFixed(1)} ${(H-18).toFixed(1)}`,
    strips,
    `L ${(cx+W/2).toFixed(1)} ${(H-18).toFixed(1)}`,
    `L ${(cx+W/2).toFixed(1)} 46`,
    `C ${(cx+W/2-7).toFixed(1)} 24, ${(cx+hoodR).toFixed(1)} 7, ${cx} 7`,
    "Z",
  ].join(" ");
}

let _wid = 0, _pid = 0;

/* ══════════════════════════════════════════════════════════════
   GLOBAL CSS
══════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Noto+Sans+KR:wght@300;400;700&display=swap');
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

@keyframes wordIn     { from{opacity:0;transform:translateY(-14px) scale(.82);filter:blur(4px)} to{opacity:1;transform:none;filter:none} }
@keyframes demonDanger{ 0%,100%{filter:drop-shadow(0 0 10px rgba(255,30,30,.75)) drop-shadow(0 0 22px rgba(200,0,0,.4))} 50%{filter:drop-shadow(0 0 18px rgba(255,60,60,.95)) drop-shadow(0 0 40px rgba(220,0,0,.55))} }
@keyframes demonWarn  { 0%,100%{filter:drop-shadow(0 0 6px rgba(251,191,36,.5))} 50%{filter:drop-shadow(0 0 12px rgba(251,191,36,.75))} }
@keyframes pFly       { 0%{opacity:1;transform:translate(0,0) scale(1.2) rotate(0deg)} 100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(0) rotate(var(--rot))} }
@keyframes shake      { 0%{transform:translate(0,0) rotate(0)} 15%{transform:translate(-6px,4px) rotate(-.4deg)} 30%{transform:translate(6px,-4px) rotate(.4deg)} 55%{transform:translate(-3px,5px) rotate(-.2deg)} 75%{transform:translate(3px,-2px) rotate(.2deg)} 100%{transform:translate(0,0) rotate(0)} }
@keyframes comboIn    { 0%{opacity:0;transform:translate(-50%,-50%) scale(.3) rotate(-10deg)} 60%{opacity:1;transform:translate(-50%,-50%) scale(1.18) rotate(2deg)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)} }
@keyframes bolt       { 0%{opacity:0} 8%{opacity:.95} 20%{opacity:.18} 32%{opacity:.9} 50%{opacity:.05} 100%{opacity:0} }
@keyframes dmgFlash   { 0%{opacity:.4} 100%{opacity:0} }
@keyframes patronus   { 0%,100%{box-shadow:0 0 10px #0891b2,0 0 22px rgba(8,145,178,.3)} 50%{box-shadow:0 0 22px #22d3ee,0 0 44px rgba(34,211,238,.25)} }
@keyframes killFlash  { 0%{border-color:#22d3ee;box-shadow:0 0 0 3px rgba(34,211,238,.6),0 0 35px rgba(34,211,238,.45)} 100%{border-color:#0891b2;box-shadow:0 0 10px #0891b2} }
@keyframes titleGlow  { 0%,100%{text-shadow:0 0 14px #22d3ee,0 0 30px #0e7490} 50%{text-shadow:0 0 28px #67e8f9,0 0 56px #0891b2} }
@keyframes fog        { 0%,100%{transform:translateX(-7%) scaleX(1)} 50%{transform:translateX(4%) scaleX(1.05)} }
@keyframes vignette   { 0%,100%{opacity:.38} 50%{opacity:.72} }
@keyframes sPop       { 0%{transform:scale(1);color:#67e8f9} 40%{transform:scale(1.32);color:#a5f3fc} 100%{transform:scale(1);color:#67e8f9} }
@keyframes orbFloat   { 0%,100%{transform:translateY(0);opacity:.1} 50%{transform:translateY(-22px);opacity:.2} }
@keyframes ripple     { 0%{transform:translate(-50%,-50%) scale(.2);opacity:.9} 100%{transform:translate(-50%,-50%) scale(5);opacity:0} }
@keyframes torch      { 0%,100%{opacity:1} 18%{opacity:.6} 45%{opacity:.85} 72%{opacity:.5} }
@keyframes castleAmb  { 0%,100%{opacity:.06} 50%{opacity:.13} }

/* ── ★ 그리핀도르 타임 animations ── */
@keyframes gryffShimmer {
  0%,100% { color:#dc2626; text-shadow:0 0 22px rgba(220,38,38,.85),0 0 45px rgba(220,38,38,.4); }
  50%     { color:#ef4444; text-shadow:0 0 35px rgba(239,68,68,1),0 0 70px rgba(220,38,38,.6),0 0 100px rgba(220,38,38,.25); }
}
@keyframes gryffCountdown {
  0%   { transform:scale(1.35); opacity:.5; }
  100% { transform:scale(1);    opacity:1;  }
}
@keyframes gryffBorder {
  0%,100% { box-shadow:inset 0 0 0 5px rgba(220,38,38,.6),inset 0 0 30px rgba(220,38,38,.1); }
  50%     { box-shadow:inset 0 0 0 5px rgba(220,38,38,1), inset 0 0 60px rgba(220,38,38,.3); }
}
@keyframes gryffGoldPulse {
  0%,100% { opacity:.7; }
  50%     { opacity:1;  }
}

.dd-particle { position:absolute; pointer-events:none; z-index:25; line-height:1; will-change:transform,opacity;
  animation-name:pFly; animation-timing-function:cubic-bezier(.15,.5,.3,1); animation-fill-mode:forwards; animation-duration:var(--dur,.65s); }
.dd-input    { font-family:'Noto Sans KR','Malgun Gothic',sans-serif; animation:patronus 2.6s ease-in-out infinite; }
.dd-input:focus { animation:none!important; outline:none; border-color:#22d3ee!important; box-shadow:0 0 0 2px rgba(34,211,238,.4),0 0 28px rgba(34,211,238,.3)!important; }
.dd-kill     { animation:killFlash .38s ease-out forwards; }
.dd-shake    { animation:shake .42s ease-out; }
.dd-title    { animation:titleGlow 3s ease-in-out infinite; }
.dd-fog      { animation:fog 22s ease-in-out infinite; }
.dd-bolt     { animation:bolt .58s ease-out forwards; }
.dd-dmg      { animation:dmgFlash .42s ease-out forwards; }
.dd-vignet   { animation:vignette 1.4s ease-in-out infinite; }
.dd-spop     { animation:sPop .4s ease-out; }
.dd-danger   { animation:demonDanger .6s ease-in-out infinite!important; }
.dd-warn     { animation:demonWarn 1s ease-in-out infinite!important; }
.dd-btn { cursor:pointer; font-family:'Noto Sans KR',sans-serif; font-weight:700;
  letter-spacing:.08em; border-radius:12px; transition:background .18s,box-shadow .18s,transform .1s; }
.dd-btn:hover  { transform:translateY(-1px); }
.dd-btn:active { transform:scale(.97); }
`;

/* ══════════════════════════════════════════════════════════════
   DEMENTOR WORD COMPONENT
══════════════════════════════════════════════════════════════ */
function DementorWord({ text, x, y, danger, warning }) {
  const textW = text.length * CHAR_W;
  const W = textW + DEM_PAD * 2, H = DEMENTOR_H, cx = W / 2;
  const hoodR = Math.min(44, cx * 0.82);
  const cloak = makeCloakPath(text, W, H, cx, hoodR);
  const eyeCore = danger?"#ff9999":"#ccebff";
  const eyeGlow = danger?"rgba(255,80,80,.9)":"rgba(140,215,255,.82)";
  const eyeRGB  = danger?"255,60,60":"90,185,255";
  const aura    = danger?"rgba(70,0,0,.42)":"rgba(14,4,45,.32)";
  const cloakFg = danger?"rgba(24,3,14,.97)":"rgba(8,4,22,.95)";
  const textClr = danger?"#ff5555":warning?"#fbbf24":"#b8d2ea";
  const textGlw = danger?"rgba(255,60,60,.72)":warning?"rgba(251,191,36,.58)":"rgba(184,210,234,.32)";
  const animCls = danger?"dd-danger":warning?"dd-warn":"";
  return (
    <div className={animCls} style={{
      position:"absolute", left:x, top:y,
      pointerEvents:"none", willChange:"top",
      filter:animCls?undefined:"drop-shadow(0 0 3px rgba(80,140,255,.18))",
      animation:animCls?undefined:"wordIn .3s ease-out",
    }}>
      <svg width={W} height={H+16} style={{overflow:"visible"}}>
        <ellipse cx={cx} cy={H/2} rx={W/2+16} ry={H/2+12} fill={aura}/>
        <path d={cloak} fill={cloakFg}/>
        <ellipse cx={cx} cy={27} rx={hoodR-3} ry={18} fill="rgba(3,1,10,.84)"/>
        <ellipse cx={cx-9} cy={31} rx={7.5} ry={9} fill={`rgba(${eyeRGB},.22)`}/>
        <ellipse cx={cx+9} cy={31} rx={7.5} ry={9} fill={`rgba(${eyeRGB},.22)`}/>
        <ellipse cx={cx-9} cy={31} rx={4.5} ry={6} fill={eyeGlow}/>
        <ellipse cx={cx+9} cy={31} rx={4.5} ry={6} fill={eyeGlow}/>
        <ellipse cx={cx-9} cy={31} rx={2.2} ry={3} fill={eyeCore}/>
        <ellipse cx={cx+9} cy={31} rx={2.2} ry={3} fill={eyeCore}/>
        <text x={cx} y={66} textAnchor="middle" fontSize="15" letterSpacing="0.5"
          fontFamily="'Noto Sans KR','Malgun Gothic',sans-serif"
          fill={textClr} fontWeight={danger?"700":warning?"500":"300"}
          style={{filter:`drop-shadow(0 0 5px ${textGlw})`}}
        >{text}</text>
        <ellipse cx={cx-16} cy={H+6}  rx={W/6}   ry={4} fill="rgba(18,4,55,.34)"/>
        <ellipse cx={cx+16} cy={H+9}  rx={W/6}   ry={4} fill="rgba(18,4,55,.34)"/>
        <ellipse cx={cx}    cy={H+13} rx={W/3+4} ry={6} fill="rgba(18,4,55,.24)"/>
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   HOGWARTS SILHOUETTE  (memoised — never re-renders)
══════════════════════════════════════════════════════════════ */
const HogwartsSilhouette = memo(function HogwartsSilhouette() {
  return (
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:CASTLE_SVG_H,pointerEvents:"none",zIndex:15}}>
      <svg viewBox={`0 0 1000 ${CASTLE_SVG_H}`} width="100%" height={CASTLE_SVG_H}
        preserveAspectRatio="none" style={{display:"block",overflow:"visible"}}>
        <path d={CASTLE_EDGE_PATH} fill="none" stroke="rgba(255,155,35,.09)" strokeWidth={35}
          strokeLinejoin="round" style={{animation:"castleAmb 3.5s ease-in-out infinite"}}/>
        <path d={CASTLE_FILL_PATH} fill="rgba(4,2,14,.98)"/>
        {SPIRES.map((s,i)=>(
          <polygon key={i} points={`${s.x1},${s.by} ${s.mx},${s.py} ${s.x2},${s.by}`} fill="rgba(4,2,14,.99)"/>
        ))}
        <path d={CASTLE_EDGE_PATH} fill="none" stroke="rgba(130,165,220,.22)" strokeWidth={1.5} strokeLinejoin="round"/>
        {SPIRES.map((s,i)=>(
          <polyline key={i} points={`${s.x1},${s.by} ${s.mx},${s.py} ${s.x2},${s.by}`}
            fill="none" stroke="rgba(130,165,220,.22)" strokeWidth={1.5}/>
        ))}
        {WINS.map((w,i)=>{
          const r=255,g=182+(i*17)%55,b=42+(i*11)%42;
          const a=(0.48+(i*7)%28*0.012).toFixed(2);
          const dur=`${(1.4+(i*0.23)%1.2).toFixed(1)}s`, del=`${((i*0.19)%1.5).toFixed(2)}s`;
          return (
            <g key={i}>
              <rect x={w.cx-w.w/2-5} y={w.cy-4} width={w.w+10} height={w.h+8} rx={3}
                fill={`rgba(${r},${g},${b},.12)`} style={{animation:`torch ${dur} ease-in-out ${del} infinite`}}/>
              <rect x={w.cx-w.w/2} y={w.cy} width={w.w} height={w.h} rx={1}
                fill={`rgba(${r},${g},${b},${a})`} style={{animation:`torch ${dur} ease-in-out ${del} infinite`}}/>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   MAIN GAME COMPONENT
══════════════════════════════════════════════════════════════ */
export default function DementorDefense({ currentHouse: selectedHouse = "Gryffindor", onComplete }) {
  currentHouse = selectedHouse;

  /* ── DOM refs ──────────────────────────────────────────── */
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  /* ── loop refs ─────────────────────────────────────────── */
  const rafRef       = useRef(null);
  const spawnRef     = useRef(null);
  const boltRef      = useRef(null);
  const comboTimer   = useRef(null);
  const shakeTimer   = useRef(null);
  const killTimer    = useRef(null);
  /** 균등 스폰을 위한 단어 배치 큐. 빈 배열이면 makeBatch()로 재충전 */
  const wordQueueRef = useRef([]);

  /* ── ★ 그리핀도르 타임 refs ────────────────────────────── */
  const gryffindorActiveRef = useRef(false);  // 버프 활성화 여부 (RAF 내부에서 참조)
  const gryffindorTimerRef  = useRef(null);   // 카운트다운 interval ID

  /* ── mutable game-state refs (RAF closure) ─────────────── */
  const wordsRef    = useRef([]);
  const livesRef    = useRef(MAX_LIVES);
  const scoreRef    = useRef(0);
  const speedRef    = useRef(BASE_SPEED);
  const activeRef   = useRef(false);
  const t0Ref       = useRef(0);
  const lastRampRef = useRef(0);
  const comboRef    = useRef(0);
  const lastKillRef = useRef(0);

  /* ── React display state ───────────────────────────────── */
  const [words,              setWords]              = useState([]);
  const [score,              setScore]              = useState(0);
  const [lives,              setLives]              = useState(MAX_LIVES);
  const [phase,              setPhase]              = useState("start");
  const [dmg,                setDmg]                = useState(false);
  const [parts,              setParts]              = useState([]);
  const [ripples,            setRipples]            = useState([]);
  const [bolts,              setBolts]              = useState([]);
  const [combo,              setCombo]              = useState(null);
  const [inp,                setInp]                = useState("");
  const [spop,               setSpop]               = useState(false);
  const [shake,              setShake]              = useState(false);
  const [killFl,             setKillFl]             = useState(false);
  /* ★ 그리핀도르 타임 state */
  const [gryffindorActive,   setGryffindorActive]   = useState(false);
  const [gryffindorCountdown,setGryffindorCountdown]= useState(GRYFFINDOR_TIME_SEC);

  /* ── stop all loops ────────────────────────────────────── */
  const stop = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(rafRef.current);
    clearInterval(spawnRef.current);
    clearInterval(boltRef.current);
    clearInterval(gryffindorTimerRef.current); // ★ 그리핀도르 타이머도 정리
  }, []);

  /* ── damage flash + shake ──────────────────────────────── */
  const damage = useCallback(() => {
    setDmg(true); setTimeout(()=>setDmg(false), 450);
    setShake(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(()=>setShake(false), 460);
  }, []);

  /* ══════════════════════════════════════════════════════════
     ★ 점수 정규화 + 게임 완전 종료
     - 그리핀도르 타임 종료 후, 또는 일반 게임오버 시 호출
  ══════════════════════════════════════════════════════════ */
  const finalizeGame = useCallback(() => {
    // 점수 정규화: 0–100점 정수, 만점 초과 시 100으로 상한
    game1Score = Math.min(100, Math.round(scoreRef.current / MAX_NORMALIZED_SCORE * 100));
    onComplete?.(game1Score);

    console.log(
      `%c[Dementor Defense] 게임 종료`,
      "color:#22d3ee; font-weight:bold; font-size:14px;"
    );
    console.log(
      `  원점수: ${scoreRef.current}pts  |  만점기준: ${MAX_NORMALIZED_SCORE}pts\n` +
      `  game1Score (정규화): ${game1Score} / 100`
    );

    // TODO: 2번 게임 시작 함수 호출

    stop();
    setPhase("gameover");
  }, [stop, onComplete]);

  /* ══════════════════════════════════════════════════════════
     ★ 그리핀도르 타임 발동
     - 목숨 0 + currentHouse === "Gryffindor" 일 때만 호출됨
  ══════════════════════════════════════════════════════════ */
  const triggerGryffindorTime = useCallback(() => {
    gryffindorActiveRef.current = true;
    setGryffindorActive(true);
    setGryffindorCountdown(GRYFFINDOR_TIME_SEC);

    let remaining = GRYFFINDOR_TIME_SEC;
    gryffindorTimerRef.current = setInterval(() => {
      remaining -= 1;
      setGryffindorCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(gryffindorTimerRef.current);
        finalizeGame(); // 5초 만료 → 진짜 게임오버
      }
    }, 1000);
  }, [finalizeGame]);

  /* ── start / restart ───────────────────────────────────── */
  const startGame = useCallback(() => {
    stop();
    _wid=0; _pid=0;
    wordsRef.current=[]; livesRef.current=MAX_LIVES;
    scoreRef.current=0;  speedRef.current=BASE_SPEED;
    activeRef.current=true; t0Ref.current=0; lastRampRef.current=0;
    comboRef.current=0; lastKillRef.current=0;
    gryffindorActiveRef.current=false;            // ★ 그리핀도르 초기화
    wordQueueRef.current=[];                      // 단어 큐 초기화 (새 게임 시 새 배치)

    setWords([]); setScore(0); setLives(MAX_LIVES);
    setParts([]); setRipples([]); setBolts([]);
    setCombo(null); setInp(""); setDmg(false);
    setShake(false); setKillFl(false); setSpop(false);
    setGryffindorActive(false);                   // ★
    setGryffindorCountdown(GRYFFINDOR_TIME_SEC);  // ★
    setPhase("playing");
    setTimeout(()=>inputRef.current?.focus(), 80);
  }, [stop, onComplete]);

  /* ── lightning spawner ─────────────────────────────────── */
  useEffect(()=>{
    if (phase!=="playing") return;
    boltRef.current = setInterval(()=>{
      if (!activeRef.current||Math.random()>.48) return;
      const id=++_pid, b=mkLightning();
      setBolts(p=>[...p,{id,...b}]);
      setTimeout(()=>setBolts(p=>p.filter(l=>l.id!==id)), 620);
    }, 650);
    return ()=>clearInterval(boltRef.current);
  }, [phase]);

  /* ── word spawner ──────────────────────────────────────── */
  useEffect(()=>{
    if (phase!=="playing") return;
    const spawn=()=>{
      if (!activeRef.current||!containerRef.current) return;
      const cw=containerRef.current.offsetWidth;
      // 배치 큐가 비었으면 새 10단어 배치 생성 (길이 비율 균등 보장)
      if (wordQueueRef.current.length === 0) wordQueueRef.current = makeBatch();
      const text = wordQueueRef.current.pop();
      const dW=text.length*CHAR_W+DEM_PAD*2;
      const x=Math.max(8, Math.random()*(cw-dW-16));
      wordsRef.current=[...wordsRef.current,{id:++_wid,text,x,y:-(DEMENTOR_H+12),dW}];
      setWords([...wordsRef.current]);
    };
    spawn();
    const id=setInterval(spawn, SPAWN_MS);
    spawnRef.current=id;
    return ()=>clearInterval(id);
  }, [phase]);

  /* ══════════════════════════════════════════════════════════
     RAF GAME LOOP
     ★ 그리핀도르 타임 중에는 목숨 감소 없이 게임 유지
  ══════════════════════════════════════════════════════════ */
  useEffect(()=>{
    if (phase!=="playing") return;

    const tick=(ts)=>{
      if (!activeRef.current) return;
      if (!containerRef.current){rafRef.current=requestAnimationFrame(tick);return;}

      if (t0Ref.current===0){t0Ref.current=ts;lastRampRef.current=ts;}
      if ((ts-lastRampRef.current)/1000>SPEED_EVERY_S){
        speedRef.current=Math.min(speedRef.current+SPEED_INC, MAX_SPEED);
        lastRampRef.current=ts;
      }

      const H=containerRef.current.offsetHeight;
      const CW=containerRef.current.offsetWidth;
      const survivors=[]; let lost=0;

      for (const w of wordsRef.current) {
        const ny=w.y+speedRef.current;
        const xFrac=(w.x+(w.dW??80)/2)/CW;
        if (ny+DEMENTOR_H>=H-getHogwartsH(xFrac)) lost++;
        else survivors.push({...w,y:ny});
      }

      wordsRef.current=survivors;
      setWords([...survivors]);

      if (lost>0) {
        if (gryffindorActiveRef.current) {
          // ★ 그리핀도르 타임 중: 시각 효과만, 목숨 감소 없음
          damage();
        } else {
          // 일반 상태: 목숨 감소
          livesRef.current=Math.max(0, livesRef.current-lost);
          setLives(livesRef.current);
          damage();

          if (livesRef.current<=0) {
            if (currentHouse==="Gryffindor") {
              // ★ 그리핀도르 전용 버프 발동 → 5초 유예 후 게임오버
              // (Hufflepuff·Slytherin·Ravenclaw 는 이 분기에 진입하지 않음)
              triggerGryffindorTime();
              // 게임 루프는 계속 → 아래에서 다음 RAF 예약
            } else {
              // 그리핀도르 외 기숙사 → 버프 없이 즉시 게임오버
              finalizeGame();
              return; // RAF 루프 종료
            }
          }
        }
      }

      rafRef.current=requestAnimationFrame(tick);
    };

    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  }, [phase, stop, damage, triggerGryffindorTime, finalizeGame]);

  /* ── submit typed word ─────────────────────────────────── */
  const submit=useCallback(()=>{
    const typed=inp.trim();
    if (!typed) return;
    const idx=wordsRef.current.findIndex(w=>w.text===typed);
    if (idx!==-1){
      const hit=wordsRef.current[idx];
      wordsRef.current=wordsRef.current.filter((_,i)=>i!==idx);
      setWords([...wordsRef.current]);

      const now=Date.now();
      const newC=(now-lastKillRef.current<COMBO_MS&&lastKillRef.current>0)
                  ?comboRef.current+1:1;
      comboRef.current=newC; lastKillRef.current=now;

      const pts=PTS*Math.min(newC,6);
      scoreRef.current+=pts; setScore(scoreRef.current);
      setSpop(true); setTimeout(()=>setSpop(false),420);

      if (newC>=2){
        clearTimeout(comboTimer.current);
        setCombo({n:newC,key:now});
        comboTimer.current=setTimeout(()=>setCombo(null),1400);
      }

      const hitCX=hit.x+(hit.dW??80)/2, hitCY=hit.y+DEMENTOR_H/2;
      const numP=10+Math.min(newC*3,14);
      const newPs=Array.from({length:numP},(_,i)=>{
        const angle=(i/numP)*Math.PI*2+(Math.random()-.5)*.5;
        const dist=50+Math.random()*85;
        return {
          id:++_pid, x:hitCX-8, y:hitCY,
          tx:`${(Math.cos(angle)*dist).toFixed(1)}px`,
          ty:`${(Math.sin(angle)*dist).toFixed(1)}px`,
          rot:`${Math.round(Math.random()*360)}deg`,
          emoji:KILL_EMOJIS[i%KILL_EMOJIS.length],
          dur:`${(0.4+Math.random()*.38).toFixed(2)}s`,
          size:newC>=4?"1.55rem":newC>=2?"1.2rem":"1rem",
        };
      });
      setParts(p=>[...p,...newPs]);
      const ids=new Set(newPs.map(p=>p.id));
      setTimeout(()=>setParts(p=>p.filter(x=>!ids.has(x.id))),950);

      const rid=++_pid;
      setRipples(p=>[...p,{id:rid,x:hitCX,y:hitCY}]);
      setTimeout(()=>setRipples(p=>p.filter(r=>r.id!==rid)),700);

      setKillFl(true);
      clearTimeout(killTimer.current);
      killTimer.current=setTimeout(()=>setKillFl(false),400);
    }
    setInp("");
  },[inp]);

  const onKey=useCallback((e)=>{
    if (e.isComposing) return;
    if (e.key==="Enter"||e.key===" "){e.preventDefault();submit();}
  },[submit]);

  /* ── combo label ───────────────────────────────────────── */
  const comboLabel=(n)=>{
    if (n>=8) return {txt:"LEGENDARY!!",col:"#e879f9",sh:"rgba(232,121,249,.85)"};
    if (n>=6) return {txt:"INCREDIBLE!",col:"#f472b6",sh:"rgba(244,114,182,.78)"};
    if (n>=4) return {txt:"AMAZING!",   col:"#fb923c",sh:"rgba(251,146,60,.72)" };
    if (n>=3) return {txt:"GREAT!",     col:"#facc15",sh:"rgba(250,204,21,.68)" };
    return           {txt:"COMBO!",     col:"#a5f3fc",sh:"rgba(165,243,252,.62)"};
  };

  const cH  = containerRef.current?.offsetHeight ?? 560;
  const low = lives<=2 && !gryffindorActive;

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{CSS}</style>

      <div className={shake?"dd-shake":""} onAnimationEnd={()=>setShake(false)}
        style={{position:"relative",width:"100%",height:"100vh",background:"#020617",overflow:"hidden",userSelect:"none"}}>

        {/* starfield */}
        <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none"}}>
          {Array.from({length:90}).map((_,i)=>(
            <div key={i} style={{
              position:"absolute",
              width:i%11===0?2.5:i%4===0?1.5:1, height:i%11===0?2.5:i%4===0?1.5:1,
              background:"#fff",borderRadius:"50%",
              left:`${((i*137.508)%100).toFixed(2)}%`, top:`${((i*97.318+11)%88).toFixed(2)}%`,
              opacity:(0.05+(i%20)*0.004).toFixed(3),
            }}/>
          ))}
        </div>

        {/* orbs */}
        {[{sz:300,l:"10%",t:"18%",d:"8s"},{sz:220,l:"72%",t:"10%",d:"11s"},
          {sz:180,l:"45%",t:"52%",d:"9s"},{sz:160,l:"84%",t:"62%",d:"13s"}].map((o,i)=>(
          <div key={i} aria-hidden style={{
            position:"absolute",left:o.l,top:o.t,width:o.sz,height:o.sz,borderRadius:"50%",
            background:"radial-gradient(circle at 40% 40%, rgba(6,28,75,.3) 0%, transparent 70%)",
            animation:`orbFloat ${o.d} ease-in-out ${i*1.3}s infinite`,
            pointerEvents:"none",zIndex:1,
          }}/>
        ))}

        {/* fog */}
        <div className="dd-fog" aria-hidden style={{
          position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
          background:[
            "radial-gradient(ellipse 130% 45% at 50% 105%, rgba(6,182,212,.04) 0%, transparent 55%)",
            "radial-gradient(ellipse 100% 55% at 15% 90%, rgba(15,23,42,.5) 0%, transparent 65%)",
            "radial-gradient(ellipse 90% 50% at 85% 92%, rgba(10,15,35,.55) 0%, transparent 60%)",
          ].join(","),
        }}/>

        {/* low-life vignette */}
        {low&&<div className="dd-vignet" aria-hidden style={{
          position:"absolute",inset:0,pointerEvents:"none",zIndex:6,
          background:"radial-gradient(ellipse at center, transparent 32%, rgba(180,0,0,.4) 100%)",
        }}/>}

        {/* damage flash */}
        {dmg&&<div className="dd-dmg" aria-hidden style={{
          position:"absolute",inset:0,
          background:"rgba(220,38,38,.23)",border:"3px solid rgba(239,68,68,.54)",
          pointerEvents:"none",zIndex:94,
        }}/>}

        {/* ★ 그리핀도르 타임 — 빨간 테두리 */}
        {gryffindorActive&&(
          <div aria-hidden style={{
            position:"absolute",inset:0,pointerEvents:"none",zIndex:96,
            animation:"gryffBorder .6s ease-in-out infinite",
          }}/>
        )}

        {/* lightning */}
        {bolts.map(b=>(
          <svg key={b.id} className="dd-bolt" aria-hidden style={{
            position:"absolute",left:`${b.x}%`,top:0,
            width:28,height:b.h,overflow:"visible",pointerEvents:"none",zIndex:4,
          }}>
            <path d={b.d} stroke="rgba(190,225,255,.18)" strokeWidth={7}   fill="none" strokeLinecap="round"/>
            <path d={b.d} stroke="rgba(210,238,255,.55)" strokeWidth={2.5} fill="none" strokeLinecap="round"/>
            <path d={b.d} stroke="rgba(242,252,255,.96)" strokeWidth={1}   fill="none" strokeLinecap="round"/>
          </svg>
        ))}


        {/* ════ START ════════════════════════════════════════ */}
        {phase==="start"&&(
          <div style={{
            position:"absolute",inset:0,zIndex:50,padding:"1.5rem",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"1.4rem",
          }}>
            <div style={{fontSize:"4.2rem",lineHeight:1,filter:"drop-shadow(0 0 16px rgba(6,182,212,.55))"}}>🌫️</div>
            <h1 className="dd-title" style={{
              fontFamily:"'Cinzel','Georgia',serif",fontSize:"clamp(2rem,5vw,3.6rem)",
              fontWeight:700,color:"#a5f3fc",letterSpacing:".12em",textAlign:"center",
            }}>디멘터 방어</h1>
            <p style={{fontFamily:"'Cinzel',serif",color:"#334155",fontSize:".78rem",letterSpacing:".32em"}}>DEMENTOR DEFENSE</p>
            <div style={{
              background:"rgba(10,18,40,.88)",border:"1px solid rgba(6,182,212,.18)",
              borderRadius:"16px",padding:"1.25rem 1.75rem",maxWidth:"440px",
              textAlign:"center",color:"#7094b0",lineHeight:1.8,fontSize:".9rem",
              fontFamily:"'Noto Sans KR','Malgun Gothic',sans-serif",
            }}>
              <span style={{color:"#67e8f9",fontWeight:700}}>🧙 게임 방법</span><br/>
              디멘터들이 빠르게 하강합니다. 정확히 입력하고<br/>
              <span style={{color:"#a5f3fc"}}>Enter</span> 또는 <span style={{color:"#a5f3fc"}}>Space</span>로 물리치세요!<br/>
              <span style={{color:"#94a3b8"}}>디멘터가 호그와트 성벽에 닿으면 목숨이 깎입니다.</span><br/>
              {currentHouse==="Gryffindor"&&(
                <span style={{color:"#fca5a5",fontSize:".82rem"}}>
                  ⚔️ 그리핀도르는 목숨 0이 되어도 5초 버프!
                </span>
              )}
            </div>
            <button className="dd-btn" onClick={startGame} style={{
              padding:".9rem 2.6rem",fontSize:"1.05rem",color:"#a5f3fc",
              background:"rgba(8,145,178,.14)",border:"1.5px solid #0891b2",
              boxShadow:"0 0 18px rgba(6,182,212,.28)",
            }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(8,145,178,.3)";e.currentTarget.style.boxShadow="0 0 34px rgba(6,182,212,.52)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(8,145,178,.14)";e.currentTarget.style.boxShadow="0 0 18px rgba(6,182,212,.28)";}}
            >⚡ 익스펙토 패트로눔!</button>
          </div>
        )}


        {/* ════ GAME OVER ═════════════════════════════════════ */}
        {phase==="gameover"&&(
          <div style={{
            position:"absolute",inset:0,zIndex:50,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          }}>
            <div style={{
              background:"rgba(8,12,26,.95)",border:"1px solid rgba(248,113,113,.22)",
              borderRadius:"22px",padding:"2.5rem 3.2rem",
              display:"flex",flexDirection:"column",alignItems:"center",gap:".9rem",
              boxShadow:"0 0 60px rgba(220,38,38,.15),0 0 130px rgba(0,0,0,.65)",
              maxWidth:"400px",width:"90%",
            }}>
              <div style={{fontSize:"3.5rem"}}>💀</div>
              <h2 style={{
                fontFamily:"'Cinzel',serif",fontSize:"2.1rem",fontWeight:700,
                color:"#f87171",textShadow:"0 0 16px rgba(239,68,68,.5)",
              }}>GAME OVER</h2>
              <p style={{color:"#4b5e72",fontSize:".9rem"}}>영혼을 빼앗겼습니다…</p>

              {/* 원점수 */}
              <div style={{
                fontSize:"2.8rem",fontWeight:700,color:"#a5f3fc",
                textShadow:"0 0 12px #22d3ee",fontFamily:"'Cinzel',serif",
              }}>{score}점</div>

              {/* ★ 정규화 점수 표시 */}
              <div style={{
                display:"flex",alignItems:"center",gap:".6rem",
                background:"rgba(6,182,212,.08)",border:"1px solid rgba(6,182,212,.2)",
                borderRadius:"10px",padding:".5rem 1.2rem",
              }}>
                <span style={{color:"#64748b",fontSize:".82rem"}}>정규화 점수</span>
                <span style={{
                  fontFamily:"'Cinzel',serif",fontSize:"1.6rem",fontWeight:700,
                  color:"#22d3ee",textShadow:"0 0 8px rgba(34,211,238,.6)",
                }}>{game1Score}</span>
                <span style={{color:"#334155",fontSize:".9rem"}}> / 100</span>
              </div>

              <p style={{color:"#334155",fontSize:".82rem"}}>
                패트로눔 시전 <span style={{color:"#67e8f9",fontWeight:700}}>{Math.floor(score/PTS)}</span>회
                &nbsp;·&nbsp;만점기준 {MAX_NORMALIZED_SCORE}pts
              </p>
              <button className="dd-btn" onClick={startGame} style={{
                marginTop:".4rem",padding:".8rem 2rem",fontSize:".95rem",color:"#a5f3fc",
                background:"rgba(8,145,178,.14)",border:"1.5px solid #0891b2",
                boxShadow:"0 0 14px rgba(6,182,212,.22)",
              }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(8,145,178,.3)";e.currentTarget.style.boxShadow="0 0 26px rgba(6,182,212,.44)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(8,145,178,.14)";e.currentTarget.style.boxShadow="0 0 14px rgba(6,182,212,.22)";}}
              >🔄 다시 시도하기</button>
            </div>
          </div>
        )}


        {/* ════ PLAYING ════════════════════════════════════════ */}
        {phase==="playing"&&(
          <>
            {/* HUD */}
            <div style={{
              position:"absolute",top:0,left:0,right:0,height:"60px",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"0 1.4rem",
              background:"rgba(2,6,23,.9)",borderBottom:"1px solid rgba(6,182,212,.12)",
              backdropFilter:"blur(10px)",zIndex:30,
            }}>
              <div className={spop?"dd-spop":""} style={{
                fontFamily:"'Cinzel',serif",color:"#67e8f9",fontWeight:700,
                fontSize:"1.2rem",textShadow:"0 0 9px rgba(34,211,238,.55)",minWidth:"80px",
              }}>⚡ {score}</div>
              <div style={{color:"#1a2c42",fontSize:".68rem",letterSpacing:".25em",fontFamily:"'Cinzel',serif"}}>
                DEMENTOR DEFENSE
              </div>
              <div style={{display:"flex",gap:"4px",alignItems:"center",minWidth:"80px",justifyContent:"flex-end"}}>
                {Array.from({length:MAX_LIVES}).map((_,i)=>(
                  <span key={i} style={{
                    fontSize:"1.15rem",
                    opacity:i<lives?1:0.16,filter:i<lives?"none":"grayscale(1)",
                    transition:"opacity .35s,filter .35s",
                  }}>❤️</span>
                ))}
              </div>
            </div>

            {/* word / dementor area */}
            <div ref={containerRef} style={{
              position:"absolute",top:"60px",left:0,right:0,bottom:"82px",overflow:"hidden",
            }}>
              {words.map(w=>{
                const prog=w.y/cH;
                return <DementorWord key={w.id} text={w.text} x={w.x} y={w.y}
                  danger={prog>.70} warning={prog>.42}/>;
              })}
              {parts.map(p=>(
                <div key={p.id} className="dd-particle" style={{
                  left:p.x,top:p.y,fontSize:p.size,
                  "--tx":p.tx,"--ty":p.ty,"--dur":p.dur,"--rot":p.rot,
                }}>{p.emoji}</div>
              ))}
              {ripples.map(r=>(
                <div key={r.id} style={{
                  position:"absolute",left:r.x,top:r.y,
                  width:40,height:40,borderRadius:"50%",
                  border:"2px solid rgba(34,211,238,.8)",
                  pointerEvents:"none",zIndex:22,
                  animation:"ripple .65s ease-out forwards",
                }}/>
              ))}
              <HogwartsSilhouette/>
            </div>

            {/* ★ 그리핀도르 타임 오버레이 */}
            {gryffindorActive&&(
              <div style={{
                position:"absolute",
                top:"60px",bottom:"82px",left:0,right:0,
                display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",
                pointerEvents:"none",zIndex:55,
                gap:"0.5rem",
              }}>
                {/* 반투명 배경 */}
                <div style={{
                  position:"absolute",inset:0,
                  background:"radial-gradient(ellipse at center, rgba(80,0,0,.35) 0%, rgba(0,0,0,.1) 70%)",
                }}/>

                {/* 타이틀 */}
                <div style={{
                  fontFamily:"'Cinzel','Georgia',serif",
                  fontSize:"clamp(1.8rem,4vw,3rem)",
                  fontWeight:700,
                  letterSpacing:".1em",
                  textAlign:"center",
                  position:"relative",
                  animation:"gryffShimmer .5s ease-in-out infinite",
                  zIndex:1,
                }}>
                  ⚔️ 그리핀도르 타임!
                </div>

                {/* 카운트다운 숫자 — key 변경으로 매초 애니 리셋 */}
                <div
                  key={gryffindorCountdown}
                  style={{
                    fontFamily:"'Cinzel',serif",
                    fontSize:"clamp(5rem,12vw,8rem)",
                    fontWeight:700,
                    color:"#fbbf24",
                    textShadow:"0 0 30px rgba(251,191,36,.9),0 0 60px rgba(251,191,36,.5)",
                    lineHeight:1,
                    position:"relative",
                    animation:"gryffCountdown .4s cubic-bezier(.22,1,.36,1) forwards",
                    zIndex:1,
                  }}
                >{gryffindorCountdown}</div>

                {/* 서브 메시지 */}
                <div style={{
                  color:"#fca5a5",fontSize:"1rem",letterSpacing:".05em",
                  fontFamily:"'Noto Sans KR',sans-serif",
                  position:"relative",zIndex:1,
                  animation:"gryffGoldPulse .8s ease-in-out infinite",
                }}>
                  계속 싸워라! 단어를 쳐서 점수를 올려라!
                </div>

                {/* 골드 하단 선 장식 */}
                <div style={{
                  width:"200px",height:"2px",
                  background:"linear-gradient(90deg, transparent, #fbbf24, transparent)",
                  position:"relative",zIndex:1,marginTop:"0.5rem",
                  animation:"gryffGoldPulse 1s ease-in-out infinite",
                }}/>
              </div>
            )}

            {/* combo display */}
            {combo&&(()=>{
              const{txt,col,sh}=comboLabel(combo.n);
              return (
                <div key={combo.key} style={{
                  position:"absolute",top:"26%",left:"50%",
                  transform:"translate(-50%,-50%)",
                  zIndex:45,pointerEvents:"none",textAlign:"center",
                  animation:"comboIn .32s cubic-bezier(.175,.885,.32,1.275) forwards",
                }}>
                  <div style={{
                    fontFamily:"'Cinzel',serif",
                    fontSize:combo.n>=6?"3.8rem":combo.n>=4?"3.2rem":"2.6rem",
                    fontWeight:700,color:col,
                    textShadow:`0 0 18px ${sh},0 0 40px ${sh}`,
                    letterSpacing:".05em",
                  }}>{combo.n}× {txt}</div>
                  <div style={{color:"#94a3b8",fontSize:".85rem",marginTop:"3px"}}>
                    +{PTS*Math.min(combo.n,6)}점
                  </div>
                </div>
              );
            })()}

            {/* input area */}
            <div style={{
              position:"absolute",bottom:0,left:0,right:0,height:"82px",
              display:"flex",alignItems:"center",gap:"12px",padding:"0 1.25rem",
              background: gryffindorActive
                ? "rgba(40,8,8,.97)"   // ★ 그리핀도르 타임엔 붉은 배경
                : "rgba(2,6,23,.97)",
              borderTop: gryffindorActive
                ? "1px solid rgba(220,38,38,.5)"
                : "1px solid rgba(6,182,212,.14)",
              transition:"background .4s,border-color .4s",
              zIndex:30,
            }}>
              <span style={{fontSize:"1.45rem",flexShrink:0,lineHeight:1}}>
                {gryffindorActive ? "⚔️" : "🪄"}
              </span>
              <input
                ref={inputRef} value={inp}
                onChange={e=>setInp(e.target.value)} onKeyDown={onKey}
                placeholder={gryffindorActive
                  ? "빨리 입력해! 시간이 없어!"
                  : "주문을 입력하세요… (Enter / Space)"}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                className={killFl?"dd-kill":"dd-input"}
                style={{
                  flex:1,height:"50px",
                  background: gryffindorActive?"rgba(55,5,5,.6)":"rgba(5,30,55,.55)",
                  border: gryffindorActive?"1.5px solid #dc2626":"1.5px solid #0891b2",
                  borderRadius:"12px",padding:"0 1rem",color:"#dff4ff",
                  fontSize:"1rem",letterSpacing:".04em",
                  transition:"background .4s,border-color .4s",
                }}
              />
              <button className="dd-btn" onClick={submit} style={{
                height:"50px",padding:"0 1.2rem",
                background: gryffindorActive?"rgba(220,38,38,.25)":"rgba(8,145,178,.18)",
                border: gryffindorActive?"1px solid rgba(220,38,38,.7)":"1px solid rgba(8,145,178,.55)",
                color: gryffindorActive?"#fca5a5":"#a5f3fc",
                fontSize:".88rem",whiteSpace:"nowrap",flexShrink:0,
                letterSpacing:".06em",borderRadius:"12px",
                transition:"background .4s,border-color .4s,color .4s",
              }}
                onMouseEnter={e=>e.currentTarget.style.background=gryffindorActive?"rgba(220,38,38,.45)":"rgba(8,145,178,.4)"}
                onMouseLeave={e=>e.currentTarget.style.background=gryffindorActive?"rgba(220,38,38,.25)":"rgba(8,145,178,.18)"}
              >{gryffindorActive?"싸워라! ⚔️":"패트로눔 ✨"}</button>
            </div>
          </>
        )}

      </div>
    </>
  );
}
