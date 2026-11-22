import { fmt } from './core/dom.js';
import { GROUPS } from './core/hex.js';
import { CATS } from './data/puzzles.js';
import { G } from './state.js';
import { CAT } from './storage.js';

// Results: what a finished board counts as (Perfect!, Solved with N Hints, or Loser), the line of
// praise under it, the badges, and the share text. There are no points or stars.

// Words for a board's logic level (the `l` field).
const LEVELS = ['', 'gentle', 'tricky', 'chain reasoning', 'needs a guess'];
// The small print on the results card describing the board.
export const statText = (p) =>
  `${p.d} decoy parcels · ${p.f} tile${p.f === 1 ? '' : 's'} with only one possible parcel · logic: ${LEVELS[p.l]}`;

// Fresh stats for an attempt (G.st):
//   trail: one emoji per event for the share text   pops / pairs / locks: how often each was used
//   built / swipes: parcels made, and how many by swiping   streak / best: parcels in a row without a miss
//   lastT / fast: time of the last parcel and the shortest gap between two   hints: hints asked for
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
  hints: 0,
});
// What a finished board counts as, from a saved record or a just-finished run:
//   Perfect!             solved with no hints
//   Solved with N Hints  solved, with hints
//   Loser                the solution was viewed
// Nothing else (time, misses, pops) affects it; those show up as stats and badges instead.
// Older saved records (from before hints existed, or with points and stars) work too: their hint
// count is read if present, and missing means none.
export function resultOf(rec) {
  if (rec.revealed) return { kind: 'loser', title: 'Loser', short: 'Loser', emoji: '🫠' };
  const h = rec.hints || 0;
  if (!h) return { kind: 'perfect', title: 'Perfect!', short: 'Perfect!', emoji: '🌟' };
  const n = `${h} Hint${h === 1 ? '' : 's'}`;
  return { kind: 'hints', title: `Solved with ${n}`, short: n, emoji: '💡' };
}
// Which of two records for the same board is better (for importing history): a solve beats a
// viewed solution, fewer hints beat more, then the faster time. Returns a number to compare.
export const resultRank = (rec) => (rec.revealed ? -1e12 : -(rec.hints || 0) * 1e9 - (rec.time || 0));

// ---------- praise: one line under the result, about how the solve went ----------
// The result (Perfect!, hints, Loser) never depends on speed or slips; the praise does. Two things
// are judged against the level, since bigger boards take longer and invite more wrong turns:
//   speed: seconds per parcel (fast at or under `fast`, slow at or over `slow`)
//   slips: mistakes + pops (clean = none, many = at or over `many`)
// Tune the feel of the praise here.
const PACE = {
  easy: { fast: 5, slow: 20, many: 5 },
  medium: { fast: 7, slow: 28, many: 7 },
  hard: { fast: 10, slow: 40, many: 9 },
  extreme: { fast: 13, slow: 55, many: 12 },
};
// How a solve went: { speed: 'fast'|'normal'|'slow', slips: 'clean'|'few'|'many' }.
export function paceOf(rec) {
  const t = PACE[CAT] || PACE.easy;
  const perParcel = (rec.time || 0) / 1000 / Math.max(1, GROUPS);
  const slips = (rec.misses || 0) + (rec.pops || 0);
  return {
    speed: perParcel <= t.fast ? 'fast' : perParcel >= t.slow ? 'slow' : 'normal',
    slips: slips === 0 ? 'clean' : slips >= t.many ? 'many' : 'few',
  };
}
// Lines for each result and how it went; the first matching group is used. A few variations each,
// picked by board number (so reopening a board shows the same line).
const PRAISE = {
  perfect: [
    [
      (p) => p.slips === 'clean' && p.speed === 'fast',
      [
        'Lightning fast and not a single wasted move.',
        'Quick, clean, no hints. That’s how it’s done.',
        'Didn’t even break a sweat. Flawless.',
      ],
    ],
    [
      (p) => p.slips === 'clean',
      [
        'Clean as can be: no hints, no mistakes, nothing popped.',
        'Every parcel right the first time. Beautiful.',
        'Not one wrong turn. Lovely solve.',
      ],
    ],
    [
      (p) => p.slips === 'many',
      [
        'That one fought back, but you got there on your own.',
        'Plenty of wrong turns, and still no hints. Stubborn in the best way.',
        'A real battle, and you won it without any help.',
      ],
    ],
    [(p) => p.speed === 'fast', ['Quick and confident. Nicely done.', 'Fast work, all on your own.']],
    [
      (p) => p.speed === 'slow',
      [
        'Slow and steady, and every parcel was yours.',
        'You took your time and cracked it alone.',
        'Patience paid off. No hints needed.',
      ],
    ],
    [
      () => true,
      [
        'Not a single hint. Beautifully done.',
        'All you. That was a solid solve.',
        'Worked it out on your own. Brilliant.',
      ],
    ],
  ],
  hints: [
    [
      (p) => p.slips === 'clean',
      ['A nudge or two, then smooth sailing.', 'Hints in hand, not a single slip after that.'],
    ],
    [
      (p) => p.slips === 'many',
      [
        'That one put up a fight. Solved is solved!',
        'A tricky board, and you saw it through.',
        'It took some untangling, but you got there.',
      ],
    ],
    [(p) => p.speed === 'fast', ['Quick work with a little help.', 'In and out. Nicely done.']],
    [() => true, ['Got there. Nicely done.', 'Every solve counts. Well played.', 'Board cleared. Onward!']],
  ],
  loser: [
    [
      () => true,
      [
        'Sometimes you just need to see it. Onward!',
        'It happens to the best of us. The next one’s yours.',
        'Now you know the trick for next time.',
      ],
    ],
  ],
};
export function praiseFor(rec) {
  const res = resultOf(rec),
    pace = paceOf(rec);
  const lines = PRAISE[res.kind].find(([test]) => test(pace))[1];
  return lines[G.cur % lines.length];
}

// Badges and how many mistakes count as a lot (more on bigger boards, where some are expected).
const MANY_MISSES = { easy: 8, medium: 12, hard: 16, extreme: 20 };
// Hints for the "Guided Tour" badge: half the board's parcels (at least 3).
const manyHints = () => Math.max(3, Math.ceil(GROUPS / 2));
// Used in the share text.
export const LEVEL_EMOJI = { easy: '🟢', medium: '🟡', hard: '🟠', extreme: '🔴' };

// A fun title for how the board was solved: first match wins.
// r = one run: {time, misses, pops, hints, best, trail}
export function awardFor(r) {
  const hints = r.hints || 0;
  const A = [
    [r.misses === 0 && r.pops === 0 && !hints, '💎', 'Flawless', 'No hints, no mistakes, nothing popped'],
    [r.pops >= Math.max(8, GROUPS), '🫧', 'Bubble Wrap Enthusiast', `${r.pops} parcels popped`],
    [hints >= manyHints(), '🧭', 'Guided Tour', `${hints} hints along the way`],
    [
      r.best >= Math.max(6, Math.round(GROUPS * 0.75)),
      '🔥',
      'Unstoppable',
      `${r.best} parcels in a row without a slip`,
    ],
    [r.misses === 0, '🎯', 'Sharpshooter', 'Zero mistakes'],
    [r.misses >= MANY_MISSES[CAT], '🧗', 'Never Gave Up', `${r.misses} mistakes and still solved it`],
  ];
  const a = A.find((a) => a[0]);
  return a ? a.slice(1) : null;
}
// The text copied by "Share result". r = a run or a saved record.
export function shareText(r) {
  const res = resultOf(r);
  let text = `Parcels ${LEVEL_EMOJI[CAT]} ${CATS[CAT].name} #${G.cur}\n${res.emoji} ${res.title}`;
  if (r.revealed) return text;
  text += `  ⏱ ${fmt(r.time)}`;
  // the move-by-move trail, 10 per line: 🟩 parcel made, 🟥 mistake, 🫧 pop, 💡 hint
  const tr = r.trail || [],
    t = tr.slice(0, 40),
    rows = [];
  for (let i = 0; i < t.length; i += 10) rows.push(t.slice(i, i + 10).join(''));
  if (tr.length > 40) rows[rows.length - 1] += '…';
  return text + (rows.length ? `\n${rows.join('\n')}` : '');
}
