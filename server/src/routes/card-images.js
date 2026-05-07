const fs = require('node:fs');
const path = require('node:path');

const express = require('express');

function cardImagesRoutes({ dataDir, remoteTemplate }) {
  const r = express.Router();
  const imgDir = path.join(dataDir, 'card-images');

  fs.mkdirSync(imgDir, { recursive: true });

  const inFlight = new Map(); // id -> Promise<string>

  r.get('/:id.jpg', async (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9]{1,12}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });

    const filePath = path.join(imgDir, `${id}.jpg`);
    if (fs.existsSync(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(filePath);
    }

    const existing = inFlight.get(id);
    if (existing) {
      try {
        const fp = await existing;
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(fp);
      } catch {
        return res.status(502).json({ error: 'image_fetch_failed' });
      }
    }

    const p = (async () => {
      const url = String(remoteTemplate || '').replace('{id}', id);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 128) throw new Error('too_small');

      const tmp = `${filePath}.tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, filePath);
      return filePath;
    })();

    inFlight.set(id, p);
    try {
      const fp = await p;
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(fp);
    } catch (e) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
      return res.status(502).json({ error: 'image_fetch_failed' });
    } finally {
      inFlight.delete(id);
    }
  });

  return r;
}

module.exports = { cardImagesRoutes };

