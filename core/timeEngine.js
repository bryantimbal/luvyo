// Travel-time estimation (spec §9). Speeds, headways and overheads are read
// from the dataset's `timeProfiles` config, not hard-coded per screen.
// Traffic status is reported honestly: 'live' only if a live provider fed
// the numbers; otherwise 'typical' (configured profile) or 'unavailable'.

export const TZ = 'Asia/Manila';

/** Minutes since midnight in Manila for a Date. */
// Asia/Manila has no DST (UTC+8 year-round), so a fixed offset is exact and
// avoids slow Intl calls inside the routing loop.
const MANILA_OFFSET_MIN = 8 * 60;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const local = (date) => new Date(date.getTime() + MANILA_OFFSET_MIN * 60000);

export function manilaMinutes(date) {
  const d = local(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function manilaDay(date) {
  return DAYS[local(date).getUTCDay()];
}

export function timeBand(profiles, date) {
  const m = manilaMinutes(date);
  for (const b of profiles.bands) {
    const [s, e] = [hm(b.start), hm(b.end)];
    if (s <= e ? m >= s && m < e : m >= s || m < e) return b.id;
  }
  return 'offpeak';
}

export const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** Is a line operating at `date`? Returns { ok, known }. */
export function isOperating(line, date) {
  const hrs = line.operatingHours;
  if (!hrs) return { ok: true, known: false };
  const day = manilaDay(date);
  const rule = hrs[day] ?? hrs.default;
  if (!rule) return { ok: true, known: false };
  if (rule === 'closed') return { ok: false, known: true };
  const m = manilaMinutes(date);
  const s = hm(rule.start), e = hm(rule.end);
  const ok = s <= e ? m >= s && m <= e : m >= s || m <= e;
  return { ok, known: true };
}

/**
 * Ride time range in minutes for a mode over a distance.
 * @returns { min, max, traffic: 'typical'|'live'|'unavailable' }
 */
export function rideMinutes(profiles, modeId, distanceKm, date, nStops = 0) {
  const p = profiles.modes[modeId];
  if (!p) return { min: null, max: null, traffic: 'unavailable' };
  const band = timeBand(profiles, date);
  const [vSlow, vFast] = p.speedKmh[band] ?? p.speedKmh.offpeak;
  const dwell = (p.dwellMinPerStop ?? 0) * nStops;
  return {
    min: (distanceKm / vFast) * 60 + dwell,
    max: (distanceKm / vSlow) * 60 + dwell,
    traffic: p.roadBased ? 'typical' : 'n/a',
  };
}

export function waitMinutes(profiles, modeId, line) {
  const p = profiles.modes[modeId];
  const hw = line?.headwayMin ?? p?.headwayMin;
  if (!hw) return { min: 0, max: 0, known: false };
  // Random arrival: between 0 and one headway; we present a practical range.
  return { min: Math.max(1, hw[0] / 2), max: hw[1], known: !!line?.headwayMin };
}

export function walkMinutes(profiles, km) {
  return (km / profiles.walkKmh) * 60;
}

export function addMinutes(date, min) {
  return new Date(date.getTime() + min * 60000);
}

const clockFmt = new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export function formatClock(date) {
  return clockFmt.format(new Date(date));
}

export function formatDuration(min, max) {
  const f = (m) => {
    m = Math.round(m);
    return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${m} min`;
  };
  if (max == null || Math.round(max) === Math.round(min)) return f(min);
  if (min < 60 && max < 60) return `${Math.round(min)}–${Math.round(max)} min`;
  return `${f(min)} – ${f(max)}`;
}
