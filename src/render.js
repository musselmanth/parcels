import { $, board, fmt } from './core/dom.js';
import { CELLS, GROUPS, N, S, W3, adj, blobPath, center, centroid, setCells } from './core/hex.js';
import { G, pairOf } from './state.js';
import { saveProgress } from './progress.js';
import { POS, STAR, TINTS, glyph, tileLabel } from './themes.js';

// Drawing. The board is one <svg> rebuilt from G by render() after every move. Layers, bottom to top:
// pencilled pairs, parcels (outline + their tiles + lock badge), the swipe trail, loose tiles, and the
// star shown when the board is solved. CSS classes drive the animations (see styles/board.css).
// Also the tip message under the stats and the timer.

// load a board's shape: cells come stored as a flat list q0,r0,q1,r1,...
export function loadShape(raw) {
  const c = [];
  for (let i = 0; i < raw.c.length; i += 2) c.push([raw.c[i], raw.c[i + 1]]);
  setCells(c);
  CARD = CELLS.map((_, i) => blobPath([i], 6, 9));
  svgFrame();
}

// Pre-computed rounded-hexagon path for each cell (rebuilt per board).
let CARD = [];
const GK = S / 68; // glyph scale: keeps every symbol well inside its hexagon

// Fit the SVG viewBox around the board.
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
    t = G.P.tiles[i];
  const cls =
    'tile' +
    (G.sel.includes(i) ? ' sel' : '') +
    (pairOf(i) ? ' paired' : '') +
    (G.released && G.released.has(i) ? ' release' : '');
  return (
    `<g class="${cls}" data-i="${i}" style="--k:${k}" role="button" aria-label="${tileLabel(t)}"><g class="pop"><path class="card" d="${CARD[i]}"/>` +
    `<g transform="translate(${(x - 50 * GK).toFixed(2)},${(y - 50 * GK).toFixed(2)}) scale(${GK.toFixed(4)})"><g class="gl">${POS[t.n].map(([gx, gy]) => glyph(t.s, gx, gy, t.c)).join('')}</g></g></g></g>`
  );
}
// The padlock badge on a locked parcel.
function badgeSVG(g) {
  // Triangle (all three touch): center of the parcel. Line or bend: center of the middle tile.
  const [a, b, c] = g.cells,
    tri = adj(a, b) && adj(b, c) && adj(a, c);
  const mid = g.cells.find((m) => g.cells.every((o) => o === m || adj(m, o)));
  const [x, y] = tri ? centroid(g.cells) : center(mid);
  const dark = TINTS[g.color][1];
  // position lives on the outer group; the pop-in animation runs on the inner one so it can't override the position
  return (
    `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><g class="badge${g.badgeFresh ? ' enter' : ''}"><circle r="11" fill="${dark}" stroke="#fffaf0" stroke-width="2.5"/>` +
    `<rect x="-5" y="-1.5" width="10" height="8" rx="1.5" fill="#fffaf0"/><path d="M-3,-1.5 V-4 a3,3 0 0 1 6,0 V-1.5" fill="none" stroke="#fffaf0" stroke-width="2"/></g></g>`
  );
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
// Rebuild the whole board from G and update the Misses / Parcels counters and progress bar.
export function render() {
  const inGroup = new Set();
  Object.values(G.groups).forEach((g) => g.cells.forEach((i) => inGroup.add(i)));
  const pairSVG = G.pairs
    .map((p) => `<path class="pair${p.fresh ? ' enter' : ''}" d="${blobPath(p.cells, 2, 13)}"/>`)
    .join('');
  const parcelSVG = Object.values(G.groups)
    .sort((a, b) => (a.id === G.top) - (b.id === G.top)) // G.top is drawn last, i.e. on top
    .map((g) => {
      const [tint, dark] = TINTS[g.color];
      return (
        `<g class="pwrap" data-g="${g.id}"><g class="parcel${g.pinned ? ' pinned' : ''}${g.fresh ? ' enter' : ''}" style="--pc:${dark}">` +
        `<path class="outline" pathLength="1" d="${blobPath(g.cells, 1.5, 13)}" fill="${tint}" stroke="${dark}"/>` +
        g.cells.map((i, k) => tileSVG(i, k)).join('') +
        (g.pinned ? badgeSVG(g) : '') +
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
    g.badgeFresh = false;
  });
  G.pairs.forEach((p) => (p.fresh = false));
  $('#misses').textContent = G.misses;
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
  board.querySelectorAll('.tile').forEach((el) => el.classList.toggle('sel', G.sel.includes(+el.dataset.i)));
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
  m.innerHTML = `<span class="ic">${icon}</span><span class="tx"></span>`;
  m.querySelector('.tx').textContent = t;
  m.className = (cls || '') + (t.length > 52 ? ' long' : '');
  void m.offsetWidth;
  m.classList.add('show');
  if (!sticky)
    msgTimer = setTimeout(
      () => m.classList.remove('show'),
      cls === 'bad' ? 3800 : t.length > 60 ? 4200 : 2800,
    );
}
// Update the on-screen timer (called twice a second from main.js).
export function tick() {
  if (G.startT && !G.done) $('#timer').textContent = fmt(Date.now() - G.startT);
}
