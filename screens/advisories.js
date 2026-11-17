import { api } from '../lib/api.js';
import { header, esc, empty, loading, sourceBadge, dateStr } from '../lib/ui.js';

const SEV = { critical: ['⛔', 'Critical'], warning: ['⚠️', 'Warning'], info: ['ℹ️', 'Info'] };

export default async function advisories(el) {
  el.innerHTML = header('Service advisories') + loading();
  let list = [];
  try { list = await api.advisories(); } catch (e) { el.innerHTML = header('Service advisories') + empty('⚠️', 'Could not load advisories', e.message); return; }
  const now = new Date();
  list = list.filter((a) => !a.expiresAt || new Date(a.expiresAt) > now); // never show expired as active (also enforced server-side)
  el.innerHTML = `${header('Service advisories')}<div class="pad">
    <p class="muted small">Official sources are prioritised: DOTr, LTFRB, MMDA, LRTA, MRT-3, PAGASA, LGUs and operators. Each advisory shows its source and dates.</p>
    ${list.length ? list.map((a) => `<article class="card">
      <div class="row between"><b>${(SEV[a.severity] || SEV.info)[0]} ${esc(a.title)}</b><span class="tag ${a.severity === 'info' ? 'tag-fewest' : 'tag-warn'}">${(SEV[a.severity] || SEV.info)[1]}</span></div>
      <p>${esc(a.body)}</p>
      <dl class="kv"><dt>Source</dt><dd>${esc(a.source)} ${sourceBadge(a.sourceType, { dataset: a.dataset })}</dd><dt>Area</dt><dd>${esc(a.area || '—')}</dd>
      <dt>Published</dt><dd>${esc(dateStr(a.publishedAt))}</dd><dt>Updated</dt><dd>${esc(dateStr(a.updatedAt))}</dd><dt>Expires</dt><dd>${esc(a.expiresAt ? dateStr(a.expiresAt) : 'Until withdrawn')}</dd></dl>
      ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" class="small">Official announcement ↗</a>` : ''}</article>`).join('')
    : empty('✅', 'No active advisories', 'Nothing reported for your area right now.')}
  </div>`;
}
