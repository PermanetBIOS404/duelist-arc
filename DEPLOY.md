# Duelist ARC — Deploy Notes (Single Doc)

This project serves a static frontend from `src/` plus a Node/Express API from `server/src/index.js`.

## Local dev (no Docker)

Terminal A (EDOpro-server-ts):

```bash
cd ~/Documents/git/ar-homelab/.tmp/duelist-arc-edopro/EDOpro-server-ts
npm ci
npm run dev
```

Terminal B (Duelist ARC):

```bash
cd ~/Documents/git/ar-homelab/projects/yu-gi-oh-website
export EDOPRO_HTTP_URL=http://127.0.0.1:7922
export EDOPRO_HOST=127.0.0.1
export EDOPRO_PORT=7911
export EDOPRO_SERVER_TS_ROOT=~/Documents/git/ar-homelab/.tmp/duelist-arc-edopro/EDOpro-server-ts
node server/src/index.js
```

Open:

- `http://localhost:8787`

## Production shape (recommended)

Users should not download cores. Run these server-side:

- `duelist-arc` (this repo)
- `EDOpro-server-ts` (duel host + resources)
- (optional) WindBot for CPU duels

Front-end browser is UI only.

## Environment variables

Tip: an example env file for the Node server is in `server/.env.example`.

### Core

- `PORT` (default `8787`)
- `HOST` (default `127.0.0.1` in dev, `0.0.0.0` in production)
- `NODE_ENV` (`production` recommended on deploy)
- `DB_PATH` (default `./data/app.db`)
- `JWT_SECRET` (set this)
- `COOKIE_NAME` (default `ygo_token`)
- `COOKIE_SECURE` (`true` behind HTTPS)
- `PUBLIC_INDEXING`
  - When `true`, `/robots.txt` allows indexing and `/sitemap.xml` is served in production.
  - When `false` (recommended for a short-lived demo), `/robots.txt` disallows all and `/sitemap.xml` is hidden.

### EDOPro service

- `EDOPRO_HTTP_URL` (default `http://127.0.0.1:7922`)
- `EDOPRO_HOST` (default `127.0.0.1`)
- `EDOPRO_PORT` (default `7911`)
- `EDOPRO_SERVER_TS_ROOT` (required for Browser Duel v0 + banlist listing)
- `EDOPRO_RESOURCES_ROOT` (optional override; points to `resources/edopro`)
- `EDOPRO_BANLIST` (optional default banlist name)
- `EDOPRO_RULE` (optional default rule)

### CPU duels (WindBot)

- `WINDBOT_EXE` (required to start CPU duels)
- `WINDBOT_CWD` (optional; defaults to directory of `WINDBOT_EXE`)

### Hardening toggles

- `DUEL_REQUIRE_AUTH`
  - Default: `true` in `NODE_ENV=production`, otherwise `false`
  - When enabled, duel endpoints require login and are owner-scoped.
- `DUEL_EXPOSE_JOIN_INFO`
  - Default: `false` in `NODE_ENV=production`, otherwise `true`
  - When disabled, `/cpu-duel/edopro/start` won’t return desktop-client join info.
- `DUEL_EXPOSE_ROOM_PASSWORD`
  - Default: `false` in `NODE_ENV=production`, otherwise `true`
  - When disabled, `/cpu-duel/edopro/start` does not return the room password.
- `DUEL_LOCAL_ENABLED`
  - Default: `false` in `NODE_ENV=production`, otherwise `true`
  - Enables `/duel/local/*` debug routes.
- `DUEL_MAX_CPU_DUEL_MS`
  - Default: `3600000` (prod) / `7200000` (dev)
- `DUEL_MAX_SESSION_MS`
  - Default: `2700000` (prod) / `7200000` (dev)
- `DUEL_MAX_SESSION_IDLE_MS`
  - Default: `600000` (prod) / `1800000` (dev)

## Ports

Default ports used by the duel stack:

- Duelist ARC: `8787`
- EDOpro-server-ts host: `7911`
- EDOpro-server-ts HTTP API: `7922`

## Reverse proxy note

If you deploy behind a proxy (nginx/Caddy), ensure:

- HTTPS is enabled
- `COOKIE_SECURE=true`
- Proper forwarding headers so `req.ip` is meaningful for rate limiting

## Demo checklist (recommended)
If you want a “professional” public demo without debug surfaces:

- Set `HOST=0.0.0.0`
- Set `DB_PATH=/app/server/data/app.db` (docker) or `DB_PATH=./server/data/app.db` (bare metal) if you want persistence
- Set `DUEL_LOCAL_ENABLED=false`
- Set `DUEL_EXPOSE_JOIN_INFO=false`
- Set `DUEL_EXPOSE_ROOM_PASSWORD=false`
- Keep `NODE_ENV=development` if you want guest CPU duels without login (production defaults require auth).
