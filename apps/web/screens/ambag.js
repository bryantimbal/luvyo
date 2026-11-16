// "Ambag" (contribute) hub: your level, help-verify cards, quick contributions,
// leaderboard preview and badges.
import { community, TYPE_INFO, STATUS } from '../lib/community.js';
import { store } from '../lib/store.js';
import { header, esc, toast, km, modeIcon, loading, sheet, $ } from '../lib/ui.js';
import { lastKnown, currentPosition } from '../lib/location.js';
import { createMap, fit } from '../lib/map.js';

export default async function ambag(el, { go, refresh }) {
  el.innerHTML = header('Ambag', { back: false, right: '<a class="icon-btn" href="#/leaderboard" aria-label="Leaderboard">🏆</a>' }) + loading('Loading your contributions…');
  let me, feed = [];
  const here = lastKnown();
  try { [me, feed] = await Promise.all([community.me(), community.verifyFeed(here).catch(() => [])]); }
  catch (e) {
    el.innerHTML = header('Ambag', { back: false }) + `<div class="pad">${e.status === 401 ? '<div class="card stack"><h2>Sign in to contribute</h2><p class="muted">Contributions need an account so other riders can trust them.</p><a class="btn" href="#/login">Sign in</a></div>' : `<p class="muted">${esc(e.message)} – contributions need a connection. Reports you make offline will be sent later.</p>`}</div>`;
    return;
  }
  const lv = me.level;
  const earned = me.badges.filter((b) => b.earned);
  const pend = community.pending();

  el.innerHTML = `${header('Ambag', { back: false, right: '<a class="icon-btn" href="#/leaderboard" aria-label="Leaderboard">🏆</a>' })}
  <div class="pad stack">
    <div class="level-card">
      <div class="row between"><div><div class="small" style="opacity:.85">Your level</div><div class="level-name">${lv.icon} ${esc(lv.name)}</div></div>
        <div style="text-align:right"><div class="big">${me.points}</div><div class="small" style="opacity:.85">points${me.rank ? ` · #${me.rank}` : ''}</div></div></div>
      <div class="xp"><div style="width:${Math.round(lv.progress * 100)}%"></div></div>
      <div class="small" style="opacity:.9">${lv.next ? `${lv.next.min - me.points} pts to ${lv.next.icon} ${esc(lv.next.name)}` : 'Top level – salamat, Hari ng Kalsada!'}</div>
      <div class="row small" style="margin-top:8px;gap:14px;opacity:.95"><span>🛡️ Reputation ${me.reputation}</span><span>⚖️ Vote weight ×${me.weight.toFixed(2)}</span><span>📝 ${me.stats.submitted} reports</span></div>
    </div>
    ${pend ? `<div class="banner warn" style="margin:0">📤 ${pend} report(s) saved offline – they'll send when you're connected.</div>` : ''}

    <section>
      <div class="section-title"><h2>Help verify ${here ? 'near you' : ''}</h2><span class="muted small">+1 pt each</span></div>
      ${!here ? '<button class="btn soft block" data-locate>📍 Show reports near me</button>' : ''}
      <div id="feed">${feed.length ? feed.slice(0, 6).map(card).join('') : '<p class="muted small">Nothing to verify nearby right now. Check back later!</p>'}</div>
    </section>

    <section>
      <div class="section-title"><h2>Share what you know</h2><span class="muted small">Jeep · UV · Tricycle · Taxi · Ride-hailing</span></div>
      <div class="contrib-grid">${Object.entries(TYPE_INFO).map(([k, t]) => `<a href="#/${k === 'route_trace' || k === 'new_route' ? 'record?type=' + k : 'contribute/' + k}"><span class="ci">${t.icon}</span><b>${t.title}</b><span class="muted small">${t.desc}</span><span class="pts">+${t.pts}</span></a>`).join('')}</div>
      <p class="muted small">Trains, terminal buses, P2P and ferries use official schedules, so they aren't crowdsourced.</p>
    </section>

    <section>
      <div class="section-title"><h2>Badges</h2><span class="muted small">${earned.length}/${me.badges.length}</span></div>
      <div class="badges">${me.badges.map((b) => `<div class="badge-tile ${b.earned ? '' : 'locked'}" title="${esc(b.desc)}"><span>${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
    </section>

    <section>
      <div class="section-title"><h2>My reports</h2></div>
      ${me.contributions.length ? `<ul class="list">${me.contributions.slice(0, 10).map((c) => `<li class="item"><span class="ic">${TYPE_INFO[c.type]?.icon || '•'}</span><span class="grow"><div class="small">${esc(c.question)}</div>
        <div class="muted small">${STATUS[c.status]?.[0] || ''} ${STATUS[c.status]?.[1] || c.status} · ${c.agreeing} agree${c.disagreeing ? ` · ${c.disagreeing} disagree` : ''}</div>
        <div class="conf"><div style="width:${Math.round(c.confidence * 100)}%"></div></div></span></li>`).join('')}</ul>`
        : '<p class="muted small">Your reports and their verification progress appear here.</p>'}
    </section>
    <details class="card small"><summary>How verification works</summary>
      <p>Every report needs agreement from other riders. Votes are weighted by reputation: new riders count ×0.6 until 3 of their reports are accepted, trusted riders up to ×2.5. A report becomes <b>Rider-verified</b> with enough weighted agreement from at least 3 different riders (about 5 new riders or 3 trusted ones). Confidence fades over time, so fares and routes get re-checked. Disagreement marks a report <b>Disputed</b> for moderators. Rider-verified data is never labelled “official”.</p>
      <p>Points: report +${me.pointsRules.fare}–${me.pointsRules.new_route}, confirm +1, your report verified +20. Reputation rises when your reports and votes match what other riders find, and falls when they don't.</p>
    </details>
  </div>`;

  // mini maps for route traces
  const maps = [];
  for (const it of feed.slice(0, 6)) if (it.points) {
    const m = createMap(el.querySelector(`[data-map="${CSS.escape(it.id)}"]`), { zoom: 14 });
    if (m) { window.L.polyline(it.points, { color: '#B45309', weight: 5 }).addTo(m); fit(m, it.points); maps.push(m); }
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-locate]')) { try { await currentPosition(); refresh(); } catch (err) { toast(err.message, 'error'); } }
    const v = e.target.closest('[data-vote]');
    if (!v) return;
    const [id, ans] = v.dataset.vote.split('|');
    const item = feed.find((x) => x.id === id);
    if (ans === 'no' && item?.allowValue) return askCorrection(item, refresh);
    v.closest('.verify').classList.add('done');
    try {
      const r = await community.confirm(id, { agree: ans === 'yes', ...(lastKnown() || {}) });
      toast(r.queued ? 'Saved – will send when online' : `+${r.pointsEarned} pt${r.status === 'community_verified' ? ' · now Rider-verified!' : ''}`, 'success');
      setTimeout(refresh, 700);
    } catch (err) { toast(err.message, 'error'); v.closest('.verify').classList.remove('done'); }
  });
  return () => maps.forEach((m) => m.remove());
}

const MODE_NAME = { jeepney: 'Jeepney', uv: 'UV Express', tricycle: 'Tricycle', mc_taxi: 'Motorcycle taxi', ridehail_car: 'Ride-hailing', taxi: 'Taxi' };
function card(it) {
  return `<div class="card verify">
    <div class="row between small muted"><span>${modeIcon(it.modeId)} ${esc(it.lineCode || MODE_NAME[it.modeId] || '')} ${it.km != null ? '· ' + km(it.km) + ' away' : ''}</span><span>${STATUS[it.status]?.[0] || ''} ${it.agreeing} agree${it.disagreeing ? ` · ${it.disagreeing} disagree` : ''}</span></div>
    <div class="q">${esc(it.question)}</div>
    ${it.points ? `<div class="map" style="height:130px" data-map="${esc(it.id)}"></div>` : ''}
    <div class="row"><button class="btn sm grow" data-vote="${esc(it.id)}|yes">👍 Oo, tama</button><button class="btn sm ghost grow" data-vote="${esc(it.id)}|no">👎 Hindi</button></div>
  </div>`;
}

function askCorrection(item, refresh) {
  sheet(`<h2>What's the correct fare?</h2><p class="muted small">${esc(item.question)}</p>
    <input class="input" id="v" type="number" min="1" step="0.25" inputmode="decimal" placeholder="₱ amount you paid (optional)">
    <div class="row" style="margin-top:12px"><button class="btn grow" id="ok">Submit</button></div>
    <p class="muted small">Your correction becomes a new report for others to confirm.</p>`, {
    onMount(sh, close) {
      sh.querySelector('#ok').onclick = async () => {
        const v = +sh.querySelector('#v').value;
        try {
          const r = await community.confirm(item.id, { agree: false, value: v > 0 ? v : undefined, ...(lastKnown() || {}) });
          close(); toast(`+${r.pointsEarned || 1} pts · thanks for the correction`, 'success'); refresh();
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}
