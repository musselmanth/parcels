import { PLAYTEST_API } from './config.js';
import { $ } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { resultRank } from './scoring.js';
import { loadBest, loadStore, saveBest } from './storage.js';
import { track } from './telemetry.js';

// Settings > Play history: move your results to another device with a transfer code (no accounts),
// and clear history (that part is in main.js).
//   Send:    this device's results and best times go to the collector (worker/), which returns a
//            short code, e.g. K7Q 4MX. It works once, for 10 minutes.
//   Receive: enter the code on the other device. The results are merged in: for each board the
//            better result wins (see resultRank in scoring.js), and the faster best time wins.
// It uses the same Worker as the playtest data (PLAYTEST_API in src/config.js); without one (e.g.
// on localhost) the section says it isn't available. Browsers marked with ?me can still use it.

const API = PLAYTEST_API;

// A message under the Play history buttons. cls: '' | 'ok' | 'bad'.
export function historyStatus(text, cls = '') {
  const el = $('#historyStatus');
  el.textContent = text;
  el.className = 'setnote' + (cls ? ' ' + cls : '');
}

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

// Merge received results into this device's. Returns how many boards were added or improved.
function mergeHistory(data) {
  let added = 0;
  for (const k of Object.keys(CATS)) {
    // best times: keep the faster of the two
    const theirs = data.bests && data.bests[k],
      mine = loadBest(k);
    if (theirs && theirs.time > 0 && (!mine || theirs.time < mine.time)) saveBest(k, theirs);
    // results: keep the better one per board
    const results = allHistory()[k],
      incoming = (data.progress && data.progress[k]) || {};
    for (const [n, r] of Object.entries(incoming)) {
      if (!r || typeof r !== 'object') continue;
      if (!results[n] || resultRank(r) > resultRank(results[n])) {
        results[n] = r;
        added++;
      }
    }
    try {
      localStorage.setItem(CATS[k].key, JSON.stringify(results));
    } catch (e) {}
  }
  loadStore();
  document.dispatchEvent(new Event('historychange')); // main.js refreshes what's on screen
  return added;
}

// POST to the collector; resolves to its JSON reply, or throws with its error message.
async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  const reply = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(reply.error || 'Something went wrong. Try again.');
  return reply;
}

let countdown = null; // timer that counts the shown code down to its expiry

export function initHistory() {
  const sendBox = $('#sendBox'),
    receiveBox = $('#receiveBox'),
    codeEl = $('#sendCode'),
    expiryEl = $('#sendExpiry'),
    input = $('#claimCode');
  if (!API) {
    $('#transferBtns').hidden = true;
    $('#transferNote').textContent = 'Moving results to another device isn’t available here.';
    return;
  }

  // Send: get a code and show it, counting down to when it expires.
  $('#bSendHistory').onclick = async () => {
    receiveBox.hidden = true;
    historyStatus('Getting a code…');
    try {
      const { code, expiresAt } = await post('/api/transfer', { data: snapshot() });
      historyStatus('');
      codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
      sendBox.hidden = false;
      codeEl.classList.remove('expired');
      clearInterval(countdown);
      const tick = () => {
        const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        expiryEl.textContent = left
          ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
          : 'This code has expired. Send again for a new one.';
        if (!left) {
          clearInterval(countdown);
          codeEl.classList.add('expired');
        }
      };
      tick();
      countdown = setInterval(tick, 1000);
      track('transfer', { action: 'send' });
    } catch (e) {
      historyStatus(e.message || 'Couldn’t get a code. Check your connection.', 'bad');
    }
  };

  // Receive: enter a code and merge in the results it carries.
  $('#bReceiveHistory').onclick = () => {
    sendBox.hidden = true;
    receiveBox.hidden = false;
    historyStatus('');
    input.value = '';
    setTimeout(() => input.focus(), 50);
  };
  const claim = async () => {
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return historyStatus('Enter the 6-character code from your other device.', 'bad');
    historyStatus('Getting your results…');
    try {
      const { data } = await post('/api/transfer/claim', { code });
      const added = mergeHistory(data || {});
      receiveBox.hidden = true;
      historyStatus(
        added
          ? `Received ${added} result${added === 1 ? '' : 's'}.`
          : 'Done. Your results here were already as good or better.',
        'ok',
      );
      track('transfer', { action: 'receive', added });
    } catch (e) {
      historyStatus(e.message || 'Couldn’t get your results. Check your connection.', 'bad');
    }
  };
  $('#bClaim').onclick = claim;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && claim());
}
