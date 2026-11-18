// Turns a resolution's street list into a map line, using OpenStreetMap:
//   1. Nominatim gives each street's geometry (near the previous point) and
//      geocodes terminals and landmarks.
//   2. Where consecutive streets meet becomes a waypoint (the "corner").
//   3. OSRM draws the road path through the waypoints.
// The result is a proposal shown to an editor, never saved automatically.
// Usage policies: Nominatim allows 1 request/second with an identifying
// User-Agent; the public OSRM server is for light use. Set NOMINATIM_URL /
// OSRM_URL to self-hosted servers for heavier use.

import { normalizeStreet } from '../core/resolution.js';
import { haversineKm } from '../core/geo.js';

const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const UA = 'LUVYO-route-import/0.1 (admin tool)';
// Metro Manila, generous
export const MM_BOX = { s: 14.33, w: 120.88, n: 14.82, e: 121.2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP JSON client with Nominatim's 1 request/second spacing and a small cache. */
export function osmClient({ fetchImpl = fetch } = {}) {
  let next = 0;
  const cache = new Map();
  async function get(url, { spaced = false } = {}) {
    if (cache.has(url)) return cache.get(url);
    if (spaced) { const wait = next - Date.now(); next = Math.max(Date.now(), next) + 1100; if (wait > 0) await sleep(wait); }
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    const j = await res.json();
    cache.set(url, j);
    return j;
  }
  const box = (b) => `${b.w},${b.n},${b.e},${b.s}`;
  return {
    /** Street segments (arrays of {lat,lng}) named `name` inside box b. */
    async street(name, b) {
      const u = `${NOMINATIM}/search?format=jsonv2&polygon_geojson=1&limit=40&dedupe=0&bounded=1&countrycodes=ph&viewbox=${box(b)}&street=${encodeURIComponent(name)}`;
      const rows = await get(u, { spaced: true });
      const segs = [];
      for (const r of rows) {
        if (r.category !== 'highway' && r.class !== 'highway') continue;
        const g = r.geojson;
        const parts = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
        for (const p of parts) segs.push(p.map(([lng, lat]) => ({ lat, lng })));
      }
      return segs;
    },
    /** Point for a place name, or null. */
    async place(q, b) {
      const u = `${NOMINATIM}/search?format=jsonv2&limit=5&bounded=1&countrycodes=ph&viewbox=${box(b)}&q=${encodeURIComponent(q)}`;
      const rows = await get(u, { spaced: true });
      return rows.length ? { lat: +rows[0].lat, lng: +rows[0].lon, label: rows[0].display_name } : null;
    },
    /** Road path through points: { shape: [[lat,lng]], km } */
    async route(points) {
      const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
      const j = await get(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=true`);
      if (j.code !== 'Ok' || !j.routes?.length) throw new Error(`OSRM: ${j.message || j.code}`);
      return { shape: j.routes[0].geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)]), km: j.routes[0].distance / 1000, legs: j.routes[0].legs.map((l) => l.distance / 1000) };
    },
  };
}

// ------------------------------------------------------------ geometry ---
const M_PER_DEG = 111320;
function proj(p, lat0) { return { x: p.lng * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180), y: p.lat * M_PER_DEG }; }
function unproj(q, lat0) { return { lat: q.y / M_PER_DEG, lng: q.x / (M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)) }; }
function closestOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segCross(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (!den) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}

/** Places where two streets meet (within tolM), clustered to one point per corner. */
export function corners(segsA, segsB, tolM = 35) {
  const all = [...segsA.flat(), ...segsB.flat()];
  if (!all.length) return [];
  const lat0 = all.reduce((s, p) => s + p.lat, 0) / all.length;
  const A = segsA.map((s) => s.map((p) => proj(p, lat0))), B = segsB.map((s) => s.map((p) => proj(p, lat0)));
  const hits = [];
  for (const sa of A) for (let i = 1; i < sa.length; i++) for (const sb of B) for (let j = 1; j < sb.length; j++) {
    const x = segCross(sa[i - 1], sa[i], sb[j - 1], sb[j]);
    if (x) { hits.push(x); continue; }
    for (const [p, a, b] of [[sa[i - 1], sb[j - 1], sb[j]], [sa[i], sb[j - 1], sb[j]], [sb[j - 1], sa[i - 1], sa[i]], [sb[j], sa[i - 1], sa[i]]]) {
      const q = closestOnSeg(p, a, b);
      if (dist(p, q) <= tolM) hits.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
  }
  const clusters = [];
  for (const h of hits) {
    const c = clusters.find((k) => dist(k, h) < 150);
    if (c) { c.n++; c.x += (h.x - c.x) / c.n; c.y += (h.y - c.y) / c.n; } else clusters.push({ ...h, n: 1 });
  }
  return clusters.map((c) => unproj(c, lat0));
}

const boxAround = (p, km) => {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  return { s: p.lat - dLat, n: p.lat + dLat, w: p.lng - dLng, e: p.lng + dLng };
};

/** Name variants to try for a terminal or landmark: "Lagro (Hilltop)" → "Hilltop, Lagro". */
function placeQueries(item) {
  const name = normalizeStreet(item.name);
  const lgu = item.lgu ? `, ${item.lgu}` : '';
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(name);
  const q = m ? [`${m[2]}, ${m[1]}${lgu}`, `${m[2]}${lgu}`, `${m[1]}${lgu}`] : [`${name}${lgu}`, name];
  for (const x of [...q]) { // "Bus Port" ↔ "Busport", "City" ↔ "Center" (common in mall-terminal names)
    if (/Bus Port/i.test(x)) q.push(x.replace(/Bus Port/i, 'Busport'));
    if (/\bCity\b/.test(x) && !/Quezon City|Manila|Pasig|Makati/.test(x.split(',')[0])) q.push(x.replace(/\bCity\b/, 'Center'));
  }
  return [...new Set(q)];
}
/** Street name variants: as written, and with a first name shortened ("Victorino Mapa" ↔ "V. Mapa"). */
function streetQueries(name) {
  const n = normalizeStreet(name);
  const v = [n];
  const w = n.split(' ');
  if (w.length >= 3 && /^[A-Z][a-z]{3,}$/.test(w[0])) v.push(`${w[0][0]}. ${w.slice(1).join(' ')}`);
  return v;
}

/**
 * Trace one direction. items: [{name, lgu?, at?}] from parseStreetList; the
 * first and last are the terminals. Returns { waypoints, shape, km, steps }.
 */
export async function traceDirection(items, { osm = osmClient(), hint = null, lookupLocal = null, log = () => {} } = {}) {
  if (items.length < 2) throw new Error('List at least the two terminals');
  const steps = [];
  const pts = [];
  const add = (p, label, how) => { pts.push({ lat: p.lat, lng: p.lng, label, how }); steps.push({ ok: true, label, how }); };
  const miss = (label, why) => steps.push({ ok: false, label, why });

  const geomCache = new Map();
  async function streetNear(name, center, km) {
    const k = `${name}|${center.lat.toFixed(3)},${center.lng.toFixed(3)}|${km}`;
    if (!geomCache.has(k)) {
      let segs = [];
      for (const q of streetQueries(name)) { segs = await osm.street(q, center ? boxAround(center, km) : MM_BOX); if (segs.length) break; }
      geomCache.set(k, segs);
    }
    return geomCache.get(k);
  }
  const pick = (cs, near) => cs.reduce((b, c) => (haversineKm(c, near) < haversineKm(b, near) ? c : b));
  const bboxOf = (segs, padKm) => {
    const all = segs.flat();
    const b = { s: Math.min(...all.map((p) => p.lat)), n: Math.max(...all.map((p) => p.lat)), w: Math.min(...all.map((p) => p.lng)), e: Math.max(...all.map((p) => p.lng)) };
    const dLat = padKm / 111.32, dLng = padKm / 107.6;
    return { s: b.s - dLat, n: b.n + dLat, w: b.w - dLng, e: b.e + dLng };
  };
  const diagKm = (b) => haversineKm({ lat: b.s, lng: b.w }, { lat: b.n, lng: b.e });
  /** Where streets A and B meet, nearest the previous point. Search results are capped, so
   *  look close first, then search the long street only around the short one. */
  async function cornerOf(A, B, near) {
    let anyB = false;
    for (const km of [2, 6]) {
      const [sa, sb] = [await streetNear(A, near, km), await streetNear(B, near, km)];
      anyB ||= sb.length > 0;
      if (sa.length && sb.length) { const cs = corners(sa, sb); if (cs.length) return { p: pick(cs, near), how: 'corner' }; }
    }
    const wide = { a: await streetNear(A, near, 15), b: await streetNear(B, near, 15) };
    if (!wide.b.length && !anyB) return 'not_street';
    for (const tol of [35, 100]) {
      for (const [X, sx, Y] of [[B, wide.b, A], [A, wide.a, B]]) {
        // group the pieces of X that are near each other (a name can repeat across the city)
        const groups = [];
        for (const seg of [...sx].sort((u, v) => haversineKm(u[0], near) - haversineKm(v[0], near))) {
          const g = groups.find((k) => k.some((t) => haversineKm(t[0], seg[0]) < 2.5));
          if (g) g.push(seg); else groups.push([seg]);
        }
        for (const g of groups.slice(0, 4)) {
          const box = bboxOf(g, 0.3);
          if (diagKm(box) > 12) continue;
          let sy = [];
          for (const q of streetQueries(Y)) { sy = await osm.street(q, box); if (sy.length) break; }
          const cs = corners(g, sy, tol);
          if (cs.length) return { p: pick(cs, near), how: tol > 35 ? 'corner (streets end close together, not joined on the map)' : `corner (searched along ${normalizeStreet(X)})` };
        }
      }
    }
    return null;
  }
  async function placeNear(item, center) {
    const local = lookupLocal?.(item.name);
    if (local) return { ...local, how: 'LUVYO place' };
    for (const km of [4, 12, null]) {
      for (const q of placeQueries(item)) {
        const p = await osm.place(q, km && center ? boxAround(center, km) : MM_BOX);
        if (p) return p;
      }
      if (!center) break;
    }
    return null;
  }

  // Start terminal
  const first = items[0];
  const start = first.at || (await placeNear(first, hint));
  if (start) add(start, first.name, first.at ? 'pinned' : 'geocoded'); else miss(first.name, 'Terminal not found on the map: add "@lat,lng" to pin it');
  let anchor = start || hint;

  // Middle: streets and landmarks
  const mids = items.slice(1, -1);
  const isStreet = new Map();
  for (let i = 0; i < mids.length; i++) {
    const it = mids[i];
    if (it.at) { add(it.at, it.name, 'pinned'); anchor = it.at; isStreet.set(i, false); continue; }
    const near = anchor || { lat: 14.6, lng: 121.03 };
    let segs = await streetNear(it.name, near, 6);
    if (!segs.length) segs = await streetNear(it.name, near, 15);
    if (segs.length) { isStreet.set(i, segs); } else {
      const p = await placeNear(it, anchor);
      isStreet.set(i, false);
      if (p) { add(p, it.name, 'landmark'); anchor = p; } else miss(it.name, 'Not found as a street or place: check the spelling or add "@lat,lng"');
      continue;
    }
    // the corner with the next street, if the next item is a street
    const nx = mids[i + 1];
    if (!nx || nx.at) continue;
    const best = await cornerOf(it.name, nx.name, near);
    if (best === 'not_street') continue; // next one is a landmark; handled on its turn
    if (!best) { miss(`${it.name} → ${nx.name}`, 'These streets do not meet on the map: add the connecting street, or pin the corner with "@lat,lng"'); continue; }
    add(best.p, `${normalizeStreet(it.name)} cor. ${normalizeStreet(nx.name)}`, best.how);
    anchor = best.p;
  }

  // End terminal
  const last = items[items.length - 1];
  const end = last.at || (await placeNear(last, anchor));
  if (end) add(end, last.name, last.at ? 'pinned' : 'geocoded'); else miss(last.name, 'Terminal not found on the map: add "@lat,lng" to pin it');

  if (pts.length < 2) return { waypoints: pts, shape: [], km: 0, steps };
  log(`routing through ${pts.length} points`);
  return { waypoints: pts, ...(await roadPath(pts, osm, steps)), steps };
}

/** Distance from p to the nearest point of a [[lat,lng]] line, km. */
function offLine(p, shape) {
  let best = Infinity;
  const q = proj(p, p.lat);
  for (let i = 1; i < shape.length; i++) {
    const a = proj({ lat: shape[i - 1][0], lng: shape[i - 1][1] }, p.lat), b = proj({ lat: shape[i][0], lng: shape[i][1] }, p.lat);
    best = Math.min(best, dist(q, closestOnSeg(q, a, b)));
  }
  return best / 1000;
}

/**
 * Road path through the points. On divided roads a corner can snap to the
 * wrong carriageway, which makes the router loop around (a leg much longer
 * than the straight line). Such a point is routed around when the road path
 * still passes within 150 m of it; it stays a stop on the line.
 */
export async function roadPath(pts, osm, steps = []) {
  let use = pts.map((p, i) => ({ ...p, i }));
  let r = await osm.route(use);
  for (let pass = 0; pass < 4; pass++) {
    let worst = null;
    for (let k = 1; k < use.length - 1; k++) {
      const extra = r.legs[k - 1] + r.legs[k] - (haversineKm(use[k - 1], use[k]) + haversineKm(use[k], use[k + 1])) * 1.6;
      if (extra > 1 && (!worst || extra > worst.extra)) worst = { k, extra };
    }
    if (!worst) break;
    const without = use.filter((_, k) => k !== worst.k);
    const r2 = await osm.route(without);
    if (r2.km < r.km - 1 && offLine(use[worst.k], r2.shape) < 0.15) {
      steps.push({ ok: true, label: use[worst.k].label, how: `routed around: the map snapped this corner to the wrong side of the road (saved ${(r.km - r2.km).toFixed(1)} km)` });
      use = without; r = r2;
    } else break;
  }
  return { shape: r.shape, km: r.km };
}
