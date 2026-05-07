# Deploying Duels (Server-Hosted Core)

Goal: end users should only open the website. The duel engine, scripts, and CPU bot run **server-side**.

## Target architecture

- Browser: UI only (HTML/CSS/JS)
- Duelist ARC server: REST/WebSocket API + session orchestration
- EDOPro duel host service: `EDOpro-server-ts` (runs ocgcore + card scripts + databases)
- CPU: WindBot runs server-side (optional at first)

## Local production-like stack (Docker)

This repo includes a starter compose file that builds:

- `duelist-arc` (this project)
- `edopro` (EDOpro-server-ts + resources + CoreIntegrator)

File: `docker-compose.duel.yml`

### Run

```bash
cd ~/Documents/git/ar-homelab/projects/yu-gi-oh-website
# Optional (recommended): bundle CoreIntegrator into the Duelist ARC image so
# "Browser CPU" works without a host checkout.
export DUELIST_ARC_DOCKER_TARGET=bundled

# Optional (recommended): pin for demo-day stability.
export EDOPRO_REF=<commit-sha-or-tag>

docker compose -f docker-compose.duel.yml up --build
```

Then open:

- `http://localhost:8787`

### Notes

- Building `edopro` may take a while: it clones multiple repos (scripts/databases/banlists) and compiles `CoreIntegrator`.
- For CPU duels, mount WindBot into the `duelist-arc` container and set `WINDBOT_EXE` / `WINDBOT_CWD`.
  - Note: WindBot is commonly distributed as a Windows build; running it on Linux may require Wine/Mono + compatibility work.

## Runtime configuration (Duelist ARC server)

Duelist ARC talks to EDOpro-server-ts via:

- `EDOPRO_HTTP_URL` (example: `http://edopro:7922` in docker)
- `EDOPRO_HOST` and `EDOPRO_PORT` (for WindBot to connect to the duel host)

The UI checks:

- `GET /duel/service/health` → pings the EDOPro HTTP API

## Security / legality note

Be careful about what you distribute publicly (card scripts + databases). Even if they’re common in the community,
you’ll want to be intentional about hosting and licensing before a public launch.
