// "Sound sketch" playback (music_sources.MUSE_SKETCH).
// MUSE stores no recordings. When a song's permitted media is a GENERATED_SKETCH,
// the browser synthesises a short loop from the song's own analysis — tempo,
// key, mode, energy, danceability and acousticness — so a listener can hear the
// character the recommender is reasoning about. It is not the song.
import { hash } from './format';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROG_MAJOR = [0, 4, 5, 3];   // I – V – vi – IV
const PROG_MINOR = [0, 5, 2, 6];   // i – VI – III – VII
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function createSketchPlayer() {
  let ctx = null;
  let master = null;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let cfg = null;
  let noise = null;
  let vol = 0.9;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return true;
  }

  function chordNotes(bar) {
    const scale = cfg.minor ? MINOR : MAJOR;
    const prog = cfg.minor ? PROG_MINOR : PROG_MAJOR;
    const deg = prog[bar % 4];
    return [0, 2, 4].map((k) => cfg.root + scale[(deg + k) % 7] + (deg + k >= 7 ? 12 : 0));
  }

  function tone(freq, t, len, { type = 'triangle', gain = 0.08, cutoff = 2400, attack = 0.02 } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + len + 0.05);
  }

  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(0.55 * cfg.energy, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
  }

  function hat(t, accent) {
    const s = ctx.createBufferSource(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime((accent ? 0.07 : 0.035) * (0.4 + cfg.dance), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.06);
  }

  function schedule(t, i) {
    const eighth = i % 8;                       // 8 eighth-notes per bar
    const bar = Math.floor(i / 8);
    const beat = 60 / cfg.tempo;
    const chord = chordNotes(bar);
    if (eighth === 0) {                         // pad: the bar's chord
      const padType = cfg.acoustic > 0.55 ? 'sine' : 'triangle';
      chord.forEach((m) => tone(midiHz(m), t, beat * 4 * 0.95, { type: padType, gain: 0.035, cutoff: 900 + 2200 * cfg.energy, attack: 0.25 }));
    }
    if (eighth % 4 === 0) tone(midiHz(chord[0] - 12), t, beat * 1.6, { type: 'sine', gain: 0.12, cutoff: 600, attack: 0.01 });
    if (cfg.energy > 0.45 && eighth % 2 === 0) kick(t);
    if (cfg.dance > 0.5 || cfg.energy > 0.6) hat(t, eighth % 2 === 1);
    // a deterministic motif from the song id: same song, same melody
    const scale = cfg.minor ? MINOR : MAJOR;
    const noteIdx = (cfg.motif >>> ((i % 16) * 2)) & 7;
    if (((cfg.motif >>> (i % 29)) & 3) !== 0 || cfg.instr > 0.6) {
      const m = cfg.root + 12 + scale[noteIdx % 7] + (noteIdx === 7 ? 12 : 0);
      tone(midiHz(m), t, beat * 0.45, { type: cfg.acoustic > 0.5 ? 'triangle' : 'square', gain: 0.022 + 0.02 * cfg.instr, cutoff: 1800 + 2000 * cfg.valence });
    }
  }

  function tick() {
    const eighthLen = 60 / cfg.tempo / 2;
    while (nextTime < ctx.currentTime + 0.18) {
      schedule(nextTime, step);
      nextTime += eighthLen;
      step += 1;
    }
  }

  return {
    supported: () => !!(window.AudioContext || window.webkitAudioContext),
    async start(song) {
      if (!ensure()) return false;
      this.stop();
      const f = song.features || {};
      cfg = {
        tempo: Math.min(170, Math.max(60, Number(f.tempo) || 100)),
        root: 45 + ((Number(f.key) || 0) % 12),
        minor: f.mode === 0,
        energy: Number(f.energy ?? 0.5),
        dance: Number(f.danceability ?? 0.5),
        acoustic: Number(f.acousticness ?? 0.4),
        instr: Number(f.instrumentalness ?? 0.2),
        valence: Number(f.valence ?? 0.5),
        motif: hash(`motif:${song.id}`),
      };
      master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), ctx.currentTime + 0.6);
      master.connect(ctx.destination);
      if (ctx.state === 'suspended') await ctx.resume();
      nextTime = ctx.currentTime + 0.08;
      step = 0;
      timer = setInterval(tick, 40);
      return true;
    },
    pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (master && ctx) {
        const m = master;
        m.gain.cancelScheduledValues(ctx.currentTime);
        m.gain.setValueAtTime(m.gain.value || 0.5, ctx.currentTime);
        m.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
        setTimeout(() => m.disconnect(), 250);
      }
      master = null;
    },
    setVolume(v) {
      vol = Math.max(0, Math.min(1, v)) * 0.9;
      if (master && ctx) master.gain.setTargetAtTime(Math.max(0.0001, vol), ctx.currentTime, 0.05);
    },
  };
}
