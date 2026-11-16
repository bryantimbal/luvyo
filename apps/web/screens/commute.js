// Commute expense tracker (spec §16).
import { store, uid } from '../lib/store.js';
import { header, esc, peso, empty, toast, sheet, modeIcon } from '../lib/ui.js';

const dayKey = (d) => new Date(new Date(d).getTime() + 8 * 3600000).toISOString().slice(0, 10);

export default function commute(el, { refresh }) {
  const s = store.get();
  const ex = s.expenses;
  const today = dayKey(new Date());
  const now = new Date();
  const weekAgo = new Date(now - 6 * 86400000);
  const monthKey = today.slice(0, 7);
  const sum = (xs) => xs.reduce((a, x) => a + x.amount, 0);
  const todayX = ex.filter((x) => dayKey(x.at) === today);
  const weekX = ex.filter((x) => new Date(x.at) >= new Date(dayKey(weekAgo) + 'T00:00:00+08:00'));
  const monthX = ex.filter((x) => dayKey(x.at).startsWith(monthKey));
  const kmTot = ex.reduce((a, x) => a + (x.distanceKm || 0), 0);
  const savings = ex.reduce((a, x) => a + (x.cheapestAlt != null && x.amount > x.cheapestAlt ? x.amount - x.cheapestAlt : 0), 0);
  const modeCount = {};
  for (const x of ex) for (const m of x.modes || []) modeCount[m] = (modeCount[m] || 0) + 1;
  const days = [...Array(7)].map((_, i) => dayKey(new Date(now - (6 - i) * 86400000)));
  const perDay = days.map((d) => sum(ex.filter((x) => dayKey(x.at) === d)));
  const maxDay = Math.max(1, ...perDay, s.profile.budgetDaily || 0);
  const bd = s.profile.budgetDaily, bm = s.profile.budgetMonthly;

  el.innerHTML = `${header('Commute expenses', { back: false, right: '<a class="icon-btn" href="#/history" aria-label="History">🕘</a>' })}
  <div class="pad stack">
    <div class="stats">
      <div class="stat"><span class="muted small">Today</span><b>${peso(sum(todayX))}</b>${bd ? `<div class="progress ${sum(todayX) > bd ? 'over' : ''}"><div style="width:${Math.min(100, (sum(todayX) / bd) * 100)}%"></div></div><span class="muted small">of ${peso(bd)}</span>` : ''}</div>
      <div class="stat"><span class="muted small">This month</span><b>${peso(sum(monthX))}</b>${bm ? `<div class="progress ${sum(monthX) > bm ? 'over' : ''}"><div style="width:${Math.min(100, (sum(monthX) / bm) * 100)}%"></div></div><span class="muted small">of ${peso(bm)}</span>` : ''}</div>
      <div class="stat"><span class="muted small">Avg per journey</span><b>${ex.length ? peso(sum(ex) / ex.length) : '—'}</b></div>
      <div class="stat"><span class="muted small">Avg per km</span><b>${kmTot ? peso(sum(ex.filter((x) => x.distanceKm)) / kmTot) : '—'}</b></div>
      <div class="stat"><span class="muted small">Last 7 days</span><b>${peso(sum(weekX))}</b></div>
      <div class="stat"><span class="muted small">Potential savings</span><b>${peso(savings)}</b><span class="muted small">vs cheapest option shown</span></div>
    </div>
    <div class="card"><h2>Last 7 days</h2>
      <div class="bar-chart" role="img" aria-label="Daily spending for the last 7 days">${perDay.map((v, i) => `<div title="${days[i]}: ${peso(v)}" class="${bd && v > bd ? 'over' : ''}" style="height:${(v / maxDay) * 100}%"></div>`).join('')}</div>
      <div class="bar-labels">${days.map((d) => `<span>${new Date(d + 'T12:00:00+08:00').toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })}</span>`).join('')}</div>
    </div>
    ${Object.keys(modeCount).length ? `<div class="card"><h2>Most used</h2><div class="chips">${Object.entries(modeCount).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="chip">${modeIcon(m)} ${n}</span>`).join('')}</div></div>` : ''}
    <div class="row"><button class="btn grow" data-add>+ Add expense</button><button class="btn soft" data-budget>Budget</button></div>
    <h2>Entries</h2>
    ${ex.length ? `<ul class="list">${ex.slice(0, 100).map((x) => `<li class="item"><span class="ic">${modeIcon(x.modes?.[0])}</span><span class="grow"><b>${peso(x.amount)}</b> <span class="muted small">${esc(x.note || '')}</span><div class="muted small">${esc(new Date(x.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }))}${x.estimated ? ` · est. ₱${x.estimated.min}${x.estimated.max !== x.estimated.min ? '–' + x.estimated.max : ''}` : ''}</div></span><button class="btn sm ghost" data-del="${esc(x.id)}" aria-label="Delete entry">✕</button></li>`).join('')}</ul>`
      : empty('💰', 'No expenses yet', 'Log fares from a route, or add one manually.')}
  </div>`;

  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { store.set((st) => ({ expenses: st.expenses.filter((x) => x.id !== d.dataset.del) })); refresh(); }
    if (e.target.closest('[data-add]')) {
      sheet(`<h2>Add expense</h2><div class="stack">
        <div><label class="f" for="a">Amount (₱)</label><input class="input" id="a" type="number" min="0" step="0.25" inputmode="decimal" required></div>
        <div><label class="f" for="m">Transport</label><select class="input" id="m">${['jeepney', 'bus', 'rail', 'uv', 'tricycle', 'mc_taxi', 'ridehail_car', 'taxi', 'ferry'].map((m) => `<option value="${m}">${modeIcon(m)} ${m}</option>`).join('')}</select></div>
        <div><label class="f" for="n">Note</label><input class="input" id="n" maxlength="80" placeholder="e.g. Cubao → Quiapo"></div>
        <div><label class="f" for="d">When</label><input class="input" id="d" type="datetime-local" value="${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)}"></div>
        <button class="btn block" id="ok">Add</button></div>`, {
        onMount(sh, close) {
          sh.querySelector('#ok').onclick = () => {
            const amount = +sh.querySelector('#a').value;
            if (!(amount > 0)) return toast('Enter an amount', 'error');
            store.set((st) => ({ expenses: [{ id: uid(), at: new Date(sh.querySelector('#d').value + ':00+08:00').toISOString(), amount, note: sh.querySelector('#n').value, modes: [sh.querySelector('#m').value] }, ...st.expenses].sort((a, b) => new Date(b.at) - new Date(a.at)) }));
            close(); refresh();
          };
        },
      });
    }
    if (e.target.closest('[data-budget]')) {
      sheet(`<h2>Commute budget</h2><div class="stack">
        <div><label class="f" for="bd">Daily budget (₱)</label><input class="input" id="bd" type="number" min="0" value="${bd || ''}"></div>
        <div><label class="f" for="bm">Monthly budget (₱)</label><input class="input" id="bm" type="number" min="0" value="${bm || ''}"></div>
        <button class="btn block" id="ok">Save</button></div>`, {
        onMount(sh, close) {
          sh.querySelector('#ok').onclick = () => { store.set((st) => ({ profile: { ...st.profile, budgetDaily: +sh.querySelector('#bd').value || null, budgetMonthly: +sh.querySelector('#bm').value || null } })); close(); refresh(); };
        },
      });
    }
  });
}
