#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function pick(x, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(x, k)) out[k] = x[k];
  }
  return out;
}

async function main() {
  const apiUrl = process.env.YGOPRODECK_CARDINFO_URL || 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
  const outDir = path.join(__dirname, '..', 'data', 'cards');
  ensureDir(outDir);

  console.log(`[sync-cards] fetching: ${apiUrl}`);
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`cardinfo_http_${res.status}`);
  const json = await res.json();
  const arr = json && typeof json === 'object' && Array.isArray(json.data) ? json.data : null;
  if (!arr) throw new Error('bad_cardinfo_shape');

  const slimKeys = [
    'id',
    'name',
    'type',
    'frameType',
    'desc',
    'atk',
    'def',
    'level',
    'race',
    'attribute',
    'archetype',
    'scale',
    'linkval',
    'linkmarkers',
    'banlist_info',
    'card_sets',
  ];

  const cards = arr.map((c) => {
    const src = c && typeof c === 'object' ? c : {};
    const out = pick(src, slimKeys);
    const id = String(out.id ?? '').trim();
    if (id) out.image = `/card-images/${id}.jpg`;
    return out;
  });

  const meta = {
    syncedAt: Date.now(),
    source: apiUrl,
    count: cards.length,
  };

  const payload = { meta, data: cards };
  const outPath = path.join(outDir, 'all.json');
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`[sync-cards] wrote: ${outPath} (${cards.length} cards)`);
  console.log('[sync-cards] images are fetched on-demand via GET /card-images/:id.jpg');
}

main().catch((err) => {
  console.error('[sync-cards] failed:', err?.message || err);
  process.exit(1);
});

