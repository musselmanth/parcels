import { $ } from './core/dom.js';
import { GROUPS } from './core/hex.js';
import { prefs } from './storage.js';

// ================= sound: soft 80s synth palette (Web Audio, made on the fly) =================
// Warm and gentle: FM electric-piano and bell tones (think DX7), a soft triangle pad,
// a mellow echo. Parcels walk an Am–F–C–G progression as you place them.
let AC = null,
  OUT = null,
  ECHO = null;
export function audio() {
  if (!prefs.sound) return null;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 3;
      comp.connect(AC.destination);
      OUT = AC.createGain();
      OUT.gain.value = 1.6;
      OUT.connect(comp);
      ECHO = AC.createGain();
      ECHO.gain.value = 1;
      const d = AC.createDelay(1),
        fb = AC.createGain(),
        lp = AC.createBiquadFilter();
      d.delayTime.value = 0.22;
      fb.gain.value = 0.24;
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      ECHO.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(OUT);
    }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {
    AC = null;
  }
  return AC;
}
const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function send(g, echo) {
  if (echo) {
    const e = AC.createGain();
    e.gain.value = echo;
    g.connect(e);
    e.connect(ECHO);
  }
}
// FM voice: ratio 1 = mellow electric piano, ratio ~3.5 = glassy bell
function fm(
  f,
  { at = 0, dur = 0.6, vol = 0.05, ratio = 1, index = 1.2, idecay = 0.25, attack = 0.005, echo = 0.2 } = {},
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at,
    car = ac.createOscillator(),
    mod = ac.createOscillator(),
    mg = ac.createGain(),
    g = ac.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(f * index * 0.04, 0.01), t + idecay);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  g.connect(OUT);
  send(g, echo);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}
// soft pad / glide voice: two slightly detuned triangles through a gentle low-pass
function soft(
  f,
  {
    at = 0,
    dur = 0.5,
    vol = 0.04,
    attack = 0.02,
    cut = 1800,
    glide = null,
    detune = 6,
    echo = 0.15,
    type = 'triangle',
  } = {},
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at,
    g = ac.createGain(),
    lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cut;
  lp.Q.value = 0.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  [-detune, detune].forEach((dt) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + Math.min(dur * 0.6, 0.12));
    o.detune.value = dt;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
  lp.connect(g);
  g.connect(OUT);
  send(g, echo);
}
const PROG = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]; // Am  F  C  G
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88]; // A minor pentatonic, climbing
// A minor pentatonic from A3 up to D7: 18 notes, enough for the biggest board
const MELODY = [];
for (let o = 0; o < 4; o++)
  for (const off of [0, 3, 5, 7, 10]) {
    const m = 57 + 12 * o + off;
    if (m <= 98) MELODY.push(m);
  }
const ep = (m, at = 0, vol = 0.045, dur = 0.8) =>
  fm(nf(m), { at, dur, vol, ratio: 1, index: 1.1, idecay: 0.3, echo: 0.22 });
const bell = (m, at = 0, vol = 0.035, dur = 1.1) =>
  fm(nf(m), { at, dur, vol, ratio: 3.5, index: 1.6, idecay: 0.45, echo: 0.3 });
export const sfx = {
  tap: () => fm(nf(84), { dur: 0.16, vol: 0.028, ratio: 2, index: 0.5, idecay: 0.05, echo: 0.08 }),
  step: (n) =>
    fm(nf([72, 76, 79][Math.min(n, 3) - 1] || 72), {
      dur: 0.22,
      vol: 0.035,
      ratio: 1,
      index: 0.7,
      idecay: 0.08,
      echo: 0.1,
    }),
  pair: () => {
    ep(76, 0, 0.04, 0.45);
    ep(81, 0.08, 0.035, 0.5);
  },
  group: (n) => {
    // a melody note that climbs one step with every parcel, so the board sounds like it's rising toward the finish,
    // over a quieter chord from the Am–F–C–G loop
    // Every board climbs to the same peak on its last parcel, one new note per parcel, so even 17-parcel boards never repeat a note.
    const ch = PROG[n % 4],
      top = MELODY[Math.min(MELODY.length - 1, Math.max(0, MELODY.length - GROUPS) + n)];
    ch.forEach((m, i) => ep(m + 12, i * 0.03, 0.022, 0.8));
    ep(top, 0.07, 0.05, 1);
    bell(Math.min(top + 12, 105), 0.07, 0.012, 0.8);
    soft(nf(ch[0] - 12), { dur: 0.55, vol: 0.045, type: 'sine', cut: 600, detune: 0, echo: 0 });
  },
  bad: () => {
    soft(nf(64), { dur: 0.22, vol: 0.045, cut: 1200, echo: 0.05 });
    soft(nf(60), { at: 0.13, dur: 0.32, vol: 0.045, cut: 1000, echo: 0.05 });
  },
  pin: () => {
    bell(88, 0, 0.035, 0.9);
    bell(93, 0.07, 0.025, 1);
  },
  unpin: () => bell(84, 0, 0.03, 0.8),
  brk: () => sfx.pop(),
  pop: (quiet) => {
    soft(nf(67), {
      dur: 0.13,
      vol: quiet ? 0.035 : 0.06,
      type: 'sine',
      cut: 4000,
      glide: nf(79),
      detune: 0,
      attack: 0.004,
      echo: 0.12,
    });
    fm(nf(91), {
      at: 0.04,
      dur: 0.25,
      vol: quiet ? 0.012 : 0.02,
      ratio: 3.5,
      index: 0.8,
      idecay: 0.12,
      echo: 0.2,
    });
  },
  note: (k) => ep(PENTA[k % PENTA.length] + 12, 0, 0.04, 0.7),
  fanfare: () => {
    [
      [0, PROG[0]],
      [0.32, PROG[1]],
      [0.58, PROG[3]],
    ].forEach(([t, ch]) => ch.forEach((m, i) => ep(m + 12, t + i * 0.025, 0.035, 0.6)));
    for (let i = 0; i < 10; i++) bell(PENTA[(i * 2) % PENTA.length] + 12, 0.86 + i * 0.1, 0.022, 0.9);
    [57, 64, 69, 73, 76].forEach((m) =>
      soft(nf(m), { at: 0.86, dur: 2.2, vol: 0.022, attack: 0.25, cut: 2000, echo: 0.2 }),
    );
  },
  finale: () => {
    [57, 64, 69, 73, 76].forEach((m) =>
      soft(nf(m), { dur: 2.6, vol: 0.026, attack: 0.3, cut: 2400, echo: 0.25 }),
    );
    soft(nf(45), { dur: 1.8, vol: 0.05, type: 'sine', cut: 500, detune: 0, echo: 0 });
    bell(81, 0.1, 0.03, 1.4);
    bell(88, 0.35, 0.025, 1.4);
    bell(93, 0.6, 0.02, 1.6);
  },
};

export function paintSound() {
  const b = $('#bSound');
  b.textContent = prefs.sound ? 'On' : 'Off';
  b.classList.toggle('primary', prefs.sound);
}
