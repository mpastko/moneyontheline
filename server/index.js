import express from 'express';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ============================================================
// DATABASE
// ============================================================
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_stats (
        team TEXT PRIMARY KEY,
        tokens INTEGER DEFAULT 0,
        ft_made INTEGER DEFAULT 0,
        ft_attempted INTEGER DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_leaderboard (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        team TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Create index for leaderboard sorting
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON player_leaderboard (score DESC);
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// ============================================================
// API ROUTES
// ============================================================

// GET /api/gamedata - fetch all global game data
app.get('/api/gamedata', async (req, res) => {
  try {
    const teamsResult = await pool.query('SELECT * FROM team_stats');
    const lbResult = await pool.query(
      'SELECT name, score, team FROM player_leaderboard ORDER BY score DESC, created_at ASC LIMIT 100'
    );

    const teamTokens = {};
    const teamFTMade = {};
    const teamFTAttempted = {};

    for (const row of teamsResult.rows) {
      teamTokens[row.team] = row.tokens;
      teamFTMade[row.team] = row.ft_made;
      teamFTAttempted[row.team] = row.ft_attempted;
    }

    res.json({
      teamTokens,
      teamFTMade,
      teamFTAttempted,
      playerLeaderboard: lbResult.rows,
    });
  } catch (err) {
    console.error('GET /api/gamedata error:', err);
    res.status(500).json({ error: 'Failed to load game data' });
  }
});

// POST /api/mint - mint tokens for a team
app.post('/api/mint', async (req, res) => {
  const { team, amount } = req.body;
  if (!team || !amount) return res.status(400).json({ error: 'team and amount required' });

  try {
    await pool.query(`
      INSERT INTO team_stats (team, tokens, ft_made, ft_attempted)
      VALUES ($1, $2, 0, 0)
      ON CONFLICT (team) DO UPDATE SET tokens = team_stats.tokens + $2
    `, [team, amount]);

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/mint error:', err);
    res.status(500).json({ error: 'Failed to mint tokens' });
  }
});

// POST /api/round - record a round result (FT stats)
app.post('/api/round', async (req, res) => {
  const { team, made, attempted } = req.body;
  if (!team || made == null || attempted == null) {
    return res.status(400).json({ error: 'team, made, and attempted required' });
  }

  try {
    await pool.query(`
      INSERT INTO team_stats (team, tokens, ft_made, ft_attempted)
      VALUES ($1, 0, $2, $3)
      ON CONFLICT (team) DO UPDATE SET
        ft_made = team_stats.ft_made + $2,
        ft_attempted = team_stats.ft_attempted + $3
    `, [team, made, attempted]);

    // Return updated team stats
    const result = await pool.query('SELECT * FROM team_stats WHERE team = $1', [team]);
    res.json({ success: true, team: result.rows[0] });
  } catch (err) {
    console.error('POST /api/round error:', err);
    res.status(500).json({ error: 'Failed to record round' });
  }
});

// POST /api/leaderboard - add a leaderboard entry
app.post('/api/leaderboard', async (req, res) => {
  const { name, score, team } = req.body;
  if (!name || score == null || !team) {
    return res.status(400).json({ error: 'name, score, and team required' });
  }

  try {
    // Check if this score qualifies (top 100)
    const countResult = await pool.query('SELECT COUNT(*) as cnt FROM player_leaderboard');
    const count = parseInt(countResult.rows[0].cnt);

    if (count >= 100) {
      const minResult = await pool.query(
        'SELECT MIN(score) as min_score FROM (SELECT score FROM player_leaderboard ORDER BY score DESC LIMIT 100) sub'
      );
      const minScore = minResult.rows[0].min_score;
      if (score <= minScore) {
        return res.json({ success: false, message: 'Score does not qualify' });
      }
      // Remove the lowest entry to make room
      await pool.query(`
        DELETE FROM player_leaderboard WHERE id = (
          SELECT id FROM player_leaderboard ORDER BY score ASC, created_at DESC LIMIT 1
        )
      `);
    }

    await pool.query(
      'INSERT INTO player_leaderboard (name, score, team) VALUES ($1, $2, $3)',
      [name, score, team]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/leaderboard error:', err);
    res.status(500).json({ error: 'Failed to add leaderboard entry' });
  }
});

// POST /api/reset - admin reset all data
app.post('/api/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM team_stats');
    await pool.query('DELETE FROM player_leaderboard');
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/reset error:', err);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

// ============================================================
// SERVE STATIC FILES (production build)
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 4000;

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
