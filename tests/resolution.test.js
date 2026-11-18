// LTFRB resolution intake: text parsing, street lists, corner finding, records, admin API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResolutionText, streetHints, parseStreetList, normalizeStreet, recordsFromResolution, citation } from '../core/resolution.js';
import { corners, roadPath, traceDirection } from '../server/routeTracer.js';

// OCR (Tesseract) output of LTFRB BR No. 383 s. 2026, a scanned PDF
const OCR = readFileSync(new URL('./fixtures/br-2026-383.ocr.txt', import.meta.url), 'utf8');

test('reads the main fields of a scanned resolution', () => {
  const d = parseResolutionText(OCR);
  assert.equal(d.number, '383');
  assert.equal(d.series, '2026');
  assert.equal(d.dateSigned, '2026-09-18');
  assert.equal(d.action, 'modification');
  assert.equal(d.modeId, 'jeepney');
  assert.equal(d.previousRoute, 'Lagro – Cubao via Kalayaan');
  assert.equal(d.routeName, 'Lagro (Hilltop) – Stop & Shop');
  assert.equal(d.caseNumber, 'NCR-PUJ-2018-06-00076');
  assert.equal(d.lengthKm, 26);
  assert.equal(d.units, 25);
  assert.equal(d.conditions.length, 4);
  assert.equal(citation(d), 'LTFRB BR No. 383 s. 2026 (Sep 18, 2026)');
});

test('offers street names from the annex as hints', () => {
  const h = streetHints(OCR);
  for (const s of ['Quirino Highway', 'Belfast Avenue', 'Commonwealth Avenue', 'K-J Street', 'Victorino Mapa Street', 'Araneta City Bus Port']) assert.ok(h.includes(s), s);
  assert.ok(!h.some((x) => /East Avenue/.test(x)), 'letterhead address is not a hint');
});

test('street lists: abbreviations, LGUs, pins and repeated rows', () => {
  assert.equal(normalizeStreet('Belfast Ave.'), 'Belfast Avenue');
  assert.equal(normalizeStreet('Old Sta. Mesa St.'), 'Old Santa Mesa Street');
  const items = parseStreetList('Lagro (Hilltop) | Quezon City\nAurora Blvd | Quezon City\nAurora Boulevard | San Juan\n\nStop & Shop @14.6019, 121.0118');
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { name: 'Lagro (Hilltop)', lgu: 'Quezon City' });
  assert.deepEqual(items[2].at, { lat: 14.6019, lng: 121.0118 });
});

const seg = (...pts) => pts.map(([lat, lng]) => ({ lat, lng }));
test('finds where two streets meet, including ends that almost touch', () => {
  const ns = [seg([14.60, 121.00], [14.62, 121.00])];
  const ew = [seg([14.61, 120.99], [14.61, 121.01])];
  const [c] = corners(ns, ew);
  assert.ok(Math.abs(c.lat - 14.61) < 1e-4 && Math.abs(c.lng - 121.00) < 1e-4);
  const gap = [seg([14.6203, 121.0], [14.6203, 121.01])]; // ~33 m north of the end of ns
  assert.equal(corners(ns, gap).length, 1);
  assert.equal(corners(ns, [seg([14.65, 121.0], [14.65, 121.01])]).length, 0);
});

// A fake OpenStreetMap: two straight streets meeting at a corner, and a router
// that draws straight lines (with a detour when a "bad" point is included).
function fakeOsm({ badLabel = null } = {}) {
  const streets = { 'Alpha Avenue': [seg([14.60, 121.00], [14.62, 121.00])], 'Beta Street': [seg([14.62, 120.99], [14.62, 121.02])] };
  return {
    async street(name) { return streets[name] || []; },
    async place(q) { return /Start/.test(q) ? { lat: 14.60, lng: 121.00 } : /End/.test(q) ? { lat: 14.62, lng: 121.02 } : null; },
    async route(pts) {
      const legs = [];
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].lat - pts[i - 1].lat, pts[i].lng - pts[i - 1].lng) * 111;
        legs.push(d + (pts[i].label === badLabel || pts[i - 1].label === badLabel ? 4 : 0));
      }
      return { shape: pts.map((p) => [p.lat, p.lng]), km: legs.reduce((a, b) => a + b, 0), legs };
    },
  };
}

test('traces a street list into corners and a path', async () => {
  const r = await traceDirection(parseStreetList('Start Terminal\nAlpha Ave\nBeta St\nEnd Terminal'), { osm: fakeOsm() });
  assert.deepEqual(r.steps.map((s) => s.ok), [true, true, true]);
  assert.equal(r.waypoints[1].label, 'Alpha Avenue cor. Beta Street');
  assert.ok(Math.abs(r.waypoints[1].lat - 14.62) < 1e-4 && Math.abs(r.waypoints[1].lng - 121.0) < 1e-4);
  const miss = await traceDirection(parseStreetList('Start Terminal\nAlpha Ave\nGamma Road\nEnd Terminal'), { osm: fakeOsm() });
  assert.ok(miss.steps.some((s) => !s.ok && s.label === 'Gamma Road'));
});

test('routes around a corner snapped to the wrong side of the road', async () => {
  const pts = [{ lat: 14.60, lng: 121.0, label: 'A' }, { lat: 14.61, lng: 121.0, label: 'B' }, { lat: 14.62, lng: 121.0, label: 'C' }];
  const steps = [];
  const r = await roadPath(pts, fakeOsm({ badLabel: 'B' }), steps);
  assert.ok(r.km < 3);
  assert.match(steps[0].how, /routed around/);
});

const RES = { ...parseResolutionText(OCR) };
const DIRS = [
  { dir: 'westbound', waypoints: [{ lat: 14.734, lng: 121.0707, label: 'Lagro (Hilltop)' }, { lat: 14.6203, lng: 121.0533, label: 'Araneta City Bus Port' }, { lat: 14.6019, lng: 121.0118, label: 'Sta. Mesa (Stop & Shop)' }], shape: [[14.734, 121.0707], [14.6203, 121.0533], [14.6019, 121.0118]], km: 29.2 },
  { dir: 'eastbound', waypoints: [{ lat: 14.6019, lng: 121.0118, label: 'Sta. Mesa (Stop & Shop)' }, { lat: 14.734, lng: 121.0707, label: 'Lagro (Hilltop)' }], shape: [[14.6019, 121.0118], [14.6203, 121.0533], [14.734, 121.0707]], km: 29.7 },
];

test('an approved resolution becomes two one-way, official, unverified routes', () => {
  const { stops, lines } = recordsFromResolution(RES, DIRS, { today: '2026-11-18' });
  assert.equal(stops.length, 5);
  assert.deepEqual(lines.map((l) => l.id), ['br2026-383-westbound', 'br2026-383-eastbound']);
  const [wb, eb] = lines;
  assert.equal(wb.bidirectional, false);
  assert.equal(wb.verified, false);
  assert.equal(wb.operational, false);
  assert.equal(wb.sourceType, 'official');
  assert.match(wb.sourceNote, /^LTFRB BR No\. 383 s\. 2026/);
  assert.equal(wb.legalBasis.caseNumber, 'NCR-PUJ-2018-06-00076');
  assert.equal(wb.signboard, 'LAGRO (HILLTOP) – STOP & SHOP');
  assert.equal(eb.signboard, 'STOP & SHOP – LAGRO (HILLTOP)');
  assert.throws(() => recordsFromResolution({ ...RES, number: '' }, DIRS));
});

// ---- admin API (JSON storage) ----
const dir = mkdtempSync(join(tmpdir(), 'luvyo-br-'));
process.env.SAKAY_DATA_FILE = join(dir, 'dataset.json');
process.env.ADMIN_TOKENS = 'tok-super:superadmin:Super,tok-view:viewer:View';
const { server, repo } = await import('../server/index.js');
let base;
before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.close(); repo.flush(); rmSync(dir, { recursive: true, force: true }); });
const j = async (path, { token, ...opts } = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('admin API: rejects non-PDFs and viewers; applies, re-applies and lists', async () => {
  assert.equal((await j('/api/admin/resolutions/extract', { method: 'POST', token: 'tok-super', body: { pdf: Buffer.from('hello').toString('base64') } })).status, 400);
  assert.equal((await j('/api/admin/resolutions/apply', { method: 'POST', token: 'tok-view', body: {} })).status, 403);
  assert.equal((await j('/api/admin/resolutions/apply', { method: 'POST', token: 'tok-super', body: { resolution: RES, directions: [{ ...DIRS[0], shape: [[51.5, 0], [51.6, 0]] }] } })).status, 400);

  repo.upsert('lines', { id: 'old-lagro-cubao', name: 'Lagro – Cubao via Kalayaan', modeId: 'jeepney', stopIds: repo.dataset().lines[0].stopIds, dataset: 'imported' }, { name: 'test' });
  const r = await j('/api/admin/resolutions/apply', { method: 'POST', token: 'tok-super', body: { resolution: RES, directions: DIRS, operational: true, retireLineIds: ['old-lagro-cubao'] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.lines.length, 2);
  assert.deepEqual(r.body.retired, ['old-lagro-cubao']);
  assert.equal(repo.get('lines', 'old-lagro-cubao').operational, false);
  assert.ok(repo.dataset().auditLog.some((a) => a.entityId === 'br2026-383-westbound' && a.actor === 'Super'));

  // re-import with corrected data replaces, not duplicates
  const again = await j('/api/admin/resolutions/apply', { method: 'POST', token: 'tok-super', body: { resolution: RES, directions: [DIRS[0]], operational: true } });
  assert.equal(again.status, 200);
  assert.ok(!repo.get('lines', 'br2026-383-eastbound'));
  assert.equal(repo.dataset().stops.filter((s) => s.id.startsWith('br2026-383-')).length, 3);

  const list = await j('/api/admin/resolutions', { token: 'tok-view' });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].citation, 'LTFRB BR No. 383 s. 2026 (Sep 18, 2026)');
});

test('the planner uses an operational resolution route, one way only', async () => {
  const search = (o, d) => j('/api/routes/search', { method: 'POST', body: { origin: o, destination: d, departAt: '2026-11-20T08:00:00+08:00' } });
  const lagro = { name: 'Lagro', lat: 14.734, lng: 121.0707 }, staMesa = { name: 'Sta. Mesa', lat: 14.6019, lng: 121.0118 };
  const uses = (r) => r.body.options.some((o) => o.legs.some((l) => l.lineId === 'br2026-383-westbound'));
  assert.ok(uses(await search(lagro, staMesa)));
  assert.ok(!uses(await search(staMesa, lagro)));
});
