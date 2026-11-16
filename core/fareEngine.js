// Centralised, data-driven fare engine (spec §8).
// No peso amounts live in this file: every number comes from a fare schedule
// record (fare_schedules / fare_rules tables). If no schedule applies the
// engine returns { available:false } instead of inventing a value.

import { sourceLabel } from './trust.js';

export const PASSENGER_TYPES = ['regular', 'student', 'senior', 'pwd'];

const roundTo = (v, step) => (step ? Math.round(v / step) * step : v);
const round2 = (v) => Math.round(v * 100) / 100;

function unavailable(schedule, reason) {
  return {
    available: false,
    min: null,
    max: null,
    reason,
    sourceType: schedule?.sourceType ?? null,
    sourceLabel: schedule ? sourceLabel(schedule.sourceType) : null,
    lastVerified: schedule?.lastVerified ?? null,
    dataset: schedule?.dataset ?? null,
    breakdown: [],
  };
}

/** Pick the schedule in force for a scope at a given date. */
export function findSchedule(schedules, { lineId, modeId, operatorId, zoneId, providerId }, at = new Date()) {
  const inForce = (s) =>
    s.active !== false &&
    (!s.effectiveFrom || new Date(s.effectiveFrom) <= at) &&
    (!s.effectiveTo || new Date(s.effectiveTo) > at);
  const pick = (pred) =>
    schedules
      .filter((s) => inForce(s) && pred(s))
      .sort((a, b) => new Date(b.effectiveFrom || 0) - new Date(a.effectiveFrom || 0))[0];
  return (
    (lineId && pick((s) => s.scope?.lineId === lineId)) ||
    (zoneId && pick((s) => s.scope?.zoneId === zoneId)) ||
    (providerId && pick((s) => s.scope?.providerId === providerId)) ||
    (operatorId && pick((s) => s.scope?.operatorId === operatorId && !s.scope?.lineId)) ||
    (modeId && pick((s) => s.scope?.modeId === modeId && !s.scope?.lineId && !s.scope?.operatorId && !s.scope?.providerId && !s.scope?.zoneId)) ||
    null
  );
}

function baseFare(schedule, trip) {
  const p = schedule.params || {};
  const km = trip.distanceKm ?? 0;
  const min = trip.durationMin ?? 0;
  const bd = [];
  switch (schedule.kind) {
    case 'distance': {
      // Minimum fare covers baseKm; perKm for each succeeding km (or fraction).
      const extraKm = Math.max(0, Math.ceil(km - p.baseKm));
      const fare = p.baseFare + extraKm * p.perKm;
      bd.push({ label: `Minimum fare (first ${p.baseKm} km)`, amount: p.baseFare });
      if (extraKm) bd.push({ label: `${extraKm} succeeding km × ₱${p.perKm}`, amount: round2(extraKm * p.perKm) });
      return { min: fare, max: fare, bd };
    }
    case 'rail_matrix': {
      const key = `${trip.fromStopId}|${trip.toStopId}`;
      const rev = `${trip.toStopId}|${trip.fromStopId}`;
      const v = p.matrix?.[key] ?? p.matrix?.[rev];
      if (v == null) return null;
      bd.push({ label: 'Station-to-station fare', amount: v });
      return { min: v, max: v, bd };
    }
    case 'rail_distance': {
      // Boarding fee + per-km, clamped (approximates a published matrix).
      let fare = p.boarding + km * p.perKm;
      fare = Math.min(p.maxFare ?? Infinity, Math.max(p.minFare ?? 0, Math.ceil(fare)));
      bd.push({ label: `Boarding ₱${p.boarding} + ₱${p.perKm}/km × ${km.toFixed(1)} km`, amount: fare });
      return { min: fare, max: fare, bd };
    }
    case 'fixed': {
      bd.push({ label: 'Fixed route fare', amount: p.fare });
      return { min: p.fare, max: p.fare, bd };
    }
    case 'meter': {
      const f = p.flagDown + km * p.perKm + min * (p.perMin ?? 0);
      bd.push({ label: 'Flag-down', amount: p.flagDown });
      bd.push({ label: `Distance ${km.toFixed(1)} km × ₱${p.perKm}`, amount: round2(km * p.perKm) });
      if (p.perMin) bd.push({ label: `Travel time ${Math.round(min)} min × ₱${p.perMin}`, amount: round2(min * p.perMin) });
      const hi = f * (p.uncertainty ?? 1.25);
      return { min: f, max: hi, bd };
    }
    case 'tnvs': {
      const f = Math.max(p.minFare ?? 0, p.base + km * p.perKm + min * (p.perMin ?? 0));
      bd.push({ label: 'Base fare', amount: p.base });
      bd.push({ label: `Distance ${km.toFixed(1)} km × ₱${p.perKm}`, amount: round2(km * p.perKm) });
      if (p.perMin) bd.push({ label: `Time ${Math.round(min)} min × ₱${p.perMin}`, amount: round2(min * p.perMin) });
      return { min: f, max: f * (p.surgeMax ?? 1), bd };
    }
    case 'tiered': {
      // tiers: [{ uptoKm, flat }, { uptoKm, perKm }, { perKm }]
      let f = 0, prev = 0;
      for (const t of p.tiers) {
        const end = t.uptoKm ?? Infinity;
        if (km <= prev && t.flat == null) break; // a flat first tier is always charged
        const seg = Math.min(km, end) - prev;
        if (t.flat != null) { f += t.flat; bd.push({ label: `First ${end} km`, amount: t.flat }); }
        else { const a = Math.ceil(seg) * t.perKm; f += a; bd.push({ label: `${Math.ceil(seg)} km × ₱${t.perKm}`, amount: a }); }
        prev = end;
      }
      return { min: f, max: f * (p.surgeMax ?? 1), bd };
    }
    case 'zone': {
      bd.push({ label: 'Zone fare (per passenger)', amount: p.baseFare });
      const max = trip.specialTrip && p.specialTripFare ? p.specialTripFare : p.baseFare;
      if (trip.specialTrip && p.specialTripFare) bd.push({ label: 'Special trip (whole vehicle)', amount: p.specialTripFare });
      return { min: p.baseFare, max, bd };
    }
    case 'negotiated':
      return null;
    default:
      return null;
  }
}

/**
 * Calculate a fare for one leg.
 * @param schedule fare schedule record
 * @param trip { distanceKm, durationMin, fromStopId, toStopId, specialTrip }
 * @param passengerType regular|student|senior|pwd
 */
export function calculateFare(schedule, trip, passengerType = 'regular') {
  if (!schedule) return unavailable(null, 'No fare schedule configured for this service');
  const r = baseFare(schedule, trip);
  if (!r) {
    return unavailable(
      schedule,
      schedule.kind === 'negotiated' ? 'Fare is negotiated locally – no verified amount' : 'Fare not available for this trip'
    );
  }
  const step = schedule.params?.rounding ?? 0.25;
  let min = roundTo(r.min, step);
  let max = roundTo(r.max, step);
  let discountApplied = null;
  const notes = [];
  if (passengerType !== 'regular') {
    const elig = schedule.discounts?.[passengerType];
    if (elig && typeof elig.rate === 'number') {
      min = roundTo(min * (1 - elig.rate), step);
      max = roundTo(max * (1 - elig.rate), step);
      discountApplied = { type: passengerType, rate: elig.rate, legalBasis: elig.legalBasis ?? null };
      r.bd.push({ label: `${passengerType} discount ${Math.round(elig.rate * 100)}%`, amount: null });
    } else {
      notes.push(`Discount eligibility for ${passengerType} passengers is not confirmed for this service – regular fare shown.`);
    }
  }
  if (schedule.sourceType === 'indicative') notes.push(schedule.disclaimer || 'Indicative estimate – final fare is determined by the operator/provider.');
  return {
    available: true,
    min: round2(min),
    max: round2(max),
    currency: 'PHP',
    breakdown: r.bd,
    passengerType,
    discountApplied,
    sourceType: schedule.sourceType,
    sourceLabel: sourceLabel(schedule.sourceType),
    sourceNote: schedule.sourceNote ?? null,
    lastVerified: schedule.lastVerified ?? null,
    dataset: schedule.dataset ?? null,
    scheduleId: schedule.id,
    notes,
  };
}

/** Sum leg fares. If any paid leg is unavailable, the total is flagged partial. */
export function sumFares(fares) {
  let min = 0, max = 0, partial = false;
  for (const f of fares) {
    if (f == null) continue; // walking
    if (!f.available) { partial = true; continue; }
    min += f.min; max += f.max;
  }
  return { min: round2(min), max: round2(max), partial, currency: 'PHP' };
}

export function formatPeso(v) {
  if (v == null) return '—';
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatFareRange(min, max, { partial } = {}) {
  if (min == null) return 'Fare unavailable';
  const f = (v) => '₱' + (Number.isInteger(v) ? v : v.toFixed(2));
  const s = Math.abs(max - min) < 0.01 ? f(min) : `${f(min)}–${f(max)}`;
  return partial ? `${s}+` : s;
}
