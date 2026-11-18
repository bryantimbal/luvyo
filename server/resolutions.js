// Admin: LTFRB board resolution intake.
//   POST /api/admin/resolutions/extract   { filename, pdf: base64 }  → draft fields
//   POST /api/admin/resolutions/trace     { westbound, eastbound }   → { jobId }
//   GET  /api/admin/resolutions/trace/:id                            → job status/result
//   POST /api/admin/resolutions/apply     { resolution, directions, operational, retireLineIds }
//   GET  /api/admin/resolutions                                      → routes created from resolutions
//
// Extraction order: Claude reads the PDF when ANTHROPIC_API_KEY is set (best for
// scanned annex tables); else the PDF's text layer; else OCR with Tesseract
// (installed in the Docker image). Every field is then reviewed by a person.

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { blankResolution, parseResolutionText, streetHints, parseStreetList, recordsFromResolution, citation } from '../core/resolution.js';
import { traceDirection, osmClient } from './routeTracer.js';

const run = promisify(execFile);
const MAX_PDF = 15 * 1024 * 1024;
const MAX_PAGES = 12;

// ------------------------------------------------------------ extraction ---
async function have(cmd) { try { await run(cmd, ['--version'], { timeout: 5000 }); return true; } catch (e) { return e.code !== 'ENOENT'; } }

async function pdfToText(pdf, { ocr = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'luvyo-br-'));
  try {
    const file = join(dir, 'in.pdf');
    await writeFile(file, pdf);
    const info = (await run('pdfinfo', [file], { timeout: 15000 })).stdout;
    const pages = +(/Pages:\s+(\d+)/.exec(info)?.[1] || 0);
    if (pages > MAX_PAGES) throw Object.assign(new Error(`The PDF has ${pages} pages; at most ${MAX_PAGES} are read`), { status: 400 });
    const layer = (await run('pdftotext', ['-layout', file, '-'], { timeout: 30000, maxBuffer: 8e6 })).stdout;
    if (layer.replace(/\s/g, '').length > 200 || !ocr) return { text: layer, method: 'text layer' };
    if (!(await have('tesseract'))) return { text: layer, method: 'none', note: 'The PDF is a scan and OCR (Tesseract) is not installed on this server.' };
    await run('pdftoppm', ['-r', '300', '-gray', file, join(dir, 'p')], { timeout: 120000 });
    const imgs = (await readdir(dir)).filter((f) => f.startsWith('p') && f.endsWith('.pgm')).sort();
    let text = '';
    for (const img of imgs) {
      // --psm 1: page layout analysis with orientation detection, so sideways annex tables are read too
      text += (await run('tesseract', [join(dir, img), '-', '--psm', '1', '-l', 'eng'], { timeout: 120000, maxBuffer: 8e6 })).stdout + '\n\f\n';
    }
    return { text, method: 'OCR' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const STREETS = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'lgu'], properties: { name: { type: 'string' }, lgu: { type: 'string' } } } };
const nullable = (t) => ({ anyOf: [{ type: t }, { type: 'null' }] });
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['number', 'series', 'dateSigned', 'title', 'action', 'mode', 'previousRoute', 'routeName', 'caseNumber', 'lengthKm', 'units', 'conditions', 'westbound', 'eastbound', 'otherDirections'],
  properties: {
    number: { type: 'string', description: 'Board Resolution number, digits only' },
    series: { type: 'string', description: 'Series year' },
    dateSigned: { type: 'string', description: 'Date signed as YYYY-MM-DD, or empty' },
    title: { type: 'string' },
    action: { type: 'string', enum: ['new', 'modification', 'reopening', 'extension', 'cancellation', 'suspension', 'other'] },
    mode: { type: 'string', enum: ['jeepney', 'bus', 'uv', 'other'], description: 'PUJ/MPUJ = jeepney, PUB = bus, UV Express = uv' },
    previousRoute: { type: 'string', description: 'Route name before a modification, or empty' },
    routeName: { type: 'string', description: 'Approved route name as written, e.g. "Origin – Destination"' },
    caseNumber: { type: 'string' },
    lengthKm: nullable('number'),
    units: nullable('integer'),
    conditions: { type: 'array', items: { type: 'string' }, description: 'Conditions and directives, one short sentence each' },
    westbound: { ...STREETS, description: 'Streets in travel order for the first direction in the annex (usually Westbound / Northbound / going), terminals included, exactly as listed, with the LGU column' },
    eastbound: { ...STREETS, description: 'Streets in travel order for the other direction (Eastbound / Southbound / return), terminals included' },
    otherDirections: { type: 'string', description: 'If the annex names directions other than Westbound/Eastbound, say which list is which; else empty' },
  },
};
const PROMPT = `This is a Philippine LTFRB Board Resolution about a public utility route, usually with an "Annex A – Route Details" table (sometimes printed sideways) listing the streets for each direction.
Read the whole document and fill in the fields. Copy names exactly as printed (including abbreviations); do not add or guess streets that are not in the document, and keep repeated rows (the same street listed twice for two LGUs) as separate items. Use empty strings or null for anything not stated.`;

async function withClaude(pdf) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const msg = await client.beta.messages.create({
    model: process.env.LUVYO_EXTRACT_MODEL || 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // if the model declines, the API retries on a fallback model
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
      { type: 'text', text: PROMPT },
    ] }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('The model declined to read this document');
  if (msg.stop_reason === 'max_tokens') throw new Error('The answer was cut off');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const j = JSON.parse(text);
  const d = blankResolution();
  Object.assign(d, {
    number: j.number.replace(/\D/g, ''), series: j.series.replace(/\D/g, ''), dateSigned: /^\d{4}-\d{2}-\d{2}$/.test(j.dateSigned) ? j.dateSigned : '',
    title: j.title, action: j.action, modeId: j.mode === 'other' ? 'jeepney' : j.mode, previousRoute: j.previousRoute, routeName: j.routeName,
    caseNumber: j.caseNumber, lengthKm: j.lengthKm, units: j.units, conditions: j.conditions, westbound: j.westbound, eastbound: j.eastbound,
  });
  return { draft: d, notes: j.otherDirections ? [j.otherDirections] : [] };
}

export async function extractResolution(pdf, { useClaude = !!process.env.ANTHROPIC_API_KEY } = {}) {
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('Not a PDF file'), { status: 400 });
  if (pdf.length > MAX_PDF) throw Object.assign(new Error('PDF too large (max 15 MB)'), { status: 413 });
  const warnings = [];
  if (useClaude) {
    try { const r = await withClaude(pdf); return { method: 'Claude', draft: r.draft, hints: [], text: '', warnings: r.notes }; }
    catch (e) { warnings.push(`Claude extraction failed (${e.message}); falling back to OCR.`); }
  }
  let t;
  try { t = await pdfToText(pdf); } catch (e) {
    if (e.status) throw e;
    if (e.code === 'ENOENT') return { method: 'manual', draft: blankResolution(), hints: [], text: '', warnings: [...warnings, 'PDF tools (poppler) are not installed on this server: fill the form by hand.'] };
    throw e;
  }
  if (t.note) warnings.push(t.note);
  const draft = parseResolutionText(t.text);
  if (t.method === 'OCR') warnings.push('Read by OCR: check every field, and type the street lists from Annex A (the table is not read reliably). Street-like text found is listed below as hints.');
  return { method: t.method, draft, hints: streetHints(t.text), text: t.text.slice(0, 60000), warnings };
}

// ------------------------------------------------------------- endpoints ---
export function registerResolutions(on, { repo, body, adminFor, httpError, validate }) {
  const jobs = new Map();
  setInterval(() => { const t = Date.now() - 3600000; for (const [k, j] of jobs) if (j.startedAt < t) jobs.delete(k); }, 600000).unref();
  const osm = osmClient(); // one client: shares Nominatim's 1 request/second spacing and its cache

  // Names riders already know (stops, places) are used before asking OpenStreetMap.
  const lookupLocal = (name) => {
    const n = name.toLowerCase().trim();
    const ds = repo.dataset();
    const hit = [...ds.places, ...ds.stops].find((p) => p.dataset !== 'development' && [p.name, ...(p.aliases || [])].some((x) => String(x).toLowerCase() === n));
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  };

  on('GET', '/api/admin/resolutions', ({ req }) => {
    adminFor(req, 'read');
    const by = new Map();
    for (const l of repo.dataset().lines.filter((x) => x.legalBasis?.type === 'board_resolution')) {
      const k = `${l.legalBasis.series}-${l.legalBasis.number}`;
      if (!by.has(k)) by.set(k, { ...l.legalBasis, citation: citation(l.legalBasis), lines: [] });
      by.get(k).lines.push({ id: l.id, name: l.name, operational: l.operational !== false, verified: !!l.verified });
    }
    return [...by.values()].sort((a, b) => String(b.dateSigned).localeCompare(String(a.dateSigned)));
  });

  on('POST', '/api/admin/resolutions/extract', async ({ req }) => {
    adminFor(req, 'write:data');
    const b = await body(req, 22_000_000);
    if (typeof b.pdf !== 'string') throw httpError(400, 'pdf (base64) is required');
    try { return { filename: String(b.filename || '').slice(0, 200), ...(await extractResolution(Buffer.from(b.pdf, 'base64'))) }; }
    catch (e) { throw httpError(e.status || 500, e.message); }
  });

  on('POST', '/api/admin/resolutions/trace', async ({ req }) => {
    const actor = adminFor(req, 'write:data');
    const b = await body(req, 200_000);
    const dirs = ['westbound', 'eastbound'].map((dir) => ({ dir, items: parseStreetList(b[dir]) })).filter((d) => d.items.length);
    if (!dirs.length) throw httpError(400, 'Enter at least one street list');
    for (const d of dirs) if (d.items.length < 2 || d.items.length > 60) throw httpError(400, `${d.dir}: list 2 to 60 lines`);
    if ([...jobs.values()].filter((j) => j.status === 'running').length >= 2) throw httpError(429, 'Two traces are already running; try again in a minute');
    const id = randomUUID();
    const job = { id, status: 'running', startedAt: Date.now(), by: actor.name, progress: [], result: {} };
    jobs.set(id, job);
    (async () => {
      try {
        let hint = null;
        for (const d of dirs) {
          job.progress.push(`Tracing ${d.dir}…`);
          const r = await traceDirection(d.items, { osm, hint, lookupLocal, log: (m) => job.progress.push(`${d.dir}: ${m}`) });
          job.result[d.dir] = r;
          hint = r.waypoints.at(-1) || hint;
        }
        job.status = 'done';
      } catch (e) { job.status = 'failed'; job.error = e.message; }
    })();
    return { jobId: id };
  });

  on('GET', '/api/admin/resolutions/trace/:id', ({ req, params }) => {
    adminFor(req, 'write:data');
    const j = jobs.get(params.id);
    if (!j) throw httpError(404, 'Trace not found (they are kept for an hour)');
    return j;
  });

  on('POST', '/api/admin/resolutions/apply', async ({ req }) => {
    const actor = adminFor(req, 'write:data');
    const b = await body(req, 5_000_000);
    const r = { ...blankResolution(), ...(b.resolution || {}) };
    if (!/^\d{1,5}$/.test(String(r.number)) || !/^\d{4}$/.test(String(r.series))) throw httpError(400, 'Resolution number and series (year) are required');
    if (r.dateSigned && !/^\d{4}-\d{2}-\d{2}$/.test(r.dateSigned)) throw httpError(400, 'Date signed must be YYYY-MM-DD');
    const directions = (Array.isArray(b.directions) ? b.directions : []).map((d) => ({
      dir: String(d.dir || '').slice(0, 20),
      waypoints: (d.waypoints || []).slice(0, 80).map((w) => ({ lat: +w.lat, lng: +w.lng, label: String(w.label || '').slice(0, 120) })),
      shape: (d.shape || []).slice(0, 8000).map(([lat, lng]) => [+lat, +lng]),
      km: +d.km || null,
    }));
    if (!directions.length) throw httpError(400, 'Trace the route first');
    for (const d of directions) for (const p of [...d.waypoints, ...d.shape.map(([lat, lng]) => ({ lat, lng }))]) {
      if (!(p.lat > 4 && p.lat < 22 && p.lng > 115 && p.lng < 128)) throw httpError(400, `${d.dir}: a point is outside the Philippines`);
    }
    let recs;
    try { recs = recordsFromResolution(r, directions, { operational: !!b.operational }); } catch (e) { throw httpError(400, e.message); }
    // replace earlier records from the same resolution (re-import after corrections)
    const prefix = `br${r.series}-${r.number}-`;
    const ds = repo.dataset();
    const keep = new Set(recs.stops.map((s) => s.id));
    for (const l of ds.lines.filter((x) => x.id.startsWith(prefix) && !recs.lines.some((n) => n.id === x.id))) repo.remove('lines', l.id, actor);
    for (const s of recs.stops) repo.upsert('stops', s, actor);
    for (const l of recs.lines) { validate('lines', l); repo.upsert('lines', l, actor); }
    for (const s of ds.stops.filter((x) => x.id.startsWith(prefix) && !keep.has(x.id))) {
      if (!ds.lines.some((l) => l.stopIds.includes(s.id))) repo.remove('stops', s.id, actor);
    }
    const retired = [];
    for (const id of (b.retireLineIds || []).map(String).filter(Boolean).slice(0, 20)) {
      const old = repo.get('lines', id);
      if (!old) throw httpError(400, `Route ${id} not found`);
      repo.upsert('lines', { ...old, operational: false, notes: [old.notes, `Replaced by ${recs.lines.map((l) => l.id).join(', ')} under ${citation(r)}`].filter(Boolean).join('. ') }, actor);
      retired.push(id);
    }
    return { citation: citation(r), lines: recs.lines.map((l) => ({ id: l.id, name: l.name, stops: l.stopIds.length })), stops: recs.stops.length, retired };
  });
}
