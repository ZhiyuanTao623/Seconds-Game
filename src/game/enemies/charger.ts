import { CHARGER, ENEMY } from '../config';
import { angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';

/**
 * 冲锋兵（三角形）。
 * 预警时方向就锁死，所以破解方式永远是「侧移一步」——
 * 这是全游戏最基础的一课，也是所有其它预警的阅读范式。
 */
export const charger: EnemyBehavior = {
  kind: 'charger',

  create: (rng, x, y, hpMult) =>
    baseEnemy('charger', x, y, ENEMY.charger, hpMult, rng.range(...CHARGER.initialCooldown)),

  threat: (e) => e.pen,

  update(world, e, dt) {
    const p = world.player;
    const d = dist(p, e);
    const toPlayer = angleTo(e, p);

    switch (e.state) {
      case 'idle': {
        e.cd -= dt;
        if (d > CHARGER.approachStop) {
          e.x += Math.cos(toPlayer) * e.spd * dt;
          e.y += Math.sin(toPlayer) * e.spd * dt;
        }
        if (e.cd <= 0 && d < CHARGER.sightRange && !world.arena.lineBlocked(e, p)) {
          e.state = 'telegraph';
          e.t = CHARGER.telegraph;
          e.dir = toPlayer;
        }
        break;
      }
      case 'telegraph': {
        e.t -= dt;
        if (e.t <= 0) { e.state = 'attack'; e.t = CHARGER.dashTime; }
        break;
      }
      case 'attack': {
        e.t -= dt;
        e.x += Math.cos(e.dir) * CHARGER.dashSpeed * dt;
        e.y += Math.sin(e.dir) * CHARGER.dashSpeed * dt;
        // 用移动后的位置判定，否则会在还没撞上时就收钱
        if (dist(p, e) < e.r + p.r + 3) world.hitPlayer(e.pen, e);
        if (e.t <= 0) { e.state = 'recover'; e.t = CHARGER.recover; }
        break;
      }
      default: {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cd = world.rng.range(...CHARGER.cooldown);
        }
      }
    }
  },
};
