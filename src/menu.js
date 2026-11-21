import { $, fmt } from './core/dom.js';
import { openPuzzle } from './game.js';
import { G } from './state.js';
import { PUZZLES, store } from './storage.js';

// ================= menu, modals =================
export function closeAll() {
  document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
  $('#menu').classList.remove('open');
}
export function showMenu() {
  const g = $('#grid');
  g.innerHTML = '';
  let solved = 0;
  PUZZLES.forEach((p, i) => {
    const r = store[i + 1],
      b = document.createElement('button');
    b.className =
      'pz' + (r ? (r.revealed ? ' revealed' : ' solved') : '') + (i + 1 === G.cur ? ' current' : '');
    if (r && !r.revealed) solved++;
    b.innerHTML = `<div class="n">${i + 1}</div><div class="st">${r ? (r.revealed ? '🫠 0' : r.stars ? '★'.repeat(r.stars) + '<span style="opacity:.3">' + '★'.repeat(5 - r.stars) + '</span>' : fmt(r.time)) : ''}</div>`;
    b.onclick = () => openPuzzle(i + 1);
    g.appendChild(b);
  });
  $('#nSolved').textContent = solved;
  $('#nTotal').textContent = PUZZLES.length;
  $('#menu').classList.add('open');
}
export function nextUnsolved(from) {
  const L = PUZZLES.length;
  for (let k = 1; k <= L; k++) {
    const n = ((from + k - 1) % L) + 1;
    if (!store[n]) return n;
  }
  return null;
}
