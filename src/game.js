import { freeColor } from './actions.js';
import { celebrate } from './celebrate.js';
import { $, board, clearFx, fmt, later } from './core/dom.js';
import { GROUPS, N } from './core/hex.js';
import { CATS } from './data/puzzles.js';
import { clearParticles } from './fx.js';
import { closeAll } from './menu.js';
import { loadShape, render, setMsg } from './render.js';
import { openResults, showBestTime, showResults } from './results.js';
import { newStats, resultOf, resultRank } from './scoring.js';
import { G } from './state.js';
import { send, track } from './telemetry.js';
import { clearProgress, elapsed, restoreProgress, saveProgress } from './progress.js';
import { CAT, PUZZLES, loadBest, save, saveBest, store } from './storage.js';

// Board lifecycle: opening a board, finishing it (win or reveal), and the Start over / Solution buttons.

// Opening a board you've already finished shows its solution. Finished boards can't be replayed.
// fresh: start over (forget any saved progress). Otherwise a board in progress is restored.
export function openPuzzle(n, fresh = false) {
  if (G.P && !G.done)
    track('board_leave', {
      elapsed: elapsed(),
      parcels: Object.keys(G.groups).length,
      to: n,
      startOver: fresh,
    });
  saveProgress(); // the board being left, if any
  clearFx();
  closeAll();
  clearParticles();
  G.cur = n;
  G.level = CAT;
  G.pauseT = null;
  const raw = PUZZLES[n - 1];
  loadShape(raw);
  G.P = {
    ...raw,
    tiles: [...Array(N)].map((_, i) => ({ s: +raw.t[3 * i], c: +raw.t[3 * i + 1], n: +raw.t[3 * i + 2] })),
    solution: raw.sol,
  };
  G.groups = {};
  G.pairs = [];
  G.hints = [];
  G.history = [];
  G.checkpoints = [];
  G.top = null;
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
  $('#ofN').textContent = '/' + GROUPS;
  $('#timer').textContent = '0:00';
  setMsg('');
  setReset(false);
  if (fresh) clearProgress(CAT, n);
  if (!fresh && store[n]) {
    clearProgress(CAT, n); // finished boards are final
    track('board_open', { finished: true, revealed: !!store[n].revealed });
    showFinished(store[n]);
  } else {
    const resumed = !fresh && restoreProgress(CAT, n);
    track('board_open', { resumed, fresh, parcels: Object.keys(G.groups).length, size: GROUPS });
    render();
    if (resumed) {
      $('#timer').textContent = fmt(elapsed());
      setMsg('Picked up where you left off.', 'ok');
    }
  }
}
// Finished boards (solved or peeked) are final: Start over disappears and Solution becomes Results.
export function setReset(finished) {
  $('#bReset').style.display = finished ? 'none' : '';
  $('#histRow').style.display = finished ? 'none' : '';
  $('#bHint').style.display = finished ? 'none' : '';
  const r = $('#bReveal');
  r.querySelector('.cl').textContent = finished ? 'Results' : 'Solution';
  r.classList.toggle('results', finished); // swaps the eye icon for a trophy
  r.classList.toggle('primary', finished);
  r.disabled = G.celebrating;
}
// Show a finished board (each board is played once): solved, or with its solution viewed.
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
    G.st.hints = rec.hints || 0; // shown in the Hints counter
    $('#timer').textContent = fmt(rec.time);
  }
  render();
  setReset(true);
  if (G.revealed) $('#timer').textContent = '—';
  const res = resultOf(rec);
  setMsg(
    G.revealed ? 'You viewed the solution for this one.' : `${res.title} · ${fmt(rec.time)}`,
    G.revealed ? 'bad' : 'ok', // a red x for a viewed solution, a green check for a solve
    true,
  );
}

// The last parcel was placed: show results, save if it beats the best, then celebrate().
export function win() {
  G.done = true;
  G.endT = Date.now();
  clearProgress(G.level, G.cur);
  const time = G.endT - (G.startT || G.endT);
  $('#timer').textContent = fmt(time);
  const run = {
    time,
    misses: G.misses,
    pops: G.st.pops,
    hints: G.st.hints || 0,
    best: G.st.best,
    trail: G.st.trail.slice(),
  };
  const res = showResults(run);
  // best time for the level: only solves without hints count
  let outcome = { kind: 'hinted' };
  if (!run.hints) {
    const prev = loadBest(G.level);
    outcome = null;
    if (!prev || time < prev.time) {
      saveBest(G.level, { time, board: G.cur, at: new Date().toISOString() });
      outcome = { kind: 'new', time, was: prev ? prev.time : null };
    }
  }
  showBestTime(G.level, outcome);
  track('game_finished', {
    outcome: 'solved',
    ...run,
    trail: undefined,
    pairs: G.st.pairs,
    locks: G.st.locks,
    swipes: G.st.swipes,
    fastestGap: G.st.fast,
    result: res.kind,
    newBest: !!(outcome && outcome.kind === 'new'),
    previousBest: outcome && outcome.was,
    parcels: GROUPS,
  });
  send(); // finished boards are reported right away
  // boards are played once, so this is the board's result (only an imported one could be here already)
  const prev = store[G.cur];
  const rec = { ...run, pairs: G.st.pairs, locks: G.st.locks, at: new Date().toISOString() };
  if (!prev || resultRank(rec) >= resultRank(prev)) store[G.cur] = rec;
  save();
  // the celebration starts now (it plays after a short pause), so Results stays greyed out until
  // the results card opens at its end
  G.celebrating = true;
  setReset(true);
  $('#pzNum').textContent = ` ${CATS[CAT].name} #${G.cur} ✓`;
  setMsg('');
  later(celebrate, 450);
}

// Give up: show the solution, save a 0-point 'peeked' record. Final for this board.
export function reveal() {
  if (G.done) return;
  track('game_finished', {
    outcome: 'revealed',
    time: elapsed(),
    misses: G.misses,
    pops: G.st.pops,
    hints: G.st.hints || 0,
    pairs: G.st.pairs,
    locks: G.st.locks,
    placed: Object.keys(G.groups).length,
    parcels: GROUPS,
    result: 'loser',
  });
  send(); // reported right away
  G.revealed = true;
  G.done = true;
  G.hints = [];
  clearProgress(G.level, G.cur);
  G.groups = {};
  G.pairs = [];
  G.nextId = 0;
  G.sel = [];
  G.P.solution.forEach((cells) => {
    const id = G.nextId++;
    G.groups[id] = { id, cells, color: 0, pinned: false, fresh: true };
    G.groups[id].color = freeColor(cells);
  });
  store[G.cur] = { revealed: true, at: new Date().toISOString() };
  save();
  $('#pzNum').textContent = ` ${CATS[CAT].name} #${G.cur} 🫠`;
  render();
  setMsg('Here’s the only solution.', 'bad', true);
  setReset(true);
  later(openResults, 700);
}
