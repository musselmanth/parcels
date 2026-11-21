const sameOrDiff = (x, y, z) => (x === y && y === z) || (x !== y && y !== z && x !== z);
function validTiles(A, B, C) {
  return sameOrDiff(A.s, B.s, C.s) && sameOrDiff(A.c, B.c, C.c) && sameOrDiff(A.n, B.n, C.n);
}
export function whyInvalid(A, B, C) {
  const out = [];
  if (!sameOrDiff(A.s, B.s, C.s)) out.push('Shapes: two match and one doesn’t.');
  if (!sameOrDiff(A.c, B.c, C.c)) out.push('Colors: two match and one doesn’t.');
  if (!sameOrDiff(A.n, B.n, C.n)) out.push('Counts: two match and one doesn’t.');
  return out.join(' ');
}
