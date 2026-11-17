import { header } from '../lib/ui.js';
import { t } from '../lib/i18n.js';

export default function explore(el) {
  const items = [
    ['#/map', '🗺️', 'Transport map', 'Stations, stops and terminals near you'],
    ['#/jeepney', '🚙', t('jeepFinder'), 'Search routes · “Does this jeep pass here?”'],
    ['#/tricycle', '🛺', 'Tricycle finder', 'Terminals, zones and local fares'],
    ['#/ridehail', '🏍️', 'Ride-hailing comparison', 'Grab, Angkas, JoyRide, Move It'],
    ['#/fare', '🧮', t('fareCalc'), 'Estimate any trip, single or mixed'],
    ['#/advisories', '⚠️', 'Service advisories', 'Closures, disruptions, weather'],
    ['#/assistant', '💬', 'Commute assistant', 'Ask in English, Filipino or Taglish'],
    ['#/ambag', '🙌', 'Ambag – contribute', 'Report fares, waits, routes; verify others'],
    ['#/leaderboard', '🏆', 'Top contributors', 'This week’s most helpful riders'],
    ['#/report', '🚩', 'Report an issue', 'Road closures, disruptions and other problems'],
  ];
  el.innerHTML = `${header(t('explore'), { back: false })}<ul class="list pad">${items.map(([h, i, n, d]) => `<li><a href="${h}"><span class="ic">${i}</span><span class="grow"><b>${n}</b><div class="muted small">${d}</div></span><span class="muted">›</span></a></li>`).join('')}</ul>`;
}
