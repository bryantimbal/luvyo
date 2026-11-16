# Architecture

```
┌──────────── Android PWA (apps/web) ────────────┐      ┌──── Admin portal (apps/admin) ────┐
│ screens/*  →  lib/api.js ──fetch──┐            │      │ token login · CRUD · moderation   │
│                 │ offline fallback│            │      └───────────────┬───────────────────┘
│                 ▼                 │            │                      │ /api/admin/* (RBAC)
│        /core engines (same code)  │            │                      ▼
│ localStorage: user data, dataset  │            │   ┌──────── server/index.js ────────┐
│ service worker: shell, tiles, API │            │   │ validation · rate limit · CSP    │
└───────────────────────────────────┼────────────┘   │ /core engines                    │
                                    └───────────────▶│ repo.js (JSON)  ⇄  Supabase/PostGIS│
                                                     └──────────────────────────────────┘
```

## Routing engine (`core/router.js`)

1. **Graph.** Stops are nodes. For each operational line there is a *ride edge* from every stop
   to every later stop (both directions if the line is bidirectional). Each ride edge carries the full
   fare for boarding at *i* and alighting at *j*, so per-boarding fares stay additive, and a rail
   station-to-station matrix fits the same model. Stops within 500 m are joined by walking edges,
   which handle transfers. The graph is cached per dataset object.
2. **Access and egress.** The origin and destination connect to stops by walking (up to the user's
   limit). Optionally one first- or last-mile *hail* leg (motorcycle taxi, or tricycle inside a
   configured zone) connects to rail and bus trunk stops. The state is `(stop, hailUsed)`, so a journey
   has at most one hailed leg.
3. **Profiles.** Dijkstra runs with five weight profiles (cheapest, fastest, fewest transfers,
   balanced, balanced with hail), each also with rail, jeepney or bus excluded. The variants produce
   genuine alternatives. Results are de-duplicated by leg signature.
4. **Door to door.** Walking (≤ 2.5 km), motorcycle taxi (per provider), ride-hailing car, taxi, and
   tricycle (when origin and destination share a zone) are added as direct options.
5. **Time-dependence.** Each ride edge checks `isOperating(line, arrivalTimeAtStop)`, so trains
   aren't offered after closing. *Arrive by* re-plans from `deadline − worst-case duration` and
   recommends a departure time.
6. **Ranking (`ranking.js`).** Tags are computed from actual metrics. *Best overall* minimises a
   generalised cost in peso-equivalents:
   `fare + VoT·(ride + 1.5·wait) + transfer penalty + walk penalty + data-confidence penalty`.
   The weights live in `settings.scoring`, so admins can tune them without a code change.

Performance on the development dataset is about 30–90 ms per search on the server.

## Fare engine (`core/fareEngine.js`)

| `kind` | Use | Params |
|---|---|---|
| `distance` | Jeepney, bus, UV | `baseFare`, `baseKm`, `perKm` (per succeeding km or fraction) |
| `rail_matrix` | Official station-to-station table | `matrix["from\|to"]` |
| `rail_distance` | Approximation until the matrix is loaded | `boarding`, `perKm`, `minFare`, `maxFare` |
| `fixed` | Fixed-route fares | `fare` |
| `meter` | Taxi | `flagDown`, `perKm`, `perMin` |
| `tnvs` | Ride-hailing car | `base`, `perKm`, `perMin`, `minFare`, `surgeMax` → range |
| `tiered` | Motorcycle taxi | `tiers[]`, `surgeMax` |
| `zone` | Tricycle | `baseFare`, `specialTripFare` |
| `negotiated` | No published tariff | Always returns *unavailable* |

Schedules are selected by scope, in priority order line → zone → provider → operator → mode, and must
fall inside their effective dates. Rounding is per schedule. Discounts apply only from
`schedule.discounts[passengerType]`.

## Travel time (`core/timeEngine.js`)

Each leg time is `distance / speed[band]` (a min/max range) plus dwell per stop, plus station overhead
for rail. Wait time is derived from headway, and pickup time for hailed modes. The bands are AM peak,
PM peak, night and off-peak, all in Asia/Manila time. Manila has no DST, so a fixed +08:00 offset is
exact. Totals sum the legs exactly once; a test enforces this. The road distance provider is a
heuristic (straight line × 1.35). Swapping it for OSRM, OpenRouteService or Google only needs a new
`roadKm` implementation.

## Assistant (`core/assistant.js`)

A deterministic parser extracts origin, destination, budget, day count, priority and mode mentions
from English, Filipino or Taglish, then calls `planJourney`. Every number in a reply comes from the
engine output. To add an LLM later, expose `planJourney`, `estimateFare`, `linesPassing` and
`compareProviders` as tools and keep the same rule: the model may only state what the tools return.

## Provider integrations

`providers` records hold `integration: none | deep_link_only | official_api | disabled`. With `none`,
fares come from configured indicative schedules and availability is *unknown*. A live adapter would
write `provider_quotes` (short TTL) and set `sourceType: live_quote`. Before enabling one, confirm API
availability, authentication, commercial rights, pricing and rate limits (the
`provider_integrations.api_terms_confirmed` column). Never scrape private endpoints.

## Backend options

- **Local/dev:** `server/repo.js` stores everything in one JSON file and supports audit logging,
  fare history and analytics counters.
- **Production:** apply `supabase/migrations/*.sql`, which defines 43 tables, PostGIS indexes, RLS,
  an audit trigger, a signup trigger, a reputation trigger, `nearby_stops()` and an
  `active_advisories` view. Then implement the repository methods against PostgREST, or load
  `planJourney`'s dataset from the database on a cache interval. Both migrations were applied to
  PostgreSQL 16 with PostGIS 3, and RLS isolation was verified.

## Security

- CSP, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy and Permissions-Policy on every response.
- Token-bucket rate limiting per IP, with heavier costs for search and the assistant.
- Input validation (coordinates must be inside the Philippines) and body size limits.
- Admin tokens are compared in constant time. Roles: `superadmin`, `data_editor`, `moderator`,
  `viewer`.
- The browser only ever sees the Supabase anon key. The service-role key is used server-side only.
- Location is requested only on explicit user action. GPS tracking during navigation is opt-in and
  stops when the user leaves the screen.
