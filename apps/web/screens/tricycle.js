/* global L */
import { api } from '../lib/api.js';
import { header, esc, loading, empty, sourceBadge, toast, km, $ } from '../lib/ui.js';
import { currentPosition } from '../lib/location.js';
import { createMap, fit, modeColor } from '../lib/map.js';
import { haversineKm } from '/core/geo.js';

export default async function tricycle(el) {
  el.innerHTML = header('Tricycle finder') + loading();
  const zones = await api.zones().catch((e) => { toast(e.message, 'error'); return []; });
  let here = null;
  const draw = () => {
    const list = here ? [...zones].sort((a, b) => haversineKm(here, a.center) - haversineKm(here, b.center)) : zones;
    el.innerHTML = `${header('Tricycle finder')}
    <div class="pad stack">
      <div class="banner info" style="margin:0">Tricycle fares are set by each city/municipality. We separate <b>fixed tariffs</b> from <b>negotiated fares</b> and never guess a fare we don't have.</div>
      <button class="btn soft block" data-near>📍 Find zones near me</button>
      <div id="m" class="map"></div>
      ${list.length ? list.map((z) => {
        const f = z.fare;
        const fareTxt = !f ? 'Fare unavailable' : f.kind === 'zone' ? `₱${f.params.baseFare} per passenger${f.params.specialTripFare ? ` · special trip ₱${f.params.specialTripFare}` : ''}` : 'Negotiated locally – no verified amount';
        return `<div class="card"><div class="row between"><b>🛺 ${esc(z.name)}</b>${sourceBadge(z.sourceType, { dataset: z.dataset })}</div>
          ${here ? `<div class="muted small">${km(haversineKm(here, z.center))} from you</div>` : ''}
          <dl class="kv" style="margin-top:8px"><dt>Fare type</dt><dd>${z.fareType === 'fixed' ? 'Fixed tariff' : 'Negotiated'}</dd><dt>Fare</dt><dd>${esc(fareTxt)}</dd>
          ${f?.sourceNote ? `<dt>Source</dt><dd class="small">${esc(f.sourceNote)}</dd>` : ''}
          <dt>Coverage</dt><dd>${z.barangays?.length ? esc(z.barangays.join(', ')) : `~${z.radiusKm} km radius`}</dd>
          <dt>Terminals</dt><dd>${(z.terminals || []).map((t) => esc(t.name)).join('<br>') || '—'}</dd>
          <dt>Capacity</dt><dd>${z.capacity ? esc(z.capacity) + ' passengers' : 'Not verified'}</dd></dl>
          ${z.community ? `<div class="small" style="margin-top:6px">👥 Fare confirmed by ${z.community.riders} rider report(s)</div>` : ''}
          <div class="row" style="margin-top:8px"><a class="btn sm" href="#/contribute/fare?zoneId=${esc(z.id)}">₱ I paid… (+5)</a><a class="btn sm soft" href="#/contribute/wait?modeId=tricycle&zoneId=${esc(z.id)}">⏳ Wait time</a></div></div>`;
      }).join('') : empty('🛺', 'No tricycle zones yet', 'Zones are added by administrators per LGU.')}
    </div>`;
    const map = createMap($('#m', el), { zoom: 13 });
    if (map && zones.length) {
      for (const z of zones) {
        L.circle([z.center.lat, z.center.lng], { radius: z.radiusKm * 1000, color: modeColor('tricycle'), fillOpacity: 0.08 }).addTo(map).bindPopup(esc(z.name));
        for (const t of z.terminals || []) L.marker([t.lat, t.lng]).addTo(map).bindPopup(esc(t.name));
      }
      fit(map, zones.map((z) => [z.center.lat, z.center.lng]));
    }
    return map;
  };
  let map = draw();
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-near]')) { try { here = await currentPosition(); map?.remove(); map = draw(); } catch (err) { toast(err.message, 'error'); } }
  });
  return () => map?.remove();
}
