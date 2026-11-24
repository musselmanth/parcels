import { $ } from './core/dom.js';
import { GROUPS } from './core/hex.js';
import { prefs } from './storage.js';

// Sound effects and music, synthesized with the Web Audio API (there are no audio files). Notes are
// MIDI numbers (60 = middle C). Call sites use sfx.<name>(); everything else here builds the sounds.
//
// The sound of the game is a neon sign: glass tubes that tink, tubes that crackle and buzz to life
// and steady into a hummed chord (every parcel lights up like a sign), relays that clunk, a sign
// that sputters out when a parcel breaks the rule. Parcels climb a B minor melody toward the last.
// The music (Settings > Music, off by default) is the low hum of a city's signs at night, chords
// buzzing on and off.
//
// Audio graph, made on first use: voices -> effects or music bus -> master -> compressor -> speakers.
// Each voice can also send some of itself to its bus's reverb.

let AC = null,
  MASTER = null,
  NOISE = null; // two seconds of white noise, for crackles and zaps
const BUS = {}; // effects ('sfx') and 'music': {g: its volume, verb: its reverb input}
const MUSIC_LEVEL = 1.2; // the music bus at full volume (prefs.musicVol = 1)

// The AudioContext, or null when there's nothing to play (sound effects and music both off).
// Browsers only allow audio after a user gesture, so input.js calls this on the first touch.
export function audio() {
  if (!prefs.sound && !prefs.music) return null;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.connect(AC.destination);
      MASTER = AC.createGain();
      MASTER.gain.value = 1.3;
      MASTER.connect(comp);
      // reverb: an impulse response made of decaying noise (1.6 s)
      const len = Math.floor(AC.sampleRate * 1.6),
        ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      for (const name of ['sfx', 'music']) {
        const g = AC.createGain(),
          verb = AC.createGain(),
          conv = AC.createConvolver();
        conv.buffer = ir;
        g.gain.value = name === 'music' ? musicLevel() : 1;
        verb.connect(conv);
        conv.connect(g);
        g.connect(MASTER);
        BUS[name] = { g, verb };
      }
      const n = AC.sampleRate * 2;
      NOISE = AC.createBuffer(1, n, AC.sampleRate);
      const d = NOISE.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      setTimeout(syncMusic, 0); // music left on: start it now that audio is allowed
    }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {
    AC = null;
  }
  return AC;
}
const musicLevel = () => MUSIC_LEVEL * (prefs.musicVol ?? 0.6);

// MIDI note number -> frequency in Hz.
const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Start time: `when` (absolute, used by the music) or `at` seconds from now.
const T0 = (at, when) => (when != null ? when : AC.currentTime + at);

// A volume envelope: up to `vol` in `a` seconds, then down to silence by `dur`.
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
// Send a voice to its bus, and `verb` of it to the bus's reverb.
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
// A level that jumps around at random, like a neon tube flickering. `settle` calms it down over
// the sound's length, as a tube does once it's lit.
function flicker(t, dur, depth, settle) {
  const g = AC.createGain();
  for (let x = 0; x < dur; x += 1 / 40) {
    const d = settle ? depth * Math.max(0, 1 - x / (dur * 0.6)) : depth;
    g.gain.setValueAtTime(1 - d * Math.random(), t + x);
  }
  return g;
}

// One tone. type: wave shape; glide: slide to another frequency over glideTime; cut: low-pass
// filter; flick/settle: flickering level (see flicker); verb: reverb send; bus: 'sfx' or 'music'.
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
  flick = 0,
  settle = false,
  verb = 0.2,
  bus = 'sfx',
}) {
  const t = T0(at, when),
    o = AC.createOscillator(),
    lp = AC.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
  lp.type = 'lowpass';
  lp.frequency.value = cut;
  o.connect(lp);
  let node = lp;
  if (flick) {
    const fl = flicker(t, dur, flick, settle);
    node.connect(fl);
    node = fl;
  }
  const g = env(t, vol, a, dur);
  node.connect(g);
  route(g, bus, verb);
  o.start(t);
  o.stop(t + dur + 0.1);
}
// A burst of filtered noise (clicks, zaps). type: the filter; f: its frequency.
function hiss({
  at = 0,
  when = null,
  dur = 0.1,
  vol = 0.05,
  type = 'bandpass',
  f = 2000,
  verb = 0.1,
  bus = 'sfx',
}) {
  const t = T0(at, when),
    src = AC.createBufferSource(),
    fl = AC.createBiquadFilter();
  src.buffer = NOISE;
  src.loop = true;
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = 0.9;
  src.connect(fl);
  const g = env(t, vol, 0.002, dur);
  fl.connect(g);
  route(g, bus, verb);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}
// Crackle: a few tiny random clicks spread over `dur` (electricity arcing as a tube lights).
function crackle({ at = 0, when = null, dur = 0.15, n = 5, vol = 0.04, f = 3000, bus = 'sfx' }) {
  const t = T0(at, when);
  for (let k = 0; k < n; k++)
    hiss({
      when: t + Math.random() * dur,
      dur: 0.008 + Math.random() * 0.012,
      vol: vol * (0.5 + Math.random() * 0.5),
      f,
      bus,
    });
}
// A glass "tink": a pure tone plus an out-of-tune overtone, very short.
function tink(f, o = {}) {
  tone({ f, dur: 0.5, vol: 0.03, a: 0.001, verb: 0.3, ...o });
  tone({ f: f * 2.76, dur: 0.12, a: 0.001, verb: 0.3, ...o, vol: (o.vol || 0.03) * 0.4 });
}
// A low thump: a relay closing, a breaker tripping, the music's pulse.
const thump = (o = {}) =>
  tone({ f: 120, glide: 55, glideTime: 0.08, dur: 0.14, vol: 0.12, a: 0.002, verb: 0.05, ...o });
// A tube's hum: a buzzy tone and a quieter octave above, flickering until it settles.
function hum(m, o = {}) {
  const vol = o.vol || 0.016,
    dur = o.dur || 0.6;
  tone({
    f: nf(m),
    type: 'sawtooth',
    cut: 1400,
    a: 0.01,
    dur,
    flick: 0.5,
    settle: true,
    verb: 0.25,
    ...o,
    vol,
  });
  tone({
    f: nf(m + 12),
    type: 'square',
    cut: 2200,
    a: 0.01,
    flick: 0.6,
    settle: true,
    verb: 0.2,
    ...o,
    dur: dur * 0.8,
    vol: vol * 0.4,
  });
}
// A sign lighting up: a few crackles, then the hum steadies into a chord.
function ignite(notes, at = 0, dur = 0.8, vol = 0.014) {
  crackle({ at, dur: 0.09, n: 5, vol: 0.05, f: 3500 });
  notes.forEach((m) => hum(m, { at: at + 0.07, dur, vol }));
}

// The chords parcels walk through (Bm G A F#m), and the B minor pentatonic melody they climb:
// every board climbs to the same peak on its last parcel, one note per parcel.
const PROG = [
  [59, 62, 66],
  [55, 59, 62],
  [57, 61, 64],
  [54, 57, 61],
];
const MEL = [];
for (let o = 0; o < 3; o++) for (const s of [0, 3, 5, 7, 10]) MEL.push(71 + 12 * o + s);
const climb = (n) => MEL[Math.min(MEL.length - 1, Math.max(0, MEL.length - GROUPS) + n)];
const up = (ch) => ch.map((m) => m + 12);

// The sound effects. Each plays immediately (nothing with Settings > Sound effects off); `at`
// offsets inside are seconds from now.
const play =
  (fn) =>
  (...args) => {
    if (prefs.sound && audio()) fn(...args);
  };
export const sfx = {
  // tapping a tile: a glass tube tinked with a fingernail
  tap: play(() => tink(nf(95), { vol: 0.022 })),
  // a swipe reaching its 1st, 2nd and 3rd tile: a tube warming up a little higher each time
  step: play((n) => {
    hum([71, 74, 78][Math.min(n, 3) - 1] || 71, { dur: 0.16, vol: 0.045 });
    crackle({ dur: 0.04, n: 2, vol: 0.03 });
  }),
  pair: play(() => {
    tink(nf(90));
    tink(nf(97), { at: 0.07 });
  }),
  // parcel n made: it lights up like a sign, on the next chord, with a tink climbing the melody
  group: play((n) => {
    ignite(up(PROG[n % 4]), 0, 0.9, 0.013);
    tink(nf(climb(n) + 12), { at: 0.12, vol: 0.03 });
  }),
  // a parcel that breaks the rule: the sign sputters and dies, and a breaker trips
  bad: play(() => {
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
  }),
  // locking a parcel: a relay closing with a solid clunk, and a steady hum
  pin: play(() => {
    thump({ vol: 0.06 });
    hiss({ dur: 0.012, vol: 0.05, f: 5000 });
    hum(83, { at: 0.03, dur: 0.35, vol: 0.016, flick: 0.1 });
  }),
  unpin: play(() => {
    hiss({ dur: 0.01, vol: 0.04, f: 4500 });
    thump({ vol: 0.03, f: 160, glide: 80 });
  }),
  // a hint: a sign humming faintly in the distance
  hint: play(() => {
    hum(90, { dur: 0.9, a: 0.3, vol: 0.012 });
    tink(nf(102), { at: 0.2, vol: 0.016 });
  }),
  brk: (quiet) => sfx.pop(quiet),
  // a board opening: its symbols flicker on (lightUp in render.js gives each one's delay in ms,
  // plus .fin and .on). A crackle and a short tube buzz with each, at most 24 of them so big boards
  // don't turn to noise; crackles with the whole board's last flicker (from .fin); then the ding
  // and the hum of the chord at the exact moment it all comes on at full power (.on).
  signOn: play((delays) => {
    const ds = [...delays].sort((a, b) => a - b),
      every = Math.max(1, ds.length / 24),
      notes = [71, 74, 78, 83, 86, 90]; // B minor, across two octaves
    for (let k = 0; k * every < ds.length; k++) {
      const at = ds[Math.floor(k * every)] / 1000;
      crackle({ at, dur: 0.03, n: 2, vol: 0.022, f: 3500 });
      hum(notes[(k * 5) % notes.length], { at: at + 0.01, dur: 0.14, vol: 0.007, flick: 0.7 });
    }
    // the last flicker: a crackle on each dip (fullOn's keyframes, as fractions of its 0.42 s)
    const fin = (delays.fin ?? ds[ds.length - 1] + 680) / 1000,
      on = (delays.on ?? ds[ds.length - 1] + 1100) / 1000;
    [0, 0.3, 0.6].forEach((f) => crackle({ at: fin + f * (on - fin), dur: 0.04, n: 3, vol: 0.026, f: 3200 }));
    // full power: the ding, right on the moment
    tink(nf(95), { at: on, vol: 0.02 });
    PROG[0].forEach((m) => hum(m + 12, { at: on, dur: 1, a: 0.02, vol: 0.007, flick: 0.05 }));
  }),
  // popping a parcel: a tube going "pink" with a little zap (quieter for Start over's many pops)
  pop: play((quiet) => {
    tink(nf(100), { vol: quiet ? 0.016 : 0.028 });
    hiss({ dur: 0.05, vol: quiet ? 0.012 : 0.022, type: 'highpass', f: 3500 });
    tone({ f: 1800, glide: 500, glideTime: 0.05, dur: 0.06, vol: quiet ? 0.012 : 0.022, verb: 0.1 });
  }),
  // the win: each parcel hops with a tink (note), the board spins as signs light in turn
  // (fanfare), and the whole sign comes on (finale)
  note: play((k) => tink(nf(MEL[(k * 2) % MEL.length] + 12), { vol: 0.028 })),
  fanfare: play(() => [0, 2, 1, 0].forEach((c, i) => ignite(up(PROG[c]), i * 0.32, 0.6, 0.012))),
  finale: play(() => {
    ignite([47, 59, 66, 71, 74, 78], 0, 3, 0.011);
    [95, 98, 102, 107].forEach((m, i) => tink(nf(m), { at: 0.5 + i * 0.18, vol: 0.02 }));
  }),
};

// ---- music: the hum of a city's signs at night, 80 bpm, a chord per bar (Bm G A F#m)
// Each 16th-note step is scheduled a little ahead of time, so the timing stays tight even when
// the page is busy.
const STEP = 60 / 80 / 4; // seconds per 16th note
function beat(i, t) {
  const s = i % 16,
    bar = Math.floor(i / 16),
    ch = PROG[bar % 4],
    b = 'music';
  if (s === 0) {
    // a deep buzzing bass under each bar, and the chord flickering on above it
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
}
let musicTimer = null,
  nextT = 0,
  step = 0;
function startMusic() {
  if (musicTimer || !AC) return;
  nextT = AC.currentTime + 0.1;
  step = 0;
  musicTimer = setInterval(() => {
    while (nextT < AC.currentTime + 0.15) {
      beat(step++, nextT);
      nextT += STEP;
    }
  }, 25);
}
function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
// Play or stop the music to match Settings, at its volume. Safe to call any time: before the first
// touch there's no audio yet, and audio() calls this again once there is.
export function syncMusic() {
  if (prefs.music && !document.hidden && audio()) {
    BUS.music.g.gain.setTargetAtTime(musicLevel(), AC.currentTime, 0.05);
    startMusic();
  } else stopMusic();
}
// No music in the background (another tab, the app minimized); it picks up again on return.
document.addEventListener('visibilitychange', syncMusic);
// Browsers allow audio only after the player touches the page, so with Music on it starts on the
// first tap or key press anywhere (the board's first touch unlocks the sound effects: input.js).
for (const ev of ['pointerdown', 'keydown'])
  addEventListener(ev, () => prefs.music && audio(), { once: true, capture: true });

// Show the sound settings on their controls.
export function paintSound() {
  const b = $('#bSound');
  b.classList.toggle('on', prefs.sound);
  b.setAttribute('aria-checked', String(prefs.sound));
  const m = $('#bMusic');
  m.classList.toggle('on', prefs.music);
  m.setAttribute('aria-checked', String(prefs.music));
  $('#musicVolRow').hidden = !prefs.music;
  paintMusicVol();
}
// The music slider's knob and lit-up part.
export function paintMusicVol() {
  const v = $('#musicVol');
  v.value = prefs.musicVol;
  v.style.setProperty('--v', prefs.musicVol * 100 + '%');
}
