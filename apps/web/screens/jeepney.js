import { api } from '../lib/api.js';
import { header, esc, empty, loading, toast, km, $ } from '../lib/ui.js';
import { currentPosition } from '../lib/location.js';
import { createMap, pin } from '../lib/map.js';

export default function jeepney(el, { go }) {
  el.innerHTML = `${header('Jeepney finder')}
  <div class="pad stack">
    <input class="input" id="q" type="search" placeholder="Destination, route code, terminal or landmark (e.g. Quiapo)" aria-label="Search jeepney routes">
    <div class="card"><h2>Does this jeepney pass here?</h2><p class="muted small">Pick a spot to see verified and development jeepney routes passing within 400 m.</p>
      <div class="row"><button class="btn sm" data-here>📍 My location</button><button class="btn sm soft" data-pickmap>🗺️ Pick on map</button></div>
      <div id="pm" class="map hidden" style="height:240px;margin-top:10px"></div><div id="passing"></div></div>
    <h2>Routes</h2><div id="list">${loading()}</div>
  </div>`;

  const renderList = (lines) => {
    $('#list', el).innerHTML = lines.length ? `<ul class="list">${lines.map((l) => `<li><a href="#/line/${esc(l.id)}"><span class="ic">🚙</span><span class="grow"><b>${esc(l.code)} · ${esc(l.name)}</b>
      <div class="muted small">${l.signboard ? 'Signboard: ' + esc(l.signboard) + ' · ' : ''}${l.stops.length} stops · ${l.verified ? '✓ verified' : 'not yet verified'}</div></span><span class="muted">›</span></a></li>`).join('')}</ul>`
      : empty('🔎', 'No jeepney routes match', 'Our verified jeepney coverage is still growing. Report a missing route to help.', '<a class="btn" href="#/report?category=incorrect_route">Report missing route</a>');
  };
  const load = (q = '') => api.lines(q, 'jeepney').then(renderList).catch((e) => toast(e.message, 'error'));
  load();
  let t;
  $('#q', el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 200); });

  const showPassing = async (p) => {
    $('#passing', el).innerHTML = loading('Checking routes…');
    const lines = await api.passing(p, 'jeepney', 0.4);
    $('#passing', el).innerHTML = lines.length
      ? `<ul class="list">${lines.map((l) => `<li><a href="#/line/${esc(l.id)}"><span class="ic">✅</span><span class="grow"><b>${esc(l.code)} · ${esc(l.name)}</b><div class="muted small">passes ~${km(l.km)} away${l.verified ? '' : ' · unverified'}</div></span></a></li>`).join('')}</ul>`
      : '<p class="muted small" style="margin-top:8px">No jeepney route in our data passes within 400 m of this point.</p>';
  };
  let map;
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-here]')) { try { await showPassing(await currentPosition()); } catch (err) { toast(err.message, 'error'); } }
    if (e.target.closest('[data-pickmap]')) {
      $('#pm', el).classList.remove('hidden');
      if (!map) {
        map = createMap($('#pm', el), { zoom: 13 });
        let m;
        map?.on('click', (ev) => { m?.remove(); const p = { lat: ev.latlng.lat, lng: ev.latlng.lng }; m = pin(map, p, 'Selected', 'pick'); showPassing(p); });
      }
    }
  });
  return () => map?.remove();
}
