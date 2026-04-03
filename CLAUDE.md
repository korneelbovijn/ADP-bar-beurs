# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Bar-Beurs** ("Wall Street On The Rocks!") is a bar management system where drink prices fluctuate automatically based on demand, like a stock exchange. It runs across 4 apps on the same local network (iPhone hotspot).

## Running the project

Start all 4 apps at once:
```
start-all.bat
```

Or start individually:
```bash
cd bar-management && npm start        # Backend: port 5000 (REST) + 5001 (WebSocket)
cd bar-app && npm start -- --host     # Cashier screen: port 3002
cd bar-admin && npm start -- --host   # Admin panel: port 3001
cd bar-visual && npm start -- --host  # Guest display: port 3004
```

## Network / IP configuration

All frontends connect to the backend via environment variables in each app's `.env`:
- `REACT_APP_API_URL` — e.g. `http://172.20.10.14:5000`
- `REACT_APP_WS_URL` — e.g. `ws://172.20.10.14:5001`

The server machine has a **static IP of `172.20.10.14`** on the iPhone hotspot (`172.20.10.x` subnet, gateway `172.20.10.1`). If the network changes, update all three frontend `.env` files. Never hardcode IPs in source files.

## Backend (`bar-management`)

- `server.js` — the entire backend (Express + WebSocket + cron jobs)
- Connects to PostgreSQL via `.env` (DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT)
- Key tuning variables at the top of `server.js`:
  - `visualUpdateDelayMin` (3) — how often prices are logged for the graph
  - `priceCalculationDelayMin` (15) — how often new prices are calculated
  - `aanpassingsFactor` (0.2) — max price change magnitude (0.0–2.0)

## Pricing algorithm

Every 15 minutes, drinks are ranked least-sold → most-sold. The bottom half drop in price (toward minimum), the top half rise (toward maximum). The magnitude scales with a cosine curve so extreme positions change more. `Frisdrank` is excluded from price changes (fixed price).

## Beurscrash (market crash)

Triggered from `bar-admin` via a WebSocket message `{ message: "crash" }`. The server:
1. Sets all prices to their minimum
2. Blocks automatic price updates while active
3. Broadcasts `{ message: "crash" }` to all clients via WebSocket

Ended the same way — server restores prices to `(min + max) / 2` and broadcasts `{ message: "recovery" }`.

## Database schema

| Table | Purpose |
|---|---|
| `BarItem` | Drinks: naam, foto (emoji), minimumprijs, maximumprijs, huidigeprijs, available |
| `BarVerkoop` | Each sale: datumtijd, totaalprijs |
| `BarVerkoopItem` | Line items per sale: barverkoop_id, baritem_id, aantal, verkoopprijs |
| `BarItemPrijs` | A price snapshot set (just a timestamp + id) |
| `BarItemPrijsDetail` | Price per drink per snapshot: baritem_id, prijs, baritemprijs_id |
| `BeursStatus` | Single row: `CrashActief` boolean |

## Frontend apps

All three are single-file React apps (`src/App.js`). They share the same pattern: fetch data on mount, open a WebSocket, re-fetch on WebSocket messages.

- **bar-app** — cashier screen; staff tap drinks to build a cart, submit to `/api/barverkoop`
- **bar-admin** — login (`123`/`123`), manual price edits, random price generator, crash button, availability toggle
- **bar-visual** — guest-facing big screen; live Recharts line graph + price list; crash mode shows red banner instead of graph
