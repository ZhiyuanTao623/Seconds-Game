import { BRUTE, ENEMY } from '../config';
import { angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';

/**
 * 重甲（六边形）。
 * 脚下红圈向外扩，扩满瞬间全圈伤害 —— 唯一的读法是看圈涨到哪了，
 * 而不是看它面朝哪。不检查视线：躲在墙后不管用，必须真的跑出去。
 */
export const brute: EnemyBehavior = {
  kind: 'brute',

  create: (rng, x, y, hpMult) =>
    baseEnemy('brute', x, y, ENEMY.brute, hpMult, rng.range(...BRUTE.initialCooldown)),

  threat: (e) => e.pen,

  update(world, e, dt) {
    const p = world.player;
    const d = dist(p, e);
    const toPlayer = angleTo(e, p);

    switch (e.state) {
      case 'idle': {
        e.cd -= dt;
        if (d > BRUTE.approachStop) {
          e.x += Math.cos(toPlayer) * e.spd * dt;
          e.y += Math.sin(toPlayer) * e.spd * dt;
        }
        if (e.cd <= 0 && d < BRUTE.triggerRange) {
          e.state = 'telegraph';
          e.t = BRUTE.telegraph;
        }
        break;
      }
      case 'telegraph': {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'recover';
          e.t = BRUTE.recover;
          world.fx.ring(e.x, e.y, 20, BRUTE.blastRadius, '#ff4444', 0.3);
          if (dist(p, e) < BRUTE.blastRadius) world.hitPlayer(e.pen, e);
          world.addShake(BRUTE.shake);
        }
        break;
      }
      default: {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cd = world.rng.range(...BRUTE.cooldown);
        }
      }
    }
  },
};
