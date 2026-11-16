// Leaflet wrapper. No live vehicle markers are ever drawn (spec §10).
/* global L */
import { esc, modeIcon } from './ui.js';

let tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const setTileUrl = (u) => { if (u) tileUrl = u; };

const MODE_COLORS = { walk: '#8a9690', jeepney: '#176B45', bus: '#2563EB', rail: '#7C3AED', uv: '#0E7490', tricycle: '#C2410C', ferry: '#0369A1', mc_taxi: '#E85D3F', ridehail_car: '#059669', taxi: '#CA8A04' };
export const modeColor = (m) => MODE_COLORS[m] || '#176B45';

export function createMap(el, { center = [14.5995, 121.0244], zoom = 12 } = {}) {
  if (typeof L === 'undefined') { el.innerHTML = '<p class="muted pad">Map unavailable.</p>'; return null; }
  // Animations off: screens tear maps down on navigation, and Leaflet throws
  // if a pan/zoom animation finishes after removal. Also lighter on low-end phones.
  // SVG renderer: canvas schedules redraws that can fire after a screen removes its map.
  const map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(center, zoom);
  L.tileLayer(tileUrl, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  setTimeout(() => { if (map._container?.isConnected && map._loaded) map.invalidateSize(false); }, 50);
  return map;
}

export function pin(map, p, label, kind = 'origin') {
  const icon = L.divIcon({ className: `pin pin-${kind}`, html: `<span>${kind === 'origin' ? 'A' : kind === 'destination' ? 'B' : '•'}</span>`, iconSize: [28, 28], iconAnchor: [14, 28] });
  return L.marker([p.lat, p.lng], { icon, title: label }).addTo(map).bindPopup(esc(label));
}

export function stopMarker(map, s, onClick) {
  const mode = s.modes?.[0] || (s.kind === 'station' ? 'rail' : s.kind?.includes('bus') ? 'bus' : s.kind?.includes('uv') ? 'uv' : s.kind?.includes('ferry') ? 'ferry' : s.kind?.includes('tric') ? 'tricycle' : 'jeepney');
  const icon = L.divIcon({ className: 'stop-icon', html: `<span style="background:${modeColor(mode)}">${modeIcon(mode)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  const m = L.marker([s.lat, s.lng], { icon, title: s.name }).addTo(map);
  m.bindPopup(`<b>${esc(s.name)}</b>${s.lines?.length ? '<br>' + s.lines.map((l) => esc(l.code || l.name)).join(', ') : ''}`);
  if (onClick) m.on('click', () => onClick(s));
  return m;
}

export function drawRoute(map, option, { faded = false } = {}) {
  const layers = [];
  for (const l of option.legs) {
    const line = L.polyline(l.path, { color: modeColor(l.modeId), weight: faded ? 4 : 6, opacity: faded ? 0.35 : 0.9, dashArray: l.type === 'walk' ? '4 8' : l.modeId === 'mc_taxi' || l.modeId === 'tricycle' ? '10 6' : null }).addTo(map);
    layers.push(line);
    if (!faded && l.type === 'ride') {
      for (const [p, label] of [[l.from, 'Sakay: ' + l.from.name], [l.to, 'Baba: ' + l.to.name]]) {
        layers.push(L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: modeColor(l.modeId), fillOpacity: 1 }).addTo(map).bindPopup(esc(label)));
      }
    }
  }
  return layers;
}

export function fit(map, points) {
  if (!map || !points.length) return;
  map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16, animate: false });
}
