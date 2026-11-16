// User-controlled location access. Nothing is collected in the background;
// a position is requested only when the user taps a location action.
let last = null;

export function lastKnown() { return last; }

export function currentPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) => { last = { name: 'Current location', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }; resolve(last); },
      (e) => reject(new Error(e.code === 1 ? 'Location permission denied. You can search for a place instead.' : 'Could not get your location. Try again or search for a place.')),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

export function inPhilippines(p) {
  return p && p.lat > 4 && p.lat < 22 && p.lng > 115 && p.lng < 128;
}
