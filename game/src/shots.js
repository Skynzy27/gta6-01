// Screenshot scenes: deterministic staged states behind ?shot=title|drive|shoot|heist.
// Each one plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN } from './render.js';
import { driveRoute, stepCar, nearestCar } from './actors.js';
import { dist } from './random.js';

/** The autopilot's input for one tick, given the staged scene. */
function autopilot(world, scene) {
  const { player, missions } = world;
  const cars = world.actors.cars;
  const guards = world.actors.guards;
  if (scene === 'drive' || scene === 'heist') {
    if (player.onFoot) {
      const car = nearestCar(cars, player.x, player.y, 400);
      if (car) {
        // Walk toward the car; the main loop's enter logic handles the rest.
        const want = Math.atan2(car.y - player.y, car.x - player.x);
        return { move: { x: Math.cos(want), y: Math.sin(want) }, enter: dist(player.x, player.y, car.x, car.y) < 60 };
      }
      return { move: { x: 0, y: 0 } };
    }
    const marker = missions.marker();
    const target = marker ?? { x: 1500, y: 1500 };
    // Route to the marker along the road graph, like traffic does: steering
    // straight at it cuts across blocks and the car stalls against a wall.
    const car = player.car;
    const targetNode = world.city.nearestNode(target.x, target.y);
    if (!car.route || car.routeTarget !== targetNode || car.routeIndex >= car.route.length) {
      car.route = world.city.route(world.city.nearestNode(car.x, car.y), targetNode);
      car.routeIndex = 1;
      car.routeTarget = targetNode;
    }
    return { drive: driveRoute(car, world.city, cars, STEP, world.time) };
  }
  if (scene === 'shoot') {
    // Face the nearest standing guard, fire, and circle-strafe around them:
    // a still target eats every guard bullet, a moving one dodges most.
    let best = null;
    let bestD = Infinity;
    for (const g of guards) {
      if (g.state === 'down') continue;
      const d = dist(player.x, player.y, g.x, g.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best) {
      const aim = Math.atan2(best.y - player.y, best.x - player.x);
      // Zig-zag strafe around the guard, flipping every half second: the
      // player keeps dodging (a still target eats every guard bullet) but
      // stays near the warehouse instead of wandering off across the map.
      const dir = Math.floor(world.time / 0.5) % 2 === 0 ? 1 : -1;
      const strafe = { x: -Math.sin(aim) * dir, y: Math.cos(aim) * dir };
      return { aim, fire: bestD < 520, move: strafe };
    }
    return {};
  }
  return {};
}

/**
 * Stage the named scene on a fresh world and return the screen to draw over it.
 * `stepWorld` is the world's own tick function (dt, autopilotInput) -> void.
 */
export function stageShot(name, world, stepWorld) {
  world.reset();
  const scene = ['drive', 'shoot', 'heist', 'title'].includes(name) ? name : 'title';
  if (scene === 'title') {
    // Let the city live for five seconds behind the title panel.
    for (let i = 0; i < 5 / STEP; i += 1) stepWorld(STEP, autopilot(world, 'title'));
    return { screen: SCREEN.TITLE };
  }
  if (scene === 'drive') {
    world.debugGiveCar();
    // Six seconds is mid-route to the Docks: the car is still moving when
    // the frame is taken, instead of parked at the destination.
    for (let i = 0; i < 6 / STEP; i += 1) stepWorld(STEP, autopilot(world, 'drive'));
    return { screen: SCREEN.PLAY };
  }
  if (scene === 'shoot') {
    world.debugShootout();
    // Two seconds catches the shootout mid-fight: the player now hits
    // guards, so three seconds already runs past the mission into the next.
    for (let i = 0; i < 2 / STEP; i += 1) stepWorld(STEP, autopilot(world, 'shoot'));
    return { screen: SCREEN.PLAY };
  }
  // heist
  world.debugHeist();
  for (let i = 0; i < 11 / STEP; i += 1) stepWorld(STEP, autopilot(world, 'heist'));
  return { screen: SCREEN.PLAY };
}

/** Drive a traffic/police car one tick along its route (shared by the main loop). */
export function stepTrafficCar(car, city, cars, dt, time) {
  const input = driveRoute(car, city, cars, dt, time);
  stepCar(car, input.throttle, input.steer, input.handbrake, dt);
}
