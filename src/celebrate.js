import { $, board, buzz, later, rafs } from './core/dom.js';
import { CELLS, S, center, centroid } from './core/hex.js';
import { burst, groupColors, toScreen } from './fx.js';
import { setReset } from './game.js';
import { render } from './render.js';
import { sfx } from './sound.js';
import { G } from './state.js';
import { COLORS, TH, TINTS } from './themes.js';

// The win animation. Runs in four timed steps (all via later(), so switching boards cancels it),
// then opens the results card.

// The big finish: a wave around the ring, a spinning dance, everything turns gold, star in the middle.
export function celebrate() {
  G.celebrating = true;
  render();
  $('#bReveal').disabled = true;
  $('#mWin').classList.remove('open');
  // spin around the board's own center of mass, scaled so the spinning, drifting board stays on screen
  const [BX, BY] = centroid(CELLS.map((_, i) => i)),
    vb = board.viewBox.baseVal;
  const avail = Math.min(BX - vb.x, vb.x + vb.width - BX, BY - vb.y, vb.y + vb.height - BY);
  const Rb =
    Math.max(
      ...CELLS.map((_, i) => {
        const [x, y] = center(i);
        return Math.hypot(x - BX, y - BY);
      }),
    ) + S;
  const FIT = Math.min(1, avail / (Rb * 1.18 + 10));
  const wraps = [...board.querySelectorAll('.pwrap')]
    .map((el) => {
      const g = G.groups[el.dataset.g],
        [cx, cy] = centroid(g.cells);
      return { el, inner: el.querySelector('.parcel'), g, cx, cy, ang: Math.atan2(cy - BY, cx - BX) };
    })
    .sort((a, b) => a.ang - b.ang);
  // 1. wave
  wraps.forEach((w, k) =>
    later(
      () => {
        w.inner.animate(
          [
            { transform: 'translateY(0) scale(1)' },
            { transform: 'translateY(-18px) scale(1.12)' },
            { transform: 'translateY(0) scale(1)' },
          ],
          { duration: 460, easing: 'cubic-bezier(.3,.7,.4,1)' },
        );
        const [sx, sy] = toScreen(w.cx, w.cy);
        burst(sx, sy, groupColors(w.g), 14, 5);
        sfx.note(k);
        buzz(6);
      },
      120 + k * 95,
    ),
  );
  const t2 = 120 + wraps.length * 95 + 260;
  // 2. dance: the ring spins while parcels drift out, bob, and their symbols twirl
  later(() => {
    board.classList.add('dancing');
    sfx.fanfare();
    const world = $('#world'),
      D = 2300,
      t0 = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / D),
        e = ease(p),
        out = Math.sin(Math.PI * p);
      const sc = 1 - (1 - FIT) * Math.min(1, out * 1.6);
      world.setAttribute(
        'transform',
        `translate(${BX.toFixed(1)},${BY.toFixed(1)}) rotate(${(360 * e).toFixed(2)}) scale(${sc.toFixed(3)}) translate(${(-BX).toFixed(1)},${(-BY).toFixed(1)})`,
      );
      wraps.forEach((w, k) => {
        const bob = Math.sin(p * Math.PI * 7 + k * 0.8) * 9 * out,
          r = 0.18 * out;
        w.el.setAttribute(
          'transform',
          `translate(${((w.cx - BX) * r).toFixed(2)},${((w.cy - BY) * r + bob).toFixed(2)})`,
        );
      });
      if (p < 1) rafs.push(requestAnimationFrame(frame));
      else {
        world.removeAttribute('transform');
        wraps.forEach((w) => w.el.removeAttribute('transform'));
      }
    };
    rafs.push(requestAnimationFrame(frame));
    for (let k = 0; k < 6; k++)
      later(
        () => {
          const w = wraps[(k * 2) % wraps.length];
          const [sx, sy] = toScreen(BX + (w.cx - BX) * 1.2, BY + (w.cy - BY) * 1.2);
          burst(sx, sy, groupColors(w.g), 10, 4);
        },
        300 + k * 300,
      );
  }, t2);
  // 3. merge: every parcel turns gold, the gaps close, a star lands in the middle
  later(() => {
    wraps.forEach((w, k) => {
      const o = w.inner.querySelector('.outline');
      o.animate(
        [
          { fill: o.getAttribute('fill'), stroke: o.getAttribute('stroke') },
          { fill: (TH.merge || {}).fill || '#f8e3a0', stroke: (TH.merge || {}).stroke || '#c99a1c' },
        ],
        { duration: 500, delay: k * 25, fill: 'forwards', easing: 'ease-out' },
      );
      w.inner.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1.02)' }],
        { duration: 600, delay: k * 25, fill: 'forwards', easing: 'cubic-bezier(.3,1.5,.5,1)' },
      );
    });
    $('#hole').classList.add('show');
    const [hx, hy] = toScreen(BX, BY);
    burst(hx, hy, ['#f2b705', '#fff', ...COLORS], 70, 10);
    later(() => {
      burst(0, innerHeight, ['#f2b705', ...COLORS, ...TINTS.map((t) => t[1])], 90, 17, -Math.PI / 3, 0.7);
      burst(
        innerWidth,
        innerHeight,
        ['#f2b705', ...COLORS, ...TINTS.map((t) => t[1])],
        90,
        17,
        (-Math.PI * 2) / 3,
        0.7,
      );
    }, 180);
    sfx.finale();
    buzz([30, 40, 60]);
  }, t2 + 2350);
  // 4. results
  later(() => {
    G.celebrating = false;
    board.classList.remove('dancing');
    setReset(true);
    $('#mWin').classList.add('open');
  }, t2 + 3500);
}
