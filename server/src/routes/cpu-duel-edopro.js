const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');

const { requestJson } = require('../duel/httpJson');
const { WindBotProcess, buildWindBotArgs, resolveWindBotDefaultsFromEnv } = require('../duel/windbot');
const { requireUser } = require('../auth');
const { rateLimit } = require('../rateLimit');

const running = new Map(); // duelId -> { windbot, roomPassword, createdAt, ownerId, lastSeenAt }
const MAX_CPU_DUELS_PER_USER = Number(process.env.DUEL_MAX_CPU_DUELS_PER_USER || 1);

function countUserCpuDuels(userId) {
  let count = 0;
  for (const entry of running.values()) {
    if (Number(entry.ownerId) === Number(userId)) {
      count++;
    }
  }
  return count;
}
function nowMs() {
  return Date.now();
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function envInt(name, fallback) {
  const n = Number(String(process.env[name] ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function cpuDuelEdoproRoutes() {
  const router = express.Router();

  const nodeEnv = String(process.env.NODE_ENV || 'development');
  const requireAuth = String(process.env.DUEL_REQUIRE_AUTH || '').toLowerCase() === 'true' || nodeEnv === 'production';
  const exposePassword =
    String(process.env.DUEL_EXPOSE_ROOM_PASSWORD || '').toLowerCase() === 'true' || nodeEnv !== 'production';
  const exposeJoinInfo =
    String(process.env.DUEL_EXPOSE_JOIN_INFO || '').toLowerCase() === 'true' || nodeEnv !== 'production';
  const maxAgeMs = Number(process.env.DUEL_MAX_CPU_DUEL_MS || (nodeEnv === 'production' ? 60 * 60 * 1000 : 2 * 60 * 60 * 1000));
  const cleanupEveryMs = 60 * 1000;

  const authIf = (req, res, next) => (requireAuth ? requireUser(req, res, next) : next());

  const canAccess = (req, entry) => {
    if (!requireAuth) return true;
    if (!req.user || !req.user.id) return false;
    if (!entry || !entry.ownerId) return false;
    return Number(entry.ownerId) === Number(req.user.id);
  };

  const touch = (entry) => {
    if (!entry) return;
    entry.lastSeenAt = nowMs();
  };

  let cleanupTimerStarted = false;
  const ensureCleanupTimer = () => {
    if (cleanupTimerStarted) return;
    cleanupTimerStarted = true;
    setInterval(() => {
      const now = nowMs();
      for (const [duelId, entry] of running.entries()) {
        const createdAt = Number(entry?.createdAt || 0);
        const lastSeenAt = Number(entry?.lastSeenAt || createdAt || 0);
        const age = now - createdAt;
        const idle = now - lastSeenAt;
        if ((Number.isFinite(maxAgeMs) && maxAgeMs > 0 && age > maxAgeMs) || idle > maxAgeMs) {
          try {
            entry.windbot?.stop?.();
          } catch {
            // ignore
          }
          running.delete(duelId);
        }
      }
    }, cleanupEveryMs).unref?.();
  };
  ensureCleanupTimer();

  router.get('/health', authIf, rateLimit({ windowMs: 60_000, max: 120 }), (req, res) => {
    const { exePath, cwd } = resolveWindBotDefaultsFromEnv();
    const ok = !!exePath && fileExists(exePath) && !!cwd;
    res.json({
      ok,
      windbot: {
        exe: exePath || '',
        cwd: cwd || '',
        configured: !!exePath,
        exeExists: !!exePath && fileExists(exePath),
      },
      hint: ok ? 'Ready.' : 'Set WINDBOT_EXE (and optionally WINDBOT_CWD) on the Duelist ARC server.',
    });
  });

  router.get('/status', authIf, rateLimit({ windowMs: 60_000, max: 120 }), (req, res) => {
    const entries = [];
    for (const [duelId, v] of running.entries()) {
      if (!canAccess(req, v)) continue;
      entries.push({ duelId, createdAt: v.createdAt, roomPassword: v.roomPassword ? '(hidden)' : null });
    }
    res.json({ ok: true, running: entries });
  });

  // Starts a room in EDOpro-server-ts via its HTTP API and spawns WindBot to join it.
  // You can then join the room from an EDOPro client (for now) to duel the CPU.
  router.post('/start', authIf, rateLimit({ windowMs: 5 * 60_000, max: 10 }), async (req, res) => {
    if (requireAuth && req.user && req.user.id) {
      const current = countUserCpuDuels(req.user.id);
      if (current >= MAX_CPU_DUELS_PER_USER) {
        return res.status(429).json({
          ok: false,
          error: 'quota_exceeded',
          hint: `Max ${MAX_CPU_DUELS_PER_USER} active CPU duel(s) allowed. Stop an existing duel first.`,
        });
      }
    }

    const duelId = genId();

    const edoproHttpUrl = String(process.env.EDOPRO_HTTP_URL || 'http://127.0.0.1:7922').replace(/\/+$/, '');
    const edoproHost = String(process.env.EDOPRO_HOST || '127.0.0.1');
    const edoproPort = envInt('EDOPRO_PORT', 7911);

    const { exePath, cwd } = resolveWindBotDefaultsFromEnv();
    if (!exePath) {
      return res.status(501).json({ ok: false, error: 'windbot_not_configured', hint: 'Set WINDBOT_EXE (and optionally WINDBOT_CWD).' });
    }

    // Minimal room create payload.
    const roomName = String(req.body?.name || 'CPU Duel').slice(0, 30);
    const banlist = String(req.body?.banlist || process.env.EDOPRO_BANLIST || '').trim();
    if (!banlist) {
      return res.status(400).json({
        ok: false,
        error: 'missing_banlist',
        hint: 'Provide { "banlist": "..." } or set EDOPRO_BANLIST (must match an existing banlist name in EDOpro-server-ts resources).',
      });
    }

    const rule = Number.isFinite(Number(req.body?.rule)) ? Number(req.body.rule) : Number(process.env.EDOPRO_RULE || 1);
    const bestOf = Number.isFinite(Number(req.body?.bestOf)) ? Number(req.body.bestOf) : 1;

    let roomPassword = '';
    try {
      const { data } = await requestJson(`${edoproHttpUrl}/api/room`, {
        method: 'POST',
        body: { name: roomName, banlist, rule, bestOf, mode: 0, teamQuantity: 1, isRanked: false },
        timeoutMs: 6000,
      });
      roomPassword = String(data?.password || '');
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'edopro_room_create_failed',
        status: e?.status || 0,
        details: e?.data || null,
        hint: 'Is EDOpro-server-ts running with HTTP_PORT (default 7922)?',
      });
    }

    // Spawn WindBot and have it connect to the room.
    const botName = String(req.body?.botName || 'WindBot');
    const deck = String(req.body?.deck || '');
    const deckFile = String(req.body?.deckFile || '');
    const dialog = String(req.body?.dialog || '');

    const args = buildWindBotArgs({
      name: botName,
      host: edoproHost,
      port: edoproPort,
      hostInfo: roomPassword,
      deck,
      deckFile,
      dialog,
      chat: 'False',
    });

    let windbot = null;
    try {
      windbot = new WindBotProcess({ exePath, cwd, args });
      windbot.start();
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'windbot_spawn_failed', message: String(e?.message || e) });
    }

    const ownerId = req.user && req.user.id ? Number(req.user.id) : 0;
    running.set(duelId, { windbot, roomPassword, createdAt: nowMs(), ownerId, lastSeenAt: nowMs() });

    // We return the password so you can join from EDOPro client immediately.
    // This is a local-dev feature; later we’ll remove/guard it.
    return res.json({
      ok: true,
      duelId,
      join: exposeJoinInfo
        ? {
            host: edoproHost,
            port: edoproPort,
            roomPassword: exposePassword ? roomPassword : '',
          }
        : null,
      note: 'Join from an EDOPro client for now. Web duel UI comes next.',
    });
  });

  router.post('/stop', authIf, rateLimit({ windowMs: 60_000, max: 60 }), (req, res) => {
    const duelId = String(req.body?.duelId || '').trim();
    if (!duelId) return res.status(400).json({ ok: false, error: 'missing_duelId' });
    const entry = running.get(duelId);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!canAccess(req, entry)) return res.status(403).json({ ok: false, error: 'forbidden' });
    touch(entry);
    try {
      entry.windbot?.stop?.();
    } catch {
      // ignore
    }
    running.delete(duelId);
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { cpuDuelEdoproRoutes, runningCpuDuels: running };
