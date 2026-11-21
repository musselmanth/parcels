import { board, buzz, later } from './core/dom.js';
import { GROUPS, NEIGH, adj, blobPath, centroid, connected } from './core/hex.js';
import { whyInvalid } from './core/rules.js';
import { burst, groupColors, toScreen } from './fx.js';
import { win } from './game.js';
import { paintSel, render, setMsg } from './render.js';
import { sfx } from './sound.js';
import { G, groupOf, pairOf } from './state.js';
import { TINTS } from './themes.js';

// ================= actions =================
export function begin() {
  if (!G.startT) G.startT = Date.now();
}

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

export function makePair(cells) {
  G.st.pairs++;
  G.pairs = G.pairs.filter((p) => !p.cells.some((c) => cells.includes(c)));
  G.pairs.push({ cells: cells.slice(), fresh: true });
  G.sel = [];
  sfx.pair();
  buzz(8);
  setMsg('Pair pencilled in. Add a third tile when you’re sure.');
  render();
}

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
  const g = { id, cells, color: freeColor(cells), pinned: false, fresh: true };
  G.groups[id] = g;
  G.sel = [];
  const n = Object.keys(G.groups).length;
  sfx.group(n - 1);
  buzz(14);
  setMsg(n === 1 ? 'Nice! Tap to pop a parcel, hold to lock it.' : '', 'ok');
  render();
  const [cx, cy] = centroid(cells),
    [sx, sy] = toScreen(cx, cy);
  burst(sx, sy, groupColors(g), 18, 5.5);
  if (n === GROUPS) win();
}

// Clearing a parcel: it swells, the outline bursts outward, confetti puffs, and the tiles spring back loose.
function breakGroup(g) {
  G.st.pops++;
  G.st.streak = 0;
  G.st.trail.push('🫧');
  const el = board.querySelector(`.pwrap[data-g="${g.id}"] .parcel`);
  const [cx, cy] = centroid(g.cells),
    [sx, sy] = toScreen(cx, cy);
  sfx.pop();
  buzz(10);
  setMsg('');
  burst(sx, sy, groupColors(g), 16, 4.2);
  const finish = () => {
    delete G.groups[g.id];
    G.released = new Set(g.cells);
    render();
    G.released = null;
    G.busy = false;
  };
  if (!el) {
    finish();
    return;
  }
  G.busy = true;
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
  later(finish, 215);
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
function togglePin(g) {
  g.pinned = true;
  g.badgeFresh = true;
  G.st.locks++;
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
const HOLD = 450;
export function startHold(g) {
  const wrap = board.querySelector(`.pwrap[data-g="${g.id}"]`),
    inner = wrap && wrap.querySelector('.parcel');
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
export function clearHold(h) {
  clearTimeout(h.timer);
  if (h.ring) h.ring.remove();
  if (h.inner) h.inner.classList.remove('holding');
}
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
  if (G.sel.length === 2 && G.sel.includes(i)) {
    const [a, b] = G.sel;
    if (adj(a, b)) {
      makePair([a, b]);
      return;
    }
    G.sel = G.sel.filter((x) => x !== i);
    setMsg('Pairs have to touch.', 'bad');
    paintSel();
    return;
  }
  G.sel = G.sel.includes(i) ? G.sel.filter((x) => x !== i) : G.sel.concat(i);
  sfx.tap();
  if (G.sel.length === 3) {
    submit(G.sel);
    return;
  }
  paintSel();
}
