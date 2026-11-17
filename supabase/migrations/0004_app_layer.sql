-- App-layer support for the LUVYO server's PostgreSQL repository.
--
-- • Readable app ids (e.g. 'mrt3', 'fare-jeep-trad') alongside UUID primary keys:
--   transport_stops / transport_routes use external_id; other tables get `slug`.
-- • `extra jsonb` keeps any record fields without their own column, so records
--   edited in the admin portal round-trip without losing data.
-- • app_config holds dataset-wide settings (scoring, time profiles, analytics).
-- • Admin portal users sign in with tokens, not database roles: the server sets
--   `app.actor_name` per transaction and the audit/fare-history triggers record it.

alter table transport_modes      add column if not exists extra jsonb not null default '{}';
alter table cities               add column if not exists region_name text,
                                 add column if not exists extra jsonb not null default '{}';
alter table transport_operators  add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table transport_stops      add column if not exists extra jsonb not null default '{}';
alter table transport_routes     add column if not exists extra jsonb not null default '{}';
alter table fare_schedules       add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table provider_integrations add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table tricycle_zones       add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table locations            add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table service_advisories   add column if not exists slug text unique,
                                 add column if not exists extra jsonb not null default '{}';
alter table contributors         add column if not exists stats jsonb not null default '{}',
                                 add column if not exists extra jsonb not null default '{}';
alter table community_reports    add column if not exists photo_data_url text,           -- move to Supabase Storage at scale
                                 add column if not exists moderator_note text,
                                 add column if not exists reviewed_by text,
                                 add column if not exists reviewed_at timestamptz,
                                 add column if not exists extra jsonb not null default '{}';
alter table contributions        add column if not exists extra jsonb not null default '{}';  -- e.g. a report on a rider-added route
alter table audit_logs           add column if not exists actor_name text;
alter table fare_history         add column if not exists changed_by_name text;

-- A fare schedule may point at a scope the database doesn't know yet (kept in extra.scope).
alter table fare_schedules drop constraint if exists one_scope;
alter table fare_schedules add constraint one_scope check (num_nonnulls(route_id, operator_id, mode_id, provider_id, zone_id) >= 1 or extra ? 'scope');

create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
create policy "config public read" on app_config for select using (is_public or is_admin('viewer'));
create policy "config admin write" on app_config for all using (is_admin('superadmin')) with check (is_admin('superadmin'));

-- Audit + fare history: record the admin portal user set by the server.
create or replace function audit_change() returns trigger language plpgsql security definer set search_path = public as $$
declare r admin_role; who text := nullif(current_setting('app.actor_name', true), '');
begin
  select role into r from administrator_roles where user_id = auth.uid();
  insert into audit_logs (actor_id, actor_role, actor_name, action, entity, entity_id, before, after)
  values (auth.uid(), r, who, lower(tg_op), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  if tg_table_name = 'fare_schedules' and tg_op = 'UPDATE' then
    insert into fare_history (schedule_id, before, changed_by, changed_by_name) values (old.id, to_jsonb(old), auth.uid(), who);
  end if;
  return coalesce(new, old);
end $$;

-- Riders' points/reputation and contribution outcomes change constantly; the
-- contribution trail is in contributions/confirmations/points_ledger, so these
-- two high-volume tables don't need row-level audit copies.
drop trigger if exists contributors_audit on contributors;
drop trigger if exists contributions_audit on contributions;
