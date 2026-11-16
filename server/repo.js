// Data repository. Local development uses a JSON file with the same shape as
// the Supabase schema (supabase/migrations). Production swaps this module for a
// Supabase/PostgREST implementation exposing the same methods.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(root, 'data', 'dev', 'dataset.json');
const RUNTIME = process.env.SAKAY_DATA_FILE || join(root, 'data', 'runtime', 'dataset.json');

export const COLLECTIONS = ['cities', 'modes', 'operators', 'stops', 'lines', 'fareSchedules', 'providers', 'tricycleZones', 'places', 'advisories', 'reports'];
const PUBLIC_EXCLUDE = new Set(['reports', 'auditLog', 'analytics', 'fareHistory', 'contributions', 'confirmations', 'contributors', 'pointsEvents', 'reputation']);
const COMMUNITY_ARRAYS = ['contributions', 'confirmations', 'contributors', 'pointsEvents'];

export class JsonRepository {
  constructor(file = RUNTIME) {
    this.file = file;
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      copyFileSync(SEED, file);
    }
    this.load();
    this.timer = null;
  }
  load() {
    this.ds = JSON.parse(readFileSync(this.file, 'utf8'));
    for (const k of COMMUNITY_ARRAYS) this.ds[k] ??= [];
    this.version = Date.now();
  }
  /** Bump version so routing graph caches (keyed by object identity) rebuild. */
  touch() {
    this.ds = { ...this.ds };
    this.version = Date.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => writeFileSync(this.file, JSON.stringify(this.ds, null, 1)), 200);
  }
  flush() {
    clearTimeout(this.timer);
    writeFileSync(this.file, JSON.stringify(this.ds, null, 1));
  }
  dataset() { return this.ds; }
  /** Public subset of the engine dataset (raw + verified community data); no personal data. */
  publicDataset(engine = this.ds) {
    const out = {};
    for (const [k, v] of Object.entries(engine)) if (!PUBLIC_EXCLUDE.has(k)) out[k] = v;
    out.advisories = activeAdvisories(engine);
    out.version = this.version;
    return out;
  }
  list(c) { return this.ds[c] ?? []; }
  get(c, id) { return this.list(c).find((x) => x.id === id) ?? null; }
  upsert(c, rec, actor) {
    if (!COLLECTIONS.includes(c)) throw httpError(400, 'Unknown collection');
    const arr = this.ds[c] ?? (this.ds[c] = []);
    const id = rec.id || randomUUID();
    const i = arr.findIndex((x) => x.id === id);
    const before = i >= 0 ? arr[i] : null;
    const after = { ...(before || {}), ...rec, id, updatedAt: new Date().toISOString() };
    if (c === 'fareSchedules' && before) this.ds.fareHistory.push({ id: randomUUID(), scheduleId: id, before, changedAt: after.updatedAt, actor });
    this.ds[c] = i >= 0 ? arr.map((x, k) => (k === i ? after : x)) : [...arr, after];
    this.audit(actor, before ? 'update' : 'create', c, id, before, after);
    this.touch();
    return after;
  }
  remove(c, id, actor) {
    const before = this.get(c, id);
    if (!before) throw httpError(404, 'Not found');
    this.ds[c] = this.list(c).filter((x) => x.id !== id);
    this.audit(actor, 'delete', c, id, before, null);
    this.touch();
  }
  audit(actor, action, entity, entityId, before, after) {
    this.ds.auditLog.push({ id: randomUUID(), at: new Date().toISOString(), actor: actor?.name ?? 'system', role: actor?.role ?? null, action, entity, entityId, before, after });
    if (this.ds.auditLog.length > 5000) this.ds.auditLog = this.ds.auditLog.slice(-5000);
  }
  track(kind, key) {
    const a = this.ds.analytics;
    if (kind === 'search') a.searches++;
    if (kind === 'failed') a.failedSearches++;
    if (kind === 'fare') a.fareRequests++;
    if (kind === 'destination' && key) a.destinations[key] = (a.destinations[key] || 0) + 1;
    if (kind === 'mode' && key) a.modes[key] = (a.modes[key] || 0) + 1;
    if (kind === 'provider' && key) (a.providers ??= {})[key] = (a.providers[key] || 0) + 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => writeFileSync(this.file, JSON.stringify(this.ds, null, 1)), 1000);
  }
}

export function activeAdvisories(ds, now = new Date()) {
  return (ds.advisories || []).filter((a) => a.active !== false && (!a.expiresAt || new Date(a.expiresAt) > now));
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
