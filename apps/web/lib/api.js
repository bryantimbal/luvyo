// API client with offline fallback: when the network is unavailable, the same
// routing/fare engine (/core) runs on the cached dataset, and results are
// clearly labelled as offline/cached.

import { planJourney, nearbyStops, linesPassing, compareProviders, estimateFare } from '/core/router.js';
import { answer } from '/core/assistant.js';
import { store } from './store.js';

const DS_KEY = 'sakaypinoy:dataset';
let memDs = null;

async function call(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

const isNetErr = (e) => !e.status; // fetch TypeError → offline

export async function syncDataset(force = false) {
  try {
    const ds = await call('/api/dataset');
    memDs = ds;
    try { localStorage.setItem(DS_KEY, JSON.stringify(ds)); } catch {}
    store.set({ lastSync: new Date().toISOString() });
    return ds;
  } catch (e) {
    if (!force) return cachedDataset();
    throw e;
  }
}

export function cachedDataset() {
  if (memDs) return memDs;
  try { memDs = JSON.parse(localStorage.getItem(DS_KEY)); } catch { memDs = null; }
  return memDs;
}

async function withFallback(online, offline) {
  try { return await online(); } catch (e) {
    if (!isNetErr(e)) throw e;
    const ds = cachedDataset();
    if (!ds) throw new Error('You are offline and no cached transport data is available yet.');
    const r = offline(ds);
    if (r && typeof r === 'object' && !Array.isArray(r)) r.offline = { lastSync: store.get().lastSync };
    return r;
  }
}

export const api = {
  config: () => call('/api/config').catch(() => ({})),
  places: (q) => withFallback(() => call('/api/places?q=' + encodeURIComponent(q)), (ds) => {
    const s = q.toLowerCase();
    return ds.places.filter((p) => [p.name, ...(p.aliases || [])].some((n) => n.toLowerCase().includes(s))).slice(0, 12);
  }),
  search: (q) => withFallback(() => call('/api/routes/search', { method: 'POST', body: q }), (ds) => {
    const r = planJourney(ds, q);
    r.advisories = ds.advisories || [];
    return r;
  }),
  fare: (b) => withFallback(() => call('/api/fare/calculate', { method: 'POST', body: b }), (ds) => {
    const legs = (b.legs || [b]).map((l) => estimateFare(ds, { ...l, passengerType: b.passengerType }));
    const ok = legs.filter((x) => x.available);
    return { legs, total: { min: ok.reduce((s, x) => s + x.min, 0), max: ok.reduce((s, x) => s + x.max, 0), partial: ok.length !== legs.length } };
  }),
  nearby: (p, r = 1) => withFallback(() => call(`/api/nearby?lat=${p.lat}&lng=${p.lng}&radius=${r}`), (ds) => nearbyStops(ds, p, r)),
  lines: (q = '', mode = '') => withFallback(() => call(`/api/lines?q=${encodeURIComponent(q)}&mode=${mode}`), (ds) => {
    const stops = new Map(ds.stops.map((x) => [x.id, x]));
    const s = q.toLowerCase();
    return ds.lines.filter((l) => l.operational !== false && (!mode || l.modeId === mode))
      .filter((l) => !s || [l.name, l.code, l.signboard, ...l.stopIds.map((id) => stops.get(id)?.name)].some((x) => x && x.toLowerCase().includes(s)))
      .map((l) => ({ ...l, stops: l.stopIds.map((id) => stops.get(id)).filter(Boolean) }));
  }),
  passing: (p, mode = '', r = 0.4) => withFallback(() => call(`/api/lines/passing?lat=${p.lat}&lng=${p.lng}&mode=${mode}&radius=${r}`),
    (ds) => linesPassing(ds, p, r, mode || null).map(({ line, km }) => ({ ...line, km }))),
  zones: () => withFallback(() => call('/api/tricycle/zones'), (ds) => ds.tricycleZones.map((z) => ({ ...z, fare: ds.fareSchedules.find((f) => f.scope?.zoneId === z.id) ?? null }))),
  ridehail: (b) => withFallback(() => call('/api/ridehail/compare', { method: 'POST', body: b }), (ds) => compareProviders(ds, b.origin, b.destination, b)),
  providerOpened: (id) => call(`/api/providers/${encodeURIComponent(id)}/open`, { method: 'POST' }).catch(() => {}),
  advisories: () => withFallback(() => call('/api/advisories'), (ds) => ds.advisories || []),
  assistant: (b) => withFallback(() => call('/api/assistant', { method: 'POST', body: b }), (ds) => {
    const r = answer(ds, b.message, { currentLocation: b.currentLocation, passengerType: b.passengerType });
    return { text: r.text, options: r.plan?.options?.slice(0, 3) ?? [], query: r.plan?.query ?? null };
  }),
  report: (b) => call('/api/reports', { method: 'POST', body: b }),
  myReports: (id) => call('/api/reports/mine?reporterId=' + encodeURIComponent(id)).catch(() => []),
};
