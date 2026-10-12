/**
 * audio.js — вся звуковая часть: синтезированный зацикленный саундтрек
 * «Смена до двадцати двух» и набор коротких эффектов.
 *
 * Ни одного стороннего сэмпла: музыка и эффекты считаются кодом через
 * WebAudio (осцилляторы + шумовые буферы). Файл полностью «мягкий»: если
 * WebAudio недоступен, игра продолжает работать без звука.
 */

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** Частота ноты в 4-й октаве (например, noteHz('A') = 440). */
function noteHz(name, octave = 4) {
  const m = /^([A-G]#?)(-?\d)$/.exec(`${name}${octave}`);
  if (!m) return 440;
  const semi = NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

/** Простая мелодия в ля-миноре: 16 тактов, 130 BPM, закольцована. */
const BPM = 130;
const STEP = 60 / BPM / 4; // шестнадцатая
const BASS_PATTERN = [
  'A1', null, null, 'A1', null, null, 'E1', null, 'F1', null, null, 'F1', null, null, 'C2', null,
  'A1', null, null, 'A1', null, null, 'G1', null, 'F1', null, null, 'F1', null, 'E1', null, null,
];
const LEAD_PATTERN = [
  'A4', null, 'C5', 'E5', null, 'D5', 'C5', null, 'F4', null, 'A4', 'C5', null, 'A4', 'G4', null,
  'A4', null, 'C5', 'B4', null, 'A4', 'G4', null, 'F4', null, 'G4', 'A4', null, 'E4', 'D4', null,
];
const PAD_CHORDS = [
  ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4'],
  ['A3', 'C4', 'E4'], ['G3', 'B3', 'D4'], ['F3', 'A3', 'C4'], ['E3', 'G3', 'B3'],
];

export class AudioEngine {
  constructor(opts = {}) {
    this.enabledSfx = opts.sfx !== false;
    this.enabledMusic = opts.music !== false;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.playing = false;
    this.supported = typeof window !== 'undefined'
      && (!!window.AudioContext || !!window.webkitAudioContext);
    this.stats = { sfxPlayed: 0, started: false };
  }

  /** Создаёт контекст. Вызывается из обработчика ввода (требование браузеров). */
  ensure() {
    if (!this.supported) return null;
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.enabledMusic ? 0.22 : 0;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.enabledSfx ? 0.5 : 0;
    this.sfxGain.connect(this.master);

    // Шумовой буфер для кассы, шагов и «пшш» сканера.
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff) - 1;
    }
    this.stats.started = true;
    return this.ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  setSfx(on) {
    this.enabledSfx = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 0.5 : 0;
  }

  setMusic(on) {
    this.enabledMusic = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.22 : 0;
    if (on) this.startMusic();
  }

  // ── Музыка ────────────────────────────────────────────────────────────
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.playing || !this.enabledMusic) return;
    this.playing = true;
    this.musicStep = 0;
    const tick = () => {
      if (!this.playing) return;
      this.scheduleBar();
      // Планируем по 8 шестнадцатых вперёд с небольшим запасом.
      this.musicTimer = setTimeout(tick, STEP * 8 * 1000);
    };
    tick();
  }

  stopMusic() {
    this.playing = false;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  scheduleBar() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.06;
    for (let i = 0; i < 8; i++) {
      const at = t0 + i * STEP;
      const idx = (this.musicStep + i) % BASS_PATTERN.length;
      const bass = BASS_PATTERN[idx];
      if (bass) this.blip(noteHz(bass, 2), at, STEP * 2.4, 'sawtooth', 0.30, this.musicGain, 620);
      const lead = LEAD_PATTERN[idx];
      if (lead) this.blip(noteHz(lead, 4), at, STEP * 1.7, 'square', 0.12, this.musicGain, 2400);
      if (idx % 4 === 0) {
        const chord = PAD_CHORDS[(idx / 4) % PAD_CHORDS.length];
        for (const n of chord) this.blip(noteHz(n, 3), at, STEP * 3.6, 'triangle', 0.10, this.musicGain, 1400);
      }
      if (idx % 2 === 0) this.hat(at, idx % 4 === 2 ? 0.10 : 0.055);
      if (idx % 8 === 4) this.kick(at);
    }
    this.musicStep = (this.musicStep + 8) % BASS_PATTERN.length;
  }

  kick(at) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.16);
    g.gain.setValueAtTime(0.42, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.20);
    osc.connect(g).connect(this.musicGain);
    osc.start(at);
    osc.stop(at + 0.24);
  }

  hat(at, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(hp).connect(g).connect(this.musicGain);
    src.start(at);
    src.stop(at + 0.07);
  }

  blip(freq, at, dur, type, level, dest, filterHz) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = osc;
    if (filterHz) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterHz;
      osc.connect(lp);
      node = lp;
    }
    node.connect(g).connect(dest ?? this.sfxGain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  // ── Эффекты ───────────────────────────────────────────────────────────
  /** Короткий синтезированный эффект по имени события. */
  play(name) {
    if (!this.enabledSfx) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.stats.sfxPlayed++;
    switch (name) {
      case 'scan':
        this.blip(1760, t, 0.09, 'square', 0.22, this.sfxGain, 4000);
        this.noise(t, 0.05, 3400, 0.12);
        break;
      case 'beep':
        this.blip(880, t, 0.12, 'square', 0.20);
        break;
      case 'door':
        this.blip(520, t, 0.16, 'sine', 0.22);
        this.blip(780, t + 0.09, 0.18, 'sine', 0.16);
        break;
      case 'fill':
        this.noise(t, 0.14, 900, 0.20);
        this.blip(320, t, 0.10, 'triangle', 0.18);
        break;
      case 'pickup':
        this.blip(240, t, 0.12, 'triangle', 0.22);
        break;
      case 'cash':
        this.blip(1320, t, 0.10, 'square', 0.18, this.sfxGain, 4200);
        this.blip(1980, t + 0.07, 0.16, 'square', 0.14, this.sfxGain, 5200);
        break;
      case 'coin':
        this.blip(1568, t, 0.08, 'square', 0.16);
        this.blip(2093, t + 0.06, 0.14, 'square', 0.12);
        break;
      case 'error':
        this.blip(180, t, 0.26, 'sawtooth', 0.24, this.sfxGain, 900);
        break;
      case 'fine':
        this.blip(150, t, 0.5, 'sawtooth', 0.26, this.sfxGain, 700);
        this.blip(110, t + 0.16, 0.6, 'square', 0.18, this.sfxGain, 500);
        break;
      case 'dialog':
        this.blip(660, t, 0.14, 'triangle', 0.20);
        break;
      case 'good':
        this.blip(880, t, 0.12, 'triangle', 0.20);
        this.blip(1174, t + 0.09, 0.14, 'triangle', 0.18);
        this.blip(1568, t + 0.18, 0.22, 'triangle', 0.16);
        break;
      case 'star':
        this.blip(1046, t, 0.16, 'triangle', 0.2);
        this.blip(1568, t + 0.12, 0.3, 'triangle', 0.18);
        break;
      case 'inspector':
        this.blip(440, t, 0.2, 'square', 0.18);
        this.blip(330, t + 0.18, 0.3, 'square', 0.16);
        break;
      case 'collapse':
        this.blip(300, t, 0.9, 'sawtooth', 0.24, this.sfxGain, 800);
        break;
      case 'ui':
        this.blip(700, t, 0.05, 'square', 0.12);
        break;
      case 'start':
        this.blip(523, t, 0.14, 'triangle', 0.2);
        this.blip(659, t + 0.1, 0.14, 'triangle', 0.2);
        this.blip(880, t + 0.2, 0.3, 'triangle', 0.2);
        break;
      default:
        break;
    }
  }

  noise(at, dur, filterHz, level) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterHz;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(this.sfxGain);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}

export { noteHz, BPM, STEP };
