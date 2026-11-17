// Solmar Bay — static configuration: the city layout, the palette, the physics
// numbers and the six-mission story chain. Nothing here changes at run time.

// World size in pixels. The city is a 7 x 5 road grid with a beach and sea to the
// south, docks to the west, warehouses to the east and a marina in the south-east.
export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 96;
export const ROADS_H = [300, 700, 1100, 1500, 1900];
export const ROADS_V = [300, 700, 1100, 1500, 1900, 2300, 2700];

// Fixed-step simulation: 60 ticks a second, the same on every machine.
export const STEP = 1 / 60;

// Landmarks (world rectangles). The mission chain walks the player through them.
export const LANDMARKS = {
  docks: { x: 40, y: 1520, w: 240, h: 360, label: 'Solmar Docks' },
  warehouse9: { x: 2360, y: 1560, w: 300, h: 300, label: 'Warehouse 9' },
  bank: { x: 1380, y: 120, w: 240, h: 160, label: 'Bay Trust Bank' },
  marina: { x: 2440, y: 2020, w: 420, h: 220, label: 'Marina' },
  chopShop: { x: 2380, y: 1180, w: 260, h: 180, label: 'Chop Shop' },
  beach: { x: 0, y: 2120, w: WORLD_W, h: 280, label: 'Solmar Beach' },
};
export const YACHT = { x: 2620, y: 2160, w: 150, h: 52 };

// Sun-soaked palette: warm sand, teal sea, coral and cream buildings.
export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9c4e',
  sand: '#e8d39a',
  sea: '#2e7f9e',
  seaDeep: '#1f6a88',
  road: '#3a3f47',
  roadEdge: '#2c3038',
  lane: '#d8c56a',
  sidewalk: '#b9b3a4',
  building: ['#e8b04b', '#d96a4f', '#e8e0cf', '#7fb3c8', '#c96a8b', '#9a7bc2', '#e07a3f'],
  roof: ['#b98a35', '#a34a38', '#c9bfa8', '#5d8fa3', '#a34a6d', '#7d5ea3', '#b35c2e'],
  palm: '#3f8f4f',
  palmTrunk: '#8a6a4f',
  car: ['#d94f3d', '#3d7bd9', '#e8c93d', '#e8e8e8', '#3d3d3d', '#7bd9a0', '#c23dd9'],
  police: '#2f6fd9',
  policeLight: ['#ff2d2d', '#2d7dff'],
};

// Player on foot.
export const PLAYER = {
  radius: 13,
  walkSpeed: 195,
  hp: 100,
  armor: 50,
  pistolDamage: 34,
  pistolRate: 0.16,
  bulletSpeed: 900,
};

// Cars: arcade handling, top speed in px/s, damage at which the car explodes.
export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  brake: 700,
  reverseTop: 160,
  topSpeed: 560,
  policeTopSpeed: 640,
  steer: 2.6,
  grip: 8.0,
  handbrakeGrip: 2.2,
  explodeAt: 100,
};

// Wanted level: stars 0-5. Crimes add heat; heat decays when the player stays clean.
export const WANTED = {
  maxStars: 5,
  decayPerSecond: 0.045,
  pedHit: 1,
  shootPublic: 1,
  stealCar: 1,
  killCop: 2,
  bankAlarm: 4,
  // Police cars per wanted star (capped). A 5-star chase is five cruisers at once.
  policePerStar: 1,
  policeCap: 5,
  // How long a cop must touch the player on foot before the bust lands.
  bustSeconds: 2.0,
};

// Traffic and pedestrians keep the city alive.
export const TRAFFIC = { cars: 14, spawnRadius: 900, despawnRadius: 1400 };
export const PEDS = { count: 26, walkSpeed: 55, fleeSpeed: 130 };

// The story: six missions, a decision chain. Each one hands the player to the next.
export const MISSIONS = [
  {
    id: 1, title: 'The Pickup', reward: 250,
    briefing: 'A crate waits at the Docks. Drive there and pick it up. No questions.',
    objective: { type: 'goto', x: 160, y: 1700, radius: 70, label: 'Pick up the crate at the Docks' },
  },
  {
    id: 2, title: 'Hot Wheels', reward: 400,
    briefing: 'The buyer wants a fresh ride. Steal any car and deliver it to the Chop Shop.',
    objective: { type: 'steal', x: 2510, y: 1270, radius: 90, label: 'Steal a car, deliver it to the Chop Shop' },
  },
  {
    id: 3, title: 'Warehouse 9', reward: 800,
    briefing: 'The crew at Warehouse 9 took what is ours. Clear the yard — all four of them.',
    objective: { type: 'eliminate', x: 2510, y: 1710, radius: 200, label: 'Clear out Warehouse 9 (4 guards)', count: 4 },
  },
  {
    id: 4, title: 'On the Clock', reward: 600, timeLimit: 95,
    briefing: 'A package, a deadline, a whole city between them. Ninety-five seconds. Go.',
    objective: { type: 'timed', x: 2900, y: 300, radius: 80, label: 'Deliver the package to the north-east corner' },
  },
  {
    id: 5, title: 'The Bank Job', reward: 2500,
    briefing: 'Bay Trust Bank. Hold the vault for five seconds — the alarm will bring the whole city.',
    objective: { type: 'hold', x: 1500, y: 200, radius: 90, holdSeconds: 5, label: 'Hold the bank vault (5s) — expect company' },
  },
  {
    id: 6, title: 'The Big Score', reward: 5000,
    briefing: 'Lose the heat, then reach the yacht at the Marina. One clean getaway and we are done.',
    objective: { type: 'escape', x: 2620, y: 2160, radius: 110, label: 'Lose the heat, then reach the yacht' },
  },
];

export const SAVE_KEY = 'solmar-bay-save-v1';
