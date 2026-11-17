// Language support. English is the default; Filipino is optional
// (onboarding, Settings, Profile).
//
// UI copy is written in English in the screens. When Filipino is selected, a
// MutationObserver translates text nodes and placeholder/aria/title attributes
// as they render (screens, sheets, toasts), using:
//   • PHRASES  – exact UI strings
//   • PATTERNS – dynamic strings (counts, times, directions, questions)
// Proper names (places, routes, signboards, providers) and user-written text
// are intentionally left as they are.

import { store } from './store.js';

export const LANGUAGES = [['en', 'English'], ['fil', 'Filipino']];
export const lang = () => (store.get().profile.language === 'fil' ? 'fil' : 'en');

// Short keyed labels used directly in code (nav, home).
const dict = {
  en: {
    home: 'Home', explore: 'Explore', myRoutes: 'My Routes', commute: 'Commute', profile: 'Profile',
    greeting: 'Where to today?', from: 'From', to: 'To', searchJourney: 'Find routes', leaveNow: 'Leave now', departAt: 'Depart at', arriveBy: 'Arrive by',
    currentLocation: 'Current location', chooseOrigin: 'Where are you starting?', chooseDest: 'Where are you going?',
    planJourney: 'Plan journey', nearby: 'Nearby transport', fareCalc: 'Fare calculator', jeepFinder: 'Jeepney finder', saved: 'Saved routes', history: 'Commute history',
    recent: 'Recent journeys', favorites: 'Favorite places', todaySpend: "Today's commute spend", advisories: 'Advisories', nearbyStops: 'Nearby stops',
    fare: 'Fare', travelTime: 'Travel time', transfers: 'Transfers', walking: 'Walking',
  },
  fil: {
    home: 'Home', explore: 'Tuklasin', myRoutes: 'Aking Ruta', commute: 'Biyahe', profile: 'Profile',
    greeting: 'Saan tayo ngayon?', from: 'Mula', to: 'Papunta', searchJourney: 'Hanapin ang ruta', leaveNow: 'Alis ngayon', departAt: 'Aalis ng', arriveBy: 'Darating bago',
    currentLocation: 'Kasalukuyang lokasyon', chooseOrigin: 'Saan ka manggagaling?', chooseDest: 'Saan ka pupunta?',
    planJourney: 'Planuhin ang biyahe', nearby: 'Malapit na sakayan', fareCalc: 'Pamasahe calculator', jeepFinder: 'Hanap-jeep', saved: 'Naka-save na ruta', history: 'Kasaysayan ng biyahe',
    recent: 'Mga huling biyahe', favorites: 'Paboritong lugar', todaySpend: 'Gastos sa pamasahe ngayon', advisories: 'Mga abiso', nearbyStops: 'Malapit na hintuan',
    fare: 'Pamasahe', travelTime: 'Tagal ng biyahe', transfers: 'Lipat', walking: 'Lakad',
  },
};
export const t = (k) => dict[lang()]?.[k] ?? dict.en[k] ?? k;

// ------------------------------------------------------------- phrases ---
const PHRASES = {
  // navigation & common
  'Explore': 'Tuklasin', 'Ambag': 'Ambag', 'My Routes': 'Aking Ruta', 'Profile': 'Profile', 'Back': 'Bumalik', '← Back': '← Bumalik',
  'Next': 'Susunod', 'Skip': 'Laktawan', 'Save': 'I-save', 'Apply': 'Ilapat', 'Reset': 'I-reset', 'Send': 'Ipadala', 'Add': 'Idagdag', '+ Add': '+ Idagdag',
  'Details': 'Detalye', 'All': 'Lahat', 'Any': 'Kahit ilan', 'Other': 'Iba pa', 'Off': 'Naka-off', 'Today': 'Ngayon', 'When': 'Kailan', 'Name': 'Pangalan',
  'Note': 'Tala', 'Notes': 'Mga tala', 'Description': 'Paglalarawan', 'Category': 'Kategorya', 'Source': 'Pinagmulan', 'Area': 'Lugar', 'Total': 'Kabuuan',
  'Time': 'Oras', 'Distance': 'Layo', 'Filters': 'Mga filter', 'Map': 'Mapa', 'Main': 'Pangunahin', 'Message': 'Mensahe', 'Language': 'Wika',
  'Mon': 'Lun', 'Tue': 'Mar', 'Wed': 'Miy', 'Thu': 'Huw', 'Fri': 'Biy', 'Sat': 'Sab', 'Sun': 'Lin', 'Zoom in': 'Palakihin', 'Zoom out': 'Paliitin',
  'Swap origin and destination': 'Pagpalitin ang pinanggalingan at destinasyon', 'Locate me': 'Hanapin ako', 'You are here': 'Nandito ka',
  'Know the cost before you go.': 'Alamin ang pamasahe bago umalis.', 'Philippine Mobility App': 'Philippine Mobility App',
  // onboarding / login
  'One destination. Many ways to get there.': 'Isang destinasyon. Maraming paraan para makarating.',
  'Compare jeepney, bus, MRT/LRT, UV Express, tricycle, motorcycle taxi, taxi and ride-hailing in one place.': 'Ikumpara ang jeep, bus, MRT/LRT, UV Express, tricycle, motorcycle taxi, taxi at ride-hailing sa iisang lugar.',
  'Know the cost before you go': 'Alamin ang pamasahe bago umalis',
  'Every option shows the estimated total fare and travel time – with where the numbers come from.': 'Bawat opsyon ay may tantyang kabuuang pamasahe at tagal ng biyahe – at kung saan galing ang mga numero.',
  'Step-by-step directions tell you where to board, where to get off and where to transfer.': 'Sinasabi ng step-by-step na direksyon kung saan sasakay, bababa at lilipat.',
  'Passenger type (for fare discounts)': 'Uri ng pasahero (para sa diskwento)', 'Passenger type': 'Uri ng pasahero',
  'Discounts are applied only where the service\'s eligibility is confirmed. You may be asked for a valid ID when paying.': 'Ibinabawas lang ang diskwento kung kumpirmadong saklaw ng serbisyo. Maaaring hingan ka ng valid ID sa pagbabayad.',
  'Regular': 'Regular', 'Student': 'Estudyante', 'Senior citizen': 'Senior citizen', 'Person with disability': 'Taong may kapansanan (PWD)',
  'Start as guest': 'Magsimula bilang guest', 'Sign in / Create account': 'Mag-sign in / Gumawa ng account', 'By continuing you agree to our': 'Sa pagpapatuloy, sumasang-ayon ka sa aming',
  'Privacy Policy and Terms': 'Privacy Policy at Terms', 'Sign in': 'Mag-sign in', 'Create account': 'Gumawa ng account', 'Continue with Google': 'Magpatuloy gamit ang Google',
  'Email': 'Email', 'Password': 'Password', 'Display name': 'Pangalang ipapakita', 'New here? Create an account': 'Bago ka? Gumawa ng account',
  'Have an account? Sign in': 'May account ka na? Mag-sign in', 'Continue as guest': 'Magpatuloy bilang guest',
  'Accounts are not configured on this server (Supabase). You can use every route feature as a guest; your data stays on this device.': 'Hindi pa naka-set up ang mga account sa server na ito (Supabase). Magagamit mo ang lahat ng feature sa ruta bilang guest; nasa device mo lang ang iyong data.',
  // home
  'Tap to use your current location': 'I-tap para gamitin ang kasalukuyang lokasyon', 'Ask LUVYO': 'Magtanong sa LUVYO',
  'All (1)': 'Lahat (1)', 'No daily budget set': 'Walang nakatakdang budget kada araw', 'Your planned journeys will appear here.': 'Lalabas dito ang mga pinlano mong biyahe.',
  'Manage': 'Ayusin', 'See all': 'Tingnan lahat',
  // pick
  'Search address, landmark, station…': 'Maghanap ng address, landmark, istasyon…', 'Search place': 'Maghanap ng lugar', 'Uses your device location once': 'Gagamitin ang lokasyon mo nang isang beses',
  'Choose on map': 'Pumili sa mapa', 'Tap a point on the map': 'Mag-tap ng lugar sa mapa', 'Tap the map to drop a pin, then confirm.': 'I-tap ang mapa para maglagay ng pin, saka kumpirmahin.',
  'Use this point': 'Gamitin ang puntong ito', 'Recent': 'Kamakailan',
  // results / filters
  'Routes': 'Mga ruta', 'Best overall': 'Pinakamainam', 'Cheapest': 'Pinakamura', 'Fastest': 'Pinakamabilis', 'Fewest transfers': 'Pinakakaunting lipat',
  'Sort by': 'Ayusin ayon sa', 'Some routes use': 'May mga rutang gumagamit ng', 'development data': 'development data',
  '(unverified corridors / indicative fares). Verify before travelling.': '(hindi pa beripikadong ruta / tantyang pamasahe). I-verify bago bumiyahe.',
  'est. fare': 'tantyang pamasahe', 'total est. fare': 'kabuuang tantyang pamasahe', 'estimated fare': 'tantyang pamasahe',
  'Over budget': 'Lampas sa budget', 'May arrive late': 'Baka mahuli', 'Route preferences': 'Mga kagustuhan sa ruta',
  'Max walking per access/egress:': 'Pinakamalayong lakad bago/pagkatapos sumakay:', 'Max transfers': 'Pinakamaraming lipat', 'Max budget (₱)': 'Pinakamataas na budget (₱)',
  'No limit': 'Walang limit', 'Public only': 'Pampubliko lang', 'Private only': 'Pribado lang', 'Include these': 'Isama ang mga ito', 'Transport type': 'Uri ng sasakyan',
  'No routes found': 'Walang nahanap na ruta', 'Adjust filters': 'Baguhin ang filter',
  'Try relaxing your filters (walking distance, transfers, excluded modes) or choosing a nearby landmark.': 'Subukang luwagan ang filter (layo ng lakad, lipat, inalis na sasakyan) o pumili ng malapit na landmark.',
  // trust labels
  'Estimate': 'Tantya', 'Official': 'Opisyal', 'Live quote': 'Live quote', 'Operator': 'Operator', 'Admin-verified': 'Beripikado ng admin',
  'Rider-verified': 'Beripikado ng pasahero', 'Community (unverified)': 'Komunidad (hindi pa beripikado)', 'DEV DATA': 'DEV DATA',
  'Not verified': 'Hindi pa beripikado', 'Route not verified': 'Hindi pa beripikadong ruta', '✓ Verified': '✓ Beripikado', 'Not yet confirmed': 'Hindi pa nakumpirma',
  'Confirmed by riders': 'Kinumpirma ng mga pasahero', 'Development dataset – verify before travel': 'Development dataset – i-verify bago bumiyahe',
  // route details
  'Step by step': 'Hakbang-hakbang', 'Arrive': 'Pagdating', 'Fare breakdown': 'Detalye ng pamasahe', 'Segment': 'Bahagi', 'Fare': 'Pamasahe',
  '▶ Start': '▶ Simulan', '⭐ Save': '⭐ I-save', '₱ Log fare': '₱ Itala ang pamasahe', 'Compare & open provider apps': 'Ikumpara at buksan ang app ng provider',
  '🚩 Report a problem with this route': '🚩 Mag-ulat ng problema sa rutang ito', 'Map of the route': 'Mapa ng ruta', 'Signboard:': 'Karatula:',
  'Includes a route that is not yet verified.': 'May kasamang rutang hindi pa beripikado.', 'Uses development data – verify before travelling.': 'Gumagamit ng development data – i-verify bago bumiyahe.',
  'Tolls not included unless stated.': 'Hindi kasama ang toll maliban kung nakasaad.', 'Some fares are unavailable – total shown excludes them.': 'May mga pamasaheng hindi available – hindi kasama sa kabuuan.',
  'Save route': 'I-save ang ruta', 'Departure reminder': 'Paalala sa pag-alis', 'Set reminder': 'Itakda ang paalala', 'Add to expenses': 'Idagdag sa gastos',
  "Log this trip's fare": 'Itala ang pamasahe sa biyaheng ito', 'Remind me at (Manila time)': 'Ipaalala sa akin sa (oras sa Maynila)',
  'Reminders fire while LUVYO is open. Background push needs Firebase Cloud Messaging to be configured.': 'Gumagana ang paalala habang bukas ang LUVYO. Kailangan ng Firebase Cloud Messaging para sa background push.',
  // navigate
  'Exit navigation': 'Lumabas sa navigation', 'Use GPS to track progress': 'Gamitin ang GPS para subaybayan', 'Remaining time': 'Natitirang oras',
  'Remaining fare': 'Natitirang pamasahe', 'Remaining distance': 'Natitirang layo', 'GPS progress': 'GPS progress', 'On': 'Naka-on',
  'Next: arrive at your destination': 'Susunod: darating ka na sa destinasyon', '✓ Arrived': '✓ Nakarating na', 'Log my fare': 'Itala ang pamasahe ko',
  'Help the next rider 🙌': 'Tulungan ang susunod na pasahero 🙌', 'Jeep, tricycle, taxi and ride-hailing info comes from riders like you.': 'Galing sa mga pasaherong tulad mo ang impormasyon sa jeep, tricycle, taxi at ride-hailing.',
  // explore
  'Transport map': 'Mapa ng sasakyan', 'Stations, stops and terminals near you': 'Mga istasyon, hintuan at terminal na malapit sa iyo',
  'Search routes · “Does this jeep pass here?”': 'Maghanap ng ruta · “Dumadaan ba dito ang jeep?”', 'Tricycle finder': 'Hanap-tricycle',
  'Terminals, zones and local fares': 'Mga terminal, zone at lokal na pamasahe', 'Ride-hailing comparison': 'Paghahambing ng ride-hailing',
  'Estimate any trip, single or mixed': 'Tantyahin ang anumang biyahe, isa o halo-halo', 'Service advisories': 'Mga abiso sa serbisyo',
  'Closures, disruptions, weather': 'Mga sarado, aberya, panahon', 'Commute assistant': 'Commute assistant', 'Ask in English, Filipino or Taglish': 'Magtanong sa English, Filipino o Taglish',
  'Ambag – contribute': 'Ambag – mag-ambag', 'Report fares, waits, routes; verify others': 'Mag-ulat ng pamasahe, paghihintay, ruta; i-verify ang iba',
  'Top contributors': 'Nangungunang nag-aambag', 'This week’s most helpful riders': 'Pinakamatulunging pasahero ngayong linggo',
  'Report an issue': 'Mag-ulat ng problema', 'Road closures, disruptions and other problems': 'Saradong kalsada, aberya at iba pang problema',
  // map / jeepney / line
  'Show routes': 'Ipakita ang ruta', 'Start here': 'Dito magsimula', 'Go here': 'Dito pumunta',
  'Destination, route code, terminal or landmark (e.g. Quiapo)': 'Destinasyon, code ng ruta, terminal o landmark (hal. Quiapo)', 'Search jeepney routes': 'Maghanap ng ruta ng jeep',
  'Does this jeepney pass here?': 'Dumadaan ba dito ang jeep na ito?', 'Pick a spot to see verified and development jeepney routes passing within 400 m.': 'Pumili ng lugar para makita ang mga ruta ng jeep na dumadaan sa loob ng 400 m.',
  '📍 My location': '📍 Lokasyon ko', '🗺️ Pick on map': '🗺️ Pumili sa mapa', 'No jeepney routes match': 'Walang tugmang ruta ng jeep',
  'Fare (shortest hop)': 'Pamasahe (pinakamaikling sakay)', 'Fare (end to end)': 'Pamasahe (dulo hanggang dulo)', 'End-to-end time': 'Oras mula dulo hanggang dulo',
  'Operating hours': 'Oras ng operasyon', 'Frequency': 'Dalas ng dating', 'Fare source': 'Pinagmulan ng pamasahe', 'Schedule unavailable': 'Walang iskedyul', 'Unavailable': 'Hindi available',
  'From riders 👥': 'Mula sa mga pasahero 👥', 'Rider fare': 'Pamasahe ayon sa pasahero', 'Typical wait': 'Karaniwang hintay', 'Last trip': 'Huling biyahe',
  'Loading spots': 'Mga sakayan', 'Open reports': 'Bukas na ulat', 'No verified reports yet': 'Wala pang beripikadong ulat', 'Unknown': 'Hindi alam',
  '👍 Route still accurate': '👍 Tama pa ang ruta', '₱ Fare': '₱ Pamasahe', '⏳ Wait': '⏳ Hintay', '🌙 Last trip': '🌙 Huling biyahe', '📍 Loading spot': '📍 Sakayan',
  '🛰️ Record ride': '🛰️ I-record ang biyahe', '🔀 Changed?': '🔀 Nagbago?', 'Schedule & fares': 'Iskedyul at pamasahe',
  '✋ You can board or say “Para!” anywhere along this route – these are reference points.': '✋ Puwede kang sumakay o mag-“Para!” kahit saan sa rutang ito – mga palatandaan lang ang mga ito.',
  '🚩 Report incorrect route, changed destination or missing stop': '🚩 Iulat ang maling ruta, nagbagong destinasyon o kulang na hintuan',
  // tricycle / ridehail / fare calc
  'Tricycle fares are set by each city/municipality. We separate': 'Itinatakda ng bawat lungsod/bayan ang pamasahe sa tricycle. Pinaghihiwalay namin ang',
  'fixed tariffs': 'nakapirming taripa', 'from': 'sa', 'negotiated fares': 'pamasaheng pinag-uusapan', "and never guess a fare we don't have.": 'at hindi kami nanghuhula ng pamasaheng wala kami.',
  '📍 Find zones near me': '📍 Hanapin ang zone na malapit sa akin', 'Fare type': 'Uri ng pamasahe', 'Fixed tariff': 'Nakapirming taripa', 'Negotiated': 'Pinag-uusapan',
  'Coverage': 'Saklaw', 'Terminals': 'Mga terminal', 'Capacity': 'Kapasidad', '₱ I paid… (+5)': '₱ Nagbayad ako… (+5)', '⏳ Wait time': '⏳ Oras ng hintay',
  'No official live-pricing integrations are active. Fares are': 'Walang aktibong opisyal na live-pricing. Ang mga pamasahe ay',
  'estimates – final fare is determined by the provider': 'tantya lamang – ang provider ang magtatakda ng huling pamasahe',
  '. Where riders have reported what they paid, estimates are calibrated and marked 👥 Rider-verified.': '. Kapag may iniulat ang mga pasahero kung magkano ang ibinayad nila, inaayos ang tantya at minamarkahang 👥 Beripikado ng pasahero.',
  'Availability unknown': 'Hindi alam kung available', 'Website': 'Website', 'Typical traffic model': 'Karaniwang modelo ng trapiko',
  '₱ Took this ride? Report what you actually paid (+5)': '₱ Sumakay ka ba? Iulat kung magkano talaga ang ibinayad mo (+5)',
  "Booking happens in the provider's own app. LUVYO never books, charges or confirms a ride for you.": 'Sa app ng provider ang booking. Hindi nagbo-book, naniningil o nagkukumpirma ng sakay ang LUVYO para sa iyo.',
  'Calculate fare': 'Kuwentahin ang pamasahe', '+ Add segment (mixed trip)': '+ Magdagdag ng bahagi (halo-halong biyahe)', 'Jeepney / Bus / Train / UV (by route)': 'Jeep / Bus / Tren / UV (ayon sa ruta)',
  'Route': 'Ruta', 'Board at': 'Sakay sa', 'Get off at': 'Baba sa', 'For motorcycle taxis and ride-hailing, use': 'Para sa motorcycle taxi at ride-hailing, gamitin ang',
  // my routes / history / expenses
  'Saved places': 'Mga naka-save na lugar', 'Save Home, Work or School for one-tap planning.': 'I-save ang Bahay, Trabaho o Paaralan para sa mabilisang pagplano.',
  'Saved routes': 'Mga naka-save na ruta', 'No saved routes yet': 'Wala pang naka-save na ruta', 'Open any route result and tap Save.': 'Magbukas ng ruta at i-tap ang I-save.',
  '⭐ Saved': '⭐ Naka-save', '🕘 History': '🕘 Kasaysayan', '💰 Expenses': '💰 Gastos', 'History': 'Kasaysayan', 'Clear': 'Burahin',
  'No commute history yet': 'Wala pang kasaysayan ng biyahe', 'Plan a journey and it will appear here (stored only on this device unless you sign in).': 'Magplano ng biyahe at lalabas ito dito (sa device mo lang naka-imbak maliban kung mag-sign in ka).',
  'Commute expenses': 'Gastos sa biyahe', 'This month': 'Ngayong buwan', 'Avg per journey': 'Average kada biyahe', 'Avg per km': 'Average kada km',
  'Last 7 days': 'Huling 7 araw', 'Potential savings': 'Posibleng matipid', 'vs cheapest option shown': 'kumpara sa pinakamurang opsyon', 'Most used': 'Pinakaginagamit',
  '+ Add expense': '+ Magdagdag ng gastos', 'Budget': 'Budget', 'Entries': 'Mga tala', 'No expenses yet': 'Wala pang gastos', 'Log fares from a route, or add one manually.': 'Itala ang pamasahe mula sa ruta, o magdagdag nang mano-mano.',
  'Add expense': 'Magdagdag ng gastos', 'Amount (₱)': 'Halaga (₱)', 'Transport': 'Sasakyan', 'Commute budget': 'Budget sa biyahe',
  'Daily budget (₱)': 'Budget kada araw (₱)', 'Monthly budget (₱)': 'Budget kada buwan (₱)', 'Daily spending for the last 7 days': 'Gastos kada araw sa huling 7 araw',
  // advisories / notifications
  'Official sources are prioritised: DOTr, LTFRB, MMDA, LRTA, MRT-3, PAGASA, LGUs and operators. Each advisory shows its source and dates.': 'Inuuna ang mga opisyal na source: DOTr, LTFRB, MMDA, LRTA, MRT-3, PAGASA, LGU at mga operator. May source at petsa ang bawat abiso.',
  'Published': 'Nailathala', 'Updated': 'Na-update', 'Expires': 'Mag-e-expire', 'Info': 'Impormasyon', 'Warning': 'Babala', 'Critical': 'Kritikal',
  'No active advisories': 'Walang aktibong abiso', 'Notifications': 'Mga notification', 'No notifications': 'Walang notification',
  'Departure reminders, advisories for saved routes and report updates appear here.': 'Lalabas dito ang mga paalala sa pag-alis, abiso sa naka-save na ruta at update sa ulat.',
  'Notification settings': 'Settings ng notification', 'Mark all read': 'Markahang nabasa lahat',
  // profile / settings / privacy
  'Guest commuter': 'Guest na pasahero', 'Guest mode · data stays on this device': 'Guest mode · nasa device mo lang ang data', 'Sign out': 'Mag-sign out',
  'Your details': 'Iyong detalye', 'Daily budget ₱': 'Budget kada araw ₱', 'Monthly budget ₱': 'Budget kada buwan ₱', 'Save profile': 'I-save ang profile',
  'Home and work locations are managed in': 'Inaayos ang lokasyon ng bahay at trabaho sa', 'My Routes → Saved places': 'Aking Ruta → Mga naka-save na lugar',
  'My community reports': 'Aking mga ulat sa komunidad', 'No reports yet.': 'Wala pang ulat.', 'Settings & notifications': 'Settings at notification',
  'Privacy policy & terms': 'Privacy policy at terms', 'Export my data (JSON)': 'I-export ang aking data (JSON)', 'Delete my account & data': 'Burahin ang aking account at data',
  'Settings': 'Settings', 'Language / Wika': 'Wika / Language', 'Service advisories & interruptions': 'Mga abiso at aberya sa serbisyo', 'Saved-route updates': 'Update sa naka-save na ruta',
  'Departure & commute reminders': 'Paalala sa pag-alis at biyahe', 'Community report status': 'Status ng ulat sa komunidad', 'Device permission:': 'Pahintulot ng device:',
  'We keep notifications few and relevant. Background push requires Firebase Cloud Messaging on the server.': 'Kaunti at mahalaga lang ang mga notification. Kailangan ng Firebase Cloud Messaging sa server para sa background push.',
  'Default route preferences': 'Default na kagustuhan sa ruta', 'Avoid motorcycle taxis': 'Iwasan ang motorcycle taxi', 'Avoid jeepneys': 'Iwasan ang jeep', 'Avoid tricycles': 'Iwasan ang tricycle',
  'Public transport only': 'Pampublikong sasakyan lang', 'More options (walking distance, transfers, budget) are in the ⚙️ filter on the route results screen.': 'Nasa ⚙️ filter sa screen ng resulta ang iba pang opsyon (layo ng lakad, lipat, budget).',
  'Offline data': 'Offline na data', 'Last synced': 'Huling sync', 'Cached': 'Naka-cache', 'Dataset': 'Dataset', 'Sync now': 'I-sync ngayon', 'Clear cache': 'Burahin ang cache', 'Never': 'Hindi pa',
  'Cached data is used only when you\'re offline and is always labelled as cached.': 'Ginagamit lang ang naka-cache na data kapag offline ka, at laging may label.',
  'About': 'Tungkol', 'Admin portal': 'Admin portal', 'Privacy & Terms': 'Privacy at Terms',
  // report
  'Reports are reviewed by moderators before anything is marked verified. Thank you for helping fellow commuters!': 'Sinusuri ng mga moderator ang ulat bago markahang beripikado. Salamat sa pagtulong sa kapwa pasahero!',
  'Incorrect route details': 'Maling detalye ng ruta', 'Missing stop': 'Kulang na hintuan', 'Changed jeepney route / destination': 'Nagbagong ruta / destinasyon ng jeep',
  'Tricycle fare update': 'Update sa pamasahe ng tricycle', 'Road closure': 'Saradong kalsada', 'Long waiting time': 'Matagal na paghihintay', 'Service disruption': 'Aberya sa serbisyo',
  'Service not available': 'Walang serbisyo', 'Location name (optional)': 'Pangalan ng lugar (opsyonal)', 'Street, landmark or stop': 'Kalye, landmark o hintuan',
  '📍 Attach my GPS location': '📍 Ilakip ang aking GPS na lokasyon', 'Photo (optional)': 'Larawan (opsyonal)', 'Submit report': 'Ipadala ang ulat',
  // Ambag
  'Your level': 'Iyong level', 'points': 'puntos', 'Help verify near you': 'Tumulong mag-verify malapit sa iyo', 'Help verify': 'Tumulong mag-verify', '+1 pt each': '+1 pt bawat isa',
  '👍 Oo, tama': '👍 Oo, tama', '👎 Hindi': '👎 Hindi', 'Share what you know': 'Ibahagi ang alam mo', 'Jeep · UV · Tricycle · Taxi · Ride-hailing': 'Jeep · UV · Tricycle · Taxi · Ride-hailing',
  'Report a fare': 'Mag-ulat ng pamasahe', 'What you actually paid': 'Kung magkano talaga ang ibinayad mo', 'Waiting time': 'Oras ng paghihintay', 'How long until a ride came': 'Gaano katagal bago may dumating',
  'Record my ride': 'I-record ang biyahe ko', 'Map a route with GPS': 'Imapa ang ruta gamit ang GPS', 'Add a missing route': 'Magdagdag ng kulang na ruta',
  'A jeep/UV route we don’t have': 'Ruta ng jeep/UV na wala pa sa amin', 'Loading spot': 'Sakayan', 'Where rides reliably stop': 'Kung saan talagang humihinto ang sasakyan',
  'Route changed': 'Nagbago ang ruta', 'Rerouted or no longer passes': 'Nag-iba ng daan o hindi na dumadaan', 'Last trip time': 'Oras ng huling biyahe', 'When the last ride leaves': 'Kailan aalis ang huling biyahe',
  "Trains, terminal buses, P2P and ferries use official schedules, so they aren't crowdsourced.": 'Opisyal na iskedyul ang gamit ng tren, terminal bus, P2P at ferry, kaya hindi ito galing sa komunidad.',
  'Badges': 'Mga badge', 'My reports': 'Aking mga ulat', 'Your reports and their verification progress appear here.': 'Lalabas dito ang iyong mga ulat at ang progreso ng pag-verify.',
  'How verification works': 'Paano gumagana ang pag-verify', 'Nothing to verify nearby right now. Check back later!': 'Walang kailangang i-verify sa malapit ngayon. Bumalik mamaya!',
  '📍 Show reports near me': '📍 Ipakita ang mga ulat malapit sa akin', 'Unang Para': 'Unang Para', 'Made your first contribution': 'Naibigay ang unang ambag',
  'Fare Checker': 'Fare Checker', '10 fare reports verified': '10 ulat ng pamasahe ang na-verify', 'Route Mapper': 'Route Mapper', 'A recorded ride or new route got verified': 'Na-verify ang na-record mong biyahe o bagong ruta',
  'Validator': 'Validator', 'Confirmed 50 reports': 'Nakumpirma ang 50 ulat', 'Trike Expert': 'Trike Expert', '5 tricycle fares verified': '5 pamasahe sa tricycle ang na-verify',
  'Night Owl': 'Night Owl', '3 last-trip times verified': '3 oras ng huling biyahe ang na-verify', 'Trusted Rider': 'Mapagkakatiwalaang Pasahero', 'Reputation of 100+': 'Reputasyong 100 pataas',
  'Waiting for riders': 'Naghihintay sa mga pasahero', 'Disputed': 'Pinagtatalunan', 'Needs re-check': 'Kailangang suriin muli', 'Not accepted': 'Hindi tinanggap',
  "What's the correct fare?": 'Magkano ang tamang pamasahe?', 'Submit': 'Ipadala', 'Your correction becomes a new report for others to confirm.': 'Magiging bagong ulat ang iyong pagtatama para kumpirmahin ng iba.',
  'What did you ride?': 'Ano ang sinakyan mo?', 'Tricycle area': 'Lugar ng tricycle', 'Provider': 'Provider', 'Route not listed? Add it →': 'Wala ang ruta? Idagdag →',
  'Fare you paid (₱)': 'Ibinayad mo (₱)', 'Trip distance (km) – optional': 'Layo ng biyahe (km) – opsyonal', 'Trip distance (km)': 'Layo ng biyahe (km)', 'Trip duration (min) – optional': 'Tagal ng biyahe (min) – opsyonal',
  'I paid a discounted fare (student / senior / PWD)': 'May diskwento ang ibinayad ko (estudyante / senior / PWD)', 'Tip: a short ride (under 4 km) tells us the minimum fare.': 'Tip: ang maikling sakay (wala pang 4 km) ay nagsasabi ng minimum na pamasahe.',
  'Attach my approximate location (helps nearby riders verify)': 'Ilakip ang tantyang lokasyon ko (para makatulong sa pag-verify ng malalapit na pasahero)',
  'Reports are shown as “unverified” until other riders confirm them, and are never labelled official.': 'Ipinapakita ang ulat bilang “hindi pa beripikado” hanggang kumpirmahin ng ibang pasahero, at hindi kailanman tinatawag na opisyal.',
  'We record the time of day automatically – waits differ in rush hour.': 'Awtomatikong itinatala ang oras – iba ang hintay tuwing rush hour.',
  'Name of the spot': 'Pangalan ng lugar', 'What changed?': 'Ano ang nagbago?', 'Last trip leaves around': 'Aalis ang huling biyahe nang mga',
  'Which route are you on?': 'Anong ruta ang sinasakyan mo?', 'Not listed? Add a new route →': 'Wala sa listahan? Magdagdag ng bagong ruta →', 'Signboard text': 'Nakasulat sa karatula',
  'Starts at': 'Nagsisimula sa', 'Ends at': 'Nagtatapos sa', 'Terminal / landmark': 'Terminal / landmark', 'GPS points': 'GPS points', '● Start recording': '● Simulan ang pag-record',
  '■ Stop – I got off': '■ Itigil – bumaba na ako', 'Discard': 'Itapon', 'Share route': 'Ibahagi ang ruta',
  '🛰️ Ride the whole route with GPS on. We only record while you\'re on this screen, and we cut the first and last 300 m so your home or work isn\'t revealed.': '🛰️ Sakyan ang buong ruta nang naka-on ang GPS. Nagre-record lang kami habang nasa screen na ito, at tinatanggal namin ang unang at huling 300 m para hindi malaman ang bahay o trabaho mo.',
  'This week': 'Ngayong linggo', 'All time': 'Lahat ng panahon', 'Make or confirm a report to join the board.': 'Gumawa o kumpirmahin ang isang ulat para makasali sa board.',
  'Points come from reports and confirmations. Suspended accounts are hidden. Rewards like load credits may be offered through partners in future.': 'Galing sa mga ulat at kumpirmasyon ang puntos. Nakatago ang mga suspendidong account. Maaaring mag-alok ang mga partner ng gantimpala tulad ng load sa hinaharap.',
  '✋ Para anywhere along the route · Still accurate?': '✋ Puwedeng mag-para kahit saan sa ruta · Tama pa ba?', '₱ Report fare': '₱ Iulat ang pamasahe',
  // modes
  'Jeepney': 'Jeep', 'Bus': 'Bus', 'Train': 'Tren', 'UV Express': 'UV Express', 'Tricycle': 'Tricycle', 'Ferry': 'Ferry', 'Motorcycle taxi': 'Motorcycle taxi',
  'Ride-hailing car': 'Ride-hailing na kotse', 'Ride-hailing': 'Ride-hailing', 'Taxi': 'Taxi', 'Walk': 'Lakad', 'Motorcycle': 'Motorsiklo', 'Car (4-seater)': 'Kotse (4 na upuan)',
  // assistant
  'Type in English, Filipino or Taglish…': 'Mag-type sa English, Filipino o Taglish…',
  'Kumusta! Ask me how to get somewhere, which jeep to take, or how much a trip costs. I only answer from LUVYO route and fare data – if something is missing, I will say so.': 'Kumusta! Tanungin mo ako kung paano pumunta sa isang lugar, anong jeep ang sasakyan, o magkano ang pamasahe. Sumasagot lang ako mula sa datos ng ruta at pamasahe ng LUVYO – kung may kulang, sasabihin ko.',
  'From': 'Mula', 'To': 'Papunta', 'Current location': 'Kasalukuyang lokasyon', 'Fare calculator': 'Pamasahe calculator', 'Departure time': 'Oras ng pag-alis',
  'Minutes until a ride came:': 'Ilang minuto bago may dumating:', 'Minutes until pickup:': 'Ilang minuto bago ka nasundo:',
  'Using your location – tap the map to adjust.': 'Ginagamit ang lokasyon mo – i-tap ang mapa para ayusin.', 'Tap the map to place the spot.': 'I-tap ang mapa para ilagay ang lugar.',
  ', +20 more when other riders confirm it.': ', +20 pa kapag kinumpirma ng ibang pasahero.',
  'Every report needs agreement from other riders. Votes are weighted by reputation: new riders count ×0.6 until 3 of their reports are accepted, trusted riders up to ×2.5. A report becomes': 'Kailangang sang-ayunan ng ibang pasahero ang bawat ulat. Tinitimbang ang boto ayon sa reputasyon: ×0.6 ang bagong pasahero hanggang matanggap ang 3 nilang ulat, hanggang ×2.5 ang mapagkakatiwalaan. Nagiging',
  'with enough weighted agreement from at least 3 different riders (about 5 new riders or 3 trusted ones). Confidence fades over time, so fares and routes get re-checked. Disagreement marks a report': 'ang ulat kapag sapat ang pagsang-ayon ng hindi bababa sa 3 magkakaibang pasahero (mga 5 bago o 3 mapagkakatiwalaan). Humihina ang kumpiyansa sa paglipas ng panahon kaya sinusuri muli ang pamasahe at ruta. Kapag may hindi sumang-ayon, nagiging',
  'for moderators. Rider-verified data is never labelled “official”.': 'ito para sa mga moderator. Hindi kailanman tinatawag na “opisyal” ang datos na beripikado ng pasahero.',
  "Points: report +5–25, confirm +1, your report verified +20. Reputation rises when your reports and votes match what other riders find, and falls when they don't.": 'Puntos: ulat +5–25, kumpirma +1, na-verify ang ulat mo +20. Tumataas ang reputasyon kapag tugma ang ulat at boto mo sa nakikita ng ibang pasahero, at bumababa kapag hindi.',
  'Traffic: typical-speed model (not live)': 'Trapiko: karaniwang modelo ng bilis (hindi live)',
  'Live traffic unavailable – times use configured typical-speed profiles for this time of day. Distances: Approximate (straight-line × detour factor). Estimates are not guaranteed arrival times or final fares. Sponsored content never affects these rankings.': 'Walang live na trapiko – karaniwang bilis sa oras na ito ang gamit sa tantya. Layo: tantya lamang (tuwid na linya × detour factor). Hindi garantisado ang oras ng pagdating o huling pamasahe. Hindi kailanman naaapektuhan ng sponsored content ang ranking na ito.',
  'Development data – not for production. Verify every fare, route and schedule against official sources.': 'Development data – hindi para sa production. I-verify ang bawat pamasahe, ruta at iskedyul sa opisyal na source.',
  'LUVYO compares transport options using official, operator, administrator-verified, community and indicative data – each labelled.': 'Ikinukumpara ng LUVYO ang mga opsyon sa biyahe gamit ang opisyal, operator, beripikado ng admin, komunidad at tantyang datos – may label ang bawat isa.',
  "What's wrong or what changed? e.g. 'Jeep now turns at España instead of Lacson since Monday'": "Ano ang mali o nagbago? hal. 'Kumakanan na ang jeep sa España imbes na sa Lacson mula Lunes'",
  'e.g. Corner of Aurora & 15th Ave (in front of the bakery)': 'hal. Kanto ng Aurora at 15th Ave (tapat ng panaderya)',
  'e.g. Since Monday the jeep turns at Gilmore instead of going to Broadway.': 'hal. Mula Lunes, kumakaliwa na ang jeep sa Gilmore imbes na dumiretso sa Broadway.',
  'e.g. Cubao → Quiapo': 'hal. Cubao → Quiapo', 'e.g. PHILCOA – KATIPUNAN': 'hal. PHILCOA – KATIPUNAN',
  'What did you pay?': 'Magkano ang ibinayad mo?', 'Indicative estimate': 'Tantya', 'Verified by riders (community)': 'Beripikado ng pasahero (komunidad)',
  'Official published': 'Opisyal na nailathala', 'Administrator-verified': 'Beripikado ng admin', 'Community-submitted (unverified)': 'Mula sa komunidad (hindi pa beripikado)',
  'Demo build.': 'Demo build.', 'Runs on your phone with test data and simulated riders. Your reports stay on this device.': 'Tumatakbo sa iyong telepono gamit ang test data at simulated na mga pasahero. Nasa device mo lang ang iyong mga ulat.',
  'Demo: try verification': 'Demo: subukan ang pag-verify', 'Have demo riders confirm my reports': 'Ipakumpirma sa demo riders ang aking mga ulat',
  "In this demo you're the only real rider. Let the simulated riders confirm your open reports to see verification, points and reputation in action.": 'Sa demo na ito, ikaw lang ang totoong pasahero. Hayaang kumpirmahin ng simulated na mga pasahero ang iyong mga ulat para makita ang pag-verify, puntos at reputasyon.',
  // misc
  'Offline – showing cached data': 'Offline – naka-cache na data ang ipinapakita', 'Something went wrong': 'Nagkaproblema', 'Reload': 'I-reload',
  'Loading…': 'Naglo-load…', 'Comparing routes…': 'Ikinukumpara ang mga ruta…', 'Searching…': 'Naghahanap…', 'Checking routes…': 'Sinusuri ang mga ruta…',
  'Loading your contributions…': 'Nilo-load ang iyong mga ambag…', 'Comparing providers…': 'Ikinukumpara ang mga provider…',
  'Template text for development. Have it reviewed by counsel before publishing to Google Play.': 'Template na teksto para sa development. Ipasuri sa abogado bago i-publish sa Google Play.',
};

// --------------------------------------------------------- patterns ---
const nRiders = (n) => `${n} pasahero`;
const PATTERNS = [
  [/^(\d+) transfers?$/, (m) => `${m[1]} lipat`],
  [/^arrive (.+)$/, (m) => `darating ${m[1]}`],
  [/^wait (.+)$/, (m) => `hintay ${m[1]}`],
  [/^pickup (.+?)( \(typical\))?$/, (m) => `pickup ${m[1]}${m[2] ? ' (karaniwan)' : ''}`],
  [/^Pickup (.+) \(typical\)$/, (m) => `Pickup ${m[1]} (karaniwan)`],
  [/^ride · (.+)$/, (m) => `biyahe · ${m[1]}`],
  [/^Step (\d+) of (\d+)$/, (m) => `Hakbang ${m[1]} sa ${m[2]}`],
  [/^(\d+) agree$/, (m) => `${m[1]} sang-ayon`],
  [/^(\d+) agree · (\d+) disagree$/, (m) => `${m[1]} sang-ayon · ${m[2]} hindi`],
  [/^(.+) · (.+) away$/, (m) => `${m[1]} · ${m[2]} ang layo`],
  [/^Reputation (-?\d+)$/, (m) => `Reputasyon ${m[1]}`],
  [/^Vote weight (.+)$/, (m) => `Bigat ng boto ${m[1]}`],
  [/^(\d+) reports?$/, (m) => `${m[1]} ulat`],
  [/^(\d+) pts to (.+)$/, (m) => `${m[1]} pts pa bago maging ${m[2]}`],
  [/^points · #(\d+)$/, (m) => `puntos · #${m[1]}`],
  [/^You're (#\d+) (this week|this month|overall)\. Keep it up!$/, (m) => `Ikaw ay ${m[1]} ${{ 'this week': 'ngayong linggo', 'this month': 'ngayong buwan', overall: 'sa lahat' }[m[2]]}. Ituloy mo lang!`],
  [/^Last verified: Not verified$/, () => 'Huling na-verify: Hindi pa'],
  [/^Last verified: (.+)$/, (m) => `Huling na-verify: ${m[1]}`],
  [/^Depart (.+) · (\w+) fare$/, (m) => `Alis ${m[1]} · pamasaheng ${{ regular: 'regular', student: 'estudyante', senior: 'senior', pwd: 'PWD' }[m[2]] || m[2]}`],
  [/^Arrive by (.+) · (\w+) fare$/, (m) => `Darating bago ${m[1]} · pamasaheng ${m[2]}`],
  [/^Leaving now · (\w+) fare$/, (m) => `Aalis ngayon · pamasaheng ${m[1]}`],
  [/^(\d+) riders? · today$/, (m) => `${nRiders(m[1])} · ngayon`],
  [/^(\d+) riders? · (\d+)d ago$/, (m) => `${nRiders(m[1])} · ${m[2]} araw na`],
  [/^riders wait (.+)$/, (m) => `hintay ayon sa pasahero: ${m[1]}`],
  [/^(.+) \(typical, not live\)$/, (m) => `${m[1]} (karaniwan, hindi live)`],
  [/^every ~(.+) min \(typical\)$/, (m) => `bawat ~${m[1]} min (karaniwan)`],
  [/^₱(.+) minimum \((\d+) riders?\)$/, (m) => `₱${m[1]} minimum (${nRiders(m[2])})`],
  [/^(.+) min \((\d+) riders?\)$/, (m) => `${m[1]} min (${nRiders(m[2])})`],
  [/^around (.+) \((\d+) riders?\)$/, (m) => `mga ${m[1]} (${nRiders(m[2])})`],
  [/^(\d+) waiting for confirmation · (\d+) verified$/, (m) => `${m[1]} naghihintay ng kumpirmasyon · ${m[2]} beripikado`],
  [/^Landmarks along the route \((\d+)\)$/, (m) => `Mga palatandaan sa ruta (${m[1]})`],
  [/^Stops \((\d+)\)$/, (m) => `Mga hintuan (${m[1]})`],
  [/^Segment (\d+)$/, (m) => `Bahagi ${m[1]}`],
  [/^(\d+)\/(\d+) \(free plan\)$/, (m) => `${m[1]}/${m[2]} (libreng plan)`],
  [/^Open (.+)$/, (m) => `Buksan ang ${m[1]}`],
  [/^Near (.+)$/, (m) => `Malapit sa ${m[1]}`],
  [/^(.+) from you$/, (m) => `${m[1]} mula sa iyo`],
  [/^Notifications \((\d+) unread\)$/, (m) => `Mga notification (${m[1]} hindi pa nababasa)`],
  [/^Estimated total: (.+)$/, (m) => `Tantyang kabuuan: ${m[1]}`],
  [/^Signboard: (.+?) · (\d+) stops · (✓ verified|not yet verified)$/, (m) => `Karatula: ${m[1]} · ${m[2]} hintuan · ${m[3] === 'not yet verified' ? 'hindi pa beripikado' : '✓ beripikado'}`],
  [/^(\d+) stops · (✓ verified|not yet verified)$/, (m) => `${m[1]} hintuan · ${m[2] === 'not yet verified' ? 'hindi pa beripikado' : '✓ beripikado'}`],
  [/^Fare confirmed by (\d+) rider report\(s\)$/, (m) => `Kinumpirma ang pamasahe ng ${m[1]} ulat ng pasahero`],
  [/^Median of (\d+) rider-verified fare report\(s\)\. Local fares may vary\.$/, (m) => `Median ng ${m[1]} beripikadong ulat ng pasahero. Maaaring mag-iba ang lokal na pamasahe.`],
  [/^Minimum fare from (\d+) rider-verified report\(s\); per-km rate from (.+)\.$/, (m) => `Minimum na pamasahe mula sa ${m[1]} beripikadong ulat; per-km na singil mula sa ${m[2]}.`],
  [/^Calibrated from (\d+) rider-verified fares \(riders paid (\d+)% of the base estimate\)\. Final fare is set by the provider\.$/, (m) => `Inayos mula sa ${m[1]} beripikadong pamasahe (${m[2]}% ng base na tantya ang ibinayad). Ang provider ang magtatakda ng huling pamasahe.`],
  [/^Riders report the last (.+) trip leaves around (.+)\.$/, (m) => `Ayon sa mga pasahero, aalis ang huling biyahe ng ${m[1]} nang mga ${m[2]}.`],
  [/^Riders report \((\d+)\): (.+)$/, (m) => `Ulat ng ${nRiders(m[1])}: ${m[2]}`],
  [/^Riders report: (.+)$/, (m) => `Ulat ng mga pasahero: ${m[1]}`],
  [/^(\d+) rider\(s\) say the (.+) route may have changed\.$/, (m) => `${m[1]} pasahero ang nagsasabing baka nagbago ang ruta ng ${m[2]}.`],
  [/^Over your ₱(.+) budget\.$/, (m) => `Lampas sa iyong ₱${m[1]} na budget.`],
  [/^You've arrived at (.+)!$/, (m) => `Nakarating ka na sa ${m[1]}!`],
  [/^How much did you pay for the (.+)\?$/, (m) => `Magkano ang ibinayad mo sa ${m[1]}?`],
  [/^Was the (.+) route accurate\?$/, (m) => `Tama ba ang ruta ng ${m[1]}?`],
  [/^Is the fare ₱(\S+) for (.+?)(?: \(about (.+) km\))?\?$/, (m) => `₱${m[1]} ba ang pamasahe sa ${m[2]}${m[3] ? ` (mga ${m[3]} km)` : ''}?`],
  [/^Did you wait about (\d+) min for (.+)\?$/, (m) => `Naghintay ka ba nang mga ${m[1]} min para sa ${m[2]}?`],
  [/^Does the (.+) (jeepney|UV Express|tricycle) still pass near you\?$/, (m) => `Dumadaan pa ba malapit sa iyo ang ${m[2] === 'jeepney' ? 'jeep' : m[2]} na ${m[1]}?`],
  [/^Is the (.+) route still accurate\?$/, (m) => `Tama pa ba ang ruta ng ${m[1]}?`],
  [/^Does (.+) follow this path\?$/, (m) => `Dito ba dumadaan ang ${m[1]}?`],
  [/^Is there a (.+) with signboard “(.+)” between (.+) and (.+)\?$/, (m) => `May ${m[1] === 'jeepney' ? 'jeep' : m[1]} bang may karatulang “${m[2]}” sa pagitan ng ${m[3]} at ${m[4]}?`],
  [/^Do (.+) load passengers at (.+)\?$/, (m) => `Nagsasakay ba ang ${m[1]} sa ${m[2]}?`],
  [/^Is the last (.+) trip around (.+)\?$/, (m) => `Mga ${m[2]} ba ang huling biyahe ng ${m[1]}?`],
  [/^(.+): “(.+)” – is this true\?$/, (m) => `${m[1]}: “${m[2]}” – totoo ba ito?`],
  // directions from the routing engine
  [/^Lakad: walk about (.+) to the route near (.+)\.$/, (m) => `Lakad: maglakad nang mga ${m[1]} papunta sa ruta malapit sa ${m[2]}.`],
  [/^Lakad: walk about (.+) to (.+)\.$/, (m) => `Lakad: maglakad nang mga ${m[1]} papunta sa ${m[2]}.`],
  [/^Sakay: wait (near|at) (.+?) and flag down a (.+?)(?: with signboard “(.+)”)?\. Say “Para!” (near|at) (.+) \(≈(.+)\)\.$/, (m) =>
    `Sakay: maghintay ${m[1] === 'near' ? 'malapit sa' : 'sa'} ${m[2]} at pumara ng ${m[3] === 'jeepney' ? 'jeep' : m[3]}${m[4] ? ` na may karatulang “${m[4]}”` : ''}. Mag-“Para!” ${m[5] === 'near' ? 'malapit sa' : 'sa'} ${m[6]} (≈${m[7]}).`],
  [/^Sakay: board (.+) at (.+) station, ride (\d+) station\(s\), baba at (.+)\.$/, (m) => `Sakay: sumakay ng ${m[1]} sa ${m[2]} station, ${m[3]} istasyon, baba sa ${m[4]}.`],
  [/^Sakay: board the (.+?) (.+?)(?: \(signboard: “(.+)”\))? at (.+)\. Baba at (.+) \((\d+) stops?\)\.$/, (m) => `Sakay: sumakay ng ${m[1]} ${m[2]}${m[3] ? ` (karatula: “${m[3]}”)` : ''} sa ${m[4]}. Baba sa ${m[5]} (${m[6]} hintuan).`],
  [/^Book a motorcycle taxi from (.+) to (.+) \(≈(.+)\)\.$/, (m) => `Mag-book ng motorcycle taxi mula ${m[1]} papunta sa ${m[2]} (≈${m[3]}).`],
  [/^Sakay: take a tricycle from (.+) to (.+)\.$/, (m) => `Sakay: sumakay ng tricycle mula ${m[1]} papunta sa ${m[2]}.`],
  [/^Next: (.+)$/, (m) => `Susunod: ${translate(m[1])}`],
  [/^(.+) · Last verified: (.+)$/, (m) => `${translate(m[1])} · Huling na-verify: ${m[2] === 'Not verified' ? 'Hindi pa' : m[2]}`],
  [/^(\d+) stops · (\d+) routes · (\d+) fare schedules$/, (m) => `${m[1]} hintuan · ${m[2]} ruta · ${m[3]} iskedyul ng pamasahe`],
  [/^₱(.+) per passenger( · special trip ₱(.+))?$/, (m) => `₱${m[1]} bawat pasahero${m[2] ? ` · special trip ₱${m[3]}` : ''}`],
  [/^(.+) uses official operator data\. Community reports are for jeepneys, UV Express, tricycles, taxis and ride-hailing\.$/, (m) => `Opisyal na datos ng operator ang gamit ng ${m[1]}. Para sa jeep, UV Express, tricycle, taxi at ride-hailing ang mga ulat ng komunidad.`],
  [/^To arrive by (.+), leave around$/, (m) => `Para makarating bago ${m[1]}, umalis nang mga`],
];

// ------------------------------------------------------------ engine ---
// Terms inside longer engine-generated text (fare breakdowns, notes).
const FRAGMENTS = [
  [/Minimum fare \(first (\d+(?:\.\d+)?) km\)/g, 'Minimum na pamasahe (unang $1 km)'],
  [/(\d+) succeeding km/g, '$1 susunod na km'],
  [/Boarding ₱/g, 'Pagsakay ₱'], [/Fixed route fare/g, 'Nakapirming pamasahe sa ruta'], [/Station-to-station fare/g, 'Pamasahe mula istasyon hanggang istasyon'],
  [/Flag-down/g, 'Flag-down'], [/Travel time (\d+) min/g, 'Tagal ng biyahe $1 min'], [/Base fare/g, 'Base na pamasahe'], [/Distance ([\d.]+) km/g, 'Layo $1 km'],
  [/Range across (\d+) provider\(s\)/g, 'Saklaw ng $1 provider'], [/Zone fare \(per passenger\)/g, 'Pamasahe sa zone (bawat pasahero)'],
  [/(student|senior|pwd) discount (\d+)%/g, 'diskwentong $1 $2%'],
  [/Discount eligibility for (\w+) passengers is not confirmed for this service – regular fare shown\./g, 'Hindi kumpirmado kung may diskwento ang $1 sa serbisyong ito – regular na pamasahe ang ipinakita.'],
  [/Indicative estimate – final fare is determined by the (operator\/provider|provider)\./g, 'Tantya lamang – ang operator/provider ang magtatakda ng huling pamasahe.'],
  [/Fare is negotiated locally – no verified amount/g, 'Pinag-uusapan ang pamasahe – walang beripikadong halaga'],
  [/No fare schedule configured for this service/g, 'Walang naka-configure na pamasahe para sa serbisyong ito'],
];

function translate(text) {
  let core = text.trim();
  if (!core) return text;
  // keep a trailing " ·" / ":" separator (labels followed by bold text)
  const sm = core.match(/^(.*?)(\s*[·:])$/s);
  const suffix = sm && sm[1] && !PHRASES[core] ? sm[2] : '';
  if (suffix) core = sm[1];
  // keep leading emoji/symbols and surrounding whitespace
  // (ℹ counts as a letter in Unicode, and "₱ " before a word is an icon, not a price)
  const m = core.match(/^((?:ℹ\uFE0F?|₱(?=\s)|[^\p{L}\p{N}₱"“(,.])*)([\s\S]*?)$/u);
  const prefix = m ? m[1] : '';
  const body = m ? m[2] : core;
  let out = PHRASES[core] ?? (prefix ? (PHRASES[body] != null ? prefix + PHRASES[body] : null) : null);
  if (out == null) {
    for (const [re, fn] of PATTERNS) {
      const mm = body.match(re);
      if (mm) { out = prefix + fn(mm); break; }
    }
  }
  if (out == null) {
    let f = core;
    for (const [re, rep] of FRAGMENTS) f = f.replace(re, rep);
    if (f === core) return text;
    out = f;
  }
  return text.replace(core + suffix, out + suffix);
}

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = 'script,style,.leaflet-control-attribution,[data-no-translate],input,textarea';
function translateTree(root) {
  if (root.nodeType === 3) { const v = translate(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    if (n.parentElement?.closest(SKIP)) continue;
    const v = translate(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  const els = [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')];
  for (const el of els) for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const tv = translate(v); if (tv !== v) el.setAttribute(a, tv); } }
}

let observer = null;
/** Apply the selected language to the document (call on boot and whenever the language changes). */
export function applyLanguage() {
  const l = lang();
  document.documentElement.lang = l === 'fil' ? 'fil' : 'en';
  observer?.disconnect(); observer = null;
  if (l !== 'fil') return;
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTree(m.target);
      else m.addedNodes.forEach((n) => translateTree(n));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

/** Switch language and re-render the current screen. */
export function setLanguage(code, rerender) {
  store.set((s) => ({ profile: { ...s.profile, language: code === 'fil' ? 'fil' : 'en' } }));
  applyLanguage();
  rerender?.();
}

export function languageSwitch() {
  const l = lang();
  return `<div class="lang-switch" role="group" aria-label="Language / Wika">${LANGUAGES.map(([c, n]) => `<button type="button" class="chip" data-lang="${c}" aria-pressed="${c === l}" data-no-translate>${n}</button>`).join('')}</div>`;
}

export { translate as _translate };
