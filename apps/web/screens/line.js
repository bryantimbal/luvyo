/* global L */
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, fare, dur, loading, empty, sourceBadge, modeIcon, $ } from '../lib/ui.js';
import { createMap, fit, modeColor } from '../lib/map.js';
import { setJourney } from '../lib/journey.js';

export default async function line(el, { params, go }) {
  el.innerHTML = header('Route') + loading();
  const lines = await api.lines('', '');
  const l = lines.find((x) => x.id === params[0]);
  if (!l) { el.innerHTML = header('Route') + empty('🤷', 'Route not found'); return; }
  const pax = store.get().profile.passengerType;
  const first = l.stops[0], last = l.stops[l.stops.length - 1];
  const full = await api.fare({ lineId: l.id, fromStopId: first.id, toStopId: last.id, passengerType: pax }).catch(() => null);
  const minLeg = l.stops.length > 1 ? await api.fare({ lineId: l.id, fromStopId: l.stops[0].id, toStopId: l.stops[1].id, passengerType: pax }).catch(() => null) : null;
  const f = full?.legs?.[0], m = minLeg?.legs?.[0];

  el.innerHTML = `${header(l.code + ' · ' + l.name)}
  <div class="pad stack">
    <div id="m" class="map"></div>
    <div class="card">
      <div class="row wrap">${modeIcon(l.modeId)} <b>${esc(l.name)}</b> ${l.verified ? '<span class="badge">✓ Verified</span>' : '<span class="badge badge-dev">Route not verified</span>'} ${sourceBadge(l.sourceType, { dataset: l.dataset, lastVerified: l.lastVerified })}</div>
      ${l.signboard ? `<p>Signboard: <b>${esc(l.signboard)}</b></p>` : ''}
      <dl class="kv">
        <dt>Fare (shortest hop)</dt><dd>${m ? esc(fare(m)) : '—'}</dd>
        <dt>Fare (end to end)</dt><dd>${f ? esc(fare(f)) : '—'} ${f?.available === false ? esc(f.reason) : ''}</dd>
        <dt>End-to-end time</dt><dd>${f?.time ? esc(dur(f.time)) + ' (typical, not live)' : 'Unavailable'}</dd>
        <dt>Operating hours</dt><dd>${l.operatingHours?.default ? esc(l.operatingHours.default.start + '–' + l.operatingHours.default.end) : 'Schedule unavailable'}</dd>
        <dt>Frequency</dt><dd>${l.headwayMin ? `every ~${l.headwayMin[0]}–${l.headwayMin[1]} min (typical)` : 'Unavailable'}</dd>
        ${f?.sourceNote ? `<dt>Fare source</dt><dd class="small">${esc(f.sourceNote)}</dd>` : ''}
        ${l.notes ? `<dt>Notes</dt><dd class="small">${esc(l.notes)}</dd>` : ''}
      </dl>
    </div>
    <section class="card"><h2>Stops (${l.stops.length})</h2><ol class="timeline">${l.stops.map((s, i) => `<li style="--c:${modeColor(l.modeId)}"><span class="ic">${i === 0 || i === l.stops.length - 1 ? '🚏' : '•'}</span><div class="row between"><span>${esc(s.name)}</span><span class="row"><button class="btn sm soft" data-from="${i}">From</button><button class="btn sm soft" data-to="${i}">To</button></span></div></li>`).join('')}</ol></section>
    <a class="btn ghost block" href="#/report?lineId=${esc(l.id)}&category=incorrect_route">🚩 Report incorrect route, changed destination or missing stop</a>
  </div>`;
  const map = createMap($('#m', el));
  if (map) {
    const pts = l.stops.map((s) => [s.lat, s.lng]);
    L.polyline(pts, { color: l.color || modeColor(l.modeId), weight: 5, dashArray: l.verified ? null : '8 6' }).addTo(map);
    l.stops.forEach((s) => L.circleMarker([s.lat, s.lng], { radius: 5, color: '#fff', weight: 2, fillColor: modeColor(l.modeId), fillOpacity: 1 }).addTo(map).bindPopup(esc(s.name)));
    fit(map, pts);
  }
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-from]'), b = e.target.closest('[data-to]');
    if (a) { const s = l.stops[+a.dataset.from]; setJourney({ origin: { name: s.name, lat: s.lat, lng: s.lng } }); go('#/home'); }
    if (b) { const s = l.stops[+b.dataset.to]; setJourney({ destination: { name: s.name, lat: s.lat, lng: s.lng } }); go('#/home'); }
  });
  return () => map?.remove();
}
