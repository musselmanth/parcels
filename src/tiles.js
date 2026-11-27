// How tiles and parcels look: the four symbols and four tile colors (drawn as SVG strings), the
// parcel tints, the win animation's gold, and the names screen readers use. The page's own colors
// (background, text, buttons) are CSS tokens in styles/theme-neon.css.

// Where the 1-4 glyphs sit inside a tile, on a 100x100 grid.
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
// SVG path for the five-point star shown in the middle of the board when it is solved.
export const STAR = (() => {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 7.2 : 16.5,
      a = ((-90 + 36 * k) * Math.PI) / 180;
    d += (k ? 'L' : 'M') + (r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a) + 1.2).toFixed(2);
  }
  return d + 'Z';
})();
// The four tile colors (color ids 0-3): violet, red, yellow, green, far apart on the color wheel.
export const COLORS = ['#9d8cff', '#ff3b5c', '#ffd43b', '#2bff88'];
// Symbol outlines centered on 0,0: circle, square, triangle, bolt (shape ids 0-3).
const SHAPE_PATHS = [
  'M-11,0 a11,11 0 1,0 22,0 a11,11 0 1,0 -22,0',
  'M-10,-10 h20 v20 h-20Z',
  'M0,-12.5 L12,9 L-12,9Z',
  'M3,-14 L-8,2 L-1,2 L-4,14 L9,-3 L1.5,-3Z',
];
// Mix a #rrggbb color toward white by t (0-1).
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
const FILLS = COLORS.map((c) => lighten(c, 0.38)); // each color, lightened, for the symbols' insides
// Per shape: a short glossy streak along its upper-left edge, and the point its inner rim shrinks
// toward (the triangle's middle sits a little low).
const SHINE = [
  'M-7.6,-2.7A8.1,8.1 0 0 1 -2.7,-7.6',
  'M-7.3,-3V-7.3H-3',
  'M-1.4,-6.8L-4.9,-0.7',
  'M2.6,-9.5L-2.3,-2.4',
];
const RIM_Y = [0, 0, 1.8, null]; // null: no rim (too narrow a shape for one)
// Draw symbol s in color c at (x, y), like a small polished gem: a soft two-step glow behind, a solid
// body in a lighter tint of the color edged in the full color, a faint inner rim, and a glossy
// streak of light. The details are fine enough to vanish on a phone but keep big tiles from looking
// flat and crude.
export function glyph(s, x, y, c) {
  const col = COLORS[c],
    d = SHAPE_PATHS[s],
    ry = RIM_Y[s];
  return (
    `<g transform="translate(${x},${y})">` +
    [10, 7.5, 5]
      .map(
        (w) =>
          `<path d="${d}" fill="none" stroke="${col}" stroke-opacity=".08" stroke-width="${w}" stroke-linejoin="round"/>`,
      )
      .join('') +
    `<path d="${d}" fill="${FILLS[c]}" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>` +
    (ry === null
      ? ''
      : `<path d="${d}" transform="translate(0,${ry}) scale(.55) translate(0,${-ry})" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linejoin="round"/>`) +
    `<path d="${SHINE[s]}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`
  );
}

// Parcel colors as [fill, outline] pairs (a parcel's color is an index into this list).
export const TINTS = [
  ['#221d55', '#8f80ff'],
  ['#123844', '#2ee6ff'],
  ['#3d1638', '#ff4fd8'],
  ['#3a2a12', '#ffa23b'],
  ['#163a2a', '#4dffa6'],
];
// What every parcel turns in the win animation (and the start screen's board at the end).
export const GOLD = { fill: '#2d2246', stroke: '#ffd43b' };

// Words for screen readers and the help sheet's rule checks.
export const SHAPE_NAMES = ['circle', 'square', 'triangle', 'bolt'];
export const COLOR_NAMES = ['violet', 'red', 'yellow', 'green'];
// Screen-reader label for a tile, e.g. "2 red squares".
export const tileLabel = (t) => `${t.n} ${COLOR_NAMES[t.c]} ${SHAPE_NAMES[t.s]}${t.n > 1 ? 's' : ''}`;
