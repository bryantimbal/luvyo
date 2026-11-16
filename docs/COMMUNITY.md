# Community-driven data (Ambag)

## Who owns what
| Service | Source of truth |
|---|---|
| MRT/LRT, terminal & P2P buses, ferries/ports | Official / operator / admin-verified data |
| Jeepney, UV Express, tricycle | **Riders** (plus any official fare orders, which always win) |
| Motorcycle taxi, ride-hailing, taxi | Indicative models **calibrated by what riders actually paid** |

Modes carry `communityDriven` (accepts contributions) and `flexibleStops` (board / say "Para!" anywhere).
The server and the database (`0003_community.sql` trigger) refuse contributions for other modes.

## "Para anywhere" routing
Flexible lines get hidden route points every ~120 m along their geometry (`line.shape` from verified
ride recordings, otherwise the reference stops). The planner boards at the point nearest you and alights
near your destination or a transfer. Fares use distance along the route. Instructions read: *"Wait near
Aurora cor. 15th Ave and flag down a jeepney with signboard 'CUBAO – QUIAPO'. Say 'Para!' at Legarda."*

## Contributions
`fare`, `wait`, `route_check` ("still accurate?"), `route_trace` (GPS ride), `new_route`,
`loading_spot`, `route_change`, `last_trip`. Each is plausibility-checked (fare ranges per mode, speeds
under 100 km/h, minimum trace length, inside the Philippines). Limits: 10/day on probation, 30/day after;
no duplicate report from the same rider on the same target within 6 h. Locations are rounded to about 11 m.
GPS traces lose their first and last 300 m on the phone, and the server trims again for clients that don't.

## Verification maths (`core/community.js`)
- Vote weight: probation ×0.6 (until 3 accepted reports), then `0.75 + 0.25·log2(1 + rep/10)`, capped at
  ×2.5. Negative reputation ×0.25; suspended ×0.
- Each vote decays with a per-type half-life (fare 120 d, wait 45 d, route 365 d …). Votes from more than
  5 km away count ×0.6.
- **Rider-verified** when weighted agreement ≥ 3 from ≥ 3 distinct riders (about 5 new riders or 3
  trusted ones). **Disputed** when ≥ 40% of the weight disagrees. **Rejected** at score ≤ −2.
  **Needs re-check** when a verified item decays below the threshold. A moderator decision overrides all
  of these.
- Route checks are votes, not claims: they add up into the route's "N riders" count and its
  rider-verified status.

## What verified data changes
- Tricycle zones with no official tariff: fare = robust weighted median of verified reports.
- Jeepney/UV lines with no line-level official schedule: rider minimum fare, per-km rate from the mode schedule.
- Taxi/TNVS/motorcycle taxi: indicative model scaled by the median ratio of paid ÷ estimated (≥ 3 reports).
- Waits: line wait range (25th–75th percentile); hailed modes: pickup range.
- New routes become routable lines (`sourceType: community_verified`, `verified: false`).
- Route changes and last trips become warnings on route results.
Official, operator and admin-verified schedules are never overridden.

## Rewards
Points: report +3 to +25, confirmation +1, your report verified +20, correct vote +2.
Reputation: +10 when your report is verified, −10 when it's rejected, ±2 for votes that match or contradict
the outcome. Levels: Pasahero → Suki (100) → Barker (300) → Kundoktor (700) → Tsuper (1500) →
Hari ng Kalsada (3000). Badges and a weekly, monthly and all-time leaderboard.

## Identity
With Supabase configured, contributors are signed-in users (JWT checked server-side). Without it, local
dev uses the device id. That is fine for demos but **not abuse-resistant**: production must configure
auth.
