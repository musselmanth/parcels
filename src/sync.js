import { PLAYTEST_API } from './config.js';
import { $ } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { resultRank } from './scoring.js';
import { loadBest, loadStore, saveBest } from './storage.js';
import { track } from './telemetry.js';

// Settings > Play history: keep your results the same on all your devices with a sync code (no
// accounts), and clear history (that part is in main.js).
//   Start syncing:       this device's results go to the collector (worker/), which keeps them under
//                        a new 8-character code, e.g. K7Q4 MX2P. The code is remembered here.
//   I have a sync code:  enter the code on another device to sync it too.
//   Syncing:             the device sends its results and gets back everything from every device on
//                        that code, merged: for each board the better result wins (resultRank in
//                        scoring.js), and the faster best time wins. Nothing ever gets worse.
// It syncs on startup, when the page comes back into view, when Settings opens and after a board is
// finished (storage.js sends 'resultsaved'). Boards in progress aren't synced. Offline, it quietly
// tries again next time.
// It uses the same Worker as the playtest data (PLAYTEST_API in src/config.js); without one (e.g.
// on localhost) the section says it isn't available. Browsers marked with ?me can still use it.

const API = PLAYTEST_API;
const SYNC_KEY = 'parcels-playtest-v1-sync'; // {code, at}: the sync code and when it last synced

// A message under the Play history buttons. cls: '' | 'ok' | 'bad'.
export function historyStatus(text, cls = '') {
  const el = $('#historyStatus');
  el.textContent = text;
  el.className = 'setnote' + (cls ? ' ' + cls : '');
}

function loadSync() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
  } catch (e) {
    return null;
  }
}
function storeSync(s) {
  try {
    if (s) localStorage.setItem(SYNC_KEY, JSON.stringify(s));
    else localStorage.removeItem(SYNC_KEY);
  } catch (e) {}
}
const pretty = (code) => code.slice(0, 4) + ' ' + code.slice(4);

// Saved results for every level, read fresh from localStorage.
function allHistory() {
  const progress = {};
  for (const k of Object.keys(CATS)) {
    try {
      progress[k] = JSON.parse(localStorage.getItem(CATS[k].key) || '{}') || {};
    } catch (e) {
      progress[k] = {};
    }
  }
  return progress;
}

// What gets sent: every level's results and best times.
const snapshot = () => ({
  progress: allHistory(),
  bests: Object.fromEntries(Object.keys(CATS).map((k) => [k, loadBest(k)])),
});

// Merge synced results into this device's. Returns how many boards were added or improved; if
// anything changed, tells main.js which boards ('level:board') so it can redraw.
function mergeHistory(data) {
  let added = 0,
    bestsChanged = false;
  const changed = [];
  for (const k of Object.keys(CATS)) {
    // best times: keep the faster of the two
    const theirs = data.bests && data.bests[k],
      mine = loadBest(k);
    if (theirs && theirs.time > 0 && (!mine || theirs.time < mine.time)) {
      saveBest(k, theirs);
      bestsChanged = true;
    }
    // results: keep the better one per board
    const results = allHistory()[k],
      incoming = (data.progress && data.progress[k]) || {};
    let levelChanged = false;
    for (const [n, r] of Object.entries(incoming)) {
      if (!r || typeof r !== 'object') continue;
      if (!results[n] || resultRank(r) > resultRank(results[n])) {
        results[n] = r;
        added++;
        levelChanged = true;
        changed.push(k + ':' + n);
      }
    }
    if (levelChanged)
      try {
        localStorage.setItem(CATS[k].key, JSON.stringify(results));
      } catch (e) {}
  }
  if (added || bestsChanged) {
    loadStore();
    document.dispatchEvent(new CustomEvent('historychange', { detail: { changed } }));
  }
  return added;
}

// POST to the collector; resolves to its JSON reply, or throws with its error message (and status).
async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  const reply = await r.json().catch(() => ({}));
  if (!r.ok)
    throw Object.assign(new Error(reply.error || 'Something went wrong. Try again.'), { status: r.status });
  return reply;
}

// Show the syncing or not-syncing controls, and when it last synced.
function paint() {
  const s = loadSync();
  $('#syncOff').hidden = !!s;
  $('#syncOn').hidden = !s;
  if (!s) return;
  $('#syncCode').textContent = pretty(s.code);
  $('#syncWhen').textContent = s.at ? 'Last synced ' + ago(s.at) + '.' : 'Not synced yet.';
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(t).toLocaleDateString();
}

let running = null; // the sync in flight, so triggers that arrive together share it
let lastAuto = 0;

// Sync now. loud: show progress and errors in Settings (a button press); otherwise quiet.
export function syncNow(loud = false) {
  if (!API || !loadSync()) return Promise.resolve();
  if (running) return running;
  if (loud) historyStatus('Syncing…');
  running = (async () => {
    try {
      const { code } = loadSync();
      const { data } = await post('/api/sync', { code, data: snapshot() });
      if (!loadSync() || loadSync().code !== code) return; // stopped while it ran
      const added = mergeHistory(data || {});
      storeSync({ code, at: Date.now() });
      if (loud || added)
        historyStatus(
          added ? `Synced: ${added} result${added === 1 ? '' : 's'} from your other devices.` : 'Synced.',
          'ok',
        );
      if (added) track('sync', { action: 'pulled', added });
    } catch (e) {
      if (loud || e.status === 404)
        historyStatus(e.message || 'Couldn’t sync. Check your connection.', 'bad');
    } finally {
      running = null;
      paint();
    }
  })();
  return running;
}
// Automatic syncs (page shown, Settings opened): not more than every 20 seconds.
function autoSync() {
  if (Date.now() - lastAuto < 20000) return;
  lastAuto = Date.now();
  syncNow();
}

// Stop syncing on this device (the code and the other devices' results stay as they are).
export function stopSync() {
  const was = !!loadSync();
  storeSync(null);
  paint();
  return was;
}

export function initSync() {
  if (!API) {
    $('#syncOff').hidden = $('#syncOn').hidden = true;
    $('#syncNote').textContent =
      'Your results are saved in this browser. Syncing devices isn’t available here.';
    return;
  }
  const joinBox = $('#joinBox'),
    input = $('#syncInput');
  paint();

  $('#bSyncStart').onclick = async () => {
    joinBox.hidden = true;
    historyStatus('Getting a sync code…');
    try {
      const { code } = await post('/api/sync/start', { data: snapshot() });
      storeSync({ code, at: Date.now() });
      historyStatus('Syncing. Enter this code on your other devices.', 'ok');
      track('sync', { action: 'start' });
    } catch (e) {
      historyStatus(e.message || 'Couldn’t get a code. Check your connection.', 'bad');
    }
    paint();
  };
  $('#bSyncJoin').onclick = () => {
    joinBox.hidden = !joinBox.hidden;
    historyStatus('');
    input.value = '';
    if (!joinBox.hidden) setTimeout(() => input.focus(), 50);
  };
  const join = async () => {
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) return historyStatus('Enter the 8-character code from your other device.', 'bad');
    historyStatus('Syncing…');
    try {
      const { data } = await post('/api/sync', { code, data: snapshot() });
      storeSync({ code, at: Date.now() });
      const added = mergeHistory(data || {});
      joinBox.hidden = true;
      historyStatus(
        added
          ? `Syncing. Got ${added} result${added === 1 ? '' : 's'} from your other devices.`
          : 'Syncing. Your results here were already up to date.',
        'ok',
      );
      track('sync', { action: 'join', added });
    } catch (e) {
      historyStatus(e.message || 'Couldn’t sync. Check your connection.', 'bad');
    }
    paint();
  };
  $('#bSyncJoinGo').onclick = join;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  $('#bSyncNow').onclick = () => syncNow(true);
  // Copy the sync code, so it can be pasted on another device or saved somewhere safe.
  $('#bSyncCopy').onclick = async () => {
    const s = loadSync(),
      btn = $('#bSyncCopy');
    if (!s) return;
    try {
      await navigator.clipboard.writeText(pretty(s.code));
      btn.textContent = 'Copied!';
    } catch (e) {
      btn.textContent = 'Press and hold the code to copy it';
    }
    setTimeout(() => (btn.textContent = 'Copy code'), 2000);
  };
  $('#bSyncStop').onclick = () => {
    stopSync();
    historyStatus('This device has stopped syncing. Its results stay here.', 'ok');
    track('sync', { action: 'stop' });
  };

  // when to sync by itself
  let soon = null;
  document.addEventListener('resultsaved', () => {
    clearTimeout(soon);
    soon = setTimeout(() => syncNow(), 1500); // a finished board: let the result settle first
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && autoSync());
  for (const b of [$('#bSettings'), $('#bIntroSettings')])
    b.addEventListener('click', () => {
      paint();
      autoSync();
    });
  autoSync(); // startup
}
