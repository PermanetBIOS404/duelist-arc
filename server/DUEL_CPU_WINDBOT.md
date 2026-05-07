# CPU Duels (WindBot)

This is the “CPU battles first” path using **WindBot** as the AI opponent and
**EDOpro-server-ts** as the duel host.

## Current behavior

`POST /cpu-duel/edopro/start`:

- Creates a new duel room in `EDOpro-server-ts` via its HTTP API (`/api/room`).
- Spawns WindBot and has it connect to the duel room as the opponent.
- Returns the host/port/password so you can join the room from the **EDOPro desktop client**.

This gets you *real-rules dueling vs CPU* immediately, before the web duel UI is implemented.

## Prereqs

1) A running `EDOpro-server-ts` instance (see `server/DUEL_CORE_EDOPRO.md`).

2) A compiled WindBot executable.

One common repo is `IceYGO/windbot` (C#). Build it with Visual Studio or Mono.
Make sure the bot has access to `cards.cdb` (and any needed resources) as described
by that project’s README.

## Server env vars (Duelist ARC)

Set these before running `node server/src/index.js`:

- `WINDBOT_EXE` — full path to `WindBot.exe` (or the platform-equivalent executable)
- `WINDBOT_CWD` — working dir for WindBot (defaults to `dirname(WINDBOT_EXE)`)
- `EDOPRO_HTTP_URL` — default `http://127.0.0.1:7922` (EDOpro-server-ts HTTP server)
- `EDOPRO_HOST` — default `127.0.0.1` (host WindBot connects to)
- `EDOPRO_PORT` — default `7911` (EDOpro-server-ts TCP duel port)
- `EDOPRO_BANLIST` — banlist name used by `/cpu-duel/edopro/start` if request doesn’t provide one

## Start a CPU duel

Example:

```bash
curl -X POST http://localhost:8787/cpu-duel/edopro/start \
  -H 'Content-Type: application/json' \
  -d '{"name":"CPU Duel","banlist":"2026.04 TCG","rule":1,"botName":"WindBot","deck":"Blue-Eyes"}'
```

Response includes `join.roomPassword`.

## Stop a CPU duel

```bash
curl -X POST http://localhost:8787/cpu-duel/edopro/stop \
  -H 'Content-Type: application/json' \
  -d '{"duelId":"<id>"}'
```

## Notes / security

- The `/start` endpoint currently returns the room password for convenience in local dev.
  Before any public deployment, we should lock this down (auth required + no password in response).

