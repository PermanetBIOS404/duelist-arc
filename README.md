# Duelist ARC

**Enter the Arc. Become a Legend.**

This repo started as a **card viewer + deck builder** prototype and is now evolving into a **web-based dueling platform** with a unique seasonal tournament system.

## Current Scope (What Works Today)

- Card viewer + dataset tooling
- Deck builder (Main/Extra/Side) + deck manager
- Goldfish (local) for quick hands / zones
- **Platform panel (local-only prototype):** accounts, 3-week tournament + 2-week intermission cycle, standings, and role preview

Important: the Platform panel is **not multiplayer yet**. It’s a scaffolding step toward accounts/matches/tournaments before we introduce a server and real-time duels.

Current entrypoint: `src/index.html`.

## Run locally (recommended)
From this folder:

```bash
cd src
python3 -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.

Notes:
- A local server is recommended because the app uses `fetch()` to load `cards/sample-cards.json`.
- The repo root `index.html` redirects to `src/`.

## Run the demo server (port 8787)
This serves the frontend from `src/` and also exposes the duel/API routes used by the **Duel** tab.

```bash
cd server
npm ci
node src/index.js
```

Open `http://localhost:8787/`.

## Datasets
- Built-in datasets are listed in `src/cards/datasets.json` and selectable in the UI.
- You can also click **Load JSON** to import a local `.json` dataset (stored in browser localStorage).
- Import formats supported:
  - JSON array of card objects
  - YGOPRODeck-style object with a top-level `data` array
- Dataset tools:
  - **Save copy / Rename / Delete / Export** for saved datasets (browser localStorage)

## Filters
- Type, Attribute, Race, Archetype, Favorites
- Kind: Monster / Spell / Trap
- Tags/subtypes:
  - `tag:` (monster mechanics like fusion/synchro/xyz/link/pendulum/ritual, etc.)
  - `st:` (spell/trap subtypes like quick-play/continuous/field/equip/counter, etc.)
- Banlist:
  - TCG/OCG/GOAT: Forbidden / Limited / Semi-Limited (when present in the dataset)
- Numeric bounds: Level, ATK, DEF (min/max)
- Search also matches `race` and `archetype` (when present)
  - Smart search examples: `tag:link atk>=2000 kind:monster "blue-eyes"`
- Quick chips under the toolbar let you toggle common kind/tag/banlist filters with one click.

## UI / browsing
- View controls:
  - View: Comfortable / Compact
  - Thumb: Small / Medium / Large
  - Preview toggle (hover/focus quick preview)
- Layout profiles:
  - Save layout (view/thumb/preview + filters + sort)
  - Switch between saved layouts from the toolbar
- Image zoom:
  - Click a card thumbnail or the detail image to open the image viewer
  - Keyboard: `Esc` close, `←/→` prev/next, `z` zoom

## Dataset details panel
- Click **Dataset details** in the toolbar to see:
  - Card count + detected format
  - Field coverage (how many cards have each field)
  - Basic warnings (e.g., duplicate ids adjusted)

## Deck builder
- Deck is split into Main / Extra / Side (stored in localStorage).
- Deck panel shows section totals and warns (non-blocking) if you exceed basic caps (Main 60, Extra 15, Side 15).
- Export options:
  - **Export** copies deck JSON
  - **Copy list** copies a plain-text deck list
  - **Import list** imports a plain-text deck list (uses current dataset for name matching)
- YDK options:
  - **Copy YDK** copies a `.ydk` deck file
  - **Import YDK** imports a `.ydk` deck file
- File options:
  - **Import file** loads a local `.json` / `.txt` / `.ydk` deck file
  - **Download** saves the deck as `.json` / `.txt` / `.ydk`
- Deck manager:
  - Switch between multiple saved decks (localStorage)
  - Create / duplicate / delete decks
- Detail panel has **+ Auto** to add cards to Main vs Extra based on card type text (Fusion/Synchro/Xyz/Link → Extra).
- Each deck can also store optional notes (saved locally).
- Deck tools:
  - Compare against another saved deck
  - Copy a diff, copy list+ids, and remove unknown ids for the current dataset
