import { $ } from './core/dom.js';
import { prefs, savePrefs } from './storage.js';
import { track } from './telemetry.js';

// "Install as an app", offered on the start screen only (the button lives in #intro).
//   - Android / desktop Chrome and Edge: the browser fires `beforeinstallprompt` when the site can be
//     installed. We hold on to it and show our button; tapping the button opens the browser's own
//     install dialog (it can only be opened from a tap, never automatically).
//   - iPhone / iPad: there's no install prompt. The button reveals how to do it by hand
//     (Share, then Add to Home Screen).
// Hidden when already running as an installed app, or after the player taps its ✕.

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad asking for desktop sites

let deferred = null; // the browser's install prompt, saved for when the button is tapped

export function initInstall() {
  const box = $('#introInstall'),
    tip = $('#installTip');
  const show = (on) => (box.hidden = !on);
  if (standalone() || prefs.installDismissed) return show(false);

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's own banner from appearing; we offer the button instead
    deferred = e;
    show(true);
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    show(false);
  });
  if (isIOS()) show(true);

  $('#bInstall').onclick = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      track('install', { outcome });
      deferred = null;
      if (outcome === 'accepted') show(false);
    } else {
      tip.hidden = !tip.hidden; // iPhone / iPad: show the steps
      track('install', { outcome: 'ios_tip' });
    }
  };
  $('#bInstallX').onclick = () => {
    prefs.installDismissed = true;
    savePrefs();
    show(false);
  };
}
