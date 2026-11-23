import { S, W3, axialCenter, outlinePath, pairOutline } from './core/hex.js';
import { whyInvalid } from './core/rules.js';
import { fitDashes, pairGhost, unwindLock } from './render.js';
import { COLOR_NAMES, GOLD, POS, SHAPE_NAMES, TINTS, glyph } from './tiles.js';

// The "How to play" sheet (#mHelp) and its animated examples. Each example is a small board drawn
// with the same markup and CSS classes as the real board (so it looks and animates the same), plus
// a pretend finger. A script per example plays on a loop while the sheet is open.
// Tapping an example (except the watch-only ones) switches it to "play" mode: the loop stops and the player can make, pencil, pop
// and lock parcels on it themselves, with the same gestures as the real board. "Watch" goes back.
//
// To change an example, edit its cells / tiles / script in DEMOS below. Tiles are T(shape, color, count):
// shapes 0 circle, 1 square, 2 triangle, 3 bolt; colors 0 violet, 1 red, 2 yellow, 3 green; count 1-3.

export const T = (s, c, n) => ({ s, c, n });
const GK = S / 68; // glyph scale, same as render.js
const STOP = Symbol('stop'); // thrown out of a script when its demo is stopped
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- a small board that can act out moves
export class Mini {
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
    this.onTry = null; // called when the player taps the example while it's in 'auto' mode (null: watch-only)
    this.g = null; // the gesture in progress (see down())
    // For the tutorial (src/tutorial.js), in play mode:
    this.glow = null; // cells circled with the hint's gold dots, to show where to play
    this.guard = null; // (kind, cells) -> '' to allow a move, or a message to refuse it; kind: make | pair | pop
    this.onEvent = null; // (kind, cells) after a move; kind: make | reject | pair | pop | lock
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
    this.parcels = []; // [{cells, color, pinned, fresh, sealFresh}]
    this.top = null; // the parcel drawn on top (last pressed or made)
    this.pair = null; // {cells, fresh}
    this.sel = [];
    this.shake = [];
    this.released = null;
    this.trail = [];
    this.tip = null; // fingertip position while gliding (extends the trail)
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
      ? `<path class="pair${this.pair.fresh ? ' enter' : ''}" d="${pairOutline(this.c[this.pair.cells[0]], this.c[this.pair.cells[1]], 2, 13)}"/>`
      : '';
    const parcels = this.parcels
      .map((p, n) => [p, n])
      .sort(([a], [b]) => (a === this.top) - (b === this.top)) // this.top drawn last, i.e. on top
      .map(([p, n]) => {
        const [tint, dark] = TINTS[p.color];
        return (
          `<g class="pwrap" data-n="${n}"><g class="parcel${p.pinned ? ' pinned' : ''}${p.fresh ? ' enter' : ''}">` +
          `<path class="outline" pathLength="1" d="${outlinePath(pts(p.cells), 1.5, 13)}" fill="${tint}" stroke="${dark}"/>` +
          p.cells.map((i, k) => tile(i, k)).join('') +
          (p.pinned ? this.seal(p, dark) : '') +
          '</g></g>'
        );
      })
      .join('');
    const trail = this.trailPath();
    let loose = '';
    this.tiles.forEach((_, i) => {
      if (!inParcel.has(i)) loose += tile(i, 0);
    });
    const glow = this.glow
      ? `<path class="hint" d="${outlinePath(
          this.glow.map((i) => this.c[i]),
          -3,
          15,
        )}"/>`
      : '';
    this.world.innerHTML = `<g>${pair}</g><g>${parcels}</g><path class="htrail" d="${trail}"/><g>${loose}</g>${glow}`;
    fitDashes(this.world);
    this.parcels.forEach((p) => (p.fresh = p.sealFresh = false));
    if (this.pair) this.pair.fresh = false;
  }

  // A locked parcel's seal, like sealSVG() in render.js.
  seal(p, dark) {
    return `<path class="seal${p.sealFresh ? ' enter' : ''}" pathLength="1" d="${outlinePath(
      p.cells.map((i) => this.c[i]),
      8,
      9,
    )}" stroke="${dark}"/>`;
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
  // Tap tiles one at a time, selecting each (tapping a pencilled pair selects both of its tiles).
  async tapSelect(cells) {
    for (const i of cells) {
      await this.tap(i);
      if (this.pairHas(i)) this.sel = [...new Set([...this.sel, ...this.pair.cells])];
      else this.sel.push(i);
      this.render();
    }
  }
  // Drag across cells (starting on a pencilled pair takes the whole pair), highlighting as it goes.
  async swipe(cells) {
    await this.point(cells[0]);
    this.press(true);
    const first = this.pairHas(cells[0]) ? this.pair.cells.slice() : [cells[0]];
    this.sel = first.slice();
    this.trail = first.slice();
    this.render();
    await this.wait(40); // just a touch down, then straight into the glide
    await this.glide(cells);
    this.press(false); // lift as soon as the last tile is reached
    this.trail = [];
    this.render();
  }
  // Slide the finger through the centers of `cells` in one smooth motion (no stops on the way),
  // at a nearly even speed (only a slight ease at the ends, so it doesn't linger on them). Each tile is selected as the finger enters it, and the
  // trail follows the fingertip. msPerTile sets the speed.
  glide(cells, msPerTile = 180) {
    const pts = cells.map((i) => this.c[i]);
    const cum = [0]; // distance along the path to each tile's center
    for (let k = 1; k < pts.length; k++)
      cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const total = cum[cum.length - 1];
    const select = (i) => {
      if (this.sel.includes(i)) return;
      this.sel.push(i);
      this.trail.push(i);
      this.render();
    };
    if (this.fast || total === 0) {
      cells.forEach(select);
      return Promise.resolve();
    }
    const f = this.finger,
      g = this.gen,
      dur = msPerTile * (cells.length - 1),
      t0 = performance.now();
    // mostly linear, a quarter ease-in-out: the ends run at 3/4 of the average speed, never stopping
    const ease = (p) => 0.75 * p + 0.25 * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    f.style.transition = 'opacity .2s'; // the finger's position is driven frame by frame below
    let next = 1; // index in cells of the next tile to select
    return new Promise((res, rej) => {
      const frame = (now) => {
        if (g !== this.gen) {
          f.style.transition = '';
          return rej(STOP);
        }
        const p = Math.min(1, (now - t0) / dur),
          d = ease(p) * total;
        let k = 0;
        while (k < cum.length - 2 && cum[k + 1] < d) k++;
        const u = Math.min(1, (d - cum[k]) / (cum[k + 1] - cum[k] || 1));
        const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u,
          y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u;
        f.style.transform = `translate(${x}px,${y}px)`;
        this.tip = [x, y];
        // a tile counts once the finger is inside its hexagon (a little before its center)
        while (next < cells.length && d >= cum[next] - S * 0.45) select(cells[next++]);
        const tr = this.world.querySelector('.htrail');
        if (tr) tr.setAttribute('d', this.trailPath());
        if (p < 1) requestAnimationFrame(frame);
        else {
          this.tip = null;
          f.style.transition = '';
          res();
        }
      };
      requestAnimationFrame(frame);
    });
  }
  // The swipe trail: through the selected tiles' centers, then on to the fingertip while gliding.
  trailPath() {
    const pts = this.trail.map((i) => this.c[i]);
    if (this.tip && pts.length) pts.push(this.tip);
    return pts.length > 1
      ? pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')
      : '';
  }
  makeParcel(cells, color) {
    this.sel = [];
    if (this.pair && this.pair.cells.some((i) => cells.includes(i))) this.pair = null;
    this.parcels.push((this.top = { cells, color, fresh: true }));
    this.render();
  }
  makePair(cells) {
    this.sel = [];
    // after a hold the outline was already drawn in, so no pop-in animation
    this.pair = { cells, fresh: !this.calm };
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
    this.top = p; // the pressed parcel comes to the top, ring and animations included
    // moving it restarts CSS animations, so drop the one-shot ones first (no redrawn outline or seal)
    wrap
      .querySelectorAll('.enter, .pinning, .nudge')
      .forEach((el) => el.classList.remove('enter', 'pinning', 'nudge'));
    wrap.parentNode.appendChild(wrap);
    const inner = wrap.querySelector('.parcel');
    inner.classList.add('holding');
    // locked: its thick outline and seal unwind themselves over the hold
    if (p.pinned) return { ring: null, unwind: unwindLock(wrap), inner };
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ring.setAttribute('class', 'holdring');
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
    return { ring, unwind: null, inner };
  }
  // Lock parcel n (its seal draws itself in, as in the game).
  lock(n) {
    const p = this.parcels[n];
    p.pinned = p.sealFresh = true;
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

  // Script: press and hold on a parcel. It locks, or unlocks if it was already locked.
  async hold(n) {
    const p = this.parcels[n];
    await this.point(p.cells[1]);
    this.press(true);
    this.addRing(n);
    await this.wait(470);
    this.press(false);
    if (p.pinned) {
      p.pinned = false;
      this.render();
    } else this.lock(n);
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
      n = i >= 0 ? this.parcelOf(i) : -1;
    if (n >= 0) this.g = { ...base, n, hold: this.startHold(n) };
    else
      this.g = { ...base, start: i, moved: false, units: [], thold: i >= 0 ? this.startTileHold(i) : null };
  }
  move(e) {
    const g = this.g;
    if (!g || g.id !== e.pointerId || g.auto) return;
    const dist = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (g.hold) {
      if (!g.hold.done && dist > 18) this.cancelHold(g.hold);
      return;
    }
    if (g.thold && g.thold.done) return; // the hold already pencilled or erased a pair
    if (!g.moved) {
      if (dist < 10) return;
      g.moved = true;
      if (g.thold) this.cancelTileHold(g.thold);
      g.thold = null;
      if (g.start < 0 || this.parcelOf(g.start) >= 0) return void (g.dead = true);
      // tiles already selected by taps are kept at the front (as in input.js)
      const first = this.pairHas(g.start) ? this.pair.cells.slice() : [g.start];
      const pre = this.sel.filter((c) => !first.includes(c));
      const keep = pre.length === this.sel.length && pre.length + first.length <= 3 ? pre : [];
      g.pre = keep.length ? 1 : 0;
      g.units = keep.length ? [keep, first] : [first];
      this.showSwipe(g);
    }
    if (g.dead) return;
    const i = this.cellAt(e);
    if (i < 0) return;
    const path = g.units.flat();
    if (path.includes(i)) {
      // slid back onto an earlier tile: drop what came after it
      const k = g.units.findIndex((u) => u.includes(i));
      if (k >= (g.pre || 0) && k < g.units.length - 1) {
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
    this.trail = g.units.slice(g.pre || 0).flat();
    this.render();
  }
  up(e, cancel) {
    const g = this.g;
    if (!g || g.id !== e.pointerId) return;
    this.g = null;
    const still = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 10;
    if (g.auto) {
      if (!cancel && still && this.onTry) this.onTry();
      return;
    }
    if (g.hold) return cancel ? this.cancelHold(g.hold) : this.releaseHold(g.hold);
    if (g.thold) {
      if (g.thold.done) return;
      this.cancelTileHold(g.thold);
    }
    this.trail = [];
    if (cancel || g.dead) {
      this.sel = [];
      this.render();
    } else if (!g.moved) this.tapCell(g.start);
    else {
      const cells = g.units.flat();
      if (cells.length === 3) this.submit(cells);
      else if (cells.length === 2) {
        this.sel = cells;
        this.render();
        this.say('Tap a third tile, or hold one of these to pencil them in as a pair.');
      } else {
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
        this.sel = [];
        return this.render();
      }
      const u = [...new Set([...this.sel, ...p])];
      this.sel = u.length <= 3 ? u : p.slice();
      if (this.sel.length === 3) return this.submit(this.sel);
      this.render();
      return this.say('Tap a third tile, or hold the pair to erase it.');
    }
    // a second tile has to be one that could make a parcel with the first (as in actions.js)
    if (this.sel.length === 1 && !this.sel.includes(i)) {
      const a = this.sel[0];
      const reach =
        this.adj(a, i) ||
        this.c.some((_, k) => k !== a && k !== i && this.adj(k, a) && this.adj(k, i) && this.parcelOf(k) < 0);
      if (!reach)
        return this.say(
          'Too far from the tile you picked. Choose one that could make a parcel with it.',
          'bad',
        );
    }
    this.sel = this.sel.includes(i) ? this.sel.filter((x) => x !== i) : this.sel.concat(i);
    if (this.sel.length === 3) return this.submit(this.sel);
    this.render();
    if (this.sel.length === 2)
      this.say('Tap a third tile, or hold one of these to pencil them in as a pair.');
  }
  // Same rules as pencilPair() in actions.js: touching tiles or the two ends of a bend make a pair;
  // with only one tile that fits between them it becomes that parcel; anything else isn't a pair.
  pencil(cells) {
    const [a, b] = cells;
    if (this.refused('pair', cells)) return;
    if (this.adj(a, b)) {
      this.makePair([a, b]);
      this.say('Pair pencilled in. Add a third tile when you’re sure.');
      return this.emit('pair', [a, b]);
    }
    const mid = this.c.map((_, k) => k).filter((k) => k !== a && k !== b && this.adj(k, a) && this.adj(k, b));
    if (mid.length === 2) {
      this.makePair([a, b]);
      this.say('Pair pencilled in. One of the two tiles between them makes the parcel.');
      return this.emit('pair', [a, b]);
    }
    if (mid.length === 1 && this.parcelOf(mid[0]) < 0) return this.submit([a, mid[0], b]);
    this.sel = [];
    this.render();
    this.say(
      mid.length ? 'The tile between them is already in a parcel.' : 'That’s not a valid pair.',
      'bad',
    );
  }
  // The tutorial's say on a move: true (and the move is dropped) if it refuses it.
  refused(kind, cells) {
    const why = this.guard && this.guard(kind, cells);
    if (!why) return false;
    this.sel = [];
    this.render();
    this.say(why, 'bad');
    return true;
  }
  emit(kind, cells) {
    if (this.onEvent) this.onEvent(kind, cells);
  }
  // Same checks as submit() in actions.js.
  submit(cells) {
    cells = cells.slice();
    if (this.refused('make', cells)) return;
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
      this.emit('reject', cells);
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
    this.emit('make', cells);
  }
  // Press and hold on a parcel, for real: after 450ms it locks (or pops if locked). Released
  // sooner, it's a tap: pops a loose parcel, wiggles a locked one.
  // Same as startTileHold() in actions.js: holding a pencilled pair erases it; holding one of 2
  // selected tiles (or another tile with 1 selected) pencils them in as a pair.
  startTileHold(i) {
    if (this.parcelOf(i) >= 0) return null;
    let act = null;
    if (this.pairHas(i)) act = { erase: true, cells: this.pair.cells.slice() };
    else if (this.sel.length === 2 && this.sel.includes(i)) act = { cells: this.sel.slice() };
    else if (this.sel.length === 1 && this.sel[0] !== i && !this.pairHas(this.sel[0]))
      act = { cells: [this.sel[0], i] };
    if (!act) return null;
    const h = { done: false, hidden: null };
    if (act.erase) {
      // the pair's outline undraws itself; the real one hides meanwhile
      h.hidden = this.world.querySelector('.pair');
      if (h.hidden) h.hidden.style.visibility = 'hidden';
    }
    h.ring = this.tileRing(act.cells, act.erase, h.hidden);
    h.timer = setTimeout(() => {
      h.hidden = null;
      this.cancelTileHold(h);
      if (act.erase) {
        if (this.refused('erase', act.cells)) return;
        this.pair = null;
        this.sel = [];
        this.render();
        this.say('Pair erased.');
        this.emit('erase', act.cells);
      } else {
        this.calm = true;
        this.pencil(act.cells);
        this.calm = false;
      }
    }, 450);
    return h;
  }
  cancelTileHold(h) {
    clearTimeout(h.timer);
    h.ring.remove();
    if (h.hidden) h.hidden.style.visibility = '';
    h.done = true;
  }
  // While holding two tiles: the pair's own dashed outline drawing itself in, or undrawing itself
  // when the hold will erase the pair.
  tileRing(cells, erase, like) {
    return pairGhost(this.world, pairOutline(this.c[cells[0]], this.c[cells[1]], 2, 13), erase, like);
  }
  // Script: press and hold on tile i to pencil `cells` in as a pair.
  async holdPair(i, cells) {
    await this.point(i);
    this.press(true);
    const ring = this.tileRing(cells);
    await this.wait(470);
    ring.remove();
    this.press(false);
  }
  startHold(n) {
    const h = { p: this.parcels[n], done: false, ...this.addRing(n) };
    h.timer = setTimeout(() => {
      h.unwind = null; // unlocking: stays unwound until the redraw
      this.cancelHold(h);
      const k = this.parcels.indexOf(h.p);
      if (k < 0) return;
      if (h.p.pinned) {
        h.p.pinned = false;
        this.render();
        this.say('Unlocked. Tap it to pop it.');
      } else {
        this.lock(k);
        this.say('Locked in. Taps won’t pop it now; hold again to unlock it.', 'ok');
        this.emit('lock', h.p.cells);
      }
    }, 450);
    return h;
  }
  cancelHold(h) {
    clearTimeout(h.timer);
    if (h.ring) h.ring.remove();
    if (h.unwind) h.unwind();
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
    this.say('Locked. Press and hold to unlock it.');
  }
  popNow(k) {
    const cells = this.parcels[k].cells;
    if (this.refused('pop', cells)) return;
    this.busy = true;
    this.say('Popped.');
    this.pop(k)
      .catch(() => {})
      .finally(() => {
        this.busy = false;
        this.emit('pop', cells);
      });
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
    ['Shape', (t) => SHAPE_NAMES[t.s]],
    ['Color', (t) => COLOR_NAMES[t.c]],
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
//   intro         message when the player taps it to try it themselves (no intro: watch-only)
//   setup(m)      optional: the starting position for trying it (default: all tiles loose)
//   ways          optional: gesture choices shown as a switch under the example, e.g. ['Swipe', 'Tap'];
//                 the script reads the chosen one from m.way
//   pages         optional: the number of examples the script steps through (m.page); adds a
//                 ‹ • • • › pager under the example, and swiping the example left or right
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

  // Walk through rule examples, checking shape, color and count one at a time. One example per
  // loop (m.page); it moves on to the next by itself until the player picks one with the pager,
  // then it stays on that one.
  hdRule: {
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    tiles: RULE_EXAMPLES[0],
    pages: RULE_EXAMPLES.length,
    script: async (m) => {
      m.paintPager();
      // a fixed time per example, so the timer bar under the dots can show when the next one comes
      const total = 8000,
        t0 = Date.now();
      m.paintTimer(m.held || m.fast ? 0 : total);
      const ok = ruleSetup(m, RULE_EXAMPLES[m.page]);
      await m.wait(900);
      for (const row of $h('hdRuleChecks').children) {
        row.classList.add('show');
        await m.wait(800);
      }
      await ruleVerdict(m, ok);
      if (m.fast) return;
      if (m.held) for (;;) await m.wait(60000); // stay on the example the player picked
      await m.wait(Math.max(1500, total - (Date.now() - t0)));
      m.page = (m.page + 1) % RULE_EXAMPLES.length;
    },
  },

  // A rule-following parcel that is still wrong.
  hdDecoy: {
    cells: SIX,
    tiles: SIX_TILES,
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

  // Make a parcel by swiping across 3 tiles, or by tapping them one at a time.
  hdSwipe: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Swipe across 3 tiles, or tap them one at a time.',
    ways: ['Swipe', 'Tap'],
    script: async (m) => {
      await m.wait(400);
      if (m.way === 'Swipe') await m.swipe([0, 1, 2]);
      else await m.tapSelect([0, 1, 2]);
      m.makeParcel([0, 1, 2], 0);
      await m.lift();
      await m.wait(900);
    },
  },

  // Pencil in a pair, then add the third tile later.
  // Swipe or tap 2 tiles and hold one of them; then swipe from the pair onto the third, or tap the
  // pair and the third.
  hdPair: {
    cells: SIX,
    tiles: SIX_TILES,
    intro: 'Tap or swipe 2 tiles, then hold one, to pencil a pair.',
    ways: ['Swipe', 'Tap'],
    script: async (m) => {
      await m.wait(400);
      if (m.way === 'Swipe') await m.swipe([3, 4]);
      else await m.tapSelect([3, 4]);
      await m.wait(250);
      await m.holdPair(4, [3, 4]);
      m.calm = true;
      m.makePair([3, 4]);
      m.calm = false;
      m.say('Pair pencilled in…');
      await m.lift();
      await m.wait(1000);
      if (m.way === 'Swipe') await m.swipe([4, 5]);
      else await m.tapSelect([3, 5]);
      m.makeParcel([3, 4, 5], 2);
      m.say('…and the third tile added.', 'ok');
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

  // Hold to lock, a tap only wiggles it, hold again to unlock.
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
// Each example's box (.hdemo) gets a message line. Examples with an intro also get a corner
// button ("Try it" while watching, "Watch" while trying); examples with ways get a Swipe | Tap switch.
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
    const demo = { m, d, box, chip: null };
    if (d.intro) {
      demo.chip = document.createElement('button');
      demo.chip.className = 'hchip';
      box.prepend(demo.chip);
      demo.chip.onclick = () => (m.mode === 'auto' ? tryIt(demo) : watch(demo));
      m.onTry = m.onReplay = () => tryIt(demo);
    } else box.classList.add('watchonly');
    if (d.ways) {
      m.way = d.ways[0];
      const sw = document.createElement('div');
      sw.className = 'hways';
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Show it with');
      sw.innerHTML = d.ways.map((w) => `<button data-w="${w}">${w}</button>`).join('');
      sw.onclick = (e) => {
        const w = e.target.dataset && e.target.dataset.w;
        if (!w) return;
        m.way = w;
        watch(demo); // replay the animation the chosen way
      };
      svg.after(sw); // under the board, above the message line
      demo.ways = sw;
    }
    if (d.pages) {
      m.page = 0;
      const pg = document.createElement('div');
      pg.className = 'hpager';
      pg.innerHTML =
        `<button data-step="-1" aria-label="Previous example">‹</button>` +
        [...Array(d.pages)]
          .map((_, n) => `<button class="dot" data-n="${n}" aria-label="Example ${n + 1}"></button>`)
          .join('') +
        `<button data-step="1" aria-label="Next example">›</button>`;
      const go = (n) => {
        m.page = (n + d.pages) % d.pages;
        m.held = true;
        watch(demo);
      };
      pg.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        go(b.dataset.n != null ? +b.dataset.n : m.page + +b.dataset.step);
      };
      m.paintPager = () =>
        pg.querySelectorAll('.dot').forEach((b, n) => {
          b.classList.toggle('on', n === m.page);
          b.setAttribute('aria-current', n === m.page);
        });
      // A thin bar under the dots that fills until the next example appears. It goes away once
      // the player picks an example (then it stays put), so it also shows that it stopped.
      const timer = document.createElement('div');
      timer.className = 'htimer';
      timer.innerHTML = '<i></i>';
      const bar = timer.firstChild;
      m.paintTimer = (ms) => {
        timer.classList.toggle('off', !ms);
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        if (!ms) return;
        void bar.offsetWidth; // restart from empty
        bar.style.transition = `transform ${ms}ms linear`;
        bar.style.transform = 'scaleX(1)';
      };
      // swipe the example sideways for the next or previous one
      let x0 = null,
        y0 = 0;
      svg.addEventListener('pointerdown', (e) => ([x0, y0] = [e.clientX, e.clientY]));
      svg.addEventListener('pointerup', (e) => {
        if (x0 == null) return;
        const dx = e.clientX - x0,
          dy = e.clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(m.page + (dx < 0 ? 1 : -1));
      });
      svg.addEventListener('pointercancel', () => (x0 = null));
      box.append(pg, timer);
    }
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
function watch({ m, d, box, chip, ways }) {
  m.mode = 'auto';
  box.classList.remove('playing');
  if (chip) {
    chip.textContent = 'Try it';
    chip.setAttribute('aria-label', 'Try this example yourself');
  }
  if (ways) for (const b of ways.children) b.classList.toggle('on', b.dataset.w === m.way);
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
  demos.forEach((demo) => {
    demo.m.page = 0; // each time the sheet opens, the rule examples start from the first, on their own
    demo.m.held = false;
    watch(demo);
  });
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
// Call once at startup.
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

// The start screen's decoration: the 9-tile example board, already solved. Once per page load it
// plays a short sequence, then stays as it ends:
//   1. a small version of the win celebration: parcels hop in turn, the board spins while the
//      symbols twirl
//   2. as the spin slows to a stop, the board drops down to sit just above the title and the
//      outlines fade to gold
// Returns {start, stop}.
const INTRO_PARCELS = [
  { cells: [0, 1, 2], color: 0 },
  { cells: [3, 6, 4], color: 2 },
  { cells: [5, 8, 7], color: 1 },
];
export function introArt(svg) {
  const d = DEMOS.hdGoal;
  let m = null,
    played = false,
    running = false,
    dropY = 0, // how far the board drops at the end (board units)
    drop = null; // <g> wrapped around the board that does the drop
  const gold = () => GOLD.stroke;

  function build() {
    m = new Mini(svg, d.cells, d.tiles.slice());
    m.parcels = INTRO_PARCELS.map((p) => ({ ...p }));
    m.render();
    // the drop moves a wrapper around the board, so it can overlap the spin (which moves the board)
    drop = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.insertBefore(drop, m.world);
    drop.appendChild(m.world);
    // spin around the board's own middle
    m.world.style.transformBox = 'fill-box';
    m.world.style.transformOrigin = 'center';
    // Frame the board in a square big enough for the whole circle its corners sweep while it
    // spins (plus room for the hop), so the spin never spills over the title underneath.
    const [cx, cy] = [0, 1].map((k) => m.c.reduce((t, p) => t + p[k], 0) / m.c.length);
    const r = Math.max(...m.c.map(([x, y]) => Math.hypot(x - cx, y - cy))) + S + 20;
    svg.setAttribute(
      'viewBox',
      `${(cx - r).toFixed(1)} ${(cy - r).toFixed(1)} ${(2 * r).toFixed(1)} ${(2 * r).toFixed(1)}`,
    );
    // after the spin the board drops to the bottom of that square, just above the title
    dropY = cy + r - (Math.max(...m.c.map((p) => p[1])) + S) - 6;
  }

  // The end state: parcels made, gold outlines, dropped down, nothing animating.
  function finalState() {
    m.stop(); // ends the sequence if it's still running
    running = false;
    svg.classList.remove('dancing');
    svg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    m.sel = [];
    m.trail = [];
    m.tip = null;
    m.parcels = INTRO_PARCELS.map((p) => ({ ...p }));
    m.render();
    m.world.querySelectorAll('.outline').forEach((o) => o.setAttribute('stroke', gold()));
    drop.style.transform = `translateY(${dropY}px)`;
  }

  async function play() {
    running = true;
    try {
      await m.wait(700);
      // 1a. wave: each parcel hops in turn
      [...m.world.querySelectorAll('.parcel')].forEach((el, k) =>
        el.animate(
          [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(-16px) scale(1.1)' },
            { transform: 'translateY(0) scale(1)' },
          ],
          { duration: 440, delay: k * 150, easing: 'cubic-bezier(.3,.7,.4,1)' },
        ),
      );
      await m.wait(650);
      // 1b. one spin of the whole board, symbols twirling
      svg.classList.add('dancing');
      m.world.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
        duration: 1600,
        easing: 'cubic-bezier(.6,0,.3,1)',
      });
      // 2. as the spin slows to a stop, the board drops toward the title and the outlines turn gold
      await m.wait(1200);
      drop.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${dropY}px)` }], {
        duration: 800,
        easing: 'cubic-bezier(.3,.7,.3,1)',
        fill: 'forwards',
      });
      m.world.querySelectorAll('.outline').forEach((o, k) =>
        o.animate([{ stroke: o.getAttribute('stroke') }, { stroke: gold() }], {
          duration: 900,
          delay: k * 120,
          easing: 'ease-in-out',
          fill: 'forwards',
        }),
      );
      await m.wait(400); // the spin ends
      svg.classList.remove('dancing');
      await m.wait(560);
      finalState();
    } catch (e) {
      if (e !== STOP) throw e;
    }
  }

  return {
    start() {
      if (!m) build();
      if (played) return; // once per page load; afterwards it just shows the finished board
      played = true;
      if (reducedMotion()) finalState();
      else play();
    },
    // Leaving the start screen mid-sequence jumps to the end state.
    stop() {
      if (m && running) finalState();
    },
  };
}
