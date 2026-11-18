// Admin: turn an LTFRB board resolution (PDF) into routes.
// 1 Upload → 2 Review the extracted fields and street lists → 3 Trace on the map → 4 Create routes.
import { blankResolution } from '/core/resolution.js';

const ACTIONS = ['new', 'modification', 'reopening', 'extension', 'cancellation', 'suspension', 'other'];
const MODES = [['jeepney', 'Jeepney (PUJ)'], ['bus', 'Bus (PUB)'], ['uv', 'UV Express']];
let state = { draft: blankResolution(), hints: [], text: '', warnings: [], method: '', trace: null, filename: '' };

const listText = (items) => (items || []).map((s) => (typeof s === 'string' ? s : s.lgu ? `${s.name} | ${s.lgu}` : s.name)).join('\n');

export async function resolutions(ctx) {
  const { call, shell, esc, can, app } = ctx;
  const existing = await call('/resolutions');
  const d = state.draft;
  const editable = can('write:data');
  const field = (k, label, type = 'text', extra = '') => `<label>${label}<input data-f="${k}" type="${type}" value="${esc(d[k] ?? '')}" ${extra}></label>`;

  shell('resolutions', `<h1>LTFRB board resolutions</h1>
    <p class="small muted">Turn a resolution (new or modified route) into LUVYO routes. The text is read automatically, then <b>you check every field</b> against the PDF. Routes created here are marked <b>official</b> with the resolution cited, but <b>not verified</b>: a resolution approves a route, it doesn't prove that jeepneys run it today.</p>

    <div class="card"><h3 style="margin-top:0">1 · Upload the PDF</h3>
      <div class="row"><input type="file" id="pdf" accept="application/pdf,.pdf"> <button class="btn" id="read" ${editable ? '' : 'disabled'}>Read it</button> <span id="rs" class="small muted"></span></div>
      ${state.method ? `<p class="small">Read with <b>${esc(state.method)}</b>${state.filename ? ` from ${esc(state.filename)}` : ''}.</p>` : ''}
      ${state.warnings.map((w) => `<div class="notice small">${esc(w)}</div>`).join('')}
    </div>

    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">2 · Check the details</h3>
      <div class="form">
        ${field('number', 'Resolution no.')}${field('series', 'Series (year)')}${field('dateSigned', 'Date signed', 'date')}
        <label>Action<select data-f="action">${ACTIONS.map((a) => `<option ${a === d.action ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Mode<select data-f="modeId">${MODES.map(([v, l]) => `<option value="${v}" ${v === d.modeId ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${field('caseNumber', 'Case number')}
        <label class="wide">Route name (approved)<input data-f="routeName" value="${esc(d.routeName)}" placeholder="Origin – Destination"></label>
        <label class="wide">Previous route (for a modification)<input data-f="previousRoute" value="${esc(d.previousRoute)}"></label>
        ${field('lengthKm', 'Route length (km)', 'number', 'step="0.1"')}${field('units', 'Authorized units (NAU)', 'number')}
        <label class="wide">Title<input data-f="title" value="${esc(d.title)}"></label>
        <label class="wide">Conditions (one per line)<textarea data-f="conditions" rows="4">${esc((d.conditions || []).join('\n'))}</textarea></label>
      </div>
      <h4>Street lists (Annex A)</h4>
      <p class="small muted">One line per row, in travel order, terminals first and last: <code>Street name | LGU</code>. Repeated rows are merged. If a place isn't found, pin it with <code>@14.6123,121.0456</code>.</p>
      ${state.hints.length ? `<p class="small">Found in the PDF (click to add to the list you last clicked): ${state.hints.map((h) => `<button class="chip" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}</p>` : ''}
      <div class="cols2">
        <div><div class="row between"><b>Westbound / going</b></div><textarea class="streets" id="wb">${esc(listText(d.westbound))}</textarea></div>
        <div><div class="row between"><b>Eastbound / return</b><button class="btn sm ghost" id="rev">Reverse of westbound</button></div><textarea class="streets" id="eb">${esc(listText(d.eastbound))}</textarea></div>
      </div>
      ${state.text ? `<details style="margin-top:8px"><summary class="small">Text read from the PDF</summary><pre style="max-height:320px">${esc(state.text)}</pre></details>` : ''}
    </div>

    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">3 · Trace on the map</h3>
      <p class="small muted">Finds each corner on OpenStreetMap and draws the road path. Takes about a minute per direction (OpenStreetMap's free service allows one lookup per second).</p>
      <div class="row"><button class="btn" id="trace" ${editable ? '' : 'disabled'}>Trace route</button><span id="ts" class="small muted">${state.trace?.status === 'done' ? 'Done. Check the list and the map, fix any ✗ lines, and trace again if needed.' : state.trace?.status === 'failed' ? 'Failed: ' + esc(state.trace.error) : ''}</span></div>
      <div id="tr"></div><div id="brmap" hidden></div>
    </div>

    <div class="card" style="margin-top:12px"><h3 style="margin-top:0">4 · Create the routes</h3>
      <label class="row small"><input type="checkbox" id="op"> Jeepneys already run this route (show it in trip planning now)</label>
      <p class="small muted">Leave unticked until the operator starts service or riders confirm it; the route is saved either way and can be switched on in Routes.</p>
      <label class="small">Routes this one replaces (ids, comma-separated; they will be marked not operational)<br><input id="retire" style="width:100%" placeholder="e.g. jp-lagro-cubao"></label>
      <div class="row" style="margin-top:8px"><button class="btn" id="apply" ${editable ? '' : 'disabled'}>Create routes</button><span id="as" class="small"></span></div>
    </div>

    <h3>Imported so far (${existing.length})</h3>
    <table><thead><tr><th>Resolution</th><th>Route</th><th>Routes created</th></tr></thead><tbody>
    ${existing.map((r) => `<tr><td>${esc(r.citation)}<div class="small muted">${esc(r.caseNumber || '')}</div></td><td>${esc(r.title || '')}${r.previousRoute ? `<div class="small muted">was ${esc(r.previousRoute)}</div>` : ''}</td>
      <td>${r.lines.map((l) => `<div>${esc(l.name)} ${l.operational ? '' : '<span class="badge warn">not running</span>'} ${l.verified ? '<span class="badge">verified</span>' : ''}</div>`).join('')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None yet.</td></tr>'}
    </tbody></table>`);

  const $ = (id) => document.getElementById(id);
  const collect = () => {
    for (const el of app.querySelectorAll('[data-f]')) {
      const k = el.dataset.f;
      d[k] = k === 'conditions' ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value.trim();
    }
    d.westbound = $('wb').value.split('\n').map((x) => x.trim()).filter(Boolean);
    d.eastbound = $('eb').value.split('\n').map((x) => x.trim()).filter(Boolean);
  };
  let lastList = $('wb');
  for (const t of [$('wb'), $('eb')]) t.onfocus = () => { lastList = t; };
  app.querySelectorAll('[data-hint]').forEach((b) => (b.onclick = () => { lastList.value = (lastList.value.trim() ? lastList.value.trim() + '\n' : '') + b.dataset.hint; }));
  $('rev').onclick = () => { $('eb').value = $('wb').value.split('\n').filter((x) => x.trim()).reverse().join('\n'); };

  $('read').onclick = async () => {
    const f = $('pdf').files[0];
    if (!f) return;
    $('rs').textContent = 'Reading… (OCR of a scan takes up to a minute)';
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      const out = await call('/resolutions/extract', { method: 'POST', body: { filename: f.name, pdf: b64 } });
      state = { ...state, ...out, draft: { ...blankResolution(), ...out.draft }, trace: null };
      resolutions(ctx);
    } catch (e) { $('rs').textContent = 'Error: ' + e.message; }
  };

  const drawTrace = (job) => {
    const res = job.result || {};
    $('tr').innerHTML = Object.entries(res).map(([dir, r]) => {
      const bad = r.steps.filter((s) => !s.ok).length;
      const km = r.km ? `${r.km.toFixed(1)} km` : '—';
      const vs = d.lengthKm && r.km ? ` (resolution: ${d.lengthKm} km${Math.abs(r.km - d.lengthKm) / d.lengthKm > 0.15 ? ' <span class="badge warn">check</span>' : ''})` : '';
      return `<h4>${esc(dir)} · ${km}${vs} · ${r.waypoints.length} points${bad ? ` · <span class="err">${bad} not found</span>` : ''}</h4>
        <ol class="steps small">${r.steps.map((s) => `<li class="${s.ok ? '' : 'bad'}">${s.ok ? '✓' : '✗'} ${esc(s.label)} <span class="muted">${esc(s.how || s.why)}</span></li>`).join('')}</ol>`;
    }).join('') + (job.status === 'running' ? `<p class="small muted">${esc(job.progress.at(-1) || '')}</p>` : '');
    if (job.status !== 'done' || !globalThis.L) return;
    const el = $('brmap'); el.hidden = false;
    const map = L.map(el, { preferCanvas: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    const colors = { westbound: '#176B45', eastbound: '#E85D3F' };
    const all = [];
    for (const [dir, r] of Object.entries(res)) {
      if (r.shape.length) { L.polyline(r.shape, { color: colors[dir] || '#333', weight: 4, opacity: 0.75 }).addTo(map).bindTooltip(dir); all.push(...r.shape); }
      r.waypoints.forEach((w, i) => L.circleMarker([w.lat, w.lng], { radius: 5, color: colors[dir] || '#333', fillOpacity: 1 }).addTo(map).bindTooltip(`${dir} ${i + 1}. ${w.label}`));
    }
    if (all.length) map.fitBounds(all);
  };
  if (state.trace) drawTrace(state.trace);

  $('trace').onclick = async () => {
    collect();
    $('ts').textContent = 'Starting…';
    try {
      const { jobId } = await call('/resolutions/trace', { method: 'POST', body: { westbound: d.westbound.join('\n'), eastbound: d.eastbound.join('\n') } });
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const job = await call(`/resolutions/trace/${jobId}`);
        if (location.hash !== '#resolutions') return;
        $('ts').textContent = job.status === 'running' ? `Tracing… ${Math.round((Date.now() - job.startedAt) / 1000)} s` : job.status === 'done' ? 'Done. Check the list and the map, fix any ✗ lines, and trace again if needed.' : 'Failed: ' + job.error;
        if (job.status !== 'running') { state.trace = job; return resolutions(ctx); }
        drawTrace(job);
      }
    } catch (e) { $('ts').textContent = 'Error: ' + e.message; }
  };

  $('apply').onclick = async () => {
    collect();
    const res = state.trace?.result;
    if (!res || !Object.keys(res).length) { $('as').textContent = 'Trace the route first.'; return; }
    const bad = Object.values(res).reduce((n, r) => n + r.steps.filter((s) => !s.ok).length, 0);
    if (bad && !confirm(`${bad} street(s) were not found, so the path skips them. Create the routes anyway?`)) return;
    try {
      const out = await call('/resolutions/apply', { method: 'POST', body: {
        resolution: { ...d, westbound: undefined, eastbound: undefined },
        directions: Object.entries(res).map(([dir, r]) => ({ dir, waypoints: r.waypoints, shape: r.shape, km: r.km })),
        operational: $('op').checked, retireLineIds: $('retire').value.split(',').map((x) => x.trim()).filter(Boolean),
      } });
      state = { draft: blankResolution(), hints: [], text: '', warnings: [], method: '', trace: null, filename: '' };
      await resolutions(ctx);
      alert(`Created ${out.lines.map((l) => l.name).join(' and ')} (${out.stops} points) under ${out.citation}.${out.retired.length ? ` Marked not operational: ${out.retired.join(', ')}.` : ''}`);
    } catch (e) { $('as').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
}
