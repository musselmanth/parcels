import { $, fmt } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { introArt } from './help.js';
import { onScreen } from './screens.js';
import { loadBest, loadResults } from './storage.js';

// The start screen (#intro): the game's name over a small animated board, How to play, and one
// button per level showing its board sizes, how many boards are solved and its best time.

// Accent color per level (easy to extreme: green, yellow, orange, red).
const LEVEL_COLOR = { easy: '#2bff88', medium: '#ffd43b', hard: '#ffa23b', extreme: '#ff3b5c' };

// Build the level buttons with current progress. onPick(level) is called when one is chosen.
export function renderIntro(onPick) {
  const box = $('#introLevels');
  box.innerHTML = '';
  for (const [k, cat] of Object.entries(CATS)) {
    const results = Object.values(loadResults(k));
    const solved = results.filter((r) => !r.revealed).length;
    const parcels = cat.data.map((p) => p.c.length / 6);
    const lo = Math.min(...parcels),
      hi = Math.max(...parcels);
    const best = loadBest(k);
    const b = document.createElement('button');
    b.className = 'level';
    b.style.setProperty('--lv', LEVEL_COLOR[k] || '#9d8cff');
    b.innerHTML =
      `<span class="lv-name">${cat.name}${best ? `<small class="lv-best">⏱ ${fmt(best.time)}</small>` : ''}</span>` +
      `<span class="lv-meta">${lo === hi ? lo : lo + '–' + hi} parcels · ${solved}/${cat.data.length} solved</span>` +
      `<span class="lv-bar"><i style="width:${(100 * solved) / cat.data.length}%"></i></span>`;
    b.onclick = () => onPick(k);
    box.appendChild(b);
  }
}

// Play the little animated board only while the intro is showing.
export function initIntro(onPick) {
  const art = introArt($('#introArt'));
  onScreen((name) => {
    if (name === 'intro') {
      renderIntro(onPick); // progress may have changed since last time
      art.start();
    } else art.stop();
  });
}
