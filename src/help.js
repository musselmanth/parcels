import { S, W3, axialCenter, outlinePath } from './core/hex.js';
import { whyInvalid } from './core/rules.js';
import { POS, TH, TINTS, glyph } from './themes.js';

// The "How to play" sheet (#mHelp) and its animated examples. Each example is a small board drawn
// with the same markup and CSS classes as the real board (so it looks and animates the same), plus
// a pretend finger. A script per example plays on a loop while the sheet is open.
// Tapping an example switches it to "play" mode: the loop stops and the player can make, pencil, pop
// and lock parcels on it themselves, with the same gestures as the real board. "Watch" goes back.
//
// To change an example, edit its cells / tiles / script in DEMOS below. Tiles are T(shape, color, count):
// shapes 0 circle, 1 square, 2 triangle, 3 bolt; colors 0 violet, 1 red, 2 yellow, 3 green; count 1-3.

const T = (s, c, n) => ({ s, c, n });
const GK = S / 68; // glyph scale, same as render.js
const STOP = Symbol('stop'); // thrown out of a script when its demo is stopped
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- a small board that can act out moves
class Mini {
  // svg: the <svg> to draw into. cells: [[q, r], ...] axial coordinates. tiles: one per cell (null = blank card).
  constructor(svg, cells, tiles) {
    this.svg = svg;
    this.tiles = tiles;
    this.c = cells.map(([q, r]) => axialCenter(q, r));
    this.card = this.c.map((p) => outlinePath([p], 6, 9));
    const xs = this.c.map((p) => p[0]),
      ys = this.c.map((p) => p[1]);
    const x0 = Math.min(...xs) - (W3 * S) / 2 - 6,
      y0 = Math.min(...ys) - S - 6;
    const x1 = Math.max(...xs) + (W3 * S) / 2 + 6,
      y1 = Math.max(...ys) + S + 6;
    svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    svg.setAttribute('aria-hidden', 'true'); // the text next to each example says what it shows
    svg.innerHTML = `<g class="hw"></g><g class="hfinger"><g class="hf"><circle r="19"/></g></g>`;
    this.world = svg.querySelector('.hw');
    this.finger = svg.querySelector('.hfinger');
    this.gen = 0; // bumped by stop(); a running script notices and ends
    this.mode = 'auto'; // 'auto' = playing its script, 'play' = the player is trying it
    this.msgEl = null; // where say() writes (set by the controller below)
    this.onTry = null; // called when the player taps the example while it's in 'auto' mode
    this.onTapCell = null; // optional: replaces the normal tap handling in 'play' mode
    this.g = null; // the gesture in progress (see down())
    for (const [ev, fn] of [
      ['pointerdown', (e) => this.down(e)],
      ['pointermove', (e) => this.move(e)],
      ['pointerup', (e) => this.up(e, false)],
      ['pointercancel', (e) => this.up(e, true)],
    ])
      svg.addEventListener(ev, fn);
    svg.addEventListener('contextmenu', (e) => this.mode === 'play' && e.preventDefault());
    this.reset();
  }

  // Back to loose tiles, nothing selected, finger hidden.
  reset() {
    this.parcels = []; // [{cells, color, pinned, fresh, badgeFresh}]
    this.pair = null; // {cells, fresh}
    this.sel = [];
    this.shake = [];
    this.released = null;
    this.trail = [];
    this.busy = false; // an animation is running; ignore input
    this.solved = false;
    this.render();
    this.finger.classList.remove('on', 'down');
  }

  // Show a message under the example. cls: '' | 'ok' | 'bad'.
  say(text, cls = '') {
    if (!this.msgEl) return;
    this.msgEl.textContent = text;
    this.msgEl.className = 'hmsg' + (cls ? ' ' + cls : '');
  }

  adj(a, b) {
    const [p, q] = [this.c[a], this.c[b]];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) < W3 * S + 1;
  }

  // Draw the board from this object's state (same layers and classes as render() in render.js).
  render() {
    const inParcel = new Set(this.parcels.flatMap((p) => p.cells));
    const tile = (i, k) => {
      const t = this.tiles[i],
        [x, y] = this.c[i];
      const cls =
        'tile' +
        (this.sel.includes(i) ? ' sel' : '') +
        (this.pair && this.pair.cells.includes(i) ? ' paired' : '') +
        (this.released && this.released.has(i) ? ' release' : '') +
        (this.shake.includes(i) ? ' shake' : '');
      const glyphs = t
        ? `<g transform="translate(${(x - 50 * GK).toFixed(2)},${(y - 50 * GK).toFixed(2)}) scale(${GK.toFixed(4)})"><g class="gl">` +
          POS[t.n].map(([gx, gy]) => glyph(t.s, gx, gy, t.c)).join('') +
          '</g></g>'
        : '';
      return `<g class="${cls}" style="--k:${k}"><g class="pop"><path class="card" d="${this.card[i]}"/>${glyphs}</g></g>`;
    };
    const pts = (cells) => cells.map((i) => this.c[i]);
    const pair = this.pair
      ? `<path class="pair${this.pair.fresh ? ' enter' : ''}" d="${outlinePath(pts(this.pair.cells), 2, 13)}"/>`
      : '';
    const parcels = this.parcels
      .map((p, n) => {
        const [tint, dark] = TINTS[p.color];
        return (
          `<g class="pwrap" data-n="${n}"><g class="parcel${p.pinned ? ' pinned' : ''}${p.fresh ? ' enter' : ''}" style="--pc:${dark}">` +
          `<path class="outline" pathLength="1" d="${outlinePath(pts(p.cells), 1.5, 13)}" fill="${tint}" stroke="${dark}"/>` +
          p.cells.map((i, k) => tile(i, k)).join('') +
          (p.pinned ? this.badge(p, dark) : '') +
          '</g></g>'
        );
      })
      .join('');
    const trail =
      this.trail.length > 1 ? this.trail.map((i, k) => (k ? 'L' : 'M') + this.c[i].join(',')).join('') : '';
    let loose = '';
    this.tiles.forEach((_, i) => {
      if (!inParcel.has(i)) loose += tile(i, 0);
    });
    this.world.innerHTML = `<g>${pair}</g><g>${parcels}</g><path class="htrail" d="${trail}"/><g>${loose}</g>`;
    this.parcels.forEach((p) => (p.fresh = p.badgeFresh = false));
    if (this.pair) this.pair.fresh = false;
  }

  // Padlock badge, placed like badgeSVG() in render.js.
  badge(p, dark) {
    const [a, b, c] = p.cells,
      tri = this.adj(a, b) && this.adj(b, c) && this.adj(a, c);
    const mid = p.cells.find((m) => p.cells.every((o) => o === m || this.adj(m, o)));
    const [x, y] = tri ? [0, 1].map((k) => p.cells.reduce((s, i) => s + this.c[i][k], 0) / 3) : this.c[mid];
    return (
      `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><g class="badge${p.badgeFresh ? ' enter' : ''}"><circle r="11" fill="${dark}" stroke="#fffaf0" stroke-width="2.5"/>` +
      `<rect x="-5" y="-1.5" width="10" height="8" rx="1.5" fill="#fffaf0"/><path d="M-3,-1.5 V-4 a3,3 0 0 1 6,0 V-1.5" fill="none" stroke="#fffaf0" stroke-width="2"/></g></g>`
    );
  }

  // Pause the script. Throws STOP if the demo was stopped meanwhile. Instant in reduced-motion mode.
  wait(ms) {
    const g = this.gen;
    return new Promise((res, rej) =>
      setTimeout(() => (g === this.gen ? res() : rej(STOP)), this.fast ? 0 : ms),
    );
  }

  // ---- the pretend finger
  async point(i, ms = 300) {
    const [x, y] = this.c[i];
    const f = this.finger;
    if (!f.classList.contains('on')) {
      // appear just below the target, then glide onto it
      f.style.transition = 'none';
      f.style.transform = `translate(${x + 30}px,${y + 70}px)`;
      void f.getBBox();
      f.style.transition = '';
      f.classList.add('on');
    }
    f.style.transitionDuration = ms + 'ms, 200ms';
    f.style.transform = `translate(${x}px,${y}px)`;
    await this.wait(ms);
  }
  press(down) {
    this.finger.classList.toggle('down', down);
  }
  async lift() {
    this.press(false);
    this.finger.classList.remove('on');
    await this.wait(250);
  }
  async tap(i) {
    await this.point(i);
    this.press(true);
    await this.wait(150);
    this.press(false);
    await this.wait(120);
  }

  // ---- moves
  // Drag across cells (starting on a pencilled pair takes the whole pair), highlighting as it goes.
  async swipe(cells) {
    await this.point(cells[0]);
    this.press(true);
    const first = this.pair && this.pair.cells.includes(cells[0]) ? this.pair.cells.slice() : [cells[0]];
    this.sel = first.slice();
    this.trail = first.slice();
    this.render();
    await this.wait(160);
    for (const i of cells.slice(1)) {
      if (this.sel.includes(i)) continue;
      await this.point(i, 260);
      this.sel.push(i);
      this.trail.push(i);
      this.render();
      await this.wait(90);
    }
    this.press(false);
    this.trail = [];
  }
  makeParcel(cells, color) {
    this.sel = [];
    if (this.pair && this.pair.cells.some((i) => cells.includes(i))) this.pair = null;
    this.parcels.push({ cells, color, fresh: true });
    this.render();
  }
  makePair(cells) {
    this.sel = [];
    this.pair = { cells, fresh: true };
    this.render();
  }
  // Tried tiles that don't make a parcel: shake them.
  async reject(cells) {
    this.sel = [];
    this.shake = cells;
    this.render();
    await this.wait(450);
    this.shake = [];
    this.render();
  }
  // Pop a parcel with the same animation as breakGroup() in actions.js.
  async pop(n) {
    const el = this.world.querySelector(`.pwrap[data-n="${n}"] .parcel`);
    if (el && !this.fast) {
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
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.14)', offset: 0.45 },
            { transform: 'scale(.84)' },
          ],
          {
            duration: 210,
            easing: 'ease-out',
            fill: 'forwards',
          },
        ),
      );
    }
    await this.wait(215);
    const [p] = this.parcels.splice(n, 1);
    this.released = new Set(p.cells);
    this.render();
    this.released = null;
  }
  // Start the press-and-hold look on parcel n: the ring that fills, and the parcel shrinking a little.
  addRing(n) {
    const p = this.parcels[n];
    const wrap = this.world.querySelector(`.pwrap[data-n="${n}"]`);
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ring.setAttribute('class', 'holdring' + (p.pinned ? ' popping' : ''));
    ring.setAttribute('pathLength', '1');
    ring.setAttribute(
      'd',
      outlinePath(
        p.cells.map((i) => this.c[i]),
        -3,
        15,
      ),
    );
    wrap.appendChild(ring);
    const inner = wrap.querySelector('.parcel');
    inner.classList.add('holding');
    return { ring, inner };
  }
  // Lock parcel n (with the same pop-in badge animation as the game).
  lock(n) {
    const p = this.parcels[n];
    p.pinned = p.badgeFresh = true;
    this.render();
    this.world.querySelector(`.pwrap[data-n="${n}"] .parcel`).classList.add('pinning');
  }
  // The little wiggle a locked parcel does when tapped.
  wiggle(n) {
    const el = this.world.querySelector(`.pwrap[data-n="${n}"] .parcel`);
    el.classList.remove('nudge');
    void el.getBBox();
    el.classList.add('nudge');
  }

  // Script: press and hold on a parcel. It locks, or pops if it was already locked.
  async hold(n) {
    const p = this.parcels[n];
    await this.point(p.cells[1]);
    this.press(true);
    this.addRing(n);
    await this.wait(470);
    this.press(false);
    if (p.pinned) await this.pop(n);
    else this.lock(n);
  }
  // Script: a quick tap on a locked parcel just wiggles it.
  async nudge(n) {
    await this.tap(this.parcels[n].cells[1]);
    this.wiggle(n);
    await this.wait(400);
  }

  // ---- play mode: the player's own taps and swipes (a small copy of input.js + actions.js)
  cellAt(e) {
    const m = this.svg.getScreenCTM();
    if (!m) return -1;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = -1,
      bd = S * 0.93;
    this.c.forEach(([x, y], i) => {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) [bd, best] = [d, i];
    });
    return best;
  }
  parcelOf(i) {
    return this.parcels.findIndex((p) => p.cells.includes(i));
  }
  pairHas(i) {
    return !!this.pair && this.pair.cells.includes(i);
  }
  // Gesture start. this.g: {id, x0, y0, auto} while watching; {n, hold} on a parcel; else
  // {start: cell, moved, dead, units: cells added so far, in order} for a tap or swipe.
  down(e) {
    if (this.g) return;
    const base = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    if (this.mode === 'auto') {
      this.g = { ...base, auto: true }; // don't block scrolling; a tap switches to play mode
      return;
    }
    e.preventDefault();
    if (this.busy) return;
    if (this.solved) {
      this.solved = false;
      this.onReplay();
      return;
    }
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch (_) {}
    const i = this.cellAt(e),
      n = i >= 0 && !this.onTapCell ? this.parcelOf(i) : -1;
    if (n >= 0) this.g = { ...base, n, hold: this.startHold(n) };
    else this.g = { ...base, start: i, moved: false, units: [] };
  }
  move(e) {
    const g = this.g;
    if (!g || g.id !== e.pointerId || g.auto) return;
    const dist = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (g.hold) {
      if (!g.hold.done && dist > 18) this.cancelHold(g.hold);
      return;
    }
    if (this.onTapCell) return;
    if (!g.moved) {
      if (dist < 10) return;
      g.moved = true;
      if (g.start < 0 || this.parcelOf(g.start) >= 0) return void (g.dead = true);
      g.units = [this.pairHas(g.start) ? this.pair.cells.slice() : [g.start]];
      this.showSwipe(g);
    }
    if (g.dead) return;
    const i = this.cellAt(e);
    if (i < 0) return;
    const path = g.units.flat();
    if (path.includes(i)) {
      // slid back onto an earlier tile: drop what came after it
      const k = g.units.findIndex((u) => u.includes(i));
      if (k < g.units.length - 1) {
        g.units = g.units.slice(0, k + 1);
        this.showSwipe(g);
      }
      return;
    }
    if (this.parcelOf(i) >= 0) return;
    const add = (this.pairHas(i) ? this.pair.cells : [i]).filter((c) => !path.includes(c));
    if (path.length + add.length > 3 || !add.some((c) => path.some((q) => this.adj(c, q)))) return;
    g.units.push(add);
    this.showSwipe(g);
  }
  showSwipe(g) {
    this.sel = g.units.flat();
    this.trail = this.sel.slice();
    this.render();
  }
  up(e, cancel) {
    const g = this.g;
    if (!g || g.id !== e.pointerId) return;
    this.g = null;
    const still = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 10;
    if (g.auto) {
      if (!cancel && still) this.onTry();
      return;
    }
    if (g.hold) return cancel ? this.cancelHold(g.hold) : this.releaseHold(g.hold);
    if (this.onTapCell) {
      if (!cancel && still && g.start >= 0) this.onTapCell(g.start);
      return;
    }
    this.trail = [];
    if (cancel || g.dead) {
      this.sel = [];
      this.render();
    } else if (!g.moved) this.tapCell(g.start);
    else {
      const cells = g.units.flat();
      if (cells.length === 3) this.submit(cells);
      else if (cells.length === 2) this.pencil(cells);
      else {
        this.sel = [];
        this.render();
      }
    }
  }
  // Same rules as tapCell() in actions.js.
  tapCell(i) {
    if (i < 0 || this.parcelOf(i) >= 0) {
      this.sel = [];
      return this.render();
    }
    if (this.pairHas(i)) {
      const p = this.pair.cells;
      if (this.sel.length === 2 && p.every((c) => this.sel.includes(c))) {
        this.pair = null;
        this.sel = [];
        this.render();
        return this.say('Pair erased.');
      }
      const u = [...new Set([...this.sel, ...p])];
      this.sel = u.length <= 3 ? u : p.slice();
      if (this.sel.length === 3) return this.submit(this.sel);
      this.render();
      return this.say('Tap a third tile, or tap the pair again to erase it.');
    }
    if (this.sel.length === 2 && this.sel.includes(i)) return this.pencil(this.sel);
    this.sel = this.sel.includes(i) ? this.sel.filter((x) => x !== i) : this.sel.concat(i);
    if (this.sel.length === 3) return this.submit(this.sel);
    this.render();
  }
  pencil(cells) {
    if (!this.adj(cells[0], cells[1])) {
      this.sel = [];
      this.render();
      return this.say('Pairs have to touch.', 'bad');
    }
    this.makePair(cells.slice());
    this.say('Pair pencilled in. Add a third tile when you’re sure.');
  }
  // Same checks as submit() in actions.js.
  submit(cells) {
    cells = cells.slice();
    const links = [
      [0, 1],
      [1, 2],
      [0, 2],
    ].filter(([a, b]) => this.adj(cells[a], cells[b])).length;
    const why = links < 2 ? 'The three tiles have to touch.' : whyInvalid(...cells.map((i) => this.tiles[i]));
    if (why) {
      this.say(why, 'bad');
      this.busy = true;
      this.reject(cells)
        .catch(() => {})
        .finally(() => (this.busy = false));
      return;
    }
    const used = this.parcels.map((p) => p.color);
    this.makeParcel(cells, [0, 2, 1, 3, 4].find((c) => !used.includes(c)) ?? 0);
    if (this.parcels.length * 3 === this.tiles.length) {
      this.solved = true;
      this.say('Solved! Tap the board to start again.', 'ok');
    } else
      this.say(
        this.parcels.length === 1 ? 'Nice! Tap a parcel to pop it, or hold to lock it.' : 'Nice!',
        'ok',
      );
  }
  // Press and hold on a parcel, for real: after 450ms it locks (or pops if locked). Released
  // sooner, it's a tap: pops a loose parcel, wiggles a locked one.
  startHold(n) {
    const h = { p: this.parcels[n], done: false, ...this.addRing(n) };
    h.timer = setTimeout(() => {
      this.cancelHold(h);
      const k = this.parcels.indexOf(h.p);
      if (k < 0) return;
      if (h.p.pinned) this.popNow(k);
      else {
        this.lock(k);
        this.say('Locked in. Taps won’t pop it now; hold again to pop it.', 'ok');
      }
    }, 450);
    return h;
  }
  cancelHold(h) {
    clearTimeout(h.timer);
    h.ring.remove();
    h.inner.classList.remove('holding');
    h.done = true;
  }
  releaseHold(h) {
    if (h.done) return;
    this.cancelHold(h);
    const k = this.parcels.indexOf(h.p);
    if (k < 0) return;
    if (!h.p.pinned) return this.popNow(k);
    this.wiggle(k);
    this.say('Locked. Press and hold to pop it.');
  }
  popNow(k) {
    this.busy = true;
    this.say('Popped.');
    this.pop(k)
      .catch(() => {})
      .finally(() => (this.busy = false));
  }

  // Run a script on a loop until stop(). With reduced motion, run it once instantly (final frame only).
  async play(script) {
    const g = ++this.gen;
    this.fast = reducedMotion();
    try {
      for (;;) {
        this.reset();
        await script(this);
        if (this.fast) {
          this.finger.classList.remove('on');
          return;
        }
        await this.wait(1600);
      }
    } catch (e) {
      if (e !== STOP) throw e;
    } finally {
      if (g === this.gen) this.finger.classList.remove('on');
    }
  }
  stop() {
    this.gen++;
  }
}

// ---------------------------------------------------------------- the examples

// A 6-tile board used by several examples. Cell ids:   0 1 2
//                                                     3 4 5   (bottom row shifted half a tile left)
const SIX = [
  [0, 0],
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
// Top row: three circles (same shape, different colors, different counts) -> a parcel.
// Bottom row: square, triangle, bolt, all violet, all 1 -> a parcel.
// 0 + 3 + 4 also make a valid parcel (a decoy): it leaves 1 + 2 + 5, which don't.
const SIX_TILES = [T(0, 0, 1), T(0, 1, 2), T(0, 2, 3), T(1, 0, 1), T(2, 0, 1), T(3, 0, 1)];

// Examples for the rule, shown one after another on a row of 3 tiles.
const RULE_EXAMPLES = [
  [T(0, 0, 1), T(0, 1, 2), T(0, 2, 3)],
  [T(1, 1, 2), T(2, 1, 2), T(3, 1, 2)],
  [T(0, 3, 1), T(1, 2, 2), T(2, 0, 3)],
  [T(3, 1, 1), T(3, 1, 3), T(3, 3, 2)],
  [T(1, 0, 2), T(2, 2, 2), T(1, 1, 1)],
];

// The three rows of the rule check for some tiles: [{label, values, verdict, ok}].
function ruleChecks(tiles) {
  const rows = [
    ['Shape', (t) => TH.shapes[t.s]],
    ['Color', (t) => TH.colorNames[t.c]],
    ['Count', (t) => t.n],
  ];
  return rows.map(([label, f]) => {
    const v = tiles.map(f),
      distinct = new Set(v).size;
    return {
      label,
      values: v.join(' · '),
      verdict: distinct === 1 ? 'all the same' : distinct === 3 ? 'all different' : 'two match',
      ok: distinct !== 2,
    };
  });
}

const $h = (id) => document.getElementById(id);

// Show the rule example's tiles and fill in its check rows (hidden, so they can be revealed one by one).
// Returns whether the tiles make a parcel.
function ruleSetup(m, tiles) {
  m.tiles = tiles;
  m.parcels = [];
  m.released = new Set([0, 1, 2]);
  m.render();
  m.released = null;
  const checks = ruleChecks(tiles);
  $h('hdRuleVerdict').className = 'hverdict';
  $h('hdRuleChecks').innerHTML = checks
    .map(
      (c) =>
        `<div class="hcheck ${c.ok ? 'ok' : 'bad'}"><span class="k">${c.label}</span><span class="v">${c.values}</span>` +
        `<span class="m">${c.verdict} ${c.ok ? '✓' : '✗'}</span></div>`,
    )
    .join('');
  return checks.every((c) => c.ok);
}
// The verdict line, and the outline (valid) or a shake (not valid).
function ruleVerdict(m, ok) {
  const v = $h('hdRuleVerdict');
  v.textContent = ok ? '✓ A parcel' : '✗ Not a parcel: two match, one doesn’t';
  v.className = 'hverdict show ' + (ok ? 'ok' : 'bad');
  if (ok) m.makeParcel([0, 1, 2], 3);
  else return m.reject([0, 1, 2]);
}

// id of the <svg> -> what it shows:
//   cells, tiles  the board
//   script(m)     what the finger does each loop while watching
//   intro         message when the player taps it to try it themselves
//   setup(m)      optional: the starting position for trying it (default: all tiles loose)
//   onTapCell     optional: custom tap handling while trying it (the rule example)
//   still(m)      optional: the frame to show instead of the animation when reduced motion is on
//                 (default: the script's last frame)
const DEMOS = {
  // Split a 9-tile board into its 3 parcels.
  hdGoal: {
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [-1, 2],
      [0, 2],
      [1, 2],
    ],
    tiles: [
      T(0, 0, 1),
      T(0, 1, 2),
      T(0, 2, 3),
      T(1, 3, 2),
      T(2, 3, 2),
      T(0, 1, 1),
      T(3, 3, 2),
      T(1, 2, 3),
      T(3, 0, 2),
    ],
    intro: 'Your turn: split this board into 3 parcels. Swipe across 3 tiles to make one.',
    script: async (m) => {
      await m.wait(500);
      await m.swipe([0, 1, 2]);
      m.makeParcel([0, 1, 2], 0);
      await m.wait(450);
      await m.swipe([3, 6, 4]);
      m.makeParcel([3, 6, 4], 2);
      await m.wait(450);
      await m.swipe([5, 8, 7]);
      m.makeParcel([5, 8, 7], 1);
      await m.lift();
      await m.wait(1200);
    },
  },

  // Walk through rule examples, checking shape, color and count one at a time.
  hdRule: {
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    tiles: RULE_EXAMPLES[0],
    intro: 'Your turn: tap a tile to swap it for another, and watch the checks.',
    script: async (m) => {
      for (const ex of RULE_EXAMPLES) {
        const ok = ruleSetup(m, ex);
        await m.wait(600);
        for (const row of $h('hdRuleChecks').children) {
          row.classList.add('show');
          await m.wait(450);
        }
        await ruleVerdict(m, ok);
        await m.wait(1900);
      }
    },
    setup: (m) => ruleShowAll(m, RULE_EXAMPLES[0].slice()),
    // swap the tapped tile for a random different one (never a copy of another tile in the row)
    onTapCell: (m, i) => {
      const key = (t) => `${t.s}${t.c}${t.n}`,
        taken = new Set(m.tiles.map(key));
      let t;
      do
        t = T(
          Math.floor(Math.random() * 4),
          Math.floor(Math.random() * 4),
          1 + Math.floor(Math.random() * 3),
        );
      while (taken.has(key(t)));
      const tiles = m.tiles.slice();
      tiles[i] = t;
      ruleShowAll(m, tiles);
    },
  },

  // A rule-following parcel that is still wrong.
  hdDecoy: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Your turn: find the one split where every tile fits.',
    script: async (m) => {
      m.say('These three follow the rule, so they make a parcel…');
      await m.wait(700);
      await m.swipe([0, 3, 4]);
      m.makeParcel([0, 3, 4], 3);
      await m.wait(1100);
      m.say('…but the three tiles left over can’t make one.', 'bad');
      await m.swipe([1, 2, 5]);
      await m.reject([1, 2, 5]);
      await m.wait(900);
      m.say('So that parcel was wrong. Pop it and look again.');
      await m.tap(0);
      await m.pop(0);
      await m.wait(700);
      m.say('Every tile fits. There’s only one way to do it.', 'ok');
      await m.swipe([0, 1, 2]);
      m.makeParcel([0, 1, 2], 0);
      await m.wait(350);
      await m.swipe([3, 4, 5]);
      m.makeParcel([3, 4, 5], 2);
      await m.lift();
      await m.wait(1500);
    },
  },

  // Swipe across 3; on alternate loops, tap them one by one instead.
  hdSwipe: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Swipe across 3 tiles, or tap them one at a time.',
    script: async (m) => {
      m.round = (m.round || 0) + 1;
      await m.wait(400);
      if (m.round % 2) await m.swipe([0, 1, 2]);
      else
        for (const i of [0, 1, 2]) {
          await m.tap(i);
          m.sel.push(i);
          m.render();
        }
      m.makeParcel([0, 1, 2], 0);
      await m.lift();
      await m.wait(900);
    },
  },

  // Swipe 2 to pencil a pair, later swipe from the pair onto the third tile.
  hdPair: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Swipe across 2 tiles to pencil in a pair.',
    script: async (m) => {
      await m.wait(400);
      await m.swipe([3, 4]);
      m.makePair([3, 4]);
      await m.lift();
      await m.wait(1000);
      await m.swipe([4, 5]);
      m.makeParcel([3, 4, 5], 2);
      await m.lift();
      await m.wait(900);
    },
  },

  // Tap a parcel to pop it.
  hdPop: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Tap the parcel to pop it.',
    setup: (m) => m.makeParcel([0, 1, 2], 1),
    still: (m) => m.makeParcel([0, 1, 2], 1),
    script: async (m) => {
      m.makeParcel([0, 1, 2], 1);
      await m.wait(900);
      await m.tap(1);
      await m.pop(0);
      await m.lift();
      await m.wait(900);
    },
  },

  // Hold to lock, a tap only wiggles it, hold again to pop.
  hdLock: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Press and hold the parcel to lock it.',
    setup: (m) => m.makeParcel([3, 4, 5], 4),
    still: (m) => {
      m.makeParcel([3, 4, 5], 4);
      m.lock(0);
    },
    script: async (m) => {
      m.makeParcel([3, 4, 5], 4);
      await m.wait(700);
      await m.hold(0);
      await m.lift();
      await m.wait(700);
      await m.nudge(0);
      await m.lift();
      await m.wait(500);
      await m.hold(0);
      await m.lift();
      await m.wait(700);
    },
  },
};

// Rule example in play mode: everything shown at once.
function ruleShowAll(m, tiles) {
  const ok = ruleSetup(m, tiles);
  for (const row of $h('hdRuleChecks').children) row.classList.add('show');
  ruleVerdict(m, ok)?.catch(() => {});
}

// The three parcel shapes, drawn still.
function drawShapes() {
  const shapes = [
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  ];
  document.querySelectorAll('#hdShapes svg').forEach((svg, k) => {
    const m = new Mini(svg, shapes[k], [null, null, null]);
    m.parcels = [{ cells: [0, 1, 2], color: [0, 2, 1][k] }];
    m.render();
  });
}

// ---------------------------------------------------------------- watching vs. trying, per example
// Each example's box (.hdemo) gets a message line and a corner button: "Try it" while watching,
// "Watch" while trying.
let demos = null;
function build() {
  drawShapes();
  demos = Object.entries(DEMOS).map(([id, d]) => {
    const svg = $h(id),
      box = svg.closest('.hdemo');
    const m = new Mini(svg, d.cells, d.tiles.slice());
    const msg = document.createElement('div');
    msg.className = 'hmsg';
    svg.after(msg);
    m.msgEl = msg;
    const chip = document.createElement('button');
    chip.className = 'hchip';
    box.prepend(chip);
    const demo = { m, d, box, chip };
    m.onTry = () => tryIt(demo);
    m.onReplay = () => tryIt(demo);
    if (d.onTapCell) m.onTapCell = (i) => d.onTapCell(m, i);
    chip.onclick = () => (m.mode === 'auto' ? tryIt(demo) : watch(demo));
    return demo;
  });
}
// Stop the animation and hand the example to the player.
function tryIt({ m, d, box, chip }) {
  m.stop();
  m.mode = 'play';
  box.classList.add('playing');
  chip.textContent = '↺ Watch';
  chip.setAttribute('aria-label', 'Watch the example again');
  m.tiles = d.tiles.slice();
  m.reset();
  if (d.setup) d.setup(m);
  m.say(d.intro);
}
// Go back to playing the example's animation.
function watch({ m, d, box, chip }) {
  m.mode = 'auto';
  box.classList.remove('playing');
  chip.textContent = 'Try it';
  chip.setAttribute('aria-label', 'Try this example yourself');
  m.say('');
  m.tiles = d.tiles.slice();
  if (d.still && reducedMotion()) {
    m.stop();
    m.reset();
    d.still(m);
  } else m.play(d.script);
}
function start() {
  if (!demos) build();
  demos.forEach(watch);
}
function stop() {
  if (demos) demos.forEach(({ m }) => m.stop());
}

// ---------------------------------------------------------------- "more below" hint
// A bouncing button over the bottom of the sheet until the player has scrolled to the end.
function moreHint(sheet) {
  const btn = $h('bHelpMore');
  const update = () =>
    btn.classList.toggle('gone', sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 24);
  sheet.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  btn.onclick = () =>
    sheet.scrollBy({ top: sheet.clientHeight * 0.7, behavior: reducedMotion() ? 'auto' : 'smooth' });
  return update;
}

// Run the examples whenever the help sheet is open, however it was opened or closed.
// Call once at startup, after setTheme() (the examples use the theme's colors).
export function initHelp() {
  const modal = $h('mHelp'),
    sheet = modal.querySelector('.sheet');
  const updateHint = moreHint(sheet);
  let open = false;
  const sync = () => {
    const now = modal.classList.contains('open');
    if (now === open) return;
    open = now;
    if (open) {
      start();
      sheet.scrollTop = 0;
      requestAnimationFrame(updateHint);
    } else stop();
  };
  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['class'] });
  sync();
}
