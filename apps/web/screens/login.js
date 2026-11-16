import { auth } from '../lib/auth.js';
import { header, toast, esc } from '../lib/ui.js';

export default function login(el, { go }) {
  let mode = 'signin';
  const draw = () => {
    el.innerHTML = `${header(mode === 'signin' ? 'Sign in' : 'Create account')}
    <div class="pad stack">
      ${auth.enabled ? '' : '<div class="banner warn" style="margin:0">Accounts are not configured on this server (Supabase). You can use every route feature as a guest; your data stays on this device.</div>'}
      <button class="btn ghost block" data-google ${auth.enabled ? '' : 'disabled'}>Continue with Google</button>
      <form class="stack" id="f">
        ${mode === 'signup' ? '<div><label class="f" for="name">Display name</label><input class="input" id="name" autocomplete="name" required maxlength="60"></div>' : ''}
        <div><label class="f" for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" required></div>
        <div><label class="f" for="pw">Password</label><input class="input" id="pw" type="password" minlength="8" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" required></div>
        <button class="btn block" ${auth.enabled ? '' : 'disabled'}>${mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <p class="small muted" id="err" role="alert"></p>
      </form>
      <button class="btn soft block" data-toggle>${mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
      <button class="btn ghost block" data-guest>Continue as guest</button>
    </div>`;
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle]')) { mode = mode === 'signin' ? 'signup' : 'signin'; draw(); }
    if (e.target.closest('[data-guest]')) go('#/home');
    if (e.target.closest('[data-google]')) { try { auth.google(); } catch (err) { toast(err.message, 'error'); } }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => el.querySelector('#' + id)?.value.trim();
    try {
      if (mode === 'signin') await auth.signIn(v('email'), el.querySelector('#pw').value);
      else {
        const r = await auth.signUp(v('email'), el.querySelector('#pw').value, v('name'));
        if (!r.access_token) { toast('Check your email to confirm your account.', 'success'); return; }
      }
      toast('Signed in', 'success');
      go('#/home');
    } catch (err) { el.querySelector('#err').textContent = esc(err.message); }
  });
  draw();
}
