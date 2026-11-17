// Missions: the six-job story chain. Each mission is one objective with a marker;
// completing it pays cash and starts the next. The state machine is tiny on
// purpose: goto / steal / eliminate / timed / hold / escape.
import { MISSIONS } from './config.js';
import { dist } from './random.js';

export function createMissions(onEvent) {
  let index = 0; // 0-based into MISSIONS; MISSIONS.length means the story is done
  let timer = 0;
  let holdProgress = 0;
  let eliminated = 0;
  let delivered = false;
  let started = false;

  function current() {
    return MISSIONS[index] ?? null;
  }

  function start() {
    if (started) return;
    started = true;
    index = 0;
    timer = 0;
    holdProgress = 0;
    eliminated = 0;
    delivered = false;
    onEvent({ type: 'mission-start', mission: current() });
  }

  function complete() {
    const m = current();
    if (!m) return;
    onEvent({ type: 'mission-complete', mission: m });
    index += 1;
    timer = 0;
    holdProgress = 0;
    eliminated = 0;
    delivered = false;
    if (current()) onEvent({ type: 'mission-start', mission: current() });
    else onEvent({ type: 'story-complete' });
  }

  return {
    get index() {
      return index;
    },
    get done() {
      return index >= MISSIONS.length;
    },
    get started() {
      return started;
    },
    get timer() {
      return timer;
    },
    get holdProgress() {
      return holdProgress;
    },
    get eliminated() {
      return eliminated;
    },
    current,
    start,
    /** Jump to a mission (used by the save file and the shot stager). */
    jumpTo(i) {
      started = true;
      index = Math.max(0, Math.min(MISSIONS.length - 1, i));
      timer = 0;
      holdProgress = 0;
      eliminated = 0;
      delivered = false;
      onEvent({ type: 'mission-start', mission: current() });
    },
    /** The marker the minimap and the world arrow point at. */
    marker() {
      const m = current();
      if (!m) return null;
      return { x: m.objective.x, y: m.objective.y, label: m.objective.label };
    },
    /** Mission title + number for the banner ("M3 — Warehouse 9"). */
    titleText() {
      const m = current();
      if (!m) return 'SOLMAR BAY';
      return `M${m.id} — ${m.title}`;
    },
    /** One line of objective text for the HUD banner. */
    objectiveText() {
      const m = current();
      if (!m) return 'Story complete — free roam Solmar Bay.';
      const o = m.objective;
      if (o.type === 'eliminate') return `${o.label} — ${eliminated}/${o.count}`;
      if (o.type === 'hold') return `${o.label} — ${holdProgress.toFixed(1)}s / ${o.holdSeconds}s`;
      if (o.type === 'timed') {
        const limit = m.timeLimit ?? o.timeLimit;
        return `${o.label} — ${Math.max(0, Math.ceil(limit - timer))}s left`;
      }
      return o.label;
    },
    notifyKill() {
      const m = current();
      if (!m || m.objective.type !== 'eliminate') return;
      eliminated += 1;
      onEvent({ type: 'eliminate-progress', mission: m, count: eliminated });
      if (eliminated >= m.objective.count) complete();
    },
    /** Per-tick update. `world` carries player position, car state and wanted. */
    update(dt, world) {
      const m = current();
      if (!m || !started) return;
      const o = m.objective;
      const px = world.player.x;
      const py = world.player.y;
      const d = dist(px, py, o.x, o.y);
      timer += dt;
      if (o.type === 'goto') {
        if (d < o.radius) complete();
      } else if (o.type === 'steal') {
        // Complete when the player drives a stolen car into the chop-shop zone.
        // (The car keeps a `stolen` flag from the theft; its kind becomes
        // 'player' while driven, so the flag — not the kind — is the test.)
        if (!world.player.onFoot && world.player.car && world.player.car.stolen && d < o.radius) {
          complete();
        }
      } else if (o.type === 'timed') {
        if (d < o.radius) complete();
        else if (timer >= (m.timeLimit ?? o.timeLimit)) {
          onEvent({ type: 'mission-failed', mission: m, reason: 'Time ran out.' });
          timer = 0;
        }
      } else if (o.type === 'hold') {
        if (d < o.radius) {
          holdProgress += dt;
          if (holdProgress >= o.holdSeconds) complete();
        } else {
          holdProgress = Math.max(0, holdProgress - dt * 2);
        }
      } else if (o.type === 'escape') {
        if (world.wanted <= 0 && d < o.radius) complete();
      }
    },
  };
}
