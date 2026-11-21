import { begin, clearHold, makePair, releaseHold, startHold, submit, tapCell } from './actions.js';
import { board } from './core/dom.js';
import { N, S, adj, center } from './core/hex.js';
import { paintSel } from './render.js';
import { audio, sfx } from './sound.js';
import { G, groupOf, pairOf } from './state.js';

// ================= pointer handling =================
function svgXY(x, y) {
  const m = board.getScreenCTM();
  if (!m) return null;
  return new DOMPoint(x, y).matrixTransform(m.inverse());
}
function cellAt(x, y) {
  const p = svgXY(x, y);
  if (!p) return -1;
  let best = -1,
    bd = S * 0.93;
  for (let i = 0; i < N; i++) {
    const [cx, cy] = center(i),
      d = Math.hypot(cx - p.x, cy - p.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
let gest = null; // {id,start,x0,y0,moved,units:[[cells]]}
const flat = (units) => units.flat();
board.addEventListener('pointerdown', (e) => {
  if (G.done || G.celebrating || gest) return;
  const i = cellAt(e.clientX, e.clientY);
  if (G.busy) return;
  e.preventDefault();
  audio();
  try {
    board.setPointerCapture(e.pointerId);
  } catch (_) {}
  begin();
  if (i >= 0 && groupOf(i)) {
    gest = { id: e.pointerId, consumed: true, x0: e.clientX, y0: e.clientY, hold: startHold(groupOf(i)) };
    return;
  }
  gest = { id: e.pointerId, start: i, x0: e.clientX, y0: e.clientY, moved: false, units: [] };
});
board.addEventListener('pointermove', (e) => {
  if (!gest || e.pointerId !== gest.id) return;
  if (gest.consumed) {
    if (gest.hold && !gest.hold.done && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 18) {
      clearHold(gest.hold);
      gest.hold.done = true;
    }
    return;
  }
  if (!gest.moved) {
    if (Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) < 10) return;
    gest.moved = true;
    const s = gest.start;
    if (s < 0 || groupOf(s)) {
      gest.dead = true;
      return;
    } // swipes start on a loose or pencilled tile
    begin();
    G.sel = [];
    const p = pairOf(s);
    gest.units = [p ? p.cells.slice() : [s]];
  }
  if (gest.dead) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  const path = flat(gest.units);
  if (path.includes(i)) {
    // slid back onto an earlier tile: drop what came after it
    const k = gest.units.findIndex((u) => u.includes(i));
    if (k < gest.units.length - 1) {
      gest.units = gest.units.slice(0, k + 1);
      G.sel = flat(gest.units);
      paintSel(G.sel);
    }
    return;
  }
  if (groupOf(i)) return;
  const p = pairOf(i),
    add = (p ? p.cells : [i]).filter((c) => !path.includes(c));
  if (path.length + add.length > 3) return;
  if (!add.some((c) => path.some((q) => adj(c, q)))) return;
  gest.units.push(add);
  G.sel = flat(gest.units);
  sfx.step(G.sel.length);
  paintSel(G.sel);
});
function endGesture(e, cancel) {
  if (!gest || e.pointerId !== gest.id) return;
  const g = gest;
  gest = null;
  if (g.consumed) {
    if (g.hold) {
      cancel ? (clearHold(g.hold), (g.hold.done = true)) : releaseHold(g.hold);
    }
    return;
  }
  if (cancel) {
    G.sel = [];
    paintSel();
    return;
  }
  if (!g.moved) {
    begin();
    tapCell(g.start);
    return;
  }
  if (g.dead) return;
  const cells = flat(g.units);
  paintSel([]);
  if (cells.length === 3) {
    G.viaSwipe = true;
    submit(cells);
    G.viaSwipe = false;
  } else if (cells.length === 2) makePair(cells);
  else {
    G.sel = [];
    paintSel();
  }
}
board.addEventListener('pointerup', (e) => endGesture(e, false));
board.addEventListener('pointercancel', (e) => endGesture(e, true));
board.addEventListener('contextmenu', (e) => e.preventDefault());
