import { $ } from './core/dom.js';
import { G } from './state.js';

// The move timeline under the progress bar, shown once a checkpoint is set. No words, just a picture
// of where you are:
//   - a faint line, lit in violet from the start up to the head (now)
//   - a small dot for each move on the path to the board as it is now (G.depth of them)
//   - a thin green ring on the line for each checkpoint, where it was set
// Moves add dots and the head steps forward; Undo takes the last dot away and the head steps back;
// Return glides the head back along the line to the checkpoint's ring (the dots in between go out
// one by one from the end, and the ring and head glow as it lands); a new checkpoint's ring blooms
// in around the head; Start over or a new board clears it.
// Positions use transforms, so the moves animate (see #tl in styles/base.css).

const PAD = 7; // px kept clear at each end
let dots = []; // the dot elements, dots[k] is move k + 1
const rings = new Map(); // checkpoint snapshot -> its ring element
let lastCap = 0;

// Room for this many moves across the line: grows in steps, so the spacing doesn't jitter.
const capFor = (n) => Math.max(20, Math.ceil((n + 4) / 10) * 10);

// Restart a one-off animation class on an element.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function paintTimeline() {
  const tl = $('#tl');
  if (!tl) return;
  const head = tl.querySelector('.tl-head'),
    path = tl.querySelector('.tl-path');
  const act = G.tlAct;
  G.tlAct = null;
  const depth = G.depth || 0;
  const cps = G.checkpoints || [];
  tl.classList.toggle('on', cps.length > 0);
  const n = Math.max(depth, ...cps.map((c) => c.depth || 0), 1);
  const cap = act === 'reset' ? capFor(n) : Math.max(capFor(n), lastCap);
  lastCap = cap;
  const W = tl.clientWidth || 300;
  const step = (W - 2 * PAD) / cap;
  const x = (i) => PAD + i * step;
  const rewind = act === 'return' || act === 'reset';
  tl.classList.toggle('rewinding', rewind);

  // dots: drop the ones past the head (one by one from the end, on a rewind), add new ones
  const extra = dots.splice(depth);
  extra.reverse().forEach((el, k) => {
    const delay = rewind ? Math.min(k * 30, 420) : 0;
    el.style.transitionDelay = delay + 'ms';
    el.classList.add('gone');
    setTimeout(() => el.remove(), delay + 300);
  });
  for (let i = dots.length; i < depth; i++) {
    const el = document.createElement('i');
    el.className = 'tl-dot new';
    el.style.transform = `translateX(${x(i + 1)}px)`;
    tl.insertBefore(el, head);
    dots.push(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('new')));
  }
  dots.forEach((el, i) => (el.style.transform = `translateX(${x(i + 1)}px)`));

  // rings: one per checkpoint; dropped ones fade, a new one blooms in at the head
  for (const [cp, el] of rings)
    if (!cps.includes(cp)) {
      rings.delete(cp);
      el.classList.add('gone');
      setTimeout(() => el.remove(), 300);
    }
  for (const cp of cps) {
    let el = rings.get(cp);
    if (!el) {
      el = document.createElement('b');
      el.className = 'tl-cp';
      tl.insertBefore(el, head);
      rings.set(cp, el);
      if (act === 'checkpoint') replay(el, 'new');
    }
    // only the position moves (when the line rescales); nothing else animates it
    el.style.transform = `translateX(${x(cp.depth || 0)}px)`;
  }

  // the head and the lit path: a slow glide back on a rewind, a quick step otherwise
  head.style.transform = `translateX(${x(depth)}px)`;
  path.style.transform = `scaleX(${Math.max(0, x(depth) - PAD)})`;
  if (act === 'return') {
    replay(head, 'landed');
    const el = rings.get(cps[cps.length - 1]);
    if (el) replay(el, 'hit');
  }
}
// keep the spacing right when the screen changes size
addEventListener('resize', () => G.P && paintTimeline());
