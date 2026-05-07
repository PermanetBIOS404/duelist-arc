const fs = require('node:fs');
const path = require('node:path');

const express = require('express');

function cardsRoutes({ dataDir }) {
  const r = express.Router();
  const cardsPath = path.join(dataDir, 'cards', 'all.json');

  r.get('/status', (req, res) => {
    try {
      const raw = fs.readFileSync(cardsPath, 'utf8');
      const parsed = JSON.parse(raw);
      const meta = parsed && typeof parsed === 'object' ? parsed.meta : null;
      const data = parsed && typeof parsed === 'object' ? parsed.data : null;
      const count = Array.isArray(data) ? data.length : 0;
      return res.json({ ok: true, hasCards: true, count, meta: meta || null });
    } catch {
      return res.json({ ok: true, hasCards: false, count: 0, meta: null });
    }
  });

  // Dataset endpoint consumed by the existing frontend loader.
  // Returns `{ meta, data: [...] }` (same shape the frontend normalizer expects).
  r.get('/all.json', (req, res) => {
    try {
      const raw = fs.readFileSync(cardsPath, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).send(raw);
    } catch {
      return res.status(404).json({
        error: 'cards_not_synced',
        hint: 'Run: cd server && node scripts/sync-cards.js',
      });
    }
  });

  return r;
}

module.exports = { cardsRoutes };

