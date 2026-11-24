// Sound lab: try five sound sets in the real game. Development only: open the game with ?soundlab
// at the end of the address (http://localhost:5173/?soundlab) and a small panel appears in the corner.
// It swaps the game's own sound effects (sfx in src/sound.js) for the chosen set's, so every sound
// plays from the real controls, board and win sequence; it can also play each set's music.
// main.js loads this file only in the dev server, so it never ships. Nothing else uses it.
//
// Every set implements the game's sounds:
//   tap, step(n) (swipe reaching tile n), pair, group(n, total) (parcel n of total made), bad (rule
//   broken), pin (lock), unpin (unlock), hint, pop(quiet), note(k) (win: parcel k hops),
//   fanfare (win: board spins), finale (win: done)
// plus beat(i, t, bar): one 16th-note step of its music loop at time t.
import { GROUPS } from '../src/core/hex.js';
import { sfx as gameSfx } from '../src/sound.js';
import { prefs } from '../src/storage.js';

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const VOL = { sfx: 1, music: 0.8 };

// ================================================================= audio engine
// voices -> bus (effects or music) -> master -> compressor -> speakers, and each voice can send
// some of itself to its bus's reverb (an impulse response made of decaying noise).
let AC = null,
  MASTER = null,
  NOISE = null,
  METER = null;
const BUS = {};
function audio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.connect(AC.destination);
  MASTER = AC.createGain();
  MASTER.gain.value = 1.3 * pack().gain;
  MASTER.connect(comp);
  for (const name of ['sfx', 'music']) {
    const g = AC.createGain(),
      verb = AC.createGain(),
      conv = AC.createConvolver();
    g.gain.value = VOL[name];
    verb.connect(conv);
    conv.connect(g);
    g.connect(MASTER);
    BUS[name] = { g, verb, conv };
  }
  const len = AC.sampleRate * 2;
  NOISE = AC.createBuffer(1, len, AC.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  setReverb(pack().verb);
  // a meter on the output, for checking levels (window.lab.peak)
  METER = AC.createAnalyser();
  METER.fftSize = 2048;
  MASTER.connect(METER);
  return AC;
}
// Loudest sample (0..1) heard on the output over the next `ms` milliseconds.
function peak(ms) {
  const buf = new Float32Array(METER.fftSize);
  let max = 0;
  return new Promise((res) => {
    const t0 = performance.now();
    const read = () => {
      METER.getFloatTimeDomainData(buf);
      for (const v of buf) max = Math.max(max, Math.abs(v));
      if (performance.now() - t0 < ms) setTimeout(read, 15);
      else res(max);
    };
    read();
  });
}
function setReverb([sec, decay]) {
  if (!AC) return;
  const len = Math.floor(AC.sampleRate * sec),
    buf = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  for (const b of Object.values(BUS)) b.conv.buffer = buf;
}
const T0 = (at, when) => (when != null ? when : AC.currentTime + at);
// An envelope gain: up to `vol` in `a` seconds, then down to silence by `dur`.
function env(t, vol, a, dur) {
  const g = AC.createGain();
  // silent from the start: a gain is 1 until its first scheduled change, and a sound starting a
  // fraction of a sample early would otherwise get one full-volume sample through (a loud click)
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}
function route(node, bus, verb) {
  const b = BUS[bus];
  node.connect(b.g);
  if (verb) {
    const s = AC.createGain();
    s.gain.value = verb;
    node.connect(s);
    s.connect(b.verb);
  }
}
// A level that jumps around at random (a neon tube flickering); `settle` makes it calm down over
// its length, as a tube does once it's lit.
function flicker(t, dur, depth, rate = 40, settle = false) {
  const g = AC.createGain();
  for (let x = 0; x < dur; x += 1 / rate) {
    const d = settle ? depth * Math.max(0, 1 - x / (dur * 0.6)) : depth;
    g.gain.setValueAtTime(1 - d * Math.random(), t + x);
  }
  return g;
}
// Tremolo (AM radio wobble): a gain swaying at `rate` by `depth`.
function tremolo(t, dur, depth, rate) {
  const g = AC.createGain(),
    l = AC.createOscillator(),
    lg = AC.createGain();
  g.gain.value = 1 - depth;
  l.frequency.value = rate;
  lg.gain.value = depth;
  l.connect(lg);
  lg.connect(g.gain);
  l.start(t);
  l.stop(t + dur + 0.1);
  return g;
}

// One tone. f: Hz; type: wave; glide: slide to another Hz over glideTime; cut/hp: low-/high-pass;
// flick/settle: flickering level; am/amRate: tremolo; vib: vibrato (cents).
function tone({
  f,
  at = 0,
  when = null,
  dur = 0.3,
  type = 'sine',
  vol = 0.05,
  a = 0.005,
  glide = null,
  glideTime = 0.1,
  cut = 12000,
  cutTo = null,
  cutTime = 0.2,
  q = 0.7,
  hp = 0,
  flick = 0,
  settle = false,
  am = 0,
  amRate = 6,
  vib = 0,
  vibRate = 5.5,
  verb = 0.2,
  bus = 'sfx',
}) {
  audio();
  const t = T0(at, when),
    o = AC.createOscillator(),
    lp = AC.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
  if (vib) {
    const l = AC.createOscillator(),
      lg = AC.createGain();
    l.frequency.value = vibRate;
    lg.gain.value = vib;
    l.connect(lg);
    lg.connect(o.detune);
    l.start(t);
    l.stop(t + dur + 0.1);
  }
  lp.type = 'lowpass';
  lp.Q.value = q;
  lp.frequency.setValueAtTime(cut, t);
  if (cutTo) lp.frequency.exponentialRampToValueAtTime(cutTo, t + cutTime);
  let node = lp;
  o.connect(lp);
  if (hp) {
    const h = AC.createBiquadFilter();
    h.type = 'highpass';
    h.frequency.value = hp;
    node.connect(h);
    node = h;
  }
  if (flick) {
    const fl = flicker(t, dur, flick, 40, settle);
    node.connect(fl);
    node = fl;
  }
  if (am) {
    const tr = tremolo(t, dur, am, amRate);
    node.connect(tr);
    node = tr;
  }
  const g = env(t, vol, a, dur);
  node.connect(g);
  route(g, bus, verb);
  o.start(t);
  o.stop(t + dur + 0.1);
}
// Filtered noise. type: filter type; f: its frequency; sweep: slide the filter to another Hz.
function hiss({
  at = 0,
  when = null,
  dur = 0.1,
  vol = 0.05,
  type = 'bandpass',
  f = 2000,
  q = 0.7,
  sweep = null,
  a = 0.002,
  flick = 0,
  verb = 0.1,
  bus = 'sfx',
}) {
  audio();
  const t = T0(at, when),
    src = AC.createBufferSource(),
    fl = AC.createBiquadFilter();
  src.buffer = NOISE;
  src.loop = true;
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  src.connect(fl);
  let node = fl;
  if (flick) {
    const fk = flicker(t, dur, flick, 60);
    node.connect(fk);
    node = fk;
  }
  const g = env(t, vol, a, dur);
  node.connect(g);
  route(g, bus, verb);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}
// Crackle: a few tiny random clicks spread over `dur` (electricity, static, a needle).
function crackle({ at = 0, when = null, dur = 0.15, n = 5, vol = 0.04, f = 3000, bus = 'sfx', verb = 0.1 }) {
  const t = T0(at, when);
  for (let k = 0; k < n; k++)
    hiss({
      when: t + Math.random() * dur,
      dur: 0.008 + Math.random() * 0.012,
      vol: vol * (0.5 + Math.random() * 0.5),
      f,
      q: 0.9,
      bus,
      verb,
    });
}
// Vowels: three formant frequencies each (what makes an "ah" an "ah").
const VOWEL = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [300, 2200, 2950],
  o: [570, 840, 2410],
  u: [320, 800, 2240],
  m: [280, 900, 2200],
};
// A sung vowel: a buzzy source through three formant filters. to: a vowel to move to (e.g. 'a'
// to 'o' for "ow"); breath: whispered (noise) instead of voiced.
function vox({
  f,
  vowel = 'a',
  to = null,
  at = 0,
  when = null,
  dur = 0.4,
  vol = 0.05,
  a = 0.02,
  vib = 6,
  glide = null,
  glideTime = 0.15,
  breath = false,
  verb = 0.3,
  bus = 'sfx',
}) {
  audio();
  const t = T0(at, when);
  let src;
  if (breath) {
    src = AC.createBufferSource();
    src.buffer = NOISE;
    src.loop = true;
    src.start(t, Math.random());
  } else {
    src = AC.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f, t);
    if (glide) src.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
    if (vib) {
      const l = AC.createOscillator(),
        lg = AC.createGain();
      l.frequency.value = 5.2;
      lg.gain.value = vib;
      l.connect(lg);
      lg.connect(src.detune);
      l.start(t);
      l.stop(t + dur + 0.1);
    }
    src.start(t);
  }
  src.stop(t + dur + 0.1);
  const g = env(t, vol, a, dur),
    mix = AC.createGain();
  mix.gain.value = breath ? 0.5 : 1;
  VOWEL[vowel].forEach((F, k) => {
    const bp = AC.createBiquadFilter(),
      lvl = AC.createGain();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(F, t);
    if (to) bp.frequency.linearRampToValueAtTime(VOWEL[to][k], t + dur * 0.6);
    bp.Q.value = 9;
    lvl.gain.value = [1, 0.55, 0.25][k] * 3;
    src.connect(bp);
    bp.connect(lvl);
    lvl.connect(mix);
  });
  mix.connect(g);
  route(g, bus, verb);
}
// A water drop: a sine that chirps upward fast (that's what a drop "plink" is).
const drop = (f, o = {}) =>
  tone({ f, glide: f * 2.3, glideTime: 0.06, dur: 0.16, vol: 0.06, a: 0.002, verb: 0.35, ...o });
// A glass "tink": a pure tone plus an out-of-tune overtone, very short.
const tink = (f, o = {}) => {
  tone({ f, dur: 0.5, vol: 0.03, a: 0.001, verb: 0.3, ...o });
  tone({ f: f * 2.76, dur: 0.12, vol: (o.vol || 0.03) * 0.4, a: 0.001, verb: 0.3, ...o });
};
// A low thump (relays, keys, a bass drum made of air).
const thump = (o = {}) =>
  tone({ f: 120, glide: 55, glideTime: 0.08, dur: 0.14, vol: 0.12, a: 0.002, verb: 0.05, ...o });
// A chord helper: run `fn(note, i)` for each note.
const each = (notes, fn) => notes.forEach(fn);

// A melody that climbs one note per parcel and peaks on the last one.
const climb = (scale, n, total) => scale[Math.min(scale.length - 1, Math.max(0, scale.length - total) + n)];
const scale = (root, octaves, steps) => {
  const out = [];
  for (let o = 0; o < octaves; o++) for (const s of steps) out.push(root + 12 * o + s);
  return out;
};
const MINPENT = [0, 3, 5, 7, 10],
  MAJPENT = [0, 2, 4, 7, 9];

// ================================================================= the five sets
// ---- 1. Neon Sign: glass tubes, the crackle and buzz of a sign lighting up, relays. B minor.
const NS = (() => {
  const prog = [
    [59, 62, 66],
    [55, 59, 62],
    [57, 61, 64],
    [54, 57, 61],
  ]; // Bm G A F#m
  const MEL = scale(71, 3, MINPENT);
  // a tube's hum: a buzzy tone and its octave, flickering, through a soft filter
  const hum = (m, o = {}) => {
    tone({
      f: nf(m),
      type: 'sawtooth',
      cut: 1400,
      vol: 0.016,
      a: 0.01,
      dur: 0.6,
      flick: 0.5,
      settle: true,
      verb: 0.25,
      ...o,
    });
    tone({
      f: nf(m + 12),
      type: 'square',
      cut: 2200,
      vol: 0.006,
      a: 0.01,
      dur: (o.dur || 0.6) * 0.8,
      flick: 0.6,
      settle: true,
      verb: 0.2,
      ...o,
      vol: (o.vol || 0.016) * 0.4,
    });
  };
  // a sign lighting up: a few crackles, then the hum steadies into a chord
  const ignite = (notes, at = 0, dur = 0.8, vol = 0.014) => {
    crackle({ at, dur: 0.09, n: 5, vol: 0.05, f: 3500 });
    notes.forEach((m) => hum(m, { at: at + 0.07, dur, vol }));
  };
  return {
    name: 'Neon Sign',
    vibe: 'Glass tubes tink, signs crackle and hum to life, relays clunk.',
    gain: 1,
    verb: [1.6, 3],
    bpm: 80,
    sfx: {
      tap: () => tink(nf(95), { vol: 0.022 }),
      step: (n) => {
        hum([71, 74, 78][Math.min(n, 3) - 1] || 71, { dur: 0.16, vol: 0.045 });
        crackle({ dur: 0.04, n: 2, vol: 0.03 });
      },
      pair: () => {
        tink(nf(90));
        tink(nf(97), { at: 0.07 });
      },
      group: (n, total) => {
        ignite(
          prog[n % 4].map((m) => m + 12),
          0,
          0.9,
          0.013,
        );
        tink(nf(climb(MEL, n, total) + 12), { at: 0.12, vol: 0.03 });
      },
      // the sign sputters and dies, and a breaker trips
      bad: () => {
        tone({
          f: nf(52),
          type: 'sawtooth',
          cut: 900,
          dur: 0.45,
          vol: 0.04,
          flick: 0.95,
          glide: nf(45),
          glideTime: 0.4,
          verb: 0.1,
        });
        crackle({ dur: 0.3, n: 8, vol: 0.05, f: 2500 });
        thump({ at: 0.38, vol: 0.05, f: 90, glide: 40 });
      },
      // a relay closing: a solid clunk and a steady hum
      pin: () => {
        thump({ vol: 0.06 });
        hiss({ dur: 0.012, vol: 0.05, f: 5000 });
        hum(83, { at: 0.03, dur: 0.35, vol: 0.016, flick: 0.1 });
      },
      unpin: () => {
        hiss({ dur: 0.01, vol: 0.04, f: 4500 });
        thump({ vol: 0.03, f: 160, glide: 80 });
      },
      hint: () => {
        hum(90, { dur: 0.9, a: 0.3, vol: 0.012 });
        tink(nf(102), { at: 0.2, vol: 0.016 });
      },
      // a tube popping: a glassy "pink" and a zap
      pop: (quiet) => {
        tink(nf(100), { vol: quiet ? 0.016 : 0.028 });
        hiss({ dur: 0.05, vol: quiet ? 0.012 : 0.022, type: 'highpass', f: 3500 });
        tone({ f: 1800, glide: 500, glideTime: 0.05, dur: 0.06, vol: quiet ? 0.012 : 0.022, verb: 0.1 });
      },
      note: (k) => tink(nf(MEL[(k * 2) % MEL.length] + 12), { vol: 0.028 }),
      fanfare: () =>
        [0, 2, 1, 0].forEach((c, i) =>
          ignite(
            prog[c].map((m) => m + 12),
            i * 0.32,
            0.6,
            0.012,
          ),
        ),
      finale: () => {
        ignite([47, 59, 66, 71, 74, 78], 0, 3, 0.011);
        [95, 98, 102, 107].forEach((m, i) => tink(nf(m), { at: 0.5 + i * 0.18, vol: 0.02 }));
      },
    },
    // music: an electrical night: the low hum of a city's signs, chords buzzing on and off
    beat(i, t, bar) {
      const s = i % 16,
        ch = prog[bar % 4],
        b = 'music';
      if (s === 0) {
        tone({
          when: t,
          bus: b,
          f: nf(ch[0] - 24),
          type: 'sawtooth',
          cut: 220,
          dur: 3.1,
          vol: 0.05,
          a: 0.3,
          flick: 0.12,
          verb: 0,
        });
        ch.forEach((m) =>
          tone({
            when: t + 0.05,
            bus: b,
            f: nf(m),
            type: 'sawtooth',
            cut: 1200,
            dur: 2.6,
            vol: 0.008,
            a: 0.6,
            flick: 0.35,
            verb: 0.35,
          }),
        );
      }
      if (s === 8 && bar % 2) crackle({ when: t, bus: b, dur: 0.1, n: 3, vol: 0.02 });
      if ([3, 10].includes(s) && bar % 2 === 0)
        tink(nf(MEL[(bar * 3 + s) % 10] + 12), { when: t, bus: b, vol: 0.01, verb: 0.5 });
      if (s % 4 === 0) thump({ when: t, bus: b, vol: s === 0 ? 0.06 : 0.03, verb: 0 });
    },
  };
})();

// ---- 2. Night Pool: droplets, bubbles, ice in a glass. A minor pentatonic, which drops love.
const NP = (() => {
  const prog = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
    [52, 55, 59],
  ]; // Am F G Em
  const MEL = scale(69, 3, MINPENT);
  const clink = (f, o = {}) => {
    tone({ f, dur: 0.25, vol: 0.026, a: 0.001, verb: 0.3, ...o });
    tone({ f: f * 1.48, dur: 0.18, vol: 0.016, a: 0.001, verb: 0.3, ...o });
    tone({ f: f * 2.9, dur: 0.06, vol: 0.01, a: 0.001, verb: 0.2, ...o });
  };
  const splash = (at = 0, vol = 0.03, dur = 0.4) =>
    hiss({ at, dur, vol, type: 'lowpass', f: 3500, sweep: 600, a: 0.02, verb: 0.4 });
  return {
    name: 'Night Pool',
    vibe: 'Tuned droplets, bubbles, ice clinking in a glass, a pool at midnight.',
    gain: 1,
    verb: [2.2, 2.5],
    bpm: 72,
    sfx: {
      tap: () => drop(nf(84), { vol: 0.035 }),
      step: (n) => drop(nf([76, 81, 84][Math.min(n, 3) - 1] || 76)),
      pair: () => {
        drop(nf(79));
        drop(nf(86), { at: 0.06 });
      },
      group: (n, total) => {
        prog[n % 4].forEach((m, i) => drop(nf(m + 12), { at: i * 0.045, vol: 0.04 }));
        drop(nf(climb(MEL, n, total)), { at: 0.15, vol: 0.06 });
        splash(0.12, 0.018, 0.35);
      },
      // two glugs, sinking
      bad: () =>
        [0, 0.15].forEach((at, k) =>
          tone({
            f: 330 - k * 70,
            glide: 110 - k * 20,
            glideTime: 0.16,
            at,
            dur: 0.18,
            vol: 0.07,
            a: 0.004,
            vib: 60,
            vibRate: 22,
            verb: 0.2,
          }),
        ),
      pin: () => {
        clink(2300);
        clink(2900, { at: 0.07, vol: 0.02 });
      },
      unpin: () => clink(1900, { vol: 0.018 }),
      // a stream of bubbles rising
      hint: () =>
        [0, 1, 2, 3, 4].forEach((k) => drop(nf(81 + k * 3), { at: k * 0.05, vol: 0.025, dur: 0.08 })),
      // a bubble popping
      pop: (quiet) => {
        hiss({ dur: 0.012, vol: quiet ? 0.03 : 0.06, f: 3000 });
        tone({
          f: 600,
          glide: 2000,
          glideTime: 0.03,
          dur: 0.05,
          vol: quiet ? 0.03 : 0.05,
          a: 0.001,
          verb: 0.2,
        });
      },
      note: (k) => drop(nf(MEL[(k * 2) % MEL.length] + 12), { vol: 0.045 }),
      fanfare: () => {
        for (let k = 0; k < 14; k++) drop(nf(MEL[k % MEL.length] + 12), { at: k * 0.065, vol: 0.035 });
        splash(0.9, 0.03, 0.6);
      },
      finale: () => {
        splash(0, 0.05, 1.2);
        [57, 64, 69, 72, 76].forEach((m) =>
          tone({ f: nf(m), dur: 3, a: 0.4, vol: 0.016, cut: 1500, am: 0.3, amRate: 3, verb: 0.5 }),
        );
        [93, 88, 96].forEach((m, i) => drop(nf(m), { at: 0.6 + i * 0.35, vol: 0.035 }));
      },
    },
    // music: slow drips in the dark, over a muffled underwater chord that sways
    beat(i, t, bar) {
      const s = i % 16,
        ch = prog[bar % 4],
        b = 'music';
      if (s === 0) {
        ch.forEach((m) =>
          tone({
            when: t,
            bus: b,
            f: nf(m),
            dur: 3.4,
            a: 0.8,
            vol: 0.016,
            cut: 900,
            am: 0.4,
            amRate: 0.7,
            verb: 0.4,
          }),
        );
        tone({ when: t, bus: b, f: nf(ch[0] - 24), dur: 3.2, a: 0.3, vol: 0.05, cut: 300, verb: 0 });
      }
      const pat = [
        [0, 6, 11],
        [3, 9, 14],
        [0, 5, 10, 13],
        [2, 7, 12],
      ][bar % 4];
      const k = pat.indexOf(s);
      if (k >= 0) drop(nf(MEL[(bar * 2 + k * 3) % 10] + 12), { when: t, bus: b, vol: 0.022, verb: 0.5 });
    },
  };
})();

// ---- 3. Synth Choir: robot voices singing vowels. F major.
const SC = (() => {
  const prog = [
    [53, 57, 60],
    [50, 53, 57],
    [46, 50, 53],
    [48, 52, 55],
  ]; // F Dm Bb C
  const MEL = scale(65, 3, MAJPENT);
  const choir = (notes, vowel, at = 0, dur = 0.6, vol = 0.02, to = null) =>
    notes.forEach((m, i) => vox({ f: nf(m), vowel, to, at: at + i * 0.012, dur, vol, a: 0.06, vib: 7 }));
  return {
    name: 'Synth Choir',
    vibe: 'A robot choir: every move is sung, "da-da-da", "aah", "uh-oh".',
    gain: 1.4,
    verb: [2.4, 2.6],
    bpm: 84,
    sfx: {
      tap: () => vox({ f: nf(77), vowel: 'u', dur: 0.09, vol: 0.07, a: 0.005, vib: 0, verb: 0.15 }),
      step: (n) =>
        vox({
          f: nf([72, 76, 79][Math.min(n, 3) - 1] || 72),
          vowel: 'i',
          to: 'a',
          dur: 0.14,
          vol: 0.08,
          a: 0.006,
          vib: 0,
          verb: 0.2,
        }),
      pair: () => {
        vox({ f: nf(76), vowel: 'u', dur: 0.16, vol: 0.07, a: 0.01, vib: 0 });
        vox({ f: nf(81), vowel: 'i', at: 0.1, dur: 0.2, vol: 0.07, a: 0.01, vib: 0 });
      },
      group: (n, total) => {
        choir(
          prog[n % 4].map((m) => m + 12),
          'a',
          0,
          0.6,
          0.02,
        );
        vox({ f: nf(climb(MEL, n, total)), vowel: 'o', to: 'a', at: 0.06, dur: 0.55, vol: 0.045, a: 0.03 });
      },
      // "uh-oh"
      bad: () => {
        vox({ f: nf(67), vowel: 'a', to: 'u', dur: 0.18, vol: 0.06, a: 0.01, vib: 0 });
        vox({ f: nf(63), vowel: 'o', dur: 0.3, at: 0.17, vol: 0.06, a: 0.02, vib: 0 });
      },
      // "mm!" with a little click
      pin: () => {
        hiss({ dur: 0.01, vol: 0.04, f: 3000 });
        vox({ f: nf(81), vowel: 'm', dur: 0.3, vol: 0.06, a: 0.01, vib: 4 });
        vox({ f: nf(88), vowel: 'm', at: 0.07, dur: 0.3, vol: 0.04, a: 0.01, vib: 4 });
      },
      unpin: () => vox({ f: nf(76), vowel: 'u', dur: 0.2, vol: 0.075, a: 0.01, vib: 0 }),
      // a whispered "haah"
      hint: () => vox({ f: 0, breath: true, vowel: 'a', dur: 0.5, vol: 0.1, a: 0.08 }),
      // a lip pop
      pop: (quiet) => {
        tone({
          f: 420,
          glide: 1100,
          glideTime: 0.03,
          dur: 0.06,
          vol: quiet ? 0.025 : 0.045,
          a: 0.001,
          verb: 0.15,
        });
        hiss({ dur: 0.02, vol: quiet ? 0.015 : 0.03, f: 1500 });
      },
      note: (k) =>
        vox({
          f: nf(MEL[(k * 2) % MEL.length] + 12),
          vowel: 'e',
          to: 'a',
          dur: 0.3,
          vol: 0.045,
          a: 0.01,
          vib: 3,
        }),
      fanfare: () => {
        choir(
          prog[0].map((m) => m + 12),
          'a',
          0,
          0.28,
          0.02,
        );
        choir(
          prog[0].map((m) => m + 12),
          'a',
          0.3,
          0.28,
          0.02,
        );
        choir(
          prog[3].map((m) => m + 12),
          'a',
          0.6,
          0.9,
          0.022,
          'o',
        );
      },
      finale: () => {
        choir([41, 53, 57, 60, 65, 69], 'a', 0, 3.2, 0.018, 'o');
        vox({ f: nf(84), vowel: 'u', to: 'a', at: 0.4, dur: 2.4, vol: 0.03, a: 0.3 });
      },
    },
    // music: slow "ooh" chords, a sung "dm" bass, and mouth-made beat
    beat(i, t, bar) {
      const s = i % 16,
        ch = prog[bar % 4],
        b = 'music';
      if (s === 0)
        ch.forEach((m) =>
          vox({
            when: t,
            bus: b,
            f: nf(m + 12),
            vowel: 'u',
            to: 'o',
            dur: 2.8,
            vol: 0.012,
            a: 0.5,
            vib: 6,
            verb: 0.45,
          }),
        );
      if ([0, 6, 8, 14].includes(s))
        vox({
          when: t,
          bus: b,
          f: nf(ch[0] - 12),
          vowel: 'm',
          dur: 0.25,
          vol: 0.05,
          a: 0.01,
          vib: 0,
          verb: 0,
        });
      if (s === 0 || s === 8) thump({ when: t, bus: b, vol: 0.07, verb: 0 });
      if (s === 4 || s === 12)
        vox({ when: t, bus: b, f: 0, breath: true, vowel: 'e', dur: 0.12, vol: 0.05, a: 0.004, verb: 0.2 });
      if (s % 4 === 2) hiss({ when: t, bus: b, dur: 0.03, vol: 0.01, type: 'highpass', f: 7000, verb: 0 });
    },
  };
})();

// ---- 4. Home Computer: keyboard thocks, floppy-drive chatter, PC-speaker beeps, CRT hum. C minor.
const HC = (() => {
  const prog = [
    [48, 51, 55],
    [44, 48, 51],
    [46, 50, 53],
    [43, 47, 50],
  ]; // Cm Ab Bb G
  const MEL = scale(72, 3, MINPENT);
  const key = (o = {}) => {
    hiss({ dur: 0.03, vol: 0.06, type: 'lowpass', f: 1800, verb: 0.05, ...o });
    tone({ f: 150, glide: 90, glideTime: 0.03, dur: 0.04, vol: 0.06, a: 0.001, verb: 0, ...o });
    hiss({
      at: (o.at || 0) + 0.045,
      dur: 0.015,
      vol: 0.025,
      type: 'highpass',
      f: 4000,
      verb: 0,
      ...o,
      when: o.when != null ? o.when + 0.045 : null,
    });
  };
  const beep = (m, o = {}) =>
    tone({ f: nf(m), type: 'square', dur: 0.07, vol: 0.018, a: 0.001, cut: 5000, verb: 0.1, ...o });
  // a floppy drive seeking: fast stepper clicks
  const drive = (at = 0, n = 6, vol = 0.04, o = {}) => {
    for (let k = 0; k < n; k++) {
      tone({
        f: 70 + (k % 3) * 15,
        type: 'square',
        at: at + k * 0.022,
        dur: 0.018,
        vol,
        a: 0.001,
        cut: 1500,
        verb: 0,
        ...o,
        when: o.when != null ? o.when + k * 0.022 : null,
      });
      hiss({
        at: at + k * 0.022,
        dur: 0.008,
        vol: vol * 0.6,
        f: 2500,
        verb: 0,
        ...o,
        when: o.when != null ? o.when + k * 0.022 : null,
      });
    }
  };
  return {
    name: 'Home Computer',
    vibe: '1984 on a desk: key thocks, floppy-drive chatter, PC-speaker beeps, a CRT humming.',
    gain: 1,
    verb: [0.9, 3],
    bpm: 96,
    sfx: {
      tap: () => key(),
      step: (n) => {
        key({ vol: 0.04 });
        beep([84, 87, 91][Math.min(n, 3) - 1] || 84, { at: 0.01, dur: 0.05 });
      },
      pair: () => {
        key();
        key({ at: 0.07 });
        beep(91, { at: 0.08 });
      },
      // Enter, the drive saves it, and a two-note "OK"
      group: (n, total) => {
        key({ vol: 0.05 });
        thump({ vol: 0.035, f: 100, glide: 60 });
        drive(0.05, 5, 0.03);
        const top = climb(MEL, n, total);
        beep(top - 5, { at: 0.18 });
        beep(top, { at: 0.26, dur: 0.12 });
      },
      // a print head jamming, and a low "bonk"
      bad: () => {
        tone({ f: 220, type: 'sawtooth', dur: 0.12, vol: 0.03, cut: 1600, am: 0.8, amRate: 60, verb: 0.05 });
        beep(43, { at: 0.12, dur: 0.18, vol: 0.04, cut: 900 });
        beep(42, { at: 0.3, dur: 0.22, vol: 0.04, cut: 900 });
      },
      // a disk going in: clack, then thunk
      pin: () => {
        hiss({ dur: 0.02, vol: 0.06, f: 3500 });
        thump({ at: 0.06, vol: 0.06, f: 90, glide: 45 });
        drive(0.1, 3, 0.025);
      },
      unpin: () => {
        hiss({ dur: 0.02, vol: 0.05, f: 3000 });
        tone({ f: 300, glide: 500, glideTime: 0.05, dur: 0.06, vol: 0.03, type: 'triangle', verb: 0.05 });
      },
      // a modem chirp
      hint: () => {
        for (let k = 0; k < 8; k++)
          tone({
            f: k % 2 ? 2200 : 1200,
            type: 'square',
            at: k * 0.025,
            dur: 0.025,
            vol: 0.022,
            a: 0.001,
            cut: 4000,
            verb: 0.1,
          });
        beep(96, { at: 0.22, dur: 0.1 });
      },
      // the snap of a CRT line
      pop: (quiet) => {
        tone({ f: 9000, glide: 2500, glideTime: 0.04, dur: 0.05, vol: quiet ? 0.008 : 0.016, verb: 0.05 });
        key({ vol: quiet ? 0.03 : 0.05 });
      },
      note: (k) => beep(MEL[(k * 2) % MEL.length] + 12, { dur: 0.1, vol: 0.035 }),
      fanfare: () => {
        drive(0, 10, 0.03);
        for (let k = 0; k < 12; k++)
          beep([...prog[0], ...prog[3]][k % 6] + 24 + (k >= 6 ? 12 : 0), { at: 0.3 + k * 0.055, dur: 0.05 });
      },
      // the CRT degauss "bwomm", and a boot chord
      finale: () => {
        tone({ f: 60, dur: 1.4, vol: 0.07, a: 0.01, am: 0.6, amRate: 9, verb: 0.2 });
        tone({
          f: 120,
          type: 'sawtooth',
          cut: 500,
          dur: 1.2,
          vol: 0.03,
          a: 0.01,
          am: 0.6,
          amRate: 9,
          verb: 0.2,
        });
        hiss({ dur: 0.6, vol: 0.02, type: 'highpass', f: 6000, verb: 0.1 });
        [60, 67, 72, 79].forEach((m, i) =>
          beep(m + 12, { at: 0.9 + i * 0.09, dur: 0.6, vol: 0.016, a: 0.005 }),
        );
      },
    },
    // music: a fan's hum, the drive's rhythm, a PC-speaker bassline and little bleeps
    beat(i, t, bar) {
      const s = i % 16,
        ch = prog[bar % 4],
        b = 'music';
      if (s === 0) hiss({ when: t, bus: b, dur: 2.6, vol: 0.006, type: 'lowpass', f: 500, a: 0.5, verb: 0 });
      const bass = [0, -1, 12, -1, 0, 0, 12, -1, 0, -1, 12, -1, 7, -1, 12, 10][s];
      if (bass >= 0)
        tone({
          when: t,
          bus: b,
          f: nf(ch[0] - 12 + bass),
          type: 'square',
          dur: 0.09,
          vol: 0.016,
          a: 0.002,
          cut: 1200,
          verb: 0,
        });
      if ([0, 3, 6, 10, 12].includes(s)) {
        tone({ when: t, bus: b, f: 75, type: 'square', dur: 0.016, vol: 0.02, a: 0.001, cut: 1500, verb: 0 });
        hiss({ when: t, bus: b, dur: 0.008, vol: 0.016, f: 2500, verb: 0 });
      }
      if ((s === 14 && bar % 2) || (s === 7 && bar % 4 === 2))
        tone({
          when: t,
          bus: b,
          f: nf(MEL[(bar + s) % 10] + 12),
          type: 'square',
          dur: 0.06,
          vol: 0.01,
          cut: 5000,
          verb: 0.2,
        });
    },
  };
})();

// ---- 5. Night Radio: a shortwave dial, static, stations locking in, Morse, radio-check beeps. D minor.
const NR = (() => {
  const prog = [
    [50, 53, 57],
    [46, 50, 53],
    [48, 52, 55],
    [45, 49, 52],
  ]; // Dm Bb C A
  const MEL = scale(74, 3, MINPENT);
  const RADIO = { hp: 300, cut: 3000 }; // what an AM speaker lets through
  const morse = (pattern, m, at = 0, o = {}) => {
    let x = at;
    for (const c of pattern) {
      const len = c === '-' ? 0.15 : 0.05;
      tone({
        f: nf(m),
        at: x,
        dur: len,
        vol: 0.03,
        a: 0.004,
        verb: 0.15,
        ...o,
        when: o.when != null ? o.when + (x - at) : null,
      });
      x += len + 0.05;
    }
  };
  // tuning toward a station: static, and a whistle gliding onto the note
  const tune = (m, at = 0, dur = 0.18) => {
    hiss({ at, dur, vol: 0.025, f: 1800, q: 0.6, flick: 0.5, verb: 0.05 });
    tone({ f: nf(m) * 1.35, glide: nf(m), glideTime: dur * 0.8, at, dur, vol: 0.02, verb: 0.1 });
  };
  return {
    name: 'Night Radio',
    vibe: 'A shortwave dial after midnight: static, whistles, stations locking in, Morse.',
    gain: 1,
    verb: [1.8, 3],
    bpm: 72,
    sfx: {
      // the dial's notch
      tap: () => {
        hiss({ dur: 0.008, vol: 0.05, f: 4000 });
        tone({ f: 1400, dur: 0.03, vol: 0.012, a: 0.001, verb: 0.05 });
      },
      step: (n) => tune([74, 77, 81][Math.min(n, 3) - 1] || 74),
      pair: () => morse('..', 81),
      // static clears and a station comes in: a chord through an AM speaker
      group: (n, total) => {
        hiss({ dur: 0.25, vol: 0.035, f: 2000, sweep: 800, flick: 0.4, verb: 0.05 });
        prog[n % 4].forEach((m) =>
          tone({
            f: nf(m + 12),
            type: 'triangle',
            at: 0.08,
            dur: 0.75,
            vol: 0.022,
            a: 0.06,
            am: 0.2,
            amRate: 5,
            ...RADIO,
            verb: 0.25,
          }),
        );
        tone({ f: nf(climb(MEL, n, total)), at: 0.12, dur: 0.6, vol: 0.03, a: 0.02, ...RADIO, verb: 0.25 });
      },
      // a burst of static that cuts off (the squelch), and a sour low tone
      bad: () => {
        hiss({ dur: 0.28, vol: 0.06, f: 1500, q: 0.4, flick: 0.6, verb: 0.05 });
        tone({ f: nf(49), type: 'sawtooth', dur: 0.32, vol: 0.03, cut: 800, verb: 0.05 });
        tone({ f: nf(50), type: 'sawtooth', dur: 0.32, vol: 0.03, cut: 800, verb: 0.05 });
      },
      // the radio-check beep: two quick rising tones, "over"
      pin: () => {
        hiss({ dur: 0.06, vol: 0.025, f: 2500, flick: 0.5 });
        tone({ f: 1100, at: 0.07, dur: 0.07, vol: 0.03, a: 0.002, verb: 0.1 });
        tone({ f: 1650, at: 0.15, dur: 0.09, vol: 0.03, a: 0.002, verb: 0.1 });
      },
      unpin: () => tone({ f: 900, dur: 0.08, vol: 0.025, a: 0.002, verb: 0.1 }),
      hint: () => morse('-.', 86),
      // a pop of static
      pop: (quiet) => {
        hiss({ dur: 0.05, vol: quiet ? 0.03 : 0.06, f: 2200, q: 0.5 });
        hiss({ dur: 0.01, vol: quiet ? 0.03 : 0.05, f: 5000 });
      },
      note: (k) =>
        tone({ f: nf(MEL[(k * 2) % MEL.length]), dur: 0.35, vol: 0.03, a: 0.01, ...RADIO, verb: 0.25 }),
      // sweeping across the band, landing on the station
      fanfare: () => {
        hiss({ dur: 1.0, vol: 0.03, f: 600, sweep: 3500, flick: 0.4, verb: 0.05 });
        tone({ f: 300, glide: 2400, glideTime: 0.9, dur: 0.9, vol: 0.015, verb: 0.1 });
        prog[0].forEach((m) =>
          tone({
            f: nf(m + 12),
            type: 'triangle',
            at: 0.9,
            dur: 1.1,
            vol: 0.022,
            a: 0.05,
            am: 0.2,
            amRate: 5,
            ...RADIO,
            verb: 0.3,
          }),
        );
      },
      finale: () => {
        [38, 50, 57, 62, 65, 69].forEach((m) =>
          tone({
            f: nf(m),
            type: 'triangle',
            dur: 3,
            vol: 0.016,
            a: 0.2,
            am: 0.15,
            amRate: 4,
            hp: 120,
            cut: 3500,
            verb: 0.35,
          }),
        );
        morse('..-', 86, 0.6, { vol: 0.02 });
      },
    },
    // music: a faint station far away, fading in and out through static
    beat(i, t, bar) {
      const s = i % 16,
        ch = prog[bar % 4],
        b = 'music';
      if (s === 0) {
        hiss({ when: t, bus: b, dur: 3.4, vol: 0.006, f: 1800, q: 0.5, a: 0.4, flick: 0.3, verb: 0 });
        ch.forEach((m) =>
          tone({
            when: t,
            bus: b,
            f: nf(m + 12),
            type: 'triangle',
            dur: 3.2,
            vol: 0.014,
            a: 0.6,
            am: 0.5,
            amRate: 0.35,
            hp: 300,
            cut: 2600,
            verb: 0.3,
          }),
        );
        tone({
          when: t,
          bus: b,
          f: nf(ch[0]),
          dur: 3,
          vol: 0.02,
          a: 0.4,
          am: 0.5,
          amRate: 0.35,
          hp: 200,
          cut: 1500,
          verb: 0,
        });
      }
      const mel = [
        [4, 0],
        [10, 2],
        [2, 4],
        [8, 1],
      ][bar % 4];
      if (s === mel[0])
        tone({
          when: t,
          bus: b,
          f: nf(MEL[mel[1] + 2]),
          dur: 1.0,
          vol: 0.016,
          a: 0.05,
          am: 0.4,
          amRate: 0.5,
          hp: 300,
          cut: 2600,
          verb: 0.4,
        });
      if (s === 12 && bar % 4 === 3) morse('.-.', 86, 0, { when: t, bus: b, vol: 0.008 });
    },
  };
})();

const PACKS = [NS, NP, SC, HC, NR];
let current = 0;
const pack = () => PACKS[current];

// ================================================================= music loop
// Schedules 16th-note steps a little ahead of time, so timing stays tight even if the page is busy.
let musicTimer = null,
  nextT = 0,
  step16 = 0;
function startMusic() {
  stopMusic();
  const ac = audio();
  nextT = ac.currentTime + 0.1;
  step16 = 0;
  musicTimer = setInterval(() => {
    const p = pack(),
      dt = 60 / p.bpm / 4;
    while (nextT < ac.currentTime + 0.15) {
      p.beat(step16, nextT, Math.floor(step16 / 16));
      nextT += dt;
      step16++;
    }
  }, 25);
}
function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

// ================================================================= the panel
const KEY = 'parcels-soundlab'; // remembers the chosen set, music and volumes in this browser
function loadState() {
  try {
    return {
      set: 0,
      music: false,
      sfx: 1,
      mus: 0.8,
      open: true,
      ...JSON.parse(localStorage.getItem(KEY) || '{}'),
    };
  } catch (e) {
    return { set: 0, music: false, sfx: 1, mus: 0.8, open: true };
  }
}
const state = loadState();
const saveState = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
};

// Point the game's sound effects at the chosen set. The game calls sfx.group(n) without the total,
// so it's filled in from the board (GROUPS). Sound off in Settings still means silence.
function patch() {
  for (const k of Object.keys(PACKS[0].sfx))
    gameSfx[k] = (...args) => {
      if (!prefs.sound) return;
      audio();
      if (k === 'group') pack().sfx.group(args[0], GROUPS || 4);
      else pack().sfx[k](...args);
    };
  gameSfx.brk = (...a) => gameSfx.pop(...a);
}

function choose(k) {
  current = k;
  state.set = k;
  saveState();
  panel.querySelectorAll('.sl-set').forEach((b, i) => b.classList.toggle('on', i === k));
  panel.querySelector('.sl-vibe').textContent = PACKS[k].vibe;
  if (AC) {
    MASTER.gain.value = 1.3 * pack().gain;
    setReverb(pack().verb);
    if (state.music) startMusic();
  }
}

const PAD = [
  ['Tap', () => gameSfx.tap()],
  ['Swipe', () => [1, 2, 3].forEach((n) => setTimeout(() => gameSfx.step(n), (n - 1) * 110))],
  ['Pair', () => gameSfx.pair()],
  ['Parcel', () => gameSfx.group(1)],
  ['Last parcel', () => gameSfx.group((GROUPS || 4) - 1)],
  ['Mistake', () => gameSfx.bad()],
  ['Lock', () => gameSfx.pin()],
  ['Hint', () => gameSfx.hint()],
  ['Pop', () => gameSfx.pop()],
  [
    'Win',
    () => {
      [0, 1, 2, 3].forEach((k) => setTimeout(() => gameSfx.note(k), k * 230));
      setTimeout(() => gameSfx.fanfare(), 4 * 230 + 150);
      setTimeout(() => gameSfx.finale(), 4 * 230 + 150 + 2350);
    },
  ],
];

const panel = document.createElement('div');
panel.id = 'soundlab';
panel.innerHTML = `
  <button class="sl-toggle" aria-expanded="true">🎛 Sound lab</button>
  <div class="sl-body">
    <div class="sl-row">
      <div class="sl-sets">${PACKS.map((p, k) => `<button class="sl-set" data-k="${k}"><b>${k + 1}</b> ${p.name}</button>`).join('')}</div>
      <button class="sl-more" aria-expanded="false" aria-label="More">⋯</button>
    </div>
    <div class="sl-extra">
    <p class="sl-vibe"></p>
    <div class="sl-mix">
      <label><input type="checkbox" class="sl-music" /> Music</label>
      <label>Effects <input type="range" class="sl-sfx" min="0" max="1.5" step="0.05" /></label>
      <label>Music <input type="range" class="sl-mus" min="0" max="1.5" step="0.05" /></label>
    </div>
    <div class="sl-pad">${PAD.map(([l], k) => `<button data-p="${k}">${l}</button>`).join('')}</div>
    <p class="sl-note">Sound must be on in Settings. Dev only: not in the real site.</p>
    </div>
  </div>`;
const style = document.createElement('style');
style.textContent = `
#soundlab { position: fixed; left: 8px; bottom: var(--sl-bottom, 8px); z-index: 60; width: min(420px, calc(100vw - 16px));
  font: 13px 'Space Grotesk', system-ui, sans-serif; color: #efedff; }
#soundlab button { font: inherit; color: inherit; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 999px; padding: 5px 10px; cursor: pointer; }
#soundlab .sl-toggle { background: rgba(22,18,46,0.92); box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
#soundlab .sl-body { margin-bottom: 6px; padding: 8px; border-radius: 14px; background: rgba(22,18,46,0.96);
  border: 1px solid rgba(154,140,255,0.35); box-shadow: 0 8px 30px rgba(0,0,0,0.5); display: grid; gap: 8px; }
#soundlab:not(.open) .sl-body { display: none; }
#soundlab { display: flex; flex-direction: column-reverse; align-items: flex-start; }
#soundlab .sl-body { align-self: stretch; min-width: 0; grid-template-columns: minmax(0, 1fr); }
#soundlab .sl-row { display: flex; gap: 6px; align-items: flex-start; min-width: 0; }
#soundlab .sl-sets { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; }
#soundlab .sl-set { white-space: nowrap; }
#soundlab .sl-more { flex: none; padding: 5px 9px; }
#soundlab:not(.more) .sl-extra { display: none; }
#soundlab .sl-extra { display: grid; gap: 8px; }
#soundlab .sl-pad { display: flex; flex-wrap: wrap; gap: 5px; }
#soundlab .sl-set b { color: #958fc4; font-size: 11px; }
#soundlab .sl-set.on { border-color: #ff3b6e; box-shadow: 0 0 12px rgba(255,59,110,0.35); }
#soundlab .sl-set.on b { color: #ffd43b; }
#soundlab .sl-vibe, #soundlab .sl-note { margin: 0; color: #958fc4; font-size: 12px; line-height: 1.35; }
#soundlab .sl-mix { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #958fc4; }
#soundlab .sl-mix input[type=range] { width: 80px; vertical-align: middle; accent-color: #9a8cff; }
#soundlab .sl-pad button { font-size: 12px; padding: 4px 9px; }`;
document.head.append(style);
document.body.append(panel);

const $p = (s) => panel.querySelector(s);
const setOpen = (open) => {
  state.open = open;
  saveState();
  panel.classList.toggle('open', open);
  $p('.sl-toggle').setAttribute('aria-expanded', String(open));
};
$p('.sl-toggle').onclick = () => setOpen(!state.open);
$p('.sl-more').onclick = () => {
  const more = !panel.classList.contains('more');
  panel.classList.toggle('more', more);
  $p('.sl-more').setAttribute('aria-expanded', String(more));
};
// sit just above the game's button bar (when it's showing), so the panel doesn't cover it
const place = () => {
  const bar = document.querySelector('#app .controls');
  const r = bar && bar.getBoundingClientRect();
  const above = r && r.height && document.body.dataset.screen === 'game' ? innerHeight - r.top + 6 : 8;
  panel.style.setProperty('--sl-bottom', above + 'px');
};
addEventListener('resize', place);
new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
setTimeout(place, 0);
panel.querySelectorAll('.sl-set').forEach(
  (b) =>
    (b.onclick = () => {
      audio();
      choose(+b.dataset.k);
      gameSfx.group(1); // a taste of it
    }),
);
$p('.sl-music').checked = state.music;
$p('.sl-music').onchange = (e) => {
  state.music = e.target.checked;
  saveState();
  audio();
  state.music ? startMusic() : stopMusic();
};
$p('.sl-sfx').value = VOL.sfx = state.sfx;
$p('.sl-mus').value = VOL.music = state.mus;
$p('.sl-sfx').oninput = (e) => {
  state.sfx = VOL.sfx = +e.target.value;
  saveState();
  if (AC) BUS.sfx.g.gain.value = VOL.sfx;
};
$p('.sl-mus').oninput = (e) => {
  state.mus = VOL.music = +e.target.value;
  saveState();
  if (AC) BUS.music.g.gain.value = VOL.music;
};
panel.querySelectorAll('.sl-pad button').forEach((b) => (b.onclick = () => PAD[+b.dataset.p][1]()));
// keep taps on the panel from reaching the game underneath
panel.addEventListener('pointerdown', (e) => e.stopPropagation());

patch();
choose(Math.min(state.set, PACKS.length - 1));
setOpen(state.open);
// music needs a first touch before browsers allow sound; start it then if it was left on
if (state.music)
  addEventListener(
    'pointerdown',
    () => {
      audio();
      startMusic();
    },
    { once: true },
  );

// for checking levels from the browser console (and automated checks)
window.lab = { peak, choose, startMusic, stopMusic, audio, vox, thump, hiss, tone, PACKS };
