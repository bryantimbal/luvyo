// Fare calculator: single or mixed legs, using configured fare schedules only.
import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, fare, dur, km, toast, sourceBadge, $ } from '../lib/ui.js';

const ROAD_MODES = [['taxi', '🚕 Taxi'], ['tricycle', '🛺 Tricycle']];
const KEY = 'sp:farecalc';

export default async function fareCalc(el, { go, refresh }) {
  const lines = await api.lines('', '');
  const s = store.get();
  let st;
  try { st = JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { st = null; }
  st ||= { legs: [{ kind: 'line', lineId: lines[0]?.id, from: 0, to: 1 }], pax: s.profile.passengerType, result: null };
  // pick-screen callbacks
  for (const [i, leg] of st.legs.entries()) for (const end of ['origin', 'destination']) {
    const k = `sp:pick:fare-${i}-${end}`;
    const v = sessionStorage.getItem(k);
    if (v) { leg[end] = JSON.parse(v); sessionStorage.removeItem(k); }
  }
  const save = () => sessionStorage.setItem(KEY, JSON.stringify(st));

  const legForm = (leg, i) => {
    const line = lines.find((l) => l.id === leg.lineId);
    return `<div class="card stack" data-leg="${i}">
      <div class="row between"><b>Segment ${i + 1}</b>${st.legs.length > 1 ? `<button class="btn sm ghost" data-rm="${i}">Remove</button>` : ''}</div>
      <select class="input" data-k="kind" aria-label="Transport type">
        <option value="line" ${leg.kind === 'line' ? 'selected' : ''}>Jeepney / Bus / Train / UV (by route)</option>
        ${ROAD_MODES.map(([m, l]) => `<option value="${m}" ${leg.kind === m ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${leg.kind === 'line' ? `
        <select class="input" data-k="lineId" aria-label="Route">${lines.map((l) => `<option value="${esc(l.id)}" ${l.id === leg.lineId ? 'selected' : ''}>${esc(l.code)} – ${esc(l.name)}</option>`).join('')}</select>
        <div class="row"><select class="input grow" data-k="from" aria-label="Board at">${line.stops.map((x, k) => `<option value="${k}" ${k === +leg.from ? 'selected' : ''}>Sakay: ${esc(x.name)}</option>`).join('')}</select></div>
        <div class="row"><select class="input grow" data-k="to" aria-label="Get off at">${line.stops.map((x, k) => `<option value="${k}" ${k === +leg.to ? 'selected' : ''}>Baba: ${esc(x.name)}</option>`).join('')}</select></div>`
      : `<a class="field-btn" href="#/pick/origin?target=fare-${i}-origin&back=%23%2Ffare"><span class="od-dot a"></span><span class="val ${leg.origin ? '' : 'ph'}">${esc(leg.origin?.name || 'From')}</span></a>
         <a class="field-btn" href="#/pick/destination?target=fare-${i}-destination&back=%23%2Ffare"><span class="od-dot b"></span><span class="val ${leg.destination ? '' : 'ph'}">${esc(leg.destination?.name || 'To')}</span></a>`}
    </div>`;
  };

  const draw = () => {
    el.innerHTML = `${header('Fare calculator')}<div class="pad stack">
      <div><label class="f" for="pax">Passenger type</label><select class="input" id="pax">${['regular', 'student', 'senior', 'pwd'].map((v) => `<option ${st.pax === v ? 'selected' : ''} value="${v}">${v}</option>`).join('')}</select></div>
      ${st.legs.map(legForm).join('')}
      <button class="btn soft block" data-add>+ Add segment (mixed trip)</button>
      <button class="btn block" data-calc>Calculate fare</button>
      <div id="out">${st.result ? resultHtml(st.result) : ''}</div>
      <p class="muted small">For motorcycle taxis and ride-hailing, use <a href="#/ridehail">Ride-hailing comparison</a>.</p>
    </div>`;
  };
  const resultHtml = (r) => `<div class="card"><h2>Estimated total: ${esc(fare({ ...r.total, available: true }))}</h2>
    ${r.legs.map((l, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>Segment ${i + 1}${l.distanceKm ? ` · ${km(l.distanceKm)}` : ''}${l.time ? ` · ${dur(l.time)}` : ''}<div class="muted small">${l.available ? l.breakdown.map((b) => esc(b.label)).join('; ') : esc(l.reason)}</div>${(l.notes || []).map((n) => `<div class="muted small">${esc(n)}</div>`).join('')}</span><span><b>${esc(fare(l))}</b><div>${l.sourceType ? sourceBadge(l.sourceType, { dataset: l.dataset }) : ''}</div></span></div>`).join('')}
    ${r.total.partial ? '<p class="small">Some segments have no verified fare and are excluded from the total.</p>' : ''}</div>`;

  el.addEventListener('change', (e) => {
    if (e.target.id === 'pax') { st.pax = e.target.value; save(); return; }
    const box = e.target.closest('[data-leg]');
    if (!box) return;
    const leg = st.legs[+box.dataset.leg];
    leg[e.target.dataset.k] = e.target.value;
    if (e.target.dataset.k === 'lineId') { leg.from = 0; leg.to = 1; }
    if (e.target.dataset.k === 'kind' && leg.kind === 'line') leg.lineId ||= lines[0]?.id;
    st.result = null; save(); draw();
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add]')) { st.legs.push({ kind: 'line', lineId: lines[0]?.id, from: 0, to: 1 }); save(); draw(); }
    const rm = e.target.closest('[data-rm]'); if (rm) { st.legs.splice(+rm.dataset.rm, 1); save(); draw(); }
    if (e.target.closest('[data-calc]')) {
      try {
        const legs = st.legs.map((l) => {
          if (l.kind === 'line') {
            const line = lines.find((x) => x.id === l.lineId);
            if (+l.from === +l.to) throw new Error('Choose different boarding and drop-off stops.');
            return { lineId: l.lineId, fromStopId: line.stops[+l.from].id, toStopId: line.stops[+l.to].id };
          }
          if (!l.origin || !l.destination) throw new Error('Choose start and end for each segment.');
          return { modeId: l.kind, origin: l.origin, destination: l.destination };
        });
        st.result = await api.fare({ legs, passengerType: st.pax });
        save(); $('#out', el).innerHTML = resultHtml(st.result);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  draw();
}
