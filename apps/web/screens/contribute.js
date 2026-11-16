// One form for every quick contribution type. Only community-driven modes are offered.
import { community, TYPE_INFO } from '../lib/community.js';
import { api, cachedDataset } from '../lib/api.js';
import { header, esc, toast, modeIcon, $ } from '../lib/ui.js';
import { lastKnown, currentPosition } from '../lib/location.js';
import { createMap, pin } from '../lib/map.js';

const MODES = [['jeepney', 'Jeepney'], ['uv', 'UV Express'], ['tricycle', 'Tricycle'], ['mc_taxi', 'Motorcycle taxi'], ['ridehail_car', 'Ride-hailing car'], ['taxi', 'Taxi']];
const ALLOWED = { fare: MODES.map((m) => m[0]), wait: MODES.map((m) => m[0]), loading_spot: ['jeepney', 'uv', 'tricycle'], route_change: ['jeepney', 'uv'], last_trip: ['jeepney', 'uv'] };

export default async function contribute(el, { params, query, go }) {
  const type = params[0];
  const info = TYPE_INFO[type];
  if (!info || !ALLOWED[type]) return go('#/ambag');
  const [lines, zones] = await Promise.all([api.lines('', ''), api.zones().catch(() => [])]);
  const providers = (cachedDataset()?.providers || []).filter((p) => p.enabled !== false);
  const preLine = lines.find((l) => l.id === query.lineId);
  let mode = query.modeId || preLine?.modeId || (query.zoneId ? 'tricycle' : providers.find((p) => p.id === query.providerId)?.modeId) || ALLOWED[type][0];
  let spot = type === 'loading_spot' ? lastKnown() : null;
  let map;

  const targetField = () => {
    if (mode === 'jeepney' || mode === 'uv') {
      const ls = lines.filter((l) => l.modeId === mode);
      return `<div><label class="f" for="line">Route</label><select class="input" id="line">${ls.map((l) => `<option value="${esc(l.id)}" ${l.id === query.lineId ? 'selected' : ''}>${esc(l.signboard || l.name)} (${esc(l.code)})</option>`).join('')}</select>
        <a class="small" href="#/record?type=new_route&modeId=${mode}">Route not listed? Add it →</a></div>`;
    }
    if (mode === 'tricycle') return `<div><label class="f" for="zone">Tricycle area</label><select class="input" id="zone">${zones.map((z) => `<option value="${esc(z.id)}" ${z.id === query.zoneId ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></div>`;
    if (mode === 'mc_taxi' || mode === 'ridehail_car') {
      const ps = providers.filter((p) => p.modeId === mode);
      return `<div><label class="f" for="prov">Provider</label><select class="input" id="prov">${ps.map((p) => `<option value="${esc(p.id)}" ${p.id === query.providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`;
    }
    return '';
  };
  const fields = () => {
    const hailed = ['mc_taxi', 'ridehail_car', 'taxi'].includes(mode);
    switch (type) {
      case 'fare': return `<div class="row"><div class="grow"><label class="f" for="amount">Fare you paid (₱)</label><input class="input big-input" id="amount" type="number" min="1" step="0.25" inputmode="decimal" value="${esc(query.amount || '')}" required></div>
        <div class="grow"><label class="f" for="dist">Trip distance (km)${hailed ? '' : ' – optional'}</label><input class="input" id="dist" type="number" min="0.1" step="0.1" inputmode="decimal" value="${esc(query.distanceKm || '')}" ${hailed ? 'required' : ''}></div></div>
        ${hailed ? `<div><label class="f" for="dur">Trip duration (min) – optional</label><input class="input" id="dur" type="number" min="1" inputmode="numeric"></div>` : ''}
        <label class="toggle"><span>I paid a discounted fare (student / senior / PWD)</span><input type="checkbox" id="disc"></label>
        <p class="muted small">Tip: ${mode === 'jeepney' ? 'a short ride (under 4 km) tells us the minimum fare.' : 'enter exactly what you paid, including tip if any – not the app quote.'}</p>`;
      case 'wait': return `<div><label class="f" for="min">${['mc_taxi', 'ridehail_car', 'taxi'].includes(mode) ? 'Minutes until pickup' : 'Minutes until a ride came'}: <b id="mv">10</b></label><input type="range" id="min" min="0" max="60" value="10" style="width:100%"></div>
        <p class="muted small">We record the time of day automatically – waits differ in rush hour.</p>`;
      case 'loading_spot': return `<div><label class="f" for="name">Name of the spot</label><input class="input" id="name" maxlength="80" placeholder="e.g. Corner of Aurora & 15th Ave (in front of the bakery)" required></div>
        <div id="m" class="map" style="height:220px"></div><p class="muted small" id="spot">${spot ? 'Using your location – tap the map to adjust.' : 'Tap the map to place the spot.'}</p>`;
      case 'route_change': return `<div><label class="f" for="desc">What changed?</label><textarea class="input" id="desc" rows="4" maxlength="500" minlength="10" required placeholder="e.g. Since Monday the jeep turns at Gilmore instead of going to Broadway."></textarea></div>`;
      case 'last_trip': return `<div><label class="f" for="time">Last trip leaves around</label><input class="input big-input" id="time" type="time" value="22:00" required></div>`;
    }
    return '';
  };
  const draw = () => {
    el.innerHTML = `${header(info.title)}<form class="pad stack" id="f">
      <div class="banner info" style="margin:0">${info.icon} ${esc(info.desc)} · <b>+${info.pts} pts</b>, +20 more when other riders confirm it.</div>
      <div><label class="f">What did you ride?</label><div class="chips wrap" style="flex-wrap:wrap">${MODES.filter(([m]) => ALLOWED[type].includes(m)).map(([m, l]) => `<button type="button" class="chip" data-mode="${m}" aria-pressed="${m === mode}">${modeIcon(m)} ${l}</button>`).join('')}</div></div>
      ${targetField()}
      ${fields()}
      <label class="toggle"><span>Attach my approximate location (helps nearby riders verify)</span><input type="checkbox" id="loc" ${lastKnown() ? 'checked' : ''}></label>
      <button class="btn block" id="go">Submit report</button>
      <p class="muted small">Reports are shown as “unverified” until other riders confirm them, and are never labelled official.</p>
    </form>`;
    map?.remove(); map = null;
    if (type === 'loading_spot') {
      map = createMap($('#m', el), { center: spot ? [spot.lat, spot.lng] : undefined, zoom: spot ? 16 : 13 });
      let mk = spot && map ? pin(map, spot, 'Loading spot', 'pick') : null;
      map?.on('click', (ev) => { spot = { lat: ev.latlng.lat, lng: ev.latlng.lng }; mk?.remove(); mk = pin(map, spot, 'Loading spot', 'pick'); $('#spot', el).textContent = 'Spot placed.'; });
    }
    $('#min', el)?.addEventListener('input', (e) => { $('#mv', el).textContent = e.target.value; });
  };

  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; draw(); }
  });
  el.addEventListener('change', async (e) => {
    if (e.target.id === 'loc' && e.target.checked && !lastKnown()) { try { await currentPosition(); } catch (err) { e.target.checked = false; toast(err.message, 'error'); } }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => $('#' + id, el)?.value;
    const body = { type, modeId: mode, lineId: v('line') || undefined, zoneId: v('zone') || undefined, providerId: v('prov') || undefined, payload: {} };
    if (type === 'fare') Object.assign(body.payload, { amount: +v('amount'), distanceKm: v('dist') ? +v('dist') : undefined, durationMin: v('dur') ? +v('dur') : undefined, passengerType: $('#disc', el).checked ? 'discounted' : 'regular' });
    if (type === 'wait') Object.assign(body.payload, { minutes: +v('min'), hourOfDay: new Date(Date.now() + 8 * 3600000).getUTCHours() });
    if (type === 'route_change') body.payload.description = v('desc').trim();
    if (type === 'last_trip') body.payload.time = v('time');
    if (type === 'loading_spot') { if (!spot) return toast('Tap the map to place the spot', 'error'); Object.assign(body.payload, { name: v('name').trim(), lat: spot.lat, lng: spot.lng }); }
    const loc = $('#loc', el).checked ? lastKnown() : null;
    if (loc && type !== 'loading_spot') { body.lat = loc.lat; body.lng = loc.lng; }
    const btn = $('#go', el); btn.disabled = true;
    try {
      const r = await community.contribute(body);
      toast(r.queued ? 'No signal – saved, will send automatically' : `Salamat! +${r.pointsEarned} pts. Waiting for other riders to confirm.`, 'success');
      go('#/ambag');
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
  draw();
  return () => map?.remove();
}
