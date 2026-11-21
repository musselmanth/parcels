// ===== RUNTIME START (shared by the game page and the generator) =====
// Board = any set of hex cells in axial coordinates [q, r]. Parcels = 3 connected cells.
// Rules: shape, color and count (1-3) are each all the same or all different.
export let CELLS = [],
  N = 0,
  GROUPS = 0,
  NEIGH = [],
  PLACEMENTS = [],
  PKEYS = new Set();
const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
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
export const S = 50,
  W3 = Math.sqrt(3),
  PAD = 4;
export function center(i) {
  const [q, r] = CELLS[i];
  return [W3 * S * (q + r / 2), 1.5 * S * r];
}
function hexVerts(i) {
  const [x, y] = center(i);
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return [x + S * Math.cos(a), y + S * Math.sin(a)];
  });
}
const vkey = ([x, y]) => (Math.round(x * 10) || 0) + ',' + (Math.round(y * 10) || 0); // ||0 folds -0 into 0

// Trace the outside edge of a group of hexes (clockwise), pull it in by `inset`, round every corner.
export function blobPath(cells, inset, R) {
  const set = new Set(cells),
    next = new Map(),
    at = new Map();
  for (const i of cells) {
    const v = hexVerts(i),
      [cx, cy] = center(i);
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 + 60 * k),
        nx = cx + W3 * S * Math.cos(a),
        ny = cy + W3 * S * Math.sin(a);
      const shared = cells.some((j) => j !== i && Math.hypot(center(j)[0] - nx, center(j)[1] - ny) < 1);
      if (shared) continue;
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

export const adj = (a, b) => NEIGH[a].includes(b);
export const connected = (cells) =>
  PKEYS.has(
    cells
      .slice()
      .sort((a, b) => a - b)
      .join(','),
  );
export const centroid = (cells) => {
  const c = cells.map(center);
  return [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length];
};
