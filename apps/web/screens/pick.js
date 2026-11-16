// Origin / destination picker: autocomplete, current location, saved places, map pick.
/* global L */
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, toast, $ } from '../lib/ui.js';
import { setJourney } from '../lib/journey.js';
import { currentPosition, inPhilippines } from '../lib/location.js';
import { createMap, pin } from '../lib/map.js';
import { t } from '../lib/i18n.js';

export default function pick(el, { params, query, go }) {
  const which = params[0] === 'destination' ? 'destination' : 'origin';
  const back = query.back || '#/home';
  const s = store.get();
  const choose = (p) => {
    // custom callback targets (e.g. fare calculator) are stored in session by the caller
    const target = query.target;
    if (target) sessionStorage.setItem('sp:pick:' + target, JSON.stringify(p));
    else setJourney({ [which]: { name: p.name, lat: p.lat, lng: p.lng } });
    go(back);
  };
  el.innerHTML = `${header(which === 'origin' ? t('chooseOrigin') : t('chooseDest'))}
  <div class="pad stack">
    <input class="input" id="q" type="search" placeholder="Search address, landmark, station…" autocomplete="off" aria-label="Search place">
    <ul class="list" id="res" aria-live="polite"></ul>
    <div id="fixed">
      <ul class="list">
        <li><button data-cur><span class="ic">📍</span><span class="grow"><b>${t('currentLocation')}</b><div class="muted small">Uses your device location once</div></span></button></li>
        <li><button data-map><span class="ic">🗺️</span><span class="grow"><b>Choose on map</b><div class="muted small">Tap a point on the map</div></span></button></li>
        ${s.savedLocations.map((p) => `<li><button data-saved="${esc(p.id)}"><span class="ic">⭐</span><span class="grow"><b>${esc(p.label)}</b><div class="muted small">${esc(p.name)}</div></span></button></li>`).join('')}
      </ul>
      ${s.recentPlaces.length ? `<h3 style="margin-top:16px">Recent</h3><ul class="list">${s.recentPlaces.map((p, i) => `<li><button data-recent="${i}"><span class="ic">🕘</span><span class="grow">${esc(p.name)}</span></button></li>`).join('')}</ul>` : ''}
    </div>
    <div id="mapbox" class="hidden"><div id="m" class="map" style="height:360px"></div><p class="muted small">Tap the map to drop a pin, then confirm.</p><button class="btn block" id="confirm" disabled>Use this point</button></div>
  </div>`;

  let results = [];
  let timer;
  const q = $('#q', el);
  q.focus();
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const v = q.value.trim();
      $('#fixed', el).classList.toggle('hidden', v.length >= 2);
      if (v.length < 2) { $('#res', el).innerHTML = ''; return; }
      try {
        results = await api.places(v);
        $('#res', el).innerHTML = results.length
          ? results.map((p, i) => `<li><button data-res="${i}"><span class="ic">${p.type === 'station' ? '🚆' : '📌'}</span><span class="grow"><b>${esc(p.name)}</b><div class="muted small">${esc(p.type)}${p.dataset === 'development' ? ' · dev data' : ''}</div></span></button></li>`).join('')
          : `<li class="item muted">No match in LUVYO's place list. Try a nearby landmark or choose on the map.</li>`;
      } catch (e) { toast(e.message, 'error'); }
    }, 180);
  });

  let map, marker, picked;
  el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-res]'); if (r) return choose(results[+r.dataset.res]);
    const sv = e.target.closest('[data-saved]'); if (sv) return choose(s.savedLocations.find((p) => p.id === sv.dataset.saved));
    const rc = e.target.closest('[data-recent]'); if (rc) return choose(s.recentPlaces[+rc.dataset.recent]);
    if (e.target.closest('[data-cur]')) {
      try {
        const p = await currentPosition();
        if (!inPhilippines(p)) toast('Your location appears to be outside the Philippines – results may be empty.', 'error');
        choose(p);
      } catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.closest('[data-map]')) {
      $('#fixed', el).classList.add('hidden');
      $('#mapbox', el).classList.remove('hidden');
      map = createMap($('#m', el), { zoom: 13 });
      map?.on('click', (ev) => {
        picked = { name: `Pinned point (${ev.latlng.lat.toFixed(4)}, ${ev.latlng.lng.toFixed(4)})`, lat: ev.latlng.lat, lng: ev.latlng.lng };
        marker?.remove();
        marker = pin(map, picked, 'Selected point', 'pick');
        $('#confirm', el).disabled = false;
      });
    }
    if (e.target.closest('#confirm') && picked) choose(picked);
  });
  return () => map?.remove();
}
