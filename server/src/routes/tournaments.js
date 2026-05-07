const express = require('express');

function tournamentsRoutes({ db }) {
  const r = express.Router();

  r.get('/', (req, res) => {
    const season = ensureCurrentSeason(db);
    const standings = computeStandings(db, season.id);
    return res.json({ season, standings });
  });

  return r;
}

function ensureCurrentSeason(db) {
  const row = db.prepare('SELECT id, start_ts, tournament_end_ts, end_ts FROM seasons ORDER BY id DESC LIMIT 1').get();
  if (row) {
    return {
      id: Number(row.id),
      startTs: Number(row.start_ts),
      tournamentEndTs: Number(row.tournament_end_ts),
      endTs: Number(row.end_ts),
    };
  }

  const now = Date.now();
  const start = startOfUtcDay(now);
  const tournamentEnd = start + 21 * 24 * 60 * 60 * 1000;
  const end = tournamentEnd + 14 * 24 * 60 * 60 * 1000;
  const info = db
    .prepare('INSERT INTO seasons (start_ts, tournament_end_ts, end_ts, created_at) VALUES (?, ?, ?, ?)')
    .run(start, tournamentEnd, end, now);
  return { id: Number(info.lastInsertRowid), startTs: start, tournamentEndTs: tournamentEnd, endTs: end };
}

function startOfUtcDay(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function computeStandings(db, seasonId) {
  // Minimal points: win=3, draw=1, loss=0, based on matches.result_a for user_a.
  const rows = db
    .prepare(
      `
      SELECT
        u.id AS user_id,
        u.handle AS handle,
        SUM(CASE
          WHEN m.result_a = 'win' THEN 3
          WHEN m.result_a = 'draw' THEN 1
          ELSE 0
        END) AS points,
        SUM(CASE WHEN m.result_a = 'win' THEN 1 ELSE 0 END) AS w,
        SUM(CASE WHEN m.result_a = 'loss' THEN 1 ELSE 0 END) AS l,
        SUM(CASE WHEN m.result_a = 'draw' THEN 1 ELSE 0 END) AS d,
        COUNT(m.id) AS games
      FROM users u
      LEFT JOIN matches m
        ON m.user_a_id = u.id
        AND m.season_id = ?
        AND m.counted = 1
      GROUP BY u.id
      ORDER BY points DESC, w DESC, games DESC, lower(handle) ASC
      `
    )
    .all(seasonId);

  return rows.map((r, idx) => ({
    rank: idx + 1,
    userId: Number(r.user_id),
    handle: String(r.handle || ''),
    points: Number(r.points || 0),
    w: Number(r.w || 0),
    l: Number(r.l || 0),
    d: Number(r.d || 0),
    games: Number(r.games || 0),
  }));
}

module.exports = { tournamentsRoutes, ensureCurrentSeason };
