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
