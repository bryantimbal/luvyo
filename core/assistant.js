// Grounded commute assistant (spec §21).
// Understands English / Filipino / Taglish questions, extracts intent and
// places, then answers ONLY from the routing + fare engines. It never writes
// a route, fare or schedule that the engines did not return.
//
// An LLM can be layered on top (see docs/ARCHITECTURE.md) but must call these
// same tools; this module is the deterministic fallback and the tool layer.

import { planJourney } from './router.js';
import { formatFareRange } from './fareEngine.js';
import { formatDuration } from './timeEngine.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9₱ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function findPlace(places, text) {
  const t = ' ' + norm(text) + ' ';
  let best = null;
  for (const p of places) {
    for (const name of [p.name, ...(p.aliases || [])]) {
      const n = norm(name);
      if (n.length < 3) continue;
      const i = t.indexOf(' ' + n + ' ');
      // earliest mention wins; ties go to the longer (more specific) name
      if (i >= 0 && (!best || i < best.index || (i === best.index && n.length > best.len))) best = { place: p, len: n.length, index: i };
    }
  }
  return best;
}

/** Find origin and destination from phrases like "from X to Y", "X papuntang Y", "papunta sa Y". */
export function parseQuery(places, text) {
  const raw = ' ' + norm(text) + ' ';
  const out = { intent: 'route', origin: null, destination: null, budget: null, days: null, priority: null, modes: [] };
  const budget = raw.match(/(?:less than|below|under|budget|hanggang|wala pang|di lalagpas sa|max)\s*₱?\s*(\d{2,5})/) || raw.match(/₱\s*(\d{2,5})/);
  if (budget) out.budget = +budget[1];
  const days = raw.match(/(\d{1,3})\s*(?:days|araw|working days)/);
  if (days) { out.days = +days[1]; out.intent = 'cost_projection'; }
  if (/\b(fastest|pinakamabilis|mabilis|quickest)\b/.test(raw)) out.priority = 'fastest';
  if (/\b(cheapest|pinakamura|mura|tipid|less than|under)\b/.test(raw)) out.priority = out.priority ?? 'cheapest';
  if (/\b(mas mura ba|compare|vs|o ang|or)\b/.test(raw)) out.intent = out.intent === 'route' ? 'compare' : out.intent;
  if (/\b(anong jeep|which jeep|jeep|dyip)\b/.test(raw)) out.modes.push('jeepney');
  if (/\b(mrt|lrt|train|tren)\b/.test(raw)) out.modes.push('rail');
  if (/\b(angkas|joyride|move it|motor|habal)\b/.test(raw)) out.modes.push('mc_taxi');
  if (/\b(grab|taxi|kotse)\b/.test(raw)) out.modes.push('ridehail_car');

  const destMarkers = [' to ', ' papuntang ', ' papunta sa ', ' papunta ng ', ' papunta ', ' going to ', ' sa '];
  const fromMarkers = [' from ', ' galing sa ', ' galing ', ' mula sa ', ' mula ', ' dito sa '];
  // Text after a marker, cut at the next marker of the other kind ("mula X papuntang Y").
  const after = (markers, stops) => {
    for (const m of markers) {
      const i = raw.lastIndexOf(m);
      if (i < 0) continue;
      let seg = raw.slice(i + m.length - 1);
      for (const st of stops) { const k = seg.indexOf(st); if (k > 0) seg = seg.slice(0, k + 1); }
      const hit = findPlace(places, seg);
      if (hit) return hit.place;
    }
    return null;
  };
  out.destination = after(destMarkers, [' from ', ' galing ', ' mula ', ' for ', ' under ', ' less ']);
  out.origin = after(fromMarkers, destMarkers.filter((m) => m !== ' sa '));
  if (!out.origin && out.destination) {
    // "Cubao to BGC" without "from": origin is the place mentioned before the destination marker.
    for (const m of destMarkers) {
      const i = raw.indexOf(m);
      if (i > 0) { const hit = findPlace(places, raw.slice(0, i)); if (hit && hit.place.id !== out.destination.id) { out.origin = hit.place; break; } }
    }
  }
  if (!out.destination) {
    const hit = findPlace(places, raw);
    if (hit) out.destination = hit.place;
  }
  return out;
}

/**
 * Answer a question. `context.currentLocation` is used when no origin was named.
 * Returns { text, plan?, parsed, lang }
 */
export function answer(ds, question, context = {}) {
  const parsed = parseQuery(ds.places, question);
  const tl = /\b(ang|ba|sa|ko|papunta|magkano|anong|paano|saan|mas|po)\b/i.test(question);
  const say = (en, fil) => (tl ? fil : en);
  const origin = parsed.origin ?? context.currentLocation ?? null;
  if (!parsed.destination) {
    return { parsed, text: say(
      "I couldn't find that destination in LUVYO's place list yet. Try a landmark, station or district name (e.g. “Cubao to BGC”).",
      'Hindi ko pa makita ang destinasyon sa listahan ng LUVYO. Subukan ang landmark o istasyon (hal. “Cubao papuntang BGC”).') };
  }
  if (origin && origin.name === parsed.destination.name) {
    return { parsed, text: say('Your start and destination look the same. Where are you coming from?', 'Mukhang pareho ang pinanggalingan at destinasyon. Saan ka manggagaling?') };
  }
  if (!origin) {
    return { parsed, text: say(
      `Where are you starting from? Tell me “from <place> to ${parsed.destination.name}” or allow location access.`,
      `Saan ka manggagaling? Sabihin ang “mula sa <lugar> papuntang ${parsed.destination.name}” o i-on ang location.`) };
  }
  const plan = planJourney(ds, {
    origin, destination: parsed.destination, budget: parsed.budget,
    priority: parsed.priority || 'best', passengerType: context.passengerType || 'regular',
  });
  if (!plan.options.length) {
    return { parsed, plan, text: say('No route found with the current verified data.', 'Walang nahanap na ruta sa kasalukuyang datos.') };
  }
  const pick = (t) => plan.options.find((o) => o.tags.includes(t));
  const line = (o) => `• ${o.title}: ${formatFareRange(o.fare.min, o.fare.max, o.fare)}, ${formatDuration(o.time.min, o.time.max)}, ${o.transfers} transfer(s) [${o.sourceType === 'indicative' ? 'estimate' : o.sourceType}]`;
  const lines = [];
  const head = say(`${origin.name} → ${parsed.destination.name}:`, `${origin.name} → ${parsed.destination.name}:`);
  lines.push(head);

  if (parsed.intent === 'compare' && parsed.modes.length >= 2) {
    for (const m of parsed.modes) {
      const o = plan.options.filter((x) => x.modes.includes(m)).sort((a, b) => a.fare.min - b.fare.min)[0];
      lines.push(o ? line(o) : `• ${m}: ${say('no option found', 'walang nahanap')}`);
    }
  } else if (parsed.modes.includes('jeepney') && parsed.intent !== 'cost_projection') {
    const jeeps = plan.options.filter((o) => o.modes.includes('jeepney'));
    if (!jeeps.length) lines.push(say('No verified jeepney route in our data for this trip yet. Other options:', 'Wala pang naka-verify na jeep para dito sa aming datos. Ibang opsyon:'));
    for (const o of (jeeps.length ? jeeps : plan.options).slice(0, 3)) lines.push(line(o));
  } else {
    for (const t of ['cheapest', 'fastest', 'best']) {
      const o = pick(t);
      if (o) lines.push(`${t.toUpperCase()} ${line(o).slice(2)}`);
    }
  }
  if (parsed.budget) {
    const ok = plan.options.filter((o) => !o.overBudget && !o.fare.partial);
    lines.push(ok.length
      ? say(`${ok.length} option(s) fit within ₱${parsed.budget}.`, `${ok.length} opsyon ang pasok sa ₱${parsed.budget}.`)
      : say(`No option fits within ₱${parsed.budget} based on available fares.`, `Walang opsyon na pasok sa ₱${parsed.budget}.`));
  }
  if (parsed.intent === 'cost_projection' && parsed.days) {
    const o = pick('cheapest') || plan.options[0];
    const trips = parsed.days * 2;
    lines.push(say(
      `Round trip on the cheapest option for ${parsed.days} days: ${formatFareRange(o.fare.min * trips, o.fare.max * trips)} (${trips} rides).`,
      `Balikan sa pinakamurang opsyon sa loob ng ${parsed.days} araw: ${formatFareRange(o.fare.min * trips, o.fare.max * trips)}.`));
  }
  const best = pick('best');
  if (best) lines.push(say('Steps for the recommended route:', 'Mga hakbang sa inirerekomendang ruta:'), ...best.legs.map((l, i) => `${i + 1}. ${l.instruction}`));
  lines.push(say('Fares and times are estimates from LUVYO data; check labels in the route view.', 'Tantya lamang ang pamasahe at oras; tingnan ang mga label sa route view.'));
  return { parsed, plan, text: lines.join('\n') };
}
