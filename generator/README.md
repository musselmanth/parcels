# Puzzle generator

Makes new boards and appends them to the game's puzzle files in `src/data/`. The game lists every board in those files, so new boards show up in the puzzle menu automatically.

## Add puzzles

```bash
npm run generate -- easy 10              # add 10 Easy boards
npm run generate -- extreme 5 --seed 42  # reproducible: start from seed 42
npm run generate -- hard 3 --dry-run     # try it without writing anything
npm run check-puzzles                    # verify every board in every level
```

- New boards go **on the end** of `src/data/<level>.json`. Existing boards keep their numbers, so players' saved results stay with the right boards.
- Each new board is checked before it's saved: one solution only, and the solution follows the rules. Boards that already exist in the file are skipped.
- Each board stores the `seed` it came from, so `generatePuzzle(seed, level)` in `engine.js` makes it again.
- Speed: Easy takes well under a second per board. Medium and Extreme can take several seconds each, about 6 minutes for 50. Press Ctrl+C to stop early and keep the boards made so far.
- With `npm run dev` running, the game reloads on its own when a data file changes.

To remove or reorder boards, edit the JSON file directly. Moving a board changes its number, so saved results would point at a different board. If you replace a whole level, also change its storage key (`key` in `src/data/puzzles.js`) so old results don't carry over.

## Files

- `engine.js`: the generator. It covers board shapes, the tile filling, the uniqueness check, difficulty scoring, look-alike traps and the per-level `PROFILES`. The board model and rules come from the game itself (`src/core/hex.js`, `src/core/rules.js`).
- `generate.js`: the command line (`generate` and `check`).
- `puzzle-file.js`: reads and writes `src/data/*.json`.

## Puzzle format

| Field  | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `c`    | Board cells as a flat list of axial hex coordinates `q0,r0,q1,r1,...`         |
| `t`    | 3 digits per tile: shape (0-3), color (0-3), count (1-3)                      |
| `sol`  | The solution: parcels as triples of cell indexes                              |
| `d`    | Decoys: valid-looking parcels that aren't in the solution                     |
| `f`    | Tiles with only one possible parcel                                           |
| `l`    | Logic needed: 1 forced moves, 2 "this would strand a tile", 3 chain reasoning |
| `h`    | Count of harder reasoning steps                                               |
| `sym`  | Board shape's symmetry (`hex` = the plain hexagon)                            |
| `look` | Look-alike stats used for scoring during generation                           |
| `seed` | Seed that produced it (boards from the original batch don't have one)         |

The game shows `d`, `f` and `l` on the results card, and uses `c` (board size) and `d` for par time.

## Tuning difficulty

Edit `PROFILES` in `engine.js`:

- `lo`/`hi`: board size in tiles
- `pSame`: how often real parcels share an attribute
- `iters`: search effort
- `score`: what counts as a better board
- `gate`: the minimum logic each board must need
