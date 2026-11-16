import { store } from '../lib/store.js';
import { api } from '../lib/api.js';
import { t } from '../lib/i18n.js';
import { esc, fare, dur, toast, peso, modeIcon, km, $ } from '../lib/ui.js';
import { getJourney, setJourney, swap, search, nowManilaInput } from '../lib/journey.js';
import { currentPosition, lastKnown } from '../lib/location.js';
import { auth } from '../lib/auth.js';

export function journeyForm(j) {
  const v = (p, ph) => (p ? `<span class="val">${esc(p.name)}</span>` : `<span class="val ph">${esc(ph)}</span>`);
  return `<div class="od">
      <div class="od-fields">
        <a class="field-btn" href="#/pick/origin"><span class="od-dot a"></span><span class="grow"><span class="lbl">${t('from')}</span>${v(j.origin, t('chooseOrigin'))}</span></a>
        <a class="field-btn" href="#/pick/destination"><span class="od-dot b"></span><span class="grow"><span class="lbl">${t('to')}</span>${v(j.destination, t('chooseDest'))}</span></a>
      </div>
      <button class="swap" data-swap aria-label="Swap origin and destination">⇅</button>
    </div>
    <div class="chips" role="group" aria-label="Departure time" style="margin-top:10px">
      ${[['now', t('leaveNow')], ['depart', t('departAt')], ['arrive', t('arriveBy')]].map(([k, l]) => `<button class="chip" data-tm="${k}" aria-pressed="${j.timeMode === k}">${l}</button>`).join('')}
    </div>
    ${j.timeMode !== 'now' ? `<input class="input" type="datetime-local" id="jtime" value="${esc(j.time || nowManilaInput(30))}" aria-label="Time (Asia/Manila)">` : ''}
    <button class="btn block" data-search style="margin-top:10px">${t('searchJourney')}</button>`;
}

export function bindJourneyForm(el, go, refresh) {
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-swap]')) { swap(); refresh(); }
    const tm = e.target.closest('[data-tm]');
    if (tm) { setJourney({ timeMode: tm.dataset.tm, time: tm.dataset.tm === 'now' ? '' : getJourney().time || nowManilaInput(30) }); refresh(); }
    if (e.target.closest('[data-search]')) {
      const tEl = el.querySelector('#jtime');
      if (tEl) setJourney({ time: tEl.value });
      const btn = e.target.closest('[data-search]');
      btn.disabled = true; btn.textContent = 'Searching…';
      try { await search(); go('#/results'); } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = t('searchJourney'); }
    }
  });
}

export default async function home(el, { go, refresh }) {
  const s = store.get();
  const j = getJourney();
  const unread = s.notifications.filter((n) => !n.read).length;
  const name = s.profile.name || auth.user()?.email?.split('@')[0] || '';
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const spent = s.expenses.filter((x) => new Date(new Date(x.at).getTime() + 8 * 3600000).toISOString().slice(0, 10) === today).reduce((a, x) => a + x.amount, 0);
  const loc = lastKnown();

  el.innerHTML = `
  <section class="hero">
    <div class="row between">
      <div class="brand"><img src="/icons/icon.svg" alt="">SakayPinoy</div>
      <div class="row"><a class="icon-btn" href="#/notifications" aria-label="Notifications (${unread} unread)">🔔${unread ? `<span class="dot">${unread}</span>` : ''}</a><a class="icon-btn" href="#/profile" aria-label="Profile">👤</a></div>
    </div>
    <div class="greet">${name ? `Hi ${esc(name)}! ` : ''}${t('greeting')}</div>
    <button class="loc" data-locate>📍 ${loc ? `Near ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : 'Tap to use your current location'}</button>
  </section>
  <section class="card search-card">${journeyForm(j)}</section>

  <section class="section"><div class="qa">
    <a href="#/assistant"><span>💬</span><span>Ask SakayPinoy</span></a>
    <a href="#/map"><span>📍</span><span>${t('nearby')}</span></a>
    <a href="#/fare"><span>🧮</span><span>${t('fareCalc')}</span></a>
    <a href="#/jeepney"><span>🚙</span><span>${t('jeepFinder')}</span></a>
    <a href="#/myroutes"><span>⭐</span><span>${t('saved')}</span></a>
    <a href="#/history"><span>🕘</span><span>${t('history')}</span></a>
  </div></section>

  <section class="section" id="adv"></section>

  <section class="section">
    <div class="section-title"><h2>${t('todaySpend')}</h2><a href="#/commute" class="small">Details</a></div>
    <a class="card" href="#/commute"><div class="row between"><span class="big">${peso(spent)}</span><span class="muted small">${s.profile.budgetDaily ? `of ${peso(s.profile.budgetDaily)} daily budget` : 'No daily budget set'}</span></div>
    ${s.profile.budgetDaily ? `<div class="progress ${spent > s.profile.budgetDaily ? 'over' : ''}" style="margin-top:8px"><div style="width:${Math.min(100, (spent / s.profile.budgetDaily) * 100)}%"></div></div>` : ''}</a>
  </section>

  ${s.savedLocations.length ? `<section class="section"><div class="section-title"><h2>${t('favorites')}</h2><a href="#/myroutes" class="small">Manage</a></div>
    <div class="chips">${s.savedLocations.map((p) => `<button class="chip" data-fav="${esc(p.id)}">${p.label === 'Home' ? '🏠' : p.label === 'Work' ? '💼' : p.label === 'School' ? '🎒' : '⭐'} ${esc(p.label)}</button>`).join('')}</div></section>` : ''}

  <section class="section">
    <div class="section-title"><h2>${t('recent')}</h2>${s.history.length ? '<a href="#/history" class="small">See all</a>' : ''}</div>
    ${s.history.length ? s.history.slice(0, 3).map((h, i) => `<button class="card" style="width:100%;text-align:left;border:0;cursor:pointer" data-recent="${i}">
      <div class="row between"><b>${esc(h.origin.name)} → ${esc(h.destination.name)}</b></div>
      <div class="muted small">${esc(h.title)} · ${esc(fare(h.fare))} · ${esc(dur(h.time))}</div></button>`).join('')
    : '<p class="muted small">Your planned journeys will appear here.</p>'}
  </section>
  <section class="section" id="nearby"></section>`;

  bindJourneyForm(el, go, refresh);
  el.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-recent]');
    if (r) { const h = s.history[+r.dataset.recent]; setJourney({ origin: h.origin, destination: h.destination }); refresh(); }
    const f = e.target.closest('[data-fav]');
    if (f) { const p = s.savedLocations.find((x) => x.id === f.dataset.fav); setJourney({ destination: p }); refresh(); }
    if (e.target.closest('[data-locate]')) {
      try { const p = await currentPosition(); if (!getJourney().origin) setJourney({ origin: p }); refresh(); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

  api.advisories().then((adv) => {
    const box = $('#adv', el);
    if (!box || !adv.length) return;
    const a = adv[0];
    box.innerHTML = `<div class="section-title"><h2>${t('advisories')}</h2><a href="#/advisories" class="small">All (${adv.length})</a></div>
      <a class="card" href="#/advisories"><b>${a.severity === 'critical' ? '⛔' : a.severity === 'warning' ? '⚠️' : 'ℹ️'} ${esc(a.title)}</b><div class="muted small">${esc(a.source)} · ${esc(a.area || '')}</div></a>`;
  }).catch(() => {});

  if (loc) {
    api.nearby(loc, 0.8).then((stops) => {
      const box = $('#nearby', el);
      if (!box) return;
      box.innerHTML = `<div class="section-title"><h2>${t('nearbyStops')}</h2><a href="#/map" class="small">Map</a></div>` + (stops.length
        ? `<ul class="list card">${stops.slice(0, 4).map((x) => `<li class="item"><span class="ic">${modeIcon(x.modes[0])}</span><span class="grow"><b>${esc(x.name)}</b><div class="muted small">${x.lines.map((l) => esc(l.code)).join(', ')} · ${km(x.km)}</div></span></li>`).join('')}</ul>`
        : '<p class="muted small">No stops in SakayPinoy data within 800 m of you yet.</p>');
    }).catch(() => {});
  }
}
