// In-app notification centre + local departure reminders.
// Background push is delivered by Firebase Cloud Messaging when configured
// (see docs/NOTIFICATIONS.md); this screen lists everything received.
import { store, pushNotification } from '../lib/store.js';
import { header, esc, empty } from '../lib/ui.js';
import { api } from '../lib/api.js';

export function startReminderLoop() {
  const tick = async () => {
    const s = store.get();
    const due = s.reminders.filter((r) => new Date(r.at) <= new Date());
    if (due.length) {
      store.set((st) => ({ reminders: st.reminders.filter((r) => !due.includes(r)) }));
      for (const r of due) {
        if (s.notifPrefs.departure) {
          pushNotification(r.title, r.body, '#/results');
          if ('Notification' in window && Notification.permission === 'granted') new Notification(r.title, { body: r.body, icon: './icons/icon-192.png' });
        }
      }
    }
    // new advisories (once each)
    if (s.notifPrefs.advisories && navigator.onLine) {
      const adv = await api.advisories().catch(() => []);
      const seenA = JSON.parse(localStorage.getItem('sp:advSeen') || '[]');
      const firstRun = !seenA.length; // don't flood on first launch
      for (const a of adv) if (!seenA.includes(a.id)) { if (!firstRun) pushNotification(a.title, `${a.source} · ${a.area || ''}`, '#/advisories'); seenA.push(a.id); }
      localStorage.setItem('sp:advSeen', JSON.stringify(seenA.slice(-200)));
    }
    // community report status changes
    if (s.notifPrefs.reports && navigator.onLine) {
      const mine = await api.myReports(s.deviceId);
      const seen = JSON.parse(localStorage.getItem('sp:reportStatus') || '{}');
      for (const r of mine) {
        if (seen[r.id] && seen[r.id] !== r.status) pushNotification('Report update', `Your report (${r.category.replace(/_/g, ' ')}) is now ${r.status.replace('_', ' ')}.`, '#/profile');
        seen[r.id] = r.status;
      }
      localStorage.setItem('sp:reportStatus', JSON.stringify(seen));
    }
  };
  tick();
  setInterval(tick, 30000);
}

export default function notifications(el, { go, refresh }) {
  const n = store.get().notifications;
  el.innerHTML = `${header('Notifications', { right: n.length ? '<button class="btn sm ghost" data-read>Mark all read</button>' : '' })}
  <div class="pad">${n.length ? `<ul class="list">${n.map((x) => `<li><button data-id="${esc(x.id)}"><span class="ic">${x.read ? '🔕' : '🔔'}</span><span class="grow"><b>${esc(x.title)}</b><div class="small">${esc(x.body)}</div><div class="muted small">${esc(new Date(x.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))}</div></span></button></li>`).join('')}</ul>`
    : empty('🔔', 'No notifications', 'Departure reminders, advisories for saved routes and report updates appear here.', '<a class="btn soft" href="#/settings">Notification settings</a>')}</div>`;
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-read]')) { store.set((s) => ({ notifications: s.notifications.map((x) => ({ ...x, read: true })) })); refresh(); }
    const b = e.target.closest('[data-id]');
    if (b) {
      const x = n.find((y) => y.id === b.dataset.id);
      store.set((s) => ({ notifications: s.notifications.map((y) => (y.id === x.id ? { ...y, read: true } : y)) }));
      x.link ? go(x.link) : refresh();
    }
  });
}
