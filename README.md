# Parcels

A hex-tile logic puzzle. Split the board into parcels of 3 connected tiles where shape, color and count are each all-same or all-different.

## Develop

```bash
npm install
npm run dev      # dev server with hot reload at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the dist/ build locally
npm run format   # prettier
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Layout

| File | What's in it |
| --- | --- |
| `index.html` | Page markup: header, board, modals, puzzle menu |
| `src/main.js` | Entry point: wires up buttons and starts the game |
| `src/state.js` | `G`, the mutable state of the board being played (selection, parcels, pairs, timer, ...) |
| `src/core/hex.js` | Hex grid geometry: cells, neighbours, valid placements, outline paths |
| `src/core/rules.js` | The same-or-different rule check |
| `src/core/dom.js` | `$`, the board element, timers, haptics, formatting helpers |
| `src/data/` | The puzzle sets (`easy.json` ... `extreme.json`) and `puzzles.js`, which lists them |
| `src/storage.js` | Current level, saved results and preferences (localStorage) |
| `src/themes.js` | Tile glyphs, colors, the Neon theme |
| `src/render.js` | Draws the board SVG, the selection trail and the tip message |
| `src/actions.js` | Game moves: make/pop/lock parcels, pencil pairs, tap handling |
| `src/input.js` | Pointer handling: taps, swipes, press-and-hold |
| `src/game.js` | Opening a puzzle, winning, revealing the solution |
| `src/scoring.js` | Par times, score, stars, awards, share text |
| `src/results.js` | The results card |
| `src/celebrate.js` | The win animation |
| `src/fx.js` | Confetti particles |
| `src/sound.js` | Synthesized sound effects (Web Audio) |
| `src/menu.js` | The puzzle picker |
| `src/history.js` | Export / import of play history |
| `src/styles/` | CSS, split by area |

### Puzzle format

Each board in `src/data/*.json`: `c` is a flat list of axial hex coordinates `q0,r0,q1,r1,...`; `t` is 3 digits per tile (shape, color, count); `sol` is the solution as triples of cell indexes; `d`, `f`, `l` are difficulty stats shown on the results card.
