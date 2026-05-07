const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function buildWindBotArgs({
  name,
  host,
  port,
  hostInfo,
  deck = '',
  deckFile = '',
  dialog = '',
  version = '',
  hand = '',
  chat = '',
  debug = '',
} = {}) {
  const args = [];
  const push = (k, v) => {
    if (!isNonEmptyString(v)) return;
    args.push(`${k}=${String(v)}`);
  };
  push('Name', name);
  push('Host', host);
  push('Port', String(port));
  push('HostInfo', hostInfo);
  push('Deck', deck);
  push('DeckFile', deckFile);
  push('Dialog', dialog);
  push('Version', version);
  push('Hand', hand);
  push('Chat', chat);
  push('Debug', debug);
  return args;
}

class WindBotProcess {
  constructor({ exePath, cwd, args }) {
    if (!isNonEmptyString(exePath)) throw new Error('WindBot exePath missing');
    if (!fileExists(exePath)) throw new Error(`WindBot exePath not found: ${exePath}`);
    if (!isNonEmptyString(cwd)) throw new Error('WindBot cwd missing');
    this.exePath = exePath;
    this.cwd = cwd;
    this.args = Array.isArray(args) ? args : [];
    this.child = null;
  }

  start() {
    if (this.child) throw new Error('WindBot already started');
    const child = spawn(this.exePath, this.args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;

    child.stdout.on('data', (chunk) => {
      // eslint-disable-next-line no-console
      console.log('[WindBot]', String(chunk || '').trim());
    });
    child.stderr.on('data', (chunk) => {
      // eslint-disable-next-line no-console
      console.warn('[WindBot err]', String(chunk || '').trim());
    });
  }

  stop() {
    if (!this.child) return;
    try {
      this.child.kill('SIGTERM');
    } catch {
      // ignore
    }
    this.child = null;
  }
}

function resolveWindBotDefaultsFromEnv() {
  const exePath = String(process.env.WINDBOT_EXE || '').trim();
  const cwd = String(process.env.WINDBOT_CWD || '').trim() || (exePath ? path.dirname(exePath) : '');
  return { exePath, cwd };
}

module.exports = { WindBotProcess, buildWindBotArgs, resolveWindBotDefaultsFromEnv };

