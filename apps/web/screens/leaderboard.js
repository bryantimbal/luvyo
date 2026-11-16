import { community } from '../lib/community.js';
import { header, esc, loading, empty } from '../lib/ui.js';

export default async function leaderboard(el, { query, refresh, go }) {
  const period = ['week', 'month', 'all'].includes(query.p) ? query.p : 'week';
  el.innerHTML = header('Top contributors') + loading();
  let data;
  try { data = await community.leaderboard(period); } catch (e) { el.innerHTML = header('Top contributors') + empty('🏆', 'Leaderboard unavailable', e.message); return; }
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
  el.innerHTML = `${header('Top contributors')}
  <div class="pad stack">
    <div class="chips" role="group">${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, l]) => `<a class="chip" href="#/leaderboard?p=${k}" aria-pressed="${k === period}">${l}</a>`).join('')}</div>
    ${data.myRank ? `<div class="banner info" style="margin:0">You're <b>#${data.myRank}</b> ${period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'overall'}. Keep it up!</div>` : '<div class="banner info" style="margin:0">Make or confirm a report to join the board.</div>'}
    ${data.rows.length ? `<ol class="list lb">${data.rows.map((r) => `<li class="item ${r.isMe ? 'me' : ''}"><span class="lb-rank">${medal(r.rank)}</span><span class="grow"><b>${esc(r.displayName)}${r.isMe ? ' (you)' : ''}</b><div class="muted small">${r.levelIcon} ${esc(r.level)} · rep ${r.reputation}</div></span><b>${r.points} pts</b></li>`).join('')}</ol>`
      : empty('🏆', 'No contributions yet this period', 'Be the first – report a fare or confirm one nearby.', '<a class="btn" href="#/ambag">Contribute</a>')}
    <p class="muted small">Points come from reports and confirmations. Suspended accounts are hidden. Rewards like load credits may be offered through partners in future.</p>
  </div>`;
}
