import { store } from '../lib/store.js';
import { header, esc, fare, dur, empty, modeIcon } from '../lib/ui.js';
import { setJourney } from '../lib/journey.js';
import { t } from '../lib/i18n.js';

export default function history(el, { go, refresh }) {
  const h = store.get().history;
  el.innerHTML = `${header(t('history'), { right: h.length ? '<button class="btn sm ghost" data-clear>Clear</button>' : '' })}
  <div class="pad">${h.length ? `<ul class="list">${h.map((x, i) => `<li><button data-i="${i}"><span class="ic">${x.started ? '✅' : '🔎'}</span><span class="grow"><b>${esc(x.origin.name)} → ${esc(x.destination.name)}</b>
    <div class="muted small">${(x.modes || []).map(modeIcon).join(' ')} ${esc(x.title)} · ${esc(fare(x.fare))} · ${esc(dur(x.time))}</div>
    <div class="muted small">${esc(new Date(x.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }))}${x.started ? ' · travelled' : ' · searched'}</div></span><span class="muted">↻</span></button></li>`).join('')}</ul>`
    : empty('🕘', 'No commute history yet', 'Plan a journey and it will appear here (stored only on this device unless you sign in).')}</div>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { const x = h[+b.dataset.i]; setJourney({ origin: x.origin, destination: x.destination, timeMode: 'now' }); go('#/home'); }
    if (e.target.closest('[data-clear]') && confirm('Clear all commute history on this device?')) { store.set({ history: [] }); refresh(); }
  });
}
