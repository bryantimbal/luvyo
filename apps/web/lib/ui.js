// Small DOM/format helpers shared by all screens.
import { formatFareRange } from '/core/fareEngine.js';
import { formatDuration, formatClock } from '/core/timeEngine.js';
import { SOURCE_TYPES } from '/core/trust.js';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const fare = (f) => (f ? formatFareRange(f.min, f.max, f) : '—');
export const dur = (t) => (t && t.min != null ? formatDuration(t.min, t.max) : '—');
export const clock = (d) => (d ? formatClock(new Date(d)) : '—');
export const km = (v) => (v == null ? '—' : v < 1 ? `${Math.round(v * 1000)} m` : `${v.toFixed(1)} km`);
export const peso = (v) => '₱' + (+v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dateStr = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not verified');

export function riderBadge(c) {
  if (!c?.riders) return '';
  const ago = c.lastConfirmedAt ? Math.max(0, Math.round((Date.now() - new Date(c.lastConfirmedAt)) / 86400000)) : null;
  return `<span class="badge src-community_verified" title="Confirmed by riders">👥 ${c.riders} rider${c.riders === 1 ? '' : 's'}${ago != null ? ` · ${ago === 0 ? 'today' : ago + 'd ago'}` : ''}</span>`;
}

export function sourceBadge(type, { dataset, lastVerified } = {}) {
  const s = SOURCE_TYPES[type] || SOURCE_TYPES.indicative;
  const dev = dataset === 'development' ? '<span class="badge badge-dev" title="Development dataset – verify before travel">DEV DATA</span>' : '';
  return `<span class="badge badge-src src-${esc(type || 'indicative')}" title="${esc(s.label)}${lastVerified !== undefined ? ' · Last verified: ' + esc(dateStr(lastVerified)) : ''}">${esc(s.short)}</span>${dev}`;
}

export const TAG_LABEL = { best: 'Best overall', cheapest: 'Cheapest', fastest: 'Fastest', fewest: 'Fewest transfers' };

export function toast(msg, kind = 'info') {
  let box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

export function sheet(html, { onMount } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${html}</div>`;
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.body.append(wrap);
  onMount?.(wrap.querySelector('.sheet'), close);
  return close;
}

export function empty(icon, title, body = '', action = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}${action}</div>`;
}

export const loading = (msg = 'Loading…') => `<div class="loading"><div class="spinner"></div><p>${esc(msg)}</p></div>`;

export function modeIcon(modeId) {
  return { walk: '🚶', jeepney: '🚙', bus: '🚌', rail: '🚆', uv: '🚐', tricycle: '🛺', ferry: '⛴️', mc_taxi: '🏍️', ridehail_car: '🚗', taxi: '🚕' }[modeId] || '•';
}

export function header(title, { back = true, right = '' } = {}) {
  return `<header class="topbar">${back ? '<button class="icon-btn" data-back aria-label="Back">←</button>' : ''}<h1>${esc(title)}</h1><div class="topbar-right">${right}</div></header>`;
}

export function routeCard(o, i) {
  const tags = o.tags.map((t) => `<span class="tag tag-${t}">${TAG_LABEL[t]}</span>`).join('');
  const icons = o.legs.map((l) => `<span class="leg-chip" style="--c:${l.type === 'walk' ? '#8a9690' : 'var(--m-' + l.modeId + ')'}" title="${esc(l.modeLabel)}">${modeIcon(l.modeId)}${l.lineCode ? `<small>${esc(l.lineCode)}</small>` : ''}</span>`).join('<span class="leg-sep">›</span>');
  const providers = o.providerQuotes?.length ? `<div class="muted small">${o.providerQuotes.map((q) => esc(q.name)).join(' · ')}</div>` : '';
  return `<a class="card route-card${o.overBudget ? ' over' : ''}" href="#/route/${i}">
    <div class="tags">${tags}${o.overBudget ? '<span class="tag tag-warn">Over budget</span>' : ''}${o.meetsDeadline === false ? '<span class="tag tag-warn">May arrive late</span>' : ''}</div>
    <div class="route-title">${esc(o.title)}</div>${providers}
    <div class="legs">${icons}</div>
    <div class="route-main">
      <div><div class="big">${esc(fare(o.fare))}</div><div class="muted small">est. fare</div></div>
      <div><div class="big">${esc(dur(o.time))}</div><div class="muted small">arrive ${esc(clock(o.arrive.min))}–${esc(clock(o.arrive.max))}</div></div>
    </div>
    <div class="route-meta">
      <span>🔁 ${o.transfers} transfer${o.transfers === 1 ? '' : 's'}</span><span>🚶 ${esc(km(o.walkKm))}</span><span>📏 ${esc(km(o.distanceKm))}</span>
      ${o.wait.max ? `<span>⏳ wait ${Math.round(o.wait.min)}–${Math.round(o.wait.max)} min</span>` : ''}
    </div>
    <div class="route-src">${sourceBadge(o.sourceType, { dataset: o.legs.some((l) => l.dataset === 'development') ? 'development' : null, lastVerified: o.lastVerified })}${o.legs.map((l) => riderBadge(l.community)).join('')}
      <span class="muted small">Last verified: ${esc(dateStr(o.lastVerified))}</span></div>
  </a>`;
}

/** Segmented sub-navigation for the My Routes hub (Saved · History · Expenses). */
export function myNav(active) {
  const tabs = [['myroutes', '⭐ Saved'], ['history', '🕘 History'], ['commute', '💰 Expenses']];
  return `<div class="chips pad" style="padding-bottom:0" role="tablist">${tabs.map(([k, l]) => `<a class="chip" role="tab" href="#/${k}" aria-pressed="${k === active}">${l}</a>`).join('')}</div>`;
}
