# Roadmap and implementation status

Legend: ✅ implemented and tested · 🟡 implemented with limits noted · ⏳ not yet built

## Phase 1 – MVP
- ✅ Branding, splash, onboarding, guest access
- 🟡 Authentication: Supabase email/password and Google via REST. Needs a configured Supabase project
  to work end to end; the UI disables these actions and explains why until then
- ✅ Home dashboard, origin/destination search (local gazetteer), current location, pick on map
- ✅ Interactive Leaflet map: stops by mode, route overlays, tricycle zones
- 🟡 Jeepney, bus, rail, UV and tricycle databases: the schema is complete; content is development data
  (see DATA.md)
- ✅ Fare engine, travel-time engine, multimodal comparison, saved routes, history
- ✅ Admin dashboard: CRUD, moderation, import, audit, fare history, RBAC
- ✅ Supabase backend: PostgreSQL repository with write-through persistence, sign-in-only contributions,
  migrate/seed scripts, Render blueprint and Dockerfile (docs/BACKEND.md)

## Phase 2 – Advanced transportation
- ✅ Motorcycle taxi and ride-hailing comparison, provider app and website links
- ⏳ Live provider quotes: needs official API agreements (adapter shape is defined)
- 🟡 Traffic-aware times: typical time-of-day profiles only. Live traffic needs a provider
- ✅ Departure and arrival planning, operating-hours filtering
- 🟡 Notifications: in-app centre, local reminders, advisory and report-status alerts, and a service
  worker push handler. FCM server fan-out is not wired yet
- ✅ Service advisories with expiry, community reporting with photos and GPS
- ✅ Offline: cached dataset, offline routing, labelled cached results, last-sync time

## Community data (Ambag) – see COMMUNITY.md
- ✅ Board / alight anywhere ("Para!") routing for jeepney, UV and tricycle
- ✅ Contributions, peer verification, reputation weighting, decay, disputes, moderation, suspension
- ✅ Points, levels, badges, leaderboard; offline outbox; GPS ride recorder with on-device privacy trim
- ✅ Verified data feeds fares, waits, new routes and warnings; never overrides official data
- ⏳ Merging several traces into one consensus path (today the latest verified trace wins)
- ⏳ Partner rewards (load credits)

## Phase 3 – Intelligence
- 🟡 AI assistant: grounded rule-based NLU (EN/FIL/Taglish) over the engines. LLM layer not yet added
- ✅ Expense analytics, savings vs cheapest option, budgets
- ⏳ Family profiles, premium tier billing

## Phase 4 – National expansion
- 🟡 City activation flag exists. No non-NCR data yet

## Next steps (suggested order)
1. Load official rail matrices, LTFRB fare orders and verified jeepney/UV routes. Flip records to
   `production`.
2. Implement `SupabaseRepository` (same interface as `JsonRepository`) and sync user data for
   signed-in users.
3. Add a road routing provider (self-hosted OSRM with OSM Philippines data) behind `roadKm`.
4. Pursue official integrations with ride-hailing and motorcycle taxi providers.
5. Wire FCM sending (`user_preferences.fcm_tokens`) for advisories that match saved routes.
6. Add an LLM layer to the assistant with tool calls restricted to the engines.
