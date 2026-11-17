import { store } from '../lib/store.js';
import { esc } from '../lib/ui.js';
import { languageSwitch } from '../lib/i18n.js';

const SLIDES = [
  { art: '🚙🚆🏍️', title: 'One destination. Many ways to get there.', body: 'Compare jeepney, bus, MRT/LRT, UV Express, tricycle, motorcycle taxi, taxi and ride-hailing in one place.' },
  { art: '₱⏱️', title: 'Know the cost before you go.', body: 'Every option shows the estimated total fare and travel time – with where the numbers come from.' },
  { art: '📍🧭', title: 'Sakay. Baba. Lipat.', body: 'Step-by-step directions tell you where to board, where to get off and where to transfer.' },
];

export default function onboarding(el, { go }) {
  let i = 0;
  const draw = () => {
    const s = SLIDES[i];
    el.innerHTML = `<div class="onb">
      <div class="onb-slide"><div class="art" aria-hidden="true">${s.art}</div><h1>${esc(s.title)}</h1><p>${esc(s.body)}</p></div>
      <div class="onb-card stack">
        <div class="row between"><span class="small muted">Language / Wika</span>${languageSwitch()}</div>
        <div class="dots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        ${i < SLIDES.length - 1
          ? `<button class="btn block" data-next>Next</button><button class="btn ghost block" data-skip>Skip</button>`
          : `<label class="f" for="pax">Passenger type (for fare discounts)</label>
             <select id="pax" class="input"><option value="regular">Regular</option><option value="student">Student</option><option value="senior">Senior citizen</option><option value="pwd">Person with disability</option></select>
             <p class="muted small">Discounts are applied only where the service's eligibility is confirmed. You may be asked for a valid ID when paying.</p>
             <button class="btn block" data-guest>Start as guest</button>
             <button class="btn ghost block" data-login>Sign in / Create account</button>
             <p class="muted small">By continuing you agree to our <a href="#/privacy">Privacy Policy and Terms</a>.</p>`}
      </div></div>`;
  };
  const finish = (to) => {
    const pax = el.querySelector('#pax')?.value || 'regular';
    store.set((s) => ({ onboarded: true, profile: { ...s.profile, passengerType: pax } })); // language already set by the switch (default English)
    go(to);
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-lang]')) setTimeout(draw, 0); // redraw this slide in the new language
    if (e.target.closest('[data-next]')) { i++; draw(); }
    if (e.target.closest('[data-skip]')) { i = SLIDES.length - 1; draw(); }
    if (e.target.closest('[data-guest]')) finish('#/home');
    if (e.target.closest('[data-login]')) finish('#/login');
  });
  draw();
}
