import { ENEMY, MEDIC } from '../config';
import { angleTo, dist } from '../../core/math';
import { baseEnemy } from './behavior';
import type { EnemyBehavior } from './behavior';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Vec2 } from '../../core/math';

/**
 * 医疗兵（五边形）。
 *
 * 全场第一个不直接威胁玩家的敌人：pen 恒为 0，永远不挂价签
 * （priceLabel(0) 返回 null，见 pricing.ts）。它的威胁是间接的——
 * 躲在离玩家最近的盟友背后，隔一段时间给附近受伤的盟友回血，
 * 逼玩家在「先清路打它」和「无视它但清场更慢」之间选。
 */
export const medic: EnemyBehavior = {
  kind: 'medic',

  create: (rng, x, y, hpMult) =>
    baseEnemy('medic', x, y, ENEMY.medic, hpMult, rng.range(...MEDIC.initialCooldown)),

  threat: (e) => e.pen,

  update(world, e, dt) {
    switch (e.state) {
      case 'idle': {
        e.cd -= dt;
        followAnchor(world, e, dt);
        // 没人需要治疗就一直挂着不触发——不做无意义的空转特效
        if (e.cd <= 0 && anyoneNeedsHealing(world, e)) {
          e.state = 'telegraph';
          e.t = MEDIC.telegraph;
        }
        break;
      }
      case 'telegraph': {
        e.t -= dt;
        if (e.t <= 0) {
          healPulse(world, e);
          e.state = 'recover';
          e.t = MEDIC.recover;
        }
        break;
      }
      default: {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'idle';
          e.cd = world.rng.range(...MEDIC.cooldown);
        }
      }
    }
  },
};

/** 场上离它最近的、活着的非医疗兵敌人——它想躲在这家伙背后。 */
function nearestAlly(world: World, self: Enemy): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = Infinity;
  for (const e of world.enemies) {
    if (e === self || e.dead || e.kind === 'medic') continue;
    const d = dist(self, e);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

/** 锚点盟友被推到玩家和医疗兵之间：目标站位在「锚点→玩家」连线的反方向延长线上。 */
function shieldPosition(ally: Enemy, player: Vec2): Vec2 {
  const away = angleTo(ally, player) + Math.PI;
  return {
    x: ally.x + Math.cos(away) * MEDIC.followDistance,
    y: ally.y + Math.sin(away) * MEDIC.followDistance,
  };
}

function followAnchor(world: World, e: Enemy, dt: number): void {
  const anchor = nearestAlly(world, e);
  if (!anchor) return; // 没有可以躲的盟友，原地待命

  const target = shieldPosition(anchor, world.player);
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= MEDIC.approachStop) return;

  e.x += (dx / d) * e.spd * dt;
  e.y += (dy / d) * e.spd * dt;
}

function anyoneNeedsHealing(world: World, self: Enemy): boolean {
  for (const e of world.enemies) {
    if (e.dead || e.hp >= e.maxHp) continue;
    if (dist(self, e) <= MEDIC.healRadius) return true;
  }
  return false;
}

function healPulse(world: World, self: Enemy): void {
  world.fx.ring(self.x, self.y, self.r, MEDIC.healRadius, '#8fe388', 0.4);

  for (const e of world.enemies) {
    if (e.dead || e.hp >= e.maxHp) continue;
    if (dist(self, e) > MEDIC.healRadius) continue;

    const before = e.hp;
    e.hp = Math.min(e.hp + MEDIC.healAmount, e.maxHp);
    const healed = e.hp - before;
    if (healed > 0) world.fx.float(e.x, e.y - e.r - 10, `+${Math.round(healed)}`, '#8fe388', 18);
  }
}
