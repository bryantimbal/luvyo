import './lib/standalone.js';
// LUVYO PWA shell: hash router, bottom navigation, lifecycle.
import { store } from './lib/store.js';
import { api, syncDataset } from './lib/api.js';
import { auth } from './lib/auth.js';
import { setTileUrl } from './lib/map.js';
import { t, applyLanguage, setLanguage } from './lib/i18n.js';
import { $, esc } from './lib/ui.js';
import { startReminderLoop } from './screens/notifications.js';
import { community } from './lib/community.js';

const routes = {
  onboarding: () => import('./screens/onboarding.js'),
  login: () => import('./screens/login.js'),
  home: () => import('./screens/home.js'),
  pick: () => import('./screens/pick.js'),
  results: () => import('./screens/results.js'),
  route: () => import('./screens/route.js'),
  navigate: () => import('./screens/navigate.js'),
  explore: () => import('./screens/explore.js'),
  map: () => import('./screens/map.js'),
  jeepney: () => import('./screens/jeepney.js'),
  line: () => import('./screens/line.js'),
  tricycle: () => import('./screens/tricycle.js'),
  ridehail: () => import('./screens/ridehail.js'),
  fare: () => import('./screens/fare.js'),
  myroutes: () => import('./screens/myroutes.js'),
  commute: () => import('./screens/commute.js'),
  history: () => import('./screens/history.js'),
  advisories: () => import('./screens/advisories.js'),
  assistant: () => import('./screens/assistant.js'),
  notifications: () => import('./screens/notifications.js'),
  profile: () => import('./screens/profile.js'),
  settings: () => import('./screens/settings.js'),
  privacy: () => import('./screens/privacy.js'),
  report: () => import('./screens/report.js'),
  ambag: () => import('./screens/ambag.js'),
  contribute: () => import('./screens/contribute.js'),
  record: () => import('./screens/record.js'),
  leaderboard: () => import('./screens/leaderboard.js'),
};
const TAB_OF = { home: 'home', pick: 'home', results: 'home', route: 'home', navigate: 'home', explore: 'explore', map: 'explore', jeepney: 'explore', line: 'explore', tricycle: 'explore', ridehail: 'explore', fare: 'explore', advisories: 'explore', assistant: 'home', myroutes: 'myroutes', history: 'myroutes', commute: 'myroutes', profile: 'profile', ambag: 'ambag', contribute: 'ambag', record: 'ambag', leaderboard: 'ambag', settings: 'profile', privacy: 'profile', notifications: 'home', report: 'explore' };
const NO_NAV = new Set(['onboarding', 'login', 'navigate']);

let cleanup = null;
const view = $('#view');

export function go(hash) { location.hash = hash; }

function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name, ...params] = path.split('/').filter(Boolean);
  return { name: name || '', params: params.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function render() {
  let { name, params, query } = parse();
  const s = store.get();
  if (!s.onboarded && name !== 'onboarding' && name !== 'privacy') return go('#/onboarding');
  if (!routes[name]) return go('#/home');
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  document.querySelectorAll('.sheet-wrap').forEach((x) => x.remove()); // sheets belong to the screen that opened them
  cleanup = null;
  renderNav(name);
  view.setAttribute('aria-busy', 'true');
  try {
    const mod = await routes[name]();
    // Fresh container per render so screen event listeners never accumulate.
    const el = document.createElement('div');
    view.replaceChildren(el);
    view.className = 'view screen-' + name;
    window.scrollTo(0, 0);
    cleanup = await mod.default(el, { params, query, go, refresh: render });
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="pad"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div>`;
  }
  view.removeAttribute('aria-busy');
}

function renderNav(name) {
  const nav = $('#bottom-nav');
  nav.hidden = NO_NAV.has(name);
  const active = TAB_OF[name];
  // Centre "Ambag" (contribute) button is raised: community data powers jeeps, trikes, taxis & ride-hailing.
  const tabs = [['home', '🏠'], ['explore', '🧭'], ['ambag', '＋'], ['myroutes', '⭐'], ['profile', '👤']];
  const labels = { home: t('home'), explore: t('explore'), ambag: 'Ambag', myroutes: t('myRoutes'), profile: t('profile') };
  nav.innerHTML = tabs.map(([id, ic]) => `<a href="#/${id}" class="${active === id ? 'active' : ''} ${id === 'ambag' ? 'fab' : ''}" ${active === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${ic}</span><span>${labels[id]}</span></a>`).join('');
}

document.addEventListener('click', (e) => {
  const lb = e.target.closest('[data-lang]');
  // onboarding redraws its own slide; elsewhere re-render the screen + nav
  if (lb) { setLanguage(lb.dataset.lang, lb.closest('.onb') ? null : render); return; }
  if (e.target.closest('[data-back]')) { e.preventDefault(); history.length > 1 ? history.back() : go('#/home'); }
});

function demoBanner() {
  if (!globalThis.LUVYO_STANDALONE) return;
  try { if (sessionStorage.getItem('luvyo:demo-ok')) return; } catch {}
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.setAttribute('role', 'note');
  b.innerHTML = '<span><b>Demo build.</b> Runs on your phone with test data and simulated riders. Your reports stay on this device.</span><button type="button" aria-label="Dismiss">✕</button>';
  // the Android app's status bar sits above the WebView, so no extra top inset is needed
  b.querySelector('button').onclick = () => { b.remove(); try { sessionStorage.setItem('luvyo:demo-ok', '1'); } catch {} };
  document.body.prepend(b);
}

function netBanner() {
  $('#offline-banner').hidden = navigator.onLine;
  $('#offline-banner').textContent = `Offline – showing cached data${store.get().lastSync ? ' (last synced ' + new Date(store.get().lastSync).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) + ')' : ''}`;
}
addEventListener('online', () => { netBanner(); syncDataset(); });
addEventListener('offline', netBanner);
addEventListener('hashchange', render);

(async function boot() {
  applyLanguage(); // English by default; Filipino if the user chose it
  demoBanner();
  netBanner();
  const cfg = await api.config();
  auth.configure(cfg);
  setTileUrl(cfg.tiles);
  syncDataset(); // background – enables offline routing
  await render();
  startReminderLoop();
  community.flush();
  setTimeout(() => $('#splash')?.classList.add('gone'), 350);
  setTimeout(() => $('#splash')?.remove(), 900);
  // Service worker: web only. The Android app already ships every file inside the APK.
  const nativeApp = !!globalThis.Capacitor?.isNativePlatform?.();
  if (nativeApp) document.documentElement.classList.add('native-app');
  if (!nativeApp && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
