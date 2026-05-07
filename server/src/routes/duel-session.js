const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const { CoreIntegratorProcess } = require('../duel/coreIntegrator');
const { requireUser } = require('../auth');
const { rateLimit } = require('../rateLimit');

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

function buildInitPayload({ p1, p2, config } = {}) {
  const p1Main = clampDeckArray(p1?.mainDeck, { max: 70 });
  const p1Extra = clampDeckArray(p1?.extraDeck, { max: 30 });
  const p2Main = clampDeckArray(p2?.mainDeck, { max: 70 });
  const p2Extra = clampDeckArray(p2?.extraDeck, { max: 30 });

  const cfg = config && typeof config === 'object' ? config : {};
  return {
    config: {
      seeds: Array.isArray(cfg.seeds) && cfg.seeds.length === 4 ? cfg.seeds : randomSeeds(),
      flags: Number.isFinite(Number(cfg.flags)) ? Number(cfg.flags) : defaultMr5Flags(),
      lp: Number.isFinite(Number(cfg.lp)) ? Number(cfg.lp) : 8000,
      startingDrawCount: Number.isFinite(Number(cfg.startingDrawCount)) ? Number(cfg.startingDrawCount) : 5,
      drawCountPerTurn: Number.isFinite(Number(cfg.drawCountPerTurn)) ? Number(cfg.drawCountPerTurn) : 1,
      firstToPlay: Number.isFinite(Number(cfg.firstToPlay)) ? Number(cfg.firstToPlay) : 0,
      timeLimit: Number.isFinite(Number(cfg.timeLimit)) ? Number(cfg.timeLimit) : 180,
    },
    players: [
      { team: 0, mainDeck: p1Main, sideDeck: [], extraDeck: p1Extra, turn: 0 },
      { team: 1, mainDeck: p2Main, sideDeck: [], extraDeck: p2Extra, turn: 1 },
    ],
  };
}

const MAX_SESSION_EVENTS = Number(process.env.DUEL_SESSION_EVENT_BUFFER || 500);
// sessionId -> { proc, clients:Set<res>, createdAt, ownerId, lastSeenAt, seq, events:[] }
const sessions = new Map();

const MAX_SESSIONS_PER_USER = Number(process.env.DUEL_MAX_SESSIONS_PER_USER || 1);

function countUserSessions(userId) {
  let count = 0;
  for (const entry of sessions.values()) {
    if (Number(entry.ownerId) === Number(userId)) {
      count++;
    }
  }
  return count;
}
function duelSessionRoutes() {
  const router = express.Router();

  const nodeEnv = String(process.env.NODE_ENV || 'development');
  const requireAuth = String(process.env.DUEL_REQUIRE_AUTH || '').toLowerCase() === 'true' || nodeEnv === 'production';
  const maxAgeMs = Number(process.env.DUEL_MAX_SESSION_MS || (nodeEnv === 'production' ? 45 * 60 * 1000 : 2 * 60 * 60 * 1000));
  const maxIdleMs = Number(process.env.DUEL_MAX_SESSION_IDLE_MS || (nodeEnv === 'production' ? 10 * 60 * 1000 : 30 * 60 * 1000));

  const authIf = (req, res, next) => (requireAuth ? requireUser(req, res, next) : next());

  const canAccess = (req, entry) => {
    if (!requireAuth) return true;
    if (!req.user || !req.user.id) return false;
    if (!entry || !entry.ownerId) return false;
    return Number(entry.ownerId) === Number(req.user.id);
  };

  const touch = (entry) => {
    if (!entry) return;
    entry.lastSeenAt = Date.now();
  };

  let cleanupTimerStarted = false;
  const ensureCleanupTimer = () => {
    if (cleanupTimerStarted) return;
    cleanupTimerStarted = true;
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, entry] of sessions.entries()) {
        const createdAt = Number(entry?.createdAt || 0);
        const lastSeenAt = Number(entry?.lastSeenAt || createdAt || 0);
        const age = now - createdAt;
        const idle = now - lastSeenAt;
        if ((Number.isFinite(maxAgeMs) && maxAgeMs > 0 && age > maxAgeMs) || (Number.isFinite(maxIdleMs) && maxIdleMs > 0 && idle > maxIdleMs)) {
          try {
            entry.proc?.destroy?.();
          } catch {
            // ignore
          }
          for (const r of entry.clients || []) {
            try {
              r.end();
            } catch {
              // ignore
            }
          }
          sessions.delete(sessionId);
        }
      }
    }, 60 * 1000).unref?.();
  };
  ensureCleanupTimer();

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

  router.post('/create', authIf, rateLimit({ windowMs: 5 * 60_000, max: 20 }), (req, res) => {
    const edoproRoot = resolveEdoproRoot();
if (requireAuth && req.user && req.user.id) {
  const current = countUserSessions(req.user.id);
  if (current >= MAX_SESSIONS_PER_USER) {
    return res.status(429).json({
      ok: false,
      error: 'quota_exceeded',
      hint: `Max ${MAX_SESSIONS_PER_USER} active duel session(s) allowed. Stop an existing session first.`,
    });
  }
}
    const exe = resolveCoreIntegratorPath(edoproRoot);
    if (!edoproRoot || !exe || !fileExists(exe)) {
      return res.status(501).json({
        ok: false,
        error: 'not_configured',
        hint: 'Set EDOPRO_SERVER_TS_ROOT and build CoreIntegrator first.',
      });
    }

    const sessionId = genId();
    const initPayload = buildInitPayload({ p1: req.body?.p1, p2: req.body?.p2, config: req.body?.config });

    const proc = new CoreIntegratorProcess({ executablePath: exe, cwd: edoproRoot, initPayload });
    const clients = new Set();
    const createdAt = Date.now();
    const ownerId = req.user && req.user.id ? Number(req.user.id) : 0;
    const entry = { proc, clients, createdAt, ownerId, lastSeenAt: Date.now(), seq: 0, events: [] };

    const pushEvent = (obj) => {
      entry.seq += 1;
      const ev = { ...obj, seq: entry.seq, ts: Date.now() };
      entry.events.push(ev);
      const limit = Number.isFinite(MAX_SESSION_EVENTS) && MAX_SESSION_EVENTS > 0 ? MAX_SESSION_EVENTS : 500;
      if (entry.events.length > limit) entry.events.splice(0, entry.events.length - limit);
      return ev;
    };

    const broadcast = (obj) => {
      const ev = pushEvent(obj);
      const data = `data: ${JSON.stringify(ev)}\n\n`;
      for (const r of entry.clients) {
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
      for (const r of entry.clients) {
        try {
          r.end();
        } catch {
          // ignore
        }
      }
      sessions.delete(sessionId);
    };

    try {
      proc.start();
      // Kick the loop once so the stream has initial output.
      proc.sendCommand({ command: 'PROCESS', data: {} });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'spawn_failed', message: String(e?.message || e) });
    }

    sessions.set(sessionId, entry);
    // Seed with a creation event so reconnects can show immediate context.
    pushEvent({ type: 'session', status: 'created', sessionId, createdAt });
    return res.json({ ok: true, sessionId, createdAt });
  });

  router.get('/stream', authIf, rateLimit({ windowMs: 60_000, max: 240 }), (req, res) => {
    const sessionId = String(req.query?.sessionId || '').trim();
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(404).end();
    if (!canAccess(req, entry)) return res.status(403).end();
    touch(entry);
    const since = Number(String(req.query?.since || '').trim() || 0);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(
      `data: ${JSON.stringify({
        type: 'hello',
        sessionId,
        createdAt: entry.createdAt,
        latestSeq: entry.seq,
        replayFrom: Number.isFinite(since) ? since : 0,
      })}\n\n`,
    );

    // Replay buffered events to this client.
    const snapshot = Array.isArray(entry.events) ? entry.events.slice() : [];
    for (const ev of snapshot) {
      if (Number.isFinite(since) && since > 0 && Number(ev.seq || 0) <= since) continue;
      try {
        res.write(`data: ${JSON.stringify({ ...ev, replay: true })}\n\n`);
      } catch {
        // ignore
      }
    }

    entry.clients.add(res);

    req.on('close', () => {
      entry.clients.delete(res);
    });
  });

  router.post('/cmd', authIf, rateLimit({ windowMs: 60_000, max: 600 }), (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!canAccess(req, entry)) return res.status(403).json({ ok: false, error: 'forbidden' });

    const command = String(req.body?.command || '').trim();
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    if (!command) return res.status(400).json({ ok: false, error: 'missing_command' });

    try {
      touch(entry);
      entry.proc.sendCommand({ command, data });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'send_failed', message: String(e?.message || e) });
    }
  });

  router.post('/input', authIf, rateLimit({ windowMs: 60_000, max: 600 }), (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!canAccess(req, entry)) return res.status(403).json({ ok: false, error: 'forbidden' });

    const replier = Number.parseInt(String(req.body?.replier ?? '0'), 10);
    const rawHex = String(req.body?.rawHex || '').trim();
    if (!rawHex) return res.status(400).json({ ok: false, error: 'missing_input' });

    const hexPairs = rawHex.replace(/[^0-9a-fA-F|]/g, '').toLowerCase();
    const msg = hexPairs.includes('|') ? hexPairs : hexPairs.match(/.{1,2}/g)?.join('|') || '';

    try {
      touch(entry);
      entry.proc.sendCommand({
        command: 'RESPONSE',
        data: { replier: Number.isFinite(replier) ? replier : 0, message: msg },
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'send_failed', message: String(e?.message || e) });
    }
  });

  router.post('/stop', authIf, rateLimit({ windowMs: 60_000, max: 120 }), (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    const entry = sessions.get(sessionId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!canAccess(req, entry)) return res.status(403).json({ ok: false, error: 'forbidden' });
    try {
      entry.proc.destroy();
    } catch {
      // ignore
    }
    try {
      const ev = { type: 'exit', code: 0, signal: 'STOP' };
      entry.seq += 1;
      const data = `data: ${JSON.stringify({ ...ev, seq: entry.seq, ts: Date.now() })}\n\n`;
      for (const r of entry.clients || []) {
        try {
          r.write(data);
          r.end();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    sessions.delete(sessionId);
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { duelSessionRoutes, runningDuelSessions: sessions };
