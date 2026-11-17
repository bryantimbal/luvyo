// Service worker: app shell precache, network-first API with cached fallback,
// bounded map-tile cache. Cached API responses are only served offline, and the
// app labels them as cached.
const VERSION = 'luvyo-v1-mwk9hx1x';
const SHELL = [
  './', './index.html', './lib/standalone.js', './data/dataset.json', './core/communityService.js', './styles.css', './app.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './lib/ui.js', './lib/store.js', './lib/api.js', './lib/i18n.js', './lib/map.js', './lib/auth.js', './lib/location.js', './lib/journey.js', './lib/community.js',
  './core/geo.js', './core/trust.js', './core/fareEngine.js', './core/timeEngine.js', './core/router.js', './core/ranking.js', './core/assistant.js', './core/community.js',
  ...['onboarding', 'login', 'home', 'pick', 'results', 'route', 'navigate', 'explore', 'map', 'jeepney', 'line', 'tricycle', 'ridehail', 'fare', 'myroutes', 'commute', 'history', 'advisories', 'assistant', 'notifications', 'profile', 'settings', 'privacy', 'report', 'ambag', 'contribute', 'record', 'leaderboard'].map((s) => `./screens/${s}.js`),
];
const TILE_LIMIT = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(VERSION + '-tiles').then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') {
        c.put(e.request, res.clone());
        c.keys().then((ks) => ks.length > TILE_LIMIT && Promise.all(ks.slice(0, ks.length - TILE_LIMIT).map((k) => c.delete(k))));
      }
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (!['/api/dataset', '/api/advisories', '/api/config'].includes(url.pathname)) return;
    e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(VERSION + '-api').then((c) => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request)));
    return;
  }
  // app shell: stale-while-revalidate
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit || caches.match('./index.html'));
    return hit || net;
  }));
});

// FCM / Web Push payloads: { title, body, link }
self.addEventListener('push', (e) => {
  const d = e.data?.json?.() ?? {};
  e.waitUntil(self.registration.showNotification(d.title || 'LUVYO', { body: d.body || '', icon: './icons/icon-192.png', data: { link: d.link || './#/notifications' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.link || './'));
});
