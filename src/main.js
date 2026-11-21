import './styles/theme-neon.css';
import './styles/base.css';
import './styles/board.css';
import './styles/overlays.css';
import './styles/menu.css';
import { $ } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { openPuzzle, reveal } from './game.js';
import { nextUnsolved, showMenu } from './menu.js';
import { setMsg, tick } from './render.js';
import { openResults } from './results.js';
import { paintSound, sfx } from './sound.js';
import { G } from './state.js';
import { loadStore, prefs, savePrefs, setCat } from './storage.js';
import './input.js'; // attaches the board's pointer handlers
import { setTheme } from './themes.js';

$('#bMenu').onclick = showMenu;
$('#bMenuClose').onclick = () => $('#menu').classList.remove('open');
$('#bHelp').onclick = () => $('#mHelp').classList.add('open');
$('#bHelpClose').onclick = () => {
  $('#mHelp').classList.remove('open');
  prefs.seenHelp = true;
  savePrefs();
};
$('#mHelp').onclick = (e) => {
  if (e.target.id === 'mHelp') $('#bHelpClose').onclick();
};
$('#bSound').onclick = () => {
  prefs.sound = !prefs.sound;
  savePrefs();
  paintSound();
  if (prefs.sound) sfx.pin();
};
$('#bSettings').onclick = () => {
  $('#confirmClear').style.display = 'none';
  $('#mSettings').classList.add('open');
};
$('#bSettingsClose').onclick = () => $('#mSettings').classList.remove('open');
$('#mSettings').addEventListener('click', (e) => {
  if (e.target.id === 'mSettings') $('#mSettings').classList.remove('open');
});

$('#bPrev').onclick = () => openPuzzle(G.cur - 1);
$('#bNext').onclick = () => openPuzzle(G.cur + 1);
$('#bReset').onclick = () => {
  if (!G.done) openPuzzle(G.cur, true);
};
$('#bReveal').onclick = () => {
  if (G.done) openResults();
  else $('#mReveal').classList.add('open');
};
$('#bRevealNo').onclick = () => $('#mReveal').classList.remove('open');
$('#bRevealYes').onclick = () => {
  $('#mReveal').classList.remove('open');
  reveal();
};
$('#bWinNext').onclick = () => {
  const n = nextUnsolved(G.cur);
  n ? openPuzzle(n) : showMenu();
};
$('#bWinClose').onclick = () => $('#mWin').classList.remove('open');
// tapping outside the results card closes it; if the tap landed on a top button (menu, sound, help), that button works too
$('#mWin').addEventListener('click', (e) => {
  if (e.target.id !== 'mWin') return;
  const m = $('#mWin');
  m.classList.remove('open');
  const under = document.elementFromPoint(e.clientX, e.clientY),
    btn = under && under.closest('.top button');
  if (btn) btn.click();
});
$('#bNextUnsolved').onclick = () => {
  const n = nextUnsolved(0);
  if (n) openPuzzle(n);
};
$('#bClear').onclick = () => {
  $('#confirmClear').style.display = 'block';
};
$('#bClearNo').onclick = () => {
  $('#confirmClear').style.display = 'none';
};
$('#bClearYes').onclick = () => {
  for (const k of Object.keys(CATS)) {
    try {
      localStorage.removeItem(CATS[k].key);
    } catch (e) {}
  }
  loadStore();
  $('#confirmClear').style.display = 'none';
  $('#mSettings').classList.remove('open');
  openPuzzle(1);
  setMsg('History cleared.', 'ok');
};

setTheme('neon');
paintSound();
setInterval(tick, 500);
document.querySelectorAll('#catSeg button').forEach(
  (b) =>
    (b.onclick = () => {
      prefs.cat = b.dataset.c;
      savePrefs();
      setCat(prefs.cat);
      G.cur = 0;
      showMenu();
    }),
);
setCat(prefs.cat || 'easy');
openPuzzle(nextUnsolved(0) || 1);
showMenu(); // the site opens on the level and puzzle picker
if (!prefs.seenHelp) $('#mHelp').classList.add('open');
