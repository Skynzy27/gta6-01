// Game feel: a pooled particle system, floating text, fading skid marks, trauma
// screen shake and hit-stop. None of it touches the simulation — it only draws.
// (game-feel skill: trauma^2 shake, summed sines, real-time decay, tiers.)
import { clamp } from './random.js';

const MAX_PARTICLES = 320;
const MAX_SKIDS = 220;

export function createFx() {
  const particles = [];
  const texts = [];
  const skids = [];
  let trauma = 0;
  let hitStop = 0;
  let hitStopId = 0;
  let shakeT = 0;
  let flash = 0;

  function addTrauma(amount) {
    trauma = clamp(trauma + amount, 0, 1);
  }

  return {
    /** 0..1 trauma; the camera reads this every frame. */
    get trauma() {
      return trauma;
    },
    get flash() {
      return flash;
    },
    /** Freeze the world for `seconds` of real time (hit-stop). Only the newest call restores. */
    hitStop(seconds) {
      hitStopId += 1;
      hitStop = Math.max(hitStop, seconds);
    },
    /** Seconds of freeze left; the main loop drains it in real time. */
    get hitStopLeft() {
      return hitStop;
    },
    consumeHitStop(realDt) {
      hitStop = Math.max(0, hitStop - realDt);
      return hitStop;
    },
    burst(x, y, opts = {}) {
      const n = opts.n ?? 12;
      const color = opts.color ?? '#ffd76a';
      const speed = opts.speed ?? 260;
      for (let i = 0; i < n; i += 1) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.7);
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.35 + Math.random() * 0.45,
          maxLife: 0.8,
          size: 2 + Math.random() * 3.5,
          color,
          grav: opts.grav ?? 0,
        });
      }
    },
    explosion(x, y) {
      this.burst(x, y, { n: 34, color: '#ff7a2d', speed: 420, grav: 60 });
      this.burst(x, y, { n: 20, color: '#ffd76a', speed: 300 });
      this.burst(x, y, { n: 14, color: '#5a5a5a', speed: 140, grav: -30 });
      addTrauma(0.85);
      this.hitStop(0.12);
      flash = Math.max(flash, 0.55);
    },
    muzzle(x, y, angle) {
      this.burst(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, { n: 4, color: '#ffe9a8', speed: 200 });
      addTrauma(0.08);
    },
    blood(x, y) {
      this.burst(x, y, { n: 8, color: '#c22f2f', speed: 160 });
    },
    spark(x, y) {
      this.burst(x, y, { n: 6, color: '#ffe9a8', speed: 220 });
    },
    pickupSparkle(x, y) {
      this.burst(x, y, { n: 10, color: '#7dff9a', speed: 120, grav: -40 });
    },
    floatText(x, y, text, color = '#ffffff') {
      // Jitter the spawn point and stack rapid floats upward, so several
      // events in one second read as a list instead of one smeared blob.
      texts.push({ x: x + (Math.random() - 0.5) * 44, y: y - texts.length * 20, text, color, life: 1.1 });
      if (texts.length > 24) texts.shift();
    },
    addSkid(x, y, angle) {
      skids.push({ x, y, angle, life: 5 });
      if (skids.length > MAX_SKIDS) skids.shift();
    },
    addTrauma,
    setFlash(v) {
      flash = Math.max(flash, v);
    },
    /** Advance particles, texts and shake in real time (shake decays during hit-stop). */
    update(realDt, simDt) {
      shakeT += realDt * 30;
      trauma = Math.max(0, trauma - 1.3 * realDt);
      flash = Math.max(0, flash - 2.2 * realDt);
      // Particle cap: the oldest die first when the pool overflows.
      while (particles.length > MAX_PARTICLES) particles.shift();
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= simDt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.grav * simDt;
        p.vx *= 1 - 2.2 * simDt;
        p.vy *= 1 - 2.2 * simDt;
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.life -= simDt;
        t.y -= 34 * simDt;
        if (t.life <= 0) texts.splice(i, 1);
      }
      for (let i = skids.length - 1; i >= 0; i -= 1) {
        skids[i].life -= simDt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
    },
    /** Camera shake offset (visual only): trauma^2 times summed sines. */
    shakeOffset() {
      const s = trauma * trauma;
      return {
        x: 13 * s * Math.sin(shakeT * 1.7),
        y: 9 * s * Math.sin(shakeT * 2.3),
      };
    },
    particles,
    texts,
    skids,
  };
}
