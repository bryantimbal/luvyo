// Local, offline-first user store. Guest data lives on the device; when a
// Supabase session exists, lib/sync.js mirrors it to the user's rows (RLS).

const KEY = 'sakaypinoy:v1';
const defaults = () => ({
  onboarded: false,
  deviceId: crypto.randomUUID(),
  profile: { name: '', passengerType: 'regular', language: 'en', budgetDaily: null, budgetMonthly: null },
  prefs: { maxWalkKm: 1, exclude: [], maxTransfers: '', priority: 'best' },
  notifPrefs: { advisories: true, savedRoutes: true, departure: true, reports: true },
  savedLocations: [], // { id, label, name, lat, lng }
  savedRoutes: [], // { id, name, origin, destination, prefs, lastFare, lastTime, savedAt }
  history: [], // { id, at, origin, destination, title, fare, time, modes, distanceKm, started }
  expenses: [], // { id, at, amount, note, modes, distanceKm, estimated }
  notifications: [], // { id, at, title, body, read, link }
  recentPlaces: [],
  reminders: [],
  lastSync: null,
});

let state;
try { state = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = defaults(); }

const listeners = new Set();
export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
    listeners.forEach((f) => f(state));
  },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
  reset() { try { localStorage.removeItem(KEY); localStorage.removeItem('sakaypinoy:dataset'); sessionStorage.clear(); } catch {} state = defaults(); },
};

export const FREE_SAVED_ROUTE_LIMIT = 10;
export const uid = () => crypto.randomUUID();

export function pushNotification(title, body, link = null) {
  store.set((s) => ({ notifications: [{ id: uid(), at: new Date().toISOString(), title, body, link, read: false }, ...s.notifications].slice(0, 100) }));
}

export function addRecentPlace(p) {
  if (!p?.name || p.name === 'Current location') return;
  store.set((s) => ({ recentPlaces: [{ name: p.name, lat: p.lat, lng: p.lng }, ...s.recentPlaces.filter((x) => x.name !== p.name)].slice(0, 8) }));
}

// Session (current search) survives reloads but not new tabs.
export const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem('sp:' + k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem('sp:' + k, JSON.stringify(v)); } catch {} },
};
