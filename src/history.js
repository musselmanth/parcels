import { $ } from './core/dom.js';
import { CATS } from './data/puzzles.js';
import { setMsg } from './render.js';
import { loadBest, loadStore, saveBest } from './storage.js';

// Settings > Play history: export all saved results (and best times) to a JSON file, and import one (merging).
// The export file: {app, version, exported, progress: {easy: {...}, medium: {...}, ...}}.

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
// Save a file: inside Claude the page asks the viewer to confirm the download; opened on its own, a normal browser download.
async function saveFile(filename, text, btn) {
  const label = btn.textContent;
  try {
    const d = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (d) {
      await d.save({ filename, data: text });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = label), 2000);
      return;
    }
  } catch (e) {
    if (e && e.code === 'declined') return;
  }
  try {
    const url = URL.createObjectURL(
      new Blob([text], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    btn.textContent = 'Saved';
    setTimeout(() => (btn.textContent = label), 2000);
  } catch (e) {
    setMsg('Couldn’t save the file here.', 'bad');
  }
}
// Today's date as YYYY-MM-DD, for file names.
const stamp = () => new Date().toISOString().slice(0, 10);
$('#bExportJson').onclick = () =>
  saveFile(
    `parcels-history-${stamp()}.json`,
    JSON.stringify(
      {
        app: 'parcels-playtest',
        version: 3,
        exported: new Date().toISOString(),
        progress: allHistory(),
        bests: Object.fromEntries(Object.keys(CATS).map((k) => [k, loadBest(k)])),
      },
      null,
      1,
    ),
    $('#bExportJson'),
  );
$('#importFile').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => importHistory(rd.result);
  rd.readAsText(f);
  e.target.value = '';
};
// Importing merges: for each board, keep whichever result is better (a real solve beats a peek; higher score wins).
function importHistory(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    setMsg('That doesn’t look like exported history.', 'bad');
    return;
  }
  const incoming = data && data.progress;
  if (!incoming || typeof incoming !== 'object') {
    setMsg('That doesn’t look like exported history.', 'bad');
    return;
  }
  let added = 0;
  // best times: keep the faster of the two
  for (const k of Object.keys(CATS)) {
    const theirs = data.bests && data.bests[k],
      mine = loadBest(k);
    if (theirs && theirs.time > 0 && (!mine || theirs.time < mine.time)) saveBest(k, theirs);
  }
  for (const k of Object.keys(CATS)) {
    const mine = allHistory()[k],
      theirs = incoming[k] || {};
    for (const [n, r] of Object.entries(theirs)) {
      const m = mine[n],
        sc = (x) => (x.revealed ? -1 : (x.score ?? 0));
      if (!m || sc(r) > sc(m)) {
        mine[n] = r;
        added++;
      }
    }
    try {
      localStorage.setItem(CATS[k].key, JSON.stringify(mine));
    } catch (e) {}
  }
  loadStore();
  $('#mSettings').classList.remove('open');
  document.dispatchEvent(new Event('historychange')); // main.js refreshes what's on screen
  setMsg(`Imported ${added} result${added === 1 ? '' : 's'}.`, 'ok');
}
