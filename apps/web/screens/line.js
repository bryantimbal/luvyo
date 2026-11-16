/* global L */
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, fare, dur, loading, empty, sourceBadge, modeIcon, toast, $ } from '../lib/ui.js';
import { createMap, fit, modeColor } from '../lib/map.js';
import { setJourney } from '../lib/journey.js';
import { community } from '../lib/community.js';
import { riderBadge } from '../lib/ui.js';

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
      <div class="row wrap">${modeIcon(l.modeId)} <b>${esc(l.name)}</b> ${l.verified ? '<span class="badge">✓ Verified</span>' : l.sourceType === 'community_verified' ? '<span class="badge src-community_verified">👥 Rider-verified</span>' : '<span class="badge badge-dev">Route not verified</span>'} ${sourceBadge(l.sourceType, { dataset: l.dataset, lastVerified: l.lastVerified })}</div>
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
    <section class="card" id="crowd"></section>
    <section class="card"><h2>${l.modeId === 'jeepney' || l.modeId === 'uv' ? 'Landmarks along the route' : 'Stops'} (${l.stops.length})</h2>
      ${l.modeId === 'jeepney' || l.modeId === 'uv' ? '<p class="muted small">✋ You can board or say “Para!” anywhere along this route – these are reference points.</p>' : ''}<ol class="timeline">${l.stops.map((s, i) => `<li style="--c:${modeColor(l.modeId)}"><span class="ic">${i === 0 || i === l.stops.length - 1 ? '🚏' : '•'}</span><div class="row between"><span>${esc(s.name)}</span><span class="row"><button class="btn sm soft" data-from="${i}">From</button><button class="btn sm soft" data-to="${i}">To</button></span></div></li>`).join('')}</ol></section>
    <a class="btn ghost block" href="#/report?lineId=${esc(l.id)}&category=incorrect_route">🚩 Report incorrect route, changed destination or missing stop</a>
  </div>`;
  const riders = (n) => `${n} ${n === 1 ? 'rider' : 'riders'}`;
  community.line(l.id).then((c) => {
    const box = $('#crowd', el);
    if (!box) return;
    if (!c.communityDriven) { box.innerHTML = `<h2>Schedule & fares</h2><p class="small muted">${esc(l.code)} uses official operator data. Community reports are for jeepneys, UV Express, tricycles, taxis and ride-hailing.</p>`; return; }
    box.innerHTML = `<div class="row between"><h2 style="margin:0">From riders 👥</h2>${riderBadge(c.community) || '<span class="badge src-community">Not yet confirmed</span>'}</div>
      <dl class="kv" style="margin-top:8px">
        <dt>Rider fare</dt><dd>${c.fare ? `₱${c.fare.baseFare} minimum (${riders(c.fare.riders)})` : 'No verified reports yet'}</dd>
        <dt>Typical wait</dt><dd>${c.wait ? `${c.wait.min}–${c.wait.max} min (${riders(c.wait.riders)})` : 'No verified reports yet'}</dd>
        <dt>Last trip</dt><dd>${c.lastTrip ? `around ${esc(c.lastTrip.time)} (${riders(c.lastTrip.riders)})` : 'Unknown'}</dd>
        <dt>Loading spots</dt><dd>${c.loadingSpots.length ? c.loadingSpots.map((x) => esc(x.name)).join('<br>') : '—'}</dd>
        <dt>Open reports</dt><dd>${c.openReports} waiting for confirmation · ${c.verifiedReports} verified</dd>
      </dl>
      ${c.notes.map((n) => `<div class="small" style="color:#9a3412">⚠️ Riders report: ${esc(n.text)}</div>`).join('')}
      <div class="row wrap" style="margin-top:10px">
        <button class="btn sm" data-ok>👍 Route still accurate</button>
        <a class="btn sm soft" href="#/contribute/fare?lineId=${esc(l.id)}">₱ Fare</a>
        <a class="btn sm soft" href="#/contribute/wait?lineId=${esc(l.id)}">⏳ Wait</a>
        <a class="btn sm soft" href="#/contribute/last_trip?lineId=${esc(l.id)}">🌙 Last trip</a>
        <a class="btn sm soft" href="#/contribute/loading_spot?lineId=${esc(l.id)}">📍 Loading spot</a>
        <a class="btn sm soft" href="#/record?lineId=${esc(l.id)}">🛰️ Record ride</a>
        <a class="btn sm ghost" href="#/contribute/route_change?lineId=${esc(l.id)}">🔀 Changed?</a>
      </div>`;
    box.querySelector('[data-ok]').onclick = async (ev) => {
      ev.target.disabled = true;
      try { const r = await community.confirm('line:' + l.id, { agree: true }); toast(r.queued ? 'Saved – will send when online' : `Salamat! +${r.pointsEarned} pt`, 'success'); } catch (err) { toast(err.message, 'error'); }
    };
  }).catch(() => { const b = $('#crowd', el); if (b) b.remove(); });
  const map = createMap($('#m', el));
  if (map) {
    const pts = l.shape?.length ? l.shape.map((p) => [p[0], p[1]]) : l.stops.map((s) => [s.lat, s.lng]);
    L.polyline(pts, { color: l.color || modeColor(l.modeId), weight: 5, dashArray: l.verified || l.sourceType === 'community_verified' ? null : '8 6' }).addTo(map);
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
