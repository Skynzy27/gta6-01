[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Skynzy27/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Skynzy27/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay — an open-world crime game

A 2D top-down open-world crime game in the spirit of GTA 6, built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01). It plays offline in a desktop browser from its own static files — no network, no build step, no library.

## The game

You are a fixer in **Solmar Bay**, a sun-soaked coastal city of palm-lined boulevards, docks, warehouses and a marina. Six missions form a story chain:

1. **The Pickup** — drive to the Docks and collect a crate.
2. **Hot Wheels** — steal any car and deliver it to the Chop Shop.
3. **Warehouse 9** — clear the yard in a shootout with four guards.
4. **On the Clock** — a 95-second courier run across town.
5. **The Bank Job** — hold the Bay Trust Bank vault while the alarm brings the city.
6. **The Big Score** — lose the heat, then reach the yacht at the Marina.

## Systems

- **A city on foot and by car** — walk (WASD), steal any traffic car (E), drive with a handbrake, mouse-aim shooting.
- **Traffic and pedestrians** — cars route on the road graph with A\*, stop at red lights; pedestrians wander and flee gunfire.
- **Wanted level and police** — stars 0–5; crimes raise the heat, police cruisers chase, ram and bust. Lose the heat to go clean.
- **Combat** — pistol, armed guards, car damage and explosions.
- **HUD with a minimap** — cash, wanted stars, HP/armor, mission banner, speed, clock, radio station.
- **Game feel** — smooth follow camera with look-ahead, trauma shake, hit-stop, muzzle flash, skid marks, floating cash text, explosion particles.
- **Sound** — every SFX synthesised with WebAudio, plus three procedural radio stations (R to switch, M to mute).
- **Save** — mission progress and cash save to localStorage automatically.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Deterministic: `?seed=` picks the city seed, `?shot=title|drive|shoot|heist` stages a screenshot scene. Fixed-step simulation (1/60 s) — the same seed always plays the same. The entry program is `main.ts`: it copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

## Layout

- `game/index.html` — the page
- `game/src/main.js` — boot, fixed-step loop, screens, save/load
- `game/src/config.js` — city layout, palette, missions
- `game/src/city.js` — road graph, A\*, traffic lights, collision
- `game/src/actors.js` — player, traffic, police AI, pedestrians, bullets
- `game/src/missions.js` — the six-mission chain
- `game/src/fx.js` — particles, shake, hit-stop
- `game/src/render.js` — canvas world, HUD, minimap, screens
- `game/src/shots.js` — deterministic screenshot scenes
- `game/src/audio.js` — synthesised SFX + procedural radio
- `game/src/input.js` — keyboard + mouse
- `game/src/random.js` — seeded RNG

## License

MIT — see [LICENSE](LICENSE).
