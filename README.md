# Parcels

A hex-tile logic puzzle. Split the board into parcels of 3 connected tiles. In every parcel, the tiles' shapes are all the same or all different, and so are their colors and their counts. Only one way of splitting each board works.

Plain JavaScript (ES modules, no framework), built with [Vite](https://vitejs.dev).

## Commands

```bash
npm install                         # once, after cloning
npm run dev                         # dev server at http://localhost:5173, reloads as you edit
npm run build                       # production build into dist/
npm run preview                     # serve the dist/ build locally
npm run format                      # format the code with Prettier
npm run generate -- <level> <count> # add new puzzles (see generator/README.md)
npm run check-puzzles               # verify every puzzle has exactly one solution
```

**Testing on a phone:** `npm run dev` also prints a `Network:` address. Open it on a phone on the same Wi-Fi. On WSL, that address may not be reachable from other devices without extra Windows port forwarding.

**Deploying:** pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds the site and publishes it to GitHub Pages. The repo's Settings → Pages → Source must be set to "GitHub Actions".

## Files

| File                | What's in it                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `index.html`        | Page markup: top bar, board, buttons, dialogs, puzzle menu                        |
| `src/main.js`       | Entry point: loads the CSS, wires every button to its action, starts the game     |
| `src/state.js`      | `G`, the state of the board being played (selection, parcels, pairs, timer, ...)  |
| `src/core/rules.js` | The rule: same-or-different for shape, color and count                            |
| `src/core/hex.js`   | The board model (cells, neighbors, possible parcels) and hex geometry for drawing |
| `src/core/dom.js`   | Small helpers: `$`, cancellable timers (`later`), time formatting, vibration      |
| `src/data/`         | The puzzles (`easy.json` ... `extreme.json`) and `puzzles.js`, which lists levels |
| `src/storage.js`    | Current level, saved results and preferences (localStorage)                       |
| `src/themes.js`     | Tile shapes and colors (the Neon theme)                                           |
| `src/render.js`     | Draws the board SVG, the selection trail, the tip message and the timer           |
| `src/input.js`      | Pointer handling: taps, swipes, press-and-hold                                    |
| `src/actions.js`    | What moves do: make / pop / lock parcels, pencil pairs                            |
| `src/game.js`       | Opening a board, winning, revealing the solution                                  |
| `src/scoring.js`    | Par time, score, stars, compliments, awards, share text                           |
| `src/results.js`    | The results card                                                                  |
| `src/celebrate.js`  | The win animation                                                                 |
| `src/fx.js`         | Confetti                                                                          |
| `src/sound.js`      | Sound effects, synthesized with Web Audio (no audio files)                        |
| `src/help.js`       | The How to play sheet: animated examples the player can also try                  |
| `src/menu.js`       | The puzzle picker                                                                 |
| `src/history.js`    | Export / import of play history                                                   |
| `src/styles/`       | CSS: color tokens and theme, page layout, board and animations, dialogs, menu     |
| `generator/`        | Puzzle generator ([generator/README.md](generator/README.md))                     |

Every module starts with a comment saying what it's for, and functions have a line or two above them.

## How it works

**The board.** A board is a list of hex cells in axial coordinates. A cell's position in that list is its id everywhere: in tiles, parcels, the solution and the DOM (`data-i`). `setCells()` in `core/hex.js` makes a board current and precomputes each cell's neighbors and every possible parcel shape (`PLACEMENTS`).

**State.** Everything about the board in play lives on one object, `G` in [src/state.js](src/state.js), and each field is described there. Modules read and change `G.sel`, `G.groups` and so on directly. Saved data (results, preferences) lives in [src/storage.js](src/storage.js).

**A move, end to end.**

1. A pointer event reaches `input.js`.
2. `input.js` decides whether it's a tap, a swipe or a press-and-hold, and calls a function in `actions.js` (`tapCell`, `submit`, `makePair`, `startHold`, ...).
3. The action updates `G`, plays a sound (`sfx.*`) and calls `render()`.
4. `render()` rebuilds the board SVG from `G`.
5. When the last parcel is placed, `submit()` calls `win()` in `game.js`. That shows the results, saves the best run and starts `celebrate()`.

**Drawing.** `render()` regenerates the whole board as an SVG string on every move. It's simple and fast enough at these sizes. Animations are CSS classes added in that markup (`.enter` plays a new parcel's entry animation, `.release` springs back freed tiles, and so on); they're defined in `styles/board.css`. Parcels and pairs set a one-shot `fresh` flag so their entry animation plays only once. While a finger is moving, `paintSel()` updates just the selection highlight, without a rebuild.

**Timers.** Use `later(fn, ms)` from `core/dom.js` instead of `setTimeout` for anything tied to the current board, and push animation frame ids onto `rafs`. `openPuzzle()` calls `clearFx()`, which cancels all of them, so leaving a board mid-animation doesn't leak effects into the next one.

## Making common changes

- **The rules text and help:** the help sheet's text is in `index.html` (`#mHelp`). Its animated, playable examples (boards, tiles and what the pretend finger does) are `DEMOS` in `src/help.js`, styled by `src/styles/help.css`. Rule-break messages are `whyInvalid()` in `src/core/rules.js`.
- **Scoring:** everything is at the top of `src/scoring.js`:
  - par time per parcel (`PAR_PER_PARCEL`)
  - how many mistakes and pops each level forgives (`ALLOW`)
  - star thresholds (`TIERS`)
  - awards (`awardFor`)
  - compliments
- **Colors:** tile colors and parcel tints are in `THEMES` in `src/themes.js`; page colors are the CSS tokens in `src/styles/theme-neon.css`. How strongly parcels are tinted is `.parcel .card` in `src/styles/board.css`.
- **A new theme:**
  1. Add an entry to `THEMES` in `src/themes.js`.
  2. Add a `body.theme-<name>` block of tokens in the CSS.
  3. Call `setTheme('<name>')` in `src/main.js`.
- **Sounds:** `sfx` in `src/sound.js`. Notes are MIDI numbers (60 = middle C).
- **Feel and animation timing:** `styles/board.css` (tile and parcel animations), `HOLD` in `src/actions.js` (press-and-hold time), `celebrate()` in `src/celebrate.js`.
- **Puzzles:** `npm run generate`; see [generator/README.md](generator/README.md).

## Things to know

- **Saved results are keyed by board number** within each level, under the localStorage keys in `src/data/puzzles.js`.
  - Adding boards to the end of a level is safe.
  - Reordering or removing boards makes old results point at the wrong boards.
  - If you replace a level's boards wholesale, change its key.
- **Imported variables are read-only** in ES modules. A module can read `CELLS` or `store` from another module, but only the module that declares a variable can assign to it. That's why the board-in-play state is on the `G` object, and why `storage.js` has `setCat()` and `loadStore()`. Follow the same pattern for new shared state: put it on `G`, or add a setter function next to the variable.
- **localStorage can be unavailable** (private browsing, blocked storage). Every access is wrapped in `try`/`catch` so the game still runs; keep doing that.
- **Code style:** Prettier formats the code (`npm run format`). The puzzle JSON files are excluded, because Prettier would put every number on its own line.

## Puzzle format

See [generator/README.md](generator/README.md#puzzle-format).
