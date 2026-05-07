const http = require('node:http');
const https = require('node:https');

function requestJson(url, { method = 'GET', headers = {}, body = null, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const isHttps = u.protocol === 'https:';
      const lib = isHttps ? https : http;
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;

      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port ? Number(u.port) : isHttps ? 443 : 80,
          path: `${u.pathname}${u.search || ''}`,
          method,
          headers: {
            Accept: 'application/json',
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let data = null;
            try {
              data = text ? JSON.parse(text) : null;
            } catch {
              data = null;
            }
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ status: res.statusCode, data, text });
              return;
            }
            const err = new Error(`HTTP ${res.statusCode || 0}`);
            err.status = res.statusCode || 0;
            err.data = data;
            err.text = text;
            reject(err);
          });
        },
      );

      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('timeout'));
      });
      if (payload) req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { requestJson };

