import { $, board } from './core/dom.js';
import { G } from './state.js';
import { COLORS, TINTS } from './themes.js';

// ================= particles =================
const fx = $('#fx'),
  ctx = fx.getContext('2d');
let parts = [],
  fxOn = false;
function sizeFx() {
  const d = window.devicePixelRatio || 1;
  fx.width = innerWidth * d;
  fx.height = innerHeight * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
sizeFx();
addEventListener('resize', sizeFx);
export function burst(x, y, colors, n = 16, power = 5, dir = null, spread = Math.PI * 2) {
  for (let k = 0; k < n; k++) {
    const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread,
      v = power * (0.45 + Math.random() * 0.8);
    parts.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - (dir === null ? 1.5 : 0),
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.35,
      s: 3.5 + Math.random() * 4.5,
      c: colors[k % colors.length],
      life: 1,
      dec: 0.011 + Math.random() * 0.012,
      sh: Math.random() < 0.55 ? 0 : 1,
    });
  }
  if (!fxOn) {
    fxOn = true;
    requestAnimationFrame(fxLoop);
  }
}
function fxLoop() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += 0.17;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    p.life -= p.dec;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    if (p.sh === 0) ctx.fillRect(-p.s / 2, -p.s / 3.2, p.s, p.s / 1.6);
    else {
      ctx.beginPath();
      ctx.arc(0, 0, p.s / 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (parts.length) requestAnimationFrame(fxLoop);
  else {
    fxOn = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}
export function toScreen(x, y) {
  const m = board.getScreenCTM();
  if (!m) return [innerWidth / 2, innerHeight / 2];
  const p = new DOMPoint(x, y).matrixTransform(m);
  return [p.x, p.y];
}
export function groupColors(g) {
  const [tint, dark] = TINTS[g.color];
  const cs = new Set([tint, dark]);
  g.cells.forEach((i) => cs.add(COLORS[G.P.tiles[i].c]));
  return [...cs];
}

export function clearParticles() {
  parts = [];
}
