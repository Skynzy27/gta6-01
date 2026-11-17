// Audio: every sound is synthesised with WebAudio — no audio files, no network.
// Three procedural radio stations run a tiny step sequencer; SFX are one-shot
// oscillator/noise bursts. The context is created on the first user gesture.

const STATIONS = [
  { name: 'SOLMAR FM', bpm: 96, root: 220.0, wave: 'triangle', minor: true },
  { name: 'BAY BEATS', bpm: 122, root: 130.81, wave: 'sawtooth', minor: false },
  { name: 'NEON NIGHTS', bpm: 112, root: 174.61, wave: 'square', minor: true },
];
// Chord steps in semitones from the root (one chord per bar, four bars loop).
const CHORDS = [[0, 3, 7, 12], [5, 8, 12, 17], [3, 7, 10, 15], [7, 10, 14, 19]];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noiseBuf = null;
  let muted = false;
  let station = 0;
  let step = 0;
  let nextStepTime = 0;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let engineOsc = null;
  let engineGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
      // One second of white noise, reused by every noise-based sound.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** One sequencer step: bass note, a chord stab and a hat tick. */
  function scheduleStep() {
    if (!ctx) return;
    const st = STATIONS[station];
    const stepDur = 60 / st.bpm / 2;
    while (nextStepTime < ctx.currentTime + 0.15) {
      const bar = Math.floor(step / 8) % 4;
      const chord = CHORDS[bar];
      const when = nextStepTime - ctx.currentTime;
      const root = st.root;
      // Bass on beats 0 and 4.
      if (step % 4 === 0) {
        const f = root / 2 * Math.pow(2, chord[0] / 12);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = st.wave;
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
        g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + stepDur * 1.8);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + stepDur * 2);
      }
      // Chord stab on off-beats.
      if (step % 2 === 1) {
        for (const semi of chord.slice(0, 3)) {
          const f = root * Math.pow(2, semi / 12);
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
          g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + when + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + stepDur);
          osc.connect(g);
          g.connect(musicGain);
          osc.start(ctx.currentTime + when);
          osc.stop(ctx.currentTime + when + stepDur + 0.02);
        }
      }
      step += 1;
      nextStepTime += stepDur;
    }
  }

  return {
    /** Create/resume the context on the first gesture. Safe to call every frame. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (nextStepTime === 0) nextStepTime = ctx.currentTime + 0.05;
    },
    /** Advance the radio sequencer; call once per frame. */
    update() {
      if (ctx) scheduleStep();
    },
    /** Short skid screech when the handbrake bites. */
    skid() {
      noise(0.18, 0.18, 1400);
    },
    shoot() {
      tone(880, 0.09, 'square', 0.25, 0, 220);
      noise(0.07, 0.3, 3200);
    },
    enemyShoot() {
      tone(520, 0.08, 'square', 0.12, 0, 180);
    },
    explosion() {
      noise(0.7, 0.7, 500);
      tone(90, 0.5, 'sine', 0.5, 0, 35);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.3);
      tone(990, 0.12, 'sine', 0.3, 0.07);
    },
    cash() {
      tone(880, 0.07, 'triangle', 0.3);
      tone(1174, 0.07, 'triangle', 0.3, 0.06);
      tone(1568, 0.14, 'triangle', 0.3, 0.12);
    },
    hit() {
      tone(160, 0.08, 'sawtooth', 0.3, 0, 90);
    },
    hurt() {
      tone(220, 0.18, 'sawtooth', 0.35, 0, 110);
      noise(0.12, 0.25, 900);
    },
    uiClick() {
      tone(740, 0.05, 'sine', 0.2);
    },
    missionDone() {
      tone(523, 0.1, 'triangle', 0.3);
      tone(659, 0.1, 'triangle', 0.3, 0.09);
      tone(784, 0.2, 'triangle', 0.3, 0.18);
    },
    wantedUp() {
      tone(392, 0.12, 'square', 0.2);
      tone(311, 0.18, 'square', 0.2, 0.1);
    },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      step = 0;
      if (ctx) nextStepTime = ctx.currentTime + 0.05;
      return STATIONS[station].name;
    },
    stationName() {
      return STATIONS[station].name;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    /** Two-tone police siren, started/stopped with the chase. */
    setSiren(on) {
      if (!ctx) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 700;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.05;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        try {
          sirenOsc.stop();
          sirenLfo.stop();
        } catch (e) { /* already stopped */ }
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    },
    /** Engine hum follows the player's speed; 0 silences it. */
    setEngine(speed01) {
      if (!ctx) return;
      if (speed01 <= 0.02) {
        if (engineOsc) {
          try { engineOsc.stop(); } catch (e) { /* already stopped */ }
          engineOsc = null;
          engineGain = null;
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.03;
        engineOsc.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 110;
      engineGain.gain.value = 0.02 + speed01 * 0.05;
    },
  };
}
