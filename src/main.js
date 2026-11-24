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
import { giveHint, popAll, setCheckpoint, toCheckpoint, undo } from './actions.js';
import { initHelp } from './help.js';
import { initTutorial } from './tutorial.js';
import { nextUnsolved, renderMenu } from './menu.js';
import { initIntro, renderIntro } from './intro.js';
import { initFullscreen } from './fullscreen.js';
import { initInstall } from './install.js';
import { initFeedback } from './feedback.js';
import { startTelemetry, track } from './telemetry.js';
import { currentScreen, onScreen, showScreen, trackTopbarHeight } from './screens.js';
import { lightUp, render, setMsg, tick } from './render.js';
import { openResults } from './results.js';
import { paintSound, sfx } from './sound.js';
import { G } from './state.js';
import { clearAllProgress, saveProgress, setAway } from './progress.js';
import { CAT, clearBests, loadStore, prefs, savePrefs, setCat } from './storage.js';
import './input.js'; // attaches the board's pointer handlers
import { historyStatus, initSync, stopSync } from './sync.js';

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
  // the tiles power up as the board slides in, a little differently per board: only on a fresh or
  // empty board (not a finished one, or one with parcels, pairs or hints on it)
  const empty = !Object.keys(G.groups).length && !G.pairs.length && !G.hints.length;
  if (!G.done && empty) lightUp(`${CAT}:${n}`, 260);
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
// Left top-bar button (a back arrow): the game goes to the puzzle selector, the selector to the start screen.
$('#bNav').onclick = () => {
  if (currentScreen() === 'game') return toMenu();
  showScreen('intro');
};
// Saved results were synced or cleared: redraw whatever shows them. A sync lists the boards it
// changed; the board being played is only reopened if its own result changed (and it isn't
// finished, so a sync never closes the results card).
document.addEventListener('historychange', (e) => {
  const changed = e.detail && e.detail.changed;
  if (gameLevel === CAT && G.cur && (!changed || (changed.includes(CAT + ':' + G.cur) && !G.done)))
    openPuzzle(G.cur);
  if (currentScreen() === 'menu') renderMenu(playBoard, gameLevel === CAT ? G.cur : null);
  if (currentScreen() === 'intro') renderIntro(pickLevel);
});
// The title goes back to the start screen from anywhere.
$('#bHome').onclick = () => showScreen('intro');
onScreen((name) => {
  track('screen', { name });
  $('#bNav').setAttribute('aria-label', name === 'menu' ? 'Back to the start screen' : 'Back to all puzzles');
  // the timer pauses while you're off the game screen, and the board is saved as you leave
  setAway('screen', name !== 'game');
});
// ...and while the tab is hidden (or the phone app is in the background) or the window isn't in
// focus. The board is saved then too, and when the page is closed.
document.addEventListener('visibilitychange', () => setAway('hidden', document.hidden));
addEventListener('blur', () => setAway('blur', true));
addEventListener('focus', () => setAway('blur', false));
addEventListener('pagehide', () => {
  setAway('hidden', true);
  saveProgress();
});
addEventListener('pageshow', () => setAway('hidden', document.hidden));
if (document.hidden) setAway('hidden', true);

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
// Third-tile helper: with two tiles selected, gold outlines on the tiles that would complete them (fitsFor
// in render.js). Off by default.
function paintEasy() {
  const b = $('#bEasy');
  b.classList.toggle('on', prefs.easyMode);
  b.setAttribute('aria-checked', String(prefs.easyMode));
}
$('#bEasy').onclick = () => {
  prefs.easyMode = !prefs.easyMode;
  savePrefs();
  track('setting', { easyMode: prefs.easyMode });
  paintEasy();
  if (G.P) render();
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
$('#bUndo').onclick = undo;
$('#bMark').onclick = setCheckpoint;
$('#bToMark').onclick = toCheckpoint;
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
  // syncing would just bring everything back, so a cleared device stops syncing
  historyStatus(
    stopSync()
      ? 'History cleared. This device has stopped syncing; your other devices keep their results.'
      : 'History cleared.',
    'ok',
  );
};

// ---- start up ----
initHelp(); // runs the help sheet's examples while it's open
// the tutorial's "Play an Easy board": the next unsolved Easy board
initTutorial(() => {
  prefs.cat = 'easy';
  savePrefs();
  setCat('easy');
  playBoard(nextUnsolved(0) || 1);
});
paintSound();
paintTimer();
paintEasy();
setInterval(tick, 500);
document.querySelectorAll('#catSeg button').forEach((b) => (b.onclick = () => pickLevel(b.dataset.c)));
trackTopbarHeight(); // screens leave the floating top bar's height free
initIntro(pickLevel);
initInstall(); // the start screen's Install as an app button
initSync(); // Settings: sync results across devices with a sync code
initFeedback(); // the playtest note and feedback form
startTelemetry({ sound: prefs.sound, showTimer: prefs.showTimer, easyMode: prefs.easyMode }); // playtest data (if PLAYTEST_API is set)
setCat(prefs.cat || 'easy');
showScreen('intro', { animate: false }); // the site opens on the start screen
paintHelpHint(); // first visit: How to play shimmers instead of opening by itself
// Everything's set up: fade the page in (see the <style> in index.html). Wait for the fonts too, but
// no more than 0.8s, so the text doesn't visibly switch fonts as they arrive.
Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 800))]).then(
  () => document.documentElement.classList.add('ready'),
);
initFullscreen();
