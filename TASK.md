# Duelist ARC — Deploy Plan (2026-04-30)

This file captures the deployment-day runbook for launching `duelistarc.com`.

Note: This repo uses **bd (beads)** for actual issue tracking. This document is a planning snapshot for continuity, not the source of truth for tasks.

## Context (as of 2026-04-29)

The demo UX is presentation-grade:
- Demo landing + demo tour
- Developer page
- Instant deck test (upload → shuffle + draw 5)
- Sample decks
- Status/readiness/diagnostics
- Demo settings drawer

Tomorrow’s goal is to deploy through **Cloudflare (Free)** as the edge, using a **Cloudflare Tunnel** to a Docker-hosted origin.

## Goal (deployment day)

Users can:
- Open `https://duelistarc.com/?demo=1&view=demo&tour=1&sample=classic_demo&draw=5`
- Upload a deck and instantly draw 5
- See clear “online dueling coming soon” messaging
- (Optional) Duel a CPU if the host is configured

## Preflight on origin (before Cloudflare)

On the machine that will run Docker + cloudflared:

1) Start stack:
   - (recommended) pin the EDOPro build (stable rebuilds):
     - `./scripts/pin-edopro-ref.sh main`
     - `source docker/edopro/EDOPRO_REF.pin`
   - EITHER:
     - `./scripts/demo.sh up`
   - OR:
     - `docker-compose -f docker-compose.duel.yml up -d --build`
2) Local smoke checks:
   - `./scripts/demo.sh smoke`
    - Open `http://localhost:8787/?demo=1&view=demo`
    - Click **Settings** → **Diagnostics** → **Copy** and keep the output
    - Visit `/does-not-exist` and confirm the friendly 404 page

## Namecheap → Cloudflare (DNS)

1) Cloudflare: Add site `duelistarc.com` (Free)
2) Namecheap: set nameservers to Cloudflare-provided NS
3) Cloudflare: wait for “Active”
4) Cloudflare: SSL/TLS
   - Mode: **Full**
   - Edge Certificates: **Always Use HTTPS** ON

## Cloudflare Tunnel (cloudflared)

On the origin machine:

1) Install `cloudflared`
2) Authenticate:
   - `cloudflared tunnel login`
3) Create tunnel:
   - `cloudflared tunnel create duelistarc`
4) Route DNS:
   - `cloudflared tunnel route dns duelistarc duelistarc.com`
   - (optional) `cloudflared tunnel route dns duelistarc www.duelistarc.com`
5) Create `~/.cloudflared/config.yml`:
   - ingress:
     - `hostname: duelistarc.com` → `service: http://localhost:8787`
     - (optional) `hostname: www.duelistarc.com` → `service: http://localhost:8787`
     - fallback: `service: http_status:404`
6) Run as a service (recommended):
   - `sudo cloudflared service install`
   - `sudo systemctl enable --now cloudflared`

## Public verification (from phone LTE)

1) Open canonical demo URL:
   - `https://duelistarc.com/?demo=1&view=demo&tour=1&sample=classic_demo&draw=5`
2) Confirm:
   - Demo landing renders
   - Draw 5 works
   - Diagnostics modal works + copies text
   - CPU readiness panel shows expected state
   - Bad URL returns the friendly 404 page

## CPU duel enablement (optional)

If you want CPU duels active on launch day, validate:
- `/duel/service/health` is `ok:true` (EDOpro-server-ts reachable)
- `/cpu-duel/edopro/health` is `ok:true` (WindBot configured)
- Banlists are discoverable in `/duel/service/banlists`
- UI can start a CPU duel with a real banlist selected

## Rollback / Recovery

- App restart:
  - `docker-compose -f docker-compose.duel.yml down`
  - `docker-compose -f docker-compose.duel.yml up -d --build`
- Tunnel restart:
  - restart `cloudflared` service
  - confirm the tunnel DNS route still exists in Cloudflare

## “Professional demo” env checklist

- `HOST=0.0.0.0`
- `DB_PATH=/app/server/data/app.db` (docker persistence)
- `DUEL_LOCAL_ENABLED=false`
- `DUEL_EXPOSE_JOIN_INFO=false`
- `DUEL_EXPOSE_ROOM_PASSWORD=false`
- `PUBLIC_INDEXING=false` (recommended for short-lived demos)
- Keep `NODE_ENV=development` if you want guest access without logins (production defaults require auth).
