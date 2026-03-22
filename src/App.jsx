import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONSTANTS
// ============================================================
const TEAMS = [
  "$SLU","$MICH","$LOU","$MICHST","$TCU","$DUKE","$TEXAM","$HOU",
  "$TEXAS","$GONZ","$VCU","$ILL","$VAN","$NEB","$HIGHP","$ARK",
  "$MIA","$PUR","$KY","$IOWAST","$STJ","$KAN","$TENN","$VIRG",
  "$IOWA","$FL","$UTAHST","$ARIZ","$UCLA","$CONN","$TTECH","$ALA"
];

const TOKENS_PER_MINT = 64;
const ROUND_DURATION = 30;
const LEADERBOARD_SIZE = 100;
const NAME_MAX_LEN = 6;

const PROFANITY_PATTERNS = [
  /fuck/i, /f.?u.?c.?k/i, /fck/i, /fuk/i,
  /nigg/i, /n.?i.?g.?g/i, /n1gg/i,
  /kike/i, /k.?i.?k.?e/i,
];

function isProfane(name) {
  return PROFANITY_PATTERNS.some(p => p.test(name));
}

const GOOD_COMMENTS = [
  "March Cashness!",
  "He's money on the line!",
  "Getting paid at the charity stripe!",
  "Cash money from the free throw line!",
  "That's how you cash a check!",
  "Making it rain at the stripe!",
  "Automatic from the line!",
  "The bank is OPEN!",
  "Printing money at the line!",
  "He came to collect!",
];

const BAD_COMMENTS = [
  "He put his money where his mouth was, and came up empty.",
  "Coming back broke from the charity stripe.",
  "Insufficient funds at the free throw line.",
  "That account is overdrawn!",
  "Bankrupt at the stripe!",
  "No cash, no splash.",
  "The bank said NO.",
  "He bounced harder than those checks.",
  "Filing for free throw bankruptcy.",
  "That was a bad investment.",
];

const MID_COMMENTS = [
  "Breaking even at the charity stripe.",
  "A modest return on investment.",
  "Not rich, not broke. Just getting by.",
  "Penny pinching at the line.",
  "A blue chip... savings bond.",
  "Steady Eddie at the stripe.",
];

function getComment(made, attempted) {
  if (attempted === 0) return BAD_COMMENTS[Math.floor(Math.random() * BAD_COMMENTS.length)];
  const pct = made / attempted;
  if (pct >= 0.7) return GOOD_COMMENTS[Math.floor(Math.random() * GOOD_COMMENTS.length)];
  if (pct >= 0.4) return MID_COMMENTS[Math.floor(Math.random() * MID_COMMENTS.length)];
  return BAD_COMMENTS[Math.floor(Math.random() * BAD_COMMENTS.length)];
}

// ============================================================
// API HELPERS (Railway PostgreSQL backend)
// ============================================================
async function fetchGameData() {
  try {
    const res = await fetch('/api/gamedata');
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch (e) {
    console.error("Fetch game data failed:", e);
    return null;
  }
}

async function apiMint(team) {
  try {
    await fetch('/api/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, amount: TOKENS_PER_MINT })
    });
  } catch (e) {
    console.error("Mint failed:", e);
  }
}

async function apiRecordRound(team, made, attempted) {
  try {
    await fetch('/api/round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, made, attempted })
    });
  } catch (e) {
    console.error("Record round failed:", e);
  }
}

async function apiAddLeaderboard(name, score, team) {
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, team })
    });
  } catch (e) {
    console.error("Add leaderboard failed:", e);
  }
}

async function apiReset() {
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (e) {
    console.error("Reset failed:", e);
  }
}

function defaultGameData() {
  return {
    teamTokens: {},
    teamFTMade: {},
    teamFTAttempted: {},
    playerLeaderboard: []
  };
}

// ============================================================
// PIXEL FONT STYLE (Game Boy aesthetic)
// ============================================================
const GB_BG = "#c4cfa1";
const GB_DARK = "#1a1a1a";
const GB_MID = "#6b7353";
const GB_LIGHT = "#8b956b";

const pixelFont = `'Press Start 2P', monospace`;

// ============================================================
// SVG COMPONENTS (Game Boy style pixel art)
// ============================================================
function BackboardSVG({ cursorX, cursorY, showCursor, shotLocation }) {
  return (
    <svg viewBox="0 0 500 500" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* Background - court wall */}
      <rect x="0" y="0" width="500" height="500" fill={GB_BG} />
      
      {/* Raster graphic — backboard, rim, net, and shooter */}
      <image
        href="/main-graphic.png"
        x="0" y="0"
        width="500" height="500"
        preserveAspectRatio="xMidYMid meet"
        style={{ imageRendering: "pixelated" }}
      />
      
      {/* Shot location marker - shows where the player tapped */}
      {shotLocation && (
        <g transform={`translate(${shotLocation.x}, ${shotLocation.y})`}>
          <line x1="-10" y1="-10" x2="10" y2="10" stroke={GB_DARK} strokeWidth="3" />
          <line x1="10" y1="-10" x2="-10" y2="10" stroke={GB_DARK} strokeWidth="3" />
          <text
            x="0" y="22"
            textAnchor="middle"
            fontFamily={pixelFont}
            fontSize="10"
            fill={GB_DARK}
          >
            {shotLocation.made ? "SWISH!" : "MISS"}
          </text>
        </g>
      )}
      
      {/* Crosshair cursor - hidden while shot location is displayed */}
      {showCursor && !shotLocation && (
        <g transform={`translate(${cursorX}, ${cursorY})`}>
          <line x1="-12" y1="0" x2="-4" y2="0" stroke={GB_DARK} strokeWidth="3" />
          <line x1="4" y1="0" x2="12" y2="0" stroke={GB_DARK} strokeWidth="3" />
          <line x1="0" y1="-12" x2="0" y2="-4" stroke={GB_DARK} strokeWidth="3" />
          <line x1="0" y1="4" x2="0" y2="12" stroke={GB_DARK} strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

function HomeSVG() {
  return (
    <svg viewBox="0 0 400 400" style={{ width: "70%", maxWidth: 280, display: "block", margin: "0 auto" }}>
      <rect x="0" y="0" width="400" height="400" fill={GB_BG} />
      <image
        href="/main-graphic.png"
        x="0" y="0"
        width="400" height="400"
        preserveAspectRatio="xMidYMid meet"
        style={{ imageRendering: "pixelated" }}
      />
    </svg>
  );
}

function PixelTriangle({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, imageRendering: "pixelated" }}
    >
      <rect x="0" y="0" width="2" height="8" fill="currentColor" />
      <rect x="2" y="1" width="2" height="6" fill="currentColor" />
      <rect x="4" y="2" width="2" height="4" fill="currentColor" />
      <rect x="6" y="3" width="2" height="2" fill="currentColor" />
    </svg>
  );
}
const SCREENS = {
  HOME: "home",
  TEAM_SELECT: "team_select",
  GAMEPLAY: "gameplay",
  ROUND_RESULT: "round_result",
  LEADERBOARD: "leaderboard",
  ADMIN: "admin",
};

// ============================================================
// MAIN APP
// ============================================================
export default function MoneyOnTheLine() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [gameData, setGameData] = useState(defaultGameData());
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [roundResult, setRoundResult] = useState(null); // { made, attempted, team }
  const [leaderboardTab, setLeaderboardTab] = useState("players"); // "players" | "teams"
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);

  // Load pixel font via FontFace API (works reliably in iframes on mobile)
  useEffect(() => {
    const FONT_URL = "https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2";
    
    async function loadFont() {
      try {
        // Try FontFace API first (most reliable)
        const font = new FontFace("Press Start 2P", `url(${FONT_URL})`, {
          style: "normal",
          weight: "400",
          display: "swap",
        });
        const loaded = await font.load();
        document.fonts.add(loaded);
        setFontLoaded(true);
      } catch (e) {
        console.warn("FontFace API failed, falling back to style injection:", e);
        // Fallback: inject @font-face via style element
        const style = document.createElement("style");
        style.textContent = `
          @font-face {
            font-family: 'Press Start 2P';
            src: url('${FONT_URL}') format('woff2');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
        // Give it a moment to load
        setTimeout(() => setFontLoaded(true), 500);
      }
    }
    loadFont();
  }, []);

  // Load data on mount
  useEffect(() => {
    (async () => {
      const data = await fetchGameData();
      if (data) setGameData(data);
      setDataLoaded(true);
    })();
  }, []);

  // Refresh data from server (called after mutations)
  const refreshData = async () => {
    const data = await fetchGameData();
    if (data) setGameData(data);
  };

  const handleTeamSelected = async (team) => {
    setSelectedTeam(team);
    await apiMint(team);
    await refreshData();
    setScreen(SCREENS.GAMEPLAY);
  };

  const handleRoundComplete = async (made, attempted) => {
    const team = selectedTeam;
    await apiRecordRound(team, made, attempted);
    await refreshData();
    setRoundResult({ made, attempted, team });
    setScreen(SCREENS.ROUND_RESULT);
  };

  const handleLeaderboardEntry = async (name, score) => {
    await apiAddLeaderboard(name, score, selectedTeam);
    await refreshData();
  };

  const handleResetAll = async () => {
    await apiReset();
    setGameData(defaultGameData());
    await refreshData();
  };

  const getTeamScore = (team) => {
    const tokens = gameData.teamTokens[team] || 0;
    const made = gameData.teamFTMade[team] || 0;
    const attempted = gameData.teamFTAttempted[team] || 0;
    if (attempted === 0) return { score: 0, tokens, pct: 0, made, attempted };
    const pct = made / attempted;
    return { score: Math.round(tokens * pct), tokens, pct, made, attempted };
  };

  const qualifiesForLeaderboard = (score) => {
    if (gameData.playerLeaderboard.length < LEADERBOARD_SIZE) return true;
    const min = gameData.playerLeaderboard[gameData.playerLeaderboard.length - 1]?.score || 0;
    return score > min;
  };

  return (
    <div style={{
      width: "100vw",
      minHeight: "100vh",
      background: GB_BG,
      fontFamily: pixelFont,
      color: GB_DARK,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      overflow: "auto",
      WebkitFontSmoothing: "none",
      imageRendering: "pixelated",
    }}>
      <style>{`
        @font-face {
          font-family: 'Press Start 2P';
          src: url('https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2') format('woff2');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: ${GB_BG}; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${GB_MID}; }
        button { cursor: pointer; font-family: ${pixelFont}; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
      
      {screen === SCREENS.HOME && (
        <HomeScreen
          onStart={() => setScreen(SCREENS.TEAM_SELECT)}
          onLeaderboard={(tab) => { setLeaderboardTab(tab); setScreen(SCREENS.LEADERBOARD); }}
          onAdmin={() => setScreen(SCREENS.ADMIN)}
          gameData={gameData}
          getTeamScore={getTeamScore}
        />
      )}
      {screen === SCREENS.TEAM_SELECT && (
        <TeamSelectScreen
          onSelect={handleTeamSelected}
          onBack={() => setScreen(SCREENS.HOME)}
        />
      )}
      {screen === SCREENS.GAMEPLAY && (
        <GameplayScreen
          team={selectedTeam}
          onComplete={handleRoundComplete}
        />
      )}
      {screen === SCREENS.ROUND_RESULT && roundResult && (
        <RoundResultScreen
          result={roundResult}
          teamScore={getTeamScore(roundResult.team)}
          onNext={() => {
            setLeaderboardTab("players");
            setScreen(SCREENS.LEADERBOARD);
          }}
          qualifies={qualifiesForLeaderboard(roundResult.made)}
          onLeaderboardEntry={handleLeaderboardEntry}
        />
      )}
      {screen === SCREENS.LEADERBOARD && (
        <LeaderboardScreen
          gameData={gameData}
          getTeamScore={getTeamScore}
          tab={leaderboardTab}
          onTabChange={setLeaderboardTab}
          onHome={() => setScreen(SCREENS.HOME)}
        />
      )}
      {screen === SCREENS.ADMIN && (
        <AdminScreen
          gameData={gameData}
          onReset={handleResetAll}
          onBack={() => setScreen(SCREENS.HOME)}
        />
      )}
    </div>
  );
}

// ============================================================
// HOME SCREEN
// ============================================================
function HomeScreen({ onStart, onLeaderboard, onAdmin, gameData, getTeamScore }) {
  // Show top teams and players preview
  const teamScores = TEAMS.map(t => ({ team: t, ...getTeamScore(t) }))
    .filter(t => t.tokens > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  
  const topPlayers = (gameData.playerLeaderboard || []).slice(0, 10);
  const [showTeams, setShowTeams] = useState(true);
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminPw, setAdminPw] = useState("");

  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "20px 16px", textAlign: "center" }}>
      {/* Title */}
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "10px 16px",
        fontSize: "18px",
        letterSpacing: "1px",
        marginBottom: 16,
        textAlign: "center",
      }}>
        MoneyOnTheLine
      </div>
      
      <HomeSVG />
      
      <div
        onClick={onStart}
        style={{
          fontSize: 16,
          marginTop: 16,
          marginBottom: 24,
          cursor: "pointer",
          animation: "blink 1.2s step-end infinite",
        }}
      >
        <PixelTriangle size={8} /> START
      </div>
      
      {/* Leaderboard section */}
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 13,
        letterSpacing: "2px",
        marginBottom: 12,
      }}>
        LEADER BOARDS
      </div>
      
      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 16 }}>
        <span
          onClick={() => setShowTeams(true)}
          style={{
            fontSize: 11,
            cursor: "pointer",
            textDecoration: showTeams ? "underline" : "none",
            textUnderlineOffset: 4,
          }}
        >TEAMS</span>
        <span
          onClick={() => setShowTeams(false)}
          style={{
            fontSize: 11,
            cursor: "pointer",
            textDecoration: !showTeams ? "underline" : "none",
            textUnderlineOffset: 4,
          }}
        >PLAYERS</span>
      </div>

      {showTeams ? (
        <div style={{ textAlign: "left", padding: "0 12px" }}>
          {teamScores.length === 0 && (
            <div style={{ fontSize: 9, textAlign: "center", color: GB_MID }}>No teams yet</div>
          )}
          {teamScores.map((t, i) => (
            <div key={t.team} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: "bold" }}>{i + 1}. {t.team}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "bold" }}>${t.score.toLocaleString()}</div>
                <div style={{ fontSize: 7, color: GB_MID, marginTop: 2 }}>
                  (${t.tokens.toLocaleString()} × {(t.pct * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          ))}
          <div
            onClick={() => onLeaderboard("teams")}
            style={{ fontSize: 9, textAlign: "center", marginTop: 8, cursor: "pointer", color: GB_MID }}
          >
            <PixelTriangle size={5} /> VIEW FULL LEADERBOARD
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "left", padding: "0 12px" }}>
          {topPlayers.length === 0 && (
            <div style={{ fontSize: 9, textAlign: "center", color: GB_MID }}>No players yet</div>
          )}
          {topPlayers.map((p, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 12,
            }}>
              <span>{i + 1}. {p.name} ({p.team})</span>
              <span>{p.score}</span>
            </div>
          ))}
          <div
            onClick={() => onLeaderboard("players")}
            style={{ fontSize: 9, textAlign: "center", marginTop: 8, cursor: "pointer", color: GB_MID }}
          >
            <PixelTriangle size={5} /> VIEW FULL LEADERBOARD
          </div>
        </div>
      )}
      
      <div
        onClick={() => setShowAdminInput(true)}
        style={{ fontSize: 8, color: GB_MID, marginTop: 32, cursor: "pointer" }}
      >
        Admin
      </div>
      {showAdminInput && (
        <div style={{ marginTop: 8 }}>
          <input
            type="password"
            placeholder="Password"
            value={adminPw}
            onChange={e => setAdminPw(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && adminPw === "GENEKEADY") onAdmin();
            }}
            style={{
              fontFamily: pixelFont,
              fontSize: 8,
              background: GB_BG,
              border: `2px solid ${GB_DARK}`,
              padding: "4px 6px",
              width: 100,
              textAlign: "center",
              color: GB_DARK,
            }}
            autoFocus
          />
          <button
            onClick={() => { if (adminPw === "GENEKEADY") onAdmin(); }}
            style={{
              fontFamily: pixelFont,
              fontSize: 8,
              background: GB_DARK,
              color: GB_BG,
              border: "none",
              padding: "5px 10px",
              marginLeft: 4,
              cursor: "pointer",
            }}
          >GO</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TEAM SELECT SCREEN
// ============================================================
function TeamSelectScreen({ onSelect, onBack }) {
  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "20px 16px", textAlign: "center" }}>
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 13,
        letterSpacing: "1px",
        marginBottom: 16,
      }}>
        SELECT YOUR TEAM
      </div>
      <div style={{ fontSize: 8, color: GB_MID, marginBottom: 16 }}>
        Play to win up to 64 tokens for your team
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 6,
      }}>
        {TEAMS.map(team => (
          <button
            key={team}
            onClick={() => onSelect(team)}
            style={{
              background: GB_BG,
              border: `2px solid ${GB_DARK}`,
              color: GB_DARK,
              fontFamily: pixelFont,
              fontSize: 8,
              padding: "10px 2px",
              cursor: "pointer",
            }}
          >
            {team}
          </button>
        ))}
      </div>
      <div
        onClick={onBack}
        style={{ fontSize: 10, marginTop: 20, cursor: "pointer" }}
      >
        <PixelTriangle size={6} /> BACK
      </div>
    </div>
  );
}

// ============================================================
// GAMEPLAY SCREEN
// ============================================================
function GameplayScreen({ team, onComplete }) {
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [made, setMade] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [cursorX, setCursorX] = useState(250);
  const [cursorY, setCursorY] = useState(115);
  const [gameActive, setGameActive] = useState(true);
  const [shotLocation, setShotLocation] = useState(null); // { x, y, made }
  const [canShoot, setCanShoot] = useState(true);
  const [showTapHint, setShowTapHint] = useState(true);

  const animFrameRef = useRef(null);
  const timerRef = useRef(null);
  const madeRef = useRef(0);
  const attemptedRef = useRef(0);

  // Elliptical orbit state - all in a ref for animation frame access
  const orbitRef = useRef({
    // Current angle on the ellipse
    angle: Math.random() * Math.PI * 2,
    // Ellipse center orbits around the backboard center
    centerX: 250,
    centerY: 115,
    // Semi-major and semi-minor axes (these shift over time)
    radiusA: 70,  // horizontal radius
    radiusB: 35,  // vertical radius
    // Rotation of the ellipse itself
    tilt: 0,
    // Speed: radians per frame (~60fps)
    speed: 0.05,
    // Slow-drift parameters for the ellipse shape
    driftAngle: Math.random() * Math.PI * 2,
    driftSpeed: 0.003,
    tiltDrift: Math.random() * Math.PI * 2,
    tiltDriftSpeed: 0.005,
    // Axes shift parameters
    axisPhase: Math.random() * Math.PI * 2,
    axisSpeed: 0.004,
  });

  // The "sweet spot" — center of the inner square on the raster backboard
  // Raster inner square maps to approx (250, 115) in the 500x500 viewBox
  const TARGET_X = 250;
  const TARGET_Y = 115;
  const HIT_RADIUS = 29; // distance from target center to count as made

  // Elliptical cursor movement loop
  useEffect(() => {
    if (!gameActive) return;
    
    const moveCursor = () => {
      const o = orbitRef.current;
      
      // Advance angle at constant speed
      o.angle += o.speed;
      if (o.angle > Math.PI * 2) o.angle -= Math.PI * 2;
      
      // Slowly drift the ellipse center around the backboard area
      o.driftAngle += o.driftSpeed;
      o.centerX = 250 + Math.cos(o.driftAngle) * 30;
      o.centerY = 115 + Math.sin(o.driftAngle * 0.7) * 22;
      
      // Slowly shift the semi-axes so the ellipse "breathes"
      o.axisPhase += o.axisSpeed;
      o.radiusA = 55 + Math.sin(o.axisPhase) * 25;          // 30..80
      o.radiusB = 28 + Math.cos(o.axisPhase * 1.3) * 15;    // 13..43
      
      // Slowly rotate the ellipse tilt
      o.tiltDrift += o.tiltDriftSpeed;
      o.tilt = Math.sin(o.tiltDrift) * 0.6; // ±0.6 radians (~±34 degrees)
      
      // Compute position on tilted ellipse
      const ex = o.radiusA * Math.cos(o.angle);
      const ey = o.radiusB * Math.sin(o.angle);
      
      // Apply tilt rotation
      const cosT = Math.cos(o.tilt);
      const sinT = Math.sin(o.tilt);
      const rx = ex * cosT - ey * sinT;
      const ry = ex * sinT + ey * cosT;
      
      // Final position
      let fx = o.centerX + rx;
      let fy = o.centerY + ry;
      
      // Soft clamp to stay within the backboard area
      fx = Math.max(120, Math.min(380, fx));
      fy = Math.max(23, Math.min(163, fy));
      
      setCursorX(fx);
      setCursorY(fy);
      
      animFrameRef.current = requestAnimationFrame(moveCursor);
    };
    
    animFrameRef.current = requestAnimationFrame(moveCursor);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameActive]);

  // Timer
  useEffect(() => {
    if (!gameActive) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameActive(false);
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [gameActive]);

  // End game when time's up
  useEffect(() => {
    if (timeLeft === 0 && !gameActive) {
      setTimeout(() => {
        onComplete(madeRef.current, attemptedRef.current);
      }, 800);
    }
  }, [timeLeft, gameActive]);

  const shoot = useCallback(() => {
    if (!gameActive || !canShoot) return;
    setShowTapHint(false);
    setCanShoot(false);

    // Capture cursor position at moment of tap
    const sx = cursorX;
    const sy = cursorY;
    
    // Calculate distance from the target center (center of square above rim)
    const dx = sx - TARGET_X;
    const dy = sy - TARGET_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isMade = dist < HIT_RADIUS;

    // Update refs immediately for end-of-game accuracy
    attemptedRef.current += 1;
    if (isMade) madeRef.current += 1;
    
    setAttempted(prev => prev + 1);
    if (isMade) setMade(prev => prev + 1);

    // Show shot location for 1 full second
    setShotLocation({ x: sx, y: sy, made: isMade });
    
    setTimeout(() => {
      setShotLocation(null);
      setCanShoot(true);
    }, 1000);
  }, [gameActive, canShoot, cursorX, cursorY]);

  return (
    <div style={{ width: "100%", maxWidth: 420, textAlign: "center", userSelect: "none" }}>
      {/* Header bar */}
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 14,
        letterSpacing: "1px",
      }}>
        MoneyOnTheLine
      </div>
      
      {/* Stats row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 20px",
        fontSize: 11,
      }}>
        <div>
          <div style={{ fontSize: 9 }}>TIME</div>
          <div style={{ fontSize: 18, fontWeight: "bold" }}>{timeLeft}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: "bold" }}>{team}</div>
        <div>
          <div style={{ fontSize: 9 }}>MADE</div>
          <div style={{ fontSize: 18, fontWeight: "bold" }}>{made}</div>
        </div>
      </div>
      
      {/* Game area - tap anywhere to shoot */}
      <div
        onClick={shoot}
        style={{
          width: "100%",
          aspectRatio: "1",
          border: `3px solid ${GB_DARK}`,
          margin: "0 auto",
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        <BackboardSVG
          cursorX={cursorX}
          cursorY={cursorY}
          showCursor={gameActive}
          shotLocation={shotLocation}
        />
      </div>
      
      {showTapHint && gameActive && (
        <div style={{
          fontSize: 16,
          marginTop: 16,
          animation: "blink 1s step-end infinite",
        }}>
          Tap to shoot!
        </div>
      )}
      
      {!gameActive && (
        <div style={{ fontSize: 14, marginTop: 16 }}>
          TIME'S UP!
        </div>
      )}
      
      <div style={{ fontSize: 9, color: GB_MID, marginTop: 8 }}>
        {made}/{attempted} FT
      </div>
    </div>
  );
}

// ============================================================
// ROUND RESULT SCREEN
// ============================================================
function RoundResultScreen({ result, teamScore, onNext, qualifies, onLeaderboardEntry }) {
  const [enteredName, setEnteredName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const comment = useRef(getComment(result.made, result.attempted)).current;

  const handleSetName = () => {
    const name = nameInput.trim().toUpperCase();
    if (name.length === 0 || name.length > NAME_MAX_LEN) {
      setNameError("1-6 chars");
      return;
    }
    if (isProfane(name)) {
      setNameError("Nope.");
      return;
    }
    setNameError("");
    onLeaderboardEntry(name, result.made);
    setEnteredName(true);
  };

  const pctStr = result.attempted > 0
    ? ((result.made / result.attempted) * 100).toFixed(1) + "%"
    : "0%";

  const roundPct = result.attempted > 0 ? result.made / result.attempted : 0;
  const roundTokens = Math.round(TOKENS_PER_MINT * roundPct);

  // Disable continue link while name entry is active (qualifies but hasn't entered yet)
  const continueDisabled = qualifies && !enteredName;

  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "20px 16px", textAlign: "center" }}>
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 14,
        letterSpacing: "1px",
        marginBottom: 20,
      }}>
        ROUND OVER
      </div>
      
      {/* Comment - moved above result */}
      <div style={{
        border: `2px solid ${GB_DARK}`,
        padding: "12px",
        fontSize: 10,
        lineHeight: 1.6,
        marginBottom: 20,
        fontStyle: "italic",
      }}>
        "{comment}"
      </div>
      
      <div style={{ fontSize: 10, marginBottom: 6 }}>YOUR RESULT</div>
      <div style={{ fontSize: 28, fontWeight: "bold", marginBottom: 4 }}>
        {result.made}/{result.attempted}
      </div>
      <div style={{ fontSize: 10, color: GB_MID, marginBottom: 20 }}>
        FREE THROWS • {pctStr}
      </div>
      
      {/* Team score */}
      <div style={{ fontSize: 9, color: GB_MID, marginBottom: 4 }}>TEAM SCORE</div>
      <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>{result.team}</div>
      <div style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>+ ${roundTokens.toLocaleString()}</div>
      <div style={{ fontSize: 7, color: GB_MID, marginBottom: 20 }}>
        $64 team tokens × {(roundPct * 100).toFixed(1)}% FT
      </div>
      
      {/* Leaderboard entry */}
      {qualifies && !enteredName && (
        <div style={{
          border: `2px solid ${GB_DARK}`,
          padding: 12,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, marginBottom: 8 }}>TOP 100! ENTER NAME:</div>
          <input
            type="text"
            maxLength={NAME_MAX_LEN}
            value={nameInput}
            onChange={e => setNameInput(e.target.value.toUpperCase())}
            style={{
              fontFamily: pixelFont,
              fontSize: 14,
              background: GB_BG,
              border: `2px solid ${GB_DARK}`,
              padding: "6px 8px",
              width: 120,
              textAlign: "center",
              color: GB_DARK,
              marginBottom: 8,
              display: "block",
              margin: "0 auto 8px",
            }}
          />
          {nameError && <div style={{ fontSize: 8, color: "#8b0000", marginBottom: 6 }}>{nameError}</div>}
          <button
            onClick={handleSetName}
            disabled={isProfane(nameInput.trim())}
            style={{
              fontFamily: pixelFont,
              fontSize: 10,
              background: isProfane(nameInput.trim()) ? GB_MID : GB_DARK,
              color: GB_BG,
              border: "none",
              padding: "8px 20px",
              cursor: isProfane(nameInput.trim()) ? "not-allowed" : "pointer",
            }}
          >ADD NAME</button>
        </div>
      )}
      
      {enteredName && (
        <div style={{ fontSize: 10, marginBottom: 16, color: GB_MID }}>
          Name saved to leaderboard!
        </div>
      )}
      
      <div
        onClick={continueDisabled ? undefined : onNext}
        style={{
          fontSize: 12,
          cursor: continueDisabled ? "default" : "pointer",
          marginTop: 8,
          opacity: continueDisabled ? 0.3 : 1,
        }}
      >
        <PixelTriangle size={7} /> CONTINUE TO LEADERBOARD
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD SCREEN
// ============================================================
function LeaderboardScreen({ gameData, getTeamScore, tab, onTabChange, onHome }) {
  const teamScores = TEAMS.map(t => ({ team: t, ...getTeamScore(t) }))
    .filter(t => t.tokens > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "20px 16px", textAlign: "center" }}>
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 13,
        letterSpacing: "2px",
        marginBottom: 16,
      }}>
        LEADER BOARDS
      </div>
      
      <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 20 }}>
        <span
          onClick={() => onTabChange("teams")}
          style={{
            fontSize: 11,
            cursor: "pointer",
            textDecoration: tab === "teams" ? "underline" : "none",
            textUnderlineOffset: 4,
          }}
        >TEAMS</span>
        <span
          onClick={() => onTabChange("players")}
          style={{
            fontSize: 11,
            cursor: "pointer",
            textDecoration: tab === "players" ? "underline" : "none",
            textUnderlineOffset: 4,
          }}
        >PLAYERS</span>
      </div>

      {tab === "teams" ? (
        <div style={{ textAlign: "left", padding: "0 8px" }}>
          {teamScores.length === 0 && (
            <div style={{ fontSize: 9, textAlign: "center", color: GB_MID }}>No teams yet. Play a round!</div>
          )}
          {teamScores.map((t, i) => (
            <div key={t.team} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
              fontSize: 11,
            }}>
              <span style={{ fontWeight: "bold" }}>{i + 1}. {t.team}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "bold" }}>${t.score.toLocaleString()}</div>
                <div style={{ fontSize: 7, color: GB_MID, marginTop: 2 }}>
                  (${t.tokens.toLocaleString()} × {(t.pct * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "left", padding: "0 8px" }}>
          {gameData.playerLeaderboard.length === 0 && (
            <div style={{ fontSize: 9, textAlign: "center", color: GB_MID }}>No players yet. Play a round!</div>
          )}
          {gameData.playerLeaderboard.map((p, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 10,
              fontSize: 11,
            }}>
              <span>{i + 1}. {p.name} ({p.team})</span>
              <span>{p.score}</span>
            </div>
          ))}
        </div>
      )}
      
      <div
        onClick={onHome}
        style={{ fontSize: 12, cursor: "pointer", marginTop: 20 }}
      >
        <PixelTriangle size={7} /> RETURN HOME
      </div>
    </div>
  );
}

// ============================================================
// ADMIN SCREEN
// ============================================================
function AdminScreen({ gameData, onReset, onBack }) {
  const [confirmed, setConfirmed] = useState(false);
  
  const totalTokens = Object.values(gameData.teamTokens).reduce((a, b) => a + b, 0);
  const totalMade = Object.values(gameData.teamFTMade).reduce((a, b) => a + b, 0);
  const totalAttempted = Object.values(gameData.teamFTAttempted).reduce((a, b) => a + b, 0);

  return (
    <div style={{ width: "100%", maxWidth: 420, padding: "20px 16px", textAlign: "center" }}>
      <div style={{
        background: GB_DARK,
        color: GB_BG,
        padding: "8px 16px",
        fontSize: 13,
        letterSpacing: "1px",
        marginBottom: 20,
      }}>
        ADMIN PANEL
      </div>
      
      <div style={{ textAlign: "left", padding: "0 12px", fontSize: 9, lineHeight: 2.2 }}>
        <div>Total tokens minted: {totalTokens.toLocaleString()}</div>
        <div>Total FT made: {totalMade.toLocaleString()}</div>
        <div>Total FT attempted: {totalAttempted.toLocaleString()}</div>
        <div>Global FT%: {totalAttempted > 0 ? ((totalMade/totalAttempted)*100).toFixed(1) : 0}%</div>
        <div>Leaderboard entries: {gameData.playerLeaderboard.length}</div>
        <div>Teams with tokens: {Object.keys(gameData.teamTokens).filter(k => gameData.teamTokens[k] > 0).length}</div>
      </div>
      
      <div style={{ marginTop: 24 }}>
        {!confirmed ? (
          <button
            onClick={() => setConfirmed(true)}
            style={{
              fontFamily: pixelFont,
              fontSize: 10,
              background: "#8b0000",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >RESET ALL DATA</button>
        ) : (
          <div>
            <div style={{ fontSize: 9, marginBottom: 8 }}>Are you sure? This erases everything.</div>
            <button
              onClick={() => { onReset(); setConfirmed(false); }}
              style={{
                fontFamily: pixelFont,
                fontSize: 10,
                background: "#8b0000",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                marginRight: 8,
                cursor: "pointer",
              }}
            >YES, RESET</button>
            <button
              onClick={() => setConfirmed(false)}
              style={{
                fontFamily: pixelFont,
                fontSize: 10,
                background: GB_DARK,
                color: GB_BG,
                border: "none",
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >CANCEL</button>
          </div>
        )}
      </div>
      
      <div
        onClick={onBack}
        style={{ fontSize: 10, marginTop: 24, cursor: "pointer" }}
      >
        <PixelTriangle size={6} /> BACK
      </div>
    </div>
  );
}
