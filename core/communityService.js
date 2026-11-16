// Community service: the rules for contributing, confirming, rewarding and
// reading community data. Isomorphic: the Node server wraps it with HTTP,
// sign-in and rate limits; the standalone (static) build runs it in the browser.
//
//   raw()      → the raw dataset (contributions, confirmations, contributors, pointsEvents …)
//   engineDs() → raw + verified community data (applyCommunity), used for lookups
//   touch()    → persist after a change

import {
  CONTRIB_TYPES, COMMUNITY_MODES, RULES, REWARDS, evaluate, plausibility, trimTrace, simplifyTrace,
  questionFor, contributorProfile, levelFor,
} from './community.js';
import { haversineKm } from './geo.js';
import { linesPassing } from './router.js';

export const LIMITS = { daily: 30, probationDaily: 10, duplicateWindowMs: 6 * 3600000 };

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new ApiError(status, msg); };
const uuid = () => globalThis.crypto.randomUUID();
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) fail(400, `${name} must be a number`); return n; };
const str = (v, max = 2000) => (v == null ? null : String(v).slice(0, max));

export function createCommunityService({ raw, engineDs, touch = () => {} }) {
  const people = () => new Map(raw().contributors.map((c) => [c.id, c]));
  const confsOf = (id) => raw().confirmations.filter((f) => f.contributionId === id);

  function ensureContributor(id, displayName) {
    if (!id || String(id).length < 8) fail(400, 'contributorId required');
    const ds = raw();
    const name = str(displayName, 40);
    let c = ds.contributors.find((x) => x.id === id);
    if (!c) { c = { id, displayName: name || `Rider-${String(id).slice(0, 4)}`, points: 0, reputation: 0, stats: { accepted: 0 }, createdAt: new Date().toISOString() }; ds.contributors.push(c); }
    else if (name && name !== c.displayName) c.displayName = name;
    if (c.suspended) fail(403, 'Your contributor account is suspended.');
    return c;
  }

  function award(c, points, reason, rep = 0) {
    if (!c) return;
    c.points = Math.max(0, (c.points || 0) + points);
    c.reputation = (c.reputation || 0) + rep;
    const ev = raw().pointsEvents;
    if (points) ev.push({ contributorId: c.id, points, reason, at: new Date().toISOString() });
    if (ev.length > 50000) ev.splice(0, 10000);
  }

  /** Re-evaluate a contribution and pay out rewards exactly once per outcome. */
  function settle(c) {
    const confs = confsOf(c.id);
    const who = people();
    const e = evaluate(c, confs, who);
    c.status = e.status;
    if (e.status === 'community_verified' && c.rewarded !== 'verified') {
      const sub = who.get(c.contributorId);
      award(sub, REWARDS.verifiedBonus, `verified ${c.type}`, REWARDS.verifiedRep);
      if (sub) sub.stats = { ...(sub.stats || {}), accepted: (sub.stats?.accepted || 0) + 1 };
      for (const f of confs) award(who.get(f.contributorId), f.agree ? 2 : 0, 'confirmed correctly', f.agree ? REWARDS.confirmerRep : REWARDS.wrongConfirmRep);
      c.rewarded = 'verified'; c.everVerified = true;
    } else if (e.status === 'rejected' && c.rewarded !== 'rejected') {
      award(who.get(c.contributorId), 0, 'rejected', REWARDS.rejectedRep);
      for (const f of confs) award(who.get(f.contributorId), f.agree ? 0 : 2, 'disputed correctly', f.agree ? REWARDS.wrongConfirmRep : REWARDS.rightDisputeRep);
      c.rewarded = 'rejected';
    }
    return e;
  }

  function contribute(contributor, b) {
    const ds = engineDs();
    const type = String(b.type || '');
    if (!CONTRIB_TYPES[type]) fail(400, 'Unknown contribution type');
    const line = b.lineId ? ds.lines.find((l) => l.id === b.lineId) : null;
    if (b.lineId && !line) fail(400, 'Unknown route');
    const zone = b.zoneId ? ds.tricycleZones.find((z) => z.id === b.zoneId) : null;
    if (b.zoneId && !zone) fail(400, 'Unknown tricycle zone');
    const prov = b.providerId ? ds.providers.find((p) => p.id === b.providerId) : null;
    if (b.providerId && !prov) fail(400, 'Unknown provider');
    const modeId = line?.modeId || (zone ? 'tricycle' : prov?.modeId) || str(b.modeId, 30) || b.payload?.modeId;
    if (!COMMUNITY_MODES.includes(modeId)) fail(400, 'Trains, terminal buses, P2P and ferries use official schedules – community reports are for jeepneys, UV Express, tricycles, taxis and ride-hailing.');
    const p = { ...(b.payload || {}), modeId };
    for (const k of ['amount', 'distanceKm', 'durationMin', 'minutes', 'lat', 'lng']) if (p[k] != null) p[k] = num(p[k], k);
    if (b.lat != null) { p.lat ??= num(b.lat, 'lat'); p.lng ??= num(b.lng, 'lng'); }
    for (const k of ['description', 'name', 'signboard', 'fromName', 'toName', 'time', 'code', 'passengerType']) if (p[k] != null) p[k] = str(p[k], k === 'description' ? 500 : 80);
    if (type === 'route_trace' || type === 'new_route') {
      if (!Array.isArray(p.points)) fail(400, 'points required');
      const pts = p.points.slice(0, 5000).map((x) => [num(x[0], 'lat'), num(x[1], 'lng'), x[2] ? num(x[2], 't') : undefined]);
      // The app trims 300 m from each end on the device (so home/work never leave the phone) and says so.
      // Anything else (other clients, old versions) is trimmed here.
      p.points = simplifyTrace(b.payload?.endsTrimmed === true ? pts : trimTrace(pts), 0.04);
      delete p.endsTrimmed;
    }
    if (type === 'route_check') p.accurate = b.payload?.accurate !== false;
    const errs = plausibility(type, p);
    if (errs.length) fail(400, errs.join('. '));

    const now = Date.now();
    const mine = raw().contributions.filter((x) => x.contributorId === contributor.id);
    const today = mine.filter((x) => now - new Date(x.createdAt) < 86400000).length;
    const cap = (contributor.stats?.accepted || 0) < RULES.probationAccepted ? LIMITS.probationDaily : LIMITS.daily;
    if (today >= cap) fail(429, `Daily contribution limit reached (${cap}). Salamat! Try again tomorrow.`);
    if (type !== 'loading_spot' && mine.some((x) => x.type === type && x.lineId == (line?.id ?? null) && x.zoneId == (zone?.id ?? null) && x.providerId == (prov?.id ?? null) && now - new Date(x.createdAt) < LIMITS.duplicateWindowMs))
      fail(409, 'You already reported this recently. Other riders will be asked to confirm it.');

    const round = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4); // ~11 m precision is enough
    const rec = {
      id: uuid(), type, contributorId: contributor.id, modeId, lineId: line?.id ?? null, zoneId: zone?.id ?? null, providerId: prov?.id ?? null,
      lat: round(p.lat), lng: round(p.lng), payload: p, createdAt: new Date().toISOString(), status: 'pending',
    };
    if (p.lat != null) { p.lat = rec.lat; p.lng = rec.lng; }
    raw().contributions.push(rec);
    award(contributor, CONTRIB_TYPES[type].points, `submitted ${type}`);
    contributor.stats = { ...(contributor.stats || {}), submitted: (contributor.stats?.submitted || 0) + 1 };
    const e = settle(rec);
    touch();
    return { ...rec, ...e, question: questionFor(rec, ds), pointsEarned: CONTRIB_TYPES[type].points };
  }

  function confirm(me, id, b = {}) {
    const agree = b.agree === true || b.agree === 'true';
    // synthetic "is this route still accurate?" prompt
    if (id.startsWith('line:')) {
      const out = contribute(me, { type: 'route_check', lineId: id.slice(5), payload: { accurate: agree }, lat: b.lat, lng: b.lng });
      return { ok: true, pointsEarned: out.pointsEarned, status: out.status };
    }
    const c = raw().contributions.find((x) => x.id === id);
    if (!c) fail(404, 'Report not found');
    if (c.contributorId === me.id) fail(403, "You can't confirm your own report");
    if (confsOf(c.id).some((f) => f.contributorId === me.id)) fail(409, 'You already answered this one');
    const near = b.lat != null && c.lat != null ? haversineKm({ lat: num(b.lat, 'lat'), lng: num(b.lng, 'lng') }, c) <= RULES.nearbyKm : undefined;
    raw().confirmations.push({ id: uuid(), contributionId: c.id, contributorId: me.id, agree, near, at: new Date().toISOString() });
    award(me, REWARDS.confirm, 'confirmation');
    let counter = null;
    // "No, it's ₱15" → the correction becomes the rider's own report for others to confirm
    if (!agree && c.type === 'fare' && b.value != null) {
      try { counter = contribute(me, { type: 'fare', lineId: c.lineId, zoneId: c.zoneId, providerId: c.providerId, modeId: c.modeId, payload: { amount: b.value, distanceKm: c.payload.distanceKm }, lat: b.lat, lng: b.lng }); } catch { /* duplicate or implausible: ignore */ }
    }
    const e = settle(c);
    touch();
    return { ok: true, status: e.status, agreeing: e.agreeing, disagreeing: e.disagreeing, pointsEarned: REWARDS.confirm + (counter?.pointsEarned || 0), counterReportId: counter?.id ?? null };
  }

  function verifyFeed(me, here) {
    const ds = engineDs();
    const answered = new Set(raw().confirmations.filter((f) => f.contributorId === me.id).map((f) => f.contributionId));
    const who = people();
    const items = raw().contributions
      // route checks are votes on a route (aggregated into "N riders"), not claims needing confirmation
      .filter((c) => c.type !== 'route_check' && c.contributorId !== me.id && !answered.has(c.id))
      .map((c) => ({ c, e: evaluate(c, confsOf(c.id), who) }))
      .filter(({ e }) => ['pending', 'disputed', 'needs_reconfirmation'].includes(e.status))
      .map(({ c, e }) => ({ c, e, km: here && c.lat != null ? haversineKm(here, c) : null }))
      .filter((x) => x.km == null || x.km <= 15)
      .sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || new Date(b.c.createdAt) - new Date(a.c.createdAt))
      .slice(0, 15)
      .map(({ c, e, km }) => {
        const line = c.lineId ? ds.lines.find((l) => l.id === c.lineId) : null;
        return { id: c.id, type: c.type, question: questionFor(c, ds), status: e.status, agreeing: e.agreeing, disagreeing: e.disagreeing, km, modeId: c.modeId,
          lineCode: line?.code ?? null, lat: c.lat, lng: c.lng, points: c.payload.points?.map(([a, b]) => [a, b]) ?? null, allowValue: c.type === 'fare', createdAt: c.createdAt };
      });
    // "still accurate?" prompts for nearby community-driven routes not checked by me in 30 days
    if (here) {
      const recent = new Set(raw().contributions.filter((c) => c.contributorId === me.id && c.type === 'route_check' && Date.now() - new Date(c.createdAt) < 30 * 86400000).map((c) => c.lineId));
      for (const { line, km } of linesPassing(ds, here, 1).slice(0, 5)) {
        if (!ds.modes.find((m) => m.id === line.modeId)?.communityDriven || recent.has(line.id)) continue;
        items.push({ id: 'line:' + line.id, type: 'route_check', question: `Does the ${line.signboard || line.name} ${line.modeId === 'uv' ? 'UV Express' : line.modeId} still pass near you?`, status: line.community?.status || 'pending', agreeing: line.community?.riders || 0, km, modeId: line.modeId, lineCode: line.code });
      }
    }
    return items;
  }

  function ranking(period) {
    const since = period === 'week' ? Date.now() - 7 * 86400000 : period === 'month' ? Date.now() - 30 * 86400000 : 0;
    const sums = new Map();
    for (const e of raw().pointsEvents) if (new Date(e.at) >= since) sums.set(e.contributorId, (sums.get(e.contributorId) || 0) + e.points);
    const who = people();
    return [...sums].filter(([id]) => who.get(id) && !who.get(id).suspended).sort((a, b) => b[1] - a[1]).map(([id, points]) => {
      const c = who.get(id);
      return { id, displayName: c.displayName, points, totalPoints: c.points, level: levelFor(c.points || 0).name, levelIcon: levelFor(c.points || 0).icon, reputation: c.reputation };
    });
  }

  function profile(me) {
    const lb = ranking('all');
    return { ...contributorProfile(me, raw()), rank: lb.findIndex((r) => r.id === me.id) + 1 || null, pointsRules: Object.fromEntries(Object.entries(CONTRIB_TYPES).map(([k, v]) => [k, v.points])) };
  }

  function leaderboard(period, myId) {
    const rows = ranking(['week', 'month', 'all'].includes(period) ? period : 'week');
    const mine = myId ? rows.findIndex((r) => r.id === myId) : -1;
    return { rows: rows.slice(0, 25).map(({ id, ...r }, i) => ({ rank: i + 1, ...r, isMe: id === myId })), myRank: mine >= 0 ? mine + 1 : null };
  }

  function lineInfo(lineId) {
    const ds = engineDs();
    const l = ds.lines.find((x) => x.id === lineId);
    if (!l) fail(404, 'Unknown route');
    const sched = ds.fareSchedules.find((s) => s.scope?.lineId === l.id && s.sourceType === 'community_verified');
    const who = people();
    const reports = raw().contributions.filter((c) => c.lineId === l.id).map((c) => ({ c, e: evaluate(c, confsOf(c.id), who) }));
    return {
      communityDriven: !!ds.modes.find((m) => m.id === l.modeId)?.communityDriven,
      community: l.community || null, wait: l.communityWait || null, lastTrip: l.communityLastTrip || null, notes: l.communityNotes || [],
      fare: sched ? { baseFare: sched.params.baseFare, riders: sched.riders, lastVerified: sched.lastVerified } : null,
      loadingSpots: ds.loadingSpots.filter((s) => s.lineIds.includes(l.id)),
      openReports: reports.filter((x) => ['pending', 'disputed'].includes(x.e.status)).length,
      verifiedReports: reports.filter((x) => x.e.status === 'community_verified').length,
    };
  }

  return { ensureContributor, award, settle, contribute, confirm, verifyFeed, profile, leaderboard, lineInfo, people };
}
