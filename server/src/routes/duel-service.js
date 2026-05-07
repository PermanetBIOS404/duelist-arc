const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const { requestJson } = require('../duel/httpJson');
const { requireUser } = require('../auth');
const { runningCpuDuels } = require('./cpu-duel-edopro');
const { runningDuelSessions } = require('./duel-session');

function resolveEdoproHttpUrl() {
  // In production this should point at a server-side service (e.g. docker network alias).
  // For local dev, default stays on localhost.
  const raw = String(process.env.EDOPRO_HTTP_URL || 'http://127.0.0.1:7922').trim();
  return raw.replace(/\/+$/, '');
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveEdoproResourcesRoot() {
  const explicit = String(process.env.EDOPRO_RESOURCES_ROOT || '').trim();
  if (explicit) return explicit;

  const edoproRoot = String(process.env.EDOPRO_SERVER_TS_ROOT || '').trim();
  if (!edoproRoot) return null;
  return path.join(edoproRoot, 'resources', 'edopro');
}

function parseBanlistNameFromFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
      const s = String(line || '').trim();
      if (!s) continue;
      if (s.startsWith('!')) return s.slice(1).trim();
    }
  } catch {
    // ignore
  }
  return '';
}

function listBanlistsFromResources(resourcesRoot) {
  const result = [];
  if (!resourcesRoot || !isDir(resourcesRoot)) return result;

  const dirs = ['banlists-ignis', 'banlists-evolution'];
  for (const d of dirs) {
    const dirPath = path.join(resourcesRoot, d);
    if (!isDir(dirPath)) continue;
    let files = [];
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.conf')) continue;
      const fp = path.join(dirPath, f);
      if (!isFile(fp)) continue;
      const name = parseBanlistNameFromFile(fp);
      if (!name) continue;
      result.push({ name, source: d, file: f });
    }
  }
  return result;
}

function duelServiceRoutes() {
  const router = express.Router();
  const nodeEnv = String(process.env.NODE_ENV || 'development');
  const requireAuth = String(process.env.DUEL_REQUIRE_AUTH || '').toLowerCase() === 'true' || nodeEnv === 'production';
  const authIf = (req, res, next) => (requireAuth ? requireUser(req, res, next) : next());

  // ✅ Admin token support (correctly scoped)
  const adminToken = String(process.env.DUEL_ADMIN_TOKEN || '').trim();

  const requireAdminToken = (req, res, next) => {
    if (!adminToken) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const provided = String(
      req.headers['x-duel-admin-token'] || req.query?.adminToken || ''
    ).trim();

    if (provided !== adminToken) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    return next();
  };

  // ... rest of routes below

  router.get('/health', async (req, res) => {
    const edoproHttpUrl = resolveEdoproHttpUrl();
    try {
      // EDOpro-server-ts exposes /api/rooms; treat 2xx as reachable.
      await requestJson(`${edoproHttpUrl}/api/rooms`, { method: 'GET', timeoutMs: 2500 });
      return res.json({ ok: true, edoproHttpUrl });
    } catch (e) {
      return res.status(503).json({
        ok: false,
        edoproHttpUrl,
        error: 'edopro_unreachable',
        status: e?.status || 0,
        hint: 'Duel service is server-hosted. Ensure EDOpro-server-ts is running and EDOPRO_HTTP_URL points to it.',
      });
    }
  });

  router.get('/banlists', (req, res) => {
    const resourcesRoot = resolveEdoproResourcesRoot();
    const lists = listBanlistsFromResources(resourcesRoot);
    const seen = new Set();
    const deduped = [];
    for (const b of lists) {
      const key = String(b.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(b);
    }

    // Prefer newest YYYY.MM at top; otherwise alphabetic.
    deduped.sort((a, b) => {
      const an = String(a.name || '');
      const bn = String(b.name || '');
      const am = an.match(/^(\d{4})\.(\d{2})/);
      const bm = bn.match(/^(\d{4})\.(\d{2})/);
      if (am && bm) {
        const ay = Number(am[1]);
        const amon = Number(am[2]);
        const by = Number(bm[1]);
        const bmon = Number(bm[2]);
        if (ay !== by) return by - ay;
        if (amon !== bmon) return bmon - amon;
      } else if (am && !bm) return -1;
      else if (!am && bm) return 1;
      return an.localeCompare(bn);
    });

    res.json({
      ok: true,
      resourcesRoot,
      banlists: deduped.map((x) => x.name),
      entries: deduped,
      hint: resourcesRoot
        ? ''
        : 'Set EDOPRO_RESOURCES_ROOT or EDOPRO_SERVER_TS_ROOT so Duelist ARC can read banlist files.',
    });
  });

  router.get('/stats', authIf, (req, res) => {
    const cpuCount = runningCpuDuels ? runningCpuDuels.size : 0;
    const sessionCount = runningDuelSessions ? runningDuelSessions.size : 0;
    res.json({ ok: true, cpuDuels: cpuCount, sessions: sessionCount });
  });

  router.get('/stats/admin', requireAdminToken, (req, res) => {
    const cpu = [];
    for (const [duelId, v] of (runningCpuDuels || new Map()).entries()) {
      cpu.push({
        duelId,
        ownerId: v.ownerId,
        createdAt: v.createdAt,
        lastSeenAt: v.lastSeenAt,
      });
    }

    const sessionsArr = [];
    for (const [sessionId, v] of (runningDuelSessions || new Map()).entries()) {
      sessionsArr.push({
        sessionId,
        ownerId: v.ownerId,
        createdAt: v.createdAt,
        lastSeenAt: v.lastSeenAt,
        clients: v.clients ? v.clients.size : 0,
      });
    }

    return res.json({
      ok: true,
      cpuDuels: cpu,
      sessions: sessionsArr,
    });
  });

  return router;
}

module.exports = { duelServiceRoutes };
