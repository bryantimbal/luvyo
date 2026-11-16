// Multimodal journey planner (spec §6, §7).
//
// Model: stops are graph nodes. For every line we add a "ride edge" from each
// stop to every later stop on that line (board i → alight j) carrying the full
// fare for that ride, so per-boarding fares stay additive. Walking links join
// nearby stops (transfers). The origin/destination connect to stops by walking,
// and – when allowed – by a single motorcycle-taxi / tricycle first/last-mile leg.
//
// Dijkstra runs once per weight profile (cheapest, fastest, fewest transfers,
// balanced, and variants). Results are de-duplicated, combined with door-to-door
// options (taxi, ride-hailing car, motorcycle taxi, tricycle, walking) and
// labelled by ranking.js.

import { haversineKm, walkKm, heuristicRoadProvider, nearest, pointToSegmentKm } from './geo.js';
import { findSchedule, calculateFare, sumFares } from './fareEngine.js';
import { rideMinutes, waitMinutes, walkMinutes, isOperating, addMinutes, timeBand } from './timeEngine.js';
import { weakestSource } from './trust.js';
import { rankOptions } from './ranking.js';

const HAIL_MODES = new Set(['mc_taxi', 'tricycle']);
const PRIVATE_MODES = new Set(['mc_taxi', 'ridehail_car', 'taxi']);
const mid = (r) => (r.min + r.max) / 2;

// ---------------------------------------------------------------- graph ---

const graphCache = new WeakMap();

export function buildGraph(ds) {
  if (graphCache.has(ds)) return graphCache.get(ds);
  const stops = new Map(ds.stops.map((s) => [s.id, s]));
  const modes = new Map(ds.modes.map((m) => [m.id, m]));
  const rides = new Map(); // stopId -> [{ line, i, j }]
  const walks = new Map(); // stopId -> [{ to, km }]
  const lines = ds.lines.filter((l) => l.operational !== false && l.active !== false);
  for (const line of lines) {
    const ids = line.stopIds.filter((id) => stops.has(id));
    const cum = [0];
    for (let k = 1; k < ids.length; k++) cum.push(cum[k - 1] + haversineKm(stops.get(ids[k - 1]), stops.get(ids[k])) * (line.detour ?? (modes.get(line.modeId)?.roadBased ? 1.2 : 1.05)));
    const add = (i, j) => {
      const from = ids[i];
      if (!rides.has(from)) rides.set(from, []);
      rides.get(from).push({ line, i, j, ids, km: Math.abs(cum[j] - cum[i]) });
    };
    for (let i = 0; i < ids.length; i++)
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        if (j > i || line.bidirectional !== false) add(i, j);
      }
  }
  const all = [...stops.values()];
  for (const s of all) {
    walks.set(
      s.id,
      nearest(all, s, ds.settings.transferWalkKm ?? 0.5)
        .filter((n) => n.item.id !== s.id)
        .map((n) => ({ to: n.item.id, km: walkKm(s, n.item) }))
    );
  }
  const stopModes = new Map();
  for (const l of lines) for (const id of l.stopIds) {
    if (!stopModes.has(id)) stopModes.set(id, new Set());
    stopModes.get(id).add(l.modeId);
  }
  const g = { stops, modes, rides, walks, stopModes, lines };
  graphCache.set(ds, g);
  return g;
}

// ------------------------------------------------------------- helpers ---

function zoneFor(ds, p) {
  return (ds.tricycleZones || []).find((z) => z.active !== false && haversineKm(p, z.center) <= z.radiusKm) || null;
}

function allowed(opts, modeId) {
  if (opts.exclude?.includes(modeId)) return false;
  const cat = opts.modesById.get(modeId)?.category;
  if (opts.publicOnly && (PRIVATE_MODES.has(modeId) || cat === 'private')) return false;
  if (opts.privateOnly && !PRIVATE_MODES.has(modeId) && modeId !== 'walk') return false;
  return true;
}

function fareFor(ds, scope, trip, passengerType, at) {
  return calculateFare(findSchedule(ds.fareSchedules, scope, at), trip, passengerType);
}

/** Price + time a hailed first/last-mile leg (motorcycle taxi or tricycle). */
function hailLeg(ds, modeId, a, b, opts, at, zone) {
  const km = heuristicRoadProvider.roadKm(a, b);
  const t = rideMinutes(ds.timeProfiles, modeId, km, at);
  const pickup = ds.timeProfiles.modes[modeId]?.pickupMin ?? [0, 0];
  let fare, providers = [];
  if (modeId === 'tricycle') {
    fare = fareFor(ds, { zoneId: zone?.id, modeId }, { distanceKm: km, durationMin: mid(t) }, opts.passengerType, at);
  } else {
    providers = (ds.providers || []).filter((p) => p.modeId === modeId && p.enabled !== false);
    const quotes = providers.map((p) => fareFor(ds, { providerId: p.id, modeId }, { distanceKm: km, durationMin: mid(t) }, opts.passengerType, at));
    fare = combineQuotes(quotes);
  }
  return {
    type: 'ride', modeId, km, providers: providers.map((p) => p.id),
    time: { min: t.min, max: t.max }, wait: { min: pickup[0], max: pickup[1] }, fare, traffic: t.traffic, zoneId: zone?.id ?? null,
  };
}

function combineQuotes(quotes) {
  const ok = quotes.filter((q) => q.available);
  if (!ok.length) return quotes[0] ?? { available: false, min: null, max: null, reason: 'No provider configured', breakdown: [] };
  const best = ok.reduce((a, b) => (a.min <= b.min ? a : b));
  return {
    ...best,
    min: Math.min(...ok.map((q) => q.min)),
    max: Math.max(...ok.map((q) => q.max)),
    sourceType: weakestSource(ok.map((q) => q.sourceType)),
    breakdown: [{ label: `Range across ${ok.length} provider(s)`, amount: null }],
  };
}

// ------------------------------------------------------------ dijkstra ---

class MinHeap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].w <= a[i].w) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].w < a[m].w) m = l; if (r < a.length && a[r].w < a[m].w) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

function weightOf(prof, e) {
  return prof.cost * (e.fare?.available ? mid(e.fare) : e.fare ? prof.unknownFarePenalty : 0) +
    prof.time * (mid(e.time) + mid(e.wait)) +
    prof.boarding * (e.type === 'ride' ? 1 : 0) +
    prof.walk * (e.type === 'walk' ? e.km : 0);
}

function search(ds, g, O, D, opts, prof) {
  const start = opts.departAt;
  const maxWalk = opts.maxWalkKm;
  const hailOk = prof.allowHail && opts.hailModes.length > 0;
  const dist = new Map();
  const prev = new Map();
  const heap = new MinHeap();
  const key = (n, h) => `${n}|${h}`;
  dist.set(key('O', 0), 0);
  heap.push({ w: 0, n: 'O', h: 0, elapsed: 0, boards: 0 });
  const oZone = zoneFor(ds, O), dZone = zoneFor(ds, D);

  const relax = (cur, to, h, edge) => {
    if (edge.type === 'ride' && opts.maxTransfers != null && cur.boards + 1 > opts.maxTransfers + 1) return;
    const k = key(to, h);
    const w = cur.w + weightOf(prof, edge);
    if (w < (dist.get(k) ?? Infinity)) {
      dist.set(k, w);
      prev.set(k, { from: key(cur.n, cur.h), edge, toNode: to });
      heap.push({ w, n: to, h, elapsed: cur.elapsed + mid(edge.time) + mid(edge.wait), boards: cur.boards + (edge.type === 'ride' ? 1 : 0) });
    }
  };

  while (heap.size) {
    const cur = heap.pop();
    const k = key(cur.n, cur.h);
    if (cur.w > (dist.get(k) ?? Infinity)) continue;
    if (cur.n === 'D') return reconstruct(prev, k);
    const at = addMinutes(start, cur.elapsed);
    const here = cur.n === 'O' ? O : g.stops.get(cur.n);

    if (cur.n === 'O') {
      for (const { item: s, km } of nearest(ds.stops, O, Math.max(maxWalk, hailOk ? 8 : 0))) {
        const wk = km * 1.25;
        if (wk <= maxWalk && allowed(opts, 'walk'))
          relax(cur, s.id, cur.h, walkEdge(ds, O, s, wk));
        else if (hailOk && cur.h === 0 && isTrunkStop(g, s.id)) {
          const m = pickHail(opts, oZone, s);
          if (m) relax(cur, s.id, 1, { ...hailLeg(ds, m, O, s, opts, at, oZone), from: O, to: s });
        }
      }
      continue;
    }
    // ride edges
    const band = timeBand(ds.timeProfiles, at);
    for (const r of g.rides.get(cur.n) || []) {
      if (!allowed(opts, r.line.modeId)) continue;
      if (!isOperating(r.line, at).ok) continue;
      const ck = `${r.line.id}|${r.i}|${r.j}|${band}`;
      let e = opts.edgeCache.get(ck);
      if (!e) { e = rideEdge(ds, g, r, opts, at); opts.edgeCache.set(ck, e); }
      relax(cur, r.ids[r.j], cur.h, e);
    }
    // walking transfers
    if (allowed(opts, 'walk'))
      for (const w of g.walks.get(cur.n) || []) relax(cur, w.to, cur.h, walkEdge(ds, here, g.stops.get(w.to), w.km));
    // egress
    const toD = walkKm(here, D);
    if (toD <= maxWalk && allowed(opts, 'walk')) relax(cur, 'D', cur.h, walkEdge(ds, here, D, toD));
    else if (hailOk && cur.h === 0 && isTrunkStop(g, cur.n) && haversineKm(here, D) <= 8) {
      const m = pickHail(opts, dZone, here);
      if (m) relax(cur, 'D', 1, { ...hailLeg(ds, m, here, D, opts, at, dZone), from: here, to: D });
    }
  }
  return null;
}

function isTrunkStop(g, id) {
  const m = g.stopModes.get(id);
  return !!m && (m.has('rail') || m.has('bus'));
}

function pickHail(opts, zone, stop) {
  if (zone && opts.hailModes.includes('tricycle') && haversineKm(zone.center, stop) <= zone.radiusKm) return 'tricycle';
  return opts.hailModes.includes('mc_taxi') ? 'mc_taxi' : null;
}

function walkEdge(ds, a, b, km) {
  const t = walkMinutes(ds.timeProfiles, km);
  return { type: 'walk', modeId: 'walk', km, from: a, to: b, time: { min: t, max: t * 1.15 }, wait: { min: 0, max: 0 }, fare: null };
}

function rideEdge(ds, g, r, opts, at) {
  const { line, i, j, ids, km } = r;
  const nStops = Math.abs(j - i);
  const t = rideMinutes(ds.timeProfiles, line.modeId, km, at, nStops);
  const w = waitMinutes(ds.timeProfiles, line.modeId, line);
  const fare = fareFor(ds, { lineId: line.id, operatorId: line.operatorId, modeId: line.modeId },
    { distanceKm: km, durationMin: mid(t), fromStopId: ids[i], toStopId: ids[j] }, opts.passengerType, at);
  const span = i < j ? ids.slice(i, j + 1) : ids.slice(j, i + 1).reverse();
  const overhead = ds.timeProfiles.modes[line.modeId]?.stationOverheadMin ?? [0, 0];
  return {
    type: 'ride', modeId: line.modeId, lineId: line.id, km, from: g.stops.get(ids[i]), to: g.stops.get(ids[j]),
    viaStopIds: span, time: { min: t.min + overhead[0], max: t.max + overhead[1] }, wait: { min: w.min, max: w.max, known: w.known },
    fare, traffic: t.traffic,
  };
}

function reconstruct(prev, k) {
  const edges = [];
  while (prev.has(k)) { const p = prev.get(k); edges.unshift(p.edge); k = p.from; }
  return edges;
}

// --------------------------------------------------------- assemble ------

const PROFILES = [
  { id: 'cheapest', cost: 1, time: 0.02, boarding: 0.5, walk: 2, unknownFarePenalty: 60, allowHail: false },
  { id: 'fastest', cost: 0.01, time: 1, boarding: 2, walk: 3, unknownFarePenalty: 5, allowHail: true },
  { id: 'fewest', cost: 0.05, time: 0.1, boarding: 40, walk: 3, unknownFarePenalty: 20, allowHail: false },
  { id: 'balanced', cost: 0.35, time: 0.5, boarding: 6, walk: 6, unknownFarePenalty: 40, allowHail: false },
  { id: 'balanced_hail', cost: 0.35, time: 0.5, boarding: 6, walk: 6, unknownFarePenalty: 40, allowHail: true },
];

function describeLeg(ds, g, e) {
  const mode = g.modes.get(e.modeId);
  const line = e.lineId ? ds.lines.find((l) => l.id === e.lineId) : null;
  const op = line ? ds.operators.find((o) => o.id === line.operatorId) : null;
  const path = e.viaStopIds ? e.viaStopIds.map((id) => [g.stops.get(id).lat, g.stops.get(id).lng]) : [[e.from.lat, e.from.lng], [e.to.lat, e.to.lng]];
  const leg = {
    type: e.type, modeId: e.modeId, modeLabel: mode?.label ?? e.modeId, icon: mode?.icon ?? '•',
    lineId: line?.id ?? null, lineName: line?.name ?? null, lineCode: line?.code ?? null, signboard: line?.signboard ?? null,
    operatorName: op?.name ?? null, providers: e.providers ?? [],
    from: { name: e.from.name ?? 'Start', lat: e.from.lat, lng: e.from.lng, stopId: e.from.id },
    to: { name: e.to.name ?? 'Destination', lat: e.to.lat, lng: e.to.lng, stopId: e.to.id },
    distanceKm: e.km, time: e.time, wait: e.wait, fare: e.fare, path,
    stopsCount: e.viaStopIds ? e.viaStopIds.length - 1 : 0,
    verified: line ? line.verified === true : null,
    sourceType: line?.sourceType ?? e.fare?.sourceType ?? null,
    dataset: line?.dataset ?? e.fare?.dataset ?? null,
    traffic: e.traffic ?? null,
  };
  leg.instruction = instruction(leg);
  return leg;
}

function instruction(l) {
  const m = Math.round(l.distanceKm * 1000);
  if (l.type === 'walk') return `Lakad: walk about ${m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'} to ${l.to.name}.`;
  if (l.modeId === 'mc_taxi') return `Book a motorcycle taxi from ${l.from.name} to ${l.to.name} (≈${l.distanceKm.toFixed(1)} km).`;
  if (l.modeId === 'tricycle') return `Sakay: take a tricycle from ${l.from.name} to ${l.to.name}.`;
  if (l.modeId === 'rail') return `Sakay: board ${l.lineName} at ${l.from.name} station, ride ${l.stopsCount} station(s), baba at ${l.to.name}.`;
  const sign = l.signboard ? ` (signboard: “${l.signboard}”)` : '';
  return `Sakay: board the ${l.modeLabel.toLowerCase()} ${l.lineName}${sign} at ${l.from.name}. Baba at ${l.to.name} (${l.stopsCount} stop${l.stopsCount === 1 ? '' : 's'}).`;
}

function mergeWalks(legs) {
  const out = [];
  for (const l of legs) {
    const last = out[out.length - 1];
    if (last && last.type === 'walk' && l.type === 'walk') {
      last.distanceKm += l.distanceKm; last.time = { min: last.time.min + l.time.min, max: last.time.max + l.time.max };
      last.to = l.to; last.path = [...last.path, ...l.path.slice(1)]; last.instruction = instruction(last);
    } else out.push(l);
  }
  return out;
}

function finalize(ds, legs, opts, kind, title) {
  const fare = sumFares(legs.map((l) => l.fare));
  const time = { min: 0, max: 0 };
  const wait = { min: 0, max: 0 };
  for (const l of legs) {
    time.min += l.time.min + (l.wait?.min ?? 0); time.max += l.time.max + (l.wait?.max ?? 0);
    wait.min += l.wait?.min ?? 0; wait.max += l.wait?.max ?? 0;
  }
  const rides = legs.filter((l) => l.type === 'ride');
  const walkKmTot = legs.filter((l) => l.type === 'walk').reduce((s, l) => s + l.distanceKm, 0);
  const sources = legs.filter((l) => l.fare).map((l) => l.fare.available ? l.fare.sourceType : 'indicative');
  const lv = legs.map((l) => l.fare?.lastVerified).filter(Boolean).sort()[0] ?? null;
  const modes = [...new Set(rides.map((l) => l.modeId))];
  const warnings = [];
  if (fare.partial) warnings.push('Some fares are unavailable – total shown excludes them.');
  if (legs.some((l) => l.verified === false)) warnings.push('Includes a route that is not yet verified.');
  if (legs.some((l) => l.dataset === 'development')) warnings.push('Uses development data – verify before travelling.');
  if (legs.some((l) => l.modeId === 'ridehail_car' || l.modeId === 'taxi')) warnings.push('Tolls not included unless stated.');
  if (opts.budget && fare.min > opts.budget) warnings.push(`Over your ₱${opts.budget} budget.`);
  return {
    id: kind + ':' + legs.map((l) => l.lineId || l.modeId).join('>'),
    kind, title: title || rides.map((l) => l.lineCode || l.modeLabel).join(' + ') || 'Walk',
    legs, fare, time, wait, modes,
    depart: opts.departAt.toISOString(),
    arrive: { min: addMinutes(opts.departAt, time.min).toISOString(), max: addMinutes(opts.departAt, time.max).toISOString() },
    distanceKm: legs.reduce((s, l) => s + l.distanceKm, 0),
    walkKm: walkKmTot, transfers: Math.max(0, rides.length - 1),
    sourceType: sources.length ? weakestSource(sources) : 'official', lastVerified: lv,
    trafficData: legs.some((l) => l.traffic === 'live') ? 'live' : legs.some((l) => l.traffic === 'typical') ? 'typical' : 'n/a',
    overBudget: !!(opts.budget && fare.min > opts.budget),
    warnings, tags: [],
  };
}

function directOptions(ds, g, O, D, opts) {
  const out = [];
  const at = opts.departAt;
  const km = heuristicRoadProvider.roadKm(O, D);
  const from = { ...O }, to = { ...D };
  const mk = (modeId, fare, time, wait, extra = {}) => describeLeg(ds, g, { type: modeId === 'walk' ? 'walk' : 'ride', modeId, km, from, to, time, wait, fare, ...extra });
  // walking
  const wk = walkKm(O, D);
  if (allowed(opts, 'walk') && !opts.privateOnly && wk <= (ds.settings.maxWalkOnlyKm ?? 2.5)) {
    const t = walkMinutes(ds.timeProfiles, wk);
    out.push(finalize(ds, [describeLeg(ds, g, { type: 'walk', modeId: 'walk', km: wk, from, to, time: { min: t, max: t * 1.15 }, wait: { min: 0, max: 0 }, fare: null })], opts, 'walk', 'Walk'));
  }
  for (const modeId of ['mc_taxi', 'ridehail_car', 'taxi']) {
    if (!allowed(opts, modeId) || km > (ds.timeProfiles.modes[modeId]?.maxKm ?? 60)) continue;
    const t = rideMinutes(ds.timeProfiles, modeId, km, at);
    const pickup = ds.timeProfiles.modes[modeId]?.pickupMin ?? [0, 0];
    const providers = (ds.providers || []).filter((p) => p.modeId === modeId && p.enabled !== false);
    let fare, quotes = [];
    if (providers.length) {
      quotes = providers.map((p) => ({ provider: p, fare: fareFor(ds, { providerId: p.id, modeId }, { distanceKm: km, durationMin: mid(t) }, opts.passengerType, at) }));
      fare = combineQuotes(quotes.map((q) => q.fare));
    } else fare = fareFor(ds, { modeId }, { distanceKm: km, durationMin: mid(t) }, opts.passengerType, at);
    const leg = mk(modeId, fare, { min: t.min, max: t.max }, { min: pickup[0], max: pickup[1] }, { providers: providers.map((p) => p.id), traffic: t.traffic });
    const o = finalize(ds, [leg], opts, modeId, g.modes.get(modeId)?.label);
    o.providerQuotes = quotes.map((q) => ({ providerId: q.provider.id, name: q.provider.name, fare: q.fare }));
    out.push(o);
  }
  // tricycle – only inside a configured zone
  const zO = zoneFor(ds, O), zD = zoneFor(ds, D);
  if (allowed(opts, 'tricycle') && zO && zO === zD) {
    const leg = hailLeg(ds, 'tricycle', O, D, opts, at, zO);
    out.push(finalize(ds, [describeLeg(ds, g, { ...leg, from, to })], opts, 'tricycle', `Tricycle (${zO.name})`));
  }
  return out;
}

/**
 * Plan a journey.
 * @param ds dataset (see data/dev)
 * @param q { origin, destination, departAt?, arriveBy?, passengerType, maxWalkKm, maxTransfers,
 *            budget, exclude[], publicOnly, privateOnly, priority }
 */
export function planJourney(ds, q) {
  const g = buildGraph(ds);
  const O = { name: q.origin.name || 'Start', lat: +q.origin.lat, lng: +q.origin.lng };
  const D = { name: q.destination.name || 'Destination', lat: +q.destination.lat, lng: +q.destination.lng };
  if ([O.lat, O.lng, D.lat, D.lng].some((v) => !Number.isFinite(v))) throw new Error('Origin and destination need coordinates');
  const opts = {
    passengerType: q.passengerType || 'regular',
    maxWalkKm: q.maxWalkKm ?? ds.settings.defaultMaxWalkKm ?? 1,
    maxTransfers: q.noTransfers ? 0 : q.maxTransfers ?? null,
    budget: q.budget || null,
    exclude: q.exclude || [],
    publicOnly: !!q.publicOnly,
    privateOnly: !!q.privateOnly,
    modesById: g.modes,
    edgeCache: new Map(),
  };
  opts.hailModes = ['mc_taxi', 'tricycle'].filter((m) => allowed(opts, m));
  let departAt = q.departAt ? new Date(q.departAt) : new Date();
  const arriveBy = q.arriveBy ? new Date(q.arriveBy) : null;

  const run = (depart) => {
    opts.departAt = depart;
    const results = [];
    const seen = new Set();
    const push = (o) => { if (o && !seen.has(o.id)) { seen.add(o.id); results.push(o); } };
    if (!opts.privateOnly) {
      for (const prof of PROFILES) {
        for (const ex of [[], ['rail'], ['jeepney'], ['bus']]) {
          const sub = { ...opts, exclude: [...opts.exclude, ...ex] };
          const edges = search(ds, g, O, D, sub, prof);
          if (!edges || !edges.some((e) => e.type === 'ride' && !HAIL_MODES.has(e.modeId))) continue;
          const legs = mergeWalks(edges.map((e) => describeLeg(ds, g, e)));
          const hasHail = legs.some((l) => HAIL_MODES.has(l.modeId));
          push(finalize(ds, legs, opts, hasHail ? 'mixed' : 'transit'));
        }
      }
    }
    for (const o of directOptions(ds, g, O, D, opts)) push(o);
    return results;
  };

  let options = run(departAt);
  let recommendedDeparture = null;
  if (arriveBy) {
    // Arrive-by: pick the latest departure whose pessimistic arrival meets the deadline.
    const worst = Math.max(...options.map((o) => o.time.max), 30);
    departAt = addMinutes(arriveBy, -worst - (ds.settings.arriveBufferMin ?? 5));
    options = run(departAt).map((o) => {
      const latest = addMinutes(arriveBy, -o.time.max);
      o.recommendedDeparture = latest.toISOString();
      o.meetsDeadline = new Date(o.arrive.max) <= arriveBy;
      return o;
    });
    recommendedDeparture = departAt.toISOString();
  }
  if (opts.maxTransfers != null) options = options.filter((o) => o.transfers <= opts.maxTransfers);
  options = rankOptions(options, { priority: q.priority || 'best', budget: opts.budget, weights: ds.settings.scoring });
  return {
    query: { origin: O, destination: D, departAt: departAt.toISOString(), arriveBy: arriveBy?.toISOString() ?? null, passengerType: opts.passengerType },
    options,
    recommendedDeparture,
    meta: {
      roadDistance: heuristicRoadProvider.label,
      traffic: 'Live traffic unavailable – times use configured typical-speed profiles for this time of day.',
      dataset: ds.meta,
      generatedAt: new Date().toISOString(),
    },
  };
}

// --------------------------------------------------- discovery helpers ---

export function nearbyStops(ds, p, radiusKm = 1) {
  const g = buildGraph(ds);
  return nearest(ds.stops, p, radiusKm, 50).map(({ item, km }) => ({
    ...item, km, modes: [...(g.stopModes.get(item.id) || [])],
    lines: g.lines.filter((l) => l.stopIds.includes(item.id)).map((l) => ({ id: l.id, code: l.code, name: l.name, modeId: l.modeId })),
  }));
}

/** "Does this jeepney pass here?" – lines whose stop-to-stop path passes within radius. */
export function linesPassing(ds, p, radiusKm = 0.4, modeId = null) {
  const stops = new Map(ds.stops.map((s) => [s.id, s]));
  return ds.lines
    .filter((l) => l.operational !== false && (!modeId || l.modeId === modeId))
    .map((l) => {
      const pts = l.stopIds.map((id) => stops.get(id)).filter(Boolean);
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) best = Math.min(best, pointToSegmentKm(p, pts[i - 1], pts[i]));
      if (pts.length === 1) best = haversineKm(p, pts[0]);
      return { line: l, km: best };
    })
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

/** Ride-hailing comparison table (spec §13). */
export function compareProviders(ds, O, D, { passengerType = 'regular', departAt = new Date() } = {}) {
  const km = heuristicRoadProvider.roadKm(O, D);
  return (ds.providers || []).filter((p) => p.enabled !== false).map((p) => {
    const t = rideMinutes(ds.timeProfiles, p.modeId, km, departAt);
    const pickup = ds.timeProfiles.modes[p.modeId]?.pickupMin ?? null;
    const fare = fareFor(ds, { providerId: p.id, modeId: p.modeId }, { distanceKm: km, durationMin: mid(t) }, passengerType, departAt);
    return {
      provider: p, vehicle: p.vehicle, distanceKm: km, duration: { min: t.min, max: t.max }, pickup: pickup ? { min: pickup[0], max: pickup[1], live: false } : null,
      fare, availability: p.integration === 'official_api' ? 'confirmed' : 'unknown', traffic: t.traffic,
    };
  }).sort((a, b) => (a.fare.min ?? 1e9) - (b.fare.min ?? 1e9));
}

/** Fare calculator for a single mode/line between two points (spec §15). */
export function estimateFare(ds, { modeId, lineId, fromStopId, toStopId, origin, destination, passengerType = 'regular', at = new Date() }) {
  const g = buildGraph(ds);
  if (lineId) {
    const r = (g.rides.get(fromStopId) || []).find((x) => x.line.id === lineId && x.ids[x.j] === toStopId);
    if (!r) return { available: false, reason: 'These stops are not on this line in that order.' };
    const e = rideEdge(ds, g, r, { passengerType }, at);
    return { ...e.fare, distanceKm: e.km, time: e.time };
  }
  const km = heuristicRoadProvider.roadKm(origin, destination);
  const t = rideMinutes(ds.timeProfiles, modeId, km, at);
  const zone = modeId === 'tricycle' ? zoneFor(ds, origin) : null;
  const f = fareFor(ds, { modeId, zoneId: zone?.id }, { distanceKm: km, durationMin: t.min != null ? mid(t) : 0 }, passengerType, at);
  return { ...f, distanceKm: km, time: t.min != null ? { min: t.min, max: t.max } : null };
}

