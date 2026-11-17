// Rendering: the canvas draws the city, the actors and the HUD. One file owns every
// pixel so the look stays coherent: a sun-soaked top-down city, warm light, soft
// shadows, a readable HUD with a minimap.
import { WORLD_W, WORLD_H, ROAD_W, ROADS_H, ROADS_V, LANDMARKS, YACHT, PALETTE, WANTED } from './config.js';
import { clamp, lerp } from './random.js';

export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSE: 'pause',
  WASTED: 'wasted',
  BUSTED: 'busted',
  FINALE: 'finale',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCar(ctx, x, y, angle, color, isPolice, damage) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -22 + 3, -9 + 4, 46, 22, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = color;
  roundRect(ctx, -23, -11, 46, 22, 7);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  roundRect(ctx, -8, -9, 16, 18, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.7)';
  roundRect(ctx, 8, -8, 6, 16, 2);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(21, -9, 3, 5);
  ctx.fillRect(21, 4, 3, 5);
  // Damage smoke tint.
  if (damage > 55) {
    ctx.fillStyle = `rgba(40,40,40,${clamp((damage - 55) / 45, 0, 0.55)})`;
    roundRect(ctx, -23, -11, 46, 22, 7);
    ctx.fill();
  }
  if (isPolice) {
    // Light bar, flashing red/blue by time.
    const phase = Math.floor(performance.now() / 260) % 2;
    ctx.fillStyle = phase === 0 ? '#ff2d2d' : '#2d7dff';
    ctx.fillRect(-4, -11, 8, 5);
    ctx.fillStyle = phase === 0 ? '#2d7dff' : '#ff2d2d';
    ctx.fillRect(-4, 6, 8, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(5, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720 };

  function resize(w, h) {
    view.w = w;
    view.h = h;
    canvas.width = w;
    canvas.height = h;
  }

  function drawWorld(state, cam) {
    const { city, player, fx, missions, time } = state;
    const { cars, peds, guards, bullets } = state.actors;
    ctx.save();
    ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);
    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Grass mowing stripes.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD_H; y += 160) {
      if ((y / 160) % 2 === 0) ctx.fillRect(0, y, WORLD_W, 80);
    }
    // Sea + beach.
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(0, 2280, WORLD_W, 120);
    ctx.fillStyle = PALETTE.seaDeep;
    for (let x = 0; x < WORLD_W; x += 90) {
      ctx.fillRect(x + ((time * 12 + x) % 90), 2300, 44, 4);
    }
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, 2120, WORLD_W, 160);
    // Sidewalks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD_W / 2 - 14, WORLD_W, ROAD_W + 28);
    for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2 - 14, 0, ROAD_W + 28, WORLD_H);
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
    for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const ry of ROADS_H) {
      for (let x = 20; x < WORLD_W; x += 64) ctx.fillRect(x, ry - 2, 30, 4);
    }
    for (const rx of ROADS_V) {
      for (let y = 20; y < WORLD_H; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const ry of ROADS_H) {
      for (const rx of ROADS_V) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(rx - 34 + i * 14, ry - ROAD_W / 2 + 6, 7, 16);
          ctx.fillRect(rx - 34 + i * 14, ry + ROAD_W / 2 - 22, 7, 16);
        }
      }
    }
    // Traffic lights.
    for (const n of city.nodes) {
      const st = city.lightState(n.x, n.y, time);
      ctx.fillStyle = '#222';
      ctx.fillRect(n.x - 52, n.y - 52, 10, 22);
      ctx.fillStyle = st === 'ns' ? '#37d67a' : '#e5484d';
      ctx.beginPath();
      ctx.arc(n.x - 47, n.y - 44, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Piers and docks.
    ctx.fillStyle = '#8a6a4f';
    for (const p of city.piers) ctx.fillRect(p.x, p.y, p.w, p.h);
    // Yacht at the marina.
    ctx.save();
    ctx.translate(YACHT.x, YACHT.y);
    ctx.fillStyle = '#f2f2f2';
    roundRect(ctx, -YACHT.w / 2, -YACHT.h / 2, YACHT.w, YACHT.h, 12);
    ctx.fill();
    ctx.fillStyle = '#2e7f9e';
    roundRect(ctx, -YACHT.w / 2 + 14, -YACHT.h / 2 + 8, YACHT.w - 28, 14, 6);
    ctx.fill();
    ctx.restore();
    // Buildings with roof shading.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + 10, b.y + 10, Math.max(8, b.w * 0.25), Math.max(6, b.h * 0.2));
    }
    // Landmark labels.
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const key of Object.keys(LANDMARKS)) {
      const r = LANDMARKS[key];
      if (key === 'beach') continue;
      ctx.fillText(r.label.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2);
    }
    // Palms.
    for (const p of city.palms) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s);
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(3, -16);
      ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(3 + Math.cos(a) * 10, -16 + Math.sin(a) * 7, 12, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Mission marker ring.
    const marker = missions.marker();
    if (marker && state.screen === SCREEN.PLAY) {
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 42 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,20,0.35)';
    ctx.lineWidth = 4;
    for (const s of fx.skids) {
      const dx = Math.cos(s.angle) * 12;
      const dy = Math.sin(s.angle) * 12;
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x + dx, s.y + dy);
      ctx.stroke();
    }
    // Pedestrians.
    for (const p of peds) drawPerson(ctx, p.x, p.y, p.angle, p.color, p.state === 'down');
    // Guards (armed, red shirts).
    for (const g of guards) {
      if (g.state === 'down') drawPerson(ctx, g.x, g.y, g.angle, '#8a2f2f', true);
      else drawPerson(ctx, g.x, g.y, g.angle, '#a33327', false);
    }
    // Cars.
    for (const c of cars) {
      if (c.dead) continue;
      drawCar(ctx, c.x, c.y, c.angle, c.color, c.kind === 'police', c.damage);
    }
    // Player.
    if (!player.dead) {
      if (player.onFoot) {
        drawPerson(ctx, player.x, player.y, player.aimAngle, '#2f6fd9', false);
        // Aim line.
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(player.aimAngle) * 34, player.y + Math.sin(player.aimAngle) * 34);
        ctx.stroke();
      } else if (player.car) {
        drawCar(ctx, player.car.x, player.car.y, player.car.angle, player.car.color, false, player.car.damage);
      }
    }
    // Bullets.
    ctx.fillStyle = '#ffe9a8';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const p of fx.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Floating text.
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    for (const t of fx.texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Hurt flash / damage vignette.
    if (player.hurtFlash > 0 || fx.flash > 0) {
      ctx.fillStyle = `rgba(200,30,30,${clamp(Math.max(player.hurtFlash, fx.flash) * 0.35, 0, 0.4)})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function drawMinimap(state) {
    const mw = 220;
    const mh = 165;
    const mx = view.w - mw - 16;
    const my = 16;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.fillStyle = '#3f6d4e';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(mx, my + 2120 * sy, mw, mh - 2120 * sy);
    ctx.fillStyle = '#3a3f47';
    for (const ry of ROADS_H) ctx.fillRect(mx, my + ry * sy - 2, mw, 4);
    for (const rx of ROADS_V) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
    // Landmarks.
    ctx.fillStyle = '#ffd76a';
    for (const key of ['docks', 'warehouse9', 'bank', 'marina']) {
      const r = LANDMARKS[key];
      ctx.fillRect(mx + r.x * sx - 2, my + r.y * sy - 2, 4, 4);
    }
    // Mission marker (pulsing).
    const marker = state.missions.marker();
    if (marker) {
      ctx.fillStyle = '#ffdf5e';
      ctx.beginPath();
      ctx.arc(mx + marker.x * sx, my + marker.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police (blue) and player (white).
    ctx.fillStyle = '#2d7dff';
    for (const c of state.actors.cars) {
      if (c.kind === 'police' && !c.dead) {
        ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4);
      }
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(state) {
    const { player, missions, wanted, time, audio } = state;
    ctx.save();
    // Top-left: cash + wanted stars.
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    roundRect(ctx, 12, 12, 250, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#7dff9a';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`$${player.cash.toLocaleString('en-US')}`, 26, 40);
    ctx.font = 'bold 20px sans-serif';
    let stars = '';
    for (let i = 0; i < WANTED.maxStars; i += 1) stars += i < wanted ? '★' : '☆';
    ctx.fillStyle = wanted > 0 ? '#ffcf3d' : 'rgba(255,255,255,0.45)';
    ctx.fillText(stars, 26, 66);
    // Mission banner.
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    const banner = missions.titleText();
    const obj = missions.objectiveText();
    ctx.font = 'bold 15px sans-serif';
    const bw = Math.max(ctx.measureText(banner).width, ctx.measureText(obj).width) + 36;
    roundRect(ctx, view.w / 2 - bw / 2, 12, bw, 58, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.textAlign = 'center';
    ctx.fillText(banner, view.w / 2, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(obj, view.w / 2, 56);
    // Bottom-left: HP / armor / weapon.
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    roundRect(ctx, 12, view.h - 76, 250, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(26, view.h - 58, 140 * clamp(player.hp / 100, 0, 1), 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(26, view.h - 58, 140, 10);
    ctx.fillStyle = '#7fb3c8';
    ctx.fillRect(26, view.h - 42, 140 * clamp(player.armor / 50, 0, 1), 8);
    ctx.strokeRect(26, view.h - 42, 140, 8);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Pistol  ∞   ${player.onFoot ? 'ON FOOT' : 'DRIVING'}`, 26, view.h - 20);
    // Bottom-right: speed + clock + radio.
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    roundRect(ctx, view.w - 262, view.h - 76, 250, 64, 8);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    const speed = player.car ? Math.abs(Math.round(player.car.speed * 0.12)) : 0;
    ctx.fillText(`${speed} mph`, view.w - 26, view.h - 44);
    ctx.font = '13px sans-serif';
    const hours = 8 + Math.floor(time / 3600) % 16;
    const mins = Math.floor(time / 60) % 60;
    ctx.fillText(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  •  ${audio.stationName()}`, view.w - 26, view.h - 22);
    drawMinimap(state);
    // Controls hint, first seconds of play.
    if (state.screen === SCREEN.PLAY && time < 14) {
      ctx.fillStyle = 'rgba(10,16,24,0.6)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WASD move / drive  •  E enter car  •  Click shoot  •  Space handbrake  •  R radio  •  M mute  •  P pause', view.w / 2, view.h - 92);
    }
    ctx.restore();
  }

  function drawScreen(state, which, title, lines, accent) {
    ctx.save();
    if (which === SCREEN.TITLE) {
      // Title: a centred panel so the living city shows around it.
      ctx.fillStyle = 'rgba(8,14,22,0.62)';
      roundRect(ctx, view.w / 2 - 380, view.h / 2 - 190, 760, 340, 14);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(8,14,22,0.78)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(title, view.w / 2, view.h / 2 - 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = '19px sans-serif';
    let y = view.h / 2 - 10;
    for (const line of lines) {
      ctx.fillText(line, view.w / 2, y);
      y += 30;
    }
    ctx.restore();
  }

  return {
    resize,
    get view() {
      return view;
    },
    draw(state) {
      ctx.clearRect(0, 0, view.w, view.h);
      const cam = state.camera;
      drawWorld(state, cam);
      if (state.screen === SCREEN.PLAY || state.screen === SCREEN.PAUSE) drawHud(state);
      if (state.screen === SCREEN.TITLE) {
        drawScreen(state, SCREEN.TITLE, 'SOLMAR BAY', [
          'An open-world crime story in the spirit of GTA 6.',
          'Six missions. One city. Steal cars, lose the heat, take the yacht.',
          '',
          'Press ENTER or click to start  •  WASD move  •  E enter car  •  Click shoot',
          'P pause  •  R radio  •  M mute  •  progress saves automatically',
        ], '#ffd76a');
        // Title screen also shows the live city behind the panel.
      } else if (state.screen === SCREEN.PAUSE) {
        drawScreen(state, SCREEN.PAUSE, 'PAUSED', ['Press P or Esc to keep playing.', 'Your progress is saved.'], '#ffffff');
      } else if (state.screen === SCREEN.WASTED) {
        drawScreen(state, SCREEN.WASTED, 'WASTED', ['Solmar Bay got the better of you.', 'Press ENTER to try again from the last mission.'], '#e5484d');
      } else if (state.screen === SCREEN.BUSTED) {
        drawScreen(state, SCREEN.BUSTED, 'BUSTED', ['The Solmar Bay PD took you in.', 'Press ENTER to try again from the last mission.'], '#2d7dff');
      } else if (state.screen === SCREEN.FINALE) {
        drawScreen(state, SCREEN.FINALE, 'THE BIG SCORE', [
          `You sailed out of Solmar Bay with $${state.player.cash.toLocaleString('en-US')} — clean.`,
          'All six missions complete. Free roam continues: press ENTER.',
        ], '#7dff9a');
      }
    },
  };
}
