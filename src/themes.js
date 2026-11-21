// ================= look =================
// ================= themes: shapes, colors, tile style =================
export const POS = {
  1: [[50, 50]],
  2: [
    [29, 50],
    [71, 50],
  ],
  3: [
    [50, 29],
    [29, 69],
    [71, 69],
  ],
  4: [
    [29, 29],
    [71, 29],
    [29, 71],
    [71, 71],
  ],
};
export const STAR = (() => {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 7.2 : 16.5,
      a = ((-90 + 36 * k) * Math.PI) / 180;
    d += (k ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a) + 1.2).toFixed(2);
  }
  return d + 'Z';
})();
const pts = (a) => a.map((p) => p.map((v) => (+v).toFixed(2)).join(',')).join(' ');
const sparkle = (x, y, r = 3) =>
  `<path d="M${x},${y - r} L${x + r * 0.32},${y - r * 0.32} ${x + r},${y} ${x + r * 0.32},${y + r * 0.32} ${x},${y + r} ${x - r * 0.32},${y + r * 0.32} ${x - r},${y} ${x - r * 0.32},${y - r * 0.32}Z" fill="#fff" opacity=".95"/>`;

// --- Neon: glowing outline shapes on a dark board
const NEON = ['#9d8cff', '#ff3b5c', '#ffd43b', '#2bff88']; // violet, red, yellow, green: far apart on the color wheel
const NEON_PATHS = [
  'M-11,0 a11,11 0 1,0 22,0 a11,11 0 1,0 -22,0',
  'M-10,-10 h20 v20 h-20Z',
  'M0,-12.5 L12,9 L-12,9Z',
  'M3,-14 L-8,2 L-1,2 L-4,14 L9,-3 L1.5,-3Z',
];
const lighten = (hex, t) =>
  '#' +
  [1, 3, 5]
    .map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16);
      return Math.round(v + (255 - v) * t)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
const NEON_FILL = NEON.map((c) => lighten(c, 0.38));
function neon(s, x, y, c) {
  // solid shapes in a lighter tint of the color, edged in the full color, with a soft glow behind
  const col = NEON[c],
    d = NEON_PATHS[s];
  return (
    `<g transform="translate(${x},${y})"><path d="${d}" fill="none" stroke="${col}" stroke-opacity=".22" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${NEON_FILL[c]}" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/></g>`
  );
}

const THEMES = {
  neon: {
    name: 'Neon',
    glyph: neon,
    colors: NEON,
    body: 'theme-neon',
    tints: [
      ['#221d55', '#8f80ff'],
      ['#123844', '#2ee6ff'],
      ['#3d1638', '#ff4fd8'],
      ['#3a2a12', '#ffa23b'],
      ['#163a2a', '#4dffa6'],
    ],
    merge: { fill: '#2d2246', stroke: '#ffd43b' },
    shapes: ['circle', 'square', 'triangle', 'bolt'],
    colorNames: ['violet', 'red', 'yellow', 'green'],
  },
};
export let TH, COLORS, TINTS;
export function glyph(s, x, y, c) {
  return TH.glyph(s, x, y, c);
}
export const tileLabel = (t) => `${t.n} ${TH.colorNames[t.c]} ${TH.shapes[t.s]}${t.n > 1 ? 's' : ''}`;
export function setTheme(key) {
  TH = THEMES[key] || THEMES.neon;
  COLORS = TH.colors;
  TINTS = TH.tints;
  document.body.className = TH.body;
  const demo = document.querySelector('#shapeDemo');
  if (demo)
    demo.innerHTML = [0, 1, 2, 3]
      .map((s) => `<svg viewBox="-20 -20 40 40" aria-label="${TH.shapes[s]}">${glyph(s, 0, 0, s)}</svg>`)
      .join('');
}
