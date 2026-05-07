# Duel Core (EDOPro / Project Ignis)

This project is moving toward **full-rules Yu-Gi-Oh duels** by integrating an
existing open-source duel core (the “EDOPro / ocgcore” ecosystem) instead of
re-implementing rules and card scripts ourselves.

## What’s wired up (today)

The Duelist ARC Node server exposes two endpoints:

- `GET /duel-core/health` — verifies `CoreIntegrator` is present.
- `POST /duel-core/smoke` — spawns `CoreIntegrator`, processes once, then exits.

These endpoints are *integration plumbing* only; the browser duel UI + CPU
decision-making comes next.

## Setup (local dev)

We currently expect a local checkout of `diangogav/EDOpro-server-ts`, because it
already includes a small “CoreIntegrator” executable wrapper around `libocgcore`
and a known-good resources layout for scripts/databases/banlists.

1) Clone and prepare the EDOPro server checkout (recommended location is this repo’s `.tmp/`):

```bash
cd /home/angelo/Documents/git/ar-homelab
mkdir -p .tmp/duelist-arc-edopro
cd .tmp/duelist-arc-edopro
git clone --recursive https://github.com/diangogav/EDOpro-server-ts.git
cd EDOpro-server-ts
bash clone_repositories.sh
bash setup_resources.sh
```

2) Build `CoreIntegrator`:

```bash
cd /home/angelo/Documents/git/ar-homelab/.tmp/duelist-arc-edopro/EDOpro-server-ts
bash install_dependencies.sh
bash build_core_integrator.sh
```

3) Point Duelist ARC’s server at that checkout:

```bash
export EDOPRO_SERVER_TS_ROOT=/home/angelo/Documents/git/ar-homelab/.tmp/duelist-arc-edopro/EDOpro-server-ts
```

4) Run Duelist ARC’s server:

```bash
cd /home/angelo/Documents/git/ar-homelab/projects/yu-gi-oh-website
node server/src/index.js
```

5) Verify:

- `http://localhost:8787/duel-core/health`
- `curl -X POST http://localhost:8787/duel-core/smoke`

## Notes

- `CoreIntegrator` expects its working directory to be the `EDOpro-server-ts`
  repo root because it loads:
  - `core/libocgcore.so`
  - `resources/edopro/scripts/*` (and additional resources used by the sqlite repository)
- We intentionally keep the EDOPro ecosystem checkout under `.tmp/` (it is large
  and is not meant to be committed into this repo).
