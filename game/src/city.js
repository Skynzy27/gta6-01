// Solmar Bay's city: the road grid, the buildings, the road graph with A* routing,
// traffic lights and the collision helpers the actors use. Everything is built once
// from the seeded stream, so the same seed always builds the same city.
import { WORLD_W, WORLD_H, ROAD_W, ROADS_H, ROADS_V, LANDMARKS, YACHT, PALETTE } from './config.js';
import { mulberry32, range, int, pick, hash2 } from './random.js';

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function onRoad(x, y) {
  for (const ry of ROADS_H) {
    if (Math.abs(y - ry) < ROAD_W / 2 + 14) return true;
  }
  for (const rx of ROADS_V) {
    if (Math.abs(x - rx) < ROAD_W / 2 + 14) return true;
  }
  return false;
}

export function createCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const palms = [];
  const piers = [];

  // Landmark footprints block building generation in their rectangles.
  const reserved = Object.values(LANDMARKS).map((r) => ({ x: r.x - 20, y: r.y - 20, w: r.w + 40, h: r.h + 40 }));
  reserved.push({ x: YACHT.x - 30, y: YACHT.y - 30, w: YACHT.w + 60, h: YACHT.h + 60 });

  // Buildings fill the blocks between roads.
  for (let ci = 0; ci < ROADS_V.length - 1; ci += 1) {
    for (let ri = 0; ri < ROADS_H.length - 1; ri += 1) {
      const bx0 = ROADS_V[ci] + ROAD_W / 2 + 26;
      const bx1 = ROADS_V[ci + 1] - ROAD_W / 2 - 26;
      const by0 = ROADS_H[ri] + ROAD_W / 2 + 26;
      const by1 = ROADS_H[ri + 1] - ROAD_W / 2 - 26;
      const block = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
      if (reserved.some((r) => rectsOverlap(block, r))) continue;
      if (rng() < 0.12) continue; // empty lot: a park corner with palms
      const cols = int(rng, 2, 3);
      const rows = int(rng, 1, 2);
      const cw = block.w / cols;
      const ch = block.h / rows;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (rng() < 0.15) continue;
          const pad = 10;
          const w = cw - pad * 2 - range(rng, 0, 26);
          const h = ch - pad * 2 - range(rng, 0, 20);
          const ci2 = Math.floor(rng() * PALETTE.building.length);
          buildings.push({
            x: block.x + c * cw + pad,
            y: block.y + r * ch + pad,
            w, h,
            color: PALETTE.building[ci2],
            roof: PALETTE.roof[ci2],
            shade: range(rng, 0.85, 1),
          });
        }
      }
    }
  }

  // Palms line the beach and dot the park lots.
  for (let x = 80; x < WORLD_W - 60; x += 90) {
    palms.push({ x: x + range(rng, -20, 20), y: 2160 + range(rng, -14, 40), s: range(rng, 0.8, 1.25) });
  }
  // A second palm row shades the north boulevard.
  for (let x = 140; x < WORLD_W - 60; x += 130) {
    palms.push({ x: x + range(rng, -24, 24), y: 300 + (rng() < 0.5 ? -62 : 62), s: range(rng, 0.8, 1.2) });
  }
  for (let i = 0; i < 40; i += 1) {
    const x = range(rng, 120, WORLD_W - 120);
    const y = range(rng, 120, 2040);
    if (!onRoad(x, y) && !buildings.some((b) => x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8)) {
      palms.push({ x, y, s: range(rng, 0.7, 1.1) });
    }
  }

  // Wooden piers at the docks and the marina.
  for (let i = 0; i < 3; i += 1) {
    piers.push({ x: 70 + i * 80, y: 1560, w: 34, h: 300 });
  }
  piers.push({ x: 2500, y: 2060, w: 300, h: 26 });

  // Road graph: one node per intersection, edges along the roads.
  const nodes = [];
  const nodeAt = new Map();
  for (const ry of ROADS_H) {
    for (const rx of ROADS_V) {
      const id = nodes.length;
      nodes.push({ id, x: rx, y: ry });
      nodeAt.set(`${rx},${ry}`, id);
    }
  }
  const edges = nodes.map(() => []);
  function link(a, b) {
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    edges[a].push({ to: b, cost: d });
    edges[b].push({ to: a, cost: d });
  }
  const cols = ROADS_V.length;
  for (let i = 0; i < nodes.length; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (col + 1 < cols) link(i, i + 1);
    if (row + 1 < ROADS_H.length) link(i, i + cols);
  }

  // Traffic lights: one phase per intersection, offset by position.
  const lights = nodes.map((n) => ({
    x: n.x, y: n.y,
    offset: hash2(n.x, n.y) * 8,
  }));

  return {
    buildings, palms, piers, nodes, edges, lights,
    /** True when the point is on a road (with a sidewalk margin). */
    onRoad,
    /** True when the point is in the sea (south strip). */
    inSea(x, y) {
      return y > 2280;
    },
    /** True when a circle of radius r at (x, y) hits a building or the sea. */
    blocked(x, y, r) {
      if (y > 2280) return true;
      for (let i = 0; i < buildings.length; i += 1) {
        const b = buildings[i];
        if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
      }
      return false;
    },
    /** Push a circle out of buildings; returns true when it was pushed. */
    resolveCircle(p, r) {
      let pushed = false;
      for (let i = 0; i < buildings.length; i += 1) {
        const b = buildings[i];
        const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.y = cy + (dy / d) * r;
          pushed = true;
        } else if (d2 <= 0.0001 && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
          p.y = b.y - r;
          pushed = true;
        }
      }
      if (p.y > 2280 - r) {
        p.y = 2280 - r;
        pushed = true;
      }
      p.x = Math.max(r, Math.min(WORLD_W - r, p.x));
      p.y = Math.max(r, Math.min(WORLD_H - r, p.y));
      return pushed;
    },
    /** Nearest graph node to a point. */
    nearestNode(x, y) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = (nodes[i].x - x) * (nodes[i].x - x) + (nodes[i].y - y) * (nodes[i].y - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },
    /** A* route (list of {x, y}) from node a to node b. */
    route(a, b) {
      if (a === b) return [nodes[b]];
      const open = [{ id: a, f: 0 }];
      const came = new Map();
      const g = new Map([[a, 0]]);
      const closed = new Set();
      const h = (id) => Math.abs(nodes[id].x - nodes[b].x) + Math.abs(nodes[id].y - nodes[b].y);
      while (open.length > 0) {
        let bi = 0;
        for (let i = 1; i < open.length; i += 1) {
          if (open[i].f < open[bi].f) bi = i;
        }
        const cur = open.splice(bi, 1)[0].id;
        if (cur === b) {
          const path = [];
          let n = b;
          while (n !== undefined) {
            path.unshift(nodes[n]);
            n = came.get(n);
          }
          return path;
        }
        closed.add(cur);
        for (const e of edges[cur]) {
          if (closed.has(e.to)) continue;
          const ng = (g.get(cur) ?? Infinity) + e.cost;
          if (ng < (g.get(e.to) ?? Infinity)) {
            g.set(e.to, ng);
            came.set(e.to, cur);
            const f = ng + h(e.to);
            const ex = open.find((o) => o.id === e.to);
            if (ex) ex.f = f;
            else open.push({ id: e.to, f });
          }
        }
      }
      return [nodes[b]];
    },
    /** Traffic-light state at an intersection: 'ns' or 'ew' green. */
    lightState(x, y, time) {
      const lx = lights.find((l) => l.x === x && l.y === y);
      const off = lx ? lx.offset : 0;
      const phase = (time + off) % 16;
      return phase < 8 ? 'ns' : 'ew';
    },
    /** Keep a point on the road surface: if it strays further than halfWidth
        from the nearest road centreline, pull it back to that edge. Traffic
        cars call this every tick, so they can never cut a corner through a
        building or a block. */
    clampToRoad(p, halfWidth) {
      let bestH = null;
      let bestHd = Infinity;
      for (const ry of ROADS_H) {
        const d = Math.abs(p.y - ry);
        if (d < bestHd) {
          bestHd = d;
          bestH = ry;
        }
      }
      let bestV = null;
      let bestVd = Infinity;
      for (const rx of ROADS_V) {
        const d = Math.abs(p.x - rx);
        if (d < bestVd) {
          bestVd = d;
          bestV = rx;
        }
      }
      if (bestHd <= bestVd) {
        if (bestHd > halfWidth) p.y = bestH + (p.y > bestH ? halfWidth : -halfWidth);
      } else if (bestVd > halfWidth) {
        p.x = bestV + (p.x > bestV ? halfWidth : -halfWidth);
      }
    },
  };
}
