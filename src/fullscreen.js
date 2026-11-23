import { $ } from './core/dom.js';
import { track } from './telemetry.js';

// The full screen button in the top bar. Hidden where the browser can't put a page in full screen
// (iPhone Safari), and in the installed app on a phone or tablet, which already fills the screen. An
// installed app on a computer opens in a window, so it keeps the button.
export function initFullscreen() {
  const b = $('#bFull'),
    d = document,
    el = d.documentElement;
  const can = d.fullscreenEnabled || d.webkitFullscreenEnabled;
  const current = () => d.fullscreenElement || d.webkitFullscreenElement;
  // installed as an app. (Not display-mode: fullscreen, which also matches while a browser tab is
  // in full screen, and would hide the button needed to leave it.)
  const appMode = matchMedia(
    '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
  );
  const ua = navigator.userAgent;
  const mobile =
    (navigator.userAgentData && navigator.userAgentData.mobile) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)); // iPad that says it's a Mac
  const show = () =>
    (b.hidden = !can || (!current() && mobile && (appMode.matches || navigator.standalone === true)));
  show();
  appMode.addEventListener?.('change', show);
  if (!can) return;
  const paint = () => {
    const on = !!current();
    b.classList.toggle('on', on);
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    show();
  };
  b.onclick = async () => {
    try {
      if (current()) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      track('setting', { fullscreen: !!current() });
    } catch (e) {}
  };
  d.addEventListener('fullscreenchange', paint);
  d.addEventListener('webkitfullscreenchange', paint);
  paint();
}
