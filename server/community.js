// Community / contributor API.
// Identity: with Supabase configured, contributors are signed-in users (JWT
// verified server-side). Without it (local dev / guest demo) the device id is
// used – convenient but NOT abuse-resistant; production must configure auth.

import { randomUUID } from 'node:crypto';
import { httpError } from './repo.js';
import {
  CONTRIB_TYPES, COMMUNITY_MODES, RULES, REWARDS, evaluate, plausibility, trimTrace, simplifyTrace,
  questionFor, contributorProfile, levelFor, contributorWeight,
} from '../core/community.js';
import { haversineKm } from '../core/geo.js';
import { linesPassing } from '../core/router.js';

const DAILY_LIMIT = 30, PROBATION_DAILY_LIMIT = 10, DUP_WINDOW_MS = 6 * 3600000;
const tokenCache = new Map();

export function registerCommunity(on, { repo, engineDs, rateLimit, body, str, num, adminFor }) {
  const raw = () => repo.dataset();
  const people = () => new Map(raw().contributors.map((c) => [c.id, c]));

  async function identify(req, b = {}) {
    const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon } = process.env;
    let id, name = str(b.displayName, 40);
    if (url && anon) {
      const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!tok) throw httpError(401, 'Sign in to contribute');
      let hit = tokenCache.get(tok);
      if (!hit || hit.exp < Date.now()) {
        const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${tok}` } });
        if (!r.ok) throw httpError(401, 'Session expired – sign in again');
        const u = await r.json();
        hit = { id: u.id, name: u.user_metadata?.full_name, exp: Date.now() + 300000 };
        tokenCache.set(tok, hit);
      }
      id = hit.id; name ||= hit.name;
    } else {
      id = str(b.contributorId ?? req.headers['x-contributor-id'], 80);
      if (!id || id.length < 8) throw httpError(400, 'contributorId required');
    }
    const ds = raw();
    let c = ds.contributors.find((x) => x.id === id);
    if (!c) { c = { id, displayName: name || `Rider-${id.slice(0, 4)}`, points: 0, reputation: 0, stats: { accepted: 0 }, createdAt: new Date().toISOString() }; ds.contributors.push(c); }
    else if (name && name !== c.displayName) c.displayName = name;
    if (c.suspended) throw httpError(403, 'Your contributor account is suspended.');
    return c;
  }

  function award(c, points, reason, rep = 0) {
    if (!c) return;
    c.points = Math.max(0, (c.points || 0) + points);
    c.reputation = (c.reputation || 0) + rep;
    if (points) raw().pointsEvents.push({ contributorId: c.id, points, reason, at: new Date().toISOString() });
    if (raw().pointsEvents.length > 50000) raw().pointsEvents.splice(0, 10000);
  }

  /** Re-evaluate a contribution and pay out rewards exactly once per outcome. */
  function settle(c) {
    const ds = raw();
    const confs = ds.confirmations.filter((f) => f.contributionId === c.id);
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

  function createContribution(contributor, b) {
    const ds = engineDs();
    const type = String(b.type || '');
    if (!CONTRIB_TYPES[type]) throw httpError(400, 'Unknown contribution type');
    const line = b.lineId ? ds.lines.find((l) => l.id === b.lineId) : null;
    if (b.lineId && !line) throw httpError(400, 'Unknown route');
    const zone = b.zoneId ? ds.tricycleZones.find((z) => z.id === b.zoneId) : null;
    if (b.zoneId && !zone) throw httpError(400, 'Unknown tricycle zone');
    const prov = b.providerId ? ds.providers.find((p) => p.id === b.providerId) : null;
    if (b.providerId && !prov) throw httpError(400, 'Unknown provider');
    const modeId = line?.modeId || (zone ? 'tricycle' : prov?.modeId) || str(b.modeId, 30) || b.payload?.modeId;
    if (!COMMUNITY_MODES.includes(modeId)) throw httpError(400, 'Trains, terminal buses, P2P and ferries use official schedules – community reports are for jeepneys, UV Express, tricycles, taxis and ride-hailing.');
    const p = { ...(b.payload || {}), modeId };
    for (const k of ['amount', 'distanceKm', 'durationMin', 'minutes', 'lat', 'lng']) if (p[k] != null) p[k] = num(p[k], k);
    if (b.lat != null) { p.lat ??= num(b.lat, 'lat'); p.lng ??= num(b.lng, 'lng'); }
    for (const k of ['description', 'name', 'signboard', 'fromName', 'toName', 'time', 'code', 'passengerType']) if (p[k] != null) p[k] = str(p[k], k === 'description' ? 500 : 80);
    if (type === 'route_trace' || type === 'new_route') {
      if (!Array.isArray(p.points)) throw httpError(400, 'points required');
      const pts = p.points.slice(0, 5000).map((x) => [num(x[0], 'lat'), num(x[1], 'lng'), x[2] ? num(x[2], 't') : undefined]);
      // The app trims 300 m from each end on the device (so home/work never leave the phone) and says so.
      // Anything else (other clients, old versions) is trimmed here.
      p.points = simplifyTrace(b.payload?.endsTrimmed === true ? pts : trimTrace(pts), 0.04);
      delete p.endsTrimmed;
    }
    if (type === 'route_check') p.accurate = b.payload?.accurate !== false;
    const errs = plausibility(type, p);
    if (errs.length) throw httpError(400, errs.join('. '));

    const now = Date.now();
    const mine = raw().contributions.filter((x) => x.contributorId === contributor.id);
    const today = mine.filter((x) => now - new Date(x.createdAt) < 86400000).length;
    const cap = (contributor.stats?.accepted || 0) < RULES.probationAccepted ? PROBATION_DAILY_LIMIT : DAILY_LIMIT;
    if (today >= cap) throw httpError(429, `Daily contribution limit reached (${cap}). Salamat! Try again tomorrow.`);
    if (mine.some((x) => x.type === type && x.lineId == (line?.id ?? null) && x.zoneId == (zone?.id ?? null) && x.providerId == (prov?.id ?? null) && now - new Date(x.createdAt) < DUP_WINDOW_MS && type !== 'loading_spot'))
      throw httpError(409, 'You already reported this recently. Other riders will be asked to confirm it.');

    const round = (v) => (v == null ? null : Math.round(v * 1e4) / 1e4); // ~11 m precision is enough
    const rec = {
      id: randomUUID(), type, contributorId: contributor.id, modeId, lineId: line?.id ?? null, zoneId: zone?.id ?? null, providerId: prov?.id ?? null,
      lat: round(p.lat), lng: round(p.lng), payload: p, createdAt: new Date().toISOString(), status: 'pending',
    };
    if (p.lat != null) { p.lat = rec.lat; p.lng = rec.lng; }
    raw().contributions.push(rec);
    award(contributor, CONTRIB_TYPES[type].points, `submitted ${type}`);
    contributor.stats = { ...(contributor.stats || {}), submitted: (contributor.stats?.submitted || 0) + 1 };
    const e = settle(rec);
    repo.touch();
    return { ...rec, ...e, question: questionFor(rec, ds), pointsEarned: CONTRIB_TYPES[type].points };
  }

  on('POST', '/api/community/contributions', async ({ req }) => {
    rateLimit(req, 3, 60);
    const b = await body(req, 2_000_000);
    const c = await identify(req, b);
    return createContribution(c, b);
  });

  on('POST', '/api/community/contributions/:id/confirm', async ({ req, params }) => {
    rateLimit(req, 1, 120);
    const b = await body(req);
    const me = await identify(req, b);
    const agree = b.agree === true || b.agree === 'true';
    // synthetic "is this route still accurate?" prompt
    if (params.id.startsWith('line:')) {
      const out = createContribution(me, { type: 'route_check', lineId: params.id.slice(5), payload: { accurate: agree }, lat: b.lat, lng: b.lng });
      return { ok: true, pointsEarned: out.pointsEarned, status: out.status };
    }
    const c = raw().contributions.find((x) => x.id === params.id);
    if (!c) throw httpError(404, 'Report not found');
    if (c.contributorId === me.id) throw httpError(403, "You can't confirm your own report");
    if (raw().confirmations.some((f) => f.contributionId === c.id && f.contributorId === me.id)) throw httpError(409, 'You already answered this one');
    const near = b.lat != null && c.lat != null ? haversineKm({ lat: num(b.lat, 'lat'), lng: num(b.lng, 'lng') }, c) <= RULES.nearbyKm : undefined;
    raw().confirmations.push({ id: randomUUID(), contributionId: c.id, contributorId: me.id, agree, near, at: new Date().toISOString() });
    award(me, REWARDS.confirm, 'confirmation');
    let counter = null;
    // "No, it's ₱15" → the correction becomes the rider's own report for others to confirm
    if (!agree && c.type === 'fare' && b.value != null) {
      try { counter = createContribution(me, { type: 'fare', lineId: c.lineId, zoneId: c.zoneId, providerId: c.providerId, modeId: c.modeId, payload: { amount: b.value, distanceKm: c.payload.distanceKm }, lat: b.lat, lng: b.lng }); } catch { /* duplicate or implausible: ignore */ }
    }
    const e = settle(c);
    repo.touch();
    return { ok: true, status: e.status, agreeing: e.agreeing, disagreeing: e.disagreeing, pointsEarned: REWARDS.confirm + (counter?.pointsEarned || 0), counterReportId: counter?.id ?? null };
  });

  on('GET', '/api/community/verify', async ({ req, q }) => {
    const me = await identify(req, { contributorId: q.contributorId });
    const ds = engineDs();
    const here = q.lat != null && q.lat !== '' ? { lat: num(q.lat, 'lat'), lng: num(q.lng, 'lng') } : null;
    const answered = new Set(raw().confirmations.filter((f) => f.contributorId === me.id).map((f) => f.contributionId));
    const who = people();
    const items = raw().contributions
      // route checks are votes on a route (aggregated into "N riders"), not claims needing confirmation
      .filter((c) => c.type !== 'route_check' && c.contributorId !== me.id && !answered.has(c.id))
      .map((c) => ({ c, e: evaluate(c, raw().confirmations.filter((f) => f.contributionId === c.id), who) }))
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
  });

  on('GET', '/api/community/me', async ({ req, q }) => {
    const me = await identify(req, { contributorId: q.contributorId, displayName: q.displayName });
    const lb = leaderboard('all');
    return { ...contributorProfile(me, raw()), rank: lb.findIndex((r) => r.id === me.id) + 1 || null, pointsRules: Object.fromEntries(Object.entries(CONTRIB_TYPES).map(([k, v]) => [k, v.points])) };
  });

  function leaderboard(period) {
    const since = period === 'week' ? Date.now() - 7 * 86400000 : period === 'month' ? Date.now() - 30 * 86400000 : 0;
    const sums = new Map();
    for (const e of raw().pointsEvents) if (new Date(e.at) >= since) sums.set(e.contributorId, (sums.get(e.contributorId) || 0) + e.points);
    const who = people();
    return [...sums].filter(([id]) => who.get(id) && !who.get(id).suspended).sort((a, b) => b[1] - a[1]).map(([id, points]) => {
      const c = who.get(id);
      return { id, displayName: c.displayName, points, totalPoints: c.points, level: levelFor(c.points || 0).name, levelIcon: levelFor(c.points || 0).icon, reputation: c.reputation };
    });
  }
  on('GET', '/api/community/leaderboard', ({ q }) => {
    const rows = leaderboard(['week', 'month', 'all'].includes(q.period) ? q.period : 'week');
    const mine = q.contributorId ? rows.findIndex((r) => r.id === q.contributorId) : -1;
    return { rows: rows.slice(0, 25).map(({ id, ...r }, i) => ({ rank: i + 1, ...r, isMe: id === q.contributorId })), myRank: mine >= 0 ? mine + 1 : null };
  });

  on('GET', '/api/community/line/:id', ({ params }) => {
    const ds = engineDs();
    const l = ds.lines.find((x) => x.id === params.id);
    if (!l) throw httpError(404, 'Unknown route');
    const sched = ds.fareSchedules.find((s) => s.scope?.lineId === l.id && s.sourceType === 'community_verified');
    const who = people();
    const pending = raw().contributions.filter((c) => c.lineId === l.id).map((c) => ({ c, e: evaluate(c, raw().confirmations.filter((f) => f.contributionId === c.id), who) }));
    return {
      communityDriven: !!ds.modes.find((m) => m.id === l.modeId)?.communityDriven,
      community: l.community || null, wait: l.communityWait || null, lastTrip: l.communityLastTrip || null, notes: l.communityNotes || [],
      fare: sched ? { baseFare: sched.params.baseFare, riders: sched.riders, lastVerified: sched.lastVerified } : null,
      loadingSpots: ds.loadingSpots.filter((s) => s.lineIds.includes(l.id)),
      openReports: pending.filter((x) => ['pending', 'disputed'].includes(x.e.status)).length,
      verifiedReports: pending.filter((x) => x.e.status === 'community_verified').length,
    };
  });

  // ------------------------------------------------------------ admin ---
  on('GET', '/api/admin/community/contributions', ({ req }) => {
    adminFor(req, 'read');
    const who = people();
    const ds = engineDs();
    const order = { disputed: 0, needs_reconfirmation: 1, pending: 2, community_verified: 3, rejected: 4 };
    return raw().contributions.filter((c) => c.type !== 'route_check' || c.payload?.accurate === false).map((c) => {
      const e = evaluate(c, raw().confirmations.filter((f) => f.contributionId === c.id), who);
      const p = who.get(c.contributorId);
      return { ...c, payload: { ...c.payload, points: c.payload.points ? `${c.payload.points.length} GPS points` : undefined }, ...e, question: questionFor(c, ds), contributor: p ? { name: p.displayName, reputation: p.reputation, weight: contributorWeight(p), suspended: !!p.suspended } : null };
    }).sort((a, b) => order[a.status] - order[b.status] || new Date(b.createdAt) - new Date(a.createdAt));
  });
  on('POST', '/api/admin/community/contributions/:id/moderate', async ({ req, params }) => {
    const actor = adminFor(req, 'moderate');
    const b = await body(req);
    const c = raw().contributions.find((x) => x.id === params.id);
    if (!c) throw httpError(404, 'Not found');
    if (![null, 'community_verified', 'rejected'].includes(b.status ?? null)) throw httpError(400, 'status must be community_verified, rejected or null (let riders decide)');
    const before = { ...c };
    c.moderation = b.status ? { status: b.status, by: actor.name, note: str(b.note, 300), at: new Date().toISOString() } : null;
    const e = settle(c);
    repo.audit(actor, 'moderate', 'contributions', c.id, before, { ...c });
    repo.touch();
    return { id: c.id, ...e };
  });
  on('GET', '/api/admin/community/contributors', ({ req }) => {
    adminFor(req, 'read');
    return raw().contributors.map((c) => ({ ...c, weight: contributorWeight(c), level: levelFor(c.points || 0).name, submitted: raw().contributions.filter((x) => x.contributorId === c.id).length }))
      .sort((a, b) => (b.points || 0) - (a.points || 0));
  });
  on('POST', '/api/admin/community/contributors/:id', async ({ req, params }) => {
    const actor = adminFor(req, 'moderate');
    const b = await body(req);
    const c = raw().contributors.find((x) => x.id === params.id);
    if (!c) throw httpError(404, 'Not found');
    const before = { ...c };
    if (b.suspended != null) c.suspended = !!b.suspended;
    if (b.reputationDelta != null) c.reputation = (c.reputation || 0) + Math.max(-100, Math.min(100, num(b.reputationDelta, 'reputationDelta')));
    repo.audit(actor, 'update', 'contributors', c.id, before, { ...c });
    repo.touch();
    return c;
  });
}
