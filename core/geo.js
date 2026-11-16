// Geographic helpers shared by server, browser and tests.
// All distances in kilometres unless noted.

const R = 6371.0088;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Default road-distance provider. Without a routing service (OSRM / ORS /
 * Google) we approximate road distance as straight-line × detour factor.
 * The result is flagged so the UI can say "approximate road distance".
 */
export const heuristicRoadProvider = {
  id: 'heuristic',
  label: 'Approximate (straight-line × detour factor)',
  detour: 1.35,
  roadKm(a, b) {
    return haversineKm(a, b) * this.detour;
  },
};

export function walkKm(a, b) {
  return haversineKm(a, b) * 1.25;
}

export function polylineKm(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return d;
}

export function nearest(points, p, radiusKm, limit = Infinity) {
  return points
    .map((x) => ({ item: x, km: haversineKm(p, x) }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

/** Distance (km) from point p to segment a-b using a local equirectangular projection. */
export function pointToSegmentKm(p, a, b) {
  const kx = 111.32 * Math.cos(toRad(p.lat));
  const ky = 110.57;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}
