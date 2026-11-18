// End-to-end tests of the server on PostgreSQL (PostGIS), with a stand-in for
// Supabase Auth. Skipped unless TEST_DATABASE_URL points at a Postgres server
// where this user may create databases, e.g.
//   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const skip = !ADMIN_URL && 'set TEST_DATABASE_URL to run the PostgreSQL tests';
const dbName = `luvyo_test_${Date.now().toString(36)}`;
const dbUrl = ADMIN_URL ? ADMIN_URL.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`) : '';
const users = Array.from({ length: 7 }, (_, i) => ({ id: randomUUID(), name: `Rider ${i}`, token: `tok-${i}-${randomUUID()}` }));
let base, server, repo, auth, sql;

before(async () => {
  if (skip) return;
  const admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`create database ${dbName}`); await admin.end();
  const { migrate } = await import('../scripts/db-migrate.mjs');
  await migrate(dbUrl, { authStub: true, log: () => {} });
  const { seed } = await import('../scripts/db-seed.mjs');
  await seed(dbUrl, new URL('../data/dev/dataset.json', import.meta.url).pathname, () => {});
  sql = new pg.Client({ connectionString: dbUrl }); await sql.connect();
  for (const u of users) await sql.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [u.id, `${u.id}@example.test`, { full_name: u.name }]);
  // stand-in for Supabase Auth: GET /auth/v1/user with a bearer token
  auth = createServer((req, res) => {
    const u = users.find((x) => `Bearer ${x.token}` === req.headers.authorization);
    res.writeHead(u ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(u ? { id: u.id, user_metadata: { full_name: u.name } } : { msg: 'invalid token' }));
  });
  await new Promise((r) => auth.listen(0, r));
  Object.assign(process.env, {
    DATABASE_URL: dbUrl, SUPABASE_URL: `http://127.0.0.1:${auth.address().port}`, SUPABASE_ANON_KEY: 'anon',
    ADMIN_TOKENS: 'tok-super:superadmin:Super Admin,tok-mod:moderator:Mod',
  });
  ({ server, repo } = await import('../server/index.js'));
  await repo.ready;
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server?.close(); auth?.close();
  await repo?.close?.();
  await sql?.end();
  const admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`); await admin.end();
});

const j = async (path, { user, admin, ...opts } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${user.token}`;
  if (admin) headers.Authorization = `Bearer ${admin}`;
  const res = await fetch(base + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
/** A fresh repository reading straight from the database = what a restarted server sees. */
async function reloaded() {
  const { PgRepository } = await import('../server/pgRepository.js');
  const r = new PgRepository(dbUrl); await r.ready; return r;
}

test('serves the seeded data from PostgreSQL', { skip }, async () => {
  const h = await j('/api/health');
  assert.equal(h.body.storage, 'postgres');
  const r = await j('/api/routes/search', { method: 'POST', body: { origin: { lat: 14.62, lng: 121.053 }, destination: { lat: 14.5507, lng: 121.051 }, departAt: '2026-11-17T08:00:00+08:00' } });
  assert.ok(r.body.options.some((o) => o.title === 'MRT-3 + BGC-E'));
});

test('admin edits persist, with audit trail and fare history', { skip }, async () => {
  const fare = (await j('/api/admin/fareSchedules', { admin: 'tok-super' })).body.find((f) => f.id === 'fare-mrt3');
  const up = await j('/api/admin/fareSchedules', { method: 'PUT', admin: 'tok-super', body: { ...fare, lastVerified: '2026-11-17', sourceType: 'official' } });
  assert.equal(up.status, 200);
  const created = await j('/api/admin/places', { method: 'PUT', admin: 'tok-super', body: { id: 'pl-test-terminal', name: 'Test Terminal', type: 'landmark', lat: 14.6, lng: 121.0, aliases: ['tt'] } });
  assert.equal(created.status, 200);
  const r = await reloaded();
  assert.equal(r.get('fareSchedules', 'fare-mrt3').sourceType, 'official');
  assert.equal(r.get('fareSchedules', 'fare-mrt3').lastVerified, '2026-11-17');
  assert.equal(r.get('places', 'pl-test-terminal').name, 'Test Terminal');
  assert.ok(r.dataset().auditLog.some((a) => a.entity === 'fareSchedules' && a.entityId === 'fare-mrt3' && a.actor === 'Super Admin'));
  assert.ok(r.dataset().fareHistory.some((h) => h.scheduleId === 'fare-mrt3' && h.actor.name === 'Super Admin'));
  await r.close();
  // delete persists too
  assert.equal((await j('/api/admin/places/pl-test-terminal', { method: 'DELETE', admin: 'tok-super' })).status, 200);
  const r2 = await reloaded(); assert.equal(r2.get('places', 'pl-test-terminal'), null); await r2.close();
});

test('a failed write is rejected and memory stays consistent', { skip }, async () => {
  const bad = await j('/api/admin/lines', { method: 'PUT', admin: 'tok-super', body: { id: 'bad-line', name: 'Bad', modeId: 'jeepney', stopIds: ['no-such-stop-1', 'no-such-stop-2'] } });
  assert.equal(bad.status, 400);
  const lines = (await j('/api/admin/lines', { admin: 'tok-super' })).body;
  assert.ok(!lines.some((l) => l.id === 'bad-line'));
});

test('contributions need a signed-in user', { skip }, async () => {
  const anon = await j('/api/community/contributions', { method: 'POST', body: { type: 'fare', zoneId: 'zone-marikina-dev', payload: { amount: 30 }, contributorId: 'device-id-123456' } });
  assert.equal(anon.status, 401);
  const forged = await j('/api/community/contributions', { method: 'POST', user: { token: 'not-a-real-token' }, body: { type: 'fare', zoneId: 'zone-marikina-dev', payload: { amount: 30 } } });
  assert.equal(forged.status, 401);
});

test('peer verification end to end, persisted across a restart', { skip }, async () => {
  const [author, ...others] = users;
  const sub = await j('/api/community/contributions', { method: 'POST', user: author, body: { type: 'fare', zoneId: 'zone-marikina-dev', lat: 14.631, lng: 121.083, payload: { amount: 30 } } });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  assert.equal((await j(`/api/community/contributions/${sub.body.id}/confirm`, { method: 'POST', user: author, body: { agree: true } })).status, 403);
  let last;
  for (const u of others.slice(0, 4)) last = await j(`/api/community/contributions/${sub.body.id}/confirm`, { method: 'POST', user: u, body: { agree: true, lat: 14.632, lng: 121.084 } });
  assert.equal(last.body.status, 'community_verified');
  assert.equal((await j(`/api/community/contributions/${sub.body.id}/confirm`, { method: 'POST', user: others[0], body: { agree: true } })).status, 409);

  // database state
  const row = (await sql.query('select status, rewarded from contributions where id = $1', [sub.body.id])).rows[0];
  assert.deepEqual(row, { status: 'community_verified', rewarded: 'verified' });
  assert.equal((await sql.query('select count(*)::int n from confirmations where contribution_id = $1', [sub.body.id])).rows[0].n, 4);
  const me = (await sql.query('select display_name, points, reputation, accepted_count from contributors where user_id = $1', [author.id])).rows[0];
  assert.deepEqual(me, { display_name: 'Rider 0', points: 25, reputation: 10, accepted_count: 1 });
  assert.ok((await sql.query('select count(*)::int n from points_ledger where contributor_id = $1', [author.id])).rows[0].n >= 2);

  // a restarted server sees the same verified fare and points
  const r = await reloaded();
  const { applyCommunity } = await import('../core/community.js');
  const engine = applyCommunity(r.dataset());
  assert.equal(engine.fareSchedules.find((f) => f.scope?.zoneId === 'zone-marikina-dev').sourceType, 'community_verified');
  assert.equal(r.get('contributors', author.id).points, 25);
  await r.close();
  const prof = await j('/api/community/me', { user: author });
  assert.equal(prof.body.points, 25);
  const lb = await j(`/api/community/leaderboard?period=all&contributorId=${author.id}`);
  assert.equal(lb.body.myRank, 1);
});

test('recorded rides are stored as PostGIS lines; database blocks rail reports', { skip }, async () => {
  const pts = [...Array(25)].map((_, i) => [14.66 - i * 0.0012, 121.0745 + i * 0.0001, Date.now() + i * 20000]);
  const c = await j('/api/community/contributions', { method: 'POST', user: users[5], body: { type: 'new_route', modeId: 'jeepney', payload: { modeId: 'jeepney', signboard: 'KATIPUNAN – CUBAO', fromName: 'North', toName: 'South', points: pts, endsTrimmed: true } } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const g = (await sql.query('select ST_NPoints(trace::geometry) n, round(ST_Length(trace)::numeric) m from contributions where id = $1', [c.body.id])).rows[0];
  assert.ok(g.n >= 10 && g.m > 2500, JSON.stringify(g));
  assert.equal((await j('/api/community/contributions', { method: 'POST', user: users[5], body: { type: 'fare', lineId: 'mrt3', payload: { amount: 20 } } })).status, 400);
});

test('issue reports, moderation and suspensions persist', { skip }, async () => {
  const rep = await j('/api/reports', { method: 'POST', body: { category: 'road_closure', description: 'Aurora Blvd closed near Gilmore this weekend', lineId: 'jp-cubao-quiapo', reporterId: 'device-xyz', lat: 14.613, lng: 121.034 } });
  assert.equal(rep.status, 200);
  await j(`/api/admin/reports/${rep.body.id}/status`, { method: 'POST', admin: 'tok-mod', body: { status: 'verified', note: 'Confirmed by MMDA' } });
  const db = (await sql.query('select status, moderator_note, reviewed_by, route_id is not null as has_route from community_reports where id = $1', [rep.body.id])).rows[0];
  assert.deepEqual(db, { status: 'verified', moderator_note: 'Confirmed by MMDA', reviewed_by: 'Mod', has_route: true });
  await j(`/api/admin/community/contributors/${users[6].id}`, { method: 'POST', admin: 'tok-mod', body: { suspended: false } }).catch(() => {});
  // suspend a rider who has contributed
  const s = await j(`/api/admin/community/contributors/${users[1].id}`, { method: 'POST', admin: 'tok-mod', body: { suspended: true } });
  assert.equal(s.status, 200);
  assert.equal((await sql.query('select is_suspended from contributors where user_id = $1', [users[1].id])).rows[0].is_suspended, true);
  assert.equal((await j('/api/community/contributions', { method: 'POST', user: users[1], body: { type: 'wait', lineId: 'jp-cubao-quiapo', payload: { minutes: 5 } } })).status, 403);
});

test('routes from an LTFRB resolution persist with their legal basis and path', { skip }, async () => {
  const resolution = { number: '383', series: '2026', dateSigned: '2026-09-18', action: 'modification', modeId: 'jeepney', routeName: 'Lagro (Hilltop) – Stop & Shop', previousRoute: 'Lagro – Cubao via Kalayaan', caseNumber: 'NCR-PUJ-2018-06-00076', lengthKm: 26, units: 25, conditions: ['Subject to the Route Rationalization Study'] };
  const wp = [{ lat: 14.734, lng: 121.0707, label: 'Lagro (Hilltop)' }, { lat: 14.6203, lng: 121.0533, label: 'Araneta City Bus Port' }, { lat: 14.6019, lng: 121.0118, label: 'Sta. Mesa (Stop & Shop)' }];
  const r = await j('/api/admin/resolutions/apply', { method: 'POST', admin: 'tok-super', body: { resolution, directions: [{ dir: 'westbound', waypoints: wp, shape: wp.map((p) => [p.lat, p.lng]), km: 29.2 }] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const db = (await sql.query("select is_verified, is_operational, bidirectional, source_type::text, ST_NPoints(shape::geometry) n from transport_routes where external_id = 'br2026-383-westbound'")).rows[0];
  assert.deepEqual(db, { is_verified: false, is_operational: false, bidirectional: false, source_type: 'official', n: 3 });
  const re = await reloaded();
  const l = re.get('lines', 'br2026-383-westbound');
  assert.equal(l.legalBasis.caseNumber, 'NCR-PUJ-2018-06-00076');
  assert.match(l.sourceNote, /LTFRB BR No\. 383/);
  assert.equal(l.shape.length, 3);
  assert.equal(re.get('stops', l.stopIds[0]).kind, 'terminal');
  await re.close();
});
