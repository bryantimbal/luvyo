import { store } from '../lib/store.js';
import { syncDataset, cachedDataset } from '../lib/api.js';
import { header, esc, toast } from '../lib/ui.js';
import { languageSwitch } from '../lib/i18n.js';

export default function settings(el, { refresh }) {
  const s = store.get();
  const ds = cachedDataset();
  const np = s.notifPrefs;
  el.innerHTML = `${header('Settings')}
  <div class="pad stack">
    <section class="card"><div class="row between"><h2 style="margin:0">Language / Wika</h2>${languageSwitch()}</div>
      <p class="muted small">English is the default. Place names, route signboards and rider reports stay as written.</p></section>
    <section class="card"><h2>Notifications</h2>
      ${[['advisories', 'Service advisories & interruptions'], ['savedRoutes', 'Saved-route updates'], ['departure', 'Departure & commute reminders'], ['reports', 'Community report status']].map(([k, l]) => `<label class="toggle"><span>${l}</span><input type="checkbox" data-np="${k}" ${np[k] ? 'checked' : ''}></label>`).join('')}
      <p class="muted small">Device permission: <b>${'Notification' in window ? Notification.permission : 'unsupported'}</b>. ${'Notification' in window && Notification.permission === 'default' ? '<button class="btn sm soft" data-perm>Allow</button>' : ''}</p>
      <p class="muted small">We keep notifications few and relevant. Background push requires Firebase Cloud Messaging on the server.</p>
    </section>
    <section class="card"><h2>Default route preferences</h2>
      <label class="toggle"><span>Avoid motorcycle taxis</span><input type="checkbox" data-ex="mc_taxi" ${s.prefs.exclude.includes('mc_taxi') ? 'checked' : ''}></label>
      <label class="toggle"><span>Avoid jeepneys</span><input type="checkbox" data-ex="jeepney" ${s.prefs.exclude.includes('jeepney') ? 'checked' : ''}></label>
      <label class="toggle"><span>Avoid tricycles</span><input type="checkbox" data-ex="tricycle" ${s.prefs.exclude.includes('tricycle') ? 'checked' : ''}></label>
      <label class="toggle"><span>Public transport only</span><input type="checkbox" data-po ${s.prefs.publicOnly ? 'checked' : ''}></label>
      <p class="muted small">More options (walking distance, transfers, budget) are in the ⚙️ filter on the route results screen.</p>
    </section>
    <section class="card"><h2>Offline data</h2>
      <dl class="kv"><dt>Last synced</dt><dd>${s.lastSync ? esc(new Date(s.lastSync).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })) : 'Never'}</dd>
      <dt>Cached</dt><dd>${ds ? `${ds.stops.length} stops · ${ds.lines.length} routes · ${ds.fareSchedules.length} fare schedules` : 'Nothing yet'}</dd>
      <dt>Dataset</dt><dd>${esc(ds?.meta?.name || '—')}</dd></dl>
      ${ds?.meta?.warning ? `<p class="small" style="color:#9a3412">⚠️ ${esc(ds.meta.warning)}</p>` : ''}
      <div class="row"><button class="btn sm" data-sync>Sync now</button><button class="btn sm ghost" data-clear>Clear cache</button></div>
      <p class="muted small">Cached data is used only when you're offline and is always labelled as cached.</p>
    </section>
    <section class="card"><h2>About</h2><p class="small">LUVYO compares transport options using official, operator, administrator-verified, community and indicative data – each labelled. <a href="#/privacy">Privacy & Terms</a> · <a href="/admin/" target="_blank" rel="noopener">Admin portal</a></p></section>
  </div>`;

  el.addEventListener('change', (e) => {
    const k = e.target.dataset.np;
    if (k) store.set((st) => ({ notifPrefs: { ...st.notifPrefs, [k]: e.target.checked } }));
    const ex = e.target.dataset.ex;
    if (ex) store.set((st) => ({ prefs: { ...st.prefs, exclude: e.target.checked ? [...new Set([...st.prefs.exclude, ex])] : st.prefs.exclude.filter((x) => x !== ex) } }));
    if ('po' in e.target.dataset) store.set((st) => ({ prefs: { ...st.prefs, publicOnly: e.target.checked, privateOnly: false } }));
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-perm]')) { await Notification.requestPermission(); refresh(); }
    if (e.target.closest('[data-sync]')) { try { await syncDataset(true); toast('Transport data synced', 'success'); refresh(); } catch { toast('Sync failed – you seem to be offline', 'error'); } }
    if (e.target.closest('[data-clear]')) {
      localStorage.removeItem('luvyo:dataset');
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
      store.set({ lastSync: null }); toast('Cache cleared'); location.reload();
    }
  });
}
