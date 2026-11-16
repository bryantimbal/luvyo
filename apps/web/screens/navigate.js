// Step-by-step journey guidance. GPS progress is opt-in and stops when you leave the screen.
import { store } from '../lib/store.js';
import { esc, fare, dur, km, toast, $ } from '../lib/ui.js';
import { getPlan, getJourney } from '../lib/journey.js';
import { legHtml } from './route.js';
import { createMap, drawRoute, fit, pin } from '../lib/map.js';
import { haversineKm } from '/core/geo.js';
import { sumFares } from '/core/fareEngine.js';

export default function navigate(el, { params, go }) {
  const o = getPlan()?.options?.[+params[0]];
  if (!o) return go('#/results');
  const j = getJourney();
  let step = 0, watch = null, map = null, me = null;

  // mark the latest matching history item as started
  store.set((s) => ({ history: s.history.map((h, i) => (i === 0 ? { ...h, started: true, title: o.title, fare: o.fare, time: o.time, modes: o.modes } : h)) }));

  const draw = () => {
    const rest = o.legs.slice(step);
    const remFare = sumFares(rest.map((l) => l.fare));
    const remTime = rest.reduce((a, l) => ({ min: a.min + l.time.min + (l.wait?.min || 0), max: a.max + l.time.max + (l.wait?.max || 0) }), { min: 0, max: 0 });
    const remKm = rest.reduce((a, l) => a + l.distanceKm, 0);
    const cur = o.legs[step];
    el.innerHTML = `<header class="topbar"><button class="icon-btn" data-exit aria-label="Exit navigation">✕</button><h1>${esc(j.destination.name)}</h1><button class="icon-btn" data-gps aria-pressed="${!!watch}" title="Use GPS to track progress">${watch ? '📡' : '📍'}</button></header>
    <div class="pad stack">
      ${cur ? `<div class="steps-now" aria-live="polite"><div class="small">Step ${step + 1} of ${o.legs.length}</div><div class="big">${esc(cur.instruction)}</div>
        ${o.legs[step + 1] ? `<div class="small" style="margin-top:6px;opacity:.9">Next: ${esc(o.legs[step + 1].instruction)}</div>` : '<div class="small" style="margin-top:6px">Next: arrive at your destination</div>'}</div>`
        : `<div class="steps-now"><div class="big">🎉 You've arrived at ${esc(j.destination.name)}!</div></div>`}
      <div class="stats"><div class="stat"><span class="muted small">Remaining time</span><b>${cur ? esc(dur(remTime)) : '0 min'}</b></div><div class="stat"><span class="muted small">Remaining fare</span><b>${cur ? esc(fare(remFare)) : '₱0'}</b></div><div class="stat"><span class="muted small">Remaining distance</span><b>${esc(km(remKm))}</b></div><div class="stat"><span class="muted small">GPS progress</span><b>${watch ? 'On' : 'Off'}</b></div></div>
      <div class="row">${step > 0 ? '<button class="btn ghost" data-prev>← Back</button>' : ''}${cur ? `<button class="btn grow" data-done>✓ ${step === o.legs.length - 1 ? 'Arrived' : 'Done – next step'}</button>` : '<a class="btn grow" href="#/commute">Log my fare</a>'}</div>
      <div id="m" class="map"></div>
      <ol class="timeline card">${o.legs.map((l, i) => legHtml(l, i, { state: i < step ? 'done' : i === step ? 'current' : '' })).join('')}</ol>
    </div>`;
    map?.remove();
    map = createMap($('#m', el));
    if (map) {
      drawRoute(map, o);
      if (cur) fit(map, cur.path); else fit(map, o.legs.flatMap((l) => l.path));
      if (me) pin(map, me, 'You', 'pick');
    }
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-exit]')) history.back();
    if (e.target.closest('[data-done]')) { step++; draw(); }
    if (e.target.closest('[data-prev]')) { step = Math.max(0, step - 1); draw(); }
    if (e.target.closest('[data-gps]')) {
      if (watch) { navigator.geolocation.clearWatch(watch); watch = null; draw(); return; }
      if (!navigator.geolocation) return toast('Location not supported', 'error');
      watch = navigator.geolocation.watchPosition((p) => {
        me = { lat: p.coords.latitude, lng: p.coords.longitude };
        const cur = o.legs[step];
        if (cur && haversineKm(me, cur.to) < 0.08) { step++; toast('Step complete'); }
        draw();
      }, () => { toast('Location permission denied', 'error'); watch = null; draw(); }, { enableHighAccuracy: true, maximumAge: 10000 });
      draw();
    }
  });
  draw();
  return () => { if (watch) navigator.geolocation.clearWatch(watch); map?.remove(); };
}
