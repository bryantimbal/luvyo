-- Contributor-driven data for street-level transport (jeepney, UV Express,
-- tricycle, motorcycle taxi, ride-hailing, taxi). Rail, terminal buses, P2P
-- and ferries stay on official data (enforced by community_modes below).
-- The confidence/verification maths lives in core/community.js and runs
-- server-side; these tables hold the raw votes so it can always be recomputed.

alter type source_type add value if not exists 'community_verified' before 'community';
alter table transport_modes add column if not exists flexible_stops boolean not null default false;   -- "para anywhere"
alter table transport_modes add column if not exists community_driven boolean not null default false;
alter table transport_routes add column if not exists community_contribution_id uuid;

create type contribution_type as enum ('fare','wait','route_check','route_trace','new_route','loading_spot','route_change','last_trip');
create type contribution_status as enum ('pending','community_verified','disputed','needs_reconfirmation','rejected');

create table contributors (
  user_id uuid primary key references users on delete cascade,
  display_name text not null,
  points int not null default 0 check (points >= 0),
  reputation int not null default 0,
  accepted_count int not null default 0,          -- reports verified; ends probation at 3
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references contributors on delete cascade,
  type contribution_type not null,
  mode_id text not null references transport_modes,
  route_id uuid references transport_routes on delete cascade,
  zone_id uuid references tricycle_zones on delete cascade,
  provider_id uuid references provider_integrations on delete cascade,
  geom geography(Point, 4326),                     -- rounded to ~11 m by the API
  trace geography(LineString, 4326),               -- route_trace / new_route, ends trimmed 300 m
  payload jsonb not null default '{}',             -- amount, minutes, time, description, signboard …
  status contribution_status not null default 'pending',
  ever_verified boolean not null default false,
  rewarded text check (rewarded in ('verified','rejected')),
  moderation jsonb,                                -- { status, by, note, at } – moderator override
  created_at timestamptz not null default now()
);
create index contributions_geom on contributions using gist (geom);
create index contributions_status on contributions (status, created_at desc);
create index contributions_target on contributions (route_id, zone_id, provider_id, type);

create table confirmations (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references contributions on delete cascade,
  contributor_id uuid not null references contributors on delete cascade,
  agree boolean not null,
  is_near boolean,                                 -- answered within 5 km of the report
  created_at timestamptz not null default now(),
  unique (contribution_id, contributor_id)         -- one vote per rider
);

create table points_ledger (
  id bigint generated always as identity primary key,
  contributor_id uuid not null references contributors on delete cascade,
  points int not null, reason text not null, created_at timestamptz not null default now()
);
create index points_ledger_time on points_ledger (created_at desc, contributor_id);

-- Only community-driven modes may receive contributions.
create or replace function check_community_mode() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from transport_modes m where m.id = new.mode_id and m.community_driven) then
    raise exception 'mode % uses official data only', new.mode_id;
  end if;
  return new;
end $$;
create trigger contributions_mode before insert on contributions for each row execute function check_community_mode();

-- No confirming your own report.
create or replace function check_not_self() returns trigger language plpgsql as $$
begin
  if exists (select 1 from contributions c where c.id = new.contribution_id and c.contributor_id = new.contributor_id) then
    raise exception 'cannot confirm your own report';
  end if;
  return new;
end $$;
create trigger confirmations_not_self before insert on confirmations for each row execute function check_not_self();

-- Weekly leaderboard (suspended accounts hidden).
create view leaderboard_week with (security_invoker = true) as
  select c.user_id, c.display_name, sum(l.points) as points, c.reputation
  from points_ledger l join contributors c on c.user_id = l.contributor_id
  where l.created_at > now() - interval '7 days' and not c.is_suspended
  group by c.user_id, c.display_name, c.reputation order by points desc;

-- ------------------------------------------------------------- RLS ---
alter table contributors enable row level security;
create policy "contributors public profile" on contributors for select using (true);            -- names/levels are public
create policy "contributors self create" on contributors for insert with check (user_id = auth.uid());
create policy "contributors moderate" on contributors for update using (is_admin('moderator'));   -- points/rep change server-side only

alter table contributions enable row level security;
create policy "contributions readable" on contributions for select using (true);  -- verification needs visibility; no personal data stored
create policy "contributions insert own" on contributions for insert
  with check (contributor_id = auth.uid() and not exists (select 1 from contributors c where c.user_id = auth.uid() and c.is_suspended));
create policy "contributions moderate" on contributions for update using (is_admin('moderator'));

alter table confirmations enable row level security;
create policy "confirmations readable" on confirmations for select using (true);
create policy "confirmations insert own" on confirmations for insert
  with check (contributor_id = auth.uid() and not exists (select 1 from contributors c where c.user_id = auth.uid() and c.is_suspended));

alter table points_ledger enable row level security;
create policy "ledger own or admin" on points_ledger for select using (contributor_id = auth.uid() or is_admin('viewer'));

create trigger contributions_audit after update on contributions for each row execute function audit_change();
create trigger contributors_audit after update on contributors for each row execute function audit_change();
