// LTFRB board resolutions → LUVYO routes.
// Pure helpers shared by the server and tests: read the main fields out of a
// resolution's text, tidy street names, and turn an approved resolution plus
// its traced geometry into stop and line records.
//
// A resolution is a legal source, not proof that a route runs today: lines
// created from one are marked official (with the citation) but NOT verified
// until riders or staff confirm them.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MODE_CODES = { PUJ: 'jeepney', MPUJ: 'jeepney', PUB: 'bus', UV: 'uv', UVE: 'uv', 'UV EXPRESS': 'uv', TPUJ: 'jeepney' };

/** The empty draft the review form starts from. */
export function blankResolution() {
  return {
    number: '', series: '', dateSigned: '', title: '', action: 'modification', modeId: 'jeepney',
    previousRoute: '', routeName: '', caseNumber: '', lengthKm: null, units: null,
    conditions: [], westbound: [], eastbound: [],
  };
}

/** Best-effort reading of OCR or text-layer output. Every field is reviewed by a person. */
export function parseResolutionText(text) {
  const t = String(text || '').replace(/\r/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const flat = t.replace(/\s+/g, ' ');
  const d = blankResolution();

  d.number = (t.match(/BOARD\s+RESOLUTION\s+NO\.?\s*[_\s]*(\d{1,5})/i) || [])[1] || '';
  d.series = (t.match(/SERIES\s+OF\s+(\d{4})/i) || [])[1] || '';

  const title = t.match(/SERIES\s+OF\s+\d{4}\s*\n+([\s\S]*?)\n\s*\n/i);
  if (title) d.title = title[1].replace(/\s+/g, ' ').trim();

  const act = /\b(NEW|OPENING|REOPENING|RE-OPENING|MODIFICATION|EXTENSION|REROUTING|RE-ROUTING|CANCELLATION|SUSPENSION)\b/i.exec(d.title || flat);
  if (act) {
    const a = act[1].toLowerCase().replace('-', '');
    d.action = a === 'opening' || a === 'new' ? 'new' : a === 'rerouting' ? 'modification' : a;
  }
  const mode = /\((PUJ|MPUJ|TPUJ|PUB|UVE?|UV EXPRESS)\)/i.exec(d.title || flat) || /\b(PUJ|PUB|UV Express)\s+route/i.exec(flat);
  if (mode) d.modeId = MODE_CODES[mode[1].toUpperCase()] || d.modeId;

  // "… the PUJ route Lagro - Cubao via Kalayaan to Lagro (Hilltop) - Stop & Shop as detailed …"
  const mod = /MODIFICATION\s+of\s+the\s+(?:[A-Z]{2,5}\s+)?route\s+(.{3,80}?)\s+to\s+(.{3,80}?)\s+(?:as\s+detailed|as\s+shown|subject|,)/i.exec(flat);
  if (mod && d.action === 'modification') { d.previousRoute = clean(mod[1]); d.routeName = clean(mod[2]); }
  if (!d.routeName) {
    const an = /Route Details\s*\n\s*(.+)/i.exec(t);
    if (an) d.routeName = clean(an[1]);
  }
  if (!d.routeName && d.title) d.routeName = clean(d.title.replace(/^.*ROUTE:?\s*/i, ''));

  d.caseNumber = (flat.match(/\b(NCR|R\d{1,2}[A-B]?|CAR|BARMM)-(PUJ|PUB|UV|UVE|MPUJ)-\d{4}-\d{2}-\d{3,6}\b/i) || [])[0] || '';

  const signed = /this\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:day\s+)?of\s+([A-Za-z]+),?\s+(\d{4})/i.exec(flat);
  if (signed) {
    const m = MONTHS.indexOf(signed[2].toLowerCase());
    if (m >= 0) d.dateSigned = `${signed[3]}-${String(m + 1).padStart(2, '0')}-${signed[1].padStart(2, '0')}`;
  }

  const km = /(\d{1,3}(?:\.\d+)?)\s*km\b/i.exec(flat);
  if (km) d.lengthKm = +km[1];
  const nau = /\b\d{1,3}(?:\.\d+)?\s*km\s+(\d{1,4})\b/i.exec(flat);
  if (nau) d.units = +nau[1];

  const cond = [];
  if (/Route Rationali[sz]ation Study/i.test(flat)) cond.push('Subject to the result of the Route Rationalization Study');
  const within = /within\s+([a-z]+\s*\(\d+\)|\d+)\s+(months?|days?)/i.exec(flat);
  if (within) cond.push(`Operator must file the application within ${within[1]} ${within[2]} of issuance`);
  if (/fare guide/i.test(flat)) cond.push('Fare guide to be obtained from the LTFRB regional office');
  if (/Provisional Authority/i.test(flat)) cond.push('Provisional Authority pending the modified CPC');
  d.conditions = cond;
  return d;
}

/** Street-like lines found in OCR text, in reading order (a hint for the reviewer). */
export function streetHints(text) {
  const SUFFIX = /\b(Avenue|Ave\.?|Street|St\.?|Road|Rd\.?|Boulevard|Blvd\.?|Highway|Hwy\.?|Drive|Bridge|Bus Port|Terminal|Interchange|Rotonda|Circle|Extension)\b/i;
  const out = [];
  const annex = String(text || '').search(/Annex\s*"?A/i);
  const body = annex >= 0 ? String(text).slice(annex) : String(text || '');
  for (const raw of body.split('\n')) {
    for (const part of raw.split(/\s{2,}|\||\[|\(?(?=Quezon City|Manila|San Juan|Pasig|Makati|Mandaluyong|Caloocan)/)) {
      const s = clean(part.replace(/^[^A-Za-z0-9]+/, ''));
      if (s.length >= 5 && s.length <= 48 && SUFFIX.test(s) && !/series|resolution|board|page/i.test(s)) {
        const m = s.match(new RegExp(`^(.*?${SUFFIX.source})`, 'i'));
        const name = clean(m ? m[1] : s).replace(/^.*(?:&|–)\s*(?:Shop\s+)?/, '');
        if (name.split(' ').length >= 2 && !out.includes(name)) out.push(name);
      }
    }
  }
  return out;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s+-\s*|\s*-\s+/g, ' – ').replace(/^[\s,.;:]+|[\s,.;:_]+$/g, '').trim();

const ABBR = [
  [/\bAve\b\.?/gi, 'Avenue'], [/\bBlvd\b\.?/gi, 'Boulevard'], [/\bSt\b\.?(?=\s*$|\s*\()/gi, 'Street'], [/\bRd\b\.?/gi, 'Road'],
  [/\bHwy\b\.?/gi, 'Highway'], [/\bSta\b\.?/gi, 'Santa'], [/\bSto\b\.?/gi, 'Santo'], [/\bGen\b\.?/gi, 'General'], [/\bExt\b\.?/gi, 'Extension'],
];
/** "Belfast Ave." → "Belfast Avenue"; "Sta. Mesa" → "Santa Mesa". */
export function normalizeStreet(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of ABBR) s = s.replace(re, rep);
  return s;
}

/**
 * One line per street in the review form. Optional "@lat,lng" pins a point by
 * hand; optional " | LGU" gives the city. Consecutive repeats are merged.
 */
export function parseStreetList(text) {
  const items = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const pin = /@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(line);
    const [nm, lgu] = line.replace(pin?.[0] || '', '').split('|').map((x) => x.trim());
    const item = { name: nm, lgu: lgu || '' };
    if (pin) item.at = { lat: +pin[1], lng: +pin[2] };
    const prev = items[items.length - 1];
    if (prev && normalizeStreet(prev.name).toLowerCase() === normalizeStreet(item.name).toLowerCase() && !item.at) continue;
    if (item.name) items.push(item);
  }
  return items;
}

/** "LTFRB BR No. 383 s. 2026 (18 Sep 2026)" */
export function citation(r) {
  const date = r.dateSigned ? ` (${new Date(r.dateSigned + 'T00:00:00+08:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })})` : '';
  return `LTFRB BR No. ${r.number} s. ${r.series}${date}`;
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Records for an approved resolution. `directions` = [{ dir: 'westbound'|'eastbound',
 * waypoints: [{lat,lng,label}], shape: [[lat,lng]], km }]. Returns { stops, lines }.
 */
export function recordsFromResolution(r, directions, { today = new Date().toISOString().slice(0, 10), operational = false } = {}) {
  if (!r.number || !r.series) throw new Error('Resolution number and series are required');
  if (!r.routeName) throw new Error('Route name is required');
  const base = `br${r.series}-${r.number}`;
  const cite = citation(r);
  const stops = [], lines = [];
  const legal = {
    issuer: 'LTFRB', type: 'board_resolution', number: String(r.number), series: String(r.series), dateSigned: r.dateSigned || null,
    title: r.title || null, action: r.action, caseNumber: r.caseNumber || null, previousRoute: r.previousRoute || null,
    lengthKm: r.lengthKm ?? null, authorizedUnits: r.units ?? null, conditions: r.conditions || [],
  };
  const [from, to] = r.routeName.split(/\s+[–-]\s+/);
  for (const d of directions) {
    if (!d.waypoints?.length || d.waypoints.length < 2) throw new Error(`${d.dir}: at least 2 traced points are needed`);
    const code = d.dir === 'eastbound' ? 'EB' : d.dir === 'westbound' ? 'WB' : d.dir.slice(0, 2).toUpperCase();
    const lineId = `${base}-${slug(d.dir)}`;
    const ids = d.waypoints.map((w, i) => {
      const id = `${lineId}-${String(i).padStart(2, '0')}-${slug(w.label || 'pt')}`;
      stops.push({ id, name: w.label || `${r.routeName} point ${i + 1}`, lat: +w.lat.toFixed(6), lng: +w.lng.toFixed(6), kind: i === 0 || i === d.waypoints.length - 1 ? 'terminal' : 'jeepney_stop', cityId: 'mm', sourceType: 'official', sourceNote: cite, dataset: 'imported', lastVerified: null });
      return id;
    });
    const ends = d.dir === 'eastbound' ? [to, from] : [from, to];
    lines.push({
      id: lineId, code: `${r.number}-${code}`, name: `${r.routeName} (${d.dir})`, modeId: r.modeId || 'jeepney', operatorId: null,
      signboard: ends.filter(Boolean).map((x) => x.toUpperCase()).join(' – '), stopIds: ids,
      shape: d.shape?.length >= 2 ? d.shape : undefined, shapeSource: d.shape?.length >= 2 ? 'osm_trace' : undefined,
      bidirectional: false, operational: !!operational, active: true, verified: false,
      sourceType: 'official', sourceNote: `${cite}. Path traced on OpenStreetMap from the resolution's street list${d.km ? ` (${d.km.toFixed(1)} km)` : ''}.`,
      legalBasis: legal, dataset: 'imported', lastVerified: today,
      notes: [legal.previousRoute && `Replaces ${legal.previousRoute}`, ...legal.conditions].filter(Boolean).join('. '),
    });
  }
  return { stops, lines };
}
