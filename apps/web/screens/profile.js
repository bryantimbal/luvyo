import { store } from '../lib/store.js';
import { auth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { header, esc, toast, $ } from '../lib/ui.js';
import { t } from '../lib/i18n.js';

export default async function profile(el, { go, refresh }) {
  const s = store.get();
  const user = auth.user();
  el.innerHTML = `${header(t('profile'), { back: false, right: '<a class="icon-btn" href="#/settings" aria-label="Settings">⚙️</a>' })}
  <div class="pad stack">
    <div class="card row"><div class="ic" style="width:56px;height:56px;border-radius:50%;background:var(--green-l);display:grid;place-items:center;font-size:1.6rem">${user?.user_metadata?.avatar_url ? `<img src="${esc(user.user_metadata.avatar_url)}" alt="" style="width:56px;height:56px;border-radius:50%">` : '👤'}</div>
      <div class="grow"><b>${esc(s.profile.name || 'Guest commuter')}</b><div class="muted small">${user ? esc(user.email) : 'Guest mode · data stays on this device'}</div></div>
      ${user ? '<button class="btn sm ghost" data-out>Sign out</button>' : '<a class="btn sm" href="#/login">Sign in</a>'}</div>
    <form class="card stack" id="f">
      <h2>Your details</h2>
      <div><label class="f" for="name">Display name</label><input class="input" id="name" value="${esc(s.profile.name)}" maxlength="60"></div>
      <div class="row"><div class="grow"><label class="f" for="pax">Passenger type</label><select class="input" id="pax">${[['regular', 'Regular'], ['student', 'Student'], ['senior', 'Senior citizen'], ['pwd', 'PWD']].map(([v, l]) => `<option value="${v}" ${s.profile.passengerType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="grow"><label class="f" for="lang">Language</label><select class="input" id="lang"><option value="en" ${s.profile.language === 'en' ? 'selected' : ''}>English</option><option value="fil" ${s.profile.language === 'fil' ? 'selected' : ''}>Filipino</option></select></div></div>
      <div class="row"><div class="grow"><label class="f" for="bd">Daily budget ₱</label><input class="input" id="bd" type="number" min="0" value="${s.profile.budgetDaily || ''}"></div><div class="grow"><label class="f" for="bm">Monthly budget ₱</label><input class="input" id="bm" type="number" min="0" value="${s.profile.budgetMonthly || ''}"></div></div>
      <p class="muted small">Home and work locations are managed in <a href="#/myroutes">My Routes → Saved places</a>.</p>
      <button class="btn block">Save profile</button>
    </form>
    <div class="card"><h2>My community reports</h2><div id="reports" class="muted small">Loading…</div></div>
    <ul class="list card">
      <li><a href="#/settings"><span class="ic">⚙️</span><span class="grow">Settings & notifications</span></a></li>
      <li><a href="#/privacy"><span class="ic">🔒</span><span class="grow">Privacy policy & terms</span></a></li>
      <li><button data-export><span class="ic">⬇️</span><span class="grow">Export my data (JSON)</span></button></li>
      <li><button data-delete><span class="ic">🗑️</span><span class="grow" style="color:#9a2a14">Delete my account & data</span></button></li>
    </ul>
    <p class="muted small" style="text-align:center">SakayPinoy v0.1 · Mas Mabilis Magplano. Mas Tipid Magbiyahe.</p>
  </div>`;

  api.myReports(s.deviceId).then((r) => {
    $('#reports', el).innerHTML = r.length ? r.map((x) => `<div class="row between" style="padding:4px 0"><span>${esc(x.category.replace(/_/g, ' '))}: ${esc(x.description.slice(0, 50))}</span><span class="badge">${esc(x.status.replace('_', ' '))}</span></div>`).join('') : 'No reports yet.';
  });

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (id) => $('#' + id, el).value;
    store.set((st) => ({ profile: { ...st.profile, name: v('name').trim(), passengerType: v('pax'), language: v('lang'), budgetDaily: +v('bd') || null, budgetMonthly: +v('bm') || null } }));
    toast('Profile saved', 'success'); refresh();
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-out]')) { await auth.signOut(); toast('Signed out'); refresh(); }
    if (e.target.closest('[data-export]')) {
      const { deviceId, ...data } = store.get();
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), account: auth.user()?.email ?? null, ...data }, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'sakaypinoy-my-data.json' });
      a.click(); URL.revokeObjectURL(a.href);
    }
    if (e.target.closest('[data-delete]')) {
      if (!confirm('Delete all your SakayPinoy data on this device' + (auth.user() ? ' and request deletion of your account' : '') + '? This cannot be undone.')) return;
      if (auth.user()) {
        // Account deletion runs server-side (Supabase edge function `delete-account`, see docs) with the user's own token.
        try { await fetch('/api/account', { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.session().access_token } }); } catch {}
        await auth.signOut();
      }
      store.reset();
      toast('Your data was deleted');
      go('#/onboarding');
    }
  });
}
