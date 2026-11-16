// SakayPinoy admin portal. Talks only to /api/admin/* with a role-scoped bearer token.
// Every change is audit-logged server-side; fare edits also go to fare history.
import { SOURCE_TYPES } from '/core/trust.js';

const app = document.getElementById('app');
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
let token = sessionStorage.getItem('sp-admin-token') || '';
let me = null;

async function call(path, opts = {}) {
  const res = await fetch('/api/admin' + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const can = (p) => me?.perms?.includes(p);

// collection → { title, cols, template, perm }
const SRC = Object.keys(SOURCE_TYPES).join(' | ');
const COLS = {
  lines: { title: 'Routes', perm: 'write:data', cols: [['code', 'Code'], ['name', 'Name'], ['modeId', 'Mode'], ['stopIds', 'Stops', (v) => v?.length], ['verified', 'Verified', (v) => (v ? '✓' : '<span class="badge warn">no</span>')], ['operational', 'Operational', (v) => (v === false ? '<span class="badge warn">no</span>' : '✓')]],
    template: { id: '', code: '', name: '', modeId: 'jeepney', operatorId: '', stopIds: [], signboard: '', bidirectional: true, operational: true, verified: false, headwayMin: [5, 15], operatingHours: { default: { start: '05:00', end: '22:00' } }, sourceType: 'admin_verified', dataset: 'production', lastVerified: new Date().toISOString().slice(0, 10), notes: '' } },
  stops: { title: 'Stops & terminals', perm: 'write:data', cols: [['name', 'Name'], ['kind', 'Kind'], ['lat', 'Lat'], ['lng', 'Lng']], template: { id: '', name: '', kind: 'jeepney_stop', lat: 14.6, lng: 121.0, cityId: 'mm', sourceType: 'admin_verified', dataset: 'production' } },
  fareSchedules: { title: 'Fare schedules', perm: 'write:fares', cols: [['name', 'Name'], ['kind', 'Kind'], ['scope', 'Scope', (v) => esc(JSON.stringify(v))], ['effectiveFrom', 'Effective'], ['lastVerified', 'Verified', (v) => v || '<span class="badge warn">never</span>']],
    template: { id: '', name: '', scope: { modeId: 'jeepney' }, kind: 'distance', params: { baseFare: 0, baseKm: 4, perKm: 0, rounding: 0.25 }, discounts: { student: { rate: 0.2, legalBasis: 'RA 11314' }, senior: { rate: 0.2, legalBasis: 'RA 9994' }, pwd: { rate: 0.2, legalBasis: 'RA 10754' } }, effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: null, active: true, sourceType: 'official', sourceNote: 'Cite the fare order / matrix', lastVerified: new Date().toISOString().slice(0, 10), dataset: 'production' },
    help: `kind: distance {baseFare, baseKm, perKm} | rail_matrix {matrix: {"stopA|stopB": fare}} | rail_distance {boarding, perKm, minFare, maxFare} | fixed {fare} | meter {flagDown, perKm, perMin} | tnvs {base, perKm, perMin, surgeMax, minFare} | tiered {tiers:[{uptoKm, flat}|{uptoKm, perKm}]} | zone {baseFare, specialTripFare} | negotiated {}. scope: one of lineId, operatorId, modeId, providerId, zoneId. sourceType: ${SRC}. Omit a passenger type from "discounts" when eligibility is not confirmed.` },
  operators: { title: 'Operators', perm: 'write:data', cols: [['name', 'Name'], ['modeId', 'Mode'], ['website', 'Website']], template: { id: '', name: '', modeId: 'jeepney', website: '', contact: '', dataset: 'production' } },
  providers: { title: 'Ride-hailing providers', perm: 'providers', cols: [['name', 'Name'], ['modeId', 'Mode'], ['integration', 'Integration'], ['enabled', 'Enabled', (v) => (v === false ? 'off' : 'on')]],
    template: { id: '', name: '', modeId: 'mc_taxi', vehicle: 'Motorcycle', integration: 'none', enabled: true, website: '', storeUrl: '', deepLink: '', notes: 'Confirm API availability, auth, commercial rights, pricing and rate limits before enabling an integration.' } },
  tricycleZones: { title: 'Tricycle zones', perm: 'write:data', cols: [['name', 'Name'], ['cityId', 'City'], ['fareType', 'Fare type'], ['radiusKm', 'Radius km']], template: { id: '', name: '', cityId: '', barangays: [], center: { lat: 14.6, lng: 121.0 }, radiusKm: 1, terminals: [], fareType: 'fixed', capacity: null, active: true, sourceType: 'admin_verified', dataset: 'production' } },
  places: { title: 'Places & landmarks', perm: 'write:data', cols: [['name', 'Name'], ['type', 'Type'], ['aliases', 'Aliases', (v) => esc((v || []).join(', '))]], template: { id: '', name: '', type: 'landmark', lat: 14.6, lng: 121.0, aliases: [], dataset: 'production' } },
  advisories: { title: 'Advisories', perm: 'advisories', cols: [['title', 'Title'], ['source', 'Source'], ['severity', 'Severity'], ['expiresAt', 'Expires', (v) => (v && new Date(v) < new Date() ? `<span class="badge warn">expired</span> ${esc(v.slice(0, 10))}` : esc((v || '').slice(0, 10)))]],
    template: { id: '', title: '', body: '', source: 'MMDA', url: '', sourceType: 'official', severity: 'warning', area: '', modes: [], lineIds: [], publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), active: true } },
  cities: { title: 'Cities (coverage)', perm: 'write:data', cols: [['name', 'Name'], ['region', 'Region'], ['active', 'Active', (v) => (v ? '✓' : '—')]], template: { id: '', name: '', region: '', active: false } },
};

const NAV = [['dashboard', '📊 Dashboard'], ['lines', '🚙 Routes'], ['stops', '🚏 Stops'], ['fareSchedules', '₱ Fares'], ['operators', '🏢 Operators'], ['providers', '🏍️ Providers'], ['tricycleZones', '🛺 Tricycle zones'], ['places', '📌 Places'], ['advisories', '⚠️ Advisories'], ['cities', '🗺️ Cities'], ['reports', '🚩 Moderation'], ['import', '⬆️ Import'], ['fareHistory', '🕘 Fare history'], ['audit', '📜 Audit log']];

function shell(active, body) {
  app.innerHTML = `<div class="layout"><aside><div class="brand"><img src="/icons/icon.svg" alt="">SakayPinoy Admin</div>
    ${NAV.map(([k, l]) => `<a href="#${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}
    <div class="who">${esc(me.name)} · ${esc(me.role)}<br><a href="#" id="logout" style="padding:4px 0">Sign out</a></div></aside><main>${body}</main></div>`;
  document.getElementById('logout').onclick = (e) => { e.preventDefault(); sessionStorage.removeItem('sp-admin-token'); token = ''; boot(); };
}

async function dashboard() {
  const a = await call('/analytics');
  const top = (rows) => { const max = Math.max(1, ...rows.map((r) => r[1])); return rows.length ? `<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="width:50%"><div class="bar" style="width:${(v / max) * 100}%"></div></td><td>${v}</td></tr>`).join('')}</table>` : '<p class="muted">No data yet.</p>'; };
  shell('dashboard', `<h1>Dashboard</h1>
    <div class="cards">
      <div class="card"><span class="muted">Route searches</span><b>${a.searches}</b></div>
      <div class="card"><span class="muted">Search failures</span><b>${a.failedSearches}</b></div>
      <div class="card"><span class="muted">Fare estimates</span><b>${a.fareRequests}</b></div>
      <div class="card"><span class="muted">Pending reports</span><b>${a.pendingReports}</b></div>
      <div class="card"><span class="muted">Unverified routes</span><b>${a.unverifiedLines}</b></div>
      <div class="card"><span class="muted">Dev-data records</span><b>${a.devRecords}</b><span class="small muted">replace before launch</span></div>
    </div>
    <p class="muted small">${esc(a.users.note)}</p>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      <div class="card"><h3>Most searched destinations</h3>${top(a.topDestinations)}</div>
      <div class="card"><h3>Transport usage (top results)</h3>${top(a.topModes)}</div>
      <div class="card"><h3>Provider app opens</h3>${top(a.providerOpens)}</div>
      <div class="card"><h3>Records</h3>${top(Object.entries(a.counts))}</div>
    </div>`);
}

async function collection(name) {
  const cfg = COLS[name];
  const rows = await call('/' + name);
  const editable = can(cfg.perm);
  let filter = '';
  const draw = () => {
    const f = filter.toLowerCase();
    const shown = rows.filter((r) => !f || JSON.stringify(r).toLowerCase().includes(f));
    shell(name, `<div class="row between"><h1>${cfg.title} (${rows.length})</h1><div class="row"><input id="flt" placeholder="Filter…" value="${esc(filter)}">${editable ? '<button class="btn" id="new">+ New</button>' : ''}</div></div>
      ${cfg.help ? `<p class="small muted">${esc(cfg.help)}</p>` : ''}
      <table><thead><tr>${cfg.cols.map(([, l]) => `<th>${l}</th>`).join('')}<th>Data</th><th></th></tr></thead><tbody>
      ${shown.map((r) => `<tr>${cfg.cols.map(([k, , fmt]) => `<td>${fmt ? fmt(r[k]) : esc(r[k])}</td>`).join('')}
        <td>${r.dataset === 'development' ? '<span class="badge dev">DEV</span>' : r.dataset ? `<span class="badge">${esc(r.dataset)}</span>` : ''} ${r.sourceType ? `<span class="badge">${esc(r.sourceType)}</span>` : ''}</td>
        <td class="row">${editable ? `<button class="btn sm ghost" data-edit="${esc(r.id)}">Edit</button><button class="btn sm warn" data-del="${esc(r.id)}">Delete</button>` : `<button class="btn sm ghost" data-edit="${esc(r.id)}">View</button>`}</td></tr>`).join('')}
      </tbody></table>`);
    const flt = document.getElementById('flt');
    flt.oninput = () => { filter = flt.value; draw(); document.getElementById('flt').focus(); };
    document.getElementById('new')?.addEventListener('click', () => editor(name, structuredClone(cfg.template), true));
    app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(name, rows.find((r) => r.id === b.dataset.edit), editable)));
    app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this record? It is kept in the audit log.')) return;
      try { await call(`/${name}/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); collection(name); } catch (e) { alert(e.message); }
    }));
  };
  draw();
}

function editor(name, rec, editable) {
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="row between"><h2 style="margin:0">${rec.id ? 'Edit' : 'New'} ${esc(COLS[name].title)}</h2><button class="btn ghost sm" data-x>Close</button></div>
    <p class="small muted">Edit as JSON. Mark <code>dataset</code> as "production" and set <code>sourceType</code>/<code>lastVerified</code> only after verifying against the source.</p>
    <textarea class="json" ${editable ? '' : 'readonly'}>${esc(JSON.stringify(rec, null, 2))}</textarea>
    <p class="err" id="err"></p>${editable ? '<div class="row"><button class="btn" data-save>Save</button></div>' : ''}`;
  document.body.append(d);
  d.showModal();
  d.querySelector('[data-x]').onclick = () => { d.close(); d.remove(); };
  d.querySelector('[data-save]')?.addEventListener('click', async () => {
    try {
      const v = JSON.parse(d.querySelector('textarea').value);
      if (!v.id) delete v.id;
      await call('/' + name, { method: 'PUT', body: v });
      d.close(); d.remove(); collection(name);
    } catch (e) { d.querySelector('#err').textContent = e.message; }
  });
}

async function reports() {
  const rows = (await call('/reports')).slice().reverse();
  const STAT = ['pending', 'under_review', 'verified', 'rejected', 'expired'];
  shell('reports', `<h1>Community moderation (${rows.length})</h1>
    <p class="small muted">Verifying a report records that it is accurate; it does <b>not</b> change official data. Apply corrections in Routes/Fares, then mark the report verified.</p>
    <table><thead><tr><th>When</th><th>Category</th><th>Description</th><th>Location</th><th>Reporter</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="small">${esc(new Date(r.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))}</td><td>${esc(r.category)}</td>
      <td>${esc(r.description)}${r.lineId ? `<div class="small muted">Related: ${esc(r.lineId)}</div>` : ''}${r.photo ? `<div><img src="${esc(r.photo)}" alt="Report photo" style="max-width:160px;border-radius:8px;margin-top:4px"></div>` : ''}</td>
      <td class="small">${esc(r.locationName || '')}${r.lat != null ? `<br>${(+r.lat).toFixed(5)}, ${(+r.lng).toFixed(5)}` : ''}</td>
      <td class="small">${esc(r.reporterId).slice(0, 8)}</td><td><span class="badge">${esc(r.status)}</span>${r.reviewedBy ? `<div class="small muted">by ${esc(r.reviewedBy)}</div>` : ''}</td>
      <td>${can('moderate') ? `<select data-status="${esc(r.id)}">${STAT.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No reports.</td></tr>'}
    </tbody></table>`);
  app.querySelectorAll('[data-status]').forEach((s) => (s.onchange = async () => {
    const note = s.value === 'rejected' ? prompt('Reason (optional, shown to moderators)') : null;
    try { await call(`/reports/${encodeURIComponent(s.dataset.status)}/status`, { method: 'POST', body: { status: s.value, note } }); reports(); } catch (e) { alert(e.message); }
  }));
}

function importer() {
  shell('import', `<h1>Import data</h1>
    <div class="card"><h3>GeoJSON</h3><p class="small muted">FeatureCollection. <b>Point</b> features become stops (properties: id, name, kind). <b>LineString</b> features with <code>modeId</code> become routes (properties: id, code, name, modeId, operatorId, stopNames[], verified). Imported records are tagged <code>dataset: "imported"</code>.</p>
    <input type="file" id="file" accept=".geojson,.json,application/geo+json,application/json"> <button class="btn" id="go" ${can('write:data') ? '' : 'disabled'}>Import</button><p id="out"></p></div>
    <div class="card" style="margin-top:12px"><h3>GTFS / CSV</h3><p class="small muted">Convert GTFS <code>stops.txt</code>/<code>shapes.txt</code> or CSV to GeoJSON (e.g. with <code>gtfs-to-geojson</code>) and import above, or load directly into Supabase using the schema in <code>supabase/migrations</code>. See docs/DATA.md.</p></div>`);
  document.getElementById('go').onclick = async () => {
    const f = document.getElementById('file').files[0];
    if (!f) return;
    try { const r = await call('/import/geojson', { method: 'POST', body: JSON.parse(await f.text()) }); document.getElementById('out').textContent = `Imported ${r.stops} stop(s) and ${r.lines} route(s).`; }
    catch (e) { document.getElementById('out').textContent = 'Error: ' + e.message; }
  };
}

async function logView(kind) {
  const rows = await call(kind === 'audit' ? '/audit' : '/fare-history');
  shell(kind, `<h1>${kind === 'audit' ? 'Audit log' : 'Fare history'}</h1><table><thead><tr><th>When</th>${kind === 'audit' ? '<th>Actor</th><th>Action</th><th>Entity</th>' : '<th>Schedule</th><th>Changed by</th>'}<th>Before</th></tr></thead><tbody>
    ${rows.map((r) => kind === 'audit'
      ? `<tr><td class="small">${esc(new Date(r.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))}</td><td>${esc(r.actor)}<div class="small muted">${esc(r.role || '')}</div></td><td>${esc(r.action)}</td><td>${esc(r.entity)}<div class="small muted">${esc(r.entityId)}</div></td><td><pre>${esc(r.before ? JSON.stringify(r.before, null, 1) : '—')}</pre></td></tr>`
      : `<tr><td class="small">${esc(new Date(r.changedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))}</td><td>${esc(r.scheduleId)}</td><td>${esc(r.actor?.name || '')}</td><td><pre>${esc(JSON.stringify(r.before, null, 1))}</pre></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing yet.</td></tr>'}</tbody></table>`);
}

async function route() {
  const k = location.hash.slice(1) || 'dashboard';
  try {
    if (k === 'dashboard') await dashboard();
    else if (k === 'reports') await reports();
    else if (k === 'import') importer();
    else if (k === 'audit' || k === 'fareHistory') await logView(k);
    else if (COLS[k]) await collection(k);
    else location.hash = 'dashboard';
  } catch (e) { shell(k, `<h1>Error</h1><p class="err">${esc(e.message)}</p>`); }
}

async function boot() {
  if (token) {
    try { me = await call('/me'); addEventListener('hashchange', route); return route(); } catch { token = ''; }
  }
  app.innerHTML = `<div class="login"><form class="card" id="f"><h2 style="margin:0">SakayPinoy Admin</h2><p class="small muted">Sign in with your admin access token.</p>
    <input id="t" type="password" placeholder="Admin token" autocomplete="current-password" required><button class="btn">Sign in</button><p class="err" id="err"></p></form></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    token = document.getElementById('t').value.trim();
    try { me = await call('/me'); sessionStorage.setItem('sp-admin-token', token); addEventListener('hashchange', route); route(); }
    catch (err) { document.getElementById('err').textContent = err.message; token = ''; }
  };
}
boot();
