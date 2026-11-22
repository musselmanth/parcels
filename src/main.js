import './styles/theme-neon.css';
import './styles/base.css';
import './styles/board.css';
import './styles/overlays.css';
import './styles/menu.css';
import './styles/help.css';
import './styles/intro.css';
import './styles/responsive.css'; // keep last: adapts the layout for tablets, desktop and landscape
import { $ } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { openPuzzle, reveal } from './game.js';
import { giveHint, popAll } from './actions.js';
import { initHelp } from './help.js';
import { nextUnsolved, renderMenu } from './menu.js';
import { initIntro, renderIntro } from './intro.js';
import { initInstall } from './install.js';
import { initFeedback } from './feedback.js';
import { startTelemetry, track } from './telemetry.js';
import { currentScreen, onScreen, previousScreen, showScreen, trackTopbarHeight } from './screens.js';
import { setMsg, tick } from './render.js';
import { openResults } from './results.js';
import { paintSound, sfx } from './sound.js';
import { G } from './state.js';
import { clearAllProgress, saveProgress } from './progress.js';
import { CAT, clearBests, loadStore, prefs, savePrefs, setCat } from './storage.js';
import './input.js'; // attaches the board's pointer handlers
import { historyStatus, initHistory } from './history.js';

// Entry point (loaded by index.html). Loads the CSS, wires every button and dialog to its action,
// then starts the game on the first unsolved board with the puzzle menu open.

// ---- moving between screens ----
// The level the board on the game screen belongs to (the menu can switch to another level).
let gameLevel = null;
// Open board n of the current level and show the game screen.
function playBoard(n) {
  openPuzzle(n);
  gameLevel = CAT;
  showScreen('game');
}
// Fill in the puzzle menu for the current level and show it.
function toMenu() {
  renderMenu(playBoard, gameLevel === CAT ? G.cur : null);
  showScreen('menu');
}
// Choose a level (intro buttons and the menu's tabs).
function pickLevel(k) {
  prefs.cat = k;
  savePrefs();
  setCat(k);
  toMenu();
}
// Left top-bar button: "All puzzles" on the game screen, "Back" on the menu.
$('#bNav').onclick = () => {
  if (currentScreen() === 'game') return toMenu();
  // back to the puzzle you came from, unless the menu has since switched level
  showScreen(previousScreen() === 'game' && gameLevel === CAT ? 'game' : 'intro');
};
// Saved results were imported or cleared: redraw whatever shows them.
document.addEventListener('historychange', () => {
  if (gameLevel === CAT && G.cur) openPuzzle(G.cur);
  if (currentScreen() === 'menu') renderMenu(playBoard, gameLevel === CAT ? G.cur : null);
  if (currentScreen() === 'intro') renderIntro(pickLevel);
});
// The title goes back to the start screen from anywhere.
$('#bHome').onclick = () => showScreen('intro');
onScreen((name) => {
  track('screen', { name });
  $('#bNav').setAttribute('aria-label', name === 'menu' ? 'Back' : 'All puzzles');
  // the timer pauses while you're off the game screen, and the board is saved as you leave
  if (name === 'game') {
    if (G.pauseT && G.startT) G.startT += Date.now() - G.pauseT;
    G.pauseT = null;
  } else if (G.P && !G.pauseT) {
    G.pauseT = Date.now();
    saveProgress();
  }
});
// save the board in progress if the tab is hidden or closed
document.addEventListener('visibilitychange', () => document.hidden && saveProgress());
addEventListener('pagehide', saveProgress);

// ---- top bar, help and settings dialogs ----
// How to play: until it's been opened once, the start screen's button shimmers to draw the eye.
function paintHelpHint() {
  $('#bIntroHelp').classList.toggle('shimmer', !prefs.seenHelp);
}
function openHelp() {
  $('#mHelp').classList.add('open');
  track('help_open', { first: !prefs.seenHelp });
  if (!prefs.seenHelp) {
    prefs.seenHelp = true;
    savePrefs();
    paintHelpHint();
  }
}
$('#bHelp').onclick = $('#bIntroHelp').onclick = openHelp;
$('#bHelpClose').onclick = () => $('#mHelp').classList.remove('open');
$('#mHelp').onclick = (e) => {
  if (e.target.id === 'mHelp') $('#bHelpClose').onclick();
};
$('#bSound').onclick = () => {
  prefs.sound = !prefs.sound;
  savePrefs();
  track('setting', { sound: prefs.sound });
  paintSound();
  if (prefs.sound) sfx.pin();
};
// Show or hide the Time box above the board (the timer keeps running either way).
function paintTimer() {
  const b = $('#bTimer');
  b.classList.toggle('on', prefs.showTimer);
  b.setAttribute('aria-checked', String(prefs.showTimer));
  document.body.dataset.timer = prefs.showTimer ? 'on' : 'off';
}
$('#bTimer').onclick = () => {
  prefs.showTimer = !prefs.showTimer;
  savePrefs();
  track('setting', { showTimer: prefs.showTimer });
  paintTimer();
};
// Settings opens from the top bar (game screen) or the start screen's button.
$('#bSettings').onclick = $('#bIntroSettings').onclick = () => {
  $('#confirmClear').style.display = 'none';
  historyStatus(''); // clear any old message
  $('#mSettings').classList.add('open');
};
$('#bSettingsClose').onclick = () => $('#mSettings').classList.remove('open');
$('#mSettings').addEventListener('click', (e) => {
  if (e.target.id === 'mSettings') $('#mSettings').classList.remove('open');
});

// ---- board controls and the results / reveal dialogs ----
$('#bPrev').onclick = () => openPuzzle(G.cur - 1);
$('#bNext').onclick = () => openPuzzle(G.cur + 1);
// Start over: everything on the board pops, then it resets
$('#bReset').onclick = () => {
  if (G.done || G.busy || G.celebrating) return;
  track('start_over', { parcels: Object.keys(G.groups).length });
  popAll(() => openPuzzle(G.cur, true));
};
$('#bHint').onclick = giveHint;
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
  n ? playBoard(n) : toMenu();
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
// ---- puzzle menu and clearing history ----
$('#bNextUnsolved').onclick = () => {
  const n = nextUnsolved(0);
  if (n) playBoard(n);
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
  clearAllProgress();
  clearBests();
  G.groups = {}; // so the board on screen isn't saved straight back
  G.pairs = [];
  G.misses = 0;
  G.startT = null;
  loadStore();
  $('#confirmClear').style.display = 'none';
  document.dispatchEvent(new Event('historychange'));
  historyStatus('History cleared.', 'ok');
};

// ---- start up ----
initHelp(); // runs the help sheet's examples while it's open
paintSound();
paintTimer();
setInterval(tick, 500);
document.querySelectorAll('#catSeg button').forEach((b) => (b.onclick = () => pickLevel(b.dataset.c)));
trackTopbarHeight(); // screens leave the floating top bar's height free
initIntro(pickLevel);
initInstall(); // the start screen's Install as an app button
initHistory(); // Settings: send / receive results with a transfer code
initFeedback(); // the playtest note and feedback form
startTelemetry({ sound: prefs.sound, showTimer: prefs.showTimer }); // playtest data (if PLAYTEST_API is set)
setCat(prefs.cat || 'easy');
showScreen('intro', { animate: false }); // the site opens on the start screen
paintHelpHint(); // first visit: How to play shimmers instead of opening by itself
// Everything's set up: fade the page in (see the <style> in index.html). Wait for the fonts too, but
// no more than 0.8s, so the text doesn't visibly switch fonts as they arrive.
Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 800))]).then(
  () => document.documentElement.classList.add('ready'),
);
