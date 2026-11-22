import { $, fmt, rafs } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { awardFor, praiseFor, resultOf, shareText, statText } from './scoring.js';
import { G } from './state.js';
import { loadBest, store } from './storage.js';

// The results card (#mWin): shown after a board is finished, or via the Results button when a
// finished board is opened again (each board is played once, so that's the same result).
// The headline is the result: Perfect!, Solved with N Hints, or Loser. Under it: a line of praise,
// a badge if one fits, the level's best time, and the stats (time, hints, mistakes, pops).

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

// The headline and the line of praise under it.
function headline(rec) {
  const res = resultOf(rec);
  $('#winTitle').textContent = res.title;
  $('#winTitle').className = 'big ' + res.kind;
  $('#compliment').textContent = praiseFor(rec);
  return res;
}

// The Share result button: copies shareText(rec), and shows it in case copying isn't allowed.
function shareButton(rec) {
  const txt = shareText(rec),
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

// Fill in the results card for a finished board. rec: a just-finished run or a saved record
// ({time, misses, pops, hints, best, trail} for a solve, {revealed: true} if the solution was viewed).
export function showResults(rec) {
  const res = headline(rec);
  const aw = res.kind === 'loser' ? null : awardFor(rec),
    box = $('#award');
  box.style.display = aw ? '' : 'none';
  if (aw) box.innerHTML = `<span class="em">${aw[0]}</span><span>${aw[1]}<small>${aw[2]}</small></span>`;
  const g = $('#statgrid');
  if (res.kind === 'loser') g.innerHTML = '';
  else {
    const items = [
      ['⏱', 'Time', rec.time || 0, (v) => fmt(v)],
      ['💡', 'Hints', rec.hints || 0, (v) => Math.round(v)],
      ['❌', 'Mistakes', rec.misses || 0, (v) => Math.round(v)],
      ['🫧', 'Popped', rec.pops || 0, (v) => Math.round(v)],
    ];
    g.innerHTML = items
      .map(
        ([ic, lbl], k) =>
          `<div class="stat" style="animation-delay:${200 + k * 70}ms"><span class="ico">${ic}</span><b>0</b><span>${lbl}</span></div>`,
      )
      .join('');
    [...g.querySelectorAll('.stat b')].forEach((el, k) =>
      countUp(el, items[k][2], items[k][3], 250 + k * 70),
    );
  }
  $('#diag').textContent = statText(G.P);
  shareButton(rec);
  return res;
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

// Show the saved result for the current board (the Results button on a finished board).
export function openResults() {
  const rec = store[G.cur];
  if (!rec) return;
  showResults(rec);
  showBestTime(G.level);
  $('#mWin').classList.add('open');
}
