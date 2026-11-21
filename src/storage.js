import { CATS } from './data/puzzles.js';

// Everything saved in the browser (localStorage).
//   - Results per level, under that level's key in CATS (src/data/puzzles.js): {[boardNumber]: record}.
//     A solve record: {time, misses, pops, best, trail, pairs, locks, score, stars, at}.
//     A peek record: {revealed: true, score: 0, stars: 0, at}.
//   - Preferences under 'parcels-playtest-v1-prefs': {sound, seenHelp, cat}.
// Every localStorage call is wrapped in try/catch: storage can be blocked (private mode), and the game should still run.

// The level being played and its list of boards.
export let CAT = 'easy',
  PUZZLES = CATS.easy.data;

const KEY = 'parcels-playtest-v1';
// Saved results for the current level, keyed by board number.
export let store = {};
// Load the current level's saved results.
export function loadStore() {
  store = {};
  try {
    store = JSON.parse(localStorage.getItem(CATS[CAT].key) || '{}') || {};
  } catch (e) {}
}
// Write the current level's results back.
export function save() {
  try {
    localStorage.setItem(CATS[CAT].key, JSON.stringify(store));
  } catch (e) {}
}
// Switch level: load its boards and results, and highlight its tab in the menu.
export function setCat(k) {
  CAT = CATS[k] ? k : 'easy';
  PUZZLES = CATS[CAT].data;
  loadStore();
  document.querySelectorAll('#catSeg button').forEach((b) => b.classList.toggle('on', b.dataset.c === CAT));
}
// Player preferences, loaded once at startup.
export let prefs = { sound: true, seenHelp: false };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(KEY + '-prefs') || '{}'));
} catch (e) {}
export function savePrefs() {
  try {
    localStorage.setItem(KEY + '-prefs', JSON.stringify(prefs));
  } catch (e) {}
}
