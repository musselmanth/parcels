import { $ } from './core/dom.js';
import { currentScreen, onScreen } from './screens.js';

// The phone's back button / back swipe (Android, iPhone Safari) and the browser's Back button step
// back through the game instead of leaving the page: close the open dialog, else game -> puzzle
// selector -> start screen. From the start screen with nothing open, Back leaves as usual.
//
// How: while there's somewhere to go back to, one extra history entry is kept on top (the "guard").
// Back pops it (popstate); we take one step back in the game and, if there's still somewhere to go,
// put the guard back. Nothing else in the game touches history.

// Each dialog's own way of closing (so it tidies up as it would when tapped), top-most last.
const CLOSERS = [
  ['mReveal', 'bRevealNo'],
  ['mFeedback', 'bFeedbackClose'],
  ['mWin', 'bWinClose'],
  ['mSettings', 'bSettingsClose'],
  ['mTutorial', 'bTutClose'],
  ['mHelp', 'bHelpClose'],
];
const openDialog = () => CLOSERS.find(([m]) => $('#' + m) && $('#' + m).classList.contains('open'));
const somewhereBack = () => !!openDialog() || currentScreen() !== 'intro';

let armed = false;
function arm() {
  if (armed || !somewhereBack()) return;
  history.pushState({ parcelsGuard: true }, '');
  armed = true;
}

export function initBackNav() {
  addEventListener('popstate', () => {
    armed = false;
    const d = openDialog();
    if (d) {
      const b = $('#' + d[1]);
      b ? b.click() : $('#' + d[0]).classList.remove('open');
    } else if (currentScreen() !== 'intro') $('#bNav').click();
    else {
      // nothing to step back from (the guard was left over after going back with the on-screen
      // buttons): carry on out of the page
      history.back();
      return;
    }
    // after the screen or dialog has changed
    setTimeout(arm, 0);
  });
  // re-arm whenever there's somewhere to go back to again: a new screen, or a dialog opening
  onScreen(() => setTimeout(arm, 0));
  const watch = new MutationObserver(() => arm());
  for (const [m] of CLOSERS)
    if ($('#' + m)) watch.observe($('#' + m), { attributes: true, attributeFilter: ['class'] });
}
