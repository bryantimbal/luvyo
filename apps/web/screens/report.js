import { api } from '../lib/api.js';
import { store } from '../lib/store.js';
import { header, esc, toast, $ } from '../lib/ui.js';
import { currentPosition } from '../lib/location.js';

const CATS = [
  ['incorrect_route', 'Incorrect route details'], ['missing_stop', 'Missing stop'], ['route_change', 'Changed jeepney route / destination'],
  ['tricycle_fare', 'Tricycle fare update'], ['road_closure', 'Road closure'], ['long_wait', 'Long waiting time'],
  ['disruption', 'Service disruption'], ['unavailable_service', 'Service not available'], ['other', 'Other'],
];

async function compress(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: img.width * scale, height: img.height * scale });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export default function report(el, { query }) {
  let loc = null, photo = null;
  el.innerHTML = `${header('Report an issue')}
  <form class="pad stack" id="f">
    <p class="muted small">Reports are reviewed by moderators before anything is marked verified. Thank you for helping fellow commuters!</p>
    <div><label class="f" for="cat">Category</label><select class="input" id="cat" required>${CATS.map(([v, l]) => `<option value="${v}" ${query.category === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label class="f" for="desc">Description</label><textarea class="input" id="desc" rows="4" minlength="10" maxlength="2000" required placeholder="What's wrong or what changed? e.g. 'Jeep now turns at España instead of Lacson since Monday'"></textarea></div>
    <div><label class="f" for="where">Location name (optional)</label><input class="input" id="where" maxlength="200" placeholder="Street, landmark or stop"></div>
    <div class="row"><button type="button" class="btn sm soft" data-gps>📍 Attach my GPS location</button><span id="gps" class="muted small"></span></div>
    <div><label class="f" for="photo">Photo (optional)</label><input class="input" id="photo" type="file" accept="image/*" capture="environment"></div>
    ${query.lineId ? `<p class="small">Related route: <b>${esc(query.lineId)}</b></p>` : ''}
    <button class="btn block" id="submit">Submit report</button>
  </form>`;
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-gps]')) {
      try { loc = await currentPosition(); $('#gps', el).textContent = `Attached (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`; } catch (err) { toast(err.message, 'error'); }
    }
  });
  el.addEventListener('change', async (e) => {
    if (e.target.id === 'photo' && e.target.files[0]) { try { photo = await compress(e.target.files[0]); } catch { toast('Could not read that image', 'error'); } }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submit', el); btn.disabled = true;
    try {
      const r = await api.report({
        category: $('#cat', el).value, description: $('#desc', el).value.trim(), locationName: $('#where', el).value.trim() || null,
        lat: loc?.lat, lng: loc?.lng, lineId: query.lineId || query.zone || null, photo, reporterId: store.get().deviceId,
      });
      toast(`Report submitted – status: ${r.status}`, 'success');
      history.back();
    } catch (err) { toast(err.message.includes('fetch') ? 'You are offline – please submit when connected.' : err.message, 'error'); btn.disabled = false; }
  });
}
