// Client for contributor features. Reports made offline (common on a moving
// jeep) go to an outbox and are sent when the connection returns.
import { store } from './store.js';
import { auth } from './auth.js';
import { toast } from './ui.js';

const OUTBOX = 'sakaypinoy:outbox';

function headers() {
  const h = { 'Content-Type': 'application/json', 'X-Contributor-Id': store.get().deviceId };
  const s = auth.session();
  if (s?.access_token) h.Authorization = 'Bearer ' + s.access_token;
  return h;
}

async function call(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: headers(), body: opts.body ? JSON.stringify({ displayName: store.get().profile.name || undefined, ...opts.body }) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

const outbox = {
  get() { try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(OUTBOX, JSON.stringify(v)); } catch {} },
};

export const community = {
  async contribute(body) {
    try { return await call('/api/community/contributions', { method: 'POST', body }); }
    catch (e) {
      if (e.status) throw e; // validation / duplicate / limit – tell the user
      outbox.set([...outbox.get(), { kind: 'contribute', body, at: Date.now() }]);
      return { queued: true };
    }
  },
  async confirm(id, body) {
    try { return await call(`/api/community/contributions/${encodeURIComponent(id)}/confirm`, { method: 'POST', body }); }
    catch (e) {
      if (e.status) throw e;
      outbox.set([...outbox.get(), { kind: 'confirm', id, body, at: Date.now() }]);
      return { queued: true };
    }
  },
  verifyFeed: (p) => call(`/api/community/verify${p ? `?lat=${p.lat}&lng=${p.lng}` : ''}`),
  me: () => call('/api/community/me?displayName=' + encodeURIComponent(store.get().profile.name || '')),
  leaderboard: (period) => call(`/api/community/leaderboard?period=${period}&contributorId=${encodeURIComponent(store.get().deviceId)}`),
  line: (id) => call('/api/community/line/' + encodeURIComponent(id)),
  pending: () => outbox.get().length,
  async flush() {
    const items = outbox.get();
    if (!items.length || !navigator.onLine) return;
    const left = [];
    let sent = 0;
    for (const it of items) {
      try {
        if (it.kind === 'contribute') await call('/api/community/contributions', { method: 'POST', body: it.body });
        else await call(`/api/community/contributions/${encodeURIComponent(it.id)}/confirm`, { method: 'POST', body: it.body });
        sent++;
      } catch (e) { if (!e.status) left.push(it); /* rejected items are dropped */ }
    }
    outbox.set(left);
    if (sent) toast(`Sent ${sent} saved report(s). Salamat!`, 'success');
  },
};

addEventListener('online', () => community.flush());

export const TYPE_INFO = {
  fare: { icon: '₱', title: 'Report a fare', desc: 'What you actually paid', pts: 5 },
  wait: { icon: '⏳', title: 'Waiting time', desc: 'How long until a ride came', pts: 3 },
  route_trace: { icon: '🛰️', title: 'Record my ride', desc: 'Map a route with GPS', pts: 15 },
  new_route: { icon: '🆕', title: 'Add a missing route', desc: 'A jeep/UV route we don’t have', pts: 25 },
  loading_spot: { icon: '📍', title: 'Loading spot', desc: 'Where rides reliably stop', pts: 8 },
  route_change: { icon: '🔀', title: 'Route changed', desc: 'Rerouted or no longer passes', pts: 8 },
  last_trip: { icon: '🌙', title: 'Last trip time', desc: 'When the last ride leaves', pts: 5 },
};

export const STATUS = {
  pending: ['⏳', 'Waiting for riders'],
  community_verified: ['✅', 'Rider-verified'],
  disputed: ['⚖️', 'Disputed'],
  needs_reconfirmation: ['🔁', 'Needs re-check'],
  rejected: ['✖️', 'Not accepted'],
};
