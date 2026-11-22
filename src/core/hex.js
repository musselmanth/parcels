// Board model, shared by the game and the puzzle generator (generator/engine.js).
// Board = any set of hex cells in axial coordinates [q, r]. Parcels = 3 connected cells.
// Rules: shape, color and count (1-3) are each all the same or all different.
// The current board. setCells() fills these in; everything else only reads them.
//   CELLS       [q, r] axial coordinates of each cell; a cell's index in this list is its id everywhere else
//   N           number of cells
//   GROUPS      number of parcels in a full solution (N / 3)
//   NEIGH       NEIGH[i] = ids of the cells touching cell i
//   PLACEMENTS  every set of 3 connected cells, as sorted id triples (all possible parcels, ignoring tiles)
//   PKEYS       the same triples as "a,b,c" strings, for fast "is this connected?" checks
export let CELLS = [],
  N = 0,
  GROUPS = 0,
  NEIGH = [],
  PLACEMENTS = [],
  PKEYS = new Set();
// The six neighbor offsets in axial coordinates.
export const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
// Make `cells` the current board and precompute its neighbors and possible parcels.
export function setCells(cells) {
  CELLS = cells;
  N = cells.length;
  GROUPS = N / 3;
  PLACEMENTS = [];
  PKEYS = new Set();
  const idx = new Map(cells.map(([q, r], i) => [q + ',' + r, i]));
  NEIGH = cells.map(([q, r]) =>
    DIRS.map(([dq, dr]) => idx.get(q + dq + ',' + (r + dr))).filter((x) => x !== undefined),
  );
  for (let a = 0; a < N; a++)
    for (const b of NEIGH[a])
      for (const c of new Set([...NEIGH[a], ...NEIGH[b]])) {
        if (c === a || c === b) continue;
        const t = [a, b, c].sort((x, y) => x - y),
          k = t.join(',');
        if (!PKEYS.has(k)) {
          PKEYS.add(k);
          PLACEMENTS.push(t);
        }
      }
}

// ---- hex geometry (pointy-top hexes, radius S) ----
// Drawing units: S is the hex radius in SVG units, W3 = sqrt(3).
export const S = 50,
  W3 = Math.sqrt(3),
  PAD = 4;
// SVG position of the center of cell i.
export function center(i) {
  return axialCenter(...CELLS[i]);
}
// SVG position of the center of the hex at axial coordinates [q, r].
export function axialCenter(q, r) {
  return [W3 * S * (q + r / 2), 1.5 * S * r];
}
// Rounds a point to a string key so corners shared by neighboring hexes compare equal.
const vkey = ([x, y]) => (Math.round(x * 10) || 0) + ',' + (Math.round(y * 10) || 0); // ||0 folds -0 into 0

// Trace the outside edge of a group of hexes (clockwise), pull it in by `inset`, round every corner
// with radius R. Returns an SVG path. Used for tile cards, parcel outlines, pairs and the hold ring.
export function blobPath(cells, inset, R) {
  return outlinePath(cells.map(center), inset, R);
}

// Same as blobPath, but for hexes given by their center points rather than cell ids of the current
// board. The help screen uses this to draw its own small example boards.
export function outlinePath(centers, inset, R) {
  const next = new Map(),
    at = new Map();
  for (const [cx, cy] of centers) {
    const v = [0, 1, 2, 3, 4, 5].map((k) => {
      const a = (Math.PI / 180) * (30 + 60 * k);
      return [cx + S * Math.cos(a), cy + S * Math.sin(a)];
    });
    for (let k = 0; k < 6; k++) {
      // skip edges shared with another hex in the group
      const a = (Math.PI / 180) * (60 + 60 * k),
        nx = cx + W3 * S * Math.cos(a),
        ny = cy + W3 * S * Math.sin(a);
      if (centers.some(([x, y]) => Math.hypot(x - nx, y - ny) < 1)) continue;
      const p1 = v[k],
        p2 = v[(k + 1) % 6];
      next.set(vkey(p1), vkey(p2));
      at.set(vkey(p1), p1);
      at.set(vkey(p2), p2);
    }
  }
  const start = next.keys().next().value;
  const pts = [];
  let key = start;
  do {
    pts.push(at.get(key));
    key = next.get(key);
  } while (key !== start && pts.length < 200);
  return roundedPath(pts, inset, R);
}

// The six corners of the hex centered at c, in the order outlines trace them (clockwise on screen).
const hexCorners = ([cx, cy]) =>
  [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return [cx + S * Math.cos(a), cy + S * Math.sin(a)];
  });

// The outline of a pencilled pair, from the two tiles' centers. Touching tiles get the usual outline.
// Two tiles at the ends of a bend have a gap between them: the two tiles that could go in the middle
// touch each other along an edge running straight from one end tile to the other. The outline goes
// around both end tiles and joins them with a thin neck along that edge, squeezing between the two
// middle candidates. neck = half its width before the inset.
export function pairOutline(ca, cb, inset, R, neck = 6) {
  if (Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) < W3 * S + 1) return outlinePath([ca, cb], inset, R);
  const va = hexCorners(ca),
    vb = hexCorners(cb);
  const dist = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1]);
  const nearest = (vs, c) => vs.reduce((best, v, i) => (dist(v, c) < dist(vs[best], c) ? i : best), 0);
  const ia = nearest(va, cb), // the corner of each end tile that points at the other one
    ib = nearest(vb, ca);
  const A = va[ia],
    B = vb[ib],
    len = dist(A, B);
  let side = [(-(B[1] - A[1]) / len) * neck, ((B[0] - A[0]) / len) * neck];
  // leave tile a along the side of the neck its preceding corner is on, so the outline doesn't cross itself
  const prev = va[(ia + 5) % 6];
  if ((prev[0] - A[0]) * side[0] + (prev[1] - A[1]) * side[1] < 0) side = [-side[0], -side[1]];
  const shift = (p, k) => [p[0] + side[0] * k, p[1] + side[1] * k];
  const pts = [];
  for (let k = 1; k <= 5; k++) pts.push(va[(ia + k) % 6]); // around tile a
  pts.push(shift(A, 1), shift(B, 1)); // along one side of the neck
  for (let k = 1; k <= 5; k++) pts.push(vb[(ib + k) % 6]); // around tile b
  pts.push(shift(B, -1), shift(A, -1)); // and back along the other side
  return roundedPath(pts, inset, R);
}

// Pull a closed outline (corners in tracing order) in by `inset`, round every corner with radius R,
// and return it as an SVG path.
function roundedPath(pts, inset, R) {
  const n = pts.length,
    unit = (a, b) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        L = Math.hypot(dx, dy);
      return [dx / L, dy / L];
    };
  const corners = pts.map((p, i) => {
    const d1 = unit(pts[(i - 1 + n) % n], p),
      d2 = unit(p, pts[(i + 1) % n]);
    const n1 = [-d1[1], d1[0]],
      n2 = [-d2[1], d2[0]],
      m = inset / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    const P = [p[0] + m * (n1[0] + n2[0]), p[1] + m * (n1[1] + n2[1])];
    const cross = d1[0] * d2[1] - d1[1] * d2[0],
      theta = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))),
      t = R * Math.tan(theta / 2);
    return {
      a: [P[0] - d1[0] * t, P[1] - d1[1] * t],
      b: [P[0] + d2[0] * t, P[1] + d2[1] * t],
      sweep: cross > 0 ? 1 : 0,
    };
  });
  const f = (v) => v.toFixed(2);
  let d = `M${f(corners[0].b[0])},${f(corners[0].b[1])}`;
  for (let k = 1; k <= n; k++) {
    const c = corners[k % n];
    d += `L${f(c.a[0])},${f(c.a[1])}A${R},${R} 0 0 ${c.sweep} ${f(c.b[0])},${f(c.b[1])}`;
  }
  return d + 'Z';
}

// True if cells a and b touch.
export const adj = (a, b) => NEIGH[a].includes(b);
// Cells touching both a and b: for two tiles one apart, the tiles that could go between them
// (one at the ends of a line, two at the ends of a bend).
export const between = (a, b) => NEIGH[a].filter((c) => c !== b && NEIGH[b].includes(c));
// True if the given 3 cells form a connected parcel shape (line, bend or triangle).
export const connected = (cells) =>
  PKEYS.has(
    cells
      .slice()
      .sort((a, b) => a - b)
      .join(','),
  );
// Average center point of a set of cells.
export const centroid = (cells) => {
  const c = cells.map(center);
  return [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length];
};
