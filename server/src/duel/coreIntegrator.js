const { spawn } = require('node:child_process');

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function frameJsonMessage(obj) {
  const json = JSON.stringify(obj);
  // CoreIntegrator expects newline-delimited JSON on stdin.
  return `${json}\n`;
}

class CoreIntegratorProcess {
  constructor({ executablePath, cwd, initPayload }) {
    if (!isNonEmptyString(executablePath)) throw new Error('CoreIntegrator executablePath missing');
    if (!isNonEmptyString(cwd)) throw new Error('CoreIntegrator cwd missing');
    if (!initPayload || typeof initPayload !== 'object') throw new Error('CoreIntegrator initPayload missing');

    this.executablePath = executablePath;
    this.cwd = cwd;
    this.initPayload = initPayload;
    this.child = null;
    this.stdoutBuf = Buffer.alloc(0);
    this.onMessage = null;
    this.onExit = null;
  }

  start() {
    if (this.child) throw new Error('CoreIntegrator already started');

    const argvPayload = JSON.stringify(this.initPayload);
    const child = spawn(this.executablePath, [argvPayload], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    child.stdout.on('data', (chunk) => {
      this.stdoutBuf = Buffer.concat([this.stdoutBuf, chunk]);
      this.#drainStdout();
    });

    child.stderr.on('data', (chunk) => {
      // Keep stderr noise visible for debugging, but don’t crash the process.
      // eslint-disable-next-line no-console
      console.warn('[CoreIntegrator stderr]', String(chunk || '').trim());
    });

    child.on('exit', (code, signal) => {
      this.child = null;
      if (typeof this.onExit === 'function') this.onExit({ code, signal });
    });
  }

  sendCommand(commandObj) {
    if (!this.child || !this.child.stdin) throw new Error('CoreIntegrator not running');
    this.child.stdin.write(frameJsonMessage(commandObj));
  }

  destroy() {
    if (!this.child) return;
    try {
      this.sendCommand({ command: 'DESTROY_DUEL', data: {} });
    } catch {
      // ignore
    }
    try {
      this.child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  #drainStdout() {
    // Messages are framed as: uint32_le length + JSON string bytes
    for (;;) {
      if (this.stdoutBuf.length < 4) return;
      const msgLen = this.stdoutBuf.readUInt32LE(0);
      if (this.stdoutBuf.length < 4 + msgLen) return;
      const jsonBuf = this.stdoutBuf.subarray(4, 4 + msgLen);
      this.stdoutBuf = this.stdoutBuf.subarray(4 + msgLen);

      let parsed = null;
      try {
        parsed = JSON.parse(String(jsonBuf));
      } catch {
        parsed = { type: 'INVALID_JSON', raw: String(jsonBuf) };
      }

      if (typeof this.onMessage === 'function') this.onMessage(parsed);
    }
  }
}

module.exports = { CoreIntegratorProcess };

