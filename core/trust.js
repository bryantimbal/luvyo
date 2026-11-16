// Data provenance classification (spec §30). Every fare, route, schedule and
// estimate carries one of these source types plus a freshness date.

export const SOURCE_TYPES = {
  official: { rank: 1, label: 'Official published', short: 'Official' },
  live_quote: { rank: 2, label: 'Official live provider quote', short: 'Live quote' },
  operator: { rank: 3, label: 'Verified operator information', short: 'Operator' },
  admin_verified: { rank: 4, label: 'Administrator-verified', short: 'Admin-verified' },
  community: { rank: 5, label: 'Community-submitted (unverified)', short: 'Community' },
  indicative: { rank: 6, label: 'Indicative estimate', short: 'Estimate' },
};

export function sourceLabel(type) {
  return (SOURCE_TYPES[type] || SOURCE_TYPES.indicative).label;
}

/** Weakest (least trustworthy) source among several. */
export function weakestSource(types) {
  let worst = 'official';
  for (const t of types) {
    if ((SOURCE_TYPES[t]?.rank ?? 6) > SOURCE_TYPES[worst].rank) worst = t;
  }
  return worst;
}

/** 0..1 confidence used by the "best overall" score. */
export function confidence(type) {
  return 1 - ((SOURCE_TYPES[type]?.rank ?? 6) - 1) * 0.1;
}

export function isStale(lastVerified, now = new Date(), maxAgeDays = 365) {
  if (!lastVerified) return true;
  return (now - new Date(lastVerified)) / 86400000 > maxAgeDays;
}
