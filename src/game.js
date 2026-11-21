import { freeColor } from './actions.js';
import { celebrate } from './celebrate.js';
import { $, board, clearFx, fmt, later } from './core/dom.js';
import { GROUPS, N } from './core/hex.js';
import { CATS } from './data/puzzles.js';
import { clearParticles } from './fx.js';
import { closeAll } from './menu.js';
import { loadShape, render, setMsg } from './render.js';
import { openResults, showResults } from './results.js';
import { newStats } from './scoring.js';
import { G } from './state.js';
import { CAT, PUZZLES, save, store } from './storage.js';

// Board lifecycle: opening a board, finishing it (win or reveal), and the Start over / Solution buttons.

// Opening a board you've already finished shows its solution. Finished boards can't be replayed.
export function openPuzzle(n, fresh = false) {
  clearFx();
  closeAll();
  clearParticles();
  G.cur = n;
  const raw = PUZZLES[n - 1];
  loadShape(raw);
  G.P = {
    ...raw,
    tiles: [...Array(N)].map((_, i) => ({ s: +raw.t[3 * i], c: +raw.t[3 * i + 1], n: +raw.t[3 * i + 2] })),
    solution: raw.sol,
  };
  G.groups = {};
  G.pairs = [];
  G.nextId = 0;
  G.sel = [];
  G.misses = 0;
  G.st = newStats();
  G.startT = null;
  G.endT = null;
  G.done = false;
  G.busy = false;
  G.revealed = false;
  G.celebrating = false;
  board.classList.remove('dancing');
  $('#pzNum').textContent = ` ${CATS[CAT].name} #${n}` + (store[n] ? (store[n].revealed ? ' 🫠' : ' ✓') : '');
  $('#bPrev').disabled = n <= 1;
  $('#bNext').disabled = n >= PUZZLES.length;
  $('#ofN').textContent = '/' + GROUPS;
  $('#timer').textContent = '0:00';
  setMsg('');
  setReset(false);
  if (!fresh && store[n]) showFinished(store[n]);
  else render();
}
// Finished boards (solved or peeked) are final: Start over disappears and Solution becomes Results.
export function setReset(finished) {
  $('#bReset').style.display = finished ? 'none' : '';
  const r = $('#bReveal');
  r.textContent = finished ? 'Results' : 'Solution';
  r.classList.toggle('primary', finished);
  r.disabled = G.celebrating;
}
// Show a finished board as solved (its saved best result), or as revealed.
function showFinished(rec) {
  G.done = true;
  G.revealed = !!rec.revealed;
  G.P.solution.forEach((cells) => {
    const id = G.nextId++;
    G.groups[id] = { id, cells, color: 0, pinned: false, fresh: false };
    G.groups[id].color = freeColor(cells);
  });
  if (!G.revealed) {
    G.misses = rec.misses || 0;
    $('#timer').textContent = fmt(rec.time);
  }
  render();
  setReset(true);
  if (G.revealed) $('#timer').textContent = '—';
  setMsg(
    G.revealed
      ? 'You viewed the solution for this one. 0 points.'
      : `Best: ${rec.score != null ? rec.score + ' points · ' : ''}${fmt(rec.time)}, ${rec.misses || 0} mistake${rec.misses === 1 ? '' : 's'}.`,
    'ok',
    true,
  );
}

// The last parcel was placed: show results, save if it beats the best, then celebrate().
export function win() {
  G.done = true;
  G.endT = Date.now();
  const time = G.endT - (G.startT || G.endT);
  const prev = store[G.cur];
  $('#timer').textContent = fmt(time);
  const run = { time, misses: G.misses, pops: G.st.pops, best: G.st.best, trail: G.st.trail.slice() };
  $('#winTitle').textContent = 'Solved!';
  const res = showResults(run, '');
  const better = !prev || prev.revealed || res.score > (prev.score ?? -1);
  if (prev && !prev.revealed && better) $('#breakdown').innerHTML += ' · new best!';
  else if (prev && !prev.revealed) $('#breakdown').innerHTML += ` · best ${prev.score}`;
  if (better)
    store[G.cur] = {
      ...run,
      pairs: G.st.pairs,
      locks: G.st.locks,
      score: res.score,
      stars: res.stars,
      at: new Date().toISOString(),
    };
  save();
  setReset(true);
  $('#pzNum').textContent = ` ${CATS[CAT].name} #${G.cur} ✓`;
  setMsg('');
  later(celebrate, 450);
}

// Give up: show the solution, save a 0-point 'peeked' record. Final for this board.
export function reveal() {
  if (G.done) return;
  G.revealed = true;
  G.done = true;
  G.groups = {};
  G.pairs = [];
  G.nextId = 0;
  G.sel = [];
  G.P.solution.forEach((cells) => {
    const id = G.nextId++;
    G.groups[id] = { id, cells, color: 0, pinned: false, fresh: true };
    G.groups[id].color = freeColor(cells);
  });
  store[G.cur] = { revealed: true, score: 0, stars: 0, at: new Date().toISOString() };
  save();
  $('#pzNum').textContent = ` ${CATS[CAT].name} #${G.cur} 🫠`;
  render();
  setMsg('Here’s the only solution. 0 points.', 'bad', true);
  setReset(true);
  later(openResults, 700);
}
