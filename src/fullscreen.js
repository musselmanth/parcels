import { $ } from './core/dom.js';
import { track } from './telemetry.js';

// The full screen button in the top bar. Hidden where the browser can't put a page in full screen
// (iPhone Safari) and when the game already runs as an installed app.
export function initFullscreen() {
  const b = $('#bFull'),
    d = document,
    el = d.documentElement;
  const can = d.fullscreenEnabled || d.webkitFullscreenEnabled;
  // installed as an app (any display mode but a normal browser tab): it already has the whole window
  const appMode = matchMedia(
    '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
  );
  const show = () => (b.hidden = !can || appMode.matches || navigator.standalone === true);
  show();
  appMode.addEventListener?.('change', show);
  if (b.hidden) return;
  const current = () => d.fullscreenElement || d.webkitFullscreenElement;
  const paint = () => {
    const on = !!current();
    b.classList.toggle('on', on);
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  };
  b.onclick = async () => {
    try {
      if (current()) await (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      track('setting', { fullscreen: !current() });
    } catch (e) {}
  };
  d.addEventListener('fullscreenchange', paint);
  d.addEventListener('webkitfullscreenchange', paint);
  paint();
}
