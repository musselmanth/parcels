import { Mini, T } from './help.js';
import { track } from './telemetry.js';

// The tutorial (#mTutorial, opened from the bottom of How to play): one small guided board where
// the player does each move they're told to, with the real gestures (it's the same mini board as
// How to play's examples, in play mode). The tiles to use are circled with the hint's gold dots, and
// moves that aren't the one asked for are refused with a reminder. On the way it makes the player
// build parcels that all follow the rule but leave three tiles that can't make one, so they have to
// pop the wrong parcel and redo that part, which is the heart of the game.
//
// The board (cell ids):    0  1  2  3
//                         4  5  6  7      each row shifted half a tile
//                          8  9 10 11
// Its only solution: 0 1 2 | 3 7 11 | 4 8 9 | 5 6 10. The decoy 6 9 10 follows the rule but leaves
// 4 5 8 (two bolts and a square), which can't make a parcel.
// Tiles are T(shape, color, count): shapes 0 circle, 1 square, 2 triangle, 3 bolt;
// colors 0 violet, 1 red, 2 yellow, 3 green.

const CELLS = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [2, 1],
  [-1, 2],
  [0, 2],
  [1, 2],
  [2, 2],
];
const TILES = [
  T(0, 2, 1),
  T(0, 2, 2),
  T(0, 2, 3),
  T(0, 0, 1),
  T(1, 3, 3),
  T(3, 0, 2),
  T(2, 2, 2),
  T(2, 1, 2),
  T(3, 2, 1),
  T(0, 0, 2),
  T(1, 1, 2),
  T(3, 3, 3),
];

// Each step: what to say, which cells to circle, and the move that completes it:
//   want  make (a parcel from exactly `glow`), reject (try `glow`, which isn't a parcel),
//         pair (pencil in `glow`), pop (pop the parcel `glow`), lock (lock any parcel),
//         solved (finish the board any way)
//   good  shown with a ✓ once it's done, above the next step's instruction
//   wrong shown when the player tries a different move (default per `want` below)
const STEPS = [
  {
    say: 'Split the board into <b>parcels</b> of 3 touching tiles. Start with these: <b>swipe</b> across the 3 glowing tiles.',
    glow: [0, 1, 2],
    want: 'make',
    good: 'All circles, all yellow, and 1, 2 and 3 symbols. Each of shape, color and count is all the same or all different, so it’s a parcel.',
  },
  {
    say: 'Now <b>tap</b> the 3 glowing tiles, one at a time.',
    glow: [3, 7, 11],
    want: 'make',
    good: 'Different shapes, colors and counts: all different works too.',
  },
  {
    say: 'Try these three.',
    glow: [5, 9, 10],
    want: 'reject',
    good: 'Not a parcel: two are violet and one is red. When two match and one doesn’t, it breaks the rule.',
  },
  {
    say: 'Make a parcel from these three.',
    glow: [6, 9, 10],
    want: 'make',
    good: 'Three shapes, three colors, all with 2 symbols: a parcel.',
  },
  {
    say: 'Only three tiles left. Try making them a parcel.',
    glow: [4, 5, 8],
    want: 'reject',
    good: 'They can’t: two bolts and a square.',
  },
  {
    say: 'Every parcel follows the rule, but the board isn’t solved. Each board splits only <b>one way</b>, so one of your parcels is wrong. <b>Tap</b> the glowing parcel to pop it.',
    glow: [6, 9, 10],
    want: 'pop',
    good: 'Popped. Its tiles are loose again.',
  },
  {
    say: 'Not sure of a parcel yet? <b>Pencil in</b> a pair: select the 2 glowing tiles, then <b>hold</b> one of them.',
    glow: [4, 8],
    want: 'pair',
    good: 'The dashed outline marks a pair you think belong together.',
  },
  {
    say: 'Finish it: tap the pair, then tap the third glowing tile.',
    glow: [4, 8, 9],
    want: 'make',
    good: 'The pair became a parcel.',
  },
  {
    say: 'Sure about a parcel? <b>Press and hold</b> it to lock it in.',
    glow: null,
    want: 'lock',
    good: 'Locked: a tap can’t pop it by accident now. Hold again if you ever need to unlock it.',
  },
  {
    say: 'One parcel left. Find it yourself.',
    glow: null,
    want: 'solved',
  },
];
const WRONG = {
  make: 'Use the 3 glowing tiles.',
  reject: 'Try the 3 glowing tiles.',
  pair: 'Just 2 tiles this time: select the 2 glowing tiles, then hold one.',
  pop: 'Tap the glowing parcel to pop it.',
  lock: 'Press and hold a parcel (a quick tap would pop it).',
};
// the kind of move (as Mini's guard sees it) each step wants
const MOVE = { make: 'make', reject: 'make', pair: 'pair', pop: 'pop' };

const $t = (id) => document.getElementById(id);
const same = (a, b) => a.length === b.length && a.every((i) => b.includes(i));

let m = null,
  step = 0,
  timer = null;

const cardHTML = (st, good) =>
  (good ? `<p class="tut-good">✓ ${good}</p>` : '') + `<p class="tut-say">${st.say}</p>`;
const DONE_HTML =
  '<p class="tut-good">✓ Solved!</p><p class="tut-say">That’s the whole game. Real boards are bigger, and there’s always exactly one way to split them. If you get stuck, pop a parcel and look again, or ask for a hint.</p>';
// Make the instruction card as tall as its tallest step at this width, so the board and the
// message under it never move as the steps change.
function sizeCard() {
  const c = $t('tutCard'),
    keep = c.innerHTML;
  c.style.minHeight = '';
  let max = 0;
  STEPS.forEach((st, k) => {
    c.innerHTML = cardHTML(st, k ? STEPS[k - 1].good : '');
    max = Math.max(max, c.offsetHeight);
  });
  c.innerHTML = DONE_HTML;
  max = Math.max(max, c.offsetHeight);
  c.style.minHeight = max + 'px';
  c.innerHTML = keep;
}
function show(good) {
  const st = STEPS[step];
  $t('tutCard').innerHTML = cardHTML(st, good);
  $t('tutCount').textContent = `Step ${step + 1} of ${STEPS.length}`;
  $t('tutBar').style.width = (step / STEPS.length) * 100 + '%';
  say('');
  m.glow = st.glow;
  m.render();
}
// Feedback under the board (the board's own messages: only the refusals and rule breaks).
function say(text, cls = '') {
  const el = $t('tutMsg');
  el.textContent = text;
  el.className = 'hmsg' + (cls ? ' ' + cls : '');
}

// Refuse any move that isn't the one this step asks for.
function guard(kind, cells) {
  const st = STEPS[step];
  if (!st || st.want === 'solved') return '';
  if (st.want === 'lock') return WRONG.lock;
  if (kind !== MOVE[st.want] || !same(cells, st.glow)) return st.wrong || WRONG[st.want];
  return '';
}
function onEvent(kind, cells) {
  const st = STEPS[step];
  if (!st) return;
  if (st.want === 'solved') {
    if (kind === 'make' && m.solved) finish();
    return;
  }
  if (kind !== st.want || (st.glow && !same(cells, st.glow))) return;
  m.glow = null;
  m.render();
  clearTimeout(timer);
  // let a shake or pop play out before moving on
  timer = setTimeout(
    () => {
      step++;
      show(st.good);
      track('tutorial', { step });
    },
    kind === 'reject' ? 500 : 250,
  );
}
function finish() {
  m.solved = false; // so a tap on the board doesn't count as "play again" (see Mini.down)
  $t('tutCard').innerHTML = DONE_HTML;
  $t('tutCount').textContent = 'Done';
  $t('tutBar').style.width = '100%';
  say('');
  $t('tutEnd').hidden = false;
  $t('tutBoard').classList.add('dancing');
  track('tutorial', { step: 'done' });
}
function restart() {
  clearTimeout(timer);
  step = 0;
  m.tiles = TILES.slice();
  m.reset();
  $t('tutEnd').hidden = true;
  $t('tutBoard').classList.remove('dancing');
  show();
}

// Call once at startup. play(): what "Play an Easy board" does (main.js opens the next unsolved one).
export function initTutorial(play) {
  const modal = $t('mTutorial');
  const open = () => {
    $t('mHelp').classList.remove('open');
    modal.classList.add('open');
    if (!m) {
      m = new Mini($t('tutBoard'), CELLS, TILES.slice());
      m.mode = 'play';
      m.say = (text, cls) => cls === 'bad' && say(text, 'bad'); // the tutorial says the rest
      m.guard = guard;
      m.onEvent = onEvent;
      m.onReplay = () => {};
    }
    sizeCard();
    restart();
    track('tutorial', { step: 'open' });
  };
  const close = () => {
    clearTimeout(timer);
    modal.classList.remove('open');
  };
  window.addEventListener('resize', () => modal.classList.contains('open') && sizeCard());
  $t('bTutorial').onclick = open;
  $t('bTutClose').onclick = close;
  modal.addEventListener('click', (e) => e.target === modal && close());
  $t('bTutAgain').onclick = restart;
  $t('bTutPlay').onclick = () => {
    close();
    play();
  };
}
