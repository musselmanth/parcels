import { $ } from './core/dom.js';

// The three screens and moving between them with a slide.
//   intro -> menu -> game   (left to right: going deeper slides the new screen in from the right,
//                            going back slides it in from the left)
// The current screen is also written to <body data-screen="...">, which CSS uses for the top bar
// (which button shows on the left, which label sits next to the title).

const ORDER = ['intro', 'menu', 'game'];
const EL = { intro: '#intro', menu: '#menu', game: '#app' };
const DURATION = 340; // ms

let current = null;
let previous = null;
const listeners = [];

export const currentScreen = () => current;

// Call fn(name) whenever a screen becomes current.
export function onScreen(fn) {
  listeners.push(fn);
}

// Switch to a screen. animate: false jumps there (used at startup).
export function showScreen(name, { animate = true } = {}) {
  if (name === current) return;
  const from = current;
  previous = from;
  current = name;
  document.body.dataset.screen = name;
  const inc = $(EL[name]);
  inc.getAnimations().forEach((a) => a.cancel());
  inc.classList.add('active');
  listeners.forEach((fn) => fn(name));
  if (!from) return;
  const out = $(EL[from]);
  out.getAnimations().forEach((a) => a.cancel());
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    out.classList.remove('active');
    return;
  }
  // slide by the width of the screen area (screens can be narrower than it on big screens)
  const w = $('#screens').clientWidth,
    dir = ORDER.indexOf(name) > ORDER.indexOf(from) ? 1 : -1;
  const opts = { duration: DURATION, easing: 'cubic-bezier(.3,.7,.2,1)' };
  inc.animate([{ transform: `translateX(${dir * w}px)` }, { transform: 'translateX(0)' }], opts);
  const anim = out.animate(
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(${-dir * w * 0.35}px)`, opacity: 0 },
    ],
    opts,
  );
  anim.onfinish = () => {
    if (current !== from) out.classList.remove('active');
  };
}

// The screen shown before the current one (null at startup).
export const previousScreen = () => previous;
