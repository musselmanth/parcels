# Parcels — generator and build

## Files
- `engine2.js` — the puzzle generator and game rules. The part between `RUNTIME START` and `RUNTIME END` is also copied into the page; everything after it (shapes, tile filling, uniqueness check, difficulty scoring, look-alike traps, level profiles in `PROFILES`) runs only when generating.
- `batch.js` — generates puzzles for one level and saves `pz_<level>.json`.
- `geometry.js` — hex layout and outline drawing used by the page.
- `template2.html` — the page (layout, controls, sounds, animations, scoring) with placeholders for the pieces above.
- `build.py` — fills the template and writes `index.html`.
- `pz_easy.json`, `pz_medium.json`, `pz_hard.json`, `pz_extreme.json` — the current 50 puzzles per level.

## Make new puzzles
Needs Node.js 18+ and Python 3.
```
node batch.js easy 50
node batch.js medium 50
node batch.js hard 50
node batch.js extreme 50
python3 build.py
```
Each level prints a summary (parcel range, false parcels, logic levels, shapes). Medium and Extreme take the longest (about 6 minutes each).
Results are deterministic: the same code always produces the same puzzles. To get a different set, change the seed formula in `batch.js`.

Note: regenerating changes which board is #1, #2, … so saved progress would point at different boards. Change the storage keys (`parcels-pt3-...` in `template2.html`) when you ship a new set.

## Tuning difficulty
Edit `PROFILES` in `engine2.js`: board size (`lo`/`hi` tiles), how often real parcels share an attribute (`pSame`), search effort (`iters`), what counts as a better board (`score`) and the minimum logic each board must need (`gate`).
