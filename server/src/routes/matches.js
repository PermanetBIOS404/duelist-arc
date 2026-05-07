const express = require('express');
const { requireUser } = require('../auth');
const { ensureCurrentSeason } = require('./tournaments');

function matchesRoutes({ db }) {
  const r = express.Router();
  r.use(requireUser);

  r.get('/', (req, res) => {
    const rows = db
      .prepare(
        `
        SELECT
          m.id,
          m.season_id,
          m.user_a_id,
          m.user_b_id,
          m.format,
          m.deck_a_id,
          m.deck_b_id,
          m.result_a,
          m.counted,
          m.created_at,
          ua.handle AS handle_a,
          ub.handle AS handle_b
        FROM matches m
        JOIN users ua ON ua.id = m.user_a_id
        JOIN users ub ON ub.id = m.user_b_id
        WHERE m.user_a_id = ? OR m.user_b_id = ?
        ORDER BY m.created_at DESC
        LIMIT 200
        `
      )
      .all(req.user.id, req.user.id);

    const out = rows.map((m) => {
      const isA = Number(m.user_a_id) === Number(req.user.id);
      const opponentHandle = isA ? String(m.handle_b) : String(m.handle_a);
      const result = isA ? String(m.result_a) : invert(String(m.result_a));
      return {
        id: Number(m.id),
        seasonId: Number(m.season_id),
        opponent: opponentHandle,
        format: String(m.format || 'tcg'),
        deckAId: m.deck_a_id === null ? null : Number(m.deck_a_id),
        deckBId: m.deck_b_id === null ? null : Number(m.deck_b_id),
        result,
        counted: Number(m.counted) === 1,
        createdAt: Number(m.created_at),
      };
    });

    return res.json({ matches: out });
  });

  r.post('/', (req, res) => {
    const opponentHandle = String(req.body?.opponentHandle || '').trim();
    const result = String(req.body?.result || '').trim().toLowerCase();
    const format = String(req.body?.format || 'tcg').trim().toLowerCase();
    const deckAId = req.body?.deckAId === undefined || req.body?.deckAId === null ? null : Number(req.body.deckAId);
    const deckBId = req.body?.deckBId === undefined || req.body?.deckBId === null ? null : Number(req.body.deckBId);

    if (!opponentHandle) return res.status(400).json({ error: 'invalid_opponent' });
    if (!['win', 'loss', 'draw'].includes(result)) return res.status(400).json({ error: 'invalid_result' });
    if (!['tcg', 'ocg', 'goat'].includes(format)) return res.status(400).json({ error: 'invalid_format' });
    if (deckAId !== null && !Number.isFinite(deckAId)) return res.status(400).json({ error: 'invalid_deck' });
    if (deckBId !== null && !Number.isFinite(deckBId)) return res.status(400).json({ error: 'invalid_deck' });

    const opponent = db
      .prepare('SELECT id, handle FROM users WHERE lower(handle) = lower(?)')
      .get(opponentHandle);
    if (!opponent) return res.status(404).json({ error: 'opponent_not_found' });
    if (Number(opponent.id) === Number(req.user.id)) return res.status(400).json({ error: 'invalid_opponent' });

    const season = ensureCurrentSeason(db);
    const now = Date.now();

    const info = db
      .prepare(
        `
        INSERT INTO matches (season_id, user_a_id, user_b_id, format, deck_a_id, deck_b_id, result_a, counted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `
      )
      .run(
        season.id,
        req.user.id,
        Number(opponent.id),
        format,
        deckAId,
        deckBId,
        result,
        now
      );

    return res.json({
      match: {
        id: Number(info.lastInsertRowid),
        seasonId: season.id,
        opponent: String(opponent.handle),
        format,
        deckAId,
        deckBId,
        result,
        counted: true,
        createdAt: now,
      },
    });
  });

  return r;
}

function invert(r) {
  if (r === 'win') return 'loss';
  if (r === 'loss') return 'win';
  return 'draw';
}

module.exports = { matchesRoutes };

