import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'sakay-'));
process.env.SAKAY_DATA_FILE = join(dir, 'dataset.json');
process.env.ADMIN_TOKENS = 'tok-super:superadmin:Super,tok-mod:moderator:Mod,tok-view:viewer:View';
const { server, repo } = await import('../server/index.js');
let base;
before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); repo.flush(); rmSync(dir, { recursive: true, force: true }); });

const j = async (path, opts = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};
const auth = (t) => ({ Authorization: 'Bearer ' + t });
const CUBAO = { name: 'Cubao', lat: 14.62, lng: 121.053 }, BGC = { name: 'BGC', lat: 14.5507, lng: 121.051 };

test('route search validates input', async () => {
  assert.equal((await j('/api/routes/search', { method: 'POST', body: { origin: CUBAO } })).status, 400);
  assert.equal((await j('/api/routes/search', { method: 'POST', body: { origin: { lat: 51.5, lng: 0 }, destination: BGC } })).status, 400);
});

test('route search returns options with security headers', async () => {
  const r = await j('/api/routes/search', { method: 'POST', body: { origin: CUBAO, destination: BGC, departAt: '2026-11-17T08:00:00+08:00' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.options.length >= 3);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('content-security-policy'));
});

test('public dataset excludes private collections', async () => {
  const r = await j('/api/dataset');
  assert.ok(r.body.lines.length);
  for (const k of ['reports', 'auditLog', 'analytics']) assert.equal(r.body[k], undefined);
  assert.ok(r.body.advisories.every((a) => new Date(a.expiresAt) > new Date()));
});

test('reports: validation, submission, own listing without photo', async () => {
  assert.equal((await j('/api/reports', { method: 'POST', body: { category: 'nope', description: 'xxxxxxxxxxxx' } })).status, 400);
  const ok = await j('/api/reports', { method: 'POST', body: { category: 'missing_stop', description: 'There is a missing stop here', reporterId: 'dev-1', photo: 'data:image/jpeg;base64,AAAA' } });
  assert.equal(ok.body.status, 'pending');
  const mine = await j('/api/reports/mine?reporterId=dev-1');
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].photo, undefined);
});

test('admin RBAC', async () => {
  assert.equal((await j('/api/admin/lines')).status, 401);
  assert.equal((await j('/api/admin/lines', { headers: auth('wrong') })).status, 401);
  assert.equal((await j('/api/admin/lines', { headers: auth('tok-view') })).status, 200);
  const fare = { name: 'Test', kind: 'fixed', scope: { lineId: 'x' }, params: { fare: 20 }, sourceType: 'admin_verified' };
  assert.equal((await j('/api/admin/fareSchedules', { method: 'PUT', headers: auth('tok-view'), body: fare })).status, 403);
  assert.equal((await j('/api/admin/fareSchedules', { method: 'PUT', headers: auth('tok-mod'), body: fare })).status, 403);
  const created = await j('/api/admin/fareSchedules', { method: 'PUT', headers: auth('tok-super'), body: fare });
  assert.equal(created.status, 200);
  // update → fare history + audit
  await j('/api/admin/fareSchedules', { method: 'PUT', headers: auth('tok-super'), body: { ...created.body, params: { fare: 25 } } });
  const hist = await j('/api/admin/fare-history', { headers: auth('tok-super') });
  assert.ok(hist.body.some((h) => h.scheduleId === created.body.id && h.before.params.fare === 20));
  const audit = await j('/api/admin/audit', { headers: auth('tok-super') });
  assert.ok(audit.body.some((a) => a.entityId === created.body.id && a.action === 'update'));
  assert.equal((await j('/api/admin/audit', { headers: auth('tok-mod') })).status, 403);
});

test('moderation changes status and reputation, not official data', async () => {
  const { body: list } = await j('/api/admin/reports', { headers: auth('tok-mod') });
  const r = await j(`/api/admin/reports/${list[0].id}/status`, { method: 'POST', headers: auth('tok-mod'), body: { status: 'verified' } });
  assert.equal(r.body.status, 'verified');
  assert.equal(r.body.reviewedBy, 'Mod');
  assert.equal((await j(`/api/admin/reports/${list[0].id}/status`, { method: 'POST', headers: auth('tok-mod'), body: { status: 'official' } })).status, 400);
});

test('static serving blocks path traversal', async () => {
  const res = await fetch(base + '/core/..%2f..%2fpackage.json');
  assert.notEqual(res.status, 200);
});

// ------------------------------------------------------------ community ---
const rider = (n) => ({ 'X-Contributor-Id': `device-rider-${n}` });

test('community: contribute → peers confirm → verified, rewards paid, data used', async () => {
  // official-only modes are refused
  const rail = await j('/api/community/contributions', { method: 'POST', headers: rider(1), body: { type: 'fare', lineId: 'mrt3', payload: { amount: 20 } } });
  assert.equal(rail.status, 400);
  const sub = await j('/api/community/contributions', { method: 'POST', headers: rider(1), body: { type: 'fare', zoneId: 'zone-marikina-dev', lat: 14.631, lng: 121.083, payload: { amount: 30 }, displayName: 'Ana' } });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.status, 'pending');
  assert.equal(sub.body.pointsEarned, 5);
  const id = sub.body.id;
  // duplicate within 6 h
  assert.equal((await j('/api/community/contributions', { method: 'POST', headers: rider(1), body: { type: 'fare', zoneId: 'zone-marikina-dev', payload: { amount: 30 } } })).status, 409);
  // can't confirm own; can't confirm twice
  assert.equal((await j(`/api/community/contributions/${id}/confirm`, { method: 'POST', headers: rider(1), body: { agree: true } })).status, 403);
  // verify feed shows it to others, not to the author
  assert.ok((await j('/api/community/verify?lat=14.631&lng=121.083', { headers: rider(2) })).body.some((x) => x.id === id));
  assert.ok(!(await j('/api/community/verify', { headers: rider(1) })).body.some((x) => x.id === id));
  let last;
  for (const n of [2, 3, 4, 5]) last = await j(`/api/community/contributions/${id}/confirm`, { method: 'POST', headers: rider(n), body: { agree: true, lat: 14.632, lng: 121.084 } });
  assert.equal((await j(`/api/community/contributions/${id}/confirm`, { method: 'POST', headers: rider(2), body: { agree: true } })).status, 409);
  assert.equal(last.body.status, 'community_verified');
  const me = await j('/api/community/me', { headers: rider(1) });
  assert.equal(me.body.points, 5 + 20);
  assert.equal(me.body.reputation, 10);
  assert.ok(me.body.badges.find((b) => b.id === 'unang_para').earned);
  // verified fare now used by the engine
  const zones = await j('/api/tricycle/zones');
  assert.equal(zones.body.find((z) => z.id === 'zone-marikina-dev').fare.sourceType, 'community_verified');
  const lb = await j('/api/community/leaderboard?period=week&contributorId=device-rider-1');
  assert.equal(lb.body.rows[0].displayName, 'Ana');
  assert.equal(lb.body.myRank, 1);
  // public dataset never exposes contributor records
  const pub = await j('/api/dataset');
  assert.equal(pub.body.contributors, undefined);
  assert.equal(pub.body.contributions, undefined);
});

test('community: disputing a fare with a value files a counter-report; moderators can override; suspension blocks', async () => {
  const sub = await j('/api/community/contributions', { method: 'POST', headers: rider(6), body: { type: 'fare', lineId: 'jp-cubao-quiapo', payload: { amount: 20 } } });
  const no = await j(`/api/community/contributions/${sub.body.id}/confirm`, { method: 'POST', headers: rider(7), body: { agree: false, value: 13 } });
  assert.equal(no.body.status, 'disputed');
  assert.ok(no.body.counterReportId);
  assert.equal((await j(`/api/admin/community/contributions/${sub.body.id}/moderate`, { method: 'POST', headers: auth('tok-view'), body: { status: 'rejected' } })).status, 403);
  const mod = await j(`/api/admin/community/contributions/${sub.body.id}/moderate`, { method: 'POST', headers: auth('tok-mod'), body: { status: 'rejected', note: 'Minimum fare is lower' } });
  assert.equal(mod.body.status, 'rejected');
  const list = await j('/api/admin/community/contributors', { headers: auth('tok-mod') });
  assert.ok(list.body.find((c) => c.id === 'device-rider-6').reputation < 0);
  await j('/api/admin/community/contributors/device-rider-6', { method: 'POST', headers: auth('tok-mod'), body: { suspended: true } });
  assert.equal((await j('/api/community/contributions', { method: 'POST', headers: rider(6), body: { type: 'wait', lineId: 'jp-cubao-quiapo', payload: { minutes: 5 } } })).status, 403);
});

test('community: "still accurate?" prompts for nearby community routes create route checks', async () => {
  const feed = await j('/api/community/verify?lat=14.6040&lng=121.0170', { headers: rider(8) });
  assert.ok(Array.isArray(feed.body), JSON.stringify(feed.body));
  const prompt = feed.body.find((x) => x.id === 'line:jp-cubao-quiapo');
  assert.ok(prompt);
  const r = await j('/api/community/contributions/line:jp-cubao-quiapo/confirm', { method: 'POST', headers: rider(8), body: { agree: true } });
  assert.equal(r.body.ok, true);
  const feed2 = await j('/api/community/verify?lat=14.6040&lng=121.0170', { headers: rider(8) });
  assert.ok(Array.isArray(feed2.body), JSON.stringify(feed2.body));
  assert.ok(!feed2.body.some((x) => x.id === 'line:jp-cubao-quiapo'));
});
