import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, contributorWeight, plausibility, trimTrace, applyCommunity, robustMedian, levelFor, contributorProfile } from '../core/community.js';
import { planJourney, estimateFare, compareProviders } from '../core/router.js';
import { haversineKm } from '../core/geo.js';

const raw = JSON.parse(readFileSync(new URL('../data/dev/dataset.json', import.meta.url)));
const NOW = new Date('2026-11-16T12:00:00+08:00');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const vet = (id, rep = 50) => ({ id, reputation: rep, stats: { accepted: 5 } });
const newbie = (id) => ({ id, reputation: 0, stats: { accepted: 0 } });

test('weights: probation, reputation growth, suspension, negative rep', () => {
  assert.equal(contributorWeight(newbie('a')), 0.6);
  assert.ok(contributorWeight(vet('b', 200)) > contributorWeight(vet('c', 10)));
  assert.ok(contributorWeight(vet('d', 1e6)) <= 2.5);
  assert.equal(contributorWeight({ ...vet('e'), suspended: true }), 0);
  assert.equal(contributorWeight(vet('f', -5)), 0.25);
});

test('three independent veterans verify; newcomers alone cannot', () => {
  const c = { id: 'x', type: 'fare', contributorId: 'a', createdAt: ago(1), payload: {} };
  const ppl = new Map(['a', 'b', 'c'].map((i) => [i, vet(i)]));
  const conf = [{ contributorId: 'b', agree: true, at: ago(1) }, { contributorId: 'c', agree: true, at: ago(0) }];
  assert.equal(evaluate(c, conf, ppl, NOW).status, 'community_verified');
  const noobs = new Map(['a', 'b', 'c'].map((i) => [i, newbie(i)]));
  assert.equal(evaluate(c, conf, noobs, NOW).status, 'pending'); // 3 × 0.6 = 1.8 < 3
  const five = ['b', 'c', 'd', 'e'].map((i) => ({ contributorId: i, agree: true, at: ago(0) }));
  const noobs5 = new Map(['a', 'b', 'c', 'd', 'e'].map((i) => [i, newbie(i)]));
  assert.equal(evaluate(c, five, noobs5, NOW).status, 'community_verified'); // 5 × 0.6 = 3
  // same person twice doesn't add a distinct agreeing rider
  const dup = [{ contributorId: 'b', agree: true, at: ago(0) }, { contributorId: 'b', agree: true, at: ago(0) }];
  assert.equal(evaluate(c, dup, ppl, NOW).agreeing, 2);
});

test('confidence decays: old verifications need reconfirmation', () => {
  const ppl = new Map(['a', 'b', 'c'].map((i) => [i, vet(i)]));
  const c = { id: 'x', type: 'wait', contributorId: 'a', createdAt: ago(200), payload: {}, everVerified: true };
  const conf = [{ contributorId: 'b', agree: true, at: ago(200) }, { contributorId: 'c', agree: true, at: ago(200) }];
  assert.equal(evaluate(c, conf, ppl, NOW).status, 'needs_reconfirmation');
});

test('disagreement → disputed; strong disagreement → rejected; moderator overrides', () => {
  const ppl = new Map(['a', 'b', 'c', 'd'].map((i) => [i, vet(i)]));
  const c = { id: 'x', type: 'fare', contributorId: 'a', createdAt: ago(0), payload: {} };
  assert.equal(evaluate(c, [{ contributorId: 'b', agree: false, at: ago(0) }], ppl, NOW).status, 'disputed');
  const many = ['b', 'c', 'd'].map((i) => ({ contributorId: i, agree: false, at: ago(0) }));
  assert.equal(evaluate(c, many, ppl, NOW).status, 'rejected');
  assert.equal(evaluate({ ...c, moderation: { status: 'community_verified' } }, many, ppl, NOW).status, 'community_verified');
});

test('far-away confirmations count less', () => {
  const ppl = new Map(['a', 'b', 'c'].map((i) => [i, vet(i)]));
  const c = { id: 'x', type: 'fare', contributorId: 'a', createdAt: ago(0), payload: {} };
  const near = evaluate(c, [{ contributorId: 'b', agree: true, at: ago(0), near: true }], ppl, NOW).agreeW;
  const far = evaluate(c, [{ contributorId: 'b', agree: true, at: ago(0), near: false }], ppl, NOW).agreeW;
  assert.ok(far < near);
});

test('plausibility rejects impossible data and official-only modes', () => {
  assert.equal(plausibility('fare', { modeId: 'jeepney', amount: 13 }).length, 0);
  assert.ok(plausibility('fare', { modeId: 'jeepney', amount: 500 }).length);
  assert.ok(plausibility('fare', { modeId: 'rail', amount: 20 }).length);
  assert.ok(plausibility('fare', { modeId: 'ridehail_car', amount: 200 }).length); // needs distance
  const t0 = Date.now();
  const fast = [...Array(10)].map((_, i) => [14.6 + i * 0.01, 121.0, t0 + i * 1000]); // ~1 km per second
  assert.match(plausibility('route_trace', { modeId: 'jeepney', points: fast }).join(), /impossible speeds/);
  assert.ok(plausibility('wait', { minutes: 500 }).length);
  assert.ok(plausibility('last_trip', { time: '25:00' }).length);
});

test('trimTrace drops the ends near home and work', () => {
  const pts = [...Array(30)].map((_, i) => [14.60 + i * 0.001, 121.0]); // ~110 m apart
  const t = trimTrace(pts, 0.3);
  assert.ok(haversineKm({ lat: pts[0][0], lng: 121 }, { lat: t[0][0], lng: 121 }) >= 0.3);
  assert.ok(haversineKm({ lat: pts.at(-1)[0], lng: 121 }, { lat: t.at(-1)[0], lng: 121 }) >= 0.3);
});

test('robust median ignores outliers', () => {
  assert.equal(robustMedian([13, 13, 15, 14, 200].map((v) => ({ v, w: 1 }))), 14);
});

test('levels', () => {
  assert.equal(levelFor(0).name, 'Pasahero');
  assert.equal(levelFor(350).name, 'Barker');
  assert.ok(levelFor(350).progress > 0 && levelFor(350).progress < 1);
});

// --- verified community data changes what the engines return ---------
function withVerified(contribs) {
  const people = ['a', 'b', 'c', 'd'].map((i) => vet(i));
  const confirmations = contribs.flatMap((c) => ['b', 'c'].map((who) => ({ id: c.id + who, contributionId: c.id, contributorId: who === c.contributorId ? 'd' : who, agree: true, at: ago(1) })));
  return applyCommunity({ ...raw, contributors: people, contributions: contribs, confirmations }, NOW);
}

test('verified tricycle fares fill a negotiated zone; never beat official', () => {
  const z = 'zone-marikina-dev';
  const before = estimateFare(raw, { modeId: 'tricycle', origin: { lat: 14.628, lng: 121.090 }, destination: { lat: 14.629, lng: 121.088 } });
  assert.equal(before.available, false);
  const ds = withVerified([30, 30, 35].map((amount, i) => ({ id: 'f' + i, type: 'fare', contributorId: 'a', zoneId: z, createdAt: ago(2), payload: { modeId: 'tricycle', amount } })));
  const after = estimateFare(ds, { modeId: 'tricycle', origin: { lat: 14.628, lng: 121.090 }, destination: { lat: 14.629, lng: 121.088 } });
  assert.equal(after.available, true);
  assert.equal(after.min, 30);
  assert.equal(after.sourceType, 'community_verified');
  // a line with an official schedule is never overridden
  const official = { ...raw, fareSchedules: [...raw.fareSchedules, { id: 'off', scope: { zoneId: z }, kind: 'zone', params: { baseFare: 25 }, sourceType: 'official', effectiveFrom: '2020-01-01' }] };
  const ds2 = applyCommunity({ ...official, contributors: [vet('a'), vet('b'), vet('c')], contributions: [{ id: 'q', type: 'fare', contributorId: 'a', zoneId: z, createdAt: ago(1), payload: { modeId: 'tricycle', amount: 40 } }], confirmations: ['b', 'c'].map((w) => ({ contributionId: 'q', contributorId: w, agree: true, at: ago(1) })) }, NOW);
  assert.equal(estimateFare(ds2, { modeId: 'tricycle', origin: { lat: 14.628, lng: 121.090 }, destination: { lat: 14.629, lng: 121.088 } }).min, 25);
});

test('verified new jeepney route becomes routable, board/alight anywhere along it', () => {
  // a route along Katipunan Ave (illustrative)
  const pts = [...Array(25)].map((_, i) => [14.6600 - i * 0.0012, 121.0745 + i * 0.0001]);
  const ds = withVerified([{ id: 'nr', type: 'new_route', contributorId: 'a', createdAt: ago(1), payload: { modeId: 'jeepney', signboard: 'KATIPUNAN – CUBAO', fromName: 'Katipunan north', toName: 'Katipunan south', points: pts } }]);
  const line = ds.lines.find((l) => l.id === 'cr-nr');
  assert.ok(line && line.sourceType === 'community_verified');
  const r = planJourney(ds, { origin: { lat: 14.6555, lng: 121.0760 }, destination: { lat: 14.6345, lng: 121.0780 }, departAt: '2026-11-17T08:00:00+08:00', exclude: ['mc_taxi', 'tricycle'] });
  const opt = r.options.find((o) => o.legs.some((l) => l.lineId === 'cr-nr'));
  assert.ok(opt, 'community route used');
  const leg = opt.legs.find((l) => l.lineId === 'cr-nr');
  assert.equal(leg.flexible, true);
  assert.match(leg.instruction, /Para!/);
  assert.ok(opt.walkKm < 0.6, 'boards near the origin, not at the route end');
});

test('verified wait times, last trip and route changes surface in results', () => {
  const mk = (id, type, payload) => ({ id, type, contributorId: 'a', lineId: 'jp-cubao-quiapo', createdAt: ago(1), payload: { modeId: 'jeepney', ...payload } });
  const ds = withVerified([mk('w1', 'wait', { minutes: 4 }), mk('w2', 'wait', { minutes: 8 }), mk('w3', 'wait', { minutes: 6 }),
    mk('lt', 'last_trip', { time: '21:30' }), mk('rc', 'route_change', { description: 'Now turns at Gilmore instead of Broadway' })]);
  const l = ds.lines.find((x) => x.id === 'jp-cubao-quiapo');
  assert.ok(l.communityWait && l.communityWait.min >= 4);
  const r = planJourney(ds, { origin: { lat: 14.6205, lng: 121.0530 }, destination: { lat: 14.6005, lng: 120.9925 }, departAt: '2026-11-17T22:00:00+08:00', exclude: ['rail', 'mc_taxi'] });
  const o = r.options.find((x) => x.legs.some((y) => y.lineId === 'jp-cubao-quiapo'));
  assert.ok(o.warnings.some((w) => /last T-CQ trip/.test(w)));
  assert.ok(o.warnings.some((w) => /Gilmore/.test(w)));
});

test('rider-paid fares calibrate ride-hailing estimates', () => {
  const O = { lat: 14.62, lng: 121.053 }, D = { lat: 14.5507, lng: 121.051 };
  const base = compareProviders(raw, O, D).find((x) => x.provider.id === 'grab-car');
  const contribs = [1, 2, 3].map((i) => ({ id: 'g' + i, type: 'fare', contributorId: 'a', providerId: 'grab-car', createdAt: ago(1), payload: { modeId: 'ridehail_car', amount: Math.round(base.fare.min * 1.2), distanceKm: base.distanceKm, durationMin: (base.duration.min + base.duration.max) / 2 } }));
  const after = compareProviders(withVerified(contribs), O, D).find((x) => x.provider.id === 'grab-car');
  assert.equal(after.fare.sourceType, 'community_verified');
  assert.ok(after.fare.min > base.fare.min * 1.1);
});

test('contributor profile awards badges', () => {
  const p = contributorProfile(vet('a'), { ...raw, contributors: [vet('a')], contributions: [{ id: '1', type: 'fare', contributorId: 'a', createdAt: ago(0), payload: { amount: 13 } }], confirmations: [] }, NOW);
  assert.ok(p.badges.find((b) => b.id === 'unang_para').earned);
  assert.equal(p.contributions.length, 1);
});
