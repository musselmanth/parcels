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

| File                | What's in it                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`        | Page markup: the top bar, the three screens (start, puzzle menu, game), dialogs                                                                        |
| `src/main.js`       | Entry point: loads the CSS, wires every button to its action, starts the game                                                                          |
| `src/screens.js`    | Moving between the three screens, with the slide animation                                                                                             |
| `src/intro.js`      | The start screen: level buttons with progress, the animated board                                                                                      |
| `src/state.js`      | `G`, the state of the board being played (selection, parcels, pairs, timer, ...)                                                                       |
| `src/core/rules.js` | The rule: same-or-different for shape, color and count                                                                                                 |
| `src/core/hex.js`   | The board model (cells, neighbors, possible parcels) and hex geometry for drawing                                                                      |
| `src/core/dom.js`   | Small helpers: `$`, cancellable timers (`later`), time formatting, vibration                                                                           |
| `src/data/`         | The puzzles (`easy.json` ... `extreme.json`) and `puzzles.js`, which lists levels                                                                      |
| `src/storage.js`    | Current level, saved results and preferences (localStorage)                                                                                            |
| `src/progress.js`   | Boards in progress: saved after every move, restored when you come back                                                                                |
| `src/telemetry.js`  | Playtest data: an anonymous log of each session, sent in batches to the collector                                                                      |
| `src/feedback.js`   | The playtest note and the feedback form                                                                                                                |
| `src/config.js`     | The collector's address (`DEPLOYED_API`); empty turns data and feedback off                                                                            |
| `src/install.js`    | The start screen's Install as an app button                                                                                                            |
| `src/tiles.js`      | How tiles and parcels look: the symbols, tile colors, parcel tints, the win gold                                                                       |
| `src/render.js`     | Draws the board SVG, the selection trail, the tip message and the timer                                                                                |
| `src/input.js`      | Pointer handling: taps, swipes, press-and-hold                                                                                                         |
| `src/actions.js`    | What moves do: make / pop / lock parcels, pencil pairs                                                                                                 |
| `src/game.js`       | Opening a board, winning, revealing the solution                                                                                                       |
| `src/scoring.js`    | Results (Perfect!, Solved with N Hints, Loser), compliments, badges, share text                                                                        |
| `src/results.js`    | The results card                                                                                                                                       |
| `src/celebrate.js`  | The win animation                                                                                                                                      |
| `src/fx.js`         | Confetti                                                                                                                                               |
| `src/sound.js`      | Sound effects, synthesized with Web Audio (no audio files)                                                                                             |
| `src/help.js`       | The How to play sheet: animated examples the player can also try                                                                                       |
| `src/menu.js`       | Fills in the puzzle menu (the grid of boards for a level)                                                                                              |
| `src/history.js`    | Moving results to another device with a transfer code (Settings > Play history)                                                                        |
| `src/styles/`       | CSS: color tokens and theme, page layout, board and animations, dialogs, menu, help; `responsive.css` adapts it all for tablets, desktop and landscape |
| `public/`           | Copied as-is to the site root: icons, `og-image.png` (link previews), `site.webmanifest`, `robots.txt`, `sitemap.xml`                                  |
| `generator/`        | Puzzle generator ([generator/README.md](generator/README.md))                                                                                          |
| `worker/`           | Playtest data collector: a Cloudflare Worker + database, with a private admin page ([worker/README.md](worker/README.md))                              |

Every module starts with a comment saying what it's for, and functions have a line or two above them.

## How it works

**Screens.** The page is a top bar (the title, which always leads back to the start screen, plus Settings and Help) above three screens: the start screen, the puzzle menu and the game. `showScreen(name)` in `src/screens.js` slides between them: going deeper (start → menu → game) slides in from the right, going back from the left. It also sets `<body data-screen="...">`, which the CSS uses to change the top bar per screen. `main.js` decides where each button goes (`playBoard`, `toMenu`, `pickLevel`).

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
- **Results:** a finished board is **Perfect!** (no hints), **Solved with N Hints**, or **Loser** (solution viewed); see `resultOf` in `src/scoring.js`. There are no points or stars. Time, mistakes and pops are shown on the results card and feed the badges (`awardFor`), but never change the result. The line of praise under the result does react to how it went: speed (seconds per parcel) and slips (mistakes + pops), judged per level; see `PACE` and `PRAISE` in `src/scoring.js`.
- **Colors:** tile colors, parcel tints and the win animation's gold are in `src/tiles.js`; page colors are the CSS tokens in `src/styles/theme-neon.css`. How strongly parcels are tinted is `.parcel .card` in `src/styles/board.css`.
- **A new look:** the tiles' symbols and colors are `src/tiles.js` and the page's colors are the tokens at the top of `src/styles/theme-neon.css`; change those to restyle the game.
- **Sounds:** `sfx` in `src/sound.js`. Notes are MIDI numbers (60 = middle C).
- **Layout on other screens:** phones held upright are the base styles. `src/styles/responsive.css` (loaded last) enlarges things on tablets and desktop and, in landscape, moves the top bar, stats, tip and buttons into a left sidebar so the board gets the rest of the screen (a CSS grid on `#app`).
- **Feel and animation timing:** `styles/board.css` (tile and parcel animations), `HOLD` in `src/actions.js` (press-and-hold time), `celebrate()` in `src/celebrate.js`.
- **Hints:** `giveHint()` in `src/actions.js` picks the parcel; the dotted outline is `.hint` in `src/styles/board.css`.
- **Best times:** one per level, fastest solve without hints, saved by `loadBest`/`saveBest` in `src/storage.js` and checked in `win()` in `src/game.js`.
- **Playtest data:** add an event with `track('name', {...})` from `src/telemetry.js`; it shows up in the collector's `events` table. Setup and reading the data: [worker/README.md](worker/README.md).
- **Puzzles:** `npm run generate`; see [generator/README.md](generator/README.md).

## Things to know

- **Saved results and boards in progress are keyed by board number** within each level, under the localStorage keys in `src/data/puzzles.js`.
  - Adding boards to the end of a level is safe.
  - Reordering or removing boards makes old results point at the wrong boards.
  - If you replace a level's boards wholesale, change its key.
- **Imported variables are read-only** in ES modules. A module can read `CELLS` or `store` from another module, but only the module that declares a variable can assign to it. That's why the board-in-play state is on the `G` object, and why `storage.js` has `setCat()` and `loadStore()`. Follow the same pattern for new shared state: put it on `G`, or add a setter function next to the variable.
- **localStorage can be unavailable** (private browsing, blocked storage). Every access is wrapped in `try`/`catch` so the game still runs; keep doing that.
- **Code style:** Prettier formats the code (`npm run format`). The puzzle JSON files are excluded, because Prettier would put every number on its own line.

## Puzzle format

See [generator/README.md](generator/README.md#puzzle-format).
