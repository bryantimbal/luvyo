import { store, uid, FREE_SAVED_ROUTE_LIMIT, pushNotification } from '../lib/store.js';
import { header, esc, fare, dur, km, clock, sourceBadge, riderBadge, dateStr, toast, sheet, modeIcon, TAG_LABEL, $ } from '../lib/ui.js';
import { community } from '../lib/community.js';
import { lastKnown } from '../lib/location.js';
import { getJourney, getPlan } from '../lib/journey.js';
import { createMap, pin, drawRoute, fit } from '../lib/map.js';
import { api } from '../lib/api.js';
import { session } from '../lib/store.js';

export function legHtml(l, i, { state = '' } = {}) {
  const c = l.type === 'walk' ? 'var(--m-walk)' : `var(--m-${l.modeId})`;
  const provider = l.providers?.length ? `<div class="small">Providers: ${l.providers.map((p) => `<a href="#/ridehail" class="small">${esc(p)}</a>`).join(', ')}</div>` : '';
  return `<li class="${l.type === 'walk' ? 'walk' : ''} ${state}" style="--c:${c}">
    <span class="ic" aria-hidden="true">${modeIcon(l.modeId)}</span>
    <div><b>${l.type === 'walk' ? 'Lakad' : esc(l.lineName || l.modeLabel)}</b>${l.operatorName ? ` <span class="muted small">· ${esc(l.operatorName)}</span>` : ''}
      <div>${esc(l.instruction)}</div>${provider}
      ${l.signboard ? `<div class="small">Signboard: <b>${esc(l.signboard)}</b></div>` : ''}
      <div class="leg-facts">
        ${l.fare ? `<span class="leg-fare">${esc(fare(l.fare))}</span>` : ''}
        <span>⏱ ${esc(dur(l.time))}</span>
        ${l.wait?.max ? `<span>⏳ ${l.modeId === 'mc_taxi' || l.modeId === 'tricycle' || l.modeId === 'taxi' || l.modeId === 'ridehail_car' ? 'pickup' : 'wait'} ${Math.round(l.wait.min)}–${Math.round(l.wait.max)} min${l.wait.known === false ? ' (typical)' : ''}</span>` : ''}
        <span>📏 ${esc(km(l.distanceKm))}</span>
        ${l.verified === false && !l.community?.riders ? '<span class="badge badge-dev">Route not verified</span>' : ''}${riderBadge(l.community)}
        ${l.communityWait ? `<span>👥 riders wait ${l.communityWait.min}–${l.communityWait.max} min</span>` : ''}
        ${l.fare && !l.fare.available ? `<span class="badge badge-dev">${esc(l.fare.reason || 'Fare unavailable')}</span>` : ''}
      </div>
      ${l.communityDriven && l.type === 'ride' ? `<div class="crowd-row"><span class="small muted">${l.flexible ? '✋ Para anywhere along the route · ' : ''}Still accurate?</span>
        ${l.lineId ? `<button class="btn sm soft" data-check="${esc(l.lineId)}|yes">👍</button><button class="btn sm ghost" data-check="${esc(l.lineId)}|no">👎</button>` : ''}
        <a class="btn sm ghost" href="#/contribute/fare?${l.lineId ? 'lineId=' + esc(l.lineId) : 'modeId=' + esc(l.modeId)}${l.providers?.[0] ? '&providerId=' + esc(l.providers[0]) : ''}&distanceKm=${l.distanceKm.toFixed(1)}">₱ Report fare</a></div>` : ''}
    </div></li>`;
}

export default function route(el, { params, go }) {
  const plan = getPlan();
  const o = plan?.options?.[+params[0]];
  if (!o) return go('#/results');
  const j = getJourney();
  const fares = o.legs.filter((l) => l.fare);

  el.innerHTML = `${header(o.title)}
  <div class="pad stack">
    <div id="m" class="map" role="img" aria-label="Map of the route"></div>
    <div class="card">
      <div class="tags">${o.tags.map((t) => `<span class="tag tag-${t}">${TAG_LABEL[t]}</span>`).join('')}</div>
      <div class="route-main"><div><div class="big">${esc(fare(o.fare))}</div><div class="muted small">total est. fare</div></div><div><div class="big">${esc(dur(o.time))}</div><div class="muted small">arrive ${esc(clock(o.arrive.min))}–${esc(clock(o.arrive.max))}</div></div></div>
      <div class="route-meta"><span>🔁 ${o.transfers} transfers</span><span>🚶 ${esc(km(o.walkKm))}</span><span>📏 ${esc(km(o.distanceKm))}</span><span>🚦 Traffic: ${o.trafficData === 'live' ? 'live' : o.trafficData === 'typical' ? 'typical-speed model (not live)' : 'n/a'}</span></div>
      ${o.recommendedDeparture ? `<p class="small">Leave by <b>${esc(clock(o.recommendedDeparture))}</b> to arrive on time.</p>` : ''}
      ${o.warnings.map((w) => `<div class="small" style="color:#9a3412">⚠️ ${esc(w)}</div>`).join('')}
    </div>
    <div class="row wrap">
      <a class="btn grow" href="#/navigate/${esc(params[0])}">▶ Start</a>
      <button class="btn soft" data-save>⭐ Save</button>
      <button class="btn soft" data-log>₱ Log fare</button>
      <button class="btn soft" data-remind>⏰</button>
    </div>
    ${o.providerQuotes?.length || o.legs.some((l) => l.providers?.length) ? `<a class="btn ghost block" href="#/ridehail">Compare & open provider apps</a>` : ''}
    <section class="card"><h2>Step by step</h2><ol class="timeline">${o.legs.map((l, i) => legHtml(l, i)).join('')}
      <li style="--c:var(--accent)"><span class="ic">🏁</span><div><b>Arrive</b><div>${esc(j.destination?.name || 'Destination')}</div></div></li></ol></section>
    <section class="card"><h2>Fare breakdown</h2>
      <table class="cmp"><thead><tr><th>Segment</th><th>Fare</th><th>Source</th></tr></thead><tbody>
      ${fares.map((l) => `<tr><td>${modeIcon(l.modeId)} ${esc(l.lineCode || l.modeLabel)}<div class="muted small">${l.fare.available ? l.fare.breakdown.map((b) => esc(b.label) + (b.amount != null ? ' ₱' + b.amount : '')).join('; ') : esc(l.fare.reason)}</div>
        ${l.fare.discountApplied ? `<div class="small">✓ ${esc(l.fare.discountApplied.type)} discount (${esc(l.fare.discountApplied.legalBasis || '')})</div>` : ''}${(l.fare.notes || []).map((n) => `<div class="muted small">${esc(n)}</div>`).join('')}</td>
        <td><b>${esc(fare(l.fare))}</b></td><td>${sourceBadge(l.fare.sourceType, { dataset: l.fare.dataset, lastVerified: l.fare.lastVerified })}<div class="muted small">${esc(dateStr(l.fare.lastVerified))}</div>${l.fare.sourceNote ? `<div class="muted small">${esc(l.fare.sourceNote)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="3">No paid segments (walking only).</td></tr>'}
      </tbody><tfoot><tr><th>Total</th><th colspan="2">${esc(fare(o.fare))} · ${esc(store.get().profile.passengerType)}</th></tr></tfoot></table>
    </section>
    <a class="btn ghost block" href="#/report?lineId=${esc(o.legs.find((l) => l.lineId)?.lineId || '')}">🚩 Report a problem with this route</a>
  </div>`;

  const map = createMap($('#m', el));
  if (map) {
    pin(map, j.origin, j.origin.name, 'origin');
    pin(map, j.destination, j.destination.name, 'destination');
    drawRoute(map, o);
    fit(map, o.legs.flatMap((l) => l.path));
  }

  el.addEventListener('click', async (e) => {
    const chk = e.target.closest('[data-check]');
    if (chk) {
      const [lineId, ans] = chk.dataset.check.split('|');
      chk.parentElement.querySelectorAll('[data-check]').forEach((b) => (b.disabled = true));
      try { const r = await community.confirm('line:' + lineId, { agree: ans === 'yes', ...(lastKnown() || {}) }); toast(r.queued ? 'Saved – will send when online' : `Salamat! +${r.pointsEarned} pt`, 'success'); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.closest('[data-save]')) saveRoute(o, j);
    if (e.target.closest('[data-log]')) logFare(o);
    if (e.target.closest('[data-remind]')) reminder(o, j);
  });
  return () => map?.remove();
}

function saveRoute(o, j) {
  const s = store.get();
  if (s.savedRoutes.length >= FREE_SAVED_ROUTE_LIMIT) return toast(`Free plan saves up to ${FREE_SAVED_ROUTE_LIMIT} routes. Remove one in My Routes.`, 'error');
  sheet(`<h2>Save route</h2><div class="stack"><label class="f" for="n">Name</label><input class="input" id="n" value="${esc(j.origin.name + ' → ' + j.destination.name)}" maxlength="60">
    <div class="chips">${['Home → Work', 'Home → School', 'Work → Home'].map((x) => `<button class="chip" data-name="${x}">${x}</button>`).join('')}</div>
    <button class="btn block" id="ok">Save</button></div>`, {
    onMount(sh, close) {
      sh.addEventListener('click', (e) => {
        const n = e.target.closest('[data-name]'); if (n) sh.querySelector('#n').value = n.dataset.name;
        if (e.target.id === 'ok') {
          store.set((st) => ({ savedRoutes: [{ id: uid(), name: sh.querySelector('#n').value || 'My route', origin: j.origin, destination: j.destination, preferredTitle: o.title, lastFare: o.fare, lastTime: o.time, savedAt: new Date().toISOString() }, ...st.savedRoutes] }));
          close(); toast('Route saved', 'success');
        }
      });
    },
  });
}

function logFare(o) {
  sheet(`<h2>Log this trip's fare</h2><div class="stack"><p class="muted small">Estimated ${esc(fare(o.fare))}. Enter what you actually paid.</p>
    <input class="input" id="amt" type="number" min="0" step="0.25" inputmode="decimal" value="${o.fare.min}">
    <button class="btn block" id="ok">Add to expenses</button></div>`, {
    onMount(sh, close) {
      sh.querySelector('#ok').onclick = () => {
        const amount = +sh.querySelector('#amt').value;
        if (!(amount >= 0)) return toast('Enter a valid amount', 'error');
        store.set((st) => ({ expenses: [{ id: uid(), at: new Date().toISOString(), amount, note: o.title, modes: o.modes, distanceKm: o.distanceKm, estimated: o.fare, cheapestAlt: cheapestAlt() }, ...st.expenses] }));
        close(); toast('Expense recorded', 'success');
      };
    },
  });
}
const cheapestAlt = () => { const p = getPlan(); const c = p?.options.find((x) => x.tags.includes('cheapest')); return c ? c.fare.min : null; };

function reminder(o, j) {
  const def = o.recommendedDeparture ? new Date(o.recommendedDeparture) : new Date(Date.now() + 30 * 60000);
  const v = new Date(def.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  sheet(`<h2>Departure reminder</h2><div class="stack"><label class="f" for="t">Remind me at (Manila time)</label><input class="input" type="datetime-local" id="t" value="${v}"><button class="btn block" id="ok">Set reminder</button>
    <p class="muted small">Reminders fire while SakayPinoy is open. Background push needs Firebase Cloud Messaging to be configured.</p></div>`, {
    async onMount(sh, close) {
      sh.querySelector('#ok').onclick = async () => {
        const at = new Date(sh.querySelector('#t').value + ':00+08:00');
        if (!(at > new Date())) return toast('Pick a future time', 'error');
        if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
        store.set((st) => ({ reminders: [...st.reminders, { id: uid(), at: at.toISOString(), title: `Time to leave for ${j.destination.name}`, body: `${o.title} · ${fare(o.fare)} · ${dur(o.time)}` }] }));
        close(); toast('Reminder set', 'success');
      };
    },
  });
}
