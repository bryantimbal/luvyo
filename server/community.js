// Community / contributor API.
// Identity: with Supabase configured, contributors are signed-in users (JWT
// verified server-side). Without it (local dev / guest demo) the device id is
// used – convenient but NOT abuse-resistant; production must configure auth.

import { httpError } from './repo.js';
import { evaluate, questionFor, levelFor, contributorWeight } from '../core/community.js';
import { createCommunityService } from '../core/communityService.js';

const tokenCache = new Map();

export function registerCommunity(on, { repo, engineDs, rateLimit, body, str, num, adminFor }) {
  const raw = () => repo.dataset();
  const svc = createCommunityService({ raw, engineDs, touch: () => repo.touch(), changed: (c, r) => repo.changed?.(c, r) });
  const people = () => svc.people();
  const settle = (c) => svc.settle(c);

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
    } else if (repo.requiresAuth) {
      // With a database, contributors must be real signed-in users (anti-abuse).
      throw httpError(503, 'Contributions need sign-in, which is not configured on this server yet.');
    } else {
      id = str(b.contributorId ?? req.headers['x-contributor-id'], 80); // local/demo only
    }
    return svc.ensureContributor(id, name);
  }

  on('POST', '/api/community/contributions', async ({ req }) => {
    rateLimit(req, 3, 60);
    const b = await body(req, 2_000_000);
    return svc.contribute(await identify(req, b), b);
  });
  on('POST', '/api/community/contributions/:id/confirm', async ({ req, params }) => {
    rateLimit(req, 1, 120);
    const b = await body(req);
    return svc.confirm(await identify(req, b), params.id, b);
  });
  on('GET', '/api/community/verify', async ({ req, q }) => {
    const me = await identify(req, { contributorId: q.contributorId });
    const here = q.lat != null && q.lat !== '' ? { lat: num(q.lat, 'lat'), lng: num(q.lng, 'lng') } : null;
    return svc.verifyFeed(me, here);
  });
  on('GET', '/api/community/me', async ({ req, q }) => svc.profile(await identify(req, { contributorId: q.contributorId, displayName: q.displayName })));
  on('GET', '/api/community/leaderboard', ({ q }) => svc.leaderboard(q.period, q.contributorId));
  on('GET', '/api/community/line/:id', ({ params }) => svc.lineInfo(params.id));

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
    repo.changed?.('contributors', c);
    repo.audit(actor, 'update', 'contributors', c.id, before, { ...c });
    repo.touch();
    return c;
  });
}
