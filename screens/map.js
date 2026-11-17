/* global L */
import { api, cachedDataset, syncDataset } from '../lib/api.js';
import { header, esc, toast, km, modeIcon, sheet, MODE_LABEL } from '../lib/ui.js';
import { createMap, stopMarker, pin, modeColor } from '../lib/map.js';
import { currentPosition, lastKnown } from '../lib/location.js';
import { setJourney } from '../lib/journey.js';

export default async function mapScreen(el, { go }) {
  el.innerHTML = `${header('Transport map', { right: '<button class="icon-btn" data-locate aria-label="Locate me">📍</button>' })}
    <div class="chips pad" style="padding-bottom:0" id="filters">${['all', 'rail', 'bus', 'jeepney', 'uv', 'tricycle'].map((m) => `<button class="chip" data-f="${m}" aria-pressed="${m === 'all'}">${m === 'all' ? 'All' : modeIcon(m) + ' ' + MODE_LABEL[m]}</button>`).join('')}<button class="chip" data-lines aria-pressed="false">Show routes</button></div>
    <div id="m" class="map tall" style="margin-top:8px"></div>`;
  const map = createMap(el.querySelector('#m'), { zoom: 12 });
  if (!map) return;
  const ds = cachedDataset() || (await syncDataset(true).catch(() => null));
  if (!ds) { toast('Transport data not available offline yet', 'error'); return () => map.remove(); }
  const stopModes = new Map();
  for (const l of ds.lines.filter((x) => x.operational !== false)) for (const id of l.stopIds) (stopModes.get(id) || stopModes.set(id, new Set()).get(id)).add(l.modeId);
  const linesByStop = (id) => ds.lines.filter((l) => l.stopIds.includes(id) && l.operational !== false);
  let markers = [], lineLayers = [], filter = 'all', showLines = false;
  const stopsById = new Map(ds.stops.map((s) => [s.id, s]));

  const onStop = (s) => {
    const lines = linesByStop(s.id);
    sheet(`<h2>${esc(s.name)}</h2><p class="muted small">${esc(s.kind)}${s.dataset === 'development' ? ' · development data' : ''}</p>
      <ul class="list">${lines.map((l) => `<li><a href="#/line/${esc(l.id)}" data-close><span class="ic">${modeIcon(l.modeId)}</span><span class="grow"><b>${esc(l.code)}</b> ${esc(l.name)}${l.verified ? '' : ' <span class="badge badge-dev">unverified</span>'}</span></a></li>`).join('')}</ul>
      <div class="row" style="margin-top:12px"><button class="btn grow" data-from>Start here</button><button class="btn grow soft" data-to>Go here</button></div>`, {
      onMount(sh, close) {
        sh.addEventListener('click', (e) => {
          if (e.target.closest('[data-from]')) { setJourney({ origin: { name: s.name, lat: s.lat, lng: s.lng } }); close(); go('#/home'); }
          if (e.target.closest('[data-to]')) { setJourney({ destination: { name: s.name, lat: s.lat, lng: s.lng } }); close(); go('#/home'); }
        });
      },
    });
  };
  const drawStops = () => {
    markers.forEach((m) => m.remove()); lineLayers.forEach((m) => m.remove());
    markers = []; lineLayers = [];
    for (const s of ds.stops) {
      const modes = [...(stopModes.get(s.id) || [])];
      if (!modes.length || (filter !== 'all' && !modes.includes(filter))) continue;
      markers.push(stopMarker(map, { ...s, modes, lines: linesByStop(s.id) }, onStop));
    }
    if (filter === 'all' || filter === 'tricycle') for (const z of ds.tricycleZones || []) {
      lineLayers.push(L.circle([z.center.lat, z.center.lng], { radius: z.radiusKm * 1000, color: modeColor('tricycle'), weight: 1, fillOpacity: 0.06 }).addTo(map).bindPopup(`${esc(z.name)} – tricycle zone`));
      for (const t of z.terminals || []) markers.push(stopMarker(map, { ...t, kind: 'tricycle', modes: ['tricycle'] }));
    }
    if (showLines) for (const l of ds.lines) {
      if (l.operational === false || (filter !== 'all' && l.modeId !== filter)) continue;
      const pts = l.stopIds.map((id) => stopsById.get(id)).filter(Boolean).map((s) => [s.lat, s.lng]);
      lineLayers.push(L.polyline(pts, { color: l.color || modeColor(l.modeId), weight: 4, opacity: 0.7, dashArray: l.verified ? null : '6 6' }).addTo(map).bindPopup(`<b>${esc(l.code)}</b> ${esc(l.name)}${l.verified ? '' : '<br><i>Route not verified</i>'}`));
    }
  };
  drawStops();
  const loc = lastKnown();
  if (loc) { pin(map, loc, 'You are here', 'pick'); map.setView([loc.lat, loc.lng], 15); }

  el.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; el.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-pressed', b === f)); drawStops(); }
    const ln = e.target.closest('[data-lines]');
    if (ln) { showLines = !showLines; ln.setAttribute('aria-pressed', showLines); drawStops(); }
    if (e.target.closest('[data-locate]')) {
      try {
        const p = await currentPosition();
        pin(map, p, 'You are here', 'pick'); map.setView([p.lat, p.lng], 15);
        const near = await api.nearby(p, 1);
        toast(near.length ? `${near.length} stop(s) within 1 km. Nearest: ${near[0].name} (${km(near[0].km)})` : 'No stops in LUVYO data within 1 km yet.');
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  return () => map.remove();
}
