import { $, fmt, rafs } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import {
  COMPLIMENTS,
  LEVEL_EMOJI,
  awardFor,
  parFor,
  scoreFor,
  shareText,
  starsFor,
  statText,
} from './scoring.js';
import { G } from './state.js';
import { CAT, store } from './storage.js';

function countUp(el, to, fmtFn, delay) {
  const t0 = performance.now() + delay,
    D = 700;
  const f = (now) => {
    const p = Math.max(0, Math.min(1, (now - t0) / D)),
      e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtFn(to * e);
    if (p < 1) rafs.push(requestAnimationFrame(f));
  };
  rafs.push(requestAnimationFrame(f));
}
export function showResults(r, note) {
  const par = parFor(G.P),
    sc = scoreFor(r.time, par, r.misses, r.pops),
    stars = starsFor(sc.total);
  $('#stars').innerHTML = [0, 1, 2, 3, 4]
    .map(
      (k) =>
        `<i class="${k < stars ? '' : 'off'}" style="animation-delay:${300 + k * 120}ms">${stars === 5 ? '🌟' : '⭐'}</i>`,
    )
    .join('');
  const sEl = $('#score');
  sEl.textContent = '0';
  countUp(sEl, sc.total, (v) => Math.round(v), 250);
  const pool = COMPLIMENTS[CAT][stars];
  $('#compliment').textContent = pool[G.cur % pool.length];
  $('#breakdown').innerHTML =
    `Speed <b>${sc.speed}</b> · Accuracy <b>${sc.acc}</b> · Tidiness <b>${sc.tidy}</b>` +
    (note ? ` · ${note}` : '');
  const aw = awardFor(r, par),
    box = $('#award');
  box.style.display = aw ? '' : 'none';
  if (aw) box.innerHTML = `<span class="em">${aw[0]}</span><span>${aw[1]}<small>${aw[2]}</small></span>`;
  const items = [
    ['⏱', `Par ${fmt(par)}`, r.time, (v) => fmt(v)],
    ['❌', 'Mistakes', r.misses, (v) => Math.round(v)],
    ['🫧', 'Popped', r.pops, (v) => Math.round(v)],
  ];
  const g = $('#statgrid');
  g.innerHTML = items
    .map(
      ([ic, lbl], k) =>
        `<div class="stat" style="animation-delay:${200 + k * 70}ms"><span class="ico">${ic}</span><b>0</b><span>${lbl}</span></div>`,
    )
    .join('');
  [...g.querySelectorAll('.stat b')].forEach((el, k) => countUp(el, items[k][2], items[k][3], 250 + k * 70));
  $('#diag').textContent = statText(G.P);
  const txt = shareText(r, sc, stars),
    sb = $('#shareBox');
  sb.textContent = txt;
  sb.style.display = 'none';
  $('#bShare').textContent = 'Share result';
  $('#bShare').onclick = async () => {
    sb.style.display = 'block';
    try {
      await navigator.clipboard.writeText(txt);
      $('#bShare').textContent = 'Copied! Paste anywhere';
    } catch (e) {
      $('#bShare').textContent = 'Select the text below to copy';
    }
    setTimeout(() => ($('#bShare').textContent = 'Share result'), 2400);
  };
  return { score: sc.total, stars };
}
// "Results" on a solved board: the best run saved for it
function showLoser() {
  $('#winTitle').textContent = 'Peeked!';
  $('#stars').innerHTML = [0, 1, 2, 3, 4]
    .map((k) => `<i class="off" style="animation-delay:${300 + k * 120}ms">⭐</i>`)
    .join('');
  $('#score').textContent = '0';
  $('#compliment').textContent = [
    'No points for peeking. The next one’s yours.',
    'Peeked! It happens to the best of us.',
    'Sometimes you just need to see it. Onward!',
  ][G.cur % 3];
  $('#breakdown').textContent = 'Solution viewed · no points';
  const box = $('#award');
  box.style.display = '';
  box.innerHTML = '<span class="em">🫠</span><span>Loser<small>Looked at the solution</small></span>';
  $('#statgrid').innerHTML = '';
  $('#diag').textContent = statText(G.P);
  const txt = `Parcels ${LEVEL_EMOJI[CAT]} ${CATS[CAT].name} #${G.cur}\n☆☆☆☆☆  0\n🫠 Peeked at the solution`,
    sb = $('#shareBox');
  sb.textContent = txt;
  sb.style.display = 'none';
  $('#bShare').textContent = 'Share result';
  $('#bShare').onclick = async () => {
    sb.style.display = 'block';
    try {
      await navigator.clipboard.writeText(txt);
      $('#bShare').textContent = 'Copied! Paste anywhere';
    } catch (e) {
      $('#bShare').textContent = 'Select the text below to copy';
    }
    setTimeout(() => ($('#bShare').textContent = 'Share result'), 2400);
  };
}
export function openResults() {
  const rec = store[G.cur];
  if (!rec) return;
  if (rec.revealed) {
    showLoser();
    $('#mWin').classList.add('open');
    return;
  }
  $('#winTitle').textContent = 'Best result';
  showResults(
    {
      time: rec.time,
      misses: rec.misses || 0,
      pops: rec.pops || 0,
      best: rec.best || 0,
      trail: rec.trail || [],
    },
    '',
  );
  $('#mWin').classList.add('open');
}
