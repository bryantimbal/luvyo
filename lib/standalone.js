// Standalone (no-server) mode for static hosting such as GitHub Pages.
// Imported first by the static build: it answers the app's /api/... requests
// in the browser with the same engines the server uses. Rider data (reports,
// confirmations, points) is kept on this device. Demo riders in the bundled
// dataset are simulated and labelled as such.

import { planJourney, nearbyStops, linesPassing, compareProviders, estimateFare } from '../core/router.js';
import { answer } from '../core/assistant.js';
import { applyCommunity, REWARDS } from '../core/community.js';
import { createCommunityService, ApiError } from '../core/communityService.js';
import { PASSENGER_TYPES } from '../core/fareEngine.js';

globalThis.LUVYO_STANDALONE = true;

const LOCAL = 'luvyo:local-server';
const PUBLIC_EXCLUDE = new Set(['reports', 'auditLog', 'analytics', 'fareHistory', 'contributions', 'confirmations', 'contributors', 'pointsEvents']);
const realFetch = globalThis.fetch.bind(globalThis);

let base = null, local = null, engine = null, version = 0, engineVer = -1;
const ready = (async () => {
  base = await (await realFetch(new URL('data/dataset.json', document.baseURI))).json();
  try { local = JSON.parse(localStorage.getItem(LOCAL)); } catch { local = null; }
  if (!local || local.datasetVersion !== base.meta.builtAt) {
    // first run (or a new build): start from the bundled demo community, keep my own rows
    const id = myId();
    const mine = (k) => (local?.[k] || []).filter((x) => x.mine);
    local = {
      datasetVersion: base.meta.builtAt,
      contributions: [...(base.contributions || []), ...mine('contributions')],
      confirmations: [...(base.confirmations || []), ...mine('confirmations')],
      contributors: [...(base.contributors || []), ...(local?.contributors || []).filter((c) => c.id === id)],
      pointsEvents: [...(base.pointsEvents || []), ...(local?.pointsEvents || []).filter((e) => e.contributorId === id)],
      reports: local?.reports || [],
    };
  }
})();

const raw = () => ({ ...base, ...local });
function save() { version++; try { localStorage.setItem(LOCAL, JSON.stringify(local)); } catch { /* storage full */ } }
function engineDs() {
  if (engineVer !== version || !engine) { engine = applyCommunity(raw()); engineVer = version; }
  return engine;
}
// Confirmations and contributions made on this phone are tagged so they survive dataset updates.
const svc = createCommunityService({
  raw, // base dataset + this device's community arrays (same array objects, so writes land in `local`)
  engineDs,
  touch: () => { for (const k of ['contributions', 'confirmations']) for (const x of local[k]) if (x.contributorId === myId()) x.mine = true; save(); },
});
const myId = () => { try { return JSON.parse(localStorage.getItem('luvyo:v1'))?.deviceId; } catch { return null; } };

const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new ApiError(400, `${name} must be a number`); return n; };
const pt = (o, name) => {
  if (!o || typeof o !== 'object') throw new ApiError(400, `${name} is required`);
  const lat = num(o.lat, `${name}.lat`), lng = num(o.lng, `${name}.lng`);
  if (lat < 4 || lat > 22 || lng < 115 || lng > 128) throw new ApiError(400, `${name} must be inside the Philippines`);
  return { name: String(o.name || name).slice(0, 120), lat, lng };
};
const activeAdvisories = (ds) => (ds.advisories || []).filter((a) => a.active !== false && (!a.expiresAt || new Date(a.expiresAt) > new Date()));
const linesWithStops = (ds, q = '', mode = '') => {
  const stops = new Map(ds.stops.map((x) => [x.id, x]));
  const s = q.toLowerCase();
  return ds.lines.filter((l) => l.operational !== false && (!mode || l.modeId === mode))
    .filter((l) => !s || [l.name, l.code, l.signboard, ...l.stopIds.map((id) => stops.get(id)?.name)].some((x) => x && x.toLowerCase().includes(s)))
    .map((l) => ({ ...l, stops: l.stopIds.map((id) => stops.get(id)).filter(Boolean) }));
};
const me = (h, b = {}) => svc.ensureContributor(h['x-contributor-id'] || b.contributorId, b.displayName);

const routes = [
  ['GET', /^\/api\/config$/, () => ({ supabaseUrl: null, supabaseAnonKey: null, geocoder: 'local', tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', passengerTypes: PASSENGER_TYPES, standalone: true })],
  ['GET', /^\/api\/health$/, () => ({ ok: true, standalone: true, dataset: base.meta })],
  ['GET', /^\/api\/dataset$/, () => {
    const out = {};
    for (const [k, v] of Object.entries(engineDs())) if (!PUBLIC_EXCLUDE.has(k)) out[k] = v;
    out.advisories = activeAdvisories(out);
    return out;
  }],
  ['GET', /^\/api\/places$/, ({ q }) => {
    const s = (q.get('q') || '').toLowerCase().trim();
    if (s.length < 2) return [];
    const score = (p) => { const n = [p.name, ...(p.aliases || [])].map((x) => x.toLowerCase()); return n.includes(s) ? 0 : n.some((x) => x.startsWith(s)) ? 1 : n.some((x) => x.includes(s)) ? 2 : 9; };
    return engineDs().places.map((p) => [score(p), p]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 12).map(([, p]) => p);
  }],
  ['POST', /^\/api\/routes\/search$/, ({ b }) => {
    const ds = engineDs();
    const plan = planJourney(ds, {
      ...b, origin: pt(b.origin, 'origin'), destination: pt(b.destination, 'destination'),
      passengerType: PASSENGER_TYPES.includes(b.passengerType) ? b.passengerType : 'regular',
      maxTransfers: b.maxTransfers === '' || b.maxTransfers == null ? undefined : +b.maxTransfers,
    });
    plan.advisories = activeAdvisories(ds).filter((a) => !a.lineIds?.length || plan.options.some((o) => o.legs.some((l) => a.lineIds.includes(l.lineId))));
    return plan;
  }],
  ['POST', /^\/api\/fare\/calculate$/, ({ b }) => {
    const ds = engineDs();
    const pax = PASSENGER_TYPES.includes(b.passengerType) ? b.passengerType : 'regular';
    const legs = (Array.isArray(b.legs) ? b.legs.slice(0, 8) : [b]).map((l) => l.lineId
      ? estimateFare(ds, { lineId: l.lineId, fromStopId: l.fromStopId, toStopId: l.toStopId, passengerType: pax })
      : estimateFare(ds, { modeId: l.modeId, origin: pt(l.origin, 'origin'), destination: pt(l.destination, 'destination'), passengerType: pax }));
    const ok = legs.filter((r) => r.available);
    return { legs, total: { min: ok.reduce((s, r) => s + r.min, 0), max: ok.reduce((s, r) => s + r.max, 0), partial: ok.length !== legs.length } };
  }],
  ['GET', /^\/api\/nearby$/, ({ q }) => nearbyStops(engineDs(), { lat: num(q.get('lat'), 'lat'), lng: num(q.get('lng'), 'lng') }, Math.min(3, +q.get('radius') || 1))],
  ['GET', /^\/api\/lines$/, ({ q }) => linesWithStops(engineDs(), q.get('q') || '', q.get('mode') || '')],
  ['GET', /^\/api\/lines\/passing$/, ({ q }) => linesPassing(engineDs(), { lat: num(q.get('lat'), 'lat'), lng: num(q.get('lng'), 'lng') }, Math.min(2, +q.get('radius') || 0.4), q.get('mode') || null)
    .map(({ line, km }) => ({ id: line.id, code: line.code, name: line.name, modeId: line.modeId, signboard: line.signboard, verified: line.verified, km }))],
  ['GET', /^\/api\/tricycle\/zones$/, () => { const ds = engineDs(); return ds.tricycleZones.filter((z) => z.active !== false).map((z) => ({ ...z, fare: ds.fareSchedules.find((f) => f.scope?.zoneId === z.id) ?? null })); }],
  ['POST', /^\/api\/ridehail\/compare$/, ({ b }) => compareProviders(engineDs(), pt(b.origin, 'origin'), pt(b.destination, 'destination'), { passengerType: b.passengerType || 'regular' })],
  ['POST', /^\/api\/providers\/[^/]+\/open$/, () => ({ ok: true })],
  ['GET', /^\/api\/advisories$/, () => activeAdvisories(engineDs())],
  ['POST', /^\/api\/assistant$/, ({ b }) => {
    const r = answer(engineDs(), String(b.message || '').slice(0, 500), { passengerType: b.passengerType, currentLocation: b.currentLocation ? pt(b.currentLocation, 'Current location') : undefined });
    return { text: r.text, options: r.plan?.options?.slice(0, 3) ?? [], query: r.plan?.query ?? null };
  }],
  ['POST', /^\/api\/reports$/, ({ b }) => {
    if (!b.description || String(b.description).length < 10) throw new ApiError(400, 'Please describe the issue (at least 10 characters).');
    const rec = { id: crypto.randomUUID(), category: b.category, description: String(b.description).slice(0, 2000), reporterId: b.reporterId, status: 'pending', createdAt: new Date().toISOString() };
    local.reports.push(rec); save();
    return { id: rec.id, status: rec.status };
  }],
  ['GET', /^\/api\/reports\/mine$/, ({ q }) => local.reports.filter((r) => r.reporterId === q.get('reporterId'))],
  ['DELETE', /^\/api\/account$/, () => { throw new ApiError(501, 'Accounts are not available in the demo build.'); }],
  // community
  ['POST', /^\/api\/community\/contributions$/, ({ b, h }) => svc.contribute(me(h, b), b)],
  ['POST', /^\/api\/community\/contributions\/([^/]+)\/confirm$/, ({ b, h, m }) => svc.confirm(me(h, b), decodeURIComponent(m[1]), b)],
  ['GET', /^\/api\/community\/verify$/, ({ q, h }) => svc.verifyFeed(me(h), q.get('lat') ? { lat: +q.get('lat'), lng: +q.get('lng') } : null)],
  ['GET', /^\/api\/community\/me$/, ({ q, h }) => svc.profile(me(h, { displayName: q.get('displayName') }))],
  ['GET', /^\/api\/community\/leaderboard$/, ({ q }) => svc.leaderboard(q.get('period'), q.get('contributorId'))],
  ['GET', /^\/api\/community\/line\/([^/]+)$/, ({ m }) => svc.lineInfo(decodeURIComponent(m[1]))],
];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  await ready;
  const method = (init.method || 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  for (const [mth, re, fn] of routes) {
    const m = url.pathname.match(re);
    if (!m || mth !== method) continue;
    try {
      const b = init.body ? JSON.parse(init.body) : {};
      const data = await fn({ b, q: url.searchParams, h, m });
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.status ? e.message : 'Something went wrong' }), { status: e.status || 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ error: 'Not available in the demo build' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};

/** Demo only: let the simulated riders answer my open reports (agree), so the verification flow can be tried on one phone. */
export async function simulateRidersConfirm() {
  await ready;
  const id = myId();
  const sims = local.contributors.filter((c) => c.simulated);
  let n = 0;
  for (const c of local.contributions.filter((x) => x.contributorId === id && x.status !== 'community_verified')) {
    for (const s of sims.slice(0, 5)) {
      if (local.confirmations.some((f) => f.contributionId === c.id && f.contributorId === s.id)) continue;
      local.confirmations.push({ id: crypto.randomUUID(), contributionId: c.id, contributorId: s.id, agree: true, at: new Date().toISOString(), simulated: true });
      svc.award(s, REWARDS.confirm, 'confirmation');
    }
    svc.settle(c); n++;
  }
  save();
  return n;
}
