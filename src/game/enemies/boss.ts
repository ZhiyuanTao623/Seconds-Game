import { BOSS } from '../config';
import { TAU, angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';
import type { Enemy } from '../entities';
import type { World } from '../world';

/**
 * BOSS（八边形）。三招随机循环，没有阶段（暂不做）。
 *
 * 报价必须分招式给：起手三层环 +3.0s、起手收缩圆 +2.5s、冲锋接触 +5.0s。
 * 震波的三段间隔走 world.timeline（游戏时钟），不是 setTimeout ——
 * 否则一开「时停」，画面上的环还在慢放，判定却按真实时间落地了。
 */
export const boss: EnemyBehavior = {
  kind: 'boss',

  create: (_rng, x, y) => {
    const e = baseEnemy(
      'boss', x, y,
      { hp: BOSS.hp, radius: BOSS.radius, pen: BOSS.contactPen, spd: BOSS.spd },
      1,
      BOSS.initialCooldown,
    );
    return e;
  },

  threat: (e) => {
    // 招式已放出、伤害还在飞的时候，threat 压着当前那一段的价
    if (e.threat > 0) return e.threat;
    if (e.state === 'bossSlamTel') return BOSS.slam.pen;
    if (e.state === 'bossBurstTel') return BOSS.burst.pen;
    return e.pen;
  },

  update(world, e, dt) {
    const p = world.player;
    const d = dist(p, e);
    const toPlayer = angleTo(e, p);

    switch (e.state) {
      case 'idle': {
        e.cd -= dt;
        if (d > BOSS.approachStop) {
          e.x += Math.cos(toPlayer) * e.spd * dt;
          e.y += Math.sin(toPlayer) * e.spd * dt;
        }
        if (e.cd <= 0) chooseMove(world, e, toPlayer);
        break;
      }

      case 'bossBurstTel': {
        e.t -= dt;
        if (e.t <= 0) fireBurst(world, e);
        break;
      }

      case 'bossChargeTel': {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'bossCharge'; e.t = BOSS.charge.time; }
        break;
      }

      case 'bossCharge': {
        e.t -= dt;
        e.x += Math.cos(e.dir) * BOSS.charge.speed * dt;
        e.y += Math.sin(e.dir) * BOSS.charge.speed * dt;
        if (dist(p, e) < e.r + p.r + 4) world.hitPlayer(e.pen, e);
        if (e.t <= 0) {
          e.comboLeft -= 1;
          if (e.comboLeft > 0) {
            // 后续两次预警更短，且重新锁定玩家当前位置
            e.state = 'bossChargeTel';
            e.t = BOSS.charge.telegraphRepeat;
            e.dir = angleTo(e, p);
          } else {
            e.state = 'idle';
            e.cd = BOSS.charge.cooldown;
          }
        }
        break;
      }

      case 'bossSlamTel': {
        e.t -= dt;
        if (e.t <= 0) fireSlam(world, e);
        break;
      }

      default:
        e.state = 'idle';
    }
  },
};

function chooseMove(world: World, e: Enemy, toPlayer: number): void {
  const move = world.rng.weighted([
    ['burst', BOSS.burst.weight],
    ['charge', BOSS.charge.weight],
    ['slam', BOSS.slam.weight],
  ] as const);

  if (move === 'burst') {
    e.state = 'bossBurstTel';
    e.t = BOSS.burst.telegraph;
  } else if (move === 'charge') {
    e.state = 'bossChargeTel';
    e.t = BOSS.charge.telegraph;
    e.dir = toPlayer;
    e.comboLeft = BOSS.charge.repeats;
  } else {
    e.state = 'bossSlamTel';
    e.t = BOSS.slam.telegraph;
  }
}

function fireBurst(world: World, e: Enemy): void {
  e.state = 'idle';
  e.cd = BOSS.burst.cooldown;

  const { count, bullet } = BOSS.burst;
  const offset = world.rng.float() * TAU;
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    world.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * bullet.speed,
      vy: Math.sin(a) * bullet.speed,
      r: bullet.radius,
      pen: BOSS.burst.pen,
      life: bullet.life,
      dead: false,
      hostile: true,
      damage: 0,
    });
  }
  world.addShake(BOSS.burst.shake);
}

function fireSlam(world: World, e: Enemy): void {
  e.state = 'idle';
  e.cd = BOSS.slam.cooldown;
  // 三段波落地前，报价不能跳回接触价 5.0
  e.threat = BOSS.slam.pen;

  const { radii, gap, bandInner, bandWidth } = BOSS.slam;
  radii.forEach((radius, i) => {
    world.timeline.after(i * gap, () => {
      // 这个排期可能比 Boss 本身活得更久。它已经不在场上时，
      // 玩家就没有任何价签可读 —— 那就不许收钱。
      if (!e.dead && world.enemies.includes(e)) {
        world.fx.ring(e.x, e.y, radius - 40, radius, '#ff4444', 0.28);
        if (Math.abs(dist(world.player, e) - radius + bandInner) < bandWidth) {
          world.hitPlayer(BOSS.slam.pen, e);
        }
      }
      // 必须等最后一段真的结算完再撤回报价，否则第三下会按接触价显示
      if (i === radii.length - 1) e.threat = 0;
    });
  });

  world.addShake(BOSS.slam.shake);
}
