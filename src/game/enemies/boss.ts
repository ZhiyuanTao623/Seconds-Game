import { BOSS } from '../config';
import { TAU, angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';
import type { Enemy } from '../entities';
import type { World } from '../world';

/**
 * BOSS（八边形）。半血后进入「回收」阶段：每个旧招式都会反向再做一次，
 * 随后露出短暂破绽。这里没有不可见的新伤害，所有回收攻击仍沿用原招式报价。
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

    if (e.vulnerable > 0) e.vulnerable -= dt;

    // 只在一个招式彻底结束后转阶段，绝不在预警或弹幕中途改规则。
    if (!e.phaseTwo && e.hp <= e.maxHp * BOSS.phaseTwo.threshold && e.state === 'idle') {
      e.state = 'bossPhaseShift';
      e.t = BOSS.phaseTwo.shiftTime;
      e.cd = 0;
    }

    switch (e.state) {
      case 'bossPhaseShift': {
        e.t -= dt;
        if (e.t <= 0) {
          e.phaseTwo = true;
          e.state = 'idle';
          e.cd = 0;
        }
        break;
      }

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
            if (e.phaseTwo) {
              e.state = 'bossRecallChargeTel';
              e.t = BOSS.charge.recallTelegraph;
              e.dir += Math.PI;
            } else {
              e.state = 'idle';
              e.cd = BOSS.charge.cooldown;
            }
          }
        }
        break;
      }

      case 'bossRecallChargeTel': {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'bossRecallCharge'; e.t = BOSS.charge.time; }
        break;
      }

      case 'bossRecallCharge': {
        e.t -= dt;
        e.x += Math.cos(e.dir) * BOSS.charge.speed * dt;
        e.y += Math.sin(e.dir) * BOSS.charge.speed * dt;
        if (dist(p, e) < e.r + p.r + 4) world.hitPlayer(e.pen, e);
        if (e.t <= 0) openWeakPoint(e);
        break;
      }

      case 'bossSlamTel': {
        e.t -= dt;
        if (e.t <= 0) fireSlam(world, e);
        break;
      }

      case 'bossSlamRecallTel': {
        e.t -= dt;
        if (e.t <= 0) fireSlamRecall(world, e);
        break;
      }

      case 'bossSlamRecall': {
        e.t -= dt;
        if (e.t <= 0) openWeakPoint(e);
        break;
      }

      case 'bossBurstRecall': {
        e.t -= dt;
        if (e.t <= 0) fireBurstRecall(world, e);
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
  const { count } = BOSS.burst;
  const offset = world.rng.float() * TAU;
  fireRing(world, e, offset, e.phaseTwo ? BOSS.burst.recall.count : count);
  if (e.phaseTwo) {
    // 有缺口的第一圈之后，缺口转到反方向再来一圈。
    e.state = 'bossBurstRecall';
    e.t = BOSS.burst.recall.delay;
    e.dir = offset + Math.PI;
  } else {
    e.state = 'idle';
    e.cd = BOSS.burst.cooldown;
  }
  world.addShake(BOSS.burst.shake);
}

function fireBurstRecall(world: World, e: Enemy): void {
  fireRing(world, e, e.dir, BOSS.burst.recall.count);
  world.addShake(BOSS.burst.shake);
  openWeakPoint(e);
}

function fireRing(world: World, e: Enemy, offset: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    world.bullets.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * BOSS.burst.bullet.speed,
      vy: Math.sin(a) * BOSS.burst.bullet.speed,
      r: BOSS.burst.bullet.radius,
      pen: BOSS.burst.pen,
      life: BOSS.burst.bullet.life,
      dead: false,
      hostile: true,
      damage: 0,
    });
  }
}

function fireSlam(world: World, e: Enemy): void {
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
      if (i === radii.length - 1 && !e.phaseTwo) e.threat = 0;
    });
  });

  if (e.phaseTwo) {
    // 等最外圈出发后再给回收预警，避免两套环形预警相互遮住。
    e.state = 'bossSlamRecallTel';
    e.t = (radii.length - 1) * gap + BOSS.slam.recallTelegraph;
  } else {
    e.state = 'idle';
    e.cd = BOSS.slam.cooldown;
  }

  world.addShake(BOSS.slam.shake);
}

function fireSlamRecall(world: World, e: Enemy): void {
  const { radii, gap, bandInner, bandWidth } = BOSS.slam;
  // 这段等待态防止每一个 fixed step 都重新排一次三段回收波。
  e.state = 'bossSlamRecall';
  e.t = (radii.length - 1) * gap;
  [...radii].reverse().forEach((radius, i) => {
    world.timeline.after(i * gap, () => {
      if (!e.dead && world.enemies.includes(e)) {
        world.fx.ring(e.x, e.y, radius + 40, radius, '#ff8a5c', 0.28);
        if (Math.abs(dist(world.player, e) - radius + bandInner) < bandWidth) {
          world.hitPlayer(BOSS.slam.pen, e);
        }
      }
      if (i === radii.length - 1) e.threat = 0;
    });
  });
  world.addShake(BOSS.slam.shake);
}

function openWeakPoint(e: Enemy): void {
  e.vulnerable = BOSS.phaseTwo.weakPointTime;
  e.state = 'idle';
  e.cd = BOSS.burst.cooldown;
}
