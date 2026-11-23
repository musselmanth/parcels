import { $, fmt } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { CAT, PUZZLES, loadBest, store } from './storage.js';
import { loadAllProgress } from './progress.js';
import { resultOf } from './scoring.js';

// The puzzle picker (#menu screen): level tabs and a grid of boards with their status.
// Switching to it is done by showScreen('menu') in screens.js; this module only fills it in.

// Close every dialog.
export function closeAll() {
  document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
}
// Build the board grid for the current level. onPick(n) is called when a board is chosen;
// board number `current` (if any) is outlined as the one in play.
// Boards in progress show how many parcels are placed, e.g. "3/6".
export function renderMenu(onPick, current) {
  const wip = loadAllProgress(CAT);
  const g = $('#grid');
  g.innerHTML = '';
  let solved = 0;
  PUZZLES.forEach((p, i) => {
    const r = store[i + 1],
      b = document.createElement('button');
    const w = !r && wip[i + 1];
    b.className =
      'pz' +
      (r ? (r.revealed ? ' revealed' : ' solved') : w ? ' wip' : '') +
      (i + 1 === current ? ' current' : '');
    if (r && !r.revealed) solved++;
    // finished: Perfect!, N Hints or Loser; in progress: parcels placed so far
    const status = r
      ? `<span class="res-${resultOf(r).kind}">${resultOf(r).short}</span>`
      : w
        ? `${(w.groups || []).length}/${p.c.length / 6}`
        : '';
    // finished boards get a mark next to their number: a green check if solved, a red x if the
    // solution was viewed
    const tick = !r
      ? ''
      : r.revealed
        ? '<span class="tick x" aria-label="solution viewed">✗</span>'
        : '<span class="tick" aria-label="solved">✓</span>';
    b.innerHTML = `<div class="n">${i + 1}${tick}</div><div class="st">${status}</div>`;
    b.onclick = () => onPick(i + 1);
    g.appendChild(b);
  });
  $('#nSolved').textContent = solved;
  $('#nTotal').textContent = PUZZLES.length;
  const best = loadBest(CAT);
  $('#lvlBest').innerHTML = best ? ` · best time <b>${fmt(best.time)}</b>` : '';
  $('#lvlName').textContent = ` ${CATS[CAT].name}`; // shown next to the title while the menu is open
}
// The first board after `from` (wrapping around) with no saved result, or null.
export function nextUnsolved(from) {
  const L = PUZZLES.length;
  for (let k = 1; k <= L; k++) {
    const n = ((from + k - 1) % L) + 1;
    if (!store[n]) return n;
  }
  return null;
}
