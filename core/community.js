// Community data engine (contributor-driven modes: jeepney, UV Express,
// tricycle, motorcycle taxi, ride-hailing, taxi).
//
// Fixed-schedule services (rail, terminal buses, P2P, ferries) stay on
// official/operator data. For street-level transport, riders are the source:
//
//   contribution ──► peer confirmations (reputation-weighted, time-decayed)
//                 ──► status: pending | community_verified | disputed |
//                             needs_reconfirmation | rejected
//                 ──► applyCommunity(ds): verified data becomes fares, wait
//                     times, new routes, route shapes, loading spots, warnings.
//
// Community data is labelled "community_verified" – never "official" – and
// never overrides official / operator / admin-verified records.

import { haversineKm, polylineKm } from './geo.js';
import { SOURCE_TYPES } from './trust.js';
import { findSchedule, calculateFare } from './fareEngine.js';
import { manilaMinutes, hm } from './timeEngine.js';

const DAY = 86400000;

export const COMMUNITY_MODES = ['jeepney', 'uv', 'tricycle', 'mc_taxi', 'ridehail_car', 'taxi'];

export const CONTRIB_TYPES = {
  fare: { label: 'Fare paid', icon: '₱', points: 5, halfLifeDays: 120 },
  wait: { label: 'Waiting / pickup time', icon: '⏳', points: 3, halfLifeDays: 45 },
  route_check: { label: 'Route still accurate', icon: '✅', points: 1, halfLifeDays: 90 },
  route_trace: { label: 'Recorded ride', icon: '🛰️', points: 15, halfLifeDays: 365 },
  new_route: { label: 'New route', icon: '🆕', points: 25, halfLifeDays: 365 },
  loading_spot: { label: 'Loading spot', icon: '📍', points: 8, halfLifeDays: 180 },
  route_change: { label: 'Route change', icon: '🔀', points: 8, halfLifeDays: 30 },
  last_trip: { label: 'Last trip time', icon: '🌙', points: 5, halfLifeDays: 60 },
};

export const RULES = {
  verifyScore: 3, // weighted agreement needed
  minAgreeing: 3, // distinct contributors (incl. submitter)
  rejectScore: -2,
  disputeRatio: 0.4,
  probationAccepted: 3, // contributions accepted before full weight
  nearbyKm: 5, // confirmations from farther away count less
};

export const REWARDS = { confirm: 1, verifiedBonus: 20, verifiedRep: 10, confirmerRep: 2, rejectedRep: -10, wrongConfirmRep: -2, rightDisputeRep: 2 };

export const LEVELS = [
  { name: 'Pasahero', min: 0, icon: '🙋' },
  { name: 'Suki', min: 100, icon: '🎟️' },
  { name: 'Barker', min: 300, icon: '📣' },
  { name: 'Kundoktor', min: 700, icon: '🧾' },
  { name: 'Tsuper', min: 1500, icon: '🚙' },
  { name: 'Hari ng Kalsada', min: 3000, icon: '👑' },
];

export const BADGES = [
  { id: 'unang_para', name: 'Unang Para', icon: '✋', desc: 'Made your first contribution', test: (s) => s.submitted >= 1 },
  { id: 'fare_checker', name: 'Fare Checker', icon: '🪙', desc: '10 fare reports verified', test: (s) => (s.verifiedByType.fare || 0) >= 10 },
  { id: 'route_mapper', name: 'Route Mapper', icon: '🗺️', desc: 'A recorded ride or new route got verified', test: (s) => (s.verifiedByType.route_trace || 0) + (s.verifiedByType.new_route || 0) >= 1 },
  { id: 'validator', name: 'Validator', icon: '🔎', desc: 'Confirmed 50 reports', test: (s) => s.confirmations >= 50 },
  { id: 'trike_expert', name: 'Trike Expert', icon: '🛺', desc: '5 tricycle fares verified', test: (s) => (s.verifiedTricycle || 0) >= 5 },
  { id: 'night_owl', name: 'Night Owl', icon: '🌙', desc: '3 last-trip times verified', test: (s) => (s.verifiedByType.last_trip || 0) >= 3 },
  { id: 'trusted', name: 'Trusted Rider', icon: '🛡️', desc: 'Reputation of 100+', test: (s) => s.reputation >= 100 },
];

export function levelFor(points) {
  let cur = LEVELS[0], next = null;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) { cur = LEVELS[i]; next = LEVELS[i + 1] ?? null; }
  return { ...cur, next, progress: next ? (points - cur.min) / (next.min - cur.min) : 1 };
}

// ------------------------------------------------------------- weights ---

/** Voting weight of a contributor: probation for newcomers, grows with reputation. */
export function contributorWeight(c) {
  if (!c || c.suspended) return 0;
  const rep = c.reputation ?? 0;
  if (rep < 0) return 0.25;
  if ((c.stats?.accepted ?? 0) < RULES.probationAccepted) return 0.6; // 5 new riders ≈ 3 trusted ones
  return Math.min(2.5, Math.max(0.5, 0.75 + 0.25 * Math.log2(1 + rep / 10)));
}

export const decay = (ageMs, halfLifeDays) => Math.pow(0.5, ageMs / (halfLifeDays * DAY));

/**
 * Evaluate one contribution.
 * @returns { status, score, agreeW, disagreeW, agreeing, disagreeing, confidence, lastConfirmedAt }
 */
export function evaluate(c, confirmations, contributorsById, now = new Date()) {
  const type = CONTRIB_TYPES[c.type] || CONTRIB_TYPES.fare;
  const votes = [{ contributorId: c.contributorId, agree: true, at: c.createdAt, near: true }, ...confirmations];
  let agreeW = 0, disagreeW = 0, last = c.createdAt;
  const agreeing = new Set(), disagreeing = new Set();
  for (const v of votes) {
    const who = contributorsById.get(v.contributorId);
    const w = contributorWeight(who) * decay(now - new Date(v.at), type.halfLifeDays) * (v.near === false ? 0.6 : 1);
    if (v.agree) { agreeW += w; agreeing.add(v.contributorId); if (new Date(v.at) > new Date(last)) last = v.at; }
    else { disagreeW += w; disagreeing.add(v.contributorId); }
  }
  const score = agreeW - disagreeW;
  const total = agreeW + disagreeW;
  let status;
  if (c.moderation?.status) status = c.moderation.status; // moderator decision wins
  else if (score <= RULES.rejectScore) status = 'rejected';
  else if (disagreeing.size >= 1 && total > 0 && disagreeW / total >= RULES.disputeRatio && votes.length >= 2) status = 'disputed';
  else if (score >= RULES.verifyScore * 0.99 && agreeing.size >= RULES.minAgreeing) status = 'community_verified';
  else if (c.everVerified) status = 'needs_reconfirmation';
  else status = 'pending';
  return {
    status, score: round2(score), agreeW: round2(agreeW), disagreeW: round2(disagreeW),
    agreeing: agreeing.size, disagreeing: disagreeing.size,
    confidence: Math.max(0, Math.min(1, score / (RULES.verifyScore * 2))),
    lastConfirmedAt: last,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

// -------------------------------------------------------- plausibility ---

const FARE_RANGE = { jeepney: [8, 200], uv: [10, 400], tricycle: [10, 600], mc_taxi: [40, 3000], ridehail_car: [60, 6000], taxi: [40, 6000] };

/** Hard checks run before a contribution is accepted. Returns a list of problems (empty = OK). */
export function plausibility(type, p, { modes } = {}) {
  const errs = [];
  const inPH = (x) => x && x.lat > 4 && x.lat < 22 && x.lng > 115 && x.lng < 128;
  if (!CONTRIB_TYPES[type]) return ['Unknown contribution type'];
  if (p.modeId && !COMMUNITY_MODES.includes(p.modeId)) errs.push('This transport type uses official data only');
  if (p.lat != null && !inPH(p)) errs.push('Location must be in the Philippines');
  if (type === 'fare') {
    const [lo, hi] = FARE_RANGE[p.modeId] || [5, 6000];
    if (!(p.amount >= lo && p.amount <= hi)) errs.push(`Fare must be between ₱${lo} and ₱${hi} for this mode`);
    if (p.distanceKm != null && !(p.distanceKm > 0 && p.distanceKm < 200)) errs.push('Distance looks wrong');
    if (['mc_taxi', 'ridehail_car', 'taxi'].includes(p.modeId) && !(p.distanceKm > 0)) errs.push('Trip distance is needed for taxi and ride-hailing fares');
  }
  if (type === 'wait' && !(p.minutes >= 0 && p.minutes <= 180)) errs.push('Waiting time must be 0–180 minutes');
  if (type === 'last_trip' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || '')) errs.push('Time must be HH:MM');
  if (type === 'route_change' && !(p.description?.length >= 10)) errs.push('Describe the change (10+ characters)');
  if (type === 'loading_spot' && (!inPH(p) || !p.name)) errs.push('Loading spot needs a name and a location');
  if (type === 'route_trace' || type === 'new_route') {
    const pts = p.points || [];
    if (pts.length < 8) errs.push('Ride recording is too short');
    else {
      if (!pts.every((x) => inPH({ lat: x[0], lng: x[1] }))) errs.push('Recording must be in the Philippines');
      const km = polylineKm(pts.map(([lat, lng]) => ({ lat, lng })));
      if (km < 0.5) errs.push('Ride must be at least 500 m');
      if (km > 80) errs.push('Ride is too long for one route');
      // speed check where timestamps exist: [lat, lng, epochMs]
      for (let i = 1; i < pts.length; i++) {
        if (pts[i][2] && pts[i - 1][2]) {
          const h = (pts[i][2] - pts[i - 1][2]) / 3600000;
          if (h > 0 && haversineKm({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }) / h > 100) { errs.push('Recording has impossible speeds (GPS glitch?)'); break; }
        }
      }
    }
    if (type === 'new_route' && !(p.signboard?.length >= 3)) errs.push('Enter the signboard text');
    if (type === 'new_route' && !COMMUNITY_MODES.includes(p.modeId)) errs.push('Choose jeepney, UV Express or tricycle');
  }
  return errs;
}

/** Privacy: drop the first/last `km` of a GPS trace (closest to home/work). */
export function trimTrace(points, km = 0.3) {
  const P = (x) => ({ lat: x[0], lng: x[1] });
  let a = 0, d = 0;
  while (a < points.length - 1 && d < km) { d += haversineKm(P(points[a]), P(points[a + 1])); a++; }
  let b = points.length - 1; d = 0;
  while (b > a && d < km) { d += haversineKm(P(points[b]), P(points[b - 1])); b--; }
  return points.slice(a, b + 1);
}

/** Thin a trace so consecutive points are ≥ minKm apart (saves storage, removes jitter). */
export function simplifyTrace(points, minKm = 0.05) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || haversineKm({ lat: last[0], lng: last[1] }, { lat: p[0], lng: p[1] }) >= minKm) out.push(p);
  }
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

// -------------------------------------------------------- aggregation ---

/** Weighted median; drops outliers outside [0.5×, 2×] of the plain median. */
export function robustMedian(items) {
  if (!items.length) return null;
  const plain = [...items].sort((a, b) => a.v - b.v)[Math.floor(items.length / 2)].v;
  const kept = items.filter((x) => x.v >= plain * 0.5 && x.v <= plain * 2).sort((a, b) => a.v - b.v);
  const tot = kept.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of kept) { acc += x.w; if (acc > tot / 2) return x.v; }
  return kept[kept.length - 1]?.v ?? null;
}

const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const BETTER_THAN_COMMUNITY = new Set(Object.keys(SOURCE_TYPES).filter((k) => SOURCE_TYPES[k].rank < SOURCE_TYPES.community_verified.rank));

/**
 * Build the dataset the engines use: raw dataset + verified community data.
 * Pure; returns a new object (the routing graph cache keys on identity).
 */
export function applyCommunity(raw, now = new Date()) {
  const contribs = raw.contributions || [];
  const confs = raw.confirmations || [];
  const people = new Map((raw.contributors || []).map((c) => [c.id, c]));
  const byContrib = new Map();
  for (const f of confs) (byContrib.get(f.contributionId) || byContrib.set(f.contributionId, []).get(f.contributionId)).push(f);

  const evald = contribs.map((c) => ({ c, e: evaluate(c, byContrib.get(c.id) || [], people, now) }));
  const verified = evald.filter((x) => x.e.status === 'community_verified');
  const ds = {
    ...raw,
    lines: raw.lines.map((l) => ({ ...l })),
    stops: [...raw.stops],
    fareSchedules: raw.fareSchedules, // community schedules are prepended at the end (lookups are memoised per array)
    providers: (raw.providers || []).map((p) => ({ ...p })),
    tricycleZones: (raw.tricycleZones || []).map((z) => ({ ...z })),
    timeProfiles: { ...raw.timeProfiles, modes: Object.fromEntries(Object.entries(raw.timeProfiles.modes).map(([k, v]) => [k, { ...v }])) },
    loadingSpots: [],
    communitySummary: { verified: verified.length, pending: evald.filter((x) => x.e.status === 'pending').length, disputed: evald.filter((x) => x.e.status === 'disputed').length },
  };
  const lineById = new Map(ds.lines.map((l) => [l.id, l]));
  const derivedFares = [];
  const hasStrongSchedule = (scopeKey, id) => ds.fareSchedules.some((s) => s.scope?.[scopeKey] === id && s.active !== false && BETTER_THAN_COMMUNITY.has(s.sourceType));
  const groupBy = (xs, f) => xs.reduce((m, x) => { const k = f(x); if (k != null) (m.get(k) || m.set(k, []).get(k)).push(x); return m; }, new Map());
  const weightOf = (x) => Math.max(0.1, x.e.score);
  const stamp = (xs) => xs.map((x) => x.e.lastConfirmedAt).sort().pop();
  const day = (iso) => (iso ? iso.slice(0, 10) : null);

  // --- new routes (jeepney / UV / tricycle) ---
  for (const { c, e } of verified.filter((x) => x.c.type === 'new_route')) {
    const p = c.payload;
    const pts = p.points;
    const a = { id: `cr-${c.id}-a`, name: p.fromName || 'Route start', lat: pts[0][0], lng: pts[0][1], kind: 'community_stop', sourceType: 'community_verified', dataset: 'community' };
    const b = { id: `cr-${c.id}-b`, name: p.toName || 'Route end', lat: pts.at(-1)[0], lng: pts.at(-1)[1], kind: 'community_stop', sourceType: 'community_verified', dataset: 'community' };
    ds.stops.push(a, b);
    const line = {
      id: `cr-${c.id}`, code: p.code || `C-${c.id.slice(0, 4).toUpperCase()}`, name: p.name || `${a.name} – ${b.name}`, signboard: p.signboard,
      modeId: p.modeId, operatorId: null, stopIds: [a.id, b.id], shape: pts.map(([lat, lng]) => [lat, lng]), bidirectional: true, operational: true,
      verified: false, sourceType: 'community_verified', dataset: 'community', lastVerified: day(e.lastConfirmedAt), color: '#B45309',
      community: { status: e.status, riders: e.agreeing, lastConfirmedAt: e.lastConfirmedAt, contributionId: c.id },
    };
    ds.lines.push(line);
    lineById.set(line.id, line);
  }

  // --- route checks + traces on existing lines ---
  for (const [lineId, xs] of groupBy(evald.filter((x) => x.c.type === 'route_check' && x.c.lineId), (x) => x.c.lineId)) {
    const l = lineById.get(lineId);
    if (!l) continue;
    const yes = xs.filter((x) => x.c.payload?.accurate !== false && x.e.status !== 'rejected');
    const no = xs.filter((x) => x.c.payload?.accurate === false && x.e.status !== 'rejected');
    const riders = new Set(yes.map((x) => x.c.contributorId)).size;
    const weight = yes.reduce((s, x) => s + x.e.agreeW, 0);
    l.community = { ...(l.community || {}), riders, lastConfirmedAt: stamp(yes) || null, saysChanged: no.length };
    if (weight >= RULES.verifyScore && riders >= RULES.minAgreeing && !BETTER_THAN_COMMUNITY.has(l.sourceType)) {
      l.sourceType = 'community_verified';
      l.lastVerified = day(stamp(yes));
      l.community.status = 'community_verified';
    }
  }
  for (const { c } of verified.filter((x) => x.c.type === 'route_trace' && x.c.lineId)) {
    const l = lineById.get(c.lineId);
    if (l && !l.shapeSource) { l.shape = c.payload.points.map(([lat, lng]) => [lat, lng]); l.shapeSource = 'community'; }
  }

  // --- fares ---
  const fares = verified.filter((x) => x.c.type === 'fare' && (x.c.payload.passengerType || 'regular') === 'regular');
  // tricycle zones
  for (const [zoneId, xs] of groupBy(fares.filter((x) => x.c.zoneId), (x) => x.c.zoneId)) {
    if (hasStrongSchedule('zoneId', zoneId)) continue;
    const v = robustMedian(xs.map((x) => ({ v: x.c.payload.amount, w: weightOf(x) })));
    if (v == null) continue;
    derivedFares.push({
      id: `cf-zone-${zoneId}`, name: 'Rider-reported tricycle fare', scope: { zoneId }, kind: 'zone', params: { baseFare: v, rounding: 1 },
      effectiveFrom: day(stamp(xs)), active: true, sourceType: 'community_verified', dataset: 'community', lastVerified: day(stamp(xs)),
      riders: xs.length, sourceNote: `Median of ${xs.length} rider-verified fare report(s). Local fares may vary.`,
    });
    const z = ds.tricycleZones.find((zz) => zz.id === zoneId);
    if (z) z.community = { riders: xs.length, lastConfirmedAt: stamp(xs) };
  }
  // jeepney / UV lines: rider-reported minimum fare
  for (const [lineId, xs] of groupBy(fares.filter((x) => x.c.lineId), (x) => x.c.lineId)) {
    const l = lineById.get(lineId);
    if (!l || hasStrongSchedule('lineId', lineId)) continue;
    const base = findSchedule(ds.fareSchedules, { operatorId: l.operatorId, modeId: l.modeId }, now);
    if (!base || base.kind !== 'distance') continue;
    const minTrips = xs.filter((x) => x.c.payload.distanceKm == null || x.c.payload.distanceKm <= base.params.baseKm);
    const v = robustMedian(minTrips.map((x) => ({ v: x.c.payload.amount, w: weightOf(x) })));
    if (v == null) continue;
    derivedFares.push({
      ...base, id: `cf-line-${lineId}`, name: `Rider-reported fare – ${l.code}`, scope: { lineId }, params: { ...base.params, baseFare: v },
      effectiveFrom: day(stamp(xs)), sourceType: 'community_verified', dataset: 'community', lastVerified: day(stamp(xs)), riders: minTrips.length,
      sourceNote: `Minimum fare from ${minTrips.length} rider-verified report(s); per-km rate from ${base.name}.`,
    });
  }
  // taxis / ride-hailing / motorcycle taxis: calibrate indicative models with what riders actually paid
  const hail = fares.filter((x) => ['mc_taxi', 'ridehail_car', 'taxi'].includes(x.c.payload.modeId) && x.c.payload.distanceKm > 0);
  for (const [key, xs] of groupBy(hail, (x) => x.c.providerId || `mode:${x.c.payload.modeId}`)) {
    if (xs.length < 3) continue;
    const scope = key.startsWith('mode:') ? { modeId: key.slice(5) } : { providerId: key, modeId: xs[0].c.payload.modeId };
    const sched = findSchedule(ds.fareSchedules, scope, now);
    if (!sched || BETTER_THAN_COMMUNITY.has(sched.sourceType) || sched.kind === 'negotiated') continue;
    const ratios = xs.map((x) => {
      const est = calculateFare(sched, { distanceKm: x.c.payload.distanceKm, durationMin: x.c.payload.durationMin ?? x.c.payload.distanceKm * 3 });
      return est.available && est.min ? { v: x.c.payload.amount / est.min, w: weightOf(x) } : null;
    }).filter(Boolean);
    const r = robustMedian(ratios);
    if (!r) continue;
    const scaled = scaleParams(sched.kind, sched.params, r);
    derivedFares.push({
      ...sched, id: `cf-cal-${key}`, scope: scope.providerId ? { providerId: scope.providerId } : { modeId: scope.modeId }, params: scaled,
      sourceType: 'community_verified', dataset: 'community', lastVerified: day(stamp(xs)), riders: xs.length, calibration: round2(r),
      effectiveFrom: day(stamp(xs)),
      sourceNote: `Calibrated from ${xs.length} rider-verified fares (riders paid ${Math.round(r * 100)}% of the base estimate). Final fare is set by the provider.`,
    });
  }

  // --- wait / pickup times ---
  const waits = verified.filter((x) => x.c.type === 'wait');
  for (const [lineId, xs] of groupBy(waits.filter((x) => x.c.lineId), (x) => x.c.lineId)) {
    const l = lineById.get(lineId);
    if (!l || xs.length < 2) continue;
    const m = xs.map((x) => x.c.payload.minutes);
    l.communityWait = { min: quantile(m, 0.25), max: quantile(m, 0.75), riders: xs.length };
  }
  for (const [modeId, xs] of groupBy(waits.filter((x) => !x.c.lineId && x.c.payload.modeId), (x) => x.c.payload.modeId)) {
    if (xs.length < 2 || !ds.timeProfiles.modes[modeId]) continue;
    const m = xs.map((x) => x.c.payload.minutes);
    ds.timeProfiles.modes[modeId].pickupMin = [quantile(m, 0.25), quantile(m, 0.75)];
    ds.timeProfiles.modes[modeId].pickupSource = `community (${xs.length} riders)`;
  }

  // --- last trips, route changes, loading spots ---
  for (const [lineId, xs] of groupBy(verified.filter((x) => x.c.type === 'last_trip' && x.c.lineId), (x) => x.c.lineId)) {
    const l = lineById.get(lineId);
    const times = xs.map((x) => hm(x.c.payload.time)).sort((a, b) => a - b);
    const t = times[Math.floor(times.length / 2)];
    if (l) l.communityLastTrip = { time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, riders: xs.length };
  }
  for (const { c, e } of verified.filter((x) => x.c.type === 'route_change' && x.c.lineId)) {
    const l = lineById.get(c.lineId);
    if (l) (l.communityNotes ||= []).push({ text: c.payload.description, riders: e.agreeing, at: e.lastConfirmedAt });
  }
  for (const { c, e } of verified.filter((x) => x.c.type === 'loading_spot')) {
    ds.loadingSpots.push({ id: c.id, name: c.payload.name, lat: c.payload.lat, lng: c.payload.lng, lineIds: c.lineId ? [c.lineId] : [], riders: e.agreeing, status: 'community_verified' });
  }
  ds.fareSchedules = [...derivedFares, ...raw.fareSchedules];
  return ds;
}

function scaleParams(kind, p, r) {
  const s = (v) => (v == null ? v : Math.round(v * r * 100) / 100);
  if (kind === 'tnvs') return { ...p, base: s(p.base), perKm: s(p.perKm), perMin: s(p.perMin), minFare: s(p.minFare) };
  if (kind === 'meter') return { ...p, flagDown: s(p.flagDown), perKm: s(p.perKm), perMin: s(p.perMin) };
  if (kind === 'tiered') return { ...p, tiers: p.tiers.map((t) => ({ ...t, flat: s(t.flat), perKm: s(t.perKm) })) };
  return p;
}

/** Human question used for peer validation prompts. */
export function questionFor(c, ds) {
  const line = c.lineId ? ds.lines.find((l) => l.id === c.lineId) : null;
  const zone = c.zoneId ? (ds.tricycleZones || []).find((z) => z.id === c.zoneId) : null;
  const prov = c.providerId ? (ds.providers || []).find((p) => p.id === c.providerId) : null;
  const what = line ? `${line.signboard || line.name}` : zone ? `tricycles in ${zone.name}` : prov ? prov.name : c.payload.modeId || 'this service';
  const p = c.payload || {};
  switch (c.type) {
    case 'fare': return `Is the fare ₱${p.amount} for ${what}${p.distanceKm ? ` (about ${p.distanceKm} km)` : ''}?`;
    case 'wait': return `Did you wait about ${p.minutes} min for ${what}?`;
    case 'route_check': return `Is the ${what} route still accurate?`;
    case 'route_trace': return `Does ${what} follow this path?`;
    case 'new_route': return `Is there a ${p.modeId === 'uv' ? 'UV Express' : p.modeId} with signboard “${p.signboard}” between ${p.fromName || 'start'} and ${p.toName || 'end'}?`;
    case 'loading_spot': return `Do ${what} load passengers at ${p.name}?`;
    case 'route_change': return `${what}: “${p.description}” – is this true?`;
    case 'last_trip': return `Is the last ${what} trip around ${p.time}?`;
    default: return 'Is this accurate?';
  }
}

/** Contributor stats + badges from raw records. */
export function contributorProfile(c, raw, now = new Date()) {
  const mine = (raw.contributions || []).filter((x) => x.contributorId === c.id);
  const people = new Map((raw.contributors || []).map((p) => [p.id, p]));
  const byContrib = new Map();
  for (const f of raw.confirmations || []) (byContrib.get(f.contributionId) || byContrib.set(f.contributionId, []).get(f.contributionId)).push(f);
  const verifiedByType = {};
  let verifiedTricycle = 0;
  const items = mine.map((x) => {
    const e = evaluate(x, byContrib.get(x.id) || [], people, now);
    if (e.status === 'community_verified') { verifiedByType[x.type] = (verifiedByType[x.type] || 0) + 1; if (x.payload?.modeId === 'tricycle' && x.type === 'fare') verifiedTricycle++; }
    return { id: x.id, type: x.type, createdAt: x.createdAt, lineId: x.lineId, question: questionFor(x, raw), ...e };
  });
  const stats = { submitted: mine.length, confirmations: (raw.confirmations || []).filter((f) => f.contributorId === c.id).length, verifiedByType, verifiedTricycle, reputation: c.reputation || 0 };
  return {
    id: c.id, displayName: c.displayName, points: c.points || 0, reputation: c.reputation || 0, weight: contributorWeight(c), suspended: !!c.suspended,
    level: levelFor(c.points || 0), badges: BADGES.map((b) => ({ id: b.id, name: b.name, icon: b.icon, desc: b.desc, earned: b.test(stats) })),
    stats, contributions: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  };
}

export function lastTripPassed(line, date) {
  if (!line.communityLastTrip) return false;
  const m = manilaMinutes(date), t = hm(line.communityLastTrip.time);
  return t > 5 * 60 ? m > t || m < 5 * 60 : m > t && m < 5 * 60; // after the last trip, before ~5 AM
}
