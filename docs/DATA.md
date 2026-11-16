# Transport data: sources, trust and verification

## Status of the bundled dataset (`data/dev/dataset.json`)

| Data | Status | Action before production |
|---|---|---|
| MRT-3, LRT-1, LRT-2 station lists | Real stations; **approximate** coordinates | Import official coordinates (OSM or operator) |
| Rail fares | `rail_distance` **approximations** of published ranges | Load the official station-to-station matrices as `rail_matrix` |
| Rail hours and headways | Indicative | Verify with DOTr, LRTA and LRMC advisories; set `operatingHours` per day |
| Traditional and modern jeepney fare | Based on the publicly reported LTFRB Oct 2023 order | Verify against the current LTFRB memorandum circular |
| City bus fare | Indicative | Verify per operator and class (ordinary or air-conditioned) |
| EDSA Busway stops | Approximate, **unverified** | Verify stop list, hours and fare |
| Jeepney, UV and BGC bus corridors | **Illustrative test routes**, `verified:false` | Replace with LTFRB franchise and route data or verified surveys |
| UV Express fare | **Placeholder** | Use operator-posted fares |
| Taxi and TNVS formulas | Indicative | Verify. Tolls are excluded |
| Motorcycle taxi fares | Indicative, based on the publicly reported LTFRB guide | Live quotes require official provider agreements |
| Tricycle zones | **Development samples** (one fixed, one negotiated) | Configure per LGU tariff ordinance |
| Pasig River Ferry | `operational:false`, hidden from results | Enable once current service is verified |
| Advisories | Two samples (one expired, used for tests) | Connect official feeds |

Search the dataset for `"dataset": "development"`; the admin dashboard counts these records.

## Source types (shown on every fare and route)

1. `official` – published by a government agency or operator (fare order, matrix, timetable)
2. `live_quote` – returned by an authorised provider API at request time
3. `operator` – supplied directly by a verified operator
4. `admin_verified` – checked by a LUVYO administrator (field survey and similar)
5. `community` – user-submitted, unverified
6. `indicative` – model-based estimate

The weakest source on any leg sets the route's overall label, and *Best overall* ranking penalises weak
data slightly.

## Verification workflow

1. A user report arrives (`pending`). A moderator sets it to `under_review`.
2. A data editor checks it against an official source or a field survey, then edits the route, stop
   or fare in the admin portal. They set `sourceType`, `lastVerified` and `dataset: "production"`.
   The change is audit-logged, and fare edits are also written to fare history.
3. The moderator marks the report `verified`, which raises the reporter's reputation. Rejected reports
   lower it. **Verifying a report never edits data by itself.**
4. Stale data: anything with `lastVerified` older than 365 days is treated as stale (`trust.isStale`)
   and should be re-verified. Pending reports expire after 60 days (a pg_cron job in the migration
   comments).

## Importing

- **GeoJSON** (admin portal → Import): `Point` features become stops and `LineString` features with a
  `modeId` property become routes.
- **GTFS:** load `stops.txt` → `transport_stops`, `routes.txt` → `transport_routes`, `stop_times`
  ordering → `route_stops`, `fare_attributes` and `fare_rules` → `fare_schedules` and `fare_rules`. GTFS
  feeds for Metro Manila exist from past projects but may be outdated; check licence and freshness.
- **CSV:** convert to GeoJSON or insert into Supabase directly.

## Before enabling a city

Set `cities.active = true` only after the city has verified routes, fare schedules and at least a basic
set of places for search. Routing code needs no change.
