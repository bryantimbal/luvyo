import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateFare, findSchedule, sumFares, formatFareRange } from '../core/fareEngine.js';
import { isOperating, manilaMinutes, formatDuration } from '../core/timeEngine.js';
import { planJourney, linesPassing, compareProviders, estimateFare, nearbyStops } from '../core/router.js';
import { parseQuery, answer } from '../core/assistant.js';
import { haversineKm } from '../core/geo.js';

const ds = JSON.parse(readFileSync(new URL('../data/dev/dataset.json', import.meta.url)));
const P = (n) => ds.places.find((p) => p.name === n);
const AM = '2026-11-17T08:00:00+08:00';

// ---------------------------------------------------------------- fares ---
const dist = { id: 't', kind: 'distance', sourceType: 'official', params: { baseFare: 13, baseKm: 4, perKm: 1.8, rounding: 0.25 },
  discounts: { student: { rate: 0.2 } } };

test('distance fare: minimum covers base km', () => {
  assert.equal(calculateFare(dist, { distanceKm: 3.2 }).min, 13);
  assert.equal(calculateFare(dist, { distanceKm: 4 }).min, 13);
});

test('distance fare: each succeeding km or fraction adds perKm', () => {
  // 6.1 km → 3 succeeding km → 13 + 5.4 = 18.4 → rounded to 18.5
  assert.equal(calculateFare(dist, { distanceKm: 6.1 }).min, 18.5);
});

test('discount applies only when eligibility is configured', () => {
  const f = calculateFare(dist, { distanceKm: 3 }, 'student');
  assert.equal(f.min, 10.5); // 13 × 0.8 = 10.4 → 10.5
  assert.equal(f.discountApplied.type, 'student');
  const s = calculateFare(dist, { distanceKm: 3 }, 'senior');
  assert.equal(s.min, 13);
  assert.equal(s.discountApplied, null);
  assert.match(s.notes.join(' '), /not confirmed/);
});

test('negotiated fare is reported unavailable, never invented', () => {
  const f = calculateFare({ id: 'n', kind: 'negotiated', sourceType: 'community', params: {} }, { distanceKm: 2 });
  assert.equal(f.available, false);
  assert.equal(f.min, null);
});

test('missing schedule → unavailable', () => {
  assert.equal(calculateFare(null, { distanceKm: 2 }).available, false);
});

test('rail_distance clamps to min/max', () => {
  const s = ds.fareSchedules.find((x) => x.id === 'fare-mrt3');
  assert.equal(calculateFare(s, { distanceKm: 0.5 }).min, 13);
  assert.equal(calculateFare(s, { distanceKm: 40 }).min, 28);
});

test('rail_matrix uses station pair in either direction', () => {
  const s = { id: 'm', kind: 'rail_matrix', sourceType: 'official', params: { matrix: { 'a|b': 20 }, rounding: 1 } };
  assert.equal(calculateFare(s, { fromStopId: 'b', toStopId: 'a' }).min, 20);
  assert.equal(calculateFare(s, { fromStopId: 'a', toStopId: 'c' }).available, false);
});

test('tiered motorcycle taxi fare', () => {
  const s = ds.fareSchedules.find((x) => x.id === 'fare-angkas');
  assert.equal(calculateFare(s, { distanceKm: 0 }).min, 50); // minimum always charged
  assert.equal(calculateFare(s, { distanceKm: 1.5 }).min, 50);
  assert.equal(calculateFare(s, { distanceKm: 5 }).min, 80); // 50 + 3×10
  assert.equal(calculateFare(s, { distanceKm: 9 }).min, 130); // 50 + 5×10 + 2×15
});

test('findSchedule prefers line > operator > mode and respects effective dates', () => {
  const sch = [
    { id: 'mode', scope: { modeId: 'jeepney' }, effectiveFrom: '2020-01-01' },
    { id: 'op', scope: { operatorId: 'x' }, effectiveFrom: '2020-01-01' },
    { id: 'future', scope: { lineId: 'L' }, effectiveFrom: '2099-01-01' },
  ];
  assert.equal(findSchedule(sch, { lineId: 'L', operatorId: 'x', modeId: 'jeepney' }).id, 'op');
  assert.equal(findSchedule(sch, { lineId: 'L', operatorId: 'y', modeId: 'jeepney' }).id, 'mode');
});

test('sumFares flags partial totals', () => {
  const r = sumFares([{ available: true, min: 13, max: 13 }, null, { available: false }]);
  assert.deepEqual([r.min, r.partial], [13, true]);
  assert.equal(formatFareRange(13, 13, r), '₱13+');
});

// ----------------------------------------------------------------- time ---
test('Manila clock and operating hours', () => {
  assert.equal(manilaMinutes(new Date('2026-11-17T00:00:00Z')), 8 * 60);
  const mrt = ds.lines.find((l) => l.id === 'mrt3');
  assert.equal(isOperating(mrt, new Date('2026-11-17T08:00:00+08:00')).ok, true);
  assert.equal(isOperating(mrt, new Date('2026-11-17T02:00:00+08:00')).ok, false);
});

test('formatDuration', () => {
  assert.equal(formatDuration(35, 45), '35–45 min');
  assert.equal(formatDuration(50, 75), '50 min – 1 hr 15 min');
});

// -------------------------------------------------------------- routing ---
test('Cubao → BGC returns labelled transit + private options', () => {
  const r = planJourney(ds, { origin: P('Araneta City (Cubao)'), destination: P('BGC High Street'), departAt: AM });
  const tags = r.options.flatMap((o) => o.tags);
  for (const t of ['cheapest', 'fastest', 'fewest', 'best']) assert.ok(tags.includes(t), t);
  assert.ok(r.options.some((o) => o.modes.includes('rail')));
  assert.ok(r.options.some((o) => o.kind === 'mc_taxi'));
  for (const o of r.options) {
    assert.ok(o.time.max >= o.time.min);
    assert.ok(o.legs.length >= 1);
    assert.ok(o.sourceType);
  }
});

test('totals equal sum of legs (no double counting)', () => {
  const r = planJourney(ds, { origin: P('UP Diliman'), destination: P('Ayala Center Makati'), departAt: AM });
  for (const o of r.options) {
    const t = o.legs.reduce((s, l) => s + l.time.min + (l.wait?.min ?? 0), 0);
    assert.ok(Math.abs(t - o.time.min) < 1e-6);
    const f = o.legs.reduce((s, l) => s + (l.fare?.available ? l.fare.min : 0), 0);
    assert.ok(Math.abs(f - o.fare.min) < 0.01);
  }
});

test('exclusions are respected', () => {
  const r = planJourney(ds, { origin: P('Araneta City (Cubao)'), destination: P('BGC High Street'), departAt: AM, exclude: ['mc_taxi', 'rail'] });
  for (const o of r.options) for (const l of o.legs) assert.ok(!['mc_taxi', 'rail'].includes(l.modeId));
  const pub = planJourney(ds, { origin: P('Araneta City (Cubao)'), destination: P('BGC High Street'), departAt: AM, publicOnly: true });
  for (const o of pub.options) for (const l of o.legs) assert.ok(!['mc_taxi', 'taxi', 'ridehail_car'].includes(l.modeId));
});

test('trains are not offered outside operating hours', () => {
  const r = planJourney(ds, { origin: P('SM North EDSA'), destination: P('Ayala Center Makati'), departAt: '2026-11-17T02:00:00+08:00' });
  for (const o of r.options) assert.ok(!o.modes.includes('rail'), o.title);
});

test('arrive-by gives a recommended departure', () => {
  const r = planJourney(ds, { origin: P('UP Diliman'), destination: P('Ayala Center Makati'), arriveBy: '2026-11-17T09:00:00+08:00' });
  assert.ok(r.recommendedDeparture);
  assert.ok(new Date(r.recommendedDeparture) < new Date('2026-11-17T09:00:00+08:00'));
});

test('non-operational ferry is never used', () => {
  const r = planJourney(ds, { origin: P('Greenhills'), destination: P('Intramuros'), departAt: AM });
  for (const o of r.options) assert.ok(!o.modes.includes('ferry'));
});

test('max transfers filter', () => {
  const r = planJourney(ds, { origin: P('Eastwood City'), destination: P('SM Mall of Asia'), departAt: AM, maxTransfers: 0 });
  assert.ok(r.options.length > 0);
  for (const o of r.options) assert.equal(o.transfers, 0);
});

test('budget marks over-budget options', () => {
  const r = planJourney(ds, { origin: P('Araneta City (Cubao)'), destination: P('BGC High Street'), departAt: AM, budget: 100 });
  assert.ok(r.options.some((o) => o.overBudget));
  assert.ok(!r.options.find((o) => o.tags.includes('best')).overBudget);
});

test('discovery helpers', () => {
  const near = nearbyStops(ds, P('Araneta City (Cubao)'), 0.6);
  assert.ok(near.some((s) => s.modes.includes('rail')));
  const passing = linesPassing(ds, { lat: 14.6040, lng: 121.0170 }, 0.3, 'jeepney');
  assert.ok(passing.some((x) => x.line.id === 'jp-cubao-quiapo'));
  const cmp = compareProviders(ds, P('Araneta City (Cubao)'), P('BGC High Street'));
  assert.ok(cmp.length >= 4);
  assert.ok(cmp.every((c) => c.availability !== 'confirmed')); // no live integrations configured
  const f = estimateFare(ds, { lineId: 'mrt3', fromStopId: 'mrt3-north-avenue', toStopId: 'mrt3-taft-avenue' });
  assert.equal(f.min, 28);
});

test('tricycle without a configured tariff shows unavailable fare', () => {
  const f = estimateFare(ds, { modeId: 'tricycle', origin: { lat: 14.70, lng: 121.10 }, destination: { lat: 14.705, lng: 121.10 } });
  assert.equal(f.available, false);
});

test('geo sanity: Cubao ↔ Ayala ≈ 9.5 km', () => {
  const d = haversineKm(P('Araneta City (Cubao)'), P('Ayala Center Makati'));
  assert.ok(d > 8 && d < 11, d);
});

// ------------------------------------------------------------ assistant ---
test('assistant parses English and Taglish', () => {
  const a = parseQuery(ds.places, 'How do I get from Cubao to BGC for less than ₱100?');
  assert.equal(a.origin.name, 'Araneta City (Cubao)');
  assert.equal(a.destination.name, 'BGC High Street');
  assert.equal(a.budget, 100);
  const q = parseQuery(ds.places, 'Anong jeep mula Quiapo papuntang Divisoria?');
  assert.equal(q.origin.name, 'Quiapo Church');
  assert.equal(q.destination.name, 'Divisoria');
  const b = parseQuery(ds.places, 'Anong jeep ang sasakyan ko papuntang Divisoria?');
  assert.equal(b.destination.name, 'Divisoria');
  assert.ok(b.modes.includes('jeepney'));
  const c = parseQuery(ds.places, 'Mas mura ba ang MRT o JoyRide papuntang Makati?');
  assert.equal(c.intent, 'compare');
  assert.deepEqual(c.modes.sort(), ['mc_taxi', 'rail']);
  const d = parseQuery(ds.places, 'How much will I spend commuting from UP to Makati for 22 days?');
  assert.equal(d.days, 22);
});

test('assistant answers only from engine output', () => {
  const r = answer(ds, 'Cubao to BGC under 100');
  assert.ok(r.plan.options.length);
  assert.match(r.text, /Cubao/);
  const none = answer(ds, 'How do I get to Atlantis?');
  assert.ok(!none.plan);
});
