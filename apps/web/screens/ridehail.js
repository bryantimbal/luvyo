import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, fare, dur, km, loading, sourceBadge, toast, $ } from '../lib/ui.js';
import { getJourney } from '../lib/journey.js';

export default async function ridehail(el, { go }) {
  const j = getJourney();
  el.innerHTML = `${header('Ride-hailing comparison')}<div class="pad stack">
    <div class="card"><div class="od"><div class="od-fields">
      <a class="field-btn" href="#/pick/origin?back=%23%2Fridehail"><span class="od-dot a"></span><span class="grow"><span class="lbl">From</span><span class="val ${j.origin ? '' : 'ph'}">${esc(j.origin?.name || 'Choose start')}</span></span></a>
      <a class="field-btn" href="#/pick/destination?back=%23%2Fridehail"><span class="od-dot b"></span><span class="grow"><span class="lbl">To</span><span class="val ${j.destination ? '' : 'ph'}">${esc(j.destination?.name || 'Choose destination')}</span></span></a>
    </div></div></div>
    <div id="out">${j.origin && j.destination ? loading('Comparing providers…') : '<p class="muted">Choose a start and destination to compare providers.</p>'}</div>
  </div>`;
  if (!j.origin || !j.destination) return;
  try {
    const rows = await api.ridehail({ origin: j.origin, destination: j.destination, passengerType: store.get().profile.passengerType });
    $('#out', el).innerHTML = `
      <div class="banner warn" style="margin:0 0 12px">No official live-pricing integrations are active. Fares below are <b>indicative estimates – final fare is determined by the provider</b>. Pickup times are typical ranges, not live.</div>
      ${rows.map((r) => `<div class="card">
        <div class="row between"><b>${r.provider.modeId === 'mc_taxi' ? '🏍️' : '🚗'} ${esc(r.provider.name)}</b><span class="badge ${r.availability === 'confirmed' ? '' : 'src-indicative'}">${r.availability === 'confirmed' ? 'Available' : 'Availability unknown'}</span></div>
        <div class="muted small">${esc(r.vehicle)}</div>
        <div class="route-main"><div><div class="big">${esc(fare(r.fare))}</div><div class="muted small">${r.fare.available ? 'estimated fare' : esc(r.fare.reason)}</div></div><div><div class="big">${esc(dur(r.duration))}</div><div class="muted small">ride · ${esc(km(r.distanceKm))}</div></div></div>
        <div class="route-meta"><span>🕐 Pickup ${r.pickup ? `${r.pickup.min}–${r.pickup.max} min (typical)` : 'unknown'}</span><span>🚦 ${r.traffic === 'typical' ? 'Typical traffic model' : 'n/a'}</span></div>
        <div class="route-src">${sourceBadge(r.fare.sourceType, { dataset: r.fare.dataset, lastVerified: r.fare.lastVerified })}<span class="muted small">${esc(r.fare.sourceNote || '')}</span></div>
        <div class="row" style="margin-top:10px"><a class="btn sm grow" href="${esc(r.provider.storeUrl || r.provider.website)}" target="_blank" rel="noopener" data-open="${esc(r.provider.id)}">Open ${esc(r.provider.name)}</a>${r.provider.website ? `<a class="btn sm ghost" href="${esc(r.provider.website)}" target="_blank" rel="noopener" data-open="${esc(r.provider.id)}">Website</a>` : ''}</div>
      </div>`).join('')}
      <p class="muted small">Booking happens in the provider's own app. SakayPinoy never books, charges or confirms a ride for you.</p>`;
  } catch (e) { $('#out', el).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  el.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) api.providerOpened(o.dataset.open); });
}
