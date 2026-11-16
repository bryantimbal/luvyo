-- LUVYO production schema (Supabase / PostgreSQL 15 + PostGIS).
-- Mirrors the JSON development repository in server/repo.js.
-- Conventions: UUID PKs, timestamptz, every transport fact carries
-- source_type + data_source_id + last_verified_at (spec §30).

create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------- enums ---
create type source_type as enum ('official','live_quote','operator','admin_verified','community','indicative');
create type dataset_kind as enum ('production','development','imported');
create type passenger_type as enum ('regular','student','senior','pwd');
create type fare_kind as enum ('distance','rail_matrix','rail_distance','fixed','meter','tnvs','tiered','zone','negotiated');
create type report_status as enum ('pending','under_review','verified','rejected','expired');
create type severity as enum ('info','warning','critical');
create type admin_role as enum ('superadmin','data_editor','moderator','viewer');
create type integration_status as enum ('none','deep_link_only','official_api','disabled');

-- ------------------------------------------------- data provenance ---
create table data_sources (                                   -- 41
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. 'LTFRB MC 2023-xxx', 'LRTA fare matrix 2023'
  publisher text,                     -- DOTr, LTFRB, MMDA, LRTA, LGU …
  url text,
  license text,                       -- usage rights confirmed
  retrieved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------- geography ---
create table countries (id uuid primary key default gen_random_uuid(), code char(2) unique not null, name text not null);   -- 6
create table regions (id uuid primary key default gen_random_uuid(), country_id uuid not null references countries on delete cascade, code text, name text not null); -- 7
create table cities (                                          -- 8
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions on delete set null,
  slug text unique not null, name text not null,
  is_active boolean not null default false,          -- admins activate cities without app changes
  boundary geography(MultiPolygon, 4326),
  created_at timestamptz not null default now()
);
create table barangays (id uuid primary key default gen_random_uuid(), city_id uuid not null references cities on delete cascade, name text not null, boundary geography(MultiPolygon, 4326)); -- 9
create table locations (                                       -- 10  (places, landmarks, geocoder cache)
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities on delete set null,
  name text not null, aliases text[] not null default '{}', kind text not null default 'landmark',
  geom geography(Point, 4326) not null,
  dataset dataset_kind not null default 'production',
  created_at timestamptz not null default now()
);
create index locations_geom on locations using gist (geom);
create index locations_name_trgm on locations using gin (name gin_trgm_ops);

-- ------------------------------------------------- transportation ---
create table transport_modes (                                 -- 13
  id text primary key,                 -- walk, jeepney, bus, rail, uv, tricycle, ferry, mc_taxi, ridehail_car, taxi
  label text not null, label_fil text, category text not null, icon text, color text, road_based boolean not null default false
);
create table transport_operators (                             -- 14
  id uuid primary key default gen_random_uuid(),
  name text not null, mode_id text references transport_modes, website text, contact text,
  franchise_ref text, is_active boolean not null default true,
  data_source_id uuid references data_sources, dataset dataset_kind not null default 'production'
);
create table transport_terminals (                             -- 12
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities, name text not null, mode_id text references transport_modes,
  geom geography(Point, 4326) not null, operating_notes text,
  source_type source_type not null default 'indicative', data_source_id uuid references data_sources,
  last_verified_at timestamptz, dataset dataset_kind not null default 'production'
);
create index transport_terminals_geom on transport_terminals using gist (geom);
create table transport_stops (                                 -- 11
  id uuid primary key default gen_random_uuid(),
  external_id text unique,             -- GTFS stop_id etc.
  city_id uuid references cities, terminal_id uuid references transport_terminals,
  name text not null, kind text not null,   -- station, bus_stop, jeepney_stop, uv_terminal, ferry_terminal …
  geom geography(Point, 4326) not null, accessible boolean,
  source_type source_type not null default 'indicative', data_source_id uuid references data_sources,
  last_verified_at timestamptz, dataset dataset_kind not null default 'production'
);
create index transport_stops_geom on transport_stops using gist (geom);
create index transport_stops_name_trgm on transport_stops using gin (name gin_trgm_ops);

create table transport_routes (                                -- 15
  id uuid primary key default gen_random_uuid(),
  external_id text unique, code text, name text not null, signboard text,
  mode_id text not null references transport_modes, operator_id uuid references transport_operators,
  city_id uuid references cities, color text,
  bidirectional boolean not null default true,
  is_operational boolean not null default true,        -- non-operational routes never appear in results
  is_verified boolean not null default false,          -- community data never sets this; admins do
  headway_min int4range, detour_factor numeric(4,2),
  shape geography(LineString, 4326),
  source_type source_type not null default 'indicative', data_source_id uuid references data_sources,
  last_verified_at timestamptz, dataset dataset_kind not null default 'production', notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index transport_routes_shape on transport_routes using gist (shape);
create table route_stops (                                     -- 16
  route_id uuid not null references transport_routes on delete cascade,
  seq int not null, stop_id uuid not null references transport_stops,
  is_boarding boolean not null default true, is_alighting boolean not null default true,
  primary key (route_id, seq)
);
create table route_segments (                                  -- 17  stop-to-stop geometry/distance cache
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references transport_routes on delete cascade,
  from_seq int not null, to_seq int not null, distance_m int not null, geom geography(LineString, 4326)
);
create table operating_schedules (                             -- 18
  id uuid primary key default gen_random_uuid(),
  route_id uuid references transport_routes on delete cascade,
  operator_id uuid references transport_operators on delete cascade,
  day_of_week smallint[] not null default '{0,1,2,3,4,5,6}', start_time time, end_time time,
  departures time[],                   -- fixed departures (ferries, provincial buses)
  is_closed boolean not null default false,
  valid_from date, valid_to date,
  source_type source_type not null default 'indicative', data_source_id uuid references data_sources, last_verified_at timestamptz
);

-- ------------------------------------------------- fares ---
create table fare_schedules (                                  -- 19
  id uuid primary key default gen_random_uuid(),
  name text not null, kind fare_kind not null,
  route_id uuid references transport_routes, operator_id uuid references transport_operators,
  mode_id text references transport_modes, provider_id uuid, zone_id uuid,
  effective_from date not null, effective_to date,
  is_active boolean not null default true,
  rounding numeric(5,2) not null default 0.25,
  source_type source_type not null, source_note text, disclaimer text,
  data_source_id uuid references data_sources, last_verified_at timestamptz,
  dataset dataset_kind not null default 'production',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint one_scope check (num_nonnulls(route_id, operator_id, mode_id, provider_id, zone_id) >= 1)
);
create table fare_rules (                                      -- 20  parameters of a schedule
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references fare_schedules on delete cascade,
  params jsonb not null,               -- e.g. {"baseFare":13,"baseKm":4,"perKm":1.8}
  from_stop_id uuid references transport_stops, to_stop_id uuid references transport_stops, -- rail matrix rows
  amount numeric(8,2)
);
create index fare_rules_matrix on fare_rules (schedule_id, from_stop_id, to_stop_id);
create table passenger_discounts (                             -- 22  only rows with confirmed eligibility
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references fare_schedules on delete cascade,
  passenger passenger_type not null, rate numeric(4,3) not null check (rate between 0 and 1),
  legal_basis text not null, unique (schedule_id, passenger)
);
create table fare_history (                                    -- 21
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references fare_schedules on delete cascade,
  before jsonb not null, changed_by uuid, changed_at timestamptz not null default now()
);
create table provider_integrations (                           -- 40
  id uuid primary key default gen_random_uuid(),
  name text not null, mode_id text not null references transport_modes, vehicle text,
  status integration_status not null default 'none', enabled boolean not null default true,
  website text, store_url text, deep_link_template text,
  api_terms_confirmed boolean not null default false,  -- availability, auth, commercial rights, pricing, rate limits
  notes text, updated_at timestamptz not null default now()
);
alter table fare_schedules add constraint fare_provider_fk foreign key (provider_id) references provider_integrations;
create table provider_quotes (                                 -- 23  live quotes, short-lived
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_integrations,
  origin geography(Point, 4326) not null, destination geography(Point, 4326) not null,
  fare_min numeric(8,2), fare_max numeric(8,2), pickup_min int, duration_min int,
  quoted_at timestamptz not null default now(), expires_at timestamptz not null
);
create table tricycle_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references cities, name text not null, barangay_ids uuid[] not null default '{}',
  area geography(Polygon, 4326), center geography(Point, 4326) not null, radius_m int,
  fare_type text not null check (fare_type in ('fixed','zone','negotiated')),
  capacity smallint, is_active boolean not null default true,
  source_type source_type not null default 'indicative', last_verified_at timestamptz, dataset dataset_kind not null default 'production'
);
alter table fare_schedules add constraint fare_zone_fk foreign key (zone_id) references tricycle_zones;

-- ------------------------------------------------- users ---
-- auth.users is managed by Supabase Auth. `users` holds app-level account state.
create table users (                                           -- 1
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(), last_seen_at timestamptz,
  is_suspended boolean not null default false, reputation int not null default 0
);
create table user_profiles (                                   -- 2
  user_id uuid primary key references users on delete cascade,
  display_name text, photo_url text, language text not null default 'en' check (language in ('en','fil')),
  passenger passenger_type not null default 'regular',
  home_location uuid references locations, work_location uuid references locations,
  budget_daily numeric(8,2), budget_monthly numeric(10,2), is_premium boolean not null default false,
  updated_at timestamptz not null default now()
);
create table user_preferences (                                -- 3
  user_id uuid primary key references users on delete cascade,
  max_walk_m int not null default 1000, max_transfers smallint, excluded_modes text[] not null default '{}',
  public_only boolean not null default false, priority text not null default 'best',
  notif_advisories boolean not null default true, notif_saved_routes boolean not null default true,
  notif_departure boolean not null default true, notif_reports boolean not null default true,
  fcm_tokens text[] not null default '{}'
);
create table saved_locations (                                 -- 4
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  label text not null, name text not null, geom geography(Point, 4326) not null, created_at timestamptz not null default now()
);
create table saved_routes (                                    -- 5
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  name text not null, origin jsonb not null, destination jsonb not null, preferences jsonb,
  last_fare_min numeric(8,2), last_fare_max numeric(8,2), last_time_min int, last_time_max int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ------------------------------------------------- routing ---
create table route_searches (                                  -- 24  analytics; user_id nullable (guests)
  id uuid primary key default gen_random_uuid(), user_id uuid references users on delete set null,
  origin geography(Point, 4326), destination geography(Point, 4326), destination_name text,
  depart_at timestamptz, arrive_by timestamptz, passenger passenger_type, filters jsonb,
  result_count int, failed boolean not null default false, created_at timestamptz not null default now()
);
create table route_options (                                   -- 25
  id uuid primary key default gen_random_uuid(), search_id uuid not null references route_searches on delete cascade,
  rank smallint, kind text, title text, tags text[], score numeric
);
create table route_legs (                                      -- 26
  id uuid primary key default gen_random_uuid(), option_id uuid not null references route_options on delete cascade,
  seq smallint not null, mode_id text references transport_modes, route_id uuid references transport_routes,
  from_stop_id uuid references transport_stops, to_stop_id uuid references transport_stops, distance_m int
);
create table route_estimates (                                 -- 27
  option_id uuid primary key references route_options on delete cascade,
  fare_min numeric(8,2), fare_max numeric(8,2), fare_partial boolean, time_min int, time_max int,
  wait_min int, wait_max int, walk_m int, transfers smallint, source_type source_type, traffic text
);

-- ------------------------------------------------- user activity ---
create table commute_history (                                 -- 28
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  origin jsonb not null, destination jsonb not null, title text, fare_min numeric(8,2), fare_max numeric(8,2),
  time_min int, time_max int, modes text[], distance_km numeric(6,2), travelled boolean not null default false,
  at timestamptz not null default now()
);
create table commute_expenses (                                -- 29
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  amount numeric(8,2) not null check (amount >= 0), note text, modes text[], distance_km numeric(6,2),
  estimated_min numeric(8,2), estimated_max numeric(8,2), cheapest_alt numeric(8,2), at timestamptz not null default now()
);
create table commute_budgets (                                 -- 30
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  period text not null check (period in ('daily','weekly','monthly')), amount numeric(10,2) not null, unique (user_id, period)
);
create table notifications (                                   -- 31
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  kind text not null, title text not null, body text, link text, read_at timestamptz, created_at timestamptz not null default now()
);

-- ------------------------------------------------- community ---
create table community_reports (                               -- 32
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users on delete set null, device_id text,
  category text not null check (category in ('incorrect_route','missing_stop','route_change','tricycle_fare','road_closure','long_wait','disruption','unavailable_service','other')),
  description text not null check (length(description) between 10 and 2000),
  location_name text, geom geography(Point, 4326), route_id uuid references transport_routes, zone_id uuid references tricycle_zones,
  status report_status not null default 'pending', created_at timestamptz not null default now(), expires_at timestamptz
);
create index community_reports_status on community_reports (status, created_at desc);
create table report_attachments (                              -- 33
  id uuid primary key default gen_random_uuid(), report_id uuid not null references community_reports on delete cascade,
  storage_path text not null, mime text not null, bytes int
);
create table report_verifications (                            -- 34
  id uuid primary key default gen_random_uuid(), report_id uuid not null references community_reports on delete cascade,
  moderator_id uuid not null, status report_status not null, note text, created_at timestamptz not null default now()
);

-- ------------------------------------------------- advisories ---
create table service_advisories (                              -- 35
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null, source text not null, url text,
  source_type source_type not null default 'official', severity severity not null default 'info',
  area text, area_geom geography(MultiPolygon, 4326), mode_ids text[] not null default '{}', route_ids uuid[] not null default '{}',
  published_at timestamptz not null, updated_at timestamptz not null default now(), expires_at timestamptz not null,
  is_active boolean not null default true
);
create index service_advisories_active on service_advisories (expires_at) where is_active;
create table traffic_incidents (                               -- 36
  id uuid primary key default gen_random_uuid(), kind text not null, description text, geom geography(Geometry, 4326),
  source text not null, source_type source_type not null, starts_at timestamptz, expires_at timestamptz not null
);
create table weather_alerts (                                  -- 37
  id uuid primary key default gen_random_uuid(), source text not null default 'PAGASA', title text not null, body text,
  area text, level text, issued_at timestamptz not null, expires_at timestamptz not null
);

-- ------------------------------------------------- administration ---
create table administrator_roles (                             -- 38
  user_id uuid primary key references auth.users on delete cascade, role admin_role not null, granted_by uuid, granted_at timestamptz not null default now()
);
create table audit_logs (                                      -- 39
  id bigint generated always as identity primary key,
  actor_id uuid, actor_role admin_role, action text not null, entity text not null, entity_id text,
  before jsonb, after jsonb, at timestamptz not null default now()
);

-- Views ------------------------------------------------------------------
-- Active advisories only: expired items are never served as active.
create view active_advisories with (security_invoker = true) as
  select * from service_advisories where is_active and expires_at > now();

-- Nearby stops (spec §10): select * from nearby_stops(14.62, 121.05, 800);
create or replace function nearby_stops(lat double precision, lng double precision, radius_m int default 1000)
returns table (id uuid, name text, kind text, distance_m double precision)
language sql stable security invoker as $$
  select s.id, s.name, s.kind, st_distance(s.geom, st_makepoint(lng, lat)::geography)
  from transport_stops s
  where st_dwithin(s.geom, st_makepoint(lng, lat)::geography, radius_m)
  order by 4 limit 50;
$$;
