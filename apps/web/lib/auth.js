// Supabase Auth via its REST API (no SDK needed). Only the public anon key is
// used in the browser; privileged operations happen server-side.
import { store } from './store.js';

let cfg = { supabaseUrl: null, supabaseAnonKey: null };
const SKEY = 'sakaypinoy:session';

export const auth = {
  configure(c) { cfg = c || cfg; this._captureRedirect(); },
  get enabled() { return !!(cfg.supabaseUrl && cfg.supabaseAnonKey); },
  session() { try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } },
  user() { return this.session()?.user ?? null; },
  async _req(path, body, token) {
    if (!this.enabled) throw new Error('Accounts are not configured on this server yet. You can keep using SakayPinoy as a guest.');
    const res = await fetch(cfg.supabaseUrl + path, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Authentication failed');
    return data;
  },
  _save(s) { localStorage.setItem(SKEY, JSON.stringify(s)); if (s.user?.user_metadata?.full_name && !store.get().profile.name) store.set((st) => ({ profile: { ...st.profile, name: s.user.user_metadata.full_name } })); },
  async signIn(email, password) { const s = await this._req('/auth/v1/token?grant_type=password', { email, password }); this._save(s); return s; },
  async signUp(email, password, name) {
    const s = await this._req('/auth/v1/signup', { email, password, data: { full_name: name } });
    if (s.access_token) this._save(s);
    return s;
  },
  google() {
    if (!this.enabled) throw new Error('Google sign-in needs Supabase to be configured on the server.');
    location.href = `${cfg.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + '/#/home')}`;
  },
  _captureRedirect() {
    const h = location.hash;
    if (!h.includes('access_token=')) return;
    const p = new URLSearchParams(h.replace(/^#\/?[^#]*#?/, '').replace(/^.*?access_token/, 'access_token'));
    const token = p.get('access_token');
    if (token) this._req('/auth/v1/user', null, token).then((user) => { this._save({ access_token: token, refresh_token: p.get('refresh_token'), user }); location.hash = '#/home'; }).catch(() => {});
  },
  async signOut() {
    const s = this.session();
    localStorage.removeItem(SKEY);
    if (s && this.enabled) await this._req('/auth/v1/logout', {}, s.access_token).catch(() => {});
  },
};
