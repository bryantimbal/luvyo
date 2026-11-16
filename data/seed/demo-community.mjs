// Simulated rider activity for the standalone demo build. Every simulated rider
// is flagged `simulated: true` and named "(demo)", so they're never mistaken for real people.
// Runs through the real community service, so votes, points and statuses follow the actual rules.

const NAMES = ['Maricel', 'Jun-jun', 'Bea', 'Ramon', 'Tisay', 'Paolo', 'Lorna', 'Migs', 'Carlo', 'Hazel'];

export function seedDemoCommunity(svc) {
  const R = NAMES.map((n, i) => {
    const c = svc.ensureContributor(`demo-rider-${String(i).padStart(4, '0')}`, `${n} (demo)`);
    c.simulated = true;
    return c;
  });
  const contribute = (r, body) => svc.contribute(r, body);
  const confirm = (id, rs, agree = true) => rs.forEach((r) => svc.confirm(r, id, { agree, lat: 14.62, lng: 121.05 }));
  const verifyBy = (author, body, voters) => { const c = contribute(author, body); confirm(c.id, voters); return c; };

  for (const r of R.slice(0, 7)) svc.confirm(r, 'line:jp-cubao-quiapo', { agree: true });
  verifyBy(R[0], { type: 'fare', lineId: 'jp-cubao-quiapo', lat: 14.6205, lng: 121.053, payload: { amount: 13, distanceKm: 3 } }, R.slice(1, 6));
  for (const [i, m] of [[1, 6], [2, 9], [3, 7]]) verifyBy(R[i], { type: 'wait', lineId: 'jp-cubao-quiapo', lat: 14.6205, lng: 121.053, payload: { minutes: m } }, R.slice(4, 9));
  verifyBy(R[4], { type: 'last_trip', lineId: 'jp-cubao-quiapo', payload: { time: '22:30' } }, R.slice(5, 10));
  verifyBy(R[5], { type: 'loading_spot', lineId: 'jp-cubao-quiapo', payload: { name: 'Aurora cor. 15th Ave (Farmers side)', lat: 14.6203, lng: 121.0518 } }, R.slice(0, 5));
  verifyBy(R[6], { type: 'fare', zoneId: 'zone-marikina-dev', lat: 14.631, lng: 121.083, payload: { amount: 30 } }, R.slice(0, 5));
  for (const i of [7, 8, 9]) verifyBy(R[i], { type: 'fare', providerId: 'grab-car', payload: { amount: 265 + i * 5, distanceKm: 10.4, durationMin: 35 } }, R.slice(0, 5));
  // open items for "Help verify near you" around Cubao
  contribute(R[8], { type: 'fare', lineId: 'uv-fairview-cubao', lat: 14.6212, lng: 121.0526, payload: { amount: 35, distanceKm: 14 } });
  const disp = contribute(R[9], { type: 'wait', providerId: 'angkas', lat: 14.6195, lng: 121.0511, payload: { minutes: 25 } });
  confirm(disp.id, [R[2]], false);
  contribute(R[3], { type: 'route_change', lineId: 'jp-cubao-quiapo', lat: 14.6135, lng: 121.0343, payload: { description: 'Weekends: turns at Gilmore going to Quiapo because of road works on Aurora.' } });
  const trace = [...Array(30)].map((_, i) => [14.6300 - i * 0.0011, 121.0560 + i * 0.0004]);
  contribute(R[2], { type: 'new_route', modeId: 'jeepney', lat: 14.62, lng: 121.055, payload: { modeId: 'jeepney', signboard: 'CUBAO – KAMIAS – ANONAS', fromName: 'Anonas', toName: 'Cubao (Farmers)', points: trace } });
}
