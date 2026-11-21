import { N } from './core/hex.js';
import { CATS } from './data/puzzles.js';
import { G } from './state.js';

// Boards in progress, saved in the browser, so leaving a board (or reloading the page) and coming
// back picks up where you were. Saved after every move (render() calls saveProgress) and when you
// leave a board; cleared when the board is solved, revealed or started over.
//
// Stored per level under '<level key>-progress' (see CATS in src/data/puzzles.js):
//   {[boardNumber]: {groups: [{cells, color, pinned}], pairs: [[a, b]], hints: [[a, b, c]], misses, elapsed, st, at}}
// elapsed is the time played so far (ms); st is the stats object used for scoring (G.st).

const keyFor = (level) => CATS[level].key + '-progress';

// Every saved board for a level ({} if none).
export function loadAllProgress(level) {
  try {
    return JSON.parse(localStorage.getItem(keyFor(level)) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function write(level, all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(keyFor(level), JSON.stringify(all));
    else localStorage.removeItem(keyFor(level));
  } catch (e) {}
}

// Time played on the current board so far (not counting time paused off the game screen).
export const elapsed = () => (G.startT ? (G.pauseT || Date.now()) - G.startT : 0);

// Save the current board (or forget it, if nothing has happened on it yet).
export function saveProgress() {
  if (!G.P || !G.level || G.done || G.celebrating) return;
  const all = loadAllProgress(G.level);
  const groups = Object.values(G.groups);
  if (!groups.length && !G.pairs.length && !G.hints.length && !G.misses && !G.startT) delete all[G.cur];
  else
    all[G.cur] = {
      groups: groups.map((g) => ({ cells: g.cells, color: g.color, pinned: g.pinned })),
      pairs: G.pairs.map((p) => p.cells),
      hints: G.hints,
      misses: G.misses,
      elapsed: elapsed(),
      st: { ...G.st, lastT: null },
      at: new Date().toISOString(),
    };
  write(G.level, all);
}

export function clearProgress(level, n) {
  const all = loadAllProgress(level);
  delete all[n];
  write(level, all);
}
export function clearAllProgress() {
  for (const k of Object.keys(CATS))
    try {
      localStorage.removeItem(keyFor(k));
    } catch (e) {}
}

// Put a saved board back into G, after openPuzzle() has reset it. Returns true if it did.
export function restoreProgress(level, n) {
  const p = loadAllProgress(level)[n];
  if (!p) return false;
  // ignore saves that don't fit this board (e.g. the puzzle data changed)
  const fits = (cells) => Array.isArray(cells) && cells.every((i) => Number.isInteger(i) && i >= 0 && i < N);
  if (
    !(p.groups || []).every((g) => fits(g.cells)) ||
    !(p.pairs || []).every(fits) ||
    !(p.hints || []).every(fits)
  ) {
    clearProgress(level, n);
    return false;
  }
  for (const g of p.groups || []) {
    const id = G.nextId++;
    G.groups[id] = { id, cells: g.cells, color: g.color, pinned: !!g.pinned, fresh: false };
  }
  G.pairs = (p.pairs || []).map((cells) => ({ cells, fresh: false }));
  G.hints = p.hints || [];
  G.misses = p.misses || 0;
  G.st = { ...G.st, ...p.st, lastT: null };
  if (p.elapsed > 0) G.startT = Date.now() - p.elapsed;
  return true;
}
