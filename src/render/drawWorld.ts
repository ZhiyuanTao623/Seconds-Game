import { ARENA, BOSS, BRUTE, CHARGED_SLASH, CHARGER, MEDIC, SHOOTER } from '../game/config';
import { TAU, clamp, dist } from '../core/math';
import { labelFor } from '../game/pricing';
import { threatOf } from '../game/enemies';
import type { Renderer } from './renderer';
import type { World } from '../game/world';
import type { Enemy } from '../game/entities';
import type { PriceContext } from '../game/pricing';

/**
 * 渲染层只读世界，绝不改它。
 * 特效的推进由 World.step 负责，这里拿到的都是已经算好的状态。
 */
export function drawWorld(r: Renderer, world: World): void {
  drawGrid(r);
  drawWalls(r, world);
  const ctx = world.priceContext;
  for (const e of world.enemies) drawEnemy(r, world, e, ctx);
  drawBullets(r, world, ctx);
  drawPlayer(r, world);
  drawFx(r, world);
  drawScreenFlash(r, world);
}

function drawGrid(r: Renderer): void {
  const { ctx } = r;
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= ARENA.w; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.h); }
  for (let y = 0; y <= ARENA.h; y += 50) { ctx.moveTo(0, y); ctx.lineTo(ARENA.w, y); }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, ARENA.w - 16, ARENA.h - 16);
}

function drawWalls(r: Renderer, world: World): void {
  const { ctx } = r;
  for (const w of world.arena.walls) {
    ctx.fillStyle = '#16161c';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
}

// ---------------------------------------------------------------- 价签

/**
 * 全场唯一的报价渲染口。
 *
 * 数字来自 penaltyFor()，和实收共用一条公式；字符串来自 priceLabel()，
 * 和受击时飘出来的那个数字逐字一致。
 *
 * priceLabel 返回 null = 玩家此刻无敌，这一下真的不要钱 —— 那就一个字都不画。
 * 场上安静下来本身就是最清晰的信号，比闪一下绿色的「免费」更好读。
 */
function drawPrice(
  r: Renderer,
  x: number, y: number,
  base: number,
  priceCtx: PriceContext,
  alpha: number,
  size: number,
): void {
  const label = labelFor(base, priceCtx);
  if (label === null) return;

  const taxed = priceCtx.streak > 0;
  const { ctx } = r;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = taxed ? 'rgba(255,138,92,.95)' : 'rgba(255,106,106,.75)';
  ctx.font = `${taxed ? '700 ' : ''}${size}px monospace`;
  ctx.fillText(label, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------- 敌人

function drawEnemy(r: Renderer, world: World, e: Enemy, priceCtx: PriceContext): void {
  const { ctx } = r;
  const hurt = e.flash > 0;

  ctx.lineWidth = 2.5;
  ctx.fillStyle = hurt ? '#ffffff' : '#15151b';
  ctx.strokeStyle = '#ffffff';

  switch (e.kind) {
    case 'charger': {
      const angle = e.state === 'idle' ? Math.atan2(world.player.y - e.y, world.player.x - e.x) : e.dir;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(e.r, 0);
      ctx.lineTo(-e.r * 0.8, e.r * 0.85);
      ctx.lineTo(-e.r * 0.8, -e.r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'shooter':
      ctx.beginPath();
      ctx.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'brute':
      r.polygon(e.x, e.y, e.r, 6, 0.3);
      ctx.fill();
      ctx.stroke();
      break;
    case 'medic':
      r.polygon(e.x, e.y, e.r, 5, -Math.PI / 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'boss':
      r.polygon(e.x, e.y, e.r, 8, performance.now() / 2600);
      ctx.fill();
      ctx.stroke();
      r.polygon(e.x, e.y, e.r * 0.55, 4, -performance.now() / 1800);
      ctx.stroke();
      break;
  }

  drawTelegraph(r, e);
  drawHpBar(r, e);
  drawPrice(r, e.x, e.y + e.r + 14, threatOf(e), priceCtx, 1, 10);
}

/**
 * 红色 = 马上要收你钱，所有会直接威胁玩家的预警都用同一套语言。
 * 医疗兵是例外：它的橙色预警和秒数账本无关，读作「这不会打你，但你该管」。
 */
function drawTelegraph(r: Renderer, e: Enemy): void {
  const { ctx } = r;
  ctx.save();

  if (e.state === 'telegraph' && e.kind === 'charger') {
    const k = 1 - e.t / CHARGER.telegraph;
    ctx.strokeStyle = `rgba(255,60,60,${0.35 + k * 0.55})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.dir) * CHARGER.telegraphRay, e.y + Math.sin(e.dir) * CHARGER.telegraphRay);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,60,.13)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 12 * k, 0, TAU);
    ctx.fill();
  }

  if (e.state === 'telegraph' && e.kind === 'shooter') {
    const k = 1 - e.t / SHOOTER.telegraph;
    ctx.strokeStyle = `rgba(255,60,60,${0.25 + k * 0.5})`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.dir) * SHOOTER.telegraphRay, e.y + Math.sin(e.dir) * SHOOTER.telegraphRay);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (e.state === 'telegraph' && e.kind === 'brute') {
    const k = 1 - e.t / BRUTE.telegraph;
    ctx.fillStyle = `rgba(255,60,60,${0.1 + k * 0.22})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, BRUTE.blastRadius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,60,.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, BRUTE.blastRadius * k, 0, TAU);
    ctx.stroke();
  }

  if (e.state === 'telegraph' && e.kind === 'medic') {
    const k = 1 - e.t / MEDIC.telegraph;
    ctx.fillStyle = `rgba(255,138,92,${0.08 + k * 0.14})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, MEDIC.healRadius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,138,92,.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, MEDIC.healRadius * k, 0, TAU);
    ctx.stroke();
  }

  if (e.state === 'bossChargeTel') {
    const total = e.comboLeft === BOSS.charge.repeats ? BOSS.charge.telegraph : BOSS.charge.telegraphRepeat;
    const k = 1 - e.t / total;
    ctx.strokeStyle = `rgba(255,60,60,${0.4 + k * 0.5})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.dir) * BOSS.charge.telegraphRay, e.y + Math.sin(e.dir) * BOSS.charge.telegraphRay);
    ctx.stroke();
  }

  if (e.state === 'bossBurstTel') {
    const k = 1 - e.t / BOSS.burst.telegraph;
    ctx.strokeStyle = 'rgba(255,60,60,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 40 * (1 - k), 0, TAU);
    ctx.stroke();
  }

  if (e.state === 'bossSlamTel') {
    const k = 1 - e.t / BOSS.slam.telegraph;
    ctx.strokeStyle = 'rgba(255,60,60,.55)';
    ctx.lineWidth = 2;
    for (const radius of BOSS.slam.radii) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius * k, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawHpBar(r: Renderer, e: Enemy): void {
  if (e.hp >= e.maxHp) return;
  const { ctx } = r;
  const w = e.kind === 'boss' ? 130 : e.r * 2.4;
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 3);
  ctx.fillStyle = '#fff';
  ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 3);
}

// ---------------------------------------------------------------- 子弹

function drawBullets(r: Renderer, world: World, priceCtx: PriceContext): void {
  const { ctx } = r;
  for (const b of world.bullets) {
    const color = b.hostile ? '#ff5252' : '#9fe3ff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = b.hostile ? 'rgba(255,82,82,.35)' : 'rgba(159,227,255,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04);
    ctx.stroke();

    // 飞行中的弹一样会收钱，所以一样要报价。
    // 越靠近越清楚，免得 Boss 弹幕的价签糊成一片。
    if (b.hostile) {
      const alpha = clamp(1 - (dist(world.player, b) - 100) / 200, 0, 1);
      if (alpha > 0.03) drawPrice(r, b.x, b.y - b.r - 7, b.pen, priceCtx, alpha, 9);
    }
  }
}

// ---------------------------------------------------------------- 玩家

function drawPlayer(r: Renderer, world: World): void {
  const { ctx } = r;
  const p = world.player;
  const blinking = p.inv > 0 && Math.floor(performance.now() / 60) % 2 === 0;

  ctx.save();
  ctx.globalAlpha = p.dashT > 0 ? 0.45 : blinking ? 0.4 : 1;
  // 只有持「反击」强化时才有黄色高亮 —— 没有这个强化，受击不产生反击窗口
  ctx.fillStyle = world.stats.counterDmg > 0 && p.counter > 0 ? '#ffd166' : '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.aim) * p.r, p.y + Math.sin(p.aim) * p.r);
  ctx.stroke();
  ctx.restore();

  drawDashRing(r, world);
  drawChargeRing(r, world);
  drawHitstun(r, world);
}

function drawDashRing(r: Renderer, world: World): void {
  const { ctx } = r;
  const p = world.player;
  if (p.dashCd > 0) {
    ctx.strokeStyle = 'rgba(136,170,255,.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / world.stats.dashCd));
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(136,170,255,.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 7, 0, TAU);
    ctx.stroke();
  }
}

/** 蓄力进度：蓄满会变成实心的金环，告诉你「现在松手是全向斩」。 */
function drawChargeRing(r: Renderer, world: World): void {
  const p = world.player;
  if (!p.charging || p.chargeT <= 0) return;

  const { ctx } = r;
  const k = clamp(p.chargeT / CHARGED_SLASH.chargeTime, 0, 1);
  const full = k >= 1;
  ctx.strokeStyle = full ? 'rgba(255,209,102,.95)' : 'rgba(255,209,102,.5)';
  ctx.lineWidth = full ? 3.5 : 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 13, -Math.PI / 2, -Math.PI / 2 + TAU * k);
  ctx.stroke();
}

/** 僵直：短促的白弧，让「我现在动不了」这件事一眼能读出来。 */
function drawHitstun(r: Renderer, world: World): void {
  const p = world.player;
  if (p.hitstun <= 0) return;

  const { ctx } = r;
  ctx.save();
  ctx.globalAlpha = clamp(p.hitstun / Math.max(p.hitstunTotal, 0.001), 0, 1);
  ctx.strokeStyle = '#ff6a6a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 特效

function drawFx(r: Renderer, world: World): void {
  const { ctx } = r;

  for (const f of world.fx.items) {
    const k = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (f.kind === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, TAU);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * (1 - k);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.range * (0.7 + 0.3 * k), f.angle - f.arc / 2, f.angle + f.arc / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.textAlign = 'center';
  for (const f of world.fx.floats) {
    const k = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = f.color;
    ctx.font = `700 ${f.size * (1 + (1 - k) * 0.35)}px monospace`;
    ctx.fillText(f.text, f.x, f.y - k * 48);
    ctx.restore();
  }
}

function drawScreenFlash(r: Renderer, world: World): void {
  const p = world.player;
  if (p.flash <= 0) return;
  const { ctx } = r;
  ctx.save();
  // 用 r.resetTransform()，不要自己写 setTransform(1,0,0,1,0,0) ——
  // 高分屏上单位变换是 (dpr,0,0,dpr,0,0)，写死 1 会让这个全屏红闪
  // 只盖住左上角 1/dpr 的区域。
  r.resetTransform();
  ctx.fillStyle = `rgba(255,40,40,${p.flash * 0.35})`;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  ctx.restore();
}
