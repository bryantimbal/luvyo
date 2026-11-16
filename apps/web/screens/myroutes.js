import { store, uid, FREE_SAVED_ROUTE_LIMIT } from '../lib/store.js';
import { header, esc, fare, dur, empty, toast, sheet, dateStr } from '../lib/ui.js';
import { setJourney, search } from '../lib/journey.js';
import { t } from '../lib/i18n.js';

const LABELS = ['Home', 'Work', 'School', 'Family', 'Shopping', 'Other'];

export default function myroutes(el, { go, refresh }) {
  const s = store.get();
  const pickedLoc = sessionStorage.getItem('sp:pick:saveloc');
  if (pickedLoc) { sessionStorage.removeItem('sp:pick:saveloc'); askLabel(JSON.parse(pickedLoc), refresh); }

  el.innerHTML = `${header(t('myRoutes'), { back: false })}
  <div class="pad stack">
    <div class="section-title"><h2>Saved places</h2><a class="btn sm soft" href="#/pick/destination?target=saveloc&back=%23%2Fmyroutes">+ Add</a></div>
    ${s.savedLocations.length ? `<ul class="list">${s.savedLocations.map((p) => `<li class="item"><span class="ic">${p.label === 'Home' ? '🏠' : p.label === 'Work' ? '💼' : p.label === 'School' ? '🎒' : '⭐'}</span><span class="grow"><b>${esc(p.label)}</b><div class="muted small">${esc(p.name)}</div></span><button class="btn sm" data-goto="${esc(p.id)}">Go</button><button class="btn sm ghost" data-delloc="${esc(p.id)}" aria-label="Remove">✕</button></li>`).join('')}</ul>`
      : '<p class="muted small">Save Home, Work or School for one-tap planning.</p>'}
    <div class="section-title"><h2>Saved routes</h2><span class="muted small">${s.savedRoutes.length}/${FREE_SAVED_ROUTE_LIMIT} (free plan)</span></div>
    ${s.savedRoutes.length ? s.savedRoutes.map((r) => `<div class="card">
      <div class="row between"><b>${esc(r.name)}</b><button class="btn sm ghost" data-del="${esc(r.id)}" aria-label="Delete">✕</button></div>
      <div class="muted small">${esc(r.origin.name)} → ${esc(r.destination.name)}</div>
      <div class="small">Last estimate: ${esc(r.preferredTitle || '')} · ${esc(fare(r.lastFare))} · ${esc(dur(r.lastTime))} <span class="muted">(${esc(dateStr(r.savedAt))})</span></div>
      <div class="row" style="margin-top:8px"><button class="btn sm grow" data-plan="${esc(r.id)}">Plan now (updated estimates)</button><button class="btn sm soft" data-rename="${esc(r.id)}">Rename</button></div>
    </div>`).join('') : empty('⭐', 'No saved routes yet', 'Open any route result and tap Save.')}
  </div>`;

  el.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { store.set((st) => ({ savedRoutes: st.savedRoutes.filter((r) => r.id !== d.dataset.del) })); refresh(); }
    const dl = e.target.closest('[data-delloc]');
    if (dl) { store.set((st) => ({ savedLocations: st.savedLocations.filter((r) => r.id !== dl.dataset.delloc) })); refresh(); }
    const g = e.target.closest('[data-goto]');
    if (g) { setJourney({ destination: s.savedLocations.find((p) => p.id === g.dataset.goto) }); go('#/home'); }
    const p = e.target.closest('[data-plan]');
    if (p) {
      const r = s.savedRoutes.find((x) => x.id === p.dataset.plan);
      setJourney({ origin: r.origin, destination: r.destination, timeMode: 'now' });
      p.disabled = true; p.textContent = 'Searching…';
      try {
        const plan = await search();
        const same = plan.options.find((o) => o.title === r.preferredTitle) || plan.options[0];
        if (same) store.set((st) => ({ savedRoutes: st.savedRoutes.map((x) => (x.id === r.id ? { ...x, lastFare: same.fare, lastTime: same.time, savedAt: new Date().toISOString() } : x)) }));
        go('#/results');
      } catch (err) { toast(err.message, 'error'); refresh(); }
    }
    const rn = e.target.closest('[data-rename]');
    if (rn) {
      const r = s.savedRoutes.find((x) => x.id === rn.dataset.rename);
      sheet(`<h2>Rename route</h2><input class="input" id="n" value="${esc(r.name)}" maxlength="60"><button class="btn block" id="ok" style="margin-top:12px">Save</button>`, {
        onMount(sh, close) { sh.querySelector('#ok').onclick = () => { store.set((st) => ({ savedRoutes: st.savedRoutes.map((x) => (x.id === r.id ? { ...x, name: sh.querySelector('#n').value || x.name } : x)) })); close(); refresh(); }; },
      });
    }
  });
}

function askLabel(place, refresh) {
  sheet(`<h2>Save place</h2><p>${esc(place.name)}</p><div class="chips">${LABELS.map((l) => `<button class="chip" data-l="${l}">${l}</button>`).join('')}</div>`, {
    onMount(sh, close) {
      sh.addEventListener('click', (e) => {
        const l = e.target.closest('[data-l]');
        if (!l) return;
        store.set((st) => ({ savedLocations: [...st.savedLocations.filter((x) => !(['Home', 'Work', 'School'].includes(l.dataset.l) && x.label === l.dataset.l)), { id: uid(), label: l.dataset.l, name: place.name, lat: place.lat, lng: place.lng }] }));
        close(); toast('Place saved', 'success'); refresh();
      });
    },
  });
}
