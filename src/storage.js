import { CATS } from './data/puzzles.js';

// Everything saved in the browser (localStorage).
//   - Results per level, under that level's key in CATS (src/data/puzzles.js): {[boardNumber]: record}.
//     A solve record: {time, misses, pops, hints, best, trail, pairs, locks, at}. Older ones may also
//     have score and stars (from the old points system); they're ignored, and a missing hints means 0.
//     A viewed-solution record: {revealed: true, at}.
//   - Best time per level under '<level key>-best' (see loadBest below).
//   - Preferences under 'parcels-playtest-v1-prefs': {sound, seenHelp, cat, showTimer}.
//     seenHelp: How to play has been opened (until then its start-screen button shimmers).
//     installDismissed: the player tapped ✕ on the start screen's Install as an app.
// Every localStorage call is wrapped in try/catch: storage can be blocked (private mode), and the game should still run.

// The level being played and its list of boards.
export let CAT = 'easy',
  PUZZLES = CATS.easy.data;

const KEY = 'parcels-playtest-v1';
// Saved results for the current level, keyed by board number.
export let store = {};
// Saved results for any level ({} if none or storage is unavailable).
export function loadResults(level) {
  try {
    return JSON.parse(localStorage.getItem(CATS[level].key) || '{}') || {};
  } catch (e) {
    return {};
  }
}
// Load the current level's saved results.
export function loadStore() {
  store = loadResults(CAT);
}
// Write the current level's results back.
export function save() {
  try {
    localStorage.setItem(CATS[CAT].key, JSON.stringify(store));
  } catch (e) {}
  document.dispatchEvent(new Event('resultsaved')); // sync.js sends it to your other devices
}
// Switch level: load its boards and results, and highlight its tab in the menu.
export function setCat(k) {
  CAT = CATS[k] ? k : 'easy';
  PUZZLES = CATS[CAT].data;
  loadStore();
  document.querySelectorAll('#catSeg button').forEach((b) => b.classList.toggle('on', b.dataset.c === CAT));
}
// Player preferences, loaded once at startup.
export let prefs = { sound: true, seenHelp: false, showTimer: true };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(KEY + '-prefs') || '{}'));
} catch (e) {}
export function savePrefs() {
  try {
    localStorage.setItem(KEY + '-prefs', JSON.stringify(prefs));
  } catch (e) {}
}

// Each level's best time: the fastest solve without hints, any board. Saved under
// '<level key>-best' as {time, board, at}, or nothing yet.
const bestKey = (level) => CATS[level].key + '-best';
export function loadBest(level) {
  try {
    return JSON.parse(localStorage.getItem(bestKey(level)) || 'null');
  } catch (e) {
    return null;
  }
}
export function saveBest(level, rec) {
  try {
    localStorage.setItem(bestKey(level), JSON.stringify(rec));
  } catch (e) {}
}
export function clearBests() {
  for (const k of Object.keys(CATS))
    try {
      localStorage.removeItem(bestKey(k));
    } catch (e) {}
}
