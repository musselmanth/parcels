// Generate new puzzles and append them to the game's data files, or check the existing ones.
//
//   npm run generate -- <level> <count> [--seed N] [--dry-run]
//   npm run check-puzzles
//
// New boards go on the end of src/data/<level>.json, so existing boards keep their numbers
// (and players' saved results stay attached to the right boards).
import { candidates, countSolutions, generatePuzzle, PROFILES, setCells } from './engine.js';
import { validTiles } from '../src/core/rules.js';
import { PKEYS } from '../src/core/hex.js';
import { LEVELS, boardKey, dataPath, readPuzzles, unpack, writePuzzles } from './puzzle-file.js';

const USAGE = `Usage:
  npm run generate -- <level> <count> [--seed N] [--dry-run]
  npm run check-puzzles

  level      one of: ${LEVELS.join(', ')}
  count      how many new boards to add
  --seed N   first seed to try (default: random). Each board stores the seed it came from.
  --dry-run  generate and report, but don't write the file`;

const args = process.argv.slice(2);
// Remove `--name value` from args and return value (undefined if absent).
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

if (args[0] === 'check') {
  process.exit(check() ? 0 : 1);
} else {
  const dry = args.includes('--dry-run');
  if (dry) args.splice(args.indexOf('--dry-run'), 1);
  const seedArg = flag('--seed');
  const [level, countArg] = args;
  const count = parseInt(countArg, 10);
  if (!PROFILES[level] || !(count > 0) || (seedArg !== undefined && !/^\d+$/.test(seedArg))) {
    console.error(USAGE);
    process.exit(1);
  }
  const seed = seedArg !== undefined ? +seedArg : 1 + Math.floor(Math.random() * 2 ** 30);
  await generate(level, count, seed, dry);
}

// Generate `want` new boards for a level starting from firstSeed, skipping duplicates, verify each,
// and append them to the level's file (unless dry).
async function generate(level, want, firstSeed, dry) {
  const existing = readPuzzles(level);
  const known = new Set(existing.map(boardKey));
  const fresh = [];
  const shapeCount = new Map();
  let seed = firstSeed;
  let stop = false;
  process.on('SIGINT', () => {
    if (stop) process.exit(130);
    stop = true;
    console.error('\nStopping: saving the boards made so far (Ctrl+C again to quit without saving).');
  });

  console.log(
    `${level}: generating ${want} board(s), starting at seed ${firstSeed}. Ctrl+C stops and keeps what's done.`,
  );
  const t0 = Date.now();
  while (fresh.length < want && !stop) {
    const s = seed++;
    const p = generatePuzzle(s, level);
    await new Promise((r) => setImmediate(r)); // lets Ctrl+C through between boards
    if (!p) continue;
    // varied shapes: the classic hexagon up to 10 per batch, other shapes only a few times
    const sig = p.cells.map((c) => c.join(',')).join(';');
    if ((shapeCount.get(sig) || 0) >= (p.sym === 'hex' ? 10 : level === 'easy' ? 5 : 3)) continue;
    const board = {
      c: p.cells.flat(),
      t: p.tiles.map((x) => '' + x.s + x.c + x.n).join(''),
      sol: p.sol,
      d: p.d,
      f: p.f,
      l: p.l,
      h: p.h,
      sym: p.sym,
      look: p.look,
      seed: s,
    };
    if (known.has(boardKey(board))) continue;
    const problem = verify(board);
    if (problem) throw new Error(`seed ${s}: generator made a bad board (${problem})`);
    shapeCount.set(sig, (shapeCount.get(sig) || 0) + 1);
    known.add(boardKey(board));
    fresh.push(board);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(
      `  ${fresh.length}/${want}  seed ${s}  ${board.c.length / 2} tiles, ${board.d} decoys, logic ${board.l}  (${secs}s)`,
    );
  }
  if (!fresh.length) {
    console.log('Nothing generated.');
    return;
  }

  // within the new batch, gentlest to toughest
  fresh.sort((a, b) => a.l - b.l || a.h - b.h || a.d - b.d);
  summarize(level, fresh, Date.now() - t0);
  if (dry) {
    console.log('Dry run: nothing written.');
    return;
  }
  writePuzzles(level, existing.concat(fresh));
  console.log(
    `Added boards #${existing.length + 1}-${existing.length + fresh.length} to ${dataPath(level)} (${existing.length + fresh.length} total).`,
  );
}

// Returns a description of what's wrong with a stored board, or null if it's fine.
function verify(p) {
  if (p.c.length % 2 || p.t.length !== (p.c.length / 2) * 3) return 'cells and tiles have different counts';
  const { cells, tiles } = unpack(p);
  if (cells.length % 3) return 'tile count is not a multiple of 3';
  if (tiles.some((x) => !(x.s >= 0 && x.s <= 3 && x.c >= 0 && x.c <= 3 && x.n >= 1 && x.n <= 3)))
    return 'tile out of range';
  setCells(cells);
  const covered = new Array(cells.length).fill(0);
  for (const g of p.sol) {
    if (g.length !== 3) return 'solution parcel is not 3 tiles';
    g.forEach((i) => covered[i]++);
    if (
      !PKEYS.has(
        g
          .slice()
          .sort((a, b) => a - b)
          .join(','),
      )
    )
      return `solution parcel ${g} is not connected`;
    if (!validTiles(...g.map((i) => tiles[i]))) return `solution parcel ${g} breaks the rules`;
  }
  if (covered.some((n) => n !== 1)) return 'solution does not cover every tile exactly once';
  if (countSolutions(candidates(tiles), 2).count !== 1) return 'more than one solution';
  return null;
}

// Verify every board of every level. Prints problems; returns true if all are fine.
function check() {
  let ok = true;
  for (const level of LEVELS) {
    const list = readPuzzles(level);
    const seen = new Map();
    let bad = 0;
    list.forEach((p, i) => {
      const n = i + 1;
      const problem = verify(p);
      if (problem) {
        console.log(`  ${level} #${n}: ${problem}`);
        bad++;
      }
      const k = boardKey(p);
      if (seen.has(k)) {
        console.log(`  ${level} #${n}: same board as #${seen.get(k)}`);
        bad++;
      } else seen.set(k, n);
    });
    console.log(`${level}: ${list.length} boards, ${bad ? bad + ' problem(s)' : 'all OK'}`);
    if (bad) ok = false;
  }
  return ok;
}

// One-line summary of a batch.
function summarize(level, out, ms) {
  const avg = (f) => (out.reduce((s, o) => s + f(o), 0) / out.length).toFixed(1);
  const lv = {};
  out.forEach((o) => (lv[o.l] = (lv[o.l] || 0) + 1));
  const parcels = out.map((o) => o.c.length / 6);
  console.log(
    `${level}: ${out.length} new board(s) in ${(ms / 1000).toFixed(0)}s | parcels ${Math.min(...parcels)}-${Math.max(...parcels)}` +
      ` | decoys avg ${avg((o) => o.d)} | forced avg ${avg((o) => o.f)} | logic levels ${JSON.stringify(lv)}` +
      ` | plain hexagons ${out.filter((o) => o.sym === 'hex').length}`,
  );
}
