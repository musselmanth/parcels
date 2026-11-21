// ================= state =================
export const $ = (s) => document.querySelector(s);
export const board = $('#board');

export let timers = [],
  rafs = [];
export const later = (f, ms) => {
  const t = setTimeout(f, ms);
  timers.push(t);
  return t;
};
export function clearFx() {
  timers.forEach(clearTimeout);
  timers = [];
  rafs.forEach(cancelAnimationFrame);
  rafs = [];
}

export const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function buzz(ms) {
  try {
    navigator.vibrate && navigator.vibrate(ms);
  } catch (e) {}
}
