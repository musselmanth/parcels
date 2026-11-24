import { $, fmt } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { introArt } from './help.js';
import { onScreen } from './screens.js';
import { scrollbox } from './scrollbox.js';
import { loadBest, loadResults } from './storage.js';

// The start screen (#intro): the game's name over a small animated board, How to play, and one
// button per level showing its board sizes, how many boards are completed (solved or the solution viewed) and its best time.

// Accent color per level (easy to extreme: green, yellow, orange, red).
const LEVEL_COLOR = { easy: '#2bff88', medium: '#ffd43b', hard: '#ffa23b', extreme: '#ff3b5c' };

// Build the level buttons with current progress. onPick(level) is called when one is chosen.
export function renderIntro(onPick) {
  const box = $('#introLevels');
  box.innerHTML = '';
  for (const [k, cat] of Object.entries(CATS)) {
    const results = Object.values(loadResults(k));
    const done = results.length; // completed: solved, or the solution viewed
    const parcels = cat.data.map((p) => p.c.length / 6);
    const lo = Math.min(...parcels),
      hi = Math.max(...parcels);
    const best = loadBest(k);
    const b = document.createElement('button');
    b.className = 'level';
    b.style.setProperty('--lv', LEVEL_COLOR[k] || '#9d8cff');
    b.innerHTML =
      `<span class="lv-name">${cat.name}${best ? `<small class="lv-best">⏱ ${fmt(best.time)}</small>` : ''}</span>` +
      `<span class="lv-meta">${lo === hi ? lo : lo + '–' + hi} parcels · ${done}/${cat.data.length} completed</span>` +
      `<span class="lv-bar"><i style="width:${(100 * done) / cat.data.length}%"></i></span>`;
    b.onclick = () => onPick(k);
    box.appendChild(b);
  }
}

// Fit the start screen to the screen when it's too short for it (in-app browsers, small phones,
// large text settings): first the level list gets shorter and scrolls on its own (with the slim bar
// from scrollbox.js; the name and buttons above stay put), down to about two levels' height; only
// if that still isn't enough does everything shrink. zoom shrinks the layout itself; where it isn't
// supported, a transform shrinks the look.
const canZoom = CSS.supports('zoom', '0.5');
const MIN_LIST = 130; // px: the shortest the level list gets before the page shrinks instead
let levelsBar = null;
export function fitIntro() {
  const intro = $('#intro'),
    inner = intro.querySelector('.intro-inner'),
    list = $('#introLevels');
  inner.style.zoom = '';
  inner.style.transform = '';
  list.style.maxHeight = '';
  const cs = getComputedStyle(intro);
  const h = intro.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const w = intro.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const over = inner.offsetHeight - h;
  if (over > 0) list.style.maxHeight = Math.max(MIN_LIST, list.scrollHeight - over) + 'px';
  if (levelsBar) levelsBar();
  const s = Math.min(1, h / inner.offsetHeight, w / inner.offsetWidth);
  if (s < 1) {
    if (canZoom) inner.style.zoom = s.toFixed(3);
    else inner.style.transform = `scale(${s.toFixed(3)})`;
  }
}

// Play the little animated board only while the intro is showing.
export function initIntro(onPick) {
  const art = introArt($('#introArt'));
  levelsBar = scrollbox($('#introLevels'));
  onScreen((name) => {
    if (name === 'intro') {
      renderIntro(onPick); // progress may have changed since last time
      fitIntro();
      art.start();
    } else art.stop();
  });
  new ResizeObserver(fitIntro).observe($('#intro'));
  document.fonts && document.fonts.ready.then(fitIntro); // the title's font can change its size
}
