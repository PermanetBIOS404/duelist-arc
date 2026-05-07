const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const { CoreIntegratorProcess } = require('../duel/coreIntegrator');

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function resolveEdoproRoot() {
  const root = String(process.env.EDOPRO_SERVER_TS_ROOT || '').trim();
  return root || null;
}

function resolveCoreIntegratorPath(edoproRoot) {
  if (!edoproRoot) return null;
  return path.join(edoproRoot, 'core', 'CoreIntegrator');
}

function defaultMr5Flags() {
  // DUEL_MODE_MR5 (EDOPro lobby constants).
  return 0x2e800;
}

function randomSeeds() {
  const buf = crypto.randomBytes(16);
  return [buf.readUInt32LE(0), buf.readUInt32LE(4), buf.readUInt32LE(8), buf.readUInt32LE(12)];
}

function clampDeckArray(arr, { max = 80 } = {}) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push(Math.floor(n));
    if (out.length >= max) break;
  }
  return out;
}

function buildInitPayload({ p1, p2 } = {}) {
  const p1Main = clampDeckArray(p1?.mainDeck, { max: 70 });
  const p1Extra = clampDeckArray(p1?.extraDeck, { max: 30 });
  const p2Main = clampDeckArray(p2?.mainDeck, { max: 70 });
  const p2Extra = clampDeckArray(p2?.extraDeck, { max: 30 });

  return {
    config: {
      seeds: randomSeeds(),
      flags: defaultMr5Flags(),
      lp: 8000,
      startingDrawCount: 5,
      drawCountPerTurn: 1,
      firstToPlay: 0,
      timeLimit: 180,
    },
    players: [
      { team: 0, mainDeck: p1Main, sideDeck: [], extraDeck: p1Extra, turn: 0 },
      { team: 1, mainDeck: p2Main, sideDeck: [], extraDeck: p2Extra, turn: 1 },
    ],
  };
}

// duelId -> { proc, clients:Set<res>, createdAt }
const duels = new Map();

function duelLocalRoutes() {
  const router = express.Router();

  router.get('/health', (req, res) => {
    const edoproRoot = resolveEdoproRoot();
    const exe = resolveCoreIntegratorPath(edoproRoot);
    const ok = !!edoproRoot && !!exe && fileExists(exe);
    res.json({
      ok,
      edoproRoot,
      coreIntegrator: exe,
      hint: ok
        ? 'Ready.'
        : 'Set EDOPRO_SERVER_TS_ROOT to a built EDOpro-server-ts checkout (CoreIntegrator must exist at core/CoreIntegrator).',
    });
  });

  router.post('/start', (req, res) => {
    const edoproRoot = resolveEdoproRoot();
    const exe = resolveCoreIntegratorPath(edoproRoot);
    if (!edoproRoot || !exe || !fileExists(exe)) {
      return res.status(501).json({
        ok: false,
        error: 'not_configured',
        hint: 'Set EDOPRO_SERVER_TS_ROOT and build CoreIntegrator first.',
      });
    }

    const duelId = genId();
    const initPayload = buildInitPayload({ p1: req.body?.p1, p2: req.body?.p2 });

    const proc = new CoreIntegratorProcess({ executablePath: exe, cwd: edoproRoot, initPayload });
    const clients = new Set();
    const createdAt = Date.now();

    const broadcast = (obj) => {
      const data = `data: ${JSON.stringify(obj)}\n\n`;
      for (const r of clients) {
        try {
          r.write(data);
        } catch {
          // ignore
        }
      }
    };

    proc.onMessage = (msg) => broadcast({ type: 'core', msg });
    proc.onExit = ({ code, signal }) => {
      broadcast({ type: 'exit', code, signal });
      for (const r of clients) {
        try {
          r.end();
        } catch {
          // ignore
        }
      }
      duels.delete(duelId);
    };

    try {
      proc.start();
      // Start the duel loop (will emit START/CORE messages).
      proc.sendCommand({ command: 'PROCESS', data: {} });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'spawn_failed', message: String(e?.message || e) });
    }

    duels.set(duelId, { proc, clients, createdAt });
    return res.json({ ok: true, duelId, createdAt });
  });

  router.get('/stream', (req, res) => {
    const duelId = String(req.query?.duelId || '').trim();
    const entry = duels.get(duelId);
    if (!entry) return res.status(404).end();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    entry.clients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'hello', duelId, createdAt: entry.createdAt })}\n\n`);

    req.on('close', () => {
      entry.clients.delete(res);
    });
  });

  router.post('/cmd', (req, res) => {
    const duelId = String(req.body?.duelId || '').trim();
    const entry = duels.get(duelId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });

    const command = String(req.body?.command || '').trim();
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    if (!command) return res.status(400).json({ ok: false, error: 'missing_command' });

    try {
      entry.proc.sendCommand({ command, data });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'send_failed', message: String(e?.message || e) });
    }
  });

  router.post('/stop', (req, res) => {
    const duelId = String(req.body?.duelId || '').trim();
    const entry = duels.get(duelId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    try {
      entry.proc.destroy();
    } catch {
      // ignore
    }
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { duelLocalRoutes };

