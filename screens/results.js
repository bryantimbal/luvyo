import { store } from '../lib/store.js';
import { header, esc, routeCard, loading, empty, toast, sheet, clock, $ } from '../lib/ui.js';
import { getJourney, getPlan, search } from '../lib/journey.js';

const MODES = [['jeepney', '🚙 Jeepney'], ['bus', '🚌 Bus'], ['rail', '🚆 Train'], ['uv', '🚐 UV Express'], ['tricycle', '🛺 Tricycle'], ['mc_taxi', '🏍️ Motorcycle taxi'], ['ridehail_car', '🚗 Ride-hailing'], ['taxi', '🚕 Taxi'], ['walk', '🚶 Walking']];
const PRIOS = [['best', 'Best overall'], ['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['fewest', 'Fewest transfers']];

export default async function results(el, { go, refresh }) {
  const j = getJourney();
  let plan = getPlan();
  if (!j.origin || !j.destination) return go('#/home');
  const s = store.get();

  const rerun = async () => {
    el.querySelector('#list').innerHTML = loading('Comparing routes…');
    try { plan = await search(); refresh(); } catch (e) { toast(e.message, 'error'); refresh(); }
  };

  if (!plan) { el.innerHTML = header('Routes') + loading('Comparing routes…'); try { plan = await search(); } catch (e) { el.innerHTML = header('Routes') + empty('⚠️', 'Could not plan this journey', e.message); return; } }

  const devUsed = plan.options.some((o) => o.legs.some((l) => l.dataset === 'development'));
  const activeFilters = s.prefs.exclude.length + (s.prefs.maxTransfers !== '' ? 1 : 0) + (s.prefs.budget ? 1 : 0) + (s.prefs.publicOnly || s.prefs.privateOnly ? 1 : 0) + (s.prefs.maxWalkKm !== 1 ? 1 : 0);
  el.innerHTML = `${header('Routes', { right: `<button class="icon-btn" data-filters aria-label="Filters">⚙️${activeFilters ? `<span class="dot">${activeFilters}</span>` : ''}</button>` })}
  <div class="pad" style="padding-bottom:0">
    <a class="card" href="#/home" style="padding:10px 14px"><div class="small muted">${j.timeMode === 'arrive' ? 'Arrive by ' + esc(clock(plan.query.arriveBy)) : j.timeMode === 'depart' ? 'Depart ' + esc(clock(plan.query.departAt)) : 'Leaving now'} · ${esc(s.profile.passengerType)} fare</div>
      <b>${esc(j.origin.name)}</b> → <b>${esc(j.destination.name)}</b> <span class="small">✏️</span></a>
    <div class="chips" style="margin-top:10px" role="group" aria-label="Sort by">${PRIOS.map(([k, l]) => `<button class="chip" data-prio="${k}" aria-pressed="${s.prefs.priority === k}">${l}</button>`).join('')}</div>
  </div>
  ${plan.offline ? `<div class="banner warn">Offline result from cached data${plan.offline.lastSync ? ' (synced ' + esc(new Date(plan.offline.lastSync).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })) + ')' : ''}. Not live.</div>` : ''}
  ${devUsed ? '<div class="banner dev">⚠️ Some routes use <b>development data</b> (unverified corridors / indicative fares). Verify before travelling.</div>' : ''}
  ${plan.recommendedDeparture ? `<div class="banner info">To arrive by ${esc(clock(plan.query.arriveBy))}, leave around <b>${esc(clock(plan.recommendedDeparture))}</b> (allows for the slowest estimate).</div>` : ''}
  ${(plan.advisories || []).map((a) => `<a class="banner warn" style="display:block;text-decoration:none" href="#/advisories">⚠️ ${esc(a.title)} <span class="small">(${esc(a.source)})</span></a>`).join('')}
  <div class="pad" id="list">
    ${plan.options.length ? plan.options.map((o, i) => routeCard(o, i)).join('') : empty('🧭', 'No routes found', 'Try relaxing your filters (walking distance, transfers, excluded modes) or choosing a nearby landmark.', '<button class="btn" data-filters>Adjust filters</button>')}
    <p class="muted small" style="margin-top:16px">ℹ️ ${esc(plan.meta?.traffic || '')} Distances: ${esc(plan.meta?.roadDistance || '')}. Estimates are not guaranteed arrival times or final fares. Sponsored content never affects these rankings.</p>
  </div>`;

  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-prio]');
    if (p) { store.set((st) => ({ prefs: { ...st.prefs, priority: p.dataset.prio } })); rerun(); }
    if (e.target.closest('[data-filters]')) openFilters(rerun);
  });
}

function openFilters(onApply) {
  const s = store.get();
  const pr = s.prefs;
  sheet(`<h2>Route preferences</h2>
    <div class="stack">
      <div><label class="f" for="pax">Passenger type</label><select class="input" id="pax">${['regular', 'student', 'senior', 'pwd'].map((v) => `<option value="${v}" ${s.profile.passengerType === v ? 'selected' : ''}>${{ regular: 'Regular', student: 'Student', senior: 'Senior citizen', pwd: 'PWD' }[v]}</option>`).join('')}</select></div>
      <div><label class="f" for="walk">Max walking per access/egress: <b id="wv">${(pr.maxWalkKm * 1000).toFixed(0)} m</b></label><input type="range" id="walk" min="0.2" max="2" step="0.1" value="${pr.maxWalkKm}" style="width:100%"></div>
      <div class="row"><div class="grow"><label class="f" for="tr">Max transfers</label><select class="input" id="tr"><option value="">Any</option>${[0, 1, 2, 3].map((n) => `<option ${String(pr.maxTransfers) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="grow"><label class="f" for="bud">Max budget (₱)</label><input class="input" id="bud" type="number" min="0" inputmode="numeric" value="${pr.budget || ''}" placeholder="No limit"></div></div>
      <div class="chips" role="group" aria-label="Transport type"><button class="chip" data-only="" aria-pressed="${!pr.publicOnly && !pr.privateOnly}">All</button><button class="chip" data-only="public" aria-pressed="${!!pr.publicOnly}">Public only</button><button class="chip" data-only="private" aria-pressed="${!!pr.privateOnly}">Private only</button></div>
      <div><b>Include these</b>${MODES.map(([id, l]) => `<label class="toggle"><span>${l}</span><input type="checkbox" data-mode="${id}" ${pr.exclude.includes(id) ? '' : 'checked'}></label>`).join('')}</div>
      <button class="btn block" id="apply">Apply</button><button class="btn ghost block" id="reset">Reset</button>
    </div>`, {
    onMount(sh, close) {
      let only = pr.publicOnly ? 'public' : pr.privateOnly ? 'private' : '';
      sh.querySelector('#walk').addEventListener('input', (e) => { sh.querySelector('#wv').textContent = Math.round(e.target.value * 1000) + ' m'; });
      sh.addEventListener('click', (e) => {
        const o = e.target.closest('[data-only]');
        if (o) { only = o.dataset.only; sh.querySelectorAll('[data-only]').forEach((b) => b.setAttribute('aria-pressed', b === o)); }
        if (e.target.id === 'reset') { store.set((st) => ({ prefs: { ...st.prefs, maxWalkKm: 1, exclude: [], maxTransfers: '', budget: null, publicOnly: false, privateOnly: false } })); close(); onApply(); }
        if (e.target.id === 'apply') {
          const exclude = [...sh.querySelectorAll('[data-mode]')].filter((c) => !c.checked).map((c) => c.dataset.mode);
          store.set((st) => ({
            profile: { ...st.profile, passengerType: sh.querySelector('#pax').value },
            prefs: { ...st.prefs, maxWalkKm: +sh.querySelector('#walk').value, maxTransfers: sh.querySelector('#tr').value, budget: +sh.querySelector('#bud').value || null, exclude, publicOnly: only === 'public', privateOnly: only === 'private' },
          }));
          close(); onApply();
        }
      });
    },
  });
}
