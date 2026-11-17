// Actors: the player, traffic cars, police and pedestrians, and the bullets they
// trade. Cars drive on the road graph with A* routes; police run a small FSM
// (patrol -> pursue -> search); pedestrians wander and flee from trouble.
import { CAR, PLAYER, WANTED, TRAFFIC, PEDS, ROADS_H, ROADS_V, ROAD_W } from './config.js';
import { mulberry32, range, int, pick, clamp, angleDiff, dist } from './random.js';

let nextId = 1;

export function makeCar(x, y, angle, kind, color) {
  return {
    id: nextId, kind, // 'traffic' | 'police' | 'player'
    x, y, angle, speed: 0,
    color,
    damage: 0,
    dead: false,
    route: null, routeIndex: 0,
    targetSpeed: 0,
    lightWait: 0,
    ramCooldown: 0,
    searchTimer: 0,
    lastKnown: null,
    sirenPhase: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    id: nextId, x, y,
    angle: rng() * Math.PI * 2,
    speed: 0,
    state: 'walk', // 'walk' | 'flee' | 'down'
    targetX: x, targetY: y,
    color: pick(rng, ['#e8b04b', '#7fb3c8', '#c96a8b', '#9a7bc2', '#e8e0cf', '#d96a4f']),
    retarget: 0,
    fleeTimer: 0,
  };
}

export function makeBullet(x, y, angle, speed, damage, from) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage, from, // 'player' | 'enemy'
    life: 0.9,
    dead: false,
  };
}

/** Arcade car physics: accel, steering that scales with speed, handbrake drift. */
export function stepCar(car, throttle, steer, handbrake, dt) {
  const top = car.kind === 'police' ? CAR.policeTopSpeed : CAR.topSpeed;
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed += CAR.accel * 0.5 * throttle * dt;
  } else {
    car.speed -= car.speed * 0.8 * dt;
  }
  car.speed = clamp(car.speed, -CAR.reverseTop, top);
  const steerAuthority = clamp(Math.abs(car.speed) / 140, 0, 1);
  car.angle += steer * CAR.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
  const grip = handbrake ? CAR.handbrakeGrip : CAR.grip;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const vx = fx * car.speed;
  const vy = fy * car.speed;
  car.vx = vx;
  car.vy = vy;
  car.x += vx * dt;
  car.y += vy * dt;
  car.slipping = handbrake && Math.abs(car.speed) > 120;
  return grip;
}

/** Drive a car along its A* route, stopping at red lights and slow traffic. */
export function driveRoute(car, city, cars, dt, time) {
  if (!car.route || car.routeIndex >= car.route.length) return { throttle: 0, steer: 0, handbrake: false };
  const node = car.route[car.routeIndex];
  const d = dist(car.x, car.y, node.x, node.y);
  if (d < 46) {
    car.routeIndex += 1;
    return driveRoute(car, city, cars, dt, time);
  }
  // Lane offset: keep right of the road direction.
  const dx = node.x - car.x;
  const dy = node.y - car.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / len;
  const ny = dy / len;
  const lane = 20;
  const tx = node.x - ny * lane;
  const ty = node.y + nx * lane;
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(car.angle, want) * 2.2, -1, 1);
  // Red light: stop before the intersection when the cross direction is green.
  let throttle = 0.9;
  const nearNode = dist(car.x, car.y, node.x, node.y) < 120;
  if (nearNode) {
    const vertical = Math.abs(node.x - car.x) < Math.abs(node.y - car.y);
    const state = city.lightState(node.x, node.y, time);
    const myGreen = vertical ? state === 'ns' : state === 'ew';
    if (!myGreen && d < 110) throttle = -0.8;
  }
  // Slow down for the car ahead.
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const od = dist(car.x, car.y, other.x, other.y);
    if (od < 70) {
      const ahead = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
      if (ahead > 0 && od < 64) throttle = Math.min(throttle, 0.1);
    }
  }
  return { throttle, steer, handbrake: false };
}

/** Nearest car to a point within maxDist, or null. */
export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist(c.x, c.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Damage a car; returns true when it just exploded. */
export function damageCar(car, amount) {
  if (car.dead) return false;
  car.damage += amount;
  if (car.damage >= CAR.explodeAt) {
    car.dead = true;
    return true;
  }
  return false;
}

export function createActors(city, seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const player = {
    x: 1500, y: 1650, angle: -Math.PI / 2,
    hp: PLAYER.hp, armor: PLAYER.armor,
    cash: 0, onFoot: true, car: null,
    aimAngle: 0, fireCooldown: 0, hurtFlash: 0,
    bustTimer: 0, dead: false,
  };
  const cars = [];
  const peds = [];
  const bullets = [];
  const guards = [];

  function spawnTrafficCar(nearX, nearY) {
    // Pick a random intersection, then a road point near the player.
    const node = city.nodes[int(rng, 0, city.nodes.length - 1)];
    const color = pick(rng, ['#d94f3d', '#3d7bd9', '#e8c93d', '#e8e8e8', '#3d3d3d', '#7bd9a0', '#c23dd9']);
    const car = makeCar(node.x, node.y, pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic', color);
    car.route = city.route(city.nearestNode(node.x, node.y), int(rng, 0, city.nodes.length - 1));
    car.routeIndex = 1;
    car.targetSpeed = range(rng, 150, 240);
    cars.push(car);
    return car;
  }

  function spawnPed(nearX, nearY) {
    let x = nearX + range(rng, -500, 500);
    let y = nearY + range(rng, -400, 400);
    x = clamp(x, 60, 3140);
    y = clamp(y, 60, 2240);
    if (!city.onRoad(x, y)) {
      // Snap to the nearest road centre so peds walk the sidewalks.
      const rx = ROADS_V.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
      const ry = ROADS_H.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
      if (Math.abs(rx - x) < Math.abs(ry - y)) x = rx + (rng() < 0.5 ? -58 : 58);
      else y = ry + (rng() < 0.5 ? -58 : 58);
    }
    const ped = makePed(x, y, rng);
    peds.push(ped);
    return ped;
  }

  function spawnPolice(nearX, nearY) {
    const node = city.nodes[int(rng, 0, city.nodes.length - 1)];
    const car = makeCar(node.x, node.y, 0, 'police', '#2f6fd9');
    car.route = city.route(city.nearestNode(node.x, node.y), city.nearestNode(nearX, nearY));
    car.routeIndex = 1;
    car.state = 'pursue';
    cars.push(car);
    return car;
  }

  function spawnGuard(x, y) {
    const g = {
      x, y, angle: rng() * Math.PI * 2,
      hp: 100, state: 'guard', // 'guard' | 'chase' | 'down'
      fireCooldown: range(rng, 0.2, 0.8),
      speed: 120,
    };
    guards.push(g);
    return g;
  }

  return {
    player, cars, peds, bullets, guards,
    spawnTrafficCar, spawnPed, spawnPolice, spawnGuard,
    /** Keep the city populated around the player. */
    maintainPopulation(px, py) {
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        const c = cars[i];
        if (c.kind === 'traffic' && dist(c.x, c.y, px, py) > TRAFFIC.despawnRadius) {
          cars.splice(i, 1);
        }
      }
      let traffic = 0;
      for (const c of cars) if (c.kind === 'traffic') traffic += 1;
      while (traffic < TRAFFIC.cars) {
        spawnTrafficCar(px, py);
        traffic += 1;
      }
      for (let i = peds.length - 1; i >= 0; i -= 1) {
        if (peds[i].state === 'down') continue;
        if (dist(peds[i].x, peds[i].y, px, py) > TRAFFIC.despawnRadius) peds.splice(i, 1);
      }
      while (peds.length < PEDS.count) spawnPed(px, py);
    },
  };
}
