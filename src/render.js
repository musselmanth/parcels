import { $, board, fmt } from './core/dom.js';
import {
  CELLS,
  GROUPS,
  N,
  S,
  W3,
  adj,
  blobPath,
  center,
  centroid,
  connected,
  pairOutline,
  setCells,
} from './core/hex.js';
import { canReturn } from './actions.js';
import { G, pairOf } from './state.js';
import { elapsed, saveProgress } from './progress.js';
import { POS, STAR, TINTS, glyph, tileLabel } from './tiles.js';
import { validTiles } from './core/rules.js';
import { prefs } from './storage.js';

// Drawing. The board is one <svg> rebuilt from G by render() after every move. Layers, bottom to top:
// pencilled pairs, parcels (outline + their tiles + the seal on locked ones), the swipe trail, loose tiles, and the
// star shown when the board is solved. CSS classes drive the animations (see styles/board.css).
// Also the tip message under the stats and the timer.

// What fits?: with exactly two tiles selected (two taps, partway through a swipe, or a tapped
// pencilled pair), the loose tiles that would make a valid parcel with them. They're outlined in
// gold, so the player only has to think about where parcels go, not check the rule in their head.
// Only with Third-tile helper on in Settings (off by default).
let FIT = new Set();
export function fitsFor(sel) {
  const out = new Set();
  if (!prefs.easyMode || sel.length !== 2 || G.done || !G.P) return out;
  const used = new Set(Object.values(G.groups).flatMap((g) => g.cells));
  for (let k = 0; k < N; k++) {
    if (sel.includes(k) || used.has(k)) continue;
    const three = [...sel, k];
    if (connected(three) && validTiles(...three.map((i) => G.P.tiles[i]))) out.add(k);
  }
  return out;
}
// ...and the other way round: with one tile selected, the pencilled pairs it would complete. Their
// dashed outlines turn gold. Returns a Set of indexes into G.pairs.
let PAIRFIT = new Set();
export function pairsFor(sel) {
  const out = new Set();
  if (!prefs.easyMode || sel.length !== 1 || G.done || !G.P || pairOf(sel[0])) return out;
  G.pairs.forEach((p, k) => {
    const three = [sel[0], ...p.cells];
    if (connected(three) && validTiles(...three.map((i) => G.P.tiles[i]))) out.add(k);
  });
  return out;
}
let fitShownFor = ''; // the two tiles the "nothing fits" note was last shown for
// Two tiles picked that nothing completes: say so, once per pair of tiles. Not while swiping.
function noteNoFit() {
  const key = G.sel.length === 2 ? [...G.sel].sort((a, b) => a - b).join() : '';
  if (key && key !== fitShownFor && prefs.easyMode && !FIT.size && !G.done)
    setMsg('No tile fits with those two.', 'bad');
  fitShownFor = key;
}

// Lighting up: when a board opens, its symbols flicker on one by one like neon tubes catching
// (lightUp; the flicker is .tile.ignite in board.css). Each tile's start time is kept here, so a
// redraw in the middle of it (e.g. a quick first tap) carries on where it was instead of restarting.
const IGNITE_MS = 600; // the flicker's length (keep in step with .tile.ignite)
let LIGHT = null; // {t0, delays: ms per cell from t0, end}
export function lightUp(startIn = 0) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return [];
  const xs = CELLS.map((_, i) => center(i)[0]),
    x0 = Math.min(...xs),
    span = Math.max(...xs) - x0 || 1;
  // a loose sweep across the board, left to right, with each tube catching a little at random
  const delays = xs.map((x) => startIn + (550 * (x - x0)) / span + Math.random() * 320);
  LIGHT = { t0: performance.now(), delays, end: Math.max(...delays) + IGNITE_MS };
  render();
  // once they're all lit, drop the flicker (so it can't get in the way of the win's spin later)
  const mine = LIGHT;
  setTimeout(() => {
    if (LIGHT !== mine) return; // another board opened since
    LIGHT = null;
    board.querySelectorAll('.tile.ignite').forEach((el) => el.classList.remove('ignite'));
  }, mine.end + 50);
  return delays;
}
// How long until tile i's symbol starts flickering on (negative: it already has, by that much), or
// null when it isn't lighting up.
function igniteIn(i) {
  if (!LIGHT) return null;
  const now = performance.now() - LIGHT.t0;
  if (now > LIGHT.end) {
    LIGHT = null;
    return null;
  }
  const d = LIGHT.delays[i] - now;
  return d > -IGNITE_MS ? Math.round(d) : null;
}

// Pre-computed rounded-hexagon path for each cell (rebuilt per board).
let CARD = [];
const GK = S / 68; // glyph scale: keeps every symbol well inside its hexagon

// Load a board's shape: cells come stored as a flat list q0,r0,q1,r1,...
// The board is drawn turned to whichever of its orientations fits the screen best (see bestTurn).
export function loadShape(raw) {
  const c = [];
  for (let i = 0; i < raw.c.length; i += 2) c.push([raw.c[i], raw.c[i + 1]]);
  setCells(bestTurn(c));
  CARD = CELLS.map((_, i) => blobPath([i], 6, 9));
  svgFrame();
}

// A hex grid can be turned by 60° and still line up exactly (every neighbor stays a neighbor), so a
// board can be drawn in three orientations: as stored, turned 60°, or 120° (180° looks the same size
// as 0°). Pick the one whose tiles come out biggest in the board's space on screen, e.g. a long, flat
// board on an upright phone is drawn on a diagonal. Only positions change: cell ids (and so the
// solution, saved progress and hints) are untouched, and the tiles' symbols stay upright.
const turn60 = ([q, r]) => [-r, q + r];
function bestTurn(cells) {
  const stage = $('#stage');
  const W = stage.clientWidth,
    H = stage.clientHeight;
  if (!W || !H) return cells;
  const size = (cs) => {
    const xs = cs.map(([q, r]) => W3 * S * (q + r / 2)),
      ys = cs.map(([, r]) => 1.5 * S * r);
    const w = Math.max(...xs) - Math.min(...xs) + W3 * S + 16,
      h = Math.max(...ys) - Math.min(...ys) + 2 * S + 16;
    return Math.min(W / w, H / h); // how big the board can be drawn
  };
  let best = cells,
    bestSize = size(cells),
    cs = cells;
  for (let k = 1; k <= 2; k++) {
    cs = cs.map(turn60);
    const sz = size(cs);
    if (sz > bestSize * 1.05) [best, bestSize] = [cs, sz]; // only turn for a real gain
  }
  return best;
}
function svgFrame() {
  const xs = CELLS.map((_, i) => center(i)[0]),
    ys = CELLS.map((_, i) => center(i)[1]);
  const x0 = Math.min(...xs) - (W3 * S) / 2 - 8,
    y0 = Math.min(...ys) - S - 8,
    x1 = Math.max(...xs) + (W3 * S) / 2 + 8,
    y1 = Math.max(...ys) + S + 8;
  board.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
}
// One tile: rounded hex card plus its glyphs. k staggers the pop-in animation within a parcel.
// Classes: sel (selected), paired (in a pencilled pair), release (just freed from a popped parcel).
function tileSVG(i, k) {
  const [x, y] = center(i),
    t = G.P.tiles[i],
    ig = igniteIn(i);
  const cls =
    'tile' +
    (G.sel.includes(i) ? ' sel' : '') +
    (FIT.has(i) ? ' fit' : '') +
    (ig != null ? ' ignite' : '') +
    (pairOf(i) ? ' paired' : '') +
    (G.released && G.released.has(i) ? ' release' : '');
  return (
    `<g class="${cls}" data-i="${i}" style="--k:${k}${ig != null ? `;--ig:${ig}ms` : ''}" role="button" aria-label="${tileLabel(t)}"><g class="pop"><path class="card" d="${CARD[i]}"/>` +
    `<g transform="translate(${(x - 50 * GK).toFixed(2)},${(y - 50 * GK).toFixed(2)}) scale(${GK.toFixed(4)})"><g class="gl">${POS[t.n].map(([gx, gy]) => glyph(t.s, gx, gy, t.c)).join('')}</g></g></g></g>`
  );
}
// A locked parcel's seal: a second thin line in the parcel's color, traced just inside its outline
// (along the tiles' outer edges, clear of their symbols). It draws itself in when the parcel locks.
function sealSVG(g) {
  const dark = TINTS[g.color][1];
  return `<path class="seal${g.sealFresh ? ' enter' : ''}" pathLength="1" d="${blobPath(g.cells, 8, 9)}" stroke="${dark}"/>`;
}
// Dotted and dashed outlines (hints, pencilled pairs): an outline's length is rarely a whole number
// of dash repeats, which leaves a bunched-up or gappy spot where the path starts and ends. Stretching
// each path's length (pathLength) to the nearest whole number of repeats makes the pattern seamless.
// Values must match stroke-dasharray in styles/board.css. Also keeps the hint dots marching smoothly
// across redraws instead of restarting.
const DASH_PERIOD = { hint: 13.1, pair: 14 }; // dash + gap
const HINT_SPIN_MS = 1100; // the .hint animation's duration
export function fitDashes(root) {
  for (const [cls, period] of Object.entries(DASH_PERIOD))
    root.querySelectorAll(`path.${cls}`).forEach((p) => {
      const len = p.getTotalLength();
      if (len > 0) p.setAttribute('pathLength', (Math.max(1, Math.round(len / period)) * period).toFixed(2));
      if (cls === 'hint') p.style.animationDelay = `-${(performance.now() % HINT_SPIN_MS) / 1000}s`;
    });
}
// While a tile is held to pencil a pair: the pair's own dashed outline, drawn in around the two tiles
// over the hold. out: the reverse, for erasing: the outline rewinds the way it was drawn.
// Drawn frame by frame with a dash pattern that stops partway round (masks don't animate on iPhone).
// Appended to `world`; returns the element, to remove() when the hold ends.
// d: the pair's outline (pairOutline(..., 2, 13)).
const GHOST_DELAY = 100,
  GHOST_MS = 350; // with the hold's 450 ms, the outline completes just as the hold does
// like: the pair outline it stands in for (when erasing), to start with its dashes in the same place.
export function pairGhost(world, d, out = false, like = null) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'pair ghost');
  path.setAttribute('d', d);
  world.appendChild(path);
  const period = DASH_PERIOD.pair,
    dash = 8, // as in .pair's stroke-dasharray
    len = path.getTotalLength(),
    total = Math.max(1, Math.round(len / period)) * period; // same pathLength as fitDashes gives
  path.setAttribute('pathLength', total.toFixed(2));
  // where the marching dashes are now (0 for a new pair: its march starts from 0)
  let phase = 0;
  if (like) phase = -parseFloat(getComputedStyle(like).strokeDashoffset) || 0;
  phase = ((phase % period) + period) % period;
  const show = (t) => {
    // t: 0..1 of the outline shown, from its start; dashes as the pair's, shifted by phase
    const v = total * t,
      parts = [];
    let pos = 0,
      ph = phase,
      on = true; // parts alternate dash, gap, dash, ...
    if (ph >= dash) (parts.push(0), (on = false));
    while (pos < v - 1e-6) {
      const seg = Math.min(on ? dash - ph : period - ph, v - pos);
      parts.push(seg);
      pos += seg;
      ph = (ph + seg) % period;
      if (ph < 1e-6 || Math.abs(ph - dash) < 1e-6) on = !on;
      else break;
    }
    if (parts.length % 2 === 0) parts.push(0); // end on a dash, then the long gap
    parts.push(total + period);
    path.style.strokeDasharray = parts.map((x) => x.toFixed(2)).join(' ');
    path.style.fillOpacity = t;
  };
  show(out ? 1 : 0);
  const t0 = performance.now() + GHOST_DELAY;
  const step = (now) => {
    if (!path.isConnected) return;
    const f = Math.min(1, Math.max(0, (now - t0) / GHOST_MS));
    show(out ? 1 - f : f);
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return path;
}
// Holding a locked parcel to unlock it: its thick outline and its seal unwind themselves, the way
// they were drawn in reverse (a thick copy of the outline unwinds over the parcel's normal one).
// wrap: the parcel's .pwrap. Returns a function that puts it back if the hold stops early; once
// unlocked, the redraw replaces it all anyway.
export function unwindLock(wrap) {
  const parcel = wrap.querySelector('.parcel'),
    outline = parcel && parcel.querySelector('.outline'),
    seal = parcel && parcel.querySelector('.seal');
  if (!outline) return () => {};
  const thick = outline.cloneNode();
  thick.setAttribute('class', 'outline unwind');
  thick.setAttribute('fill', 'none');
  outline.after(thick);
  parcel.classList.add('unpinning');
  if (seal) seal.classList.add('unsealing');
  return () => {
    thick.remove();
    parcel.classList.remove('unpinning');
    if (seal) seal.classList.remove('unsealing');
  };
}
// Rebuild the whole board from G and update the Hints / Parcels counters and progress bar.
export function render() {
  FIT = fitsFor(G.sel);
  PAIRFIT = pairsFor(G.sel);
  noteNoFit();
  const inGroup = new Set();
  Object.values(G.groups).forEach((g) => g.cells.forEach((i) => inGroup.add(i)));
  const pairSVG = G.pairs
    .map(
      (p, k) =>
        `<path class="pair${p.fresh ? ' enter' : ''}${PAIRFIT.has(k) ? ' fit' : ''}" d="${pairOutline(center(p.cells[0]), center(p.cells[1]), 2, 13)}"/>`,
    )
    .join('');
  const parcelSVG = Object.values(G.groups)
    .sort((a, b) => (a.id === G.top) - (b.id === G.top)) // G.top is drawn last, i.e. on top
    .map((g) => {
      const [tint, dark] = TINTS[g.color];
      return (
        `<g class="pwrap" data-g="${g.id}"><g class="parcel${g.pinned ? ' pinned' : ''}${g.fresh ? ' enter' : ''}">` +
        `<path class="outline" pathLength="1" d="${blobPath(g.cells, 1.5, 13)}" fill="${tint}" stroke="${dark}"/>` +
        g.cells.map((i, k) => tileSVG(i, k)).join('') +
        (g.pinned ? sealSVG(g) : '') +
        `</g></g>`
      );
    })
    .join('');
  let free = '';
  for (let i = 0; i < N; i++) if (!inGroup.has(i)) free += tileSVG(i, 0);
  const [bx, by] = centroid(CELLS.map((_, i) => i));
  // hints: a dotted outline that circles a parcel from the solution, drawn on top of everything
  const hintSVG = G.hints.map((h) => `<path class="hint" d="${blobPath(h, -3, 15)}"/>`).join('');
  board.innerHTML = `<g id="world"><g>${pairSVG}</g><g>${parcelSVG}</g><path id="trail" d=""/><g>${free}</g><g>${hintSVG}</g><g transform="translate(${bx.toFixed(1)},${by.toFixed(1)})"><g id="hole">${holeSVG()}</g></g></g>`;
  fitDashes(board);
  Object.values(G.groups).forEach((g) => {
    g.fresh = false;
    g.sealFresh = false;
  });
  G.pairs.forEach((p) => (p.fresh = false));
  $('#hintCount').textContent = (G.st && G.st.hints) || 0;
  $('#bUndo').disabled = !G.history.length || G.done;
  // checkpoints: Return works until the board is back at checkpoint 1; the flag shows one is set
  $('#bToMark').disabled = !canReturn();
  $('#bMark').classList.toggle('set', G.checkpoints.length > 0);
  // nothing to mark on an empty board (Start over already goes there)
  const empty = !Object.keys(G.groups).length && !G.pairs.length;
  $('#bMark').disabled = G.done || empty;
  // Start over: nothing to clear at the beginning (hints on the board count as something)
  $('#bReset').disabled = G.done || (empty && !G.hints.length);
  $('#prog').textContent = Object.keys(G.groups).length;
  $('#progBar').style.width = (Object.keys(G.groups).length / GROUPS) * 100 + '%';
  saveProgress(); // every change to the board goes through here, so this keeps the save current
}
// The gold star and rays that appear in the middle when the board is solved.
function holeSVG() {
  let rays = '';
  for (let k = 0; k < 12; k++) {
    const a = (k * 30 * Math.PI) / 180;
    rays += `<path d="M0,0 L${(46 * Math.cos(a - 0.12)).toFixed(1)},${(46 * Math.sin(a - 0.12)).toFixed(1)} L${(46 * Math.cos(a + 0.12)).toFixed(1)},${(46 * Math.sin(a + 0.12)).toFixed(1)}Z" fill="#f6c945" opacity=".55"/>`;
  }
  return `<g class="rays">${rays}</g><g transform="scale(1.9)"><path d="${STAR}" fill="#f2b705" stroke="#a87500" stroke-width="1.4" stroke-linejoin="round"/></g>`;
}
// Light update while a finger is moving: classes and the trail only, no rebuild.
export function paintSel(path) {
  FIT = fitsFor(G.sel);
  PAIRFIT = pairsFor(G.sel);
  board
    .querySelectorAll('#world > g:first-child > .pair')
    .forEach((el, k) => el.classList.toggle('fit', PAIRFIT.has(k)));
  if (!path) noteNoFit(); // taps (swipes pass their path, and get no note mid-gesture)
  board.querySelectorAll('.tile').forEach((el) => {
    const i = +el.dataset.i;
    el.classList.toggle('sel', G.sel.includes(i));
    el.classList.toggle('fit', FIT.has(i));
  });
  const tr = $('#trail');
  if (!tr) return;
  tr.setAttribute(
    'd',
    path && path.length > 1
      ? path
          .map((i, k) => {
            const [x, y] = center(i);
            return (k ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
          })
          .join('')
      : '',
  );
}
// Timer that hides the tip message.
let msgTimer = null;
// Show a tip in the pill under the stats. cls: '' (info), 'ok' or 'bad'.
// sticky keeps it up until the next message; otherwise it fades after a few seconds. setMsg('') hides it.
export function setMsg(t, cls, sticky) {
  const m = $('#msg');
  clearTimeout(msgTimer);
  if (!t) {
    m.classList.remove('show');
    return;
  }
  const icon = cls === 'bad' ? '✕' : cls === 'ok' ? '✓' : 'i';
  const tx = m.querySelector('.tx');
  // the same message already showing: just keep it up (no fade out and in again)
  const same = m.classList.contains('show') && tx && tx.textContent === t && m.dataset.cls === (cls || '');
  if (!same) {
    m.innerHTML = `<span class="ic">${icon}</span><span class="tx"></span>`;
    m.querySelector('.tx').textContent = t;
    m.className = (cls || '') + (t.length > 52 ? ' long' : '');
    m.dataset.cls = cls || '';
    void m.offsetWidth;
    m.classList.add('show');
  }
  if (!sticky)
    msgTimer = setTimeout(
      () => m.classList.remove('show'),
      cls === 'bad' ? 3800 : t.length > 60 ? 4200 : 2800,
    );
}
// Update the on-screen timer (called twice a second from main.js).
export function tick() {
  if (!G.startT || G.done) return;
  // only touch the page when the shown time changes: rewriting the same text still makes the
  // browser repaint the top of the screen, which flickered faint backgrounds on old Android tablets
  const t = fmt(elapsed()), // stands still while paused
    el = $('#timer');
  if (el.textContent !== t) el.textContent = t;
}
