// Solmar Bay — the game itself: a 2D top-down open-world crime game.
// Fixed-step 1/60 simulation, deterministic per ?seed=, offline, no network.
// Screens: title / play / pause / wasted / busted / finale. Saves to localStorage.
import { STEP, WORLD_W, WORLD_H, ROAD_W, ROADS_H, ROADS_V, PLAYER, CAR, WANTED, PEDS, MISSIONS, SAVE_KEY, LANDMARKS, PALETTE } from './config.js';
import { mulberry32, range, int, pick, clamp, lerp, dist, angleDiff } from './random.js';
import { createInput, moveVector, driveVector } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createActors, makeCar, makeBullet, stepCar, driveRoute, nearestCar, damageCar } from './actors.js';
import { createFx } from './fx.js';
import { createMissions } from './missions.js';
import { createRenderer, SCREEN } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') ?? '1', 10) || 1;
const SHOT = params.get('shot');

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const city = createCity(seed);
  const actors = createActors(city, seed);
  const fx = createFx();
  const audio = createAudio();
  const missions = createMissions(onMissionEvent);
  const player = actors.player;

  let wanted = 0;
  let time = 0;
  let screen = SCREEN.TITLE;
  let clockSeconds = 8 * 3600;
  let policeTimer = 0;
  let spawnGuardTimer = 0;
  let missionFailedFlash = 0;

  function onMissionEvent(ev) {
    if (ev.type === 'mission-complete') {
      player.cash += ev.mission.reward;
      fx.floatText(player.x, player.y - 30, `+$${ev.mission.reward}`, '#7dff9a');
      audio.cash();
      audio.missionDone();
      fx.pickupSparkle(player.x, player.y);
      save();
    } else if (ev.type === 'mission-start') {
      fx.floatText(player.x, player.y - 30, `${ev.mission.title}`, '#ffd76a');
    } else if (ev.type === 'mission-failed') {
      missionFailedFlash = 2.5;
      fx.floatText(player.x, player.y - 30, ev.reason, '#e5484d');
    } else if (ev.type === 'story-complete') {
      screen = SCREEN.FINALE;
      audio.missionDone();
      save();
    }
  }

  function addWanted(amount, reason) {
    const before = wanted;
    wanted = clamp(wanted + amount, 0, WANTED.maxStars);
    if (wanted > before) {
      audio.wantedUp();
      fx.floatText(player.x, player.y - 44, `WANTED +${(wanted - before).toFixed(1)}`, '#ffcf3d');
    }
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        mission: missions.index, cash: player.cash, hp: player.hp, armor: player.armor,
      }));
    } catch (e) { /* private mode or no storage: play on without a save */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function spawnGuardsForMission3() {
    const w = LANDMARKS.warehouse9;
    const spots = [
      { x: w.x + 60, y: w.y + 60 },
      { x: w.x + 240, y: w.y + 60 },
      { x: w.x + 60, y: w.y + 240 },
      { x: w.x + 240, y: w.y + 240 },
    ];
    for (const s of spots) actors.spawnGuard(s.x, s.y);
  }

  function explodeCar(car) {
    fx.explosion(car.x, car.y);
    audio.explosion();
    // Chain damage to whatever is nearby.
    for (const other of actors.cars) {
      if (other !== car && !other.dead && dist(other.x, other.y, car.x, car.y) < 130) {
        if (damageCar(other, 60)) explodeCar(other);
      }
    }
    if (dist(player.x, player.y, car.x, car.y) < 130) hurtPlayer(40, car.x, car.y);
    for (const p of actors.peds) {
      if (p.state !== 'down' && dist(p.x, p.y, car.x, car.y) < 120) {
        p.state = 'down';
        addWanted(WANTED.pedHit, 'pedestrian');
      }
    }
    if (car.kind === 'police') addWanted(WANTED.killCop, 'cop car');
  }

  function hurtPlayer(amount, fromX, fromY) {
    if (player.dead || screen !== SCREEN.PLAY) return;
    let left = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, left * 0.6);
      player.armor -= absorbed;
      left -= absorbed;
    }
    player.hp -= left;
    player.hurtFlash = 0.5;
    fx.blood(player.x, player.y);
    audio.hurt();
    fx.addTrauma(0.35);
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      screen = SCREEN.WASTED;
      audio.setSiren(false);
      audio.setEngine(0);
      save();
    }
  }

  function bustPlayer() {
    if (player.dead || screen !== SCREEN.PLAY) return;
    player.dead = true;
    screen = SCREEN.BUSTED;
    audio.setSiren(false);
    audio.setEngine(0);
    save();
  }

  function stepPlayer(dt, input, aimWorld) {
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt * 2);
    if (player.onFoot) {
      const mv = moveVector(input);
      const speed = PLAYER.walkSpeed;
      const nx = player.x + mv.x * speed * dt;
      const ny = player.y + mv.y * speed * dt;
      if (!city.blocked(nx, player.y, PLAYER.radius)) player.x = nx;
      if (!city.blocked(player.x, ny, PLAYER.radius)) player.y = ny;
      city.resolveCircle(player, PLAYER.radius);
      if (mv.x !== 0 || mv.y !== 0) player.angle = Math.atan2(mv.y, mv.x);
      player.aimAngle = Math.atan2(aimWorld.y - player.y, aimWorld.x - player.x);
      // Shooting.
      if ((input.mouse.down || input.mouse.clicked) && player.fireCooldown <= 0) {
        player.fireCooldown = PLAYER.pistolRate;
        const a = player.aimAngle + (rng() - 0.5) * 0.05;
        actors.bullets.push(makeBullet(
          player.x + Math.cos(a) * 20, player.y + Math.sin(a) * 20,
          a, PLAYER.bulletSpeed, PLAYER.pistolDamage, 'player',
        ));
        fx.muzzle(player.x, player.y, a);
        audio.shoot();
        if (wanted === 0) addWanted(WANTED.shootPublic, 'shooting');
        else addWanted(0.15, 'shooting');
        // Nearby pedestrians flee.
        for (const p of actors.peds) {
          if (p.state !== 'down' && dist(p.x, p.y, player.x, player.y) < 420) {
            p.state = 'flee';
            p.fleeTimer = 3;
          }
        }
      }
      // Enter a car.
      if (input.consume('KeyE')) {
        const car = nearestCar(actors.cars, player.x, player.y, 70);
        if (car) {
          if (car.kind === 'traffic') {
            addWanted(WANTED.stealCar, 'stolen car');
            car.stolen = true;
          }
          car.kind = 'player';
          car.damage = Math.max(car.damage, 0);
          player.car = car;
          player.onFoot = false;
          player.x = car.x;
          player.y = car.y;
          audio.uiClick();
          fx.pickupSparkle(car.x, car.y);
        }
      }
    } else if (player.car) {
      const dv = driveVector(input);
      const wasSlipping = player.car.slipping;
      // Remember the pre-move position so a building hit reverts to it.
      const before = { x: player.car.x, y: player.car.y };
      stepCar(player.car, dv.throttle, dv.steer, dv.handbrake, dt);
      // The player's position rides with the car while driving.
      player.x = player.car.x;
      player.y = player.car.y;
      if (player.car.slipping && !wasSlipping) audio.skid();
      if (player.car.slipping) {
        fx.addSkid(player.car.x - Math.cos(player.car.angle) * 20, player.car.y - Math.sin(player.car.angle) * 20, player.car.angle);
      }
      // Car vs building: scrape and slow.
      if (city.blocked(player.car.x, player.car.y, 18)) {
        player.car.x = before.x;
        player.car.y = before.y;
        player.x = before.x;
        player.y = before.y;
        if (Math.abs(player.car.speed) > 200) {
          damageCar(player.car, 8);
          fx.spark(player.car.x, player.car.y);
          audio.hit();
        }
        player.car.speed *= 0.4;
      }
      // Car vs pedestrian.
      for (const p of actors.peds) {
        if (p.state === 'down') continue;
        if (dist(p.x, p.y, player.car.x, player.car.y) < 24 && Math.abs(player.car.speed) > 60) {
          p.state = 'down';
          addWanted(WANTED.pedHit, 'pedestrian');
          fx.blood(p.x, p.y);
          fx.addTrauma(0.3);
          audio.hit();
        }
      }
      // Exit the car.
      if (input.consume('KeyE')) {
        const car = player.car;
        car.speed = 0;
        car.kind = 'traffic';
        car.route = city.route(city.nearestNode(car.x, car.y), int(rng, 0, city.nodes.length - 1));
        car.routeIndex = 1;
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
        city.resolveCircle(player, PLAYER.radius);
        player.car = null;
        player.onFoot = true;
        audio.uiClick();
      }
      if (player.car && player.car.damage >= CAR.explodeAt) {
        const car = player.car;
        player.car = null;
        player.onFoot = true;
        player.x = car.x;
        player.y = car.y;
        explodeCar(car);
      }
    }
  }

  function stepTraffic(dt) {
    for (const car of actors.cars) {
      if (car.dead) continue;
      if (car.kind === 'traffic') {
        const input = driveRoute(car, city, actors.cars, dt, time);
        stepCar(car, input.throttle, input.steer, input.handbrake, dt);
        // Stay on the road: no corner-cutting through blocks or buildings.
        city.clampToRoad(car, ROAD_W / 2 - 12);
        if (car.routeIndex >= (car.route?.length ?? 0)) {
          car.route = city.route(city.nearestNode(car.x, car.y), int(rng, 0, city.nodes.length - 1));
          car.routeIndex = 1;
        }
      }
    }
  }

  function stepPolice(dt) {
    // Spawn to match the wanted level.
    policeTimer -= dt;
    let police = 0;
    for (const c of actors.cars) if (c.kind === 'police' && !c.dead) police += 1;
    const wantPolice = Math.min(WANTED.policeCap, wanted * WANTED.policePerStar);
    if (wanted > 0 && police < wantPolice && policeTimer <= 0) {
      actors.spawnPolice(player.x, player.y);
      policeTimer = 2.5;
    }
    audio.setSiren(wanted > 0 && police > 0);
    for (const car of actors.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      if (wanted === 0) {
        // Give up: drive off and despawn.
        car.state = 'patrol';
        const input = driveRoute(car, city, actors.cars, dt, time);
        stepCar(car, input.throttle * 0.6, input.steer, false, dt);
        if (dist(car.x, car.y, player.x, player.y) > 1200) car.dead = true;
        continue;
      }
      const d = dist(car.x, car.y, player.x, player.y);
      if (d > 700) {
        // Far away: route to the player's neighbourhood.
        if (!car.route || car.routeIndex >= car.route.length) {
          car.route = city.route(city.nearestNode(car.x, car.y), city.nearestNode(player.x, player.y));
          car.routeIndex = 1;
        }
        const input = driveRoute(car, city, actors.cars, dt, time);
        stepCar(car, input.throttle, input.steer, false, dt);
        city.clampToRoad(car, ROAD_W / 2 - 12);
      } else {
        // Close: ram the player directly.
        const want = Math.atan2(player.y - car.y, player.x - car.x);
        const steer = clamp(angleDiff(car.angle, want) * 2.4, -1, 1);
        stepCar(car, 1, steer, false, dt);
        // A pursuing cruiser may cut across a lot, but never through a building.
        city.resolveCircle(car, 18);
        if (d < 46) {
          if (player.onFoot) {
            player.bustTimer += dt;
            if (player.bustTimer >= WANTED.bustSeconds) bustPlayer();
          } else if (player.car) {
            if (car.ramCooldown <= 0) {
              damageCar(player.car, 12);
              fx.spark(player.car.x, player.car.y);
              audio.hit();
              fx.addTrauma(0.25);
              car.ramCooldown = 1.2;
              car.speed *= 0.5;
            }
          }
        } else {
          player.bustTimer = Math.max(0, player.bustTimer - dt * 2);
        }
      }
      car.ramCooldown = Math.max(0, car.ramCooldown - dt);
      if (car.damage >= CAR.explodeAt) explodeCar(car);
    }
  }

  function stepPeds(dt) {
    for (const p of actors.peds) {
      if (p.state === 'down') continue;
      p.retarget -= dt;
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        if (p.fleeTimer <= 0) p.state = 'walk';
        const away = Math.atan2(p.y - player.y, p.x - player.x);
        p.x += Math.cos(away) * PEDS.fleeSpeed * dt;
        p.y += Math.sin(away) * PEDS.fleeSpeed * dt;
        p.angle = away;
      } else {
        if (p.retarget <= 0) {
          const rx = ROADS_V[int(rng, 0, ROADS_V.length - 1)];
          const ry = ROADS_H[int(rng, 0, ROADS_H.length - 1)];
          p.targetX = rx + (rng() < 0.5 ? -58 : 58);
          p.targetY = clamp(ry + range(rng, -200, 200), 80, 2200);
          p.retarget = range(rng, 3, 8);
        }
        const want = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        const d = dist(p.x, p.y, p.targetX, p.targetY);
        if (d > 12) {
          p.angle = want;
          p.x += Math.cos(want) * PEDS.walkSpeed * dt;
          p.y += Math.sin(want) * PEDS.walkSpeed * dt;
        }
      }
      city.resolveCircle(p, 10);
    }
  }

  function stepGuards(dt) {
    for (const g of actors.guards) {
      if (g.state === 'down') continue;
      g.fireCooldown -= dt;
      const d = dist(g.x, g.y, player.x, player.y);
      if (d < 480 && screen === SCREEN.PLAY) {
        g.state = 'chase';
        const want = Math.atan2(player.y - g.y, player.x - g.x);
        g.angle = want;
        if (d > 180) {
          g.x += Math.cos(want) * g.speed * dt;
          g.y += Math.sin(want) * g.speed * dt;
        }
        if (g.fireCooldown <= 0 && d < 460) {
          g.fireCooldown = range(rng, 0.7, 1.3);
          const a = want + (rng() - 0.5) * 0.22;
          actors.bullets.push(makeBullet(g.x + Math.cos(a) * 18, g.y + Math.sin(a) * 18, a, 620, 12, 'enemy'));
          fx.muzzle(g.x, g.y, a);
          audio.enemyShoot();
        }
      } else {
        g.state = 'guard';
      }
      city.resolveCircle(g, 12);
    }
  }

  function stepBullets(dt) {
    for (const b of actors.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || city.blocked(b.x, b.y, 2)) {
        if (city.blocked(b.x, b.y, 2)) fx.spark(b.x, b.y);
        b.dead = true;
        continue;
      }
      if (b.from === 'player') {
        for (const g of actors.guards) {
          if (g.state === 'down') continue;
          if (dist(b.x, b.y, g.x, g.y) < 16) {
            g.hp -= b.damage;
            fx.blood(g.x, g.y);
            b.dead = true;
            if (g.hp <= 0) {
              g.state = 'down';
              fx.floatText(g.x, g.y - 20, '+$50', '#7dff9a');
              player.cash += 50;
              audio.hit();
              fx.hitStop(0.05);
              missions.notifyKill();
            }
            break;
          }
        }
        if (b.dead) continue;
        for (const c of actors.cars) {
          if (c.dead || c.kind === 'player') continue;
          if (dist(b.x, b.y, c.x, c.y) < 24) {
            if (damageCar(c, b.damage)) explodeCar(c);
            else {
              fx.spark(b.x, b.y);
              audio.hit();
            }
            b.dead = true;
            break;
          }
        }
        if (b.dead) continue;
        for (const p of actors.peds) {
          if (p.state === 'down') continue;
          if (dist(b.x, b.y, p.x, p.y) < 12) {
            p.state = 'down';
            fx.blood(p.x, p.y);
            addWanted(WANTED.pedHit, 'pedestrian');
            b.dead = true;
            break;
          }
        }
      } else {
        if (player.onFoot && dist(b.x, b.y, player.x, player.y) < 14) {
          hurtPlayer(b.damage, b.x, b.y);
          b.dead = true;
        } else if (!player.onFoot && player.car && dist(b.x, b.y, player.car.x, player.car.y) < 24) {
          damageCar(player.car, b.damage);
          b.dead = true;
        }
      }
    }
    for (let i = actors.bullets.length - 1; i >= 0; i -= 1) {
      if (actors.bullets[i].dead) actors.bullets.splice(i, 1);
    }
  }

  function stepWorld(dt, input, aimWorld) {
    time += dt;
    clockSeconds += dt * 60;
    missionFailedFlash = Math.max(0, missionFailedFlash - dt);
    // Wanted decays while the player stays clean.
    if (wanted > 0) {
      wanted = Math.max(0, wanted - WANTED.decayPerSecond * dt);
      if (wanted < 0.2) wanted = 0;
    }
    stepPlayer(dt, input, aimWorld);
    stepTraffic(dt);
    stepPolice(dt);
    stepPeds(dt);
    stepGuards(dt);
    stepBullets(dt);
    actors.maintainPopulation(player.x, player.y);
    // Mission 3 spawns its guards the first time it starts.
    const m = missions.current();
    if (m && m.id === 3 && actors.guards.length === 0 && spawnGuardTimer <= 0) {
      spawnGuardsForMission3();
      spawnGuardTimer = 1;
    }
    spawnGuardTimer = Math.max(0, spawnGuardTimer - dt);
    // Bank alarm: holding the vault spikes the heat.
    if (m && m.id === 5 && missions.holdProgress > 0 && wanted < WANTED.bankAlarm) {
      wanted = WANTED.bankAlarm;
    }
    fx.update(dt, dt);
    missions.update(dt, { player, wanted });
    audio.update();
    audio.setEngine(player.car ? Math.abs(player.car.speed) / CAR.topSpeed : 0);
  }

  function reset(opts = {}) {
    // Clear the actor lists in place: the spawn/maintain closures keep the same
    // arrays, so swapping them would orphan every later spawn.
    actors.cars.length = 0;
    actors.peds.length = 0;
    actors.bullets.length = 0;
    actors.guards.length = 0;
    const keepCash = opts.keepCash ? player.cash : 0;
    const keepMission = opts.keepMission ? missions.index : 0;
    Object.assign(player, {
      x: 1500, y: 1650, angle: -Math.PI / 2,
      hp: PLAYER.hp, armor: PLAYER.armor, cash: keepCash,
      onFoot: true, car: null, aimAngle: 0,
      fireCooldown: 0, hurtFlash: 0, bustTimer: 0, dead: false,
    });
    wanted = 0;
    time = 0;
    screen = SCREEN.TITLE;
    policeTimer = 0;
    spawnGuardTimer = 0;
    missions.jumpTo(keepMission);
  }

  const world = {
    city, actors, fx, audio, missions, player,
    get wanted() { return wanted; },
    get time() { return time; },
    get screen() { return screen; },
    set screen(s) { screen = s; },
    get clockSeconds() { return clockSeconds; },
    reset,
    stepWorld,
    save, load,
    addWanted,
    debugGiveCar() {
      // Spawn on the player's road, facing up it: 80px to the side lands the
      // car inside a block, where the building collision pins it in place.
      const car = makeCar(player.x, player.y, -Math.PI / 2, 'traffic', pick(rng, PALETTE.car));
      actors.cars.push(car);
      car.kind = 'player';
      player.car = car;
      player.onFoot = false;
      player.x = car.x;
      player.y = car.y;
      missions.jumpTo(0);
      screen = SCREEN.PLAY;
    },
    debugShootout() {
      player.x = LANDMARKS.warehouse9.x + 150;
      player.y = LANDMARKS.warehouse9.y + 340;
      player.onFoot = true;
      player.car = null;
      missions.jumpTo(2);
      spawnGuardsForMission3();
      wanted = 2;
      // The shot runs 8s of guard fire: a full armour bar keeps the player
      // visibly alive for the frame instead of a drained bar.
      player.armor = 100;
      screen = SCREEN.PLAY;
    },
    debugHeist() {
      player.x = LANDMARKS.bank.x + 120;
      player.y = LANDMARKS.bank.y + 260;
      player.onFoot = true;
      player.car = null;
      missions.jumpTo(4);
      wanted = 4;
      for (let i = 0; i < 3; i += 1) actors.spawnPolice(player.x, player.y);
      screen = SCREEN.PLAY;
    },
  };
  return world;
}

function boot() {
  const canvas = document.getElementById('game');
  const renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const world = createWorld(SEED);
  const camera = { x: 0, y: 0, shakeX: 0, shakeY: 0 };
  let cameraInit = false;

  function resize() {
    renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // Restore a save, if one exists.
  const saved = world.load();
  if (saved) {
    world.player.cash = saved.cash ?? 0;
    world.player.hp = saved.hp ?? PLAYER.hp;
    world.player.armor = saved.armor ?? PLAYER.armor;
    if (saved.mission > 0 && saved.mission < MISSIONS.length) world.missions.jumpTo(saved.mission);
  }

  // Shot staging runs the real sim forward, then draws one frame.
  let shotStaged = false;
  if (SHOT) {
    const staged = stageShot(SHOT, world, (dt, ai) => {
      // The autopilot aims where it says to aim (the shoot scene tracks a
      // guard); otherwise aim straight ahead of the player.
      const aim = ai?.aim != null
        ? { x: world.player.x + Math.cos(ai.aim) * 100, y: world.player.y + Math.sin(ai.aim) * 100 }
        : { x: world.player.x + 100, y: world.player.y };
      world.stepWorld(dt, shimInput(ai), aim);
    });
    world.screen = staged.screen;
    shotStaged = true;
  }

  // A minimal input shim so the autopilot can drive stepWorld directly.
  function shimInput(ai) {
    const mv = ai?.move ?? { x: 0, y: 0 };
    const dv = ai?.drive ?? null;
    return {
      mouse: { x: 0, y: 0, down: !!ai?.fire, clicked: false },
      down(code) {
        if (dv) {
          if (code === 'KeyW') return dv.throttle > 0;
          if (code === 'KeyS') return dv.throttle < 0;
          if (code === 'KeyA') return dv.steer < 0;
          if (code === 'KeyD') return dv.steer > 0;
          if (code === 'Space') return dv.handbrake;
        }
        if (code === 'KeyW') return mv.y < -0.1;
        if (code === 'KeyS') return mv.y > 0.1;
        if (code === 'KeyA') return mv.x < -0.1;
        if (code === 'KeyD') return mv.x > 0.1;
        return false;
      },
      wasPressed(code) {
        if (code === 'KeyE') return !!ai?.enter;
        return false;
      },
      // The autopilot's E press is consumed the same way a real one is.
      consume(code) {
        return this.wasPressed(code);
      },
    };
  }

  let last = performance.now();
  let acc = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 60;

  function frame(now) {
    requestAnimationFrame(frame);
    // Snapshot this frame's key presses first: nothing pressed during the
    // frame is lost, and nothing is read twice.
    input.beginFrame();
    let realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // FPS meter (rolling, for the playtest hook).
    fpsFrames += 1;
    fpsTime += realDt;
    if (fpsTime >= 1) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }
    // Hit-stop freezes the sim in real time.
    const frozen = world.fx.consumeHitStop(realDt) > 0;
    // Screen keys first: the PLAY block below clears pressed edges, so pause,
    // start, radio and mute must read them before the sim runs.
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      if (world.screen === SCREEN.PLAY) world.screen = SCREEN.PAUSE;
      else if (world.screen === SCREEN.PAUSE) world.screen = SCREEN.PLAY;
    }
    if (input.wasPressed('Enter') || input.mouse.clicked) {
      if (world.screen === SCREEN.TITLE) {
        world.screen = SCREEN.PLAY;
        world.missions.start();
        world.audio.unlock();
        world.audio.uiClick();
      } else if (world.screen === SCREEN.WASTED || world.screen === SCREEN.BUSTED) {
        // Retry keeps the cash and restarts at the mission that killed the player.
        world.reset({ keepCash: true, keepMission: true });
        world.screen = SCREEN.PLAY;
      } else if (world.screen === SCREEN.FINALE) {
        world.screen = SCREEN.PLAY;
        world.missions.start();
      }
    }
    if (input.wasPressed('KeyR') && world.screen === SCREEN.PLAY) {
      world.audio.nextStation();
    }
    if (input.wasPressed('KeyM')) {
      world.audio.toggleMute();
    }
    if (input.interacted) world.audio.unlock();
    if (world.screen === SCREEN.PLAY && !frozen) {
      acc += realDt;
      let steps = 0;
      try {
        while (acc >= STEP && steps < 5) {
          const rect = canvas.getBoundingClientRect();
          const aim = {
            x: camera.x + (input.mouse.x - renderer.view.w / 2),
            y: camera.y + (input.mouse.y - renderer.view.h / 2),
          };
          world.stepWorld(STEP, input, aim);
          acc -= STEP;
          steps += 1;
        }
      } finally {
        // Pressed edges must clear even if a step throws, or one keypress
        // would toggle enter/exit and pause every frame after it.
        if (steps >= 5) acc = 0;
        input.endFrame();
      }
    }
    // Camera: smooth follow + velocity look-ahead + trauma shake. The first frame
    // (and a staged shot) snaps straight to the player so the frame is framed.
    const p = world.player;
    const lookX = p.car ? Math.cos(p.car.angle) * 70 : 0;
    const lookY = p.car ? Math.sin(p.car.angle) * 70 : 0;
    const tx = clamp(p.x + lookX - renderer.view.w / 2, 0, Math.max(0, WORLD_W - renderer.view.w));
    const ty = clamp(p.y + lookY - renderer.view.h / 2, 0, Math.max(0, WORLD_H - renderer.view.h));
    if (!cameraInit) {
      camera.x = tx;
      camera.y = ty;
      cameraInit = true;
    } else {
      camera.x = lerp(camera.x, tx, 1 - Math.pow(0.001, realDt));
      camera.y = lerp(camera.y, ty, 1 - Math.pow(0.001, realDt));
    }
    const shake = world.fx.shakeOffset();
    camera.shakeX = shake.x;
    camera.shakeY = shake.y;
    world.camera = camera;
    world.fps = fps;
    renderer.draw(world);
    if (shotStaged) {
      // One frame is all a staged shot needs; stop the loop.
      shotStaged = false;
      window.__shotDone = true;
    }
    // Clear pressed edges on every screen, so a key pressed on the title
    // screen cannot fire again on the first play frame.
    input.endFrame();
  }

  // Debug hook for the playtest: state, fps, console-error count.
  window.__game = {
    world,
    input,
    get screen() { return world.screen; },
    get fps() { return fps; },
    get wanted() { return world.wanted; },
    get cash() { return world.player.cash; },
    get mission() { return world.missions.index; },
    get hp() { return world.player.hp; },
    start() {
      world.screen = SCREEN.PLAY;
      world.missions.start();
    },
  };

  requestAnimationFrame(frame);
}

boot();
