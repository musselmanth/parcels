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
// How a solve went: { speed: 'fast'|'normal'|'slow', slips: 'clean'|'few'|'many', popper, pops, misses }.
// popper: lots of parcels popped (tried things, took them apart, kept going), which gets its own praise.
export function paceOf(rec) {
  const t = PACE[CAT] || PACE.easy;
  const perParcel = (rec.time || 0) / 1000 / Math.max(1, GROUPS);
  const pops = rec.pops || 0,
    misses = rec.misses || 0,
    slips = misses + pops;
  return {
    speed: perParcel <= t.fast ? 'fast' : perParcel >= t.slow ? 'slow' : 'normal',
    slips: slips === 0 ? 'clean' : slips >= t.many ? 'many' : 'few',
    popper: pops >= Math.max(4, Math.round(t.many * 0.6)),
    pops,
    misses,
  };
}
// Lines for each result and how it went; the first matching group is used. A line is a string, or a
// function of the pace (for lines that mention a number). One is picked per board (so reopening a
// board shows the same line), mixed by level and board number so neighbors differ.
const s = (n) => (n === 1 ? '' : 's');
const PRAISE = {
  perfect: [
    [
      (p) => p.slips === 'clean' && p.speed === 'fast',
      [
        'Lightning fast and not a single wasted move.',
        'Quick, clean, no hints. That’s how it’s done.',
        'Didn’t even break a sweat. Flawless.',
        'You saw the whole board at once. Wow.',
        'Speed and precision. A textbook solve.',
        'Blink and you’d miss it. Perfect.',
        'That was a masterclass.',
      ],
    ],
    [
      (p) => p.slips === 'clean',
      [
        'Clean as can be: no hints, no mistakes, nothing popped.',
        'Every parcel right the first time. Beautiful.',
        'Not one wrong turn. Lovely solve.',
        'Measured, careful, perfect.',
        'You read that board like a book.',
        'Spotless. Every move counted.',
        'Calm and exact. A joy to watch.',
      ],
    ],
    [
      (p) => p.popper,
      [
        (p) => `${p.pops} pops and still no hints. That’s what persistence looks like.`,
        'You took it apart and put it back together until it fit. Respect.',
        'Pop, rethink, try again. That’s exactly how puzzles get solved.',
        'Every pop got you closer. And you never asked for help.',
        'You kept testing ideas until the board gave in. Love that grit.',
        (p) => `${p.pops} parcels popped on the way there. Not one hint. Seriously impressive.`,
        'Fearless. You weren’t afraid to start over, and it paid off.',
      ],
    ],
    [
      (p) => p.slips === 'many',
      [
        'That one fought back, but you got there on your own.',
        'Plenty of wrong turns, and still no hints. Stubborn in the best way.',
        'A real battle, and you won it without any help.',
        'You kept at it until it clicked. That’s the whole game.',
        'Every mistake taught you something, and it shows.',
        'Tough board, tougher solver.',
      ],
    ],
    [
      (p) => p.speed === 'fast',
      [
        'Quick and confident. Nicely done.',
        'Fast work, all on your own.',
        'You made that look easy.',
        'Sharp eyes. That went by in a flash.',
        'Zipped right through it. Great instincts.',
      ],
    ],
    [
      (p) => p.speed === 'slow',
      [
        'Slow and steady, and every parcel was yours.',
        'You took your time and cracked it alone.',
        'Patience paid off. No hints needed.',
        'No rush, no hints, no problem.',
        'Thoughtful all the way through. Well earned.',
        'You stuck with it and figured it out yourself. That’s the best feeling.',
      ],
    ],
    [
      () => true,
      [
        'Not a single hint. Beautifully done.',
        'All you. That was a solid solve.',
        'Worked it out on your own. Brilliant.',
        'Board cleared, no help needed. Nice.',
        'That’s a win you earned yourself.',
        'Smart moves from start to finish.',
        'You and the board, and you came out on top.',
      ],
    ],
  ],
  hints: [
    [
      (p) => p.slips === 'clean',
      [
        'A nudge or two, then smooth sailing.',
        'Hints in hand, not a single slip after that.',
        'A little help, then pure precision.',
        'You used the hints well. Clean from there on.',
      ],
    ],
    [
      (p) => p.popper,
      [
        (p) => `${p.pops} pops and you never gave up. That’s the spirit.`,
        'You kept trying new ideas until it worked. Love the persistence.',
        'Lots of tinkering, and you saw it through. Nicely done.',
        'Pop, think, repeat. You stuck with it all the way.',
        'Plenty of experiments on that one, and they got you there.',
      ],
    ],
    [
      (p) => p.slips === 'many',
      [
        'That one put up a fight. Solved is solved!',
        'A tricky board, and you saw it through.',
        'It took some untangling, but you got there.',
        'You didn’t let it beat you. Well done.',
        'Grit beats a tough board every time.',
      ],
    ],
    [
      (p) => p.speed === 'fast',
      [
        'Quick work with a little help.',
        'In and out. Nicely done.',
        'A hint to get going, then off you went.',
        'Fast finish. Great momentum.',
      ],
    ],
    [
      (p) => p.speed === 'slow',
      [
        'You took your time and got there. That’s what counts.',
        'Steady work all the way to the end.',
        'Patience and a little help. A fine solve.',
        'You kept going, and the board is yours.',
      ],
    ],
    [
      () => true,
      [
        'Got there. Nicely done.',
        'Every solve counts. Well played.',
        'Board cleared. Onward!',
        'Hints are tools, and you used them well.',
        'Solved! The next one’s waiting.',
        'You’re getting the hang of this.',
      ],
    ],
  ],
  loser: [
    [
      () => true,
      [
        'Sometimes you just need to see it. Onward!',
        'It happens to the best of us. The next one’s yours.',
        'Now you know the trick for next time.',
        'Seeing the answer is part of learning the game.',
        'Every board you look at makes the next one easier.',
        'No shame in peeking. Go get the next one.',
      ],
    ],
  ],
};
// A small hash, so boards with the same number on different levels get different lines.
const pickIndex = (n, len) => {
  let h = 2166136261;
  for (const ch of `${CAT}:${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % len;
};
export function praiseFor(rec) {
  const res = resultOf(rec),
    pace = paceOf(rec);
  const lines = PRAISE[res.kind].find(([test]) => test(pace))[1];
  const line = lines[pickIndex(G.cur, lines.length)];
  return typeof line === 'function' ? line(pace) : line;
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
