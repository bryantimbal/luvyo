-- Row Level Security, audit triggers and helper functions.
-- The browser only ever holds the anon key + the user's JWT. Privileged work
-- (imports, account deletion, push fan-out) runs server-side with the
-- service-role key, which must never be shipped to clients.

create or replace function is_admin(min_role admin_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from administrator_roles r where r.user_id = auth.uid()
      and case min_role
        when 'viewer' then true
        when 'moderator' then r.role in ('moderator','superadmin')
        when 'data_editor' then r.role in ('data_editor','superadmin')
        when 'superadmin' then r.role = 'superadmin' end);
$$;

-- ------------------------------------------- public reference data ---
-- Readable by everyone (anon + authenticated); writable by data editors.
do $$
declare t text;
begin
  foreach t in array array['countries','regions','cities','barangays','locations','transport_modes','transport_operators',
    'transport_terminals','transport_stops','transport_routes','route_stops','route_segments','operating_schedules',
    'fare_schedules','fare_rules','passenger_discounts','provider_integrations','tricycle_zones','data_sources',
    'service_advisories','traffic_incidents','weather_alerts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s public read" on %I for select using (true)', t, t);
    execute format('create policy "%s editor write" on %I for all using (is_admin(''data_editor'')) with check (is_admin(''data_editor''))', t, t);
  end loop;
end $$;
-- moderators also manage advisories
create policy "advisories moderator write" on service_advisories for all using (is_admin('moderator')) with check (is_admin('moderator'));

-- ------------------------------------------- user-owned data ---
do $$
declare t text;
begin
  foreach t in array array['saved_locations','saved_routes','commute_history','commute_expenses','commute_budgets','notifications']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

alter table users enable row level security;
create policy "users self read" on users for select using (id = auth.uid() or is_admin('moderator'));
create policy "users admin update" on users for update using (is_admin('moderator'));
alter table user_profiles enable row level security;
create policy "profile own" on user_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table user_preferences enable row level security;
create policy "prefs own" on user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create app rows when someone signs up.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into users (id) values (new.id);
  insert into user_profiles (user_id, display_name) values (new.id, new.raw_user_meta_data->>'full_name');
  insert into user_preferences (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ------------------------------------------- community ---
alter table community_reports enable row level security;
create policy "reports insert by signed-in, non-suspended" on community_reports for insert
  with check (auth.uid() is not null and user_id = auth.uid() and not exists (select 1 from users u where u.id = auth.uid() and u.is_suspended));
create policy "reports own read" on community_reports for select using (user_id = auth.uid() or is_admin('moderator'));
create policy "reports moderate" on community_reports for update using (is_admin('moderator'));
alter table report_attachments enable row level security;
create policy "attachments own" on report_attachments for all using (exists (select 1 from community_reports r where r.id = report_id and (r.user_id = auth.uid() or is_admin('moderator'))));
alter table report_verifications enable row level security;
create policy "verifications moderators" on report_verifications for all using (is_admin('moderator')) with check (is_admin('moderator'));

-- Reputation follows moderation outcome; it never promotes report content to official data.
create or replace function report_reputation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.user_id is not null then
    update users set reputation = reputation + case new.status when 'verified' then 1 when 'rejected' then -1 else 0 end where id = new.user_id;
  end if;
  return new;
end $$;
create trigger community_reports_reputation after update on community_reports for each row execute function report_reputation();

-- ------------------------------------------- routing / analytics ---
do $$
declare t text;
begin
  foreach t in array array['route_searches','route_options','route_legs','route_estimates','provider_quotes','fare_history','audit_logs','administrator_roles']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s admin read" on %I for select using (is_admin(''viewer''))', t, t);
  end loop;
end $$;
-- searches/quotes are written by the server (service role bypasses RLS)
create policy "roles superadmin manage" on administrator_roles for all using (is_admin('superadmin')) with check (is_admin('superadmin'));

-- ------------------------------------------- audit + fare history ---
create or replace function audit_change() returns trigger language plpgsql security definer set search_path = public as $$
declare r admin_role;
begin
  select role into r from administrator_roles where user_id = auth.uid();
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, before, after)
  values (auth.uid(), r, lower(tg_op), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', ''),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  if tg_table_name = 'fare_schedules' and tg_op = 'UPDATE' then
    insert into fare_history (schedule_id, before, changed_by) values (old.id, to_jsonb(old), auth.uid());
  end if;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['transport_routes','transport_stops','route_stops','fare_schedules','fare_rules','passenger_discounts',
    'provider_integrations','tricycle_zones','service_advisories','community_reports','cities','administrator_roles','transport_operators']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_change()', t || '_audit', t);
  end loop;
end $$;

-- Expire stale community reports nightly (schedule with pg_cron):
-- select cron.schedule('expire-reports', '0 3 * * *', $$update community_reports set status='expired' where status='pending' and created_at < now() - interval '60 days'$$);
