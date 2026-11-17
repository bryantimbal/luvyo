// Route labelling and ordering (spec §6). Sponsored content never enters this
// function, so it cannot influence cheapest/fastest rankings (spec §33).

import { confidence } from './trust.js';

const mid = (r) => (r.min + r.max) / 2;
const fareKey = (o) => (o.fare.partial || (o.fare.min === 0 && o.legs.some((l) => l.fare && !l.fare.available)) ? Infinity : o.fare.min);

export const PRIORITIES = {
  best: 'Best overall',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  fewest: 'Fewest transfers',
};

export const DEFAULT_WEIGHTS = {
  valueOfTimePerMin: 1.5, // ₱ a commuter would pay to save one minute
  transferPenalty: 12, // ₱-equivalent inconvenience per transfer
  walkPenaltyPerKm: 25,
  waitMultiplier: 1.5, // waiting feels longer than riding
  unknownFarePenalty: 80,
  lowConfidencePenalty: 20, // scaled by (1 - confidence)
};

/**
 * "Best overall" = generalised cost in ₱-equivalents (lower is better):
 * fare + time × value-of-time + waiting/transfer/walk inconvenience +
 * a penalty for weak data. Weights live in dataset settings.scoring.
 */
function score(o, w) {
  const fare = Number.isFinite(fareKey(o)) ? mid(o.fare) : w.unknownFarePenalty;
  const ride = mid(o.time) - mid(o.wait);
  return (
    fare +
    w.valueOfTimePerMin * (ride + w.waitMultiplier * mid(o.wait)) +
    w.transferPenalty * o.transfers +
    w.walkPenaltyPerKm * o.walkKm +
    w.lowConfidencePenalty * (1 - confidence(o.sourceType))
  );
}

export function rankOptions(options, { priority = 'best', budget = null, weights } = {}) {
  if (!options.length) return options;
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  for (const o of options) { o.score = Math.round(score(o, w) * 10) / 10; o.tags = []; }

  const by = (f) => [...options].sort((a, b) => f(a) - f(b) || mid(a.time) - mid(b.time));
  const tag = (o, t) => o && !o.tags.includes(t) && o.tags.push(t);
  const walkOnly = (o) => o.kind === 'walk';
  // Cheapest must actually be a paid or free ride with known fare; a long walk isn't "cheapest transport".
  tag(by(fareKey).find((o) => Number.isFinite(fareKey(o)) && !walkOnly(o)), 'cheapest');
  tag(by((o) => mid(o.time))[0], 'fastest');
  tag(by((o) => o.transfers * 1000 + mid(o.time)).find((o) => !walkOnly(o)), 'fewest');
  const withinBudget = budget ? options.filter((o) => !o.overBudget) : options;
  tag(by((o) => o.score).find((o) => withinBudget.includes(o)) ?? by((o) => o.score)[0], 'best');

  const sorters = {
    best: (o) => o.score,
    cheapest: (o) => fareKey(o),
    fastest: (o) => mid(o.time),
    fewest: (o) => o.transfers * 1000 + mid(o.time),
  };
  const s = sorters[priority] || sorters.best;
  return [...options].sort((a, b) => {
    const d = s(a) - s(b);
    return Number.isNaN(d) || d === 0 ? a.score - b.score : d;
  });
}
