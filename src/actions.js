import { board, buzz, later } from './core/dom.js';
import { GROUPS, NEIGH, adj, between, blobPath, centroid, connected } from './core/hex.js';
import { whyInvalid } from './core/rules.js';
import { burst, groupColors, toScreen } from './fx.js';
import { win } from './game.js';
import { paintSel, render, setMsg } from './render.js';
import { sfx } from './sound.js';
import { G, groupOf, pairOf } from './state.js';
import { track } from './telemetry.js';
import { TINTS } from './themes.js';

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
export function makePair(cells, msg = 'Pair pencilled in. Add a third tile when you’re sure.') {
  G.st.pairs++;
  G.pairs = G.pairs.filter((p) => !p.cells.some((c) => cells.includes(c)));
  G.pairs.push({ cells: cells.slice(), fresh: true });
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
// Erasing a pencilled pair gets a smaller version of the same pop.
function erasePair(p) {
  const path = [...board.querySelectorAll('.pair')][G.pairs.indexOf(p)];
  const [cx, cy] = centroid(p.cells),
    [sx, sy] = toScreen(cx, cy);
  sfx.pop(true);
  burst(
    sx,
    sy,
    [getComputedStyle(document.body).getPropertyValue('--paired').trim() || '#8d846f', '#ddd3c1', '#9c97cc'],
    8,
    3,
  );
  G.sel = [];
  track('pair_erase', { cells: p.cells });
  setMsg('Pair erased.');
  const finish = () => {
    G.pairs = G.pairs.filter((x) => x !== p);
    G.released = new Set(p.cells);
    render();
    G.released = null;
    G.busy = false;
  };
  if (!path) {
    finish();
    return;
  }
  G.busy = true;
  path.animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.2)', opacity: 0 },
    ],
    { duration: 180, easing: 'ease-out', fill: 'forwards' },
  );
  later(finish, 170);
}
// Lock a parcel so a tap no longer pops it.
function togglePin(g) {
  g.pinned = true;
  g.sealFresh = true;
  G.st.locks++;
  track('lock', { cells: g.cells, correct: inSolution(g.cells) });
  sfx.pin();
  buzz(12);
  setMsg('Locked in. Hold it again to pop it.', 'ok');
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

// Parcels: a quick tap pops an unlocked parcel (on release). Press and hold locks it;
// press and hold a locked parcel pops it. A quick tap on a locked parcel just wiggles.
// How long (ms) a press must last to count as press-and-hold.
const HOLD = 450;
// Pointer went down on a parcel: show the hold ring and start the timer. Returns a hold handle
// that releaseHold() / clearHold() take. After HOLD ms, a loose parcel locks and a locked one pops.
export function startHold(g) {
  const wrap = board.querySelector(`.pwrap[data-g="${g.id}"]`),
    inner = wrap && wrap.querySelector('.parcel');
  // the pressed parcel comes to the top, so its ring and animations show over its neighbors
  G.top = g.id;
  if (wrap) wrap.parentNode.appendChild(wrap);
  const h = { g, done: false, ring: null };
  if (wrap) {
    const ns = 'http://www.w3.org/2000/svg',
      ring = document.createElementNS(ns, 'path');
    ring.setAttribute('class', 'holdring' + (g.pinned ? ' popping' : ''));
    ring.setAttribute('pathLength', '1');
    ring.setAttribute('d', blobPath(g.cells, -3, 15));
    wrap.appendChild(ring);
    h.ring = ring;
    inner.classList.add('holding');
    h.inner = inner;
  }
  h.timer = setTimeout(() => {
    h.done = true;
    clearHold(h);
    if (!G.groups[g.id]) return;
    if (g.pinned) breakGroup(g);
    else togglePin(g);
  }, HOLD);
  return h;
}
// Cancel a hold: stop the timer and remove the ring.
export function clearHold(h) {
  clearTimeout(h.timer);
  if (h.ring) h.ring.remove();
  if (h.inner) h.inner.classList.remove('holding');
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
  setMsg('Locked. Press and hold to pop it.');
  const el = board.querySelector(`.pwrap[data-g="${g.id}"] .parcel`);
  if (el) {
    el.classList.remove('nudge');
    void el.getBBox();
    el.classList.add('nudge');
  }
  sfx.tap();
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
    const same = G.sel.length === 2 && p.cells.every((c) => G.sel.includes(c));
    if (same) {
      erasePair(p);
      return;
    }
    const u = [...new Set([...G.sel, ...p.cells])];
    G.sel = u.length <= 3 ? u : p.cells.slice();
    sfx.tap();
    if (G.sel.length === 3) {
      submit(G.sel);
      return;
    }
    setMsg('Tap a third tile, or tap the pair again to erase it.');
    paintSel();
    return;
  }
  // With two tiles picked, tapping either one again pencils them in as a pair.
  if (G.sel.length === 2 && G.sel.includes(i)) return pencilPair(G.sel[0], G.sel[1], i);
  G.sel = G.sel.includes(i) ? G.sel.filter((x) => x !== i) : G.sel.concat(i);
  sfx.tap();
  if (G.sel.length === 3) {
    submit(G.sel);
    return;
  }
  paintSel();
}
