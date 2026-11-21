// The rule of the game. A parcel is valid when, for each of shape, color and count, its three tiles
// are either all the same or all different. Tiles are {s: shape 0-3, c: color 0-3, n: count 1-3}.
// Shared by the game and the puzzle generator.

// True if x, y, z are all equal or all distinct.
export const sameOrDiff = (x, y, z) => (x === y && y === z) || (x !== y && y !== z && x !== z);
// True if three tiles make a valid parcel.
export function validTiles(A, B, C) {
  return sameOrDiff(A.s, B.s, C.s) && sameOrDiff(A.c, B.c, C.c) && sameOrDiff(A.n, B.n, C.n);
}
// Player-facing explanation of why three tiles don't make a parcel ('' if they do).
export function whyInvalid(A, B, C) {
  const out = [];
  if (!sameOrDiff(A.s, B.s, C.s)) out.push('Shapes: two match and one doesn’t.');
  if (!sameOrDiff(A.c, B.c, C.c)) out.push('Colors: two match and one doesn’t.');
  if (!sameOrDiff(A.n, B.n, C.n)) out.push('Counts: two match and one doesn’t.');
  return out.join(' ');
}
