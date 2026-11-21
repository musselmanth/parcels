import { $, fmt, rafs } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { COMPLIMENTS, LEVEL_EMOJI, awardFor, scoreFor, shareText, starsFor, statText } from './scoring.js';
import { G } from './state.js';
import { CAT, loadBest, store } from './storage.js';

// The results card (#mWin): shown after a win, or via the Results button on a finished board.

// Animate a number from 0 up to `to`, formatting each step with fmtFn.
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
// Fill in the results card for a run {time, misses, pops, hints, best, trail}. note is extra text for the
// breakdown line. Returns {score, stars}.
export function showResults(r, note) {
  const sc = scoreFor(r.hints || 0, r.misses, r.pops),
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
    `Hints <b>${sc.hint}</b> · Accuracy <b>${sc.acc}</b> · Tidiness <b>${sc.tidy}</b>` +
    (note ? ` · ${note}` : '');
  const aw = awardFor(r),
    box = $('#award');
  box.style.display = aw ? '' : 'none';
  if (aw) box.innerHTML = `<span class="em">${aw[0]}</span><span>${aw[1]}<small>${aw[2]}</small></span>`;
  const items = [
    ['⏱', 'Time', r.time, (v) => fmt(v)],
    ['💡', 'Hints', r.hints || 0, (v) => Math.round(v)],
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
// The best-time line on the results card. outcome (after a win): {kind: 'new', time, was} when this
// solve set a new best for the level, {kind: 'hinted'} when it used hints (those don't count).
// Without an outcome it just shows the level's current best.
export function showBestTime(level, outcome = null) {
  const el = $('#bestTime'),
    name = CATS[level].name,
    best = loadBest(level);
  let html = '';
  if (outcome && outcome.kind === 'new')
    html =
      `🏁 New ${name} best time! <b>${fmt(outcome.time)}</b>` +
      (outcome.was != null ? ` <small>(was ${fmt(outcome.was)})</small>` : '');
  else if (outcome && outcome.kind === 'hinted')
    html = best
      ? `${name} best time <b>${fmt(best.time)}</b> <small>· only solves without hints count</small>`
      : `<small>Solve one without hints to set ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} best time</small>`;
  else if (best) html = `${name} best time <b>${fmt(best.time)}</b>`;
  el.className = 'besttime' + (outcome && outcome.kind === 'new' ? ' new' : '');
  el.innerHTML = html;
  el.style.display = html ? '' : 'none';
}
// "Results" on a solved board: the best run saved for it
// Results card for a board whose solution was viewed.
function showLoser() {
  $('#winTitle').textContent = 'Peeked!';
  showBestTime(G.level);
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
// Show the saved result for the current board.
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
      hints: rec.hints || 0,
      trail: rec.trail || [],
    },
    '',
  );
  showBestTime(G.level);
  $('#mWin').classList.add('open');
}
