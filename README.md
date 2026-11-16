# SakayPinoy – Commute Companion

**One destination. Multiple ways to get there. Know the cost before you go.**

SakayPinoy compares jeepney, bus, MRT/LRT, UV Express, tricycle, motorcycle taxi, taxi and
ride-hailing options for a trip in the Philippines. For each option it shows the **estimated total fare
(₱)** and **estimated travel time**, and labels where each number comes from.

> ⚠️ **This build ships with a development dataset.** Rail stations are real, but coordinates are
> approximate. Fares are indicative figures based on publicly reported fare orders, and the jeepney, UV
> and bus corridors are illustrative test routes marked *not verified*. Every such record is tagged
> `dataset: "development"` and shows a **DEV DATA** badge in the app. Before launch, replace it using
> the admin portal or an import (see [docs/DATA.md](docs/DATA.md)).

## Quick start

```bash
npm start
```

Open http://localhost:8787 for the app and http://localhost:8787/admin/ for the admin portal. Without
`ADMIN_TOKENS`, a temporary superadmin token is printed to the console.

```bash
npm test
```

Runs the engine and API tests (Node's built-in runner, no dependencies).

Requirements: Node ≥ 20. There are no npm dependencies; Leaflet 1.9.4 is vendored in `apps/web/vendor/`.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 8787) |
| `ADMIN_TOKENS` | `token:role:name,…`. Roles: `superadmin`, `data_editor`, `moderator`, `viewer` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Turn on accounts (email/password and Google) through Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Used for account deletion; never sent to clients |
| `TILE_URL` | Map tile template (default: OpenStreetMap. Use your own tile provider in production) |
| `SAKAY_DATA_FILE` | Path of the JSON repository (default `data/runtime/dataset.json`, copied from the seed) |
| `CORS_ORIGIN` | Allowed origin if the API is served separately |

## What's in the box

```
core/            Isomorphic engines (run on server AND in the browser for offline use)
  router.js        Multimodal Dijkstra planner, discovery helpers, ride-hail comparison
  fareEngine.js    Data-driven fare calculation (distance, rail matrix, meter, TNVS, tiered, zone, negotiated)
  timeEngine.js    Travel-time ranges, operating hours, Asia/Manila time
  ranking.js       Cheapest / Fastest / Fewest transfers / Best overall (generalised cost)
  assistant.js     Grounded English/Filipino/Taglish commute assistant
  trust.js         Source-type classification and freshness
  community.js     Contributions, peer verification, reputation, rewards → engine data
server/          Zero-dependency Node API + static host, RBAC, rate limiting, audit log
apps/web/        Android-first PWA (24 screens, offline-capable)
apps/admin/      Admin portal (routes, stops, fares, providers, zones, advisories, moderation, import, audit)
supabase/        PostgreSQL + PostGIS schema with Row Level Security (production backend)
data/seed/       Development dataset generator  →  data/dev/dataset.json
tests/           Engine + API tests
docs/            Architecture, data verification, Play Store, notifications, roadmap
```

## Core principles in the code

- **No invented numbers.** Fare amounts live only in fare schedules, never in UI or engine code. A
  missing or negotiated fare displays *Fare unavailable* and is left out of the total, which is then
  marked partial (`₱45+`).
- **Every estimate is labelled** as official, live quote, operator, admin-verified, community or
  indicative, with its last-verified date.
- **Discounts are applied only where eligibility is configured** on the schedule (for example the
  20% statutory discounts under RA 11314, RA 9994 and RA 10754). Elsewhere the regular fare is shown
  with a note.
- **Times are ranges.** Traffic is reported honestly: the current model is a typical-speed profile, not
  live traffic.
- **No fake availability.** No live vehicle markers, no simulated bookings. Provider buttons open the
  official app or site.
- **Community reports never become official automatically.**
- **Sponsored content cannot affect rankings.** `rankOptions` has no input for it.

## Community data (Ambag)

Jeepneys, UV Express, tricycles, taxis and ride-hailing have no reliable central data, so riders supply
and verify it. Votes are reputation-weighted and fade over time. Rail, terminal buses, P2P and ferries
stay on official data. Details are in [docs/COMMUNITY.md](docs/COMMUNITY.md), and screen mockups are in
[docs/mockups/](docs/mockups/).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.
