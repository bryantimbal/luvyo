// Generates data/dev/dataset.json – the DEVELOPMENT dataset.
//
// ⚠ Everything here is development data. Coordinates are approximate.
// Fares are indicative figures based on publicly reported fare orders and MUST
// be verified against current LTFRB / DOTr / LRTA / LRMC / MRT-3 / LGU / provider
// publications before production. Jeepney/UV/bus corridors marked
// verified:false are illustrative test routes, not confirmed franchises.
// Replace via the admin portal or by importing official GTFS/CSV/GeoJSON.
//
// Run: node data/seed/dev-seed.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEV = { dataset: 'development', lastVerified: null };
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const stops = [];
const places = [];
function stopsFor(prefix, kind, list, city) {
  return list.map(([name, lat, lng, aliases = []]) => {
    const id = `${prefix}-${slug(name)}`;
    stops.push({ id, name: kind === 'station' ? `${name}` : name, lat, lng, kind, cityId: city ?? 'mm', ...DEV, sourceType: 'indicative' });
    return id;
  });
}

// ---- Rail (approximate station coordinates) ----
const mrt3 = stopsFor('mrt3', 'station', [
  ['North Avenue', 14.6522, 121.0323], ['Quezon Avenue', 14.6427, 121.0386], ['GMA-Kamuning', 14.6353, 121.0433],
  ['Araneta Center-Cubao (MRT)', 14.6195, 121.0511], ['Santolan-Annapolis', 14.6076, 121.0563], ['Ortigas', 14.5878, 121.0567],
  ['Shaw Boulevard', 14.5812, 121.0536], ['Boni', 14.5738, 121.0481], ['Guadalupe', 14.5667, 121.0453],
  ['Buendia (MRT)', 14.5544, 121.0345], ['Ayala', 14.5492, 121.0279], ['Magallanes', 14.5420, 121.0195], ['Taft Avenue', 14.5376, 121.0014],
]);
const lrt2 = stopsFor('lrt2', 'station', [
  ['Recto', 14.6035, 120.9835], ['Legarda', 14.6009, 120.9926], ['Pureza', 14.6017, 121.0050], ['V. Mapa', 14.6042, 121.0170],
  ['J. Ruiz', 14.6106, 121.0262], ['Gilmore', 14.6135, 121.0343], ['Betty Go-Belmonte', 14.6186, 121.0427],
  ['Araneta Center-Cubao (LRT-2)', 14.6228, 121.0526], ['Anonas', 14.6281, 121.0647], ['Katipunan', 14.6311, 121.0727],
  ['Santolan (LRT-2)', 14.6221, 121.0860], ['Marikina-Pasig', 14.6204, 121.1003], ['Antipolo', 14.6249, 121.1213],
]);
const lrt1 = stopsFor('lrt1', 'station', [
  ['Fernando Poe Jr.', 14.6575, 121.0210], ['Balintawak', 14.6574, 121.0039], ['Monumento', 14.6543, 120.9839],
  ['5th Avenue', 14.6444, 120.9836], ['R. Papa', 14.6360, 120.9822], ['Abad Santos', 14.6305, 120.9813],
  ['Blumentritt', 14.6226, 120.9829], ['Tayuman', 14.6166, 120.9826], ['Bambang', 14.6112, 120.9824],
  ['Doroteo Jose', 14.6054, 120.9820], ['Carriedo', 14.5992, 120.9813], ['Central Terminal', 14.5927, 120.9817],
  ['United Nations', 14.5825, 120.9846], ['Pedro Gil', 14.5765, 120.9881], ['Quirino', 14.5703, 120.9916],
  ['Vito Cruz', 14.5633, 120.9948], ['Gil Puyat', 14.5543, 120.9971], ['Libertad', 14.5477, 120.9985],
  ['EDSA', 14.5386, 121.0006], ['Baclaran', 14.5343, 120.9983], ['Redemptorist-ASEANA', 14.5300, 120.9935],
  ['MIA Road', 14.5180, 120.9930], ['PITX', 14.5090, 120.9910], ['Ninoy Aquino Avenue', 14.5000, 120.9950], ['Dr. Santos', 14.4855, 120.9890],
]);

// ---- EDSA Busway (approximate stop positions) ----
const carousel = stopsFor('busway', 'bus_stop', [
  ['Monumento Busway', 14.6560, 120.9860], ['Balintawak Busway', 14.6575, 121.0020], ['Roosevelt Busway', 14.6575, 121.0200],
  ['North Avenue Busway', 14.6528, 121.0318], ['Quezon Avenue Busway', 14.6431, 121.0381], ['Kamuning Busway', 14.6356, 121.0430],
  ['Nepa Q-Mart Busway', 14.6265, 121.0472], ['Main Avenue Busway', 14.6170, 121.0520], ['Santolan Busway', 14.6080, 121.0560],
  ['Ortigas Busway', 14.5882, 121.0563], ['Guadalupe Busway', 14.5672, 121.0450], ['Buendia Busway', 14.5548, 121.0340],
  ['One Ayala Busway', 14.5498, 121.0285], ['Taft Avenue Busway', 14.5380, 121.0020], ['Roxas Boulevard Busway', 14.5375, 120.9935],
  ['Mall of Asia Busway', 14.5355, 120.9840], ['PITX Busway', 14.5095, 120.9918],
]);

// ---- Illustrative road corridors (NOT verified) ----
const jeepCubaoQuiapo = stopsFor('jp', 'jeepney_stop', [
  ['Cubao (Aurora Blvd)', 14.6205, 121.0530], ['Gilmore (Aurora Blvd)', 14.6130, 121.0340], ['V. Mapa (Aurora Blvd)', 14.6040, 121.0170],
  ['Legarda (Magsaysay Blvd)', 14.6005, 120.9925], ['Quiapo Church stop', 14.5989, 120.9838],
]);
const jeepQuiapoDivi = [jeepCubaoQuiapo[4], ...stopsFor('jp', 'jeepney_stop', [['Avenida (Recto)', 14.6035, 120.9822], ['Divisoria (Tutuban)', 14.6060, 120.9710]])];
const jeepQaPhilcoa = stopsFor('jp', 'jeepney_stop', [
  ['Quezon Ave (EDSA) jeep stop', 14.6435, 121.0395], ['Quezon Memorial Circle', 14.6513, 121.0493], ['Philcoa', 14.6545, 121.0533], ['UP Diliman (University Ave)', 14.6537, 121.0684],
]);
const jeepTaftMoa = stopsFor('jp', 'jeepney_stop', [['EDSA-Taft jeep stop', 14.5383, 121.0010], ['Macapagal Blvd (EDSA ext.)', 14.5370, 120.9900], ['SM Mall of Asia terminal', 14.5352, 120.9822]]);
const busAyalaBgc = stopsFor('bgc', 'bus_stop', [['EDSA Ayala terminal (BGC bus)', 14.5495, 121.0290], ['BGC High Street stop', 14.5507, 121.0510], ['Market! Market! stop', 14.5497, 121.0560]]);
const uvFairview = stopsFor('uv', 'uv_terminal', [['Fairview UV terminal', 14.7340, 121.0580], ['Tandang Sora (Commonwealth)', 14.6770, 121.0790], ['Philcoa UV stop', 14.6550, 121.0540], ['Cubao UV terminal', 14.6210, 121.0525]]);
const ferry = stopsFor('ferry', 'ferry_terminal', [['Pinagbuhatan Ferry Station', 14.5536, 121.0939], ['Guadalupe Ferry Station', 14.5677, 121.0429], ['Escolta Ferry Station', 14.5970, 120.9790]]);

const modes = [
  { id: 'walk', label: 'Walk', labelFil: 'Lakad', category: 'walk', icon: '🚶', color: '#6B7A72' },
  { id: 'jeepney', label: 'Jeepney', labelFil: 'Jeep', category: 'public', icon: '🚙', color: '#176B45', roadBased: true },
  { id: 'bus', label: 'Bus', labelFil: 'Bus', category: 'public', icon: '🚌', color: '#2563EB', roadBased: true },
  { id: 'rail', label: 'Train', labelFil: 'Tren', category: 'public', icon: '🚆', color: '#7C3AED' },
  { id: 'uv', label: 'UV Express', labelFil: 'UV Express', category: 'public', icon: '🚐', color: '#0E7490', roadBased: true },
  { id: 'tricycle', label: 'Tricycle', labelFil: 'Traysikel', category: 'local', icon: '🛺', color: '#C2410C', roadBased: true },
  { id: 'ferry', label: 'Ferry', labelFil: 'Bangka/Ferry', category: 'water', icon: '⛴️', color: '#0369A1' },
  { id: 'mc_taxi', label: 'Motorcycle taxi', labelFil: 'Motor taxi', category: 'private', icon: '🏍️', color: '#E85D3F', roadBased: true },
  { id: 'ridehail_car', label: 'Ride-hailing car', labelFil: 'Ride-hailing', category: 'private', icon: '🚗', color: '#059669', roadBased: true },
  { id: 'taxi', label: 'Taxi', labelFil: 'Taxi', category: 'private', icon: '🚕', color: '#CA8A04', roadBased: true },
];

const operators = [
  { id: 'op-mrt3', name: 'MRT-3 (DOTr)', modeId: 'rail', website: 'https://dotr.gov.ph', ...DEV },
  { id: 'op-lrt2', name: 'LRT-2 (LRTA)', modeId: 'rail', website: 'https://lrta.gov.ph', ...DEV },
  { id: 'op-lrt1', name: 'LRT-1 (LRMC)', modeId: 'rail', website: 'https://lrmc.ph', ...DEV },
  { id: 'op-busway', name: 'EDSA Busway consortium', modeId: 'bus', ...DEV },
  { id: 'op-dev-jeep', name: 'Jeepney operators (development data)', modeId: 'jeepney', ...DEV },
  { id: 'op-dev-modern', name: 'Modern jeepney cooperative (development data)', modeId: 'jeepney', ...DEV },
  { id: 'op-dev-bus', name: 'City bus operator (development data)', modeId: 'bus', ...DEV },
  { id: 'op-dev-uv', name: 'UV Express operator (development data)', modeId: 'uv', ...DEV },
  { id: 'op-prf', name: 'Pasig River Ferry Service', modeId: 'ferry', ...DEV },
];

const railHours = (start, end) => ({ default: { start, end } });
const line = (o) => ({ bidirectional: true, operational: true, active: true, ...DEV, sourceType: 'indicative', ...o });
const lines = [
  line({ id: 'mrt3', code: 'MRT-3', name: 'MRT-3 (North Ave – Taft Ave)', modeId: 'rail', operatorId: 'op-mrt3', stopIds: mrt3, color: '#2B6CB0', headwayMin: [4, 8], operatingHours: railHours('04:40', '22:10'), verified: true, notes: 'Stations official; hours/headways indicative – verify with DOTr/MRT-3 advisories.' }),
  line({ id: 'lrt2', code: 'LRT-2', name: 'LRT-2 (Recto – Antipolo)', modeId: 'rail', operatorId: 'op-lrt2', stopIds: lrt2, color: '#7C3AED', headwayMin: [5, 9], operatingHours: railHours('04:30', '21:30'), verified: true }),
  line({ id: 'lrt1', code: 'LRT-1', name: 'LRT-1 (FPJ – Dr. Santos)', modeId: 'rail', operatorId: 'op-lrt1', stopIds: lrt1, color: '#16A34A', headwayMin: [4, 8], operatingHours: railHours('04:30', '22:00'), verified: true }),
  line({ id: 'edsa-busway', code: 'Busway', name: 'EDSA Busway (Monumento – PITX)', modeId: 'bus', operatorId: 'op-busway', stopIds: carousel, color: '#1D4ED8', headwayMin: [3, 10], signboard: 'EDSA Carousel', verified: false, notes: '24-hour operation and stop list need verification.' }),
  line({ id: 'jp-cubao-quiapo', code: 'T-CQ', name: 'Cubao – Quiapo via Aurora Blvd', modeId: 'jeepney', operatorId: 'op-dev-jeep', stopIds: jeepCubaoQuiapo, signboard: 'CUBAO – QUIAPO', color: '#176B45', verified: false }),
  line({ id: 'jp-quiapo-divi', code: 'T-QD', name: 'Quiapo – Divisoria', modeId: 'jeepney', operatorId: 'op-dev-jeep', stopIds: jeepQuiapoDivi, signboard: 'QUIAPO – DIVISORIA', color: '#15803D', verified: false }),
  line({ id: 'jp-qa-philcoa', code: 'M-QP', name: 'Quezon Ave – UP Diliman via Philcoa (modern)', modeId: 'jeepney', operatorId: 'op-dev-modern', stopIds: jeepQaPhilcoa, signboard: 'QUEZON AVE – UP', color: '#0F766E', verified: false }),
  line({ id: 'jp-taft-moa', code: 'T-TM', name: 'EDSA/Taft – Mall of Asia', modeId: 'jeepney', operatorId: 'op-dev-jeep', stopIds: jeepTaftMoa, signboard: 'MOA – BACLARAN', color: '#166534', verified: false }),
  line({ id: 'bus-ayala-bgc', code: 'BGC-E', name: 'EDSA Ayala – BGC (city bus)', modeId: 'bus', operatorId: 'op-dev-bus', stopIds: busAyalaBgc, signboard: 'BGC', color: '#1E40AF', headwayMin: [5, 15], verified: false }),
  line({ id: 'uv-fairview-cubao', code: 'UV-FC', name: 'Fairview – Cubao UV Express', modeId: 'uv', operatorId: 'op-dev-uv', stopIds: uvFairview, signboard: 'FAIRVIEW – CUBAO', color: '#0E7490', headwayMin: [10, 30], bidirectional: true, verified: false }),
  line({ id: 'ferry-pasig', code: 'PRF', name: 'Pasig River Ferry', modeId: 'ferry', operatorId: 'op-prf', stopIds: ferry, operational: false, verified: false, notes: 'Marked non-operational until current service status is verified; hidden from route results.' }),
];

const STATUTORY = {
  student: { rate: 0.2, legalBasis: 'RA 11314 (Student Fare Discount Act)' },
  senior: { rate: 0.2, legalBasis: 'RA 9994 (Expanded Senior Citizens Act)' },
  pwd: { rate: 0.2, legalBasis: 'RA 10754 (PWD benefits)' },
};
const fs = (o) => ({ active: true, ...DEV, sourceType: 'indicative', effectiveFrom: '2023-10-08', ...o });
const fareSchedules = [
  fs({ id: 'fare-jeep-trad', name: 'Traditional jeepney (Metro Manila)', scope: { modeId: 'jeepney' }, kind: 'distance', params: { baseFare: 13, baseKm: 4, perKm: 1.8, rounding: 0.25 }, discounts: STATUTORY, sourceNote: 'Based on publicly reported LTFRB fare order (Oct 2023). Verify current LTFRB matrix.' }),
  fs({ id: 'fare-jeep-modern', name: 'Modern jeepney (Metro Manila)', scope: { operatorId: 'op-dev-modern' }, kind: 'distance', params: { baseFare: 15, baseKm: 4, perKm: 2.2, rounding: 0.25 }, discounts: STATUTORY, sourceNote: 'Based on publicly reported LTFRB fare order (Oct 2023). Verify.' }),
  fs({ id: 'fare-bus-aircon', name: 'City bus – air-conditioned', scope: { modeId: 'bus' }, kind: 'distance', params: { baseFare: 15, baseKm: 5, perKm: 2.65, rounding: 0.25 }, discounts: STATUTORY, sourceNote: 'Based on publicly reported LTFRB city bus fare. Verify per operator.' }),
  fs({ id: 'fare-uv-fc', name: 'Fairview – Cubao UV Express', scope: { lineId: 'uv-fairview-cubao' }, kind: 'distance', params: { baseFare: 15, baseKm: 4, perKm: 2.4, rounding: 1 }, discounts: STATUTORY, sourceNote: 'PLACEHOLDER rate for development – replace with operator posted fare.' }),
  fs({ id: 'fare-mrt3', name: 'MRT-3', scope: { lineId: 'mrt3' }, kind: 'rail_distance', params: { boarding: 11, perKm: 1, minFare: 13, maxFare: 28, rounding: 1 }, discounts: STATUTORY, sourceNote: 'Approximates published ₱13–₱28 matrix. Replace with official station-to-station matrix (rail_matrix).' }),
  fs({ id: 'fare-lrt2', name: 'LRT-2', scope: { lineId: 'lrt2' }, kind: 'rail_distance', params: { boarding: 13.29, perKm: 1.21, minFare: 15, maxFare: 35, rounding: 1 }, discounts: STATUTORY, sourceNote: 'Approximates 2023 LRTA fare formula. Replace with official matrix.' }),
  fs({ id: 'fare-lrt1', name: 'LRT-1', scope: { lineId: 'lrt1' }, kind: 'rail_distance', params: { boarding: 16.25, perKm: 1.47, minFare: 20, maxFare: 55, rounding: 1 }, discounts: STATUTORY, sourceNote: 'Approximates LRMC fare formula incl. Cavite extension. Replace with official matrix.' }),
  fs({ id: 'fare-taxi', name: 'Metered taxi (Metro Manila)', scope: { modeId: 'taxi' }, kind: 'meter', params: { flagDown: 45, perKm: 13.5, perMin: 2, uncertainty: 1.25, rounding: 1 }, sourceNote: 'Based on publicly reported LTFRB taxi fare. Tolls and surcharges excluded.', disclaimer: 'Indicative estimate – actual meter fare depends on route and traffic.' }),
  fs({ id: 'fare-grab-car', name: 'GrabCar (indicative)', scope: { providerId: 'grab-car' }, kind: 'tnvs', params: { base: 45, perKm: 15, perMin: 2, surgeMax: 2, minFare: 100, rounding: 1 }, sourceNote: 'Indicative TNVS sedan formula; no live quote integration.', disclaimer: 'Indicative estimate – final fare is determined by the provider.' }),
  ...['angkas', 'joyride-mc', 'move-it'].map((p) => fs({ id: `fare-${p}`, name: `Motorcycle taxi – ${p}`, scope: { providerId: p }, kind: 'tiered', params: { tiers: [{ uptoKm: 2, flat: 50 }, { uptoKm: 7, perKm: 10 }, { perKm: 15 }], surgeMax: 1.3, rounding: 1 }, sourceNote: 'Based on publicly reported LTFRB motorcycle-taxi fare guide (Metro Manila). Provider pricing may differ; no live quote.', disclaimer: 'Indicative estimate – final fare is determined by the provider.' })),
  fs({ id: 'fare-tric-loyola', name: 'Tricycle – Loyola Heights sample zone', scope: { zoneId: 'zone-loyola-dev' }, kind: 'zone', params: { baseFare: 20, specialTripFare: 60, rounding: 1 }, sourceType: 'community', sourceNote: 'DEVELOPMENT SAMPLE – not an official LGU tariff.' }),
  fs({ id: 'fare-tric-default', name: 'Tricycle – no tariff configured', scope: { modeId: 'tricycle' }, kind: 'negotiated', params: {}, sourceNote: 'Tricycle fares are set by each LGU; configure per zone.' }),
];

const providers = [
  { id: 'grab-car', name: 'GrabCar', modeId: 'ridehail_car', vehicle: 'Car (4-seater)', integration: 'none', enabled: true, website: 'https://www.grab.com/ph/', storeUrl: 'https://play.google.com/store/search?q=Grab&c=apps', notes: 'No official pricing API configured – indicative only.' },
  { id: 'angkas', name: 'Angkas', modeId: 'mc_taxi', vehicle: 'Motorcycle', integration: 'none', enabled: true, website: 'https://angkas.com', storeUrl: 'https://play.google.com/store/search?q=Angkas&c=apps' },
  { id: 'joyride-mc', name: 'JoyRide', modeId: 'mc_taxi', vehicle: 'Motorcycle', integration: 'none', enabled: true, website: 'https://joyride.com.ph', storeUrl: 'https://play.google.com/store/search?q=JoyRide%20Philippines&c=apps' },
  { id: 'move-it', name: 'Move It', modeId: 'mc_taxi', vehicle: 'Motorcycle', integration: 'none', enabled: true, website: 'https://moveit.com.ph', storeUrl: 'https://play.google.com/store/search?q=Move%20It%20motorcycle%20taxi&c=apps' },
];

const tricycleZones = [
  { id: 'zone-loyola-dev', name: 'Loyola Heights (sample)', cityId: 'qc', barangays: ['Loyola Heights'], center: { lat: 14.6370, lng: 121.0770 }, radiusKm: 1.3, terminals: [{ name: 'Katipunan tricycle terminal (sample)', lat: 14.6318, lng: 121.0738 }], capacity: null, fareType: 'fixed', active: true, ...DEV, sourceType: 'community' },
  { id: 'zone-marikina-dev', name: 'Marikina Riverbanks area (sample)', cityId: 'marikina', barangays: [], center: { lat: 14.6310, lng: 121.0830 }, radiusKm: 1.0, terminals: [{ name: 'Riverbanks tricycle stand (sample)', lat: 14.6300, lng: 121.0840 }], fareType: 'negotiated', active: true, ...DEV, sourceType: 'community' },
];

const landmarks = [
  ['SM North EDSA', 14.6566, 121.0300, ['sm north', 'north edsa']], ['TriNoma', 14.6533, 121.0335, ['trinoma']],
  ['Araneta City (Cubao)', 14.6200, 121.0530, ['cubao', 'gateway', 'araneta']], ['SM Megamall', 14.5848, 121.0567, ['megamall']],
  ['Ortigas Center', 14.5869, 121.0614, ['ortigas center']], ['BGC High Street', 14.5507, 121.0510, ['bgc', 'bonifacio global city', 'high street', 'taguig']],
  ['Ayala Center Makati', 14.5508, 121.0244, ['makati', 'ayala center', 'greenbelt', 'glorietta']], ['NAIA Terminal 3', 14.5208, 121.0193, ['naia 3', 'naia', 'airport', 'terminal 3']],
  ['NAIA Terminal 1', 14.5086, 121.0198, ['naia 1', 'terminal 1']], ['SM Mall of Asia', 14.5352, 120.9822, ['moa', 'mall of asia']],
  ['Divisoria', 14.6060, 120.9710, ['divi', 'tutuban']], ['Quiapo Church', 14.5989, 120.9838, ['quiapo']],
  ['Intramuros', 14.5896, 120.9747, []], ['Rizal Park (Luneta)', 14.5826, 120.9787, ['luneta', 'rizal park']],
  ['UP Diliman', 14.6537, 121.0684, ['up', 'university of the philippines']], ['Ateneo de Manila University', 14.6400, 121.0770, ['ateneo']],
  ['UST (España)', 14.6099, 120.9893, ['ust', 'santo tomas']], ['Eastwood City', 14.6094, 121.0779, ['eastwood']],
  ['Marikina Riverbanks', 14.6310, 121.0830, ['riverbanks', 'marikina']], ['PITX Terminal', 14.5094, 120.9916, ['pitx', 'paranaque integrated terminal exchange']],
  ['Fairview', 14.7340, 121.0580, ['sm fairview']], ['Philcoa', 14.6545, 121.0533, []], ['Quezon Memorial Circle', 14.6513, 121.0493, ['qc circle', 'memorial circle']],
  ['Greenhills', 14.6019, 121.0486, []], ['Baclaran Church', 14.5320, 120.9985, ['baclaran']], ['Manila City Hall', 14.5895, 120.9817, ['lawton']],
];
for (const [name, lat, lng, aliases] of landmarks) places.push({ id: 'pl-' + slug(name), name, lat, lng, aliases, type: 'landmark', ...DEV });
for (const s of stops) if (s.kind === 'station') places.push({ id: 'pl-' + s.id, name: `${s.name.replace(/ \((MRT|LRT-2)\)/, '')} Station`, stopId: s.id, lat: s.lat, lng: s.lng, aliases: [s.name.toLowerCase()], type: 'station', ...DEV });

const now = new Date('2026-11-16T00:00:00+08:00');
const day = (d) => new Date(now.getTime() + d * 86400000).toISOString();
const advisories = [
  { id: 'adv-sample-1', title: 'Sample advisory: data verification in progress', body: 'SakayPinoy is running on development data. Fares, routes and schedules shown are for testing and must be verified before use.', source: 'SakayPinoy (sample)', sourceType: 'admin_verified', severity: 'info', area: 'Metro Manila', modes: [], lineIds: [], publishedAt: day(-1), updatedAt: day(-1), expiresAt: day(60), ...DEV },
  { id: 'adv-sample-expired', title: 'Sample expired advisory (should be hidden)', body: 'This sample exists to test that expired advisories are never shown as active.', source: 'SakayPinoy (sample)', sourceType: 'admin_verified', severity: 'warning', area: 'Metro Manila', modes: ['rail'], lineIds: ['mrt3'], publishedAt: day(-30), updatedAt: day(-30), expiresAt: day(-20), ...DEV },
];

const timeProfiles = {
  source: 'Configured typical-speed profile (development) – not live traffic',
  walkKmh: 4.5,
  bands: [
    { id: 'am_peak', start: '06:00', end: '10:00' },
    { id: 'pm_peak', start: '16:00', end: '20:00' },
    { id: 'night', start: '22:00', end: '05:00' },
  ],
  modes: {
    jeepney: { speedKmh: { am_peak: [8, 15], pm_peak: [8, 15], offpeak: [12, 20], night: [18, 26] }, dwellMinPerStop: 0.5, headwayMin: [5, 15], roadBased: true },
    bus: { speedKmh: { am_peak: [12, 22], pm_peak: [12, 22], offpeak: [16, 26], night: [22, 32] }, dwellMinPerStop: 0.7, headwayMin: [5, 15], roadBased: true },
    uv: { speedKmh: { am_peak: [12, 24], pm_peak: [12, 24], offpeak: [18, 30], night: [25, 38] }, dwellMinPerStop: 0.5, headwayMin: [10, 30], roadBased: true },
    rail: { speedKmh: { am_peak: [32, 40], pm_peak: [32, 40], offpeak: [34, 40], night: [34, 40] }, dwellMinPerStop: 0.6, headwayMin: [4, 8], stationOverheadMin: [4, 12] },
    ferry: { speedKmh: { offpeak: [15, 20] }, headwayMin: [30, 60] },
    tricycle: { speedKmh: { am_peak: [10, 16], pm_peak: [10, 16], offpeak: [12, 18], night: [15, 20] }, pickupMin: [1, 10], roadBased: true },
    mc_taxi: { speedKmh: { am_peak: [16, 26], pm_peak: [16, 26], offpeak: [22, 32], night: [25, 38] }, pickupMin: [3, 12], maxKm: 50, roadBased: true },
    ridehail_car: { speedKmh: { am_peak: [10, 22], pm_peak: [10, 22], offpeak: [18, 30], night: [25, 40] }, pickupMin: [4, 15], maxKm: 120, roadBased: true },
    taxi: { speedKmh: { am_peak: [10, 22], pm_peak: [10, 22], offpeak: [18, 30], night: [25, 40] }, pickupMin: [3, 15], maxKm: 120, roadBased: true },
  },
};

const cities = [
  ['mm', 'Metro Manila', 'NCR', true], ['qc', 'Quezon City', 'NCR', true], ['manila', 'Manila', 'NCR', true], ['makati', 'Makati', 'NCR', true],
  ['taguig', 'Taguig', 'NCR', true], ['pasig', 'Pasig', 'NCR', true], ['marikina', 'Marikina', 'NCR', true], ['pasay', 'Pasay', 'NCR', true],
  ['cebu', 'Cebu City', 'Region VII', false], ['davao', 'Davao City', 'Region XI', false], ['baguio', 'Baguio City', 'CAR', false], ['iloilo', 'Iloilo City', 'Region VI', false],
].map(([id, name, region, active]) => ({ id, name, region, active }));

const ds = {
  meta: { name: 'SakayPinoy development dataset', dataset: 'development', version: 1, generatedAt: new Date().toISOString(), warning: 'Development data – not for production. Verify every fare, route and schedule against official sources.' },
  settings: { defaultMaxWalkKm: 1, transferWalkKm: 0.5, maxWalkOnlyKm: 2.5, arriveBufferMin: 5, currency: 'PHP', timezone: 'Asia/Manila',
    scoring: { valueOfTimePerMin: 1.5, transferPenalty: 12, walkPenaltyPerKm: 25, waitMultiplier: 1.5, unknownFarePenalty: 80, lowConfidencePenalty: 20 } },
  cities, modes, operators, stops, lines, fareSchedules, providers, tricycleZones, places, advisories, timeProfiles,
  reports: [], auditLog: [], fareHistory: [], analytics: { searches: 0, failedSearches: 0, fareRequests: 0, destinations: {}, modes: {} },
};

const out = join(here, '..', 'dev', 'dataset.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(ds, null, 1));
console.log(`Wrote ${out}: ${stops.length} stops, ${lines.length} lines, ${places.length} places, ${fareSchedules.length} fare schedules`);
