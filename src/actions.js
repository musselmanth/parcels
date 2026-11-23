import { board, buzz, later } from './core/dom.js';
import {
  GROUPS,
  NEIGH,
  adj,
  between,
  blobPath,
  center,
  centroid,
  connected,
  pairOutline,
} from './core/hex.js';
import { whyInvalid } from './core/rules.js';
import { burst, groupColors, toScreen } from './fx.js';
import { win } from './game.js';
import { pairGhost, paintSel, render, setMsg, unwindLock } from './render.js';
import { sfx } from './sound.js';
import { G, groupOf, pairOf } from './state.js';
import { track } from './telemetry.js';
import { TINTS } from './tiles.js';

// What the player's moves do: making parcels, pencilling pairs, popping and locking parcels.
// input.js turns pointer events into these calls; each one updates G and calls render().

// A set of cells as a key that ignores order.
const cellKey = (cells) =>
  cells
    .slice()
    .sort((a, b) => a - b)
    .join(',');

// Is this parcel part of the solution? (for the playtest log)
const inSolution = (cells) => G.P.solution.some((s) => cellKey(s) === cellKey(cells));

// Hint: outline one parcel from the solution that the player hasn't made (or already been shown).
// Prefers parcels whose tiles are all still loose; only when none is left does it pick one that
// overlaps the player's parcels (fewest overlapping tiles), which tells them those parcels are wrong.
// The outline stays until that parcel is made (see submit), which then locks it automatically.
// Each hint is counted: a board solved with hints shows "Solved with N Hints" instead of Perfect!.
export function giveHint() {
  if (G.done || G.celebrating || G.busy) return;
  const made = new Set(Object.values(G.groups).map((g) => cellKey(g.cells)));
  const shown = new Set(G.hints.map(cellKey));
  const taken = new Set(Object.values(G.groups).flatMap((g) => g.cells));
  const open = G.P.solution.filter((c) => !made.has(cellKey(c)) && !shown.has(cellKey(c)));
  if (!open.length) {
    setMsg('Every parcel left is already outlined.');
    return;
  }
  const overlap = (c) => c.filter((i) => taken.has(i)).length;
  const least = Math.min(...open.map(overlap));
  const pool = open.filter((c) => overlap(c) === least);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  begin();
  G.hints.push(pick.slice());
  G.st.hints = (G.st.hints || 0) + 1;
  track('hint', { cells: pick, overlap: least });
  G.st.trail.push('💡');
  sfx.hint();
  buzz(8);
  setMsg(
    least
      ? 'That outline belongs in the answer, so a parcel you made over it is wrong.'
      : 'The dotted outline is a real parcel. Make it to clear the hint.',
  );
  render();
}

// Start the clock on the first move.
export function begin() {
  if (!G.startT) G.startT = Date.now();
}

// Pick a tint for a new parcel: one its neighbors aren't using, preferring the least-used.
export function freeColor(cells) {
  const near = new Set();
  cells.forEach((i) =>
    NEIGH[i].forEach((j) => {
      const g = groupOf(j);
      if (g) near.add(g.color);
    }),
  );
  const use = new Array(TINTS.length).fill(0);
  Object.values(G.groups).forEach((g) => use[g.color]++);
  const ok = [...TINTS.keys()].filter((i) => !near.has(i));
  const pool = ok.length ? ok : [...TINTS.keys()];
  return pool.sort((a, b) => use[a] - use[b] || a - b)[0];
}

// Pencil in two touching tiles as a pair (replacing any pair they were in).
// Pencil in two tiles as a pair (replacing any pair they were in). Usually they touch; they can also
// be the two ends of a bend, with two possible middle tiles (see pencilPair).
let calmPair = false; // pencilling from a hold: the outline was already drawn, so no pop-in
// ---- undo
// The board as it is now, for the undo history: parcels, pencilled pairs and hints.
function snapshot() {
  return {
    groups: Object.values(G.groups).map((g) => ({
      cells: g.cells.slice(),
      color: g.color,
      pinned: !!g.pinned,
    })),
    pairs: G.pairs.map((p) => p.cells.slice()),
    hints: G.hints.map((h) => h.slice()),
  };
}
// Call just before a move changes the board, so undo() can put it back.
function record() {
  G.history.push(snapshot());
  if (G.history.length > 400) G.history.shift();
}
// Take back the last move (as far back as the start of the board). Mistakes, pops and hints
// already given still count; a hint that was used up by making its parcel comes back.
export function undo() {
  if (G.done || G.busy || G.celebrating || !G.history.length) return;
  restore(G.history.pop());
  G.st.undos = (G.st.undos || 0) + 1;
  track('undo', { left: G.history.length });
  sfx.tap();
  setMsg(G.history.length ? 'Undone.' : 'Back to the start.');
  render();
  G.released = null;
}
// Put the board back to snapshot s (parcels and pairs; hints as described at undo()).
function restore(s) {
  const before = new Set(Object.values(G.groups).flatMap((g) => g.cells));
  G.groups = {};
  for (const g of s.groups) {
    const id = G.nextId++;
    G.groups[id] = { id, cells: g.cells, color: g.color, pinned: g.pinned, fresh: false };
  }
  const now = new Set(s.groups.flatMap((g) => g.cells));
  G.pairs = s.pairs.map((cells) => ({ cells, fresh: false }));
  // hints: keep every one given so far (even after this point), minus ones whose parcel is made
  const made = new Set(s.groups.map((g) => cellKey(g.cells)));
  const hints = [...G.hints, ...s.hints.filter((h) => !G.hints.some((x) => cellKey(x) === cellKey(h)))];
  G.hints = hints.filter((h) => !made.has(cellKey(h)));
  G.sel = [];
  G.released = new Set([...before].filter((c) => !now.has(c))); // tiles freed spring back (on render)
}

// ---- checkpoint
// One saved position the player can come back to in a single tap. Setting it again replaces it.
// Going back to it counts as a move, so Undo takes you back to where you were.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// True if the board is anything other than the checkpoint (parcels and pairs; hints don't count).
export function awayFromCheckpoint() {
  if (!G.checkpoint) return false;
  const now = snapshot();
  const key = (s) => ({
    g: s.groups.map((g) => [cellKey(g.cells), g.pinned]).sort(),
    p: s.pairs.map(cellKey).sort(),
  });
  return !same(key(now), key(G.checkpoint));
}
export function setCheckpoint() {
  if (G.done || G.busy || G.celebrating) return;
  const replacing = !!G.checkpoint;
  G.checkpoint = snapshot();
  G.st.checkpoints = (G.st.checkpoints || 0) + 1;
  track('checkpoint', { parcels: Object.keys(G.groups).length, replacing });
  sfx.pair();
  buzz(8);
  setMsg(
    replacing ? 'Checkpoint moved here.' : 'Checkpoint set. Try an idea; Return brings the board back here.',
    'ok',
  );
  render();
  const b = document.getElementById('bMark');
  if (b) {
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }
}
export function toCheckpoint() {
  if (G.done || G.busy || G.celebrating || !awayFromCheckpoint()) return;
  record();
  restore(G.checkpoint);
  G.st.returns = (G.st.returns || 0) + 1;
  track('checkpoint_return', { parcels: G.checkpoint.groups.length });
  sfx.tap();
  setMsg('Back at your checkpoint. Undo takes you back to where you were.');
  render();
  G.released = null;
}

export function makePair(cells, msg = 'Pair pencilled in. Add a third tile when you’re sure.') {
  record();
  G.st.pairs++;
  G.pairs = G.pairs.filter((p) => !p.cells.some((c) => cells.includes(c)));
  G.pairs.push({ cells: cells.slice(), fresh: !calmPair }); // after a hold it's already drawn in
  G.sel = [];
  track('pair', { cells, gap: !adj(cells[0], cells[1]) });
  sfx.pair();
  buzz(8);
  setMsg(msg);
  render();
}

// Pencil in tiles a and b (tapped = the one tapped again to ask for it):
//   - touching: a pair.
//   - one tile apart, at the ends of a bend: two tiles could go in the middle, so it's a pair too
//     (its outline squeezes between those two).
//   - one tile apart with only one tile that fits between them (the ends of a line, or a bend
//     missing a tile at the board's edge): no need to pencil, it becomes that parcel right away.
//   - anything else: not a pair.
function pencilPair(a, b, tapped) {
  if (adj(a, b)) return makePair([a, b]);
  const mid = between(a, b);
  if (mid.length === 2)
    return makePair([a, b], 'Pair pencilled in. One of the two tiles between them makes the parcel.');
  if (mid.length === 1) {
    if (!groupOf(mid[0])) return submit([a, mid[0], b]);
    G.sel = [];
    setMsg('The tile between them is already in a parcel.', 'bad');
    paintSel();
    return;
  }
  G.sel = G.sel.filter((x) => x !== tapped);
  setMsg('That’s not a valid pair.', 'bad');
  paintSel();
}

// Try to make a parcel from 3 cells. Not touching -> message only. Breaks a rule -> counts a miss,
// shakes the tiles and explains why. Valid -> becomes a parcel (it may still be wrong; the player finds
// out when the board can't be finished). Calls win() when the last parcel is placed.
export function submit(cells) {
  cells = cells.slice();
  let msg = null,
    rule = false;
  if (!connected(cells)) msg = 'The three tiles have to touch.';
  else {
    msg = whyInvalid(...cells.map((k) => G.P.tiles[k]));
    rule = !!msg;
  }
  if (msg) {
    G.busy = true;
    track('miss', { cells, reason: msg, counted: rule });
    if (rule) {
      G.misses++;
      G.st.streak = 0;
      G.st.trail.push('🟥');
      sfx.bad();
      buzz([20, 40, 20]);
    }
    setMsg(msg, 'bad');
    G.sel = [];
    render();
    board.querySelectorAll('.tile').forEach((el) => {
      if (cells.includes(+el.dataset.i)) el.classList.add('shake');
    });
    later(() => {
      G.busy = false;
      board.querySelectorAll('.shake').forEach((el) => el.classList.remove('shake'));
    }, 420);
    return;
  }
  record();
  G.pairs = G.pairs.filter((p) => !p.cells.some((c) => cells.includes(c)));
  // a hinted parcel, now made: its outline goes, and it locks itself (it's known to be right)
  const hinted = G.hints.some((h) => cellKey(h) === cellKey(cells));
  G.hints = G.hints.filter((h) => cellKey(h) !== cellKey(cells));
  const now = Date.now();
  G.st.trail.push('🟩');
  G.st.built++;
  G.st.streak++;
  G.st.best = Math.max(G.st.best, G.st.streak);
  if (G.viaSwipe) G.st.swipes++;
  if (G.st.lastT) {
    const gap = now - G.st.lastT;
    G.st.fast = G.st.fast === null ? gap : Math.min(G.st.fast, gap);
  }
  G.st.lastT = now;
  const id = G.nextId++;
  const g = { id, cells, color: freeColor(cells), pinned: hinted, sealFresh: hinted, fresh: true };
  G.top = id; // a new parcel is drawn on top
  G.groups[id] = g;
  G.sel = [];
  const n = Object.keys(G.groups).length;
  track('parcel', { cells, correct: inSolution(cells), via: G.viaSwipe ? 'swipe' : 'tap', hinted, n });
  sfx.group(n - 1);
  buzz(14);
  setMsg(
    hinted
      ? 'Hinted parcel made and locked in.'
      : n === 1
        ? 'Nice! Tap to pop a parcel, hold to lock it.'
        : '',
    'ok',
  );
  render();
  const [cx, cy] = centroid(cells),
    [sx, sy] = toScreen(cx, cy);
  burst(sx, sy, groupColors(g), 18, 5.5);
  if (n === GROUPS) win();
}

// The pop itself, just the look and sound: the parcel swells, its outline bursts outward and confetti
// puffs. Returns false if the parcel isn't on screen. Used by breakGroup and popAll.
function popEffect(g, quiet = false) {
  const el = board.querySelector(`.pwrap[data-g="${g.id}"] .parcel`);
  const [cx, cy] = centroid(g.cells),
    [sx, sy] = toScreen(cx, cy);
  sfx.pop(quiet);
  burst(sx, sy, groupColors(g), quiet ? 10 : 16, 4.2);
  if (!el) return false;
  el.querySelector('.outline').animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.08)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1.22)', opacity: 0 },
    ],
    { duration: 230, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
  );
  el.querySelectorAll('.pop').forEach((p) =>
    p.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.45 }, { transform: 'scale(.84)' }],
      { duration: 210, easing: 'ease-out', fill: 'forwards' },
    ),
  );
  return true;
}

// Clearing a parcel (a player's pop, counted in the stats): it pops, and the tiles spring back loose.
function breakGroup(g) {
  record();
  track('pop', { cells: g.cells, correct: inSolution(g.cells), locked: g.pinned });
  G.st.pops++;
  G.st.streak = 0;
  G.st.trail.push('🫧');
  buzz(10);
  setMsg('');
  const finish = () => {
    delete G.groups[g.id];
    G.released = new Set(g.cells);
    render();
    G.released = null;
    G.busy = false;
  };
  if (!popEffect(g)) {
    finish();
    return;
  }
  G.busy = true;
  later(finish, 215);
}

// Start over: pop every parcel in a quick ripple and fade out pairs and hints, then call done()
// (which resets the board). Not counted as pops: the stats are reset anyway.
export function popAll(done) {
  const groups = Object.values(G.groups);
  if (!groups.length && !G.pairs.length && !G.hints.length) return done();
  G.busy = true;
  G.sel = [];
  paintSel(); // drop any half-made selection's highlight
  setMsg('');
  buzz(groups.length ? [10, 30, 10] : 8);
  const STEP = 70; // ms between pops
  groups.forEach((g, k) => later(() => popEffect(g, k > 0), k * STEP));
  board.querySelectorAll('.pair, .hint').forEach((el) =>
    el.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.15)' },
      ],
      {
        duration: 200,
        easing: 'ease-out',
        fill: 'forwards',
      },
    ),
  );
  later(done, Math.max(0, groups.length - 1) * STEP + 260);
}
// Erase a pencilled pair. Its outline already undrew itself during the hold (startTileHold), so it
// just goes: no pop.
function erasePair(p) {
  record();
  G.sel = [];
  track('pair_erase', { cells: p.cells });
  setMsg('Pair erased.');
  G.pairs = G.pairs.filter((x) => x !== p);
  render();
}
// Lock a parcel so a tap no longer pops it.
function togglePin(g) {
  record();
  g.pinned = true;
  g.sealFresh = true;
  G.st.locks++;
  track('lock', { cells: g.cells, correct: inSolution(g.cells) });
  sfx.pin();
  buzz(12);
  setMsg('Locked in. Hold it again to unlock it.', 'ok');
  render();
  const el = board.querySelector(`.pwrap[data-g="${g.id}"] .parcel`);
  if (el) {
    el.classList.add('pinning');
  }
  if (g.pinned) {
    const [cx, cy] = centroid(g.cells),
      [sx, sy] = toScreen(cx, cy);
    burst(sx, sy, ['#fffaf0', TINTS[g.color][1], '#f2b705'], 10, 3.5);
  }
}
// Unlock a locked parcel (its seal already unwound during the hold): taps pop it again.
function unpin(g) {
  record();
  g.pinned = false;
  track('unlock', { cells: g.cells });
  sfx.tap();
  setMsg('Unlocked. Tap it to pop it.');
  render();
}

// Parcels: a quick tap pops an unlocked parcel (on release). Press and hold locks it;
// press and hold a locked parcel unlocks it. A quick tap on a locked parcel just wiggles.
// How long (ms) a press must last to count as press-and-hold.
const HOLD = 450;
// Pointer went down on a parcel: show the hold ring and start the timer. Returns a hold handle
// that releaseHold() / clearHold() take. After HOLD ms, a loose parcel locks and a locked one unlocks.
export function startHold(g) {
  const wrap = board.querySelector(`.pwrap[data-g="${g.id}"]`),
    inner = wrap && wrap.querySelector('.parcel');
  // the pressed parcel comes to the top, so its ring and animations show over its neighbors
  G.top = g.id;
  if (wrap) {
    // Moving an element in the DOM restarts its CSS animations. Drop the one-shot classes
    // first, or a parcel that was made or locked earlier redraws its outline and seal.
    settle(wrap);
    wrap.parentNode.appendChild(wrap);
  }
  const h = { g, done: false, ring: null, unwind: null };
  if (wrap) {
    if (g.pinned) {
      // locked: its thick outline and seal unwind themselves over the hold
      h.unwind = unwindLock(wrap);
    } else {
      const ns = 'http://www.w3.org/2000/svg',
        ring = document.createElementNS(ns, 'path');
      ring.setAttribute('class', 'holdring');
      ring.setAttribute('pathLength', '1');
      ring.setAttribute('d', blobPath(g.cells, -3, 15));
      wrap.appendChild(ring);
      h.ring = ring;
    }
    inner.classList.add('holding');
    h.inner = inner;
  }
  h.timer = setTimeout(() => {
    h.done = true;
    h.unwind = null; // unlocking: stays unwound until the redraw
    clearHold(h);
    if (!G.groups[g.id]) return;
    if (g.pinned) unpin(g);
    else togglePin(g);
  }, HOLD);
  return h;
}
// Remove the classes that play an animation once (enter, pinning, nudge) from a parcel's elements.
function settle(wrap) {
  wrap
    .querySelectorAll('.enter, .pinning, .nudge')
    .forEach((el) => el.classList.remove('enter', 'pinning', 'nudge'));
}
// Cancel a hold: stop the timer and remove the ring.
export function clearHold(h) {
  clearTimeout(h.timer);
  if (h.ring) h.ring.remove();
  if (h.inner) h.inner.classList.remove('holding');
  if (h.unwind) h.unwind();
  if (h.hidden) h.hidden.style.visibility = '';
}
// Pointer came up before the hold finished: a quick tap. Pops a loose parcel; a locked one just wiggles.
export function releaseHold(h) {
  if (h.done) return;
  clearHold(h);
  h.done = true;
  const g = h.g;
  if (!G.groups[g.id]) return;
  if (!g.pinned) {
    breakGroup(g);
    return;
  }
  setMsg('Locked. Press and hold to unlock it.');
  const el = board.querySelector(`.pwrap[data-g="${g.id}"] .parcel`);
  if (el) {
    el.classList.remove('nudge');
    void el.getBBox();
    el.classList.add('nudge');
  }
  sfx.tap();
}

// Pointer went down on a loose or pencilled tile. If holding it would do something, show the hold
// ring and start the timer; returns a hold handle (as startHold does), or null. After HOLD ms:
//   - on a pencilled pair: erase it.
//   - on one of 2 selected tiles: pencil them in as a pair.
//   - with 1 tile selected, on another tile: pencil those two in as a pair.
// Letting go sooner is an ordinary tap (tapCell).
export function startTileHold(i) {
  const p = pairOf(i);
  let act = null;
  if (p) act = { erase: p, cells: p.cells };
  else if (G.sel.length === 2 && G.sel.includes(i)) act = { cells: G.sel.slice() };
  else if (G.sel.length === 1 && G.sel[0] !== i && !pairOf(G.sel[0])) act = { cells: [G.sel[0], i] };
  if (!act) return null;
  const h = { done: false, ring: null };
  const world = board.querySelector('#world');
  if (world) {
    // pencilling: the pair's dashed outline draws itself in around the two tiles; erasing: the
    // pair's outline undraws itself (the real one hides meanwhile, and comes back if the hold stops)
    if (act.erase) {
      h.hidden = [...board.querySelectorAll('.pair')][G.pairs.indexOf(act.erase)] || null;
      if (h.hidden) h.hidden.style.visibility = 'hidden';
    }
    h.ring = pairGhost(
      world,
      pairOutline(center(act.cells[0]), center(act.cells[1]), 2, 13),
      !!act.erase,
      h.hidden,
    );
  }
  h.timer = setTimeout(() => {
    h.done = true;
    h.hidden = null; // erased: the real outline stays hidden until it's gone
    clearHold(h);
    if (act.erase) {
      if (G.pairs.includes(act.erase)) {
        G.sel = [];
        paintSel();
        erasePair(act.erase);
      }
    } else {
      calmPair = true;
      pencilPair(act.cells[0], act.cells[1], i);
      calmPair = false;
    }
  }, HOLD);
  return h;
}

// A tap (not a swipe) on cell i, or i < 0 for empty space (clears the selection).
// Taps build up G.sel; the third tile submits. Tapping a pair selects both of its tiles.
export function tapCell(i) {
  if (i < 0) {
    if (G.sel.length) {
      G.sel = [];
      paintSel();
    }
    return;
  }
  const g = groupOf(i);
  if (g) {
    return;
  }
  const p = pairOf(i);
  if (p) {
    // tapping a selected pair again deselects it (holding it erases it)
    const same = G.sel.length === 2 && p.cells.every((c) => G.sel.includes(c));
    if (same) {
      G.sel = [];
      sfx.tap();
      paintSel();
      return;
    }
    const u = [...new Set([...G.sel, ...p.cells])];
    G.sel = u.length <= 3 ? u : p.cells.slice();
    sfx.tap();
    if (G.sel.length === 3) {
      submit(G.sel);
      return;
    }
    setMsg('Tap a third tile, or hold the pair to erase it.');
    paintSel();
    return;
  }
  // tapping a selected tile deselects it
  G.sel = G.sel.includes(i) ? G.sel.filter((x) => x !== i) : G.sel.concat(i);
  sfx.tap();
  if (G.sel.length === 3) {
    submit(G.sel);
    return;
  }
  if (G.sel.length === 2) setMsg('Tap a third tile, or hold one of these to pencil them in as a pair.');
  else setMsg('');
  paintSel();
}
