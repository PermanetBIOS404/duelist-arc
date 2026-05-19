# Duelist ARC — Nhost Backend Incorporation Plan

## Purpose of this document

This document explains how Nhost may be incorporated into Duelist ARC as the long-term backend foundation.

This is a planning document only.

No Codex implementation prompts should be written from this document until the project owner and mentor both understand the intended architecture, risks, and staged rollout.

---

## Project context

Duelist ARC is a browser-first Yu-Gi-Oh-inspired dueling platform and future multi-TCG platform.

Long-term goals include:

- Yu-Gi-Oh dueling
- CPU duels
- Emulator Hub
- Multi-TCG support
- Accounts and profiles
- Saved decks
- Match history
- Cosmetics and rewards
- Future animation/trailer support

The project is being developed little by little by a solo developer, with a mentor currently overlooking the project and potentially helping more fully later.

The development style should remain:

- One step at a time
- No unsupported assumptions
- No static-only compromise deployment
- No large code changes without understanding the plan
- No Codex prompts until the backend process is understood
- Full replacement file contents or exact commands when changes are needed

---

## Why backend planning is needed

A previous launch attempt was blocked because Duelist ARC needed real backend support for CPU duels and the duel runtime.

The project is not just a static website.

Duelist ARC needs both:

1. A live duel runtime backend
2. A persistent platform backend

These are related, but they are not the same thing.

---

## Current deployment direction

The current live duel runtime deployment target is Render.

The current Render direction is:

```text
Render Web Service
└── Docker container
    ├── Duelist ARC Node server
    ├── EDOPro
    ├── CoreIntegrator
    ├── CPU duel/runtime support
    └── /healthz endpoint

