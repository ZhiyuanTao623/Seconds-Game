import { ENEMY, SHOOTER } from '../config';
import { angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';

/**
 * 射手（方块）。
 * 保持中距离，红色虚线锁定后打一发红弹。
 * 子弹不可被打掉，所以它真正的压力来自「你必须一直有地方可躲」。
 */
export const shooter: EnemyBehavior = {
  kind: 'shooter',

  create: (rng, x, y, hpMult) =>
    baseEnemy('shooter', x, y, ENEMY.shooter, hpMult, rng.range(...SHOOTER.initialCooldown)),

  threat: (e) => e.pen,

  update(world, e, dt) {
    const p = world.player;
    const d = dist(p, e);
    const toPlayer = angleTo(e, p);

    switch (e.state) {
      case 'idle': {
        e.cd -= dt;
        // 太近就退，太远就进，中距离绕圈 —— 逼玩家自己去够它
        const heading =
          d < SHOOTER.tooClose ? toPlayer + Math.PI
          : d > SHOOTER.tooFar ? toPlayer
          : toPlayer + Math.PI / 2;
        e.x += Math.cos(heading) * e.spd * dt;
        e.y += Math.sin(heading) * e.spd * dt;

        if (e.cd <= 0 && d < SHOOTER.sightRange && !world.arena.lineBlocked(e, p)) {
          e.state = 'telegraph';
          e.t = SHOOTER.telegraph;
          e.dir = toPlayer;
        }
        break;
      }
      case 'telegraph': {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cd = world.rng.range(...SHOOTER.cooldown);
          world.bullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(e.dir) * SHOOTER.bullet.speed,
            vy: Math.sin(e.dir) * SHOOTER.bullet.speed,
            r: SHOOTER.bullet.radius,
            pen: e.pen,
            life: SHOOTER.bullet.life,
            dead: false,
            hostile: true,
            damage: 0,
          });
        }
        break;
      }
      default:
        e.state = 'idle';
    }
  },
};
