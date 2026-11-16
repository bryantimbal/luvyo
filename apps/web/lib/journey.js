// Current journey query (origin, destination, timing, preferences) and search.
import { session, store, uid, addRecentPlace } from './store.js';
import { api } from './api.js';

export function getJourney() {
  return session.get('journey') || { origin: null, destination: null, timeMode: 'now', time: '' };
}
export function setJourney(patch) {
  const j = { ...getJourney(), ...patch };
  session.set('journey', j);
  return j;
}
export function swap() {
  const j = getJourney();
  return setJourney({ origin: j.destination, destination: j.origin });
}

/** Convert a local Manila "YYYY-MM-DDTHH:MM" input value to ISO. */
export const manilaToIso = (v) => (v ? new Date(v + ':00+08:00').toISOString() : undefined);
export function nowManilaInput(offsetMin = 0) {
  const d = new Date(Date.now() + (offsetMin + 8 * 60) * 60000);
  return d.toISOString().slice(0, 16);
}

export function buildQuery(j = getJourney(), extra = {}) {
  const s = store.get();
  return {
    origin: j.origin, destination: j.destination,
    departAt: j.timeMode === 'depart' ? manilaToIso(j.time) : undefined,
    arriveBy: j.timeMode === 'arrive' ? manilaToIso(j.time) : undefined,
    passengerType: s.profile.passengerType,
    maxWalkKm: s.prefs.maxWalkKm,
    maxTransfers: s.prefs.maxTransfers === '' ? undefined : +s.prefs.maxTransfers,
    exclude: s.prefs.exclude,
    publicOnly: s.prefs.publicOnly, privateOnly: s.prefs.privateOnly,
    budget: s.prefs.budget || undefined,
    priority: s.prefs.priority,
    ...extra,
  };
}

export async function search(extra) {
  const j = getJourney();
  if (!j.origin || !j.destination) throw new Error('Choose where you are starting and where you are going.');
  const plan = await api.search(buildQuery(j, extra));
  session.set('plan', plan);
  addRecentPlace(j.origin); addRecentPlace(j.destination);
  const top = plan.options.find((o) => o.tags.includes('best')) || plan.options[0];
  store.set((s) => ({
    history: [{ id: uid(), at: new Date().toISOString(), origin: j.origin, destination: j.destination, title: top?.title ?? 'No route found', fare: top?.fare ?? null, time: top?.time ?? null, modes: top?.modes ?? [], distanceKm: top?.distanceKm ?? null, started: false }, ...s.history].slice(0, 200),
  }));
  return plan;
}

export const getPlan = () => session.get('plan');
