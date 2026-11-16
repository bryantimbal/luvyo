import { api } from '../lib/api.js';
import { store, session } from '../lib/store.js';
import { header, esc, routeCard, toast, $ } from '../lib/ui.js';
import { lastKnown } from '../lib/location.js';
import { setJourney } from '../lib/journey.js';

const SUGGEST = [
  'How do I get from Cubao to BGC for less than ₱100?',
  'Anong jeep ang sasakyan ko mula Quiapo papuntang Divisoria?',
  'Mas mura ba ang MRT o JoyRide from North Avenue papuntang Makati?',
  'How much will I spend commuting from UP Diliman to Ayala for 22 days?',
  "What's the fastest way from SM North EDSA to the airport?",
];

export default function assistant(el, { go }) {
  const msgs = session.get('chat') || [{ role: 'bot', text: 'Kumusta! Ask me how to get somewhere, which jeep to take, or how much a trip costs. I only answer from SakayPinoy route and fare data – if something is missing, I will say so.' }];
  const draw = () => {
    el.innerHTML = `${header('Commute assistant')}
    <div class="chat" id="chat">${msgs.map((m, k) => `<div class="msg ${m.role === 'me' ? 'me' : 'bot'}">${esc(m.text)}</div>${m.options?.length ? `<div>${m.options.map((o, i) => routeCard(o, i).replace(/href="#\/route\/(\d+)"/, `href="#" data-open="${k}:$1"`)).join('')}</div>` : ''}`).join('')}
      ${msgs.length < 2 ? `<div class="chips wrap" style="flex-wrap:wrap">${SUGGEST.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    </div>
    <form class="composer" id="f"><input class="input grow" id="q" placeholder="Type in English, Filipino or Taglish…" autocomplete="off" aria-label="Message" maxlength="500"><button class="btn">Send</button></form>`;
    $('#chat', el).lastElementChild?.scrollIntoView({ block: 'end' });
  };
  const send = async (text) => {
    msgs.push({ role: 'me', text });
    msgs.push({ role: 'bot', text: '…' });
    draw();
    try {
      const r = await api.assistant({ message: text, currentLocation: lastKnown(), passengerType: store.get().profile.passengerType });
      msgs[msgs.length - 1] = { role: 'bot', text: r.text + (r.offline ? '\n(Offline – answered from cached data.)' : ''), options: r.options, query: r.query };
    } catch (e) { msgs[msgs.length - 1] = { role: 'bot', text: 'Sorry – ' + e.message }; }
    session.set('chat', msgs.slice(-30));
    draw();
  };
  el.addEventListener('submit', (e) => { e.preventDefault(); const v = $('#q', el).value.trim(); if (v) send(v); });
  el.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]'); if (s) send(s.dataset.s);
    const o = e.target.closest('[data-open]');
    if (o) {
      e.preventDefault();
      const [k, i] = o.dataset.open.split(':').map(Number);
      const m = msgs[k];
      if (!m?.query) return toast('Route no longer available', 'error');
      setJourney({ origin: m.query.origin, destination: m.query.destination, timeMode: 'now' });
      session.set('plan', { query: m.query, options: m.options, meta: {} });
      go('#/route/' + i);
    }
  });
  draw();
}
