import { PLAYTEST_API } from './config.js';
import { G } from './state.js';

// Playtest data: an anonymous log of how each play session goes, sent to the collector in
// worker/ (a Cloudflare Worker + D1 database). Nothing is sent if PLAYTEST_API is empty.
//
//   track(type, data)  add an event to the log (the current level and board are filled in)
//   send()             post the log now (finished boards are sent right away)
//
// The log goes out in batches: every 20 seconds, when 40 events pile up, and when the tab is
// hidden or closed (with sendBeacon, which survives the page going away). Players are a random id
// kept in this browser; a session is one page load. Browsers marked as yours (?me) send nothing.
//
// Event types: session_start (device), screen, board_open, board_leave, parcel, miss, pop, pair,
// pair_erase, lock, hint, start_over, game_finished (the summary of a solved/revealed board),
// help_open, setting, feedback_open, install. See where each is called for its data.

const PLAYER_KEY = 'parcels-playtest-v1-player';
const BATCH_MS = 20000,
  BATCH_MAX = 40;
const newId = () =>
  (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2) + Date.now().toString(36);

let returning = true;
export const player = (() => {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      returning = false;
      id = newId();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch (e) {
    returning = false;
    return newId();
  }
})();
export const session = newId();

// Your own browsers: visit the site once with ?me to stop this browser sending playtest data (it's
// remembered) and to delete what it already sent; ?notme starts sending again. The ?me / ?notme is
// then removed from the address bar.
const ME_KEY = 'parcels-playtest-v1-me';
export const isMe = (() => {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('me')) {
      localStorage.setItem(ME_KEY, '1');
      // ask the collector to delete everything this browser has sent so far
      if (PLAYTEST_API)
        fetch(PLAYTEST_API + '/api/forget', {
          method: 'POST',
          body: JSON.stringify({ player }),
          keepalive: true,
          headers: { 'Content-Type': 'text/plain' },
        }).catch(() => {});
    }
    if (q.has('notme')) localStorage.removeItem(ME_KEY);
    if (q.has('me') || q.has('notme')) {
      q.delete('me');
      q.delete('notme');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    }
    return localStorage.getItem(ME_KEY) === '1';
  } catch (e) {
    return false;
  }
})();
export const enabled = !!PLAYTEST_API && !isMe;
const t0 = Date.now();
let queue = [];

export function track(type, data = {}) {
  if (!enabled) return;
  queue.push({ type, t: Date.now() - t0, level: G.level || null, board: G.cur || null, data });
  if (queue.length >= BATCH_MAX) send();
}

export function send(leaving = false) {
  if (!enabled || !queue.length) return;
  const body = JSON.stringify({ player, session, events: queue });
  queue = [];
  const url = PLAYTEST_API + '/api/events';
  // text/plain keeps it a "simple" request (no CORS preflight); the collector reads it as JSON
  if (leaving && navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })))
    return;
  fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(
    () => {},
  );
}

// Post a feedback form entry. Resolves to true if it arrived.
export async function sendFeedback(entry) {
  if (!enabled) return false;
  try {
    const r = await fetch(PLAYTEST_API + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ player, session, ...entry }),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// Start of the session: what kind of device and screen.
export function startTelemetry(extra = {}) {
  if (!enabled) return;
  track('session_start', {
    returning,
    viewport: `${innerWidth}x${innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    dpr: devicePixelRatio || 1,
    touch: matchMedia('(pointer: coarse)').matches,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    lang: navigator.language,
    ua: navigator.userAgent.slice(0, 200),
    ...extra,
  });
  send();
  setInterval(send, BATCH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      track('hidden');
      send(true);
    } else track('visible');
  });
  addEventListener('pagehide', () => send(true));
}
