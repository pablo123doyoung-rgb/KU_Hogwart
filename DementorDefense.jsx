import { useMemo, useState } from "react";
import HogwartsSorting from "./components/HogwartsSorting";
import DementorDefense from "./components/DementorDefense";
import ShieldRush from "./components/ShieldRush";
import HogwartsDanmaku from "./components/HogwartsDanmaku";
import HogwartsBroomRush from "./components/HogwartsBroomRush";

const STEP = {
  QUIZ: "quiz",
  GAME1: "game1",
  GAME2: "game2",
  GAME3: "game3",
  GAME4: "game4",
  REPORT: "report",
};

const INITIAL_SCORES = {
  game1Score: 0,
  game2Score: 0,
  game3Score: 0,
  game4Score: 0,
};

const HOUSE_META = {
  Gryffindor: {
    ko: "그리핀도르",
    logo: "🦁",
    color: "#b81f32",
    accent: "#f5c842",
    buff: "1게임 산성비: 위기 상황에서 추가 생존 시간",
  },
  Hufflepuff: {
    ko: "후플푸프",
    logo: "🦡",
    color: "#e3b341",
    accent: "#3d2a10",
    buff: "2게임 방향키: 시작 목숨 +1",
  },
  Slytherin: {
    ko: "슬리데린",
    logo: "🐍",
    color: "#0f6b4f",
    accent: "#c9d8d0",
    buff: "3게임 슈팅: 보조 공격 소환",
  },
  Ravenclaw: {
    ko: "래번클로",
    logo: "🦅",
    color: "#244a9b",
    accent: "#c8d8ff",
    buff: "4게임 러닝: 독수리 물약 등장",
  },
};

const SCORE_ROWS = [
  ["game1Score", "1게임", "집중력"],
  ["game2Score", "2게임", "방어력"],
  ["game3Score", "3게임", "공격력"],
  ["game4Score", "4게임", "순발력"],
];

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getGrade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function FinalReportCard({ currentHouse, scores, playerName, onRestart }) {
  const finalScore = Math.round(
    (scores.game1Score + scores.game2Score + scores.game3Score + scores.game4Score) / 4
  );
  const passed = finalScore >= 60;
  const house = HOUSE_META[currentHouse] ?? {
    ko: "미배정",
    logo: "✦",
    color: "#6a3e12",
    accent: "#6a3e12",
    buff: "기숙사 버프 없음",
  };

  return (
    <main className="report-scene">
      <section className="parchment" style={{ "--house": house.color }}>
        <div className="parchment-content">
          <div className="star-row" aria-hidden="true">✦ ✦ ✦</div>

          <h1 className="school-name">HOGWARTS SCHOOL<br />OF WITCHCRAFT AND WIZARDRY</h1>
          <p className="report-sub">Official End-of-Term Assessment · Mini Game Trials</p>

          <div className="deco-rule"><span>✦</span></div>

          <div className="student-block">
            <div>
              <span className="info-label">STUDENT</span>
              <span className="info-value">{playerName || "Young Wizard"}</span>
            </div>
            <div className="house-block">
              <div className="house-info">
                <span className="info-label">HOUSE</span>
                <span className="info-value">{currentHouse || "Unsorted"}</span>
              </div>
              <div className="house-crest" aria-label={house.ko}>{house.logo}</div>
            </div>
          </div>

          <table className="grade-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Score</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_ROWS.map(([key, gameLabel, statLabel]) => {
                const score = scores[key];
                const grade = getGrade(score);
                return (
                  <tr key={key}>
                    <td>
                      <span className="g-num">{gameLabel}</span>
                      <span className="g-name">{statLabel} - {STAT_EN[key]}</span>
                    </td>
                    <td><span className="score-num">{score}<span className="score-pt"> pt</span></span></td>
                    <td className="grade-cell"><span className={`gbadge g${grade}`}>{grade}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="deco-rule"><span>✦</span></div>

          <div className="summary-row">
            <div>
              <span className="avg-label">FINAL SCORE</span>
              <span className="avg-num">{finalScore}</span><span className="avg-unit"> pt</span>
            </div>
            <div className={passed ? "verdict-pass" : "verdict-fail"}>
              {passed ? "PASS" : "FAIL"}
            </div>
          </div>

          <p className="buff-note">Applied house charm: {house.buff}</p>

          <div className="sig-area">
            <div>
              <div className="sig-name">Albus P. W. B. Dumbledore</div>
              <div className="sig-title">HEADMASTER · HOGWARTS</div>
            </div>
            <div className="stamp-wrap pop" aria-hidden="true">
              <svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="40" r="38" fill="none" stroke="#8b0015" strokeWidth="3" />
                <circle cx="40" cy="40" r="30" fill="none" stroke="#8b0015" strokeWidth="0.8" />
                <path d="M40 11 L42.2 18.5 L50 18.5 L43.8 23.2 L46 30.5 L40 25.8 L34 30.5 L36.2 23.2 L30 18.5 L37.8 18.5 Z" fill="#8b0015" />
                <text x="40" y="46" textAnchor="middle" fontFamily="Cinzel,serif" fontSize="6" fontWeight="700" fill="#8b0015" letterSpacing="2">CERTIFIED</text>
                <text x="40" y="56" textAnchor="middle" fontFamily="Cinzel,serif" fontSize="5" fill="#8b0015" letterSpacing="1.5">HOGWARTS</text>
                <text x="40" y="64" textAnchor="middle" fontFamily="Cinzel,serif" fontSize="4.5" fill="#8b0015" letterSpacing="1">2026</text>
              </svg>
            </div>
          </div>

          <div className="restart-wrap">
            <button className="rbtn" type="button" onClick={onRestart}>✦ 처음부터 다시 하기 ✦</button>
          </div>
        </div>
      </section>
    </main>
  );
}

const STAT_EN = {
  game1Score: "Concentration",
  game2Score: "Defence",
  game3Score: "Offence",
  game4Score: "Reflexes",
};

export default function App() {
  const [currentStep, setCurrentStep] = useState(STEP.QUIZ);
  const [currentHouse, setCurrentHouse] = useState("");
  const [scores, setScores] = useState(INITIAL_SCORES);
  const [playerName, setPlayerName] = useState("");

  const sharedGameProps = useMemo(
    () => ({
      currentHouse,
    }),
    [currentHouse]
  );

  const saveScoreAndMove = (scoreKey, nextStep) => (rawScore) => {
    setScores((prev) => ({
      ...prev,
      [scoreKey]: clampScore(rawScore),
    }));
    setCurrentStep(nextStep);
  };

  const handleSortingComplete = ({ house, name }) => {
    setCurrentHouse(house);
    setPlayerName(name ?? "");
    setCurrentStep(STEP.GAME1);
  };

  const restart = () => {
    setCurrentStep(STEP.QUIZ);
    setCurrentHouse("");
    setScores(INITIAL_SCORES);
    setPlayerName("");
  };

  return (
    <>
      {currentStep === STEP.QUIZ && (
        <HogwartsSorting onComplete={handleSortingComplete} />
      )}

      {currentStep === STEP.GAME1 && (
        <DementorDefense
          {...sharedGameProps}
          onComplete={saveScoreAndMove("game1Score", STEP.GAME2)}
        />
      )}

      {currentStep === STEP.GAME2 && (
        <ShieldRush
          {...sharedGameProps}
          onComplete={saveScoreAndMove("game2Score", STEP.GAME3)}
        />
      )}

      {currentStep === STEP.GAME3 && (
        <HogwartsDanmaku
          {...sharedGameProps}
          onComplete={saveScoreAndMove("game3Score", STEP.GAME4)}
        />
      )}

      {currentStep === STEP.GAME4 && (
        <HogwartsBroomRush
          {...sharedGameProps}
          onComplete={saveScoreAndMove("game4Score", STEP.REPORT)}
        />
      )}

      {currentStep === STEP.REPORT && (
        <FinalReportCard
          currentHouse={currentHouse}
          scores={scores}
          playerName={playerName}
          onRestart={restart}
        />
      )}

      <style>{REPORT_STYLES}</style>
    </>
  );
}

const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=IM+Fell+English:ital@0;1&display=swap');
  .report-scene {
    min-height: 100vh;
    padding: 40px 16px 48px;
    background: #1a0f05;
    font-family: "IM Fell English", Georgia, serif;
  }
  .parchment {
    position: relative;
    max-width: 600px;
    margin: 0 auto;
    padding: 48px 52px 56px;
    background-color: #e8d09a;
    background-image:
      radial-gradient(ellipse 60% 40% at 8% 6%, #c89050 0%, transparent 55%),
      radial-gradient(ellipse 50% 35% at 92% 94%, #b87830 0%, transparent 50%),
      radial-gradient(ellipse 70% 50% at 50% 50%, #f0dfa8 0%, #d4b060 100%),
      radial-gradient(ellipse 30% 20% at 15% 85%, #a06820 0%, transparent 40%),
      radial-gradient(ellipse 25% 18% at 88% 12%, #b87030 0%, transparent 38%);
    border-radius: 2px;
    box-shadow:
      inset 0 0 0 2px rgba(100,55,10,0.25),
      inset 0 0 40px rgba(80,40,5,0.35),
      6px 10px 40px rgba(0,0,0,0.75),
      12px 18px 80px rgba(0,0,0,0.5);
    clip-path: polygon(
      0.3% 0.8%, 1.2% 0.1%, 2.8% 0.9%, 4.5% 0%,
      7% 1.1%, 10% 0.2%, 13% 1%, 17% 0.3%, 22% 1.2%,
      27% 0.2%, 33% 1%, 40% 0.1%, 48% 1.1%, 56% 0.2%,
      63% 1%, 70% 0.3%, 76% 1.1%, 82% 0.1%, 88% 1%,
      93% 0.2%, 97% 0.9%, 99.2% 0.1%, 100% 1.5%,
      99.5% 4%, 100% 8%, 99.6% 14%, 100% 22%, 99.7% 32%,
      100% 44%, 99.5% 58%, 100% 72%, 99.7% 84%, 100% 92%,
      99.4% 98%, 98.8% 100%, 97% 99.2%, 94% 99.8%,
      90% 99%, 86% 99.7%, 81% 99.1%, 75% 99.8%, 68% 99.1%,
      60% 99.9%, 52% 99.1%, 44% 99.8%, 36% 99.1%,
      28% 99.8%, 21% 99%, 15% 99.7%, 9% 99%, 4% 99.6%,
      1% 99.2%, 0.1% 98.5%, 0.5% 92%, 0% 84%, 0.4% 75%,
      0% 64%, 0.5% 53%, 0% 42%, 0.3% 30%, 0% 18%, 0.4% 8%
    );
  }
  .parchment::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      radial-gradient(ellipse 40% 30% at 5% 8%, rgba(60,30,5,0.55) 0%, transparent 50%),
      radial-gradient(ellipse 35% 25% at 95% 92%, rgba(50,25,5,0.5) 0%, transparent 48%),
      radial-gradient(ellipse 30% 20% at 8% 92%, rgba(70,35,8,0.45) 0%, transparent 45%),
      radial-gradient(ellipse 28% 18% at 93% 7%, rgba(55,28,6,0.4) 0%, transparent 42%);
  }
  .parchment::after {
    content: "";
    position: absolute;
    inset: 16px;
    z-index: 1;
    pointer-events: none;
    border: 1px solid rgba(90,50,10,0.35);
  }
  .parchment-content {
    position: relative;
    z-index: 2;
  }
  .star-row {
    text-align: center;
    margin-bottom: 4px;
    color: #5a3010;
    opacity: 0.55;
    letter-spacing: 5px;
    font-size: 13px;
  }
  .school-name {
    margin: 0;
    font-family: "Cinzel", serif;
    font-size: 11.5px;
    font-weight: 900;
    color: #1a0800;
    letter-spacing: 0.22em;
    text-align: center;
    line-height: 1.8;
    text-shadow: 0 1px 0 rgba(255,220,120,0.3);
  }
  .report-sub {
    margin: 3px 0 0;
    font-style: italic;
    font-size: 11px;
    color: #5a3510;
    text-align: center;
    letter-spacing: 0.06em;
  }
  .deco-rule {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
  }
  .deco-rule::before, .deco-rule::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(90,50,10,0.6), transparent);
  }
  .deco-rule span {
    font-size: 11px;
    color: #7a4a15;
    letter-spacing: 3px;
  }
  .student-block {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 16px 0 14px;
    padding-bottom: 13px;
    border-bottom: 1px solid rgba(90,50,10,0.35);
  }
  .info-label {
    display: block;
    margin-bottom: 3px;
    font-family: "Cinzel", serif;
    font-size: 8px;
    letter-spacing: 0.2em;
    color: #7a4820;
  }
  .info-value {
    font-style: italic;
    font-size: 14px;
    color: #120700;
  }
  .house-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .house-info {
    text-align: right;
  }
  .house-crest {
    width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--house) 62%, rgba(90,50,10,0.5));
    background: color-mix(in srgb, var(--house) 14%, transparent);
    font-size: 22px;
  }
  .grade-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 16px;
  }
  .grade-table thead tr {
    border-bottom: 2px solid rgba(90,50,10,0.5);
  }
  .grade-table th {
    padding: 4px 6px 7px;
    text-align: left;
    font-family: "Cinzel", serif;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #3e1f08;
  }
  .grade-table th:nth-child(2), .grade-table th:nth-child(3) {
    text-align: center;
  }
  .grade-table tbody tr {
    border-bottom: 1px dashed rgba(90,50,10,0.2);
  }
  .grade-table tbody tr:last-child {
    border-bottom: none;
  }
  .grade-table td {
    padding: 9px 6px;
    vertical-align: middle;
  }
  .g-num {
    display: block;
    font-family: "Cinzel", serif;
    font-size: 8.5px;
    letter-spacing: 0.05em;
    color: #8a5528;
  }
  .g-name {
    display: block;
    margin-top: 1px;
    font-style: italic;
    font-size: 13.5px;
    color: #120700;
  }
  .score-num {
    display: block;
    text-align: center;
    font-family: "Cinzel", serif;
    font-size: 15px;
    font-weight: 700;
    color: #1a0800;
  }
  .score-pt {
    font-size: 9px;
    color: #8a5528;
    font-weight: 400;
  }
  .grade-cell {
    text-align: center;
  }
  .gbadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    border: 1.5px solid;
    font-family: "Cinzel", serif;
    font-weight: 900;
    font-size: 12px;
  }
  .gA { background: rgba(15,55,8,0.16); color: #173d07; border-color: #285e12; }
  .gB { background: rgba(8,28,80,0.13); color: #0a2460; border-color: #123490; }
  .gC { background: rgba(95,65,0,0.16); color: #6a4600; border-color: #9a6500; }
  .gD { background: rgba(95,38,0,0.14); color: #6a2500; border-color: #9a3900; }
  .gF { background: rgba(95,0,0,0.16); color: #6a0010; border-color: #9a0018; }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin: 6px 0 12px;
    background: rgba(70,35,5,0.1);
    border: 1px solid rgba(90,50,10,0.35);
    border-radius: 1px;
  }
  .avg-label {
    display: block;
    margin-bottom: 4px;
    font-family: "Cinzel", serif;
    font-size: 8px;
    letter-spacing: 0.18em;
    color: #5a3010;
  }
  .avg-num {
    font-family: "Cinzel", serif;
    font-size: 26px;
    font-weight: 900;
    color: #120700;
    line-height: 1;
  }
  .avg-unit {
    font-size: 11px;
    color: #6a3e12;
  }
  .verdict-pass, .verdict-fail {
    font-family: "Cinzel", serif;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: 0.28em;
    text-shadow: 1px 1px 0 rgba(0,0,0,0.12);
  }
  .verdict-pass { color: #1a500a; }
  .verdict-fail { color: #7a0008; }
  .buff-note {
    margin: 0 0 10px;
    color: #5a3010;
    font-size: 12px;
    font-style: italic;
  }
  .sig-area {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 8px;
  }
  .sig-name {
    padding-right: 28px;
    padding-bottom: 3px;
    border-bottom: 1px solid rgba(90,50,10,0.4);
    font-style: italic;
    font-size: 16px;
    color: #120700;
  }
  .sig-title {
    margin-top: 4px;
    font-family: "Cinzel", serif;
    font-size: 8px;
    letter-spacing: 0.1em;
    color: #6a3e12;
  }
  .stamp-wrap {
    opacity: 0;
    transform: rotate(-14deg) scale(2.8);
    transform-origin: center;
  }
  .stamp-wrap.pop {
    animation: stp 0.38s cubic-bezier(0.18,0.89,0.32,1.28) 0.25s forwards;
  }
  @keyframes stp {
    0% { opacity: 0; transform: rotate(-14deg) scale(2.8); }
    55% { opacity: 1; transform: rotate(-14deg) scale(0.9); }
    78% { transform: rotate(-14deg) scale(1.06); }
    100% { opacity: 0.82; transform: rotate(-14deg) scale(1); }
  }
  .restart-wrap {
    margin-top: 32px;
    padding-top: 16px;
    text-align: center;
    border-top: 1px solid rgba(90,50,10,0.28);
  }
  .rbtn {
    border: 1px solid rgba(90,50,10,0.4);
    border-radius: 1px;
    padding: 8px 28px;
    color: #3a1e06;
    background: rgba(80,45,10,0.08);
    font-family: "Cinzel", serif;
    font-size: 10px;
    letter-spacing: 0.15em;
    cursor: pointer;
    transition: background 0.2s;
  }
  .rbtn:hover {
    background: rgba(80,45,10,0.18);
  }
  @media (max-width: 640px) {
    .report-scene {
      padding: 20px 10px 28px;
    }
    .parchment {
      padding: 36px 26px 42px;
    }
    .student-block, .summary-row, .sig-area {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
    }
    .house-info {
      text-align: left;
    }
    .grade-table th, .grade-table td {
      padding-left: 3px;
      padding-right: 3px;
    }
    .verdict-pass, .verdict-fail {
      font-size: 24px;
    }
  }
`;
