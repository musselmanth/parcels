// Mutable state for the board being played. Shared by every module, so it lives on one object.
export const G = {
  // The current puzzle: the raw board from src/data plus `tiles` ({s, c, n} per cell) and `solution`.
  P: null,
  // Number of the current board within its level (1-based).
  cur: 0,
  // Parcels the player has made, by id: {id, cells, color (index into TINTS), pinned (locked), fresh/sealFresh (play the entry animation on next render)}.
  groups: {},
  // Id of the parcel drawn on top of the others: the one last pressed or made, so its outline,
  // hold ring and animations are never covered by a neighbor's.
  top: null,
  // Pencilled-in pairs: [{cells: [a, b], fresh}].
  pairs: [],
  // Hinted parcels: cell triples from the solution, outlined until the player makes them.
  hints: [],
  // Undo history: the board before each move (parcels, pairs, hints), oldest first. See record() and
  // undo() in actions.js.
  history: [],
  // The player's checkpoint: a snapshot like the history's, or null. See setCheckpoint() in actions.js.
  checkpoint: null,
  // Next parcel id.
  nextId: 0,
  // Cells currently selected by taps or a swipe in progress.
  sel: [],
  // Rule-breaking parcels tried on this board (shown as Mistakes on the results card).
  misses: 0,
  // Timestamps (ms): first move, and the solve.
  startT: null,
  endT: null,
  // Board is finished (solved or revealed); input is ignored.
  done: false,
  // An animation is running that must finish before the next move.
  busy: false,
  // The player gave up and viewed the solution.
  revealed: false,
  // The win animation is playing.
  celebrating: false,
  // Cells that were just freed from a popped parcel (Set), so render() gives them a spring-back animation.
  released: null,
  // Stats for this attempt, used for scoring and awards. See newStats() in scoring.js.
  st: null,
  // True while submitting a parcel made by swiping (for the swipe count).
  viaSwipe: false,
  // The level this board belongs to (the menu can switch CAT to another level while it's loaded).
  level: null,
  // When the player left the game screen (ms), so the timer can pause until they're back.
  pauseT: null,
};

// The parcel containing cell i, or null.
export const groupOf = (i) => {
  for (const g of Object.values(G.groups)) if (g.cells.includes(i)) return g;
  return null;
};
// The pencilled pair containing cell i, or null.
export const pairOf = (i) => G.pairs.find((p) => p.cells.includes(i)) || null;
