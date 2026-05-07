const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const crypto = require('node:crypto');

const { CoreIntegratorProcess } = require('../duel/coreIntegrator');

function resolveEdoproRoot() {
  const root = String(process.env.EDOPRO_SERVER_TS_ROOT || '').trim();
  return root || null;
}

function resolveCoreIntegratorPath(edoproRoot) {
  if (!edoproRoot) return null;
  return path.join(edoproRoot, 'core', 'CoreIntegrator');
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function defaultMr5Flags() {
  // Mirrors DUEL_MODE_MR5 from EDOPro lobby constants.
  // DUEL_PZONE | DUEL_EMZONE | DUEL_FSX_MMZONE | DUEL_TRAP_MONSTERS_NOT_USE_ZONE | DUEL_TRIGGER_ONLY_IN_LOCATION
  return 0x2e800;
}

function randomSeeds() {
  // Keep seeds within JS-safe integer range (<= 2^53-1).
  const buf = crypto.randomBytes(16);
  return [buf.readUInt32LE(0), buf.readUInt32LE(4), buf.readUInt32LE(8), buf.readUInt32LE(12)];
}

function buildMinimalInitPayload() {
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
      { team: 0, mainDeck: [], sideDeck: [], extraDeck: [], turn: 0 },
      { team: 1, mainDeck: [], sideDeck: [], extraDeck: [], turn: 1 },
    ],
  };
}

function duelCoreRoutes() {
  const router = express.Router();

  router.get('/health', (req, res) => {
    const edoproRoot = resolveEdoproRoot();
    const integratorPath = resolveCoreIntegratorPath(edoproRoot);
    const ok = !!edoproRoot && fileExists(integratorPath);
    return res.json({
      ok,
      edoproRoot,
      integratorPath,
      hint: ok
        ? 'CoreIntegrator found.'
        : 'Set EDOPRO_SERVER_TS_ROOT to the root folder of a built EDOpro-server-ts checkout (CoreIntegrator should exist at core/CoreIntegrator).',
    });
  });

  // Smoke test: spawn CoreIntegrator, wait for first message, then destroy.
  router.post('/smoke', async (req, res) => {
    const edoproRoot = resolveEdoproRoot();
    const integratorPath = resolveCoreIntegratorPath(edoproRoot);
    if (!edoproRoot || !fileExists(integratorPath)) {
      return res.status(501).json({
        ok: false,
        error: 'not_configured',
        hint: 'Set EDOPRO_SERVER_TS_ROOT and build CoreIntegrator first.',
      });
    }

    const initPayload = buildMinimalInitPayload();
    const proc = new CoreIntegratorProcess({ executablePath: integratorPath, cwd: edoproRoot, initPayload });

    const firstMessage = await new Promise((resolve) => {
      let done = false;
      const finish = (payload) => {
        if (done) return;
        done = true;
        resolve(payload);
      };

      const t = setTimeout(() => finish({ timeout: true }), 2500);

      proc.onMessage = (msg) => {
        clearTimeout(t);
        finish({ timeout: false, msg });
      };
      proc.onExit = ({ code, signal }) => {
        clearTimeout(t);
        finish({ timeout: false, exited: true, code, signal });
      };

      try {
        proc.start();
        // Ask the core to process once so it emits initial messages.
        proc.sendCommand({ command: 'PROCESS', data: {} });
      } catch (e) {
        clearTimeout(t);
        finish({ timeout: false, error: String(e?.message || e) });
      }
    });

    proc.destroy();
    return res.json({ ok: true, firstMessage });
  });

  return router;
}

module.exports = { duelCoreRoutes };
