// Ride recorder: maps a jeepney / UV / tricycle route from a rider's GPS.
// Recording only runs while this screen is open and the rider pressed Start.
// The first and last 300 m are removed before upload (home/work privacy).
/* global L */
import { community } from '../lib/community.js';
import { api } from '../lib/api.js';
import { header, esc, toast, km, modeIcon, $ } from '../lib/ui.js';
import { createMap, fit } from '../lib/map.js';
import { trimTrace, simplifyTrace, plausibility } from '/core/community.js';
import { polylineKm } from '/core/geo.js';

export default async function record(el, { query, go }) {
  const type = query.type === 'new_route' ? 'new_route' : 'route_trace';
  const lines = (await api.lines('', '')).filter((l) => ['jeepney', 'uv'].includes(l.modeId));
  let mode = query.modeId || 'jeepney';
  let pts = [], watch = null, started = null, map, live, trimmed, wake = null, timer;
  const P = (x) => ({ lat: x[0], lng: x[1] });

  el.innerHTML = `${header(type === 'new_route' ? 'Add a missing route' : 'Record my ride')}
  <div class="pad stack">
    <div class="banner info" style="margin:0">🛰️ Ride the whole route with GPS on. We only record while you're on this screen, and we cut the first and last 300 m so your home or work isn't revealed. <b>+${type === 'new_route' ? 25 : 15} pts</b></div>
    <div class="chips">${['jeepney', 'uv', 'tricycle'].map((m) => `<button class="chip" data-mode="${m}" aria-pressed="${m === mode}">${modeIcon(m)} ${m === 'uv' ? 'UV Express' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    ${type === 'route_trace' ? `<div><label class="f" for="line">Which route are you on?</label><select class="input" id="line">${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === query.lineId ? 'selected' : ''}>${esc(l.signboard || l.name)} (${esc(l.code)})</option>`).join('')}</select>
      <a class="small" href="#/record?type=new_route">Not listed? Add a new route →</a></div>`
    : `<div><label class="f" for="sign">Signboard text</label><input class="input" id="sign" maxlength="80" placeholder="e.g. PHILCOA – KATIPUNAN" required></div>
       <div class="row"><div class="grow"><label class="f" for="from">Starts at</label><input class="input" id="from" maxlength="80" placeholder="Terminal / landmark"></div><div class="grow"><label class="f" for="to">Ends at</label><input class="input" id="to" maxlength="80" placeholder="Terminal / landmark"></div></div>`}
    <div class="rec-panel">
      <div class="rec-stats"><div><span class="muted small">Distance</span><b id="d">0 m</b></div><div><span class="muted small">Time</span><b id="t">0:00</b></div><div><span class="muted small">GPS points</span><b id="n">0</b></div></div>
      <div id="m" class="map" style="height:260px"></div>
      <div class="row" id="ctl"><button class="btn grow rec-btn" data-start>● Start recording</button></div>
    </div>
  </div>`;
  map = createMap($('#m', el), { zoom: 14 });
  if (map) live = L.polyline([], { color: '#E85D3F', weight: 5 }).addTo(map);

  const stats = () => {
    const d = pts.length > 1 ? polylineKm(pts.map(P)) : 0;
    $('#d', el).textContent = km(d);
    $('#n', el).textContent = pts.length;
    const s = started ? Math.floor((Date.now() - started) / 1000) : 0;
    $('#t', el).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const stop = () => {
    if (watch != null) navigator.geolocation.clearWatch(watch);
    watch = null; clearInterval(timer);
    wake?.release?.().catch(() => {}); wake = null;
  };

  el.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b === m)); }
    if (e.target.closest('[data-start]')) {
      if (!navigator.geolocation) return toast('GPS is not available on this device', 'error');
      pts = []; started = Date.now();
      try { wake = await navigator.wakeLock?.request('screen'); } catch {}
      watch = navigator.geolocation.watchPosition((p) => {
        if (p.coords.accuracy > 60) return; // ignore poor fixes
        pts.push([+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6), Date.now()]);
        if (live) { live.setLatLngs(pts.map((x) => [x[0], x[1]])); if (pts.length === 1) map.setView([pts[0][0], pts[0][1]], 16); else map.panTo([pts.at(-1)[0], pts.at(-1)[1]]); }
        stats();
      }, (err) => { toast(err.code === 1 ? 'Location permission denied' : 'GPS signal lost – keep the app open', 'error'); }, { enableHighAccuracy: true, maximumAge: 0 });
      timer = setInterval(stats, 1000);
      $('#ctl', el).innerHTML = '<button class="btn warn grow rec-btn recording" data-stop>■ Stop – I got off</button>';
    }
    if (e.target.closest('[data-stop]')) {
      stop();
      trimmed = simplifyTrace(trimTrace(pts, 0.3), 0.04);
      if (map && trimmed.length > 1) { L.polyline(trimmed.map((x) => [x[0], x[1]]), { color: '#176B45', weight: 6 }).addTo(map); fit(map, pts.map((x) => [x[0], x[1]])); }
      const body = payload();
      const errs = plausibility(type, body.payload);
      $('#ctl', el).innerHTML = `<div class="stack" style="width:100%"><p class="small">Green = what will be shared (${km(trimmed.length > 1 ? polylineKm(trimmed.map(P)) : 0)}). Red ends are removed for privacy.</p>
        ${errs.length ? `<p class="small" style="color:#9a2a14">⚠️ ${esc(errs.join('. '))}</p>` : ''}
        <div class="row"><button class="btn ghost grow" data-discard>Discard</button><button class="btn grow" data-send ${errs.length ? 'disabled' : ''}>Share route</button></div></div>`;
    }
    if (e.target.closest('[data-discard]')) { pts = []; trimmed = null; go('#/ambag'); }
    if (e.target.closest('[data-send]')) {
      try {
        const r = await community.contribute(payload());
        toast(r.queued ? 'Saved – will upload when online' : `Salamat! +${r.pointsEarned} pts. Riders on this route will be asked to confirm.`, 'success');
        go('#/ambag');
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  function payload() {
    const v = (id) => $('#' + id, el)?.value?.trim();
    return type === 'new_route'
      ? { type, modeId: mode, payload: { modeId: mode, signboard: v('sign'), fromName: v('from'), toName: v('to'), points: trimmed, endsTrimmed: true } }
      : { type, lineId: v('line'), payload: { points: trimmed, endsTrimmed: true } };
  }
  return () => { stop(); map?.remove(); };
}
