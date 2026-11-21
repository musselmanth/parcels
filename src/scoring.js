import { fmt } from './core/dom.js';
import { GROUPS } from './core/hex.js';
import { CATS } from './data/puzzles.js';
import { G } from './state.js';
import { CAT } from './storage.js';

// Scoring and everything on the results card that's calculated rather than drawn: par time, the
// 1000-point score, stars, compliments, awards and the share text. Tune the game's scoring here.

// Words for a board's logic level (the `l` field).
const LEVELS = ['', 'gentle', 'tricky', 'chain reasoning', 'needs a guess'];
// The small print on the results card describing the board.
export const statText = (p) =>
  `${p.d} decoy parcels · ${p.f} tile${p.f === 1 ? '' : 's'} with only one possible parcel · logic: ${LEVELS[p.l]}`;

// Fresh stats for an attempt (G.st):
//   trail: one emoji per event for the share text   pops / pairs / locks: how often each was used
//   built / swipes: parcels made, and how many by swiping   streak / best: parcels in a row without a miss
//   lastT / fast: time of the last parcel and the shortest gap between two
export const newStats = () => ({
  trail: [],
  pops: 0,
  pairs: 0,
  locks: 0,
  built: 0,
  swipes: 0,
  streak: 0,
  best: 0,
  lastT: null,
  fast: null,
});
// Par time: what a focused first-time solver might need. Roughly a fixed amount per parcel
// (more per parcel on harder levels, where each tile has more plausible options) plus a little per false parcel.
const PAR_PER_PARCEL = { easy: 12, medium: 18, hard: 24, extreme: 30 },
  PAR_PER_DECOY = 2;
export const parFor = (p) => 1000 * ((PAR_PER_PARCEL[CAT] * p.c.length) / 6 + PAR_PER_DECOY * p.d);
// Mistakes and pops cost less on bigger boards, where some are expected.
const ALLOW = {
  easy: { miss: 4, pop: 4 },
  medium: { miss: 6, pop: 6 },
  hard: { miss: 8, pop: 8 },
  extreme: { miss: 10, pop: 12 },
};
// Score out of 1000: speed (500) + accuracy (300) + tidiness (200).
export function scoreFor(time, par, mistakes, pops) {
  const x = time / par;
  const speed =
    x <= 0.5
      ? 500
      : x <= 1
        ? 500 - (300 * (x - 0.5)) / 0.5
        : x <= 2
          ? 350 - 250 * (x - 1)
          : Math.max(0, 100 - 100 * (x - 2));
  const acc = Math.max(0, 300 - (300 * mistakes) / ALLOW[CAT].miss);
  const tidy = Math.max(0, 200 - (200 * pops) / ALLOW[CAT].pop);
  const r = (v) => Math.round(v);
  return { speed: r(speed), acc: r(acc), tidy: r(tidy), total: r(speed) + r(acc) + r(tidy) };
}
// Star thresholds ease off a little as the levels get harder.
const TIERS = {
  easy: [930, 800, 620, 400],
  medium: [900, 770, 590, 380],
  hard: [870, 740, 560, 360],
  extreme: [840, 700, 520, 340],
};
export const starsFor = (total) => {
  const t = TIERS[CAT];
  return total >= t[0] ? 5 : total >= t[1] ? 4 : total >= t[2] ? 3 : total >= t[3] ? 2 : 1;
};
// One line under the score, by level and stars. Picked by board number.
export const COMPLIMENTS = {
  easy: {
    5: ['Perfect warm-up. You make it look effortless.', 'Not a single wasted move. Beautiful.'],
    4: ['Smooth and tidy. Nicely done.', 'Quick work. You’re ready for Medium.'],
    3: ['Solid solve. You found your rhythm.', 'Good going. A few detours, but you got there.'],
    2: ['Done and dusted. Next one will be quicker.', 'Every solve counts. Nice job sticking with it.'],
    1: ['You finished it, and that’s what matters.', 'Warm-up complete. Onward!'],
  },
  medium: {
    5: ['Masterful. That board never stood a chance.', 'Clean, fast, and clever. Superb.'],
    4: ['Sharp thinking. That was a great solve.', 'Really nice work. Hard is calling your name.'],
    3: [
      'Nicely reasoned. You’re getting the hang of this.',
      'Good solve. A couple of wobbles, nothing more.',
    ],
    2: ['You worked it out. That’s real progress.', 'Tricky one, and you cracked it.'],
    1: ['Persistence pays off. Board solved!', 'A win is a win. Well played.'],
  },
  hard: {
    5: ['Elite solve. Genuinely impressive.', 'That was surgical. Wow.'],
    4: ['Excellent. Hard boards bow to you.', 'Strong, steady, and smart. Great solve.'],
    3: ['Good solve on a tough board. Respect.', 'You untangled a hard one. Nicely done.'],
    2: ['Hard won and well earned.', 'That board fought back, and you still won.'],
    1: ['You beat a Hard board. Take the victory lap.', 'Grit over speed. Solved!'],
  },
  extreme: {
    5: ['Legendary. That was an Extreme board, flawlessly.', 'Untouchable. Take a bow.'],
    4: ['Outstanding. Few people solve these this well.', 'Brilliant work on a brutal board.'],
    3: ['Great solve. Extreme is no joke.', 'You stayed cool under pressure. Excellent.'],
    2: ['You conquered an Extreme board. Huge.', 'Long haul, big reward. Well done.'],
    1: ['Extreme board: defeated. Seriously.', 'That took real determination. Solved!'],
  },
};
// Used in the share text.
export const LEVEL_EMOJI = { easy: '🟢', medium: '🟡', hard: '🟠', extreme: '🔴' };
// n stars as emoji, e.g. "⭐⭐⭐☆☆".
const starRow = (n) => (n === 5 ? '🌟🌟🌟🌟🌟' : '⭐'.repeat(n) + '☆'.repeat(5 - n));

// A fun title for how the board was solved: first match wins.
// r = one run: {time, misses, pops, best, trail}
export function awardFor(r, par) {
  const A = [
    [r.misses === 0 && r.pops === 0, '💎', 'Flawless', 'No mistakes, nothing popped'],
    [r.time <= par * 0.5, '⚡', 'Speed Run', `Under ${fmt(par * 0.5)}, half of par`],
    [r.pops >= Math.max(8, GROUPS), '🫧', 'Bubble Wrap Enthusiast', `${r.pops} parcels popped`],
    [
      r.best >= Math.max(6, Math.round(GROUPS * 0.75)),
      '🔥',
      'Unstoppable',
      `${r.best} parcels in a row without a slip`,
    ],
    [r.misses === 0, '🎯', 'Sharpshooter', 'Zero mistakes'],
    [r.misses >= ALLOW[CAT].miss * 2, '🧗', 'Never Gave Up', `${r.misses} mistakes and still solved it`],
  ];
  const a = A.find((a) => a[0]);
  return a ? a.slice(1) : null;
}
// The text copied by "Share result".
export function shareText(r, sc, stars) {
  // the move-by-move trail, 10 per line: 🟩 parcel made, 🟥 mistake, 🫧 pop
  const tr = r.trail || [],
    t = tr.slice(0, 40),
    rows = [];
  for (let i = 0; i < t.length; i += 10) rows.push(t.slice(i, i + 10).join(''));
  if (tr.length > 40) rows[rows.length - 1] += '…';
  return (
    `Parcels ${LEVEL_EMOJI[CAT]} ${CATS[CAT].name} #${G.cur}\n${starRow(stars)}  ${sc.total}\n⏱ ${fmt(r.time)}  ❌ ${r.misses}  🫧 ${r.pops}` +
    (rows.length ? `\n${rows.join('\n')}` : '')
  );
}
