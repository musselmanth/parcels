import { CATS } from './data/puzzles.js';

export let CAT = 'easy',
  PUZZLES = CATS.easy.data;

const KEY = 'parcels-playtest-v1';
export let store = {};
export function loadStore() {
  store = {};
  try {
    store = JSON.parse(localStorage.getItem(CATS[CAT].key) || '{}') || {};
  } catch (e) {}
}
export function save() {
  try {
    localStorage.setItem(CATS[CAT].key, JSON.stringify(store));
  } catch (e) {}
}
export function setCat(k) {
  CAT = CATS[k] ? k : 'easy';
  PUZZLES = CATS[CAT].data;
  loadStore();
  document.querySelectorAll('#catSeg button').forEach((b) => b.classList.toggle('on', b.dataset.c === CAT));
}
export let prefs = { sound: true, seenHelp: false };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(KEY + '-prefs') || '{}'));
} catch (e) {}
export function savePrefs() {
  try {
    localStorage.setItem(KEY + '-prefs', JSON.stringify(prefs));
  } catch (e) {}
}
