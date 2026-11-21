// Small shared helpers: DOM lookup, timers that can all be cancelled at once, time formatting, vibration.

// Shorthand for document.querySelector.
export const $ = (s) => document.querySelector(s);
// The <svg> the puzzle is drawn into.
export const board = $('#board');

// Every timeout started with later() and every animation frame pushed onto rafs, so clearFx()
// can stop all pending animations when the player switches boards.
export let timers = [],
  rafs = [];
// setTimeout that clearFx() can cancel. Use it for anything tied to the current board.
export const later = (f, ms) => {
  const t = setTimeout(f, ms);
  timers.push(t);
  return t;
};
// Cancel every pending later() timer and tracked animation frame.
export function clearFx() {
  timers.forEach(clearTimeout);
  timers = [];
  rafs.forEach(cancelAnimationFrame);
  rafs = [];
}

// Milliseconds -> "m:ss".
export const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Haptic feedback on phones that support it. ms is a number or a vibrate() pattern array.
export function buzz(ms) {
  try {
    navigator.vibrate && navigator.vibrate(ms);
  } catch (e) {}
}
