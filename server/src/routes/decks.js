const express = require('express');
const { requireUser } = require('../auth');

function decksRoutes({ db }) {
  const r = express.Router();
  r.use(requireUser);

  r.get('/', (req, res) => {
    const rows = db
      .prepare('SELECT id, name, deck_json, updated_at FROM decks WHERE user_id = ? ORDER BY updated_at DESC')
      .all(req.user.id);
    return res.json({
      decks: rows.map((d) => ({
        id: Number(d.id),
        name: String(d.name || ''),
        deck: safeJson(String(d.deck_json || '{}')),
        updatedAt: Number(d.updated_at || 0),
      })),
    });
  });

  r.post('/', (req, res) => {
    const id = req.body?.id === undefined || req.body?.id === null ? null : Number(req.body.id);
    const name = String(req.body?.name || '').trim() || 'Untitled';
    const deck = req.body?.deck && typeof req.body.deck === 'object' ? req.body.deck : null;
    if (!deck) return res.status(400).json({ error: 'invalid_deck' });

    const now = Date.now();
    const deckJson = JSON.stringify(deck);

    if (id) {
      const owned = db.prepare('SELECT id FROM decks WHERE id = ? AND user_id = ?').get(id, req.user.id);
      if (!owned) return res.status(404).json({ error: 'not_found' });
      db.prepare('UPDATE decks SET name = ?, deck_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
        name,
        deckJson,
        now,
        id,
        req.user.id
      );
      return res.json({ deck: { id, name, deck, updatedAt: now } });
    }

    const createdAt = now;
    const info = db
      .prepare('INSERT INTO decks (user_id, name, deck_json, updated_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, name, deckJson, now, createdAt);
    const newId = Number(info.lastInsertRowid);
    return res.json({ deck: { id: newId, name, deck, updatedAt: now } });
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const info = db.prepare('DELETE FROM decks WHERE id = ? AND user_id = ?').run(id, req.user.id);
    return res.json({ ok: info.changes > 0 });
  });

  return r;
}

function safeJson(text) {
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

module.exports = { decksRoutes };

