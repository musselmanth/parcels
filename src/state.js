// Mutable state for the board being played. Shared by every module, so it lives on one object.
export const G = {
  P: null,
  cur: 0,
  groups: {},
  pairs: [],
  nextId: 0,
  sel: [],
  misses: 0,
  startT: null,
  endT: null,
  done: false,
  busy: false,
  revealed: false,
  celebrating: false,
  released: null,
  st: null,
  viaSwipe: false,
};

export const groupOf = (i) => {
  for (const g of Object.values(G.groups)) if (g.cells.includes(i)) return g;
  return null;
};
export const pairOf = (i) => G.pairs.find((p) => p.cells.includes(i)) || null;
