// LUVYO API + static host. Zero dependencies (Node ≥ 20).
//   npm start            → http://localhost:8787  (app)  /admin (admin portal)
// Env: PORT, ADMIN_TOKENS="token:role:name,...", SUPABASE_URL, SUPABASE_ANON_KEY,
//      SAKAY_DATA_FILE, CORS_ORIGIN

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { JsonRepository, activeAdvisories, httpError, COLLECTIONS } from './repo.js';
import { planJourney, nearbyStops, linesPassing, compareProviders, estimateFare } from '../core/router.js';
import { answer } from '../core/assistant.js';
import { applyCommunity } from '../core/community.js';
import { registerCommunity } from './community.js';
import { PASSENGER_TYPES } from '../core/fareEngine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8787;
export const repo = new JsonRepository();

// Engine dataset = raw data + verified community data. Rebuilt when data changes
// and every 10 minutes (confidence decays with time).
let derived = null, derivedVer = 0, derivedAt = 0;
export function engineDs() {
  if (!derived || derivedVer !== repo.version || Date.now() - derivedAt > 600000) {
    derived = applyCommunity(repo.dataset());
    derivedVer = repo.version; derivedAt = Date.now();
  }
  return derived;
}

// ------------------------------------------------------------- auth/RBAC ---
const ROLE_PERMS = {
  superadmin: ['read', 'write:data', 'write:fares', 'moderate', 'advisories', 'providers', 'audit'],
  data_editor: ['read', 'write:data', 'write:fares'],
  moderator: ['read', 'moderate', 'advisories'],
  viewer: ['read'],
};
const COLLECTION_PERM = { fareSchedules: 'write:fares', providers: 'providers', advisories: 'advisories', reports: 'moderate' };
const admins = new Map();
if (process.env.ADMIN_TOKENS) {
  for (const t of process.env.ADMIN_TOKENS.split(',')) {
    const [token, role = 'viewer', name = role] = t.split(':');
    admins.set(token, { role, name });
  }
} else {
  const token = randomBytes(12).toString('hex');
  admins.set(token, { role: 'superadmin', name: 'dev-admin' });
  console.log(`[dev] No ADMIN_TOKENS set. Temporary superadmin token: ${token}`);
}
function adminFor(req, perm) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  for (const [k, v] of admins) {
    if (k.length === tok.length && timingSafeEqual(Buffer.from(k), Buffer.from(tok))) {
      if (perm && !ROLE_PERMS[v.role]?.includes(perm)) throw httpError(403, `Role ${v.role} lacks ${perm}`);
      return v;
    }
  }
  throw httpError(401, 'Admin token required');
}

// ---------------------------------------------------------- rate limiting ---
const buckets = new Map();
function rateLimit(req, cost = 1, perMin = 120) {
  const ip = (req.socket.remoteAddress || 'x') + '|' + perMin; // one bucket per limit class
  const now = Date.now();
  const b = buckets.get(ip) || { tokens: perMin, at: now };
  b.tokens = Math.min(perMin, b.tokens + ((now - b.at) / 60000) * perMin);
  b.at = now;
  if (b.tokens < cost) throw httpError(429, 'Too many requests – please slow down.');
  b.tokens -= cost;
  buckets.set(ip, b);
}
setInterval(() => { const t = Date.now() - 600000; for (const [k, v] of buckets) if (v.at < t) buckets.delete(k); }, 600000).unref();

// ---------------------------------------------------------------- helpers ---
async function body(req, limit = 1_000_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw httpError(413, 'Body too large'); chunks.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'Invalid JSON'); }
}
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw httpError(400, `${name} must be a number`); return n; };
const pt = (o, name) => {
  if (!o || typeof o !== 'object') throw httpError(400, `${name} is required`);
  const lat = num(o.lat, `${name}.lat`), lng = num(o.lng, `${name}.lng`);
  if (lat < 4 || lat > 22 || lng < 115 || lng > 128) throw httpError(400, `${name} must be inside the Philippines`);
  return { name: String(o.name || name).slice(0, 120), lat, lng };
};
const str = (v, max = 2000) => (v == null ? null : String(v).slice(0, max));

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(self)',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.supabase.co https://lh3.googleusercontent.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org; frame-ancestors 'none'",
};
function send(res, status, data, headers = {}) {
  const isBuf = Buffer.isBuffer(data) || typeof data === 'string';
  res.writeHead(status, { ...SEC_HEADERS, 'Content-Type': isBuf ? headers['Content-Type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...(process.env.CORS_ORIGIN ? { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN } : {}), ...headers });
  res.end(isBuf ? data : JSON.stringify(data));
}

// ---------------------------------------------------------------- routes ---
const routes = [];
const on = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

on('GET', '/api/health', () => ({ ok: true, version: repo.version, dataset: repo.dataset().meta }));
on('GET', '/api/config', () => ({
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null, // anon key is public by design; never the service-role key
  geocoder: process.env.GEOCODER || 'local',
  tiles: process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  passengerTypes: PASSENGER_TYPES,
}));
on('GET', '/api/dataset', () => repo.publicDataset(engineDs()));

on('GET', '/api/places', ({ q }) => {
  const s = (q.q || '').toLowerCase().trim();
  if (s.length < 2) return [];
  const ds = repo.dataset();
  const score = (p) => {
    const names = [p.name, ...(p.aliases || [])].map((x) => x.toLowerCase());
    if (names.some((n) => n === s)) return 0;
    if (names.some((n) => n.startsWith(s))) return 1;
    if (names.some((n) => n.includes(s))) return 2;
    return 9;
  };
  return ds.places.map((p) => [score(p), p]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 12).map(([, p]) => p);
});

on('POST', '/api/routes/search', async ({ req }) => {
  rateLimit(req, 2);
  const b = await body(req);
  const ds = engineDs();
  const q = {
    origin: pt(b.origin, 'origin'), destination: pt(b.destination, 'destination'),
    departAt: b.departAt || undefined, arriveBy: b.arriveBy || undefined,
    passengerType: PASSENGER_TYPES.includes(b.passengerType) ? b.passengerType : 'regular',
    maxWalkKm: b.maxWalkKm != null ? Math.min(5, Math.max(0, num(b.maxWalkKm, 'maxWalkKm'))) : undefined,
    maxTransfers: b.maxTransfers != null && b.maxTransfers !== '' ? Math.max(0, num(b.maxTransfers, 'maxTransfers')) : undefined,
    budget: b.budget ? num(b.budget, 'budget') : undefined,
    exclude: Array.isArray(b.exclude) ? b.exclude.map(String) : [],
    publicOnly: !!b.publicOnly, privateOnly: !!b.privateOnly, noTransfers: !!b.noTransfers,
    priority: ['best', 'cheapest', 'fastest', 'fewest'].includes(b.priority) ? b.priority : 'best',
  };
  const plan = planJourney(ds, q);
  repo.track('search');
  repo.track('destination', q.destination.name);
  if (!plan.options.length) repo.track('failed');
  for (const o of plan.options.slice(0, 1)) for (const m of o.modes) repo.track('mode', m);
  plan.advisories = activeAdvisories(ds).filter((a) => !a.lineIds?.length || plan.options.some((o) => o.legs.some((l) => a.lineIds.includes(l.lineId))));
  return plan;
});

on('POST', '/api/fare/calculate', async ({ req }) => {
  rateLimit(req);
  const b = await body(req);
  repo.track('fare');
  const ds = engineDs();
  const pax = PASSENGER_TYPES.includes(b.passengerType) ? b.passengerType : 'regular';
  const legs = Array.isArray(b.legs) ? b.legs.slice(0, 8) : [b];
  const results = legs.map((l) => l.lineId
    ? estimateFare(ds, { lineId: str(l.lineId, 80), fromStopId: str(l.fromStopId, 80), toStopId: str(l.toStopId, 80), passengerType: pax })
    : estimateFare(ds, { modeId: str(l.modeId, 40), origin: pt(l.origin, 'origin'), destination: pt(l.destination, 'destination'), passengerType: pax }));
  const ok = results.filter((r) => r.available);
  return { legs: results, total: { min: ok.reduce((s, r) => s + r.min, 0), max: ok.reduce((s, r) => s + r.max, 0), partial: ok.length !== results.length } };
});

on('GET', '/api/nearby', ({ q }) => nearbyStops(engineDs(), { lat: num(q.lat, 'lat'), lng: num(q.lng, 'lng') }, Math.min(3, +q.radius || 1)));

on('GET', '/api/lines', ({ q }) => {
  const s = (q.q || '').toLowerCase();
  const ds = engineDs();
  const stops = new Map(ds.stops.map((x) => [x.id, x]));
  return ds.lines
    .filter((l) => l.operational !== false && (!q.mode || l.modeId === q.mode))
    .filter((l) => !s || [l.name, l.code, l.signboard, ...l.stopIds.map((id) => stops.get(id)?.name)].some((x) => x && x.toLowerCase().includes(s)))
    .map((l) => ({ ...l, stops: l.stopIds.map((id) => stops.get(id)).filter(Boolean) }));
});
on('GET', '/api/lines/passing', ({ q }) => linesPassing(engineDs(), { lat: num(q.lat, 'lat'), lng: num(q.lng, 'lng') }, Math.min(2, +q.radius || 0.4), q.mode || null)
  .map(({ line, km }) => ({ id: line.id, code: line.code, name: line.name, modeId: line.modeId, signboard: line.signboard, verified: line.verified, km })));

on('GET', '/api/tricycle/zones', ({ q }) => {
  const ds = engineDs();
  return ds.tricycleZones.filter((z) => z.active !== false).map((z) => ({ ...z, fare: ds.fareSchedules.find((f) => f.scope?.zoneId === z.id) ?? null }));
});

on('POST', '/api/ridehail/compare', async ({ req }) => {
  rateLimit(req);
  const b = await body(req);
  const rows = compareProviders(engineDs(), pt(b.origin, 'origin'), pt(b.destination, 'destination'), { passengerType: b.passengerType || 'regular' });
  return rows;
});
on('POST', '/api/providers/:id/open', ({ params }) => { repo.track('provider', params.id); return { ok: true }; });

on('GET', '/api/advisories', () => activeAdvisories(repo.dataset()));

on('POST', '/api/assistant', async ({ req }) => {
  rateLimit(req, 3);
  const b = await body(req, 20000);
  const qtext = str(b.message, 500);
  if (!qtext) throw httpError(400, 'message is required');
  const ctx = { passengerType: b.passengerType };
  if (b.currentLocation) ctx.currentLocation = pt(b.currentLocation, 'Current location');
  const r = answer(engineDs(), qtext, ctx);
  return { text: r.text, parsed: { origin: r.parsed.origin?.name ?? null, destination: r.parsed.destination?.name ?? null, budget: r.parsed.budget, intent: r.parsed.intent }, options: r.plan?.options?.slice(0, 3) ?? [] , query: r.plan?.query ?? null };
});

const REPORT_CATEGORIES = ['incorrect_route', 'missing_stop', 'route_change', 'tricycle_fare', 'road_closure', 'long_wait', 'disruption', 'unavailable_service', 'other'];
on('POST', '/api/reports', async ({ req }) => {
  rateLimit(req, 10, 60);
  const b = await body(req, 3_000_000);
  if (!REPORT_CATEGORIES.includes(b.category)) throw httpError(400, 'Invalid category');
  const description = str(b.description, 2000);
  if (!description || description.length < 10) throw httpError(400, 'Please describe the issue (at least 10 characters).');
  const photo = typeof b.photo === 'string' && b.photo.startsWith('data:image/') && b.photo.length < 2_500_000 ? b.photo : null;
  const rec = {
    id: randomUUID(), category: b.category, description, locationName: str(b.locationName, 200),
    lat: b.lat != null ? num(b.lat, 'lat') : null, lng: b.lng != null ? num(b.lng, 'lng') : null,
    lineId: str(b.lineId, 80), reporterId: str(b.reporterId, 80) || 'anonymous', photo,
    status: 'pending', createdAt: new Date().toISOString(), sourceType: 'community',
  };
  repo.dataset().reports.push(rec);
  repo.touch();
  return { id: rec.id, status: rec.status };
});
on('GET', '/api/reports/mine', ({ q }) => repo.dataset().reports.filter((r) => q.reporterId && r.reporterId === q.reporterId).map(({ photo, ...r }) => r));

// Account deletion (Data Privacy Act right to erasure). Verifies the caller's own
// Supabase token, then deletes with the service-role key, which never leaves the server.
on('DELETE', '/api/account', async ({ req }) => {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = process.env;
  if (!url || !svc) throw httpError(501, 'Account service not configured');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!me.ok) throw httpError(401, 'Invalid session');
  const { id } = await me.json();
  const del = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
  if (!del.ok) throw httpError(502, 'Could not delete account');
  return { ok: true }; // user rows are removed by ON DELETE CASCADE (see supabase/migrations)
});

registerCommunity(on, { repo, engineDs, rateLimit, body, str, num, adminFor: (req, p) => adminFor(req, p) });

// ----------------------------------------------------------------- admin ---
on('GET', '/api/admin/me', ({ req }) => { const a = adminFor(req, 'read'); return { ...a, perms: ROLE_PERMS[a.role] }; });
on('GET', '/api/admin/analytics', ({ req }) => {
  adminFor(req, 'read');
  const ds = repo.dataset();
  const top = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    ...ds.analytics, topDestinations: top(ds.analytics.destinations), topModes: top(ds.analytics.modes), providerOpens: top(ds.analytics.providers),
    counts: Object.fromEntries(COLLECTIONS.map((c) => [c, ds[c]?.length ?? 0])),
    pendingReports: ds.reports.filter((r) => ['pending', 'under_review'].includes(r.status)).length,
    unverifiedLines: ds.lines.filter((l) => !l.verified).length,
    devRecords: COLLECTIONS.reduce((s, c) => s + (ds[c] || []).filter((x) => x.dataset === 'development').length, 0),
    users: { note: 'User counts (registered, DAU, MAU) come from Supabase auth when configured.' },
    community: { contributors: ds.contributors.length, ...(engineDs().communitySummary || {}) },
  };
});
on('GET', '/api/admin/audit', ({ req, q }) => { adminFor(req, 'audit'); return repo.dataset().auditLog.slice(-(+q.limit || 200)).reverse(); });
on('GET', '/api/admin/fare-history', ({ req }) => { adminFor(req, 'read'); return repo.dataset().fareHistory.slice().reverse(); });
on('GET', '/api/admin/:collection', ({ req, params }) => { adminFor(req, 'read'); if (!COLLECTIONS.includes(params.collection)) throw httpError(404, 'Unknown collection'); return repo.list(params.collection); });
on('PUT', '/api/admin/:collection', async ({ req, params }) => {
  const actor = adminFor(req, COLLECTION_PERM[params.collection] || 'write:data');
  const b = await body(req, 5_000_000);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw httpError(400, 'Record object expected');
  validate(params.collection, b);
  return repo.upsert(params.collection, b, actor);
});
on('DELETE', '/api/admin/:collection/:id', ({ req, params }) => {
  const actor = adminFor(req, COLLECTION_PERM[params.collection] || 'write:data');
  repo.remove(params.collection, params.id, actor);
  return { ok: true };
});
on('POST', '/api/admin/reports/:id/status', async ({ req, params }) => {
  const actor = adminFor(req, 'moderate');
  const b = await body(req);
  const allowed = ['pending', 'under_review', 'verified', 'rejected', 'expired'];
  if (!allowed.includes(b.status)) throw httpError(400, 'Invalid status');
  const r = repo.get('reports', params.id);
  if (!r) throw httpError(404, 'Not found');
  const rep = (repo.dataset().reputation ??= {});
  if (b.status === 'verified') rep[r.reporterId] = (rep[r.reporterId] || 0) + 1;
  if (b.status === 'rejected') rep[r.reporterId] = (rep[r.reporterId] || 0) - 1;
  // Verifying a report does NOT promote its content to official data; an editor must apply changes explicitly.
  return repo.upsert('reports', { id: r.id, status: b.status, moderatorNote: str(b.note, 500), reviewedBy: actor.name, reviewedAt: new Date().toISOString() }, actor);
});
on('POST', '/api/admin/import/geojson', async ({ req }) => {
  const actor = adminFor(req, 'write:data');
  const b = await body(req, 10_000_000);
  if (b.type !== 'FeatureCollection' || !Array.isArray(b.features)) throw httpError(400, 'GeoJSON FeatureCollection expected');
  let stops = 0, lines = 0;
  for (const f of b.features) {
    const p = f.properties || {};
    if (f.geometry?.type === 'Point') {
      const [lng, lat] = f.geometry.coordinates;
      repo.upsert('stops', { id: p.id, name: p.name || 'Unnamed stop', lat, lng, kind: p.kind || 'stop', sourceType: p.sourceType || 'admin_verified', dataset: p.dataset || 'imported' }, actor); stops++;
    } else if (f.geometry?.type === 'LineString' && p.modeId) {
      const ids = f.geometry.coordinates.map(([lng, lat], i) => repo.upsert('stops', { id: `${p.id}-s${i}`, name: p.stopNames?.[i] || `${p.name} stop ${i + 1}`, lat, lng, kind: 'stop', sourceType: p.sourceType || 'admin_verified', dataset: 'imported' }, actor).id);
      repo.upsert('lines', { id: p.id, code: p.code, name: p.name, modeId: p.modeId, operatorId: p.operatorId, stopIds: ids, verified: !!p.verified, operational: p.operational !== false, sourceType: p.sourceType || 'admin_verified', dataset: 'imported' }, actor); lines++;
    }
  }
  return { stops, lines };
});

function validate(c, r) {
  const need = (k) => { if (r[k] == null || r[k] === '') throw httpError(400, `${k} is required`); };
  if (c === 'stops' || c === 'places') { need('name'); num(r.lat, 'lat'); num(r.lng, 'lng'); }
  if (c === 'lines') { need('name'); need('modeId'); if (!Array.isArray(r.stopIds) || r.stopIds.length < 2) throw httpError(400, 'A line needs at least 2 stops'); }
  if (c === 'fareSchedules') { need('kind'); need('sourceType'); if (!r.scope || typeof r.scope !== 'object') throw httpError(400, 'scope is required'); }
  if (c === 'advisories') { need('title'); need('source'); need('expiresAt'); }
  if (c === 'providers') { need('name'); need('modeId'); }
}

// ---------------------------------------------------------------- static ---
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const MOUNTS = [['/admin', 'apps/admin'], ['/core', 'core'], ['/', 'apps/web']];
async function serveStatic(res, path) {
  for (const [prefix, dir] of MOUNTS) {
    if (prefix !== '/' && path !== prefix && !path.startsWith(prefix + '/')) continue;
    let rel = path.slice(prefix === '/' ? 0 : prefix.length) || '/';
    if (rel.endsWith('/')) rel += 'index.html';
    const base = join(root, dir);
    const file = normalize(join(base, rel));
    if (!file.startsWith(base)) return send(res, 403, 'Forbidden');
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error();
      const ext = extname(file);
      return send(res, 200, await readFile(file), { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300' });
    } catch {
      if ((prefix === '/admin' || (prefix === '/' && !extname(rel))) && existsSync(join(base, 'index.html')))
        return send(res, 200, await readFile(join(base, 'index.html')), { 'Content-Type': MIME['.html'] });
      return send(res, 404, 'Not found');
    }
  }
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Contributor-Id' });
    if (url.pathname.startsWith('/api/')) {
      rateLimit(req, 0.5, 600);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler({ req, res, params, q: Object.fromEntries(url.searchParams) });
        return send(res, 200, out, { 'Cache-Control': 'no-store' });
      }
      throw httpError(404, 'No such endpoint');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Method not allowed');
    return await serveStatic(res, decodeURIComponent(url.pathname));
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? 'Internal error' : e.message, requestId: randomUUID() });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`LUVYO running → http://localhost:${PORT}  (admin: /admin)`));
  const bye = () => { repo.flush(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
