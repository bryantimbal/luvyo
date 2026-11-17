// PostgreSQL / Supabase repository.
//
// Same interface as JsonRepository. The routing engine needs the whole dataset
// in memory, so on start-up everything is loaded into the app's JSON shape.
// Every change updates memory immediately and is queued; the server calls
// persist() before responding, which writes the queue in one transaction.
//
// App ids stay readable ('mrt3', 'fare-jeep-trad'): they live in
// external_id/slug columns next to UUID primary keys. Fields without a column
// go to `extra` jsonb so admin edits round-trip exactly.

import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { sslFor } from '../scripts/db-migrate.mjs';
import { activeAdvisories, httpError } from './repo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = new Set(['official', 'live_quote', 'operator', 'admin_verified', 'community_verified', 'community', 'indicative']);
const DATASET = new Set(['production', 'development', 'imported']);
const FARE_KIND = new Set(['distance', 'rail_matrix', 'rail_distance', 'fixed', 'meter', 'tnvs', 'tiered', 'zone', 'negotiated']);
const INTEGRATION = new Set(['none', 'deep_link_only', 'official_api', 'disabled']);
const SEVERITY = new Set(['info', 'warning', 'critical']);
const REPORT_STATUS = new Set(['pending', 'under_review', 'verified', 'rejected', 'expired']);
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PUBLIC_EXCLUDE = new Set(['reports', 'auditLog', 'analytics', 'fareHistory', 'contributions', 'confirmations', 'contributors', 'pointsEvents', 'reputation']);
export const COLLECTIONS = ['cities', 'modes', 'operators', 'stops', 'lines', 'fareSchedules', 'providers', 'tricycleZones', 'places', 'advisories', 'reports'];
// insert order respects foreign keys
const ORDER = ['modes', 'cities', 'operators', 'stops', 'lines', 'providers', 'tricycleZones', 'fareSchedules', 'places', 'advisories', 'reports', 'contributors', 'contributions', 'confirmations'];
const CONFIG_KEYS = { meta: true, settings: true, timeProfiles: true, analytics: false };

const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const enumOr = (set, v, d) => (set.has(v) ? v : d);
const date = (v) => (v ? new Date(v) : null);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const num = (v) => (v == null ? null : Number(v));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

/** SQL expression with its own parameters (geography values). */
const expr = (sql, vals) => ({ expr: sql, vals });
const point = (lat, lng) => (lat == null || lng == null ? null : expr('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [Number(lng), Number(lat)]));
const line = (pts) => (Array.isArray(pts) && pts.length >= 2 ? expr('ST_GeomFromGeoJSON(?)::geography', [JSON.stringify({ type: 'LineString', coordinates: pts.map((p) => [Number(p[1]), Number(p[0])]) })]) : null);
const coords = (a) => (a ? JSON.parse(a).coordinates.map(([lng, lat]) => [lat, lng]) : null);

export class PgRepository {
  constructor(databaseUrl) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, ssl: sslFor(databaseUrl), max: 5 });
    this.requiresAuth = true; // contributors must be signed-in Supabase users
    this.ds = {};
    this.version = 0;
    this.queue = [];
    this.chain = Promise.resolve();
    this.ids = {}; // collection → Map(appId → uuid)
    this.ready = this.load();
  }

  // ------------------------------------------------------------ read ---
  async load() {
    const q = (sql, p) => this.pool.query(sql, p).then((r) => r.rows);
    const ds = { contributions: [], confirmations: [], contributors: [], pointsEvents: [], auditLog: [], fareHistory: [], reports: [] };
    const ids = Object.fromEntries(ORDER.map((c) => [c, new Map()]));
    const back = Object.fromEntries(ORDER.map((c) => [c, new Map()])); // uuid → appId
    const reg = (c, appId, uuid) => { ids[c].set(appId, uuid); back[c].set(uuid, appId); };

    for (const r of await q('select key, value from app_config')) ds[r.key] = r.value;
    ds.meta ??= { name: 'LUVYO', dataset: 'production' };
    ds.settings ??= {};
    ds.analytics ??= { searches: 0, failedSearches: 0, fareRequests: 0, destinations: {}, modes: {} };

    ds.modes = (await q('select * from transport_modes order by id')).map((r) => {
      reg('modes', r.id, r.id);
      return { ...r.extra, id: r.id, label: r.label, labelFil: r.label_fil ?? undefined, category: r.category, icon: r.icon, color: r.color, roadBased: r.road_based || undefined, flexibleStops: r.flexible_stops || undefined, communityDriven: r.community_driven || undefined };
    }).map(clean);
    ds.cities = (await q('select * from cities order by name')).map((r) => { reg('cities', r.slug, r.id); return { ...r.extra, id: r.slug, name: r.name, region: r.region_name, active: r.is_active }; });
    const cityApp = (u) => (u ? back.cities.get(u) : undefined);
    ds.operators = (await q('select * from transport_operators order by name')).map((r) => {
      const id = r.slug ?? r.id; reg('operators', id, r.id);
      return clean({ ...r.extra, id, name: r.name, modeId: r.mode_id, website: r.website, contact: r.contact, dataset: r.dataset });
    });
    ds.stops = (await q('select *, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng from transport_stops order by external_id')).map((r) => {
      const id = r.external_id ?? r.id; reg('stops', id, r.id);
      return clean({ ...r.extra, id, name: r.name, lat: r.lat, lng: r.lng, kind: r.kind, cityId: cityApp(r.city_id) ?? r.extra.cityId, sourceType: r.source_type, dataset: r.dataset, lastVerified: day(r.last_verified_at) });
    });
    const routeStops = await q('select route_id, stop_id from route_stops order by route_id, seq');
    const schedules = await q('select * from operating_schedules where route_id is not null');
    ds.lines = (await q('select *, lower(headway_min) h_lo, upper(headway_min) - 1 h_hi, ST_AsGeoJSON(shape::geometry) shape_json from transport_routes order by external_id')).map((r) => {
      const id = r.external_id ?? r.id; reg('lines', id, r.id);
      const hours = {};
      for (const s of schedules.filter((x) => x.route_id === r.id)) {
        const rule = s.is_closed ? 'closed' : { start: s.start_time?.slice(0, 5), end: s.end_time?.slice(0, 5) };
        if (s.day_of_week.length === 7) hours.default = rule; else for (const d of s.day_of_week) hours[DAYS[d]] = rule;
      }
      return clean({
        ...r.extra, id, code: r.code, name: r.name, signboard: r.signboard, modeId: r.mode_id, operatorId: r.operator_id ? back.operators.get(r.operator_id) : r.extra.operatorId,
        stopIds: routeStops.filter((x) => x.route_id === r.id).map((x) => back.stops.get(x.stop_id)), color: r.color, bidirectional: r.bidirectional,
        operational: r.is_operational, verified: r.is_verified, headwayMin: r.h_lo != null ? [r.h_lo, r.h_hi] : undefined, detour: num(r.detour_factor) ?? undefined,
        shape: coords(r.shape_json) ?? undefined, operatingHours: Object.keys(hours).length ? hours : undefined,
        sourceType: r.source_type, dataset: r.dataset, lastVerified: day(r.last_verified_at), notes: r.notes,
      });
    });
    ds.providers = (await q('select * from provider_integrations order by name')).map((r) => {
      const id = r.slug ?? r.id; reg('providers', id, r.id);
      return clean({ ...r.extra, id, name: r.name, modeId: r.mode_id, vehicle: r.vehicle, integration: r.status, enabled: r.enabled, website: r.website, storeUrl: r.store_url, deepLink: r.deep_link_template, notes: r.notes });
    });
    ds.tricycleZones = (await q('select *, ST_Y(center::geometry) lat, ST_X(center::geometry) lng from tricycle_zones order by name')).map((r) => {
      const id = r.slug ?? r.id; reg('tricycleZones', id, r.id);
      return clean({ ...r.extra, id, name: r.name, cityId: cityApp(r.city_id) ?? r.extra.cityId, center: { lat: r.lat, lng: r.lng }, radiusKm: r.radius_m / 1000, fareType: r.fare_type, capacity: r.capacity, active: r.is_active, sourceType: r.source_type, dataset: r.dataset });
    });
    const rules = await q('select schedule_id, params from fare_rules where from_stop_id is null');
    const discounts = await q('select * from passenger_discounts');
    ds.fareSchedules = (await q('select * from fare_schedules order by slug')).map((r) => {
      const id = r.slug ?? r.id; reg('fareSchedules', id, r.id);
      const scope = r.extra.scope ?? clean({ lineId: r.route_id && back.lines.get(r.route_id), operatorId: r.operator_id && back.operators.get(r.operator_id), modeId: r.mode_id, providerId: r.provider_id && back.providers.get(r.provider_id), zoneId: r.zone_id && back.tricycleZones.get(r.zone_id) });
      const disc = Object.fromEntries(discounts.filter((d) => d.schedule_id === r.id).map((d) => [d.passenger, { rate: Number(d.rate), legalBasis: d.legal_basis }]));
      return clean({ ...omit(r.extra, ['scope']), id, name: r.name, scope, kind: r.kind, params: rules.find((x) => x.schedule_id === r.id)?.params ?? {}, discounts: Object.keys(disc).length ? disc : undefined,
        effectiveFrom: day(r.effective_from), effectiveTo: day(r.effective_to), active: r.is_active, sourceType: r.source_type, sourceNote: r.source_note, disclaimer: r.disclaimer, lastVerified: day(r.last_verified_at), dataset: r.dataset });
    });
    ds.places = (await q('select *, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng from locations order by name')).map((r) => {
      const id = r.slug ?? r.id;
      return clean({ ...r.extra, id, name: r.name, lat: r.lat, lng: r.lng, aliases: r.aliases, type: r.kind, dataset: r.dataset });
    });
    ds.advisories = (await q('select * from service_advisories order by published_at desc')).map((r) => {
      const id = r.slug ?? r.id;
      return clean({ ...r.extra, id, title: r.title, body: r.body, source: r.source, url: r.url, sourceType: r.source_type, severity: r.severity, area: r.area, modes: r.mode_ids,
        lineIds: [...(r.route_ids || []).map((u) => back.lines.get(u)).filter(Boolean), ...(r.extra.unresolvedLineIds || [])], publishedAt: iso(r.published_at), updatedAt: iso(r.updated_at), expiresAt: iso(r.expires_at), active: r.is_active ? undefined : false });
    }).map((a) => omit(a, ['unresolvedLineIds']));
    ds.reports = (await q('select *, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng from community_reports order by created_at')).map((r) => clean({
      ...r.extra, id: r.id, category: r.category, description: r.description, locationName: r.location_name, lat: r.lat, lng: r.lng,
      lineId: (r.route_id && back.lines.get(r.route_id)) || (r.zone_id && back.tricycleZones.get(r.zone_id)) || r.extra.lineId, reporterId: r.device_id ?? r.user_id,
      photo: r.photo_data_url, status: r.status, createdAt: iso(r.created_at), moderatorNote: r.moderator_note, reviewedBy: r.reviewed_by, reviewedAt: iso(r.reviewed_at),
    }));
    ds.contributors = (await q('select * from contributors')).map((r) => clean({ ...r.extra, id: r.user_id, displayName: r.display_name, points: r.points, reputation: r.reputation, stats: { ...r.stats, accepted: r.accepted_count }, suspended: r.is_suspended || undefined, createdAt: iso(r.created_at) }));
    ds.contributions = (await q('select *, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng from contributions order by created_at')).map((r) => clean({
      ...r.extra, id: r.id, type: r.type, contributorId: r.contributor_id, modeId: r.mode_id,
      lineId: (r.route_id && back.lines.get(r.route_id)) ?? r.extra.lineId ?? null, zoneId: (r.zone_id && back.tricycleZones.get(r.zone_id)) ?? null, providerId: (r.provider_id && back.providers.get(r.provider_id)) ?? null,
      lat: r.lat, lng: r.lng, payload: r.payload, status: r.status, everVerified: r.ever_verified || undefined, rewarded: r.rewarded, moderation: r.moderation, createdAt: iso(r.created_at),
    }));
    ds.confirmations = (await q('select * from confirmations order by created_at')).map((r) => clean({ id: r.id, contributionId: r.contribution_id, contributorId: r.contributor_id, agree: r.agree, near: r.is_near ?? undefined, at: iso(r.created_at) }));
    // last 31 days are enough for weekly/monthly boards; all-time uses contributors.points
    ds.pointsEvents = (await q("select * from points_ledger where created_at > now() - interval '31 days' order by id")).map((r) => ({ contributorId: r.contributor_id, points: r.points, reason: r.reason, at: iso(r.created_at) }));
    ds.auditLog = (await q(`select * from audit_logs where entity = any($1) order by id desc limit 1000`, [[...COLLECTIONS, 'contributions', 'contributors']])).reverse()
      .map((r) => ({ id: String(r.id), at: iso(r.at), actor: r.actor_name ?? 'system', role: r.actor_role ?? r.after?.role ?? null, action: r.action, entity: r.entity, entityId: r.entity_id, before: r.before, after: r.after }));
    ds.fareHistory = (await q('select h.*, s.slug from fare_history h join fare_schedules s on s.id = h.schedule_id order by h.changed_at desc limit 300')).reverse()
      .map((r) => ({ id: r.id, scheduleId: r.slug ?? r.schedule_id, before: r.before, changedAt: iso(r.changed_at), actor: { name: r.changed_by_name ?? 'system' } }));

    this.ds = ds;
    this.ids = ids;
    this.version = Date.now();
    return this;
  }

  dataset() { return this.ds; }
  publicDataset(engine = this.ds) {
    const out = {};
    for (const [k, v] of Object.entries(engine)) if (!PUBLIC_EXCLUDE.has(k)) out[k] = v;
    out.advisories = activeAdvisories(engine);
    out.version = this.version;
    return out;
  }
  list(c) { return this.ds[c] ?? []; }
  get(c, id) { return this.list(c).find((x) => x.id === id) ?? null; }

  // ----------------------------------------------------------- write ---
  touch() { this.ds = { ...this.ds }; this.version = Date.now(); }
  /** Mark a record (already updated in memory) for saving. */
  changed(c, rec) { if (rec) this.queue.push({ op: c === 'pointsEvents' ? 'append' : 'upsert', c, rec }); }

  upsert(c, rec, actor) {
    if (!COLLECTIONS.includes(c)) throw httpError(400, 'Unknown collection');
    const arr = this.ds[c] ?? (this.ds[c] = []);
    const id = rec.id || randomUUID();
    const i = arr.findIndex((x) => x.id === id);
    const before = i >= 0 ? arr[i] : null;
    const after = { ...(before || {}), ...rec, id, updatedAt: new Date().toISOString() };
    if (c === 'fareSchedules' && before) this.ds.fareHistory.push({ id: randomUUID(), scheduleId: id, before, changedAt: after.updatedAt, actor: { name: actor?.name } });
    this.ds[c] = i >= 0 ? arr.map((x, k) => (k === i ? after : x)) : [...arr, after];
    this.queue.push({ op: 'upsert', c, rec: after, actor });
    this.audit(actor, before ? 'update' : 'create', c, id, before, after);
    this.touch();
    return after;
  }
  remove(c, id, actor) {
    const before = this.get(c, id);
    if (!before) throw httpError(404, 'Not found');
    this.ds[c] = this.list(c).filter((x) => x.id !== id);
    this.queue.push({ op: 'delete', c, rec: before, actor });
    this.audit(actor, 'delete', c, id, before, null);
    this.touch();
  }
  audit(actor, action, entity, entityId, before, after) {
    const row = { id: randomUUID(), at: new Date().toISOString(), actor: actor?.name ?? 'system', role: actor?.role ?? null, action, entity, entityId, before, after };
    this.ds.auditLog.push(row);
    if (this.ds.auditLog.length > 1000) this.ds.auditLog = this.ds.auditLog.slice(-1000);
    this.queue.push({ op: 'audit', rec: row, actor });
  }
  track(kind, key) {
    const a = this.ds.analytics;
    if (kind === 'search') a.searches++;
    if (kind === 'failed') a.failedSearches++;
    if (kind === 'fare') a.fareRequests++;
    if (kind === 'destination' && key) a.destinations[key] = (a.destinations[key] || 0) + 1;
    if (kind === 'mode' && key) a.modes[key] = (a.modes[key] || 0) + 1;
    if (kind === 'provider' && key) (a.providers ??= {})[key] = (a.providers[key] || 0) + 1;
    clearTimeout(this.analyticsTimer);
    this.analyticsTimer = setTimeout(() => this.pool.query("insert into app_config (key, value) values ('analytics', $1) on conflict (key) do update set value = excluded.value, updated_at = now()", [this.ds.analytics]).catch((e) => console.error('analytics save failed', e.message)), 2000);
    this.analyticsTimer.unref?.();
  }

  /** Write queued changes in one transaction (serialised). */
  persist() {
    const run = async () => {
      if (!this.queue.length) return;
      const items = this.queue.splice(0);
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        const actor = items.find((x) => x.actor)?.actor?.name;
        if (actor) await client.query("select set_config('app.actor_name', $1, true)", [actor]);
        // newest state wins; keep dependency order
        const last = new Map();
        for (const it of items) if (it.op === 'upsert' || it.op === 'delete') last.set(`${it.c}|${it.rec.id}`, it);
        const ordered = [...last.values()].sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c));
        for (const it of ordered) it.op === 'upsert' ? await this.write(client, it.c, it.rec) : await this.del(client, it.c, it.rec);
        for (const it of items.filter((x) => x.op === 'append')) await client.query('insert into points_ledger (contributor_id, points, reason, created_at) values ($1, $2, $3, $4)', [it.rec.contributorId, it.rec.points, it.rec.reason, it.rec.at]);
        for (const it of items.filter((x) => x.op === 'audit')) await client.query('insert into audit_logs (actor_name, action, entity, entity_id, before, after, at) values ($1, $2, $3, $4, $5, $6, $7)', [it.rec.actor, it.rec.action, it.rec.entity, it.rec.entityId, it.rec.before, it.rec.after, it.rec.at]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        console.error('persist failed – reloading from the database:', e.message);
        await this.load().catch(() => {}); // memory must not drift from the database
        throw httpError(e.code === '23503' || e.code === '23514' || e.code === 'P0001' ? 400 : 500, e.code === 'P0001' ? e.message : 'Could not save the change');
      } finally {
        client.release();
      }
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }
  flush() { return this.persist().catch(() => {}); }
  async close() { await this.flush(); await this.pool.end(); }

  // uuid for an app id (existing, the id itself if it's a uuid, or new)
  uuidFor(c, appId) {
    const m = (this.ids[c] ??= new Map());
    if (!m.has(appId)) m.set(appId, UUID.test(appId) ? appId : randomUUID());
    return m.get(appId);
  }
  ref(c, appId) { return appId ? this.ids[c]?.get(appId) ?? null : null; }

  async upsertRow(client, table, pk, row) {
    const cols = Object.keys(row);
    const vals = [];
    const ph = cols.map((k) => {
      const v = row[k];
      if (v && typeof v === 'object' && 'expr' in v) return v.expr.replace(/\?/g, () => { vals.push(v.vals.shift()); return `$${vals.length}`; });
      vals.push(v); return `$${vals.length}`;
    });
    const set = cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`).join(', ');
    await client.query(`insert into ${table} (${cols.join(', ')}) values (${ph.join(', ')}) on conflict (${pk}) do update set ${set}`, vals);
  }

  async write(client, c, r) {
    const extra = (keys) => omit(r, [...keys, 'updatedAt', 'community', 'communityWait', 'communityLastTrip', 'communityNotes']);
    const src = (v) => enumOr(SOURCE, v, 'indicative');
    const dsk = (v) => enumOr(DATASET, v, 'production');
    switch (c) {
      case 'modes':
        return this.upsertRow(client, 'transport_modes', 'id', { id: r.id, label: r.label ?? r.id, label_fil: r.labelFil ?? null, category: r.category ?? 'public', icon: r.icon ?? null, color: r.color ?? null, road_based: !!r.roadBased, flexible_stops: !!r.flexibleStops, community_driven: !!r.communityDriven, extra: extra(['id', 'label', 'labelFil', 'category', 'icon', 'color', 'roadBased', 'flexibleStops', 'communityDriven']) });
      case 'cities':
        return this.upsertRow(client, 'cities', 'id', { id: this.uuidFor(c, r.id), slug: r.id, name: r.name, region_name: r.region ?? null, is_active: !!r.active, extra: extra(['id', 'name', 'region', 'active']) });
      case 'operators':
        return this.upsertRow(client, 'transport_operators', 'id', { id: this.uuidFor(c, r.id), slug: r.id, name: r.name, mode_id: r.modeId ?? null, website: r.website ?? null, contact: r.contact ?? null, dataset: dsk(r.dataset), extra: extra(['id', 'name', 'modeId', 'website', 'contact', 'dataset']) });
      case 'stops': {
        const city = this.ref('cities', r.cityId);
        return this.upsertRow(client, 'transport_stops', 'id', { id: this.uuidFor(c, r.id), external_id: r.id, name: r.name, kind: r.kind ?? 'stop', geom: point(r.lat, r.lng), city_id: city, source_type: src(r.sourceType), dataset: dsk(r.dataset), last_verified_at: date(r.lastVerified), extra: { ...extra(['id', 'name', 'kind', 'lat', 'lng', 'cityId', 'sourceType', 'dataset', 'lastVerified']), ...(r.cityId && !city ? { cityId: r.cityId } : {}) } });
      }
      case 'lines': {
        const id = this.uuidFor(c, r.id);
        const op = this.ref('operators', r.operatorId);
        const hw = Array.isArray(r.headwayMin) ? `[${r.headwayMin[0]},${r.headwayMin[1]}]` : null;
        await this.upsertRow(client, 'transport_routes', 'id', {
          id, external_id: r.id, code: r.code ?? null, name: r.name, signboard: r.signboard ?? null, mode_id: r.modeId, operator_id: op, color: r.color ?? null,
          bidirectional: r.bidirectional !== false, is_operational: r.operational !== false, is_verified: !!r.verified, headway_min: hw, detour_factor: r.detour ?? null, shape: line(r.shape),
          source_type: src(r.sourceType), dataset: dsk(r.dataset), last_verified_at: date(r.lastVerified), notes: r.notes ?? null,
          extra: { ...extra(['id', 'code', 'name', 'signboard', 'modeId', 'operatorId', 'stopIds', 'color', 'bidirectional', 'operational', 'verified', 'headwayMin', 'detour', 'shape', 'operatingHours', 'sourceType', 'dataset', 'lastVerified', 'notes']), ...(r.operatorId && !op ? { operatorId: r.operatorId } : {}) },
        });
        await client.query('delete from route_stops where route_id = $1', [id]);
        const stops = (r.stopIds || []).map((s) => this.ref('stops', s));
        if (stops.some((s) => !s)) throw Object.assign(new Error('Route refers to an unknown stop'), { code: '23503' });
        for (const [seq, s] of stops.entries()) await client.query('insert into route_stops (route_id, seq, stop_id) values ($1, $2, $3)', [id, seq, s]);
        await client.query('delete from operating_schedules where route_id = $1', [id]);
        for (const [k, rule] of Object.entries(r.operatingHours || {})) {
          const days = k === 'default' ? [0, 1, 2, 3, 4, 5, 6] : [DAYS.indexOf(k)];
          if (days[0] < 0) continue;
          await client.query('insert into operating_schedules (route_id, day_of_week, start_time, end_time, is_closed, source_type) values ($1, $2, $3, $4, $5, $6)',
            [id, days, rule === 'closed' ? null : rule.start, rule === 'closed' ? null : rule.end, rule === 'closed', src(r.sourceType)]);
        }
        return;
      }
      case 'providers':
        return this.upsertRow(client, 'provider_integrations', 'id', { id: this.uuidFor(c, r.id), slug: r.id, name: r.name, mode_id: r.modeId, vehicle: r.vehicle ?? null, status: enumOr(INTEGRATION, r.integration, 'none'), enabled: r.enabled !== false, website: r.website ?? null, store_url: r.storeUrl ?? null, deep_link_template: r.deepLink ?? null, notes: r.notes ?? null, extra: extra(['id', 'name', 'modeId', 'vehicle', 'integration', 'enabled', 'website', 'storeUrl', 'deepLink', 'notes']) });
      case 'tricycleZones': {
        const city = this.ref('cities', r.cityId);
        return this.upsertRow(client, 'tricycle_zones', 'id', { id: this.uuidFor(c, r.id), slug: r.id, name: r.name, city_id: city, center: point(r.center?.lat, r.center?.lng), radius_m: Math.round((r.radiusKm ?? 1) * 1000), fare_type: ['fixed', 'zone', 'negotiated'].includes(r.fareType) ? r.fareType : 'negotiated', capacity: r.capacity ?? null, is_active: r.active !== false, source_type: src(r.sourceType), dataset: dsk(r.dataset), extra: { ...extra(['id', 'name', 'cityId', 'center', 'radiusKm', 'fareType', 'capacity', 'active', 'sourceType', 'dataset']), ...(r.cityId && !city ? { cityId: r.cityId } : {}) } });
      }
      case 'fareSchedules': {
        const id = this.uuidFor(c, r.id);
        const s = r.scope || {};
        const cols = { route_id: this.ref('lines', s.lineId), operator_id: this.ref('operators', s.operatorId), mode_id: s.modeId && this.ref('modes', s.modeId) ? s.modeId : null, provider_id: this.ref('providers', s.providerId), zone_id: this.ref('tricycleZones', s.zoneId) };
        const resolved = Object.entries({ lineId: 'route_id', operatorId: 'operator_id', modeId: 'mode_id', providerId: 'provider_id', zoneId: 'zone_id' }).every(([k, col]) => !s[k] || cols[col]);
        await this.upsertRow(client, 'fare_schedules', 'id', {
          id, slug: r.id, name: r.name ?? r.id, kind: enumOr(FARE_KIND, r.kind, 'negotiated'), ...cols, effective_from: r.effectiveFrom ?? new Date().toISOString().slice(0, 10), effective_to: r.effectiveTo ?? null,
          is_active: r.active !== false, rounding: r.params?.rounding ?? 0.25, source_type: src(r.sourceType), source_note: r.sourceNote ?? null, disclaimer: r.disclaimer ?? null,
          last_verified_at: date(r.lastVerified), dataset: dsk(r.dataset),
          extra: { ...extra(['id', 'name', 'kind', 'scope', 'params', 'discounts', 'effectiveFrom', 'effectiveTo', 'active', 'sourceType', 'sourceNote', 'disclaimer', 'lastVerified', 'dataset']), ...(resolved ? {} : { scope: s }) },
        });
        await client.query('delete from fare_rules where schedule_id = $1', [id]);
        await client.query('insert into fare_rules (schedule_id, params) values ($1, $2)', [id, r.params || {}]);
        await client.query('delete from passenger_discounts where schedule_id = $1', [id]);
        for (const [p, d] of Object.entries(r.discounts || {})) {
          if (!['student', 'senior', 'pwd'].includes(p) || typeof d?.rate !== 'number') continue;
          await client.query('insert into passenger_discounts (schedule_id, passenger, rate, legal_basis) values ($1, $2, $3, $4)', [id, p, d.rate, d.legalBasis || 'unspecified']);
        }
        return;
      }
      case 'places':
        return this.upsertRow(client, 'locations', 'id', { id: this.uuidFor(c, r.id), slug: r.id, name: r.name, aliases: r.aliases || [], kind: r.type ?? 'landmark', geom: point(r.lat, r.lng), dataset: dsk(r.dataset), extra: extra(['id', 'name', 'aliases', 'type', 'lat', 'lng', 'dataset']) });
      case 'advisories': {
        const lineIds = r.lineIds || [];
        return this.upsertRow(client, 'service_advisories', 'id', {
          id: this.uuidFor(c, r.id), slug: r.id, title: r.title, body: r.body ?? '', source: r.source, url: r.url ?? null, source_type: src(r.sourceType), severity: enumOr(SEVERITY, r.severity, 'info'), area: r.area ?? null,
          mode_ids: r.modes || [], route_ids: lineIds.map((l) => this.ref('lines', l)).filter(Boolean), published_at: date(r.publishedAt) ?? new Date(), updated_at: date(r.updatedAt) ?? new Date(), expires_at: date(r.expiresAt), is_active: r.active !== false,
          extra: { ...extra(['id', 'title', 'body', 'source', 'url', 'sourceType', 'severity', 'area', 'modes', 'lineIds', 'publishedAt', 'updatedAt', 'expiresAt', 'active']), unresolvedLineIds: lineIds.filter((l) => !this.ref('lines', l)) },
        });
      }
      case 'reports': {
        const route = this.ref('lines', r.lineId), zone = this.ref('tricycleZones', r.lineId);
        return this.upsertRow(client, 'community_reports', 'id', {
          id: r.id, device_id: r.reporterId ?? null, category: r.category, description: r.description, location_name: r.locationName ?? null, geom: point(r.lat, r.lng), route_id: route, zone_id: zone,
          status: enumOr(REPORT_STATUS, r.status, 'pending'), created_at: date(r.createdAt) ?? new Date(), photo_data_url: r.photo ?? null, moderator_note: r.moderatorNote ?? null, reviewed_by: r.reviewedBy ?? null, reviewed_at: date(r.reviewedAt),
          extra: { ...extra(['id', 'reporterId', 'category', 'description', 'locationName', 'lat', 'lng', 'lineId', 'status', 'createdAt', 'photo', 'moderatorNote', 'reviewedBy', 'reviewedAt']), ...(r.lineId && !route && !zone ? { lineId: r.lineId } : {}) },
        });
      }
      case 'contributors':
        // the users row normally comes from the auth.users signup trigger
        await client.query('insert into users (id) select $1 where exists (select 1 from auth.users where id = $1) on conflict do nothing', [r.id]);
        return this.upsertRow(client, 'contributors', 'user_id', { user_id: r.id, display_name: r.displayName, points: r.points || 0, reputation: r.reputation || 0, accepted_count: r.stats?.accepted || 0, is_suspended: !!r.suspended, stats: r.stats || {}, created_at: date(r.createdAt) ?? new Date(), extra: extra(['id', 'displayName', 'points', 'reputation', 'stats', 'suspended', 'createdAt']) });
      case 'contributions': {
        const route = this.ref('lines', r.lineId);
        return this.upsertRow(client, 'contributions', 'id', {
          id: r.id, contributor_id: r.contributorId, type: r.type, mode_id: r.modeId, route_id: route, zone_id: this.ref('tricycleZones', r.zoneId), provider_id: this.ref('providers', r.providerId),
          geom: point(r.lat, r.lng), trace: line(r.payload?.points), payload: r.payload || {}, status: r.status || 'pending', ever_verified: !!r.everVerified, rewarded: r.rewarded ?? null, moderation: r.moderation ?? null, created_at: date(r.createdAt),
          extra: r.lineId && !route ? { lineId: r.lineId } : {},
        });
      }
      case 'confirmations':
        return this.upsertRow(client, 'confirmations', 'id', { id: r.id, contribution_id: r.contributionId, contributor_id: r.contributorId, agree: !!r.agree, is_near: r.near ?? null, created_at: date(r.at) });
      default:
        return undefined; // derived or non-persisted
    }
  }

  async del(client, c, r) {
    const table = { cities: 'cities', modes: 'transport_modes', operators: 'transport_operators', stops: 'transport_stops', lines: 'transport_routes', fareSchedules: 'fare_schedules', providers: 'provider_integrations', tricycleZones: 'tricycle_zones', places: 'locations', advisories: 'service_advisories', reports: 'community_reports' }[c];
    if (!table) return;
    const id = c === 'modes' ? r.id : this.ref(c, r.id) ?? r.id;
    await client.query(`delete from ${table} where id = $1`, [id]);
    this.ids[c]?.delete(r.id);
  }

  /** Bulk import (used by scripts/db-seed.mjs). */
  async importDataset(ds, { log = () => {} } = {}) {
    for (const c of ORDER) {
      if (['reports', 'contributors', 'contributions', 'confirmations'].includes(c)) continue;
      for (const rec of ds[c] || []) this.queue.push({ op: 'upsert', c, rec });
      log(`${c}: ${(ds[c] || []).length}`);
    }
    await this.persist();
    for (const [key, isPublic] of Object.entries(CONFIG_KEYS)) {
      if (ds[key] == null) continue;
      await this.pool.query('insert into app_config (key, value, is_public) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now()', [key, ds[key], isPublic]);
    }
    await this.load();
  }
}
