import type { Enemy, EnemyKind } from '../entities';
import type { World } from '../world';
import type { RngStream } from '../../core/rng';

/**
 * 一种敌人 = 一个 EnemyBehavior。
 *
 * 加一种新怪只需要写一个这样的对象并注册进 enemies/index.ts，
 * 不用去改 update 分发、报价、生成三处 if/else 长链。
 */
export interface EnemyBehavior {
  kind: EnemyKind;
  create(rng: RngStream, x: number, y: number, hpMult: number): Enemy;
  update(world: World, e: Enemy, dt: number): void;
  /**
   * 此刻威胁玩家的是哪一招的**底价**（还没乘 penMult 和连击税）。
   * 屏幕上的价签和实际扣款都从这里出发，所以多段招式必须在这里
   * 如实报出当前那一段的价，不能退回接触价。
   */
  threat(e: Enemy): number;
}

/** 各行为共用的骨架，省掉每个文件重复十来个字段。 */
export function baseEnemy(
  kind: EnemyKind,
  x: number, y: number,
  block: { hp: number; radius: number; pen: number; spd: number },
  hpMult: number,
  initialCooldown: number,
): Enemy {
  const hp = block.hp * hpMult;
  return {
    kind, x, y,
    r: block.radius,
    hp, maxHp: hp,
    pen: block.pen,
    spd: block.spd,
    state: 'idle',
    t: 0,
    cd: initialCooldown,
    dir: 0,
    flash: 0,
    knockback: { x: 0, y: 0 },
    dead: false,
    threat: 0,
    comboLeft: 0,
    phaseTwo: false,
    vulnerable: 0,
  };
}
