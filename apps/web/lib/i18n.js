import { store } from './store.js';

const dict = {
  en: {
    home: 'Home', explore: 'Explore', myRoutes: 'My Routes', commute: 'Commute', profile: 'Profile',
    greeting: 'Saan tayo ngayon?', from: 'From', to: 'To', searchJourney: 'Find routes', leaveNow: 'Leave now', departAt: 'Depart at', arriveBy: 'Arrive by',
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

export const t = (k) => dict[store.get().profile.language]?.[k] ?? dict.en[k] ?? k;
