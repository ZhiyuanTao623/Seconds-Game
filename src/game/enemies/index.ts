import { charger } from './charger';
import { shooter } from './shooter';
import { brute } from './brute';
import { medic } from './medic';
import { boss } from './boss';
import type { EnemyBehavior } from './behavior';
import type { Enemy, EnemyKind } from '../entities';
import type { World } from '../world';
import type { RngStream } from '../../core/rng';

const REGISTRY: Record<EnemyKind, EnemyBehavior> = {
  charger,
  shooter,
  brute,
  medic,
  boss,
};

export function spawnEnemy(
  kind: EnemyKind,
  rng: RngStream,
  x: number,
  y: number,
  hpMult = 1,
): Enemy {
  return REGISTRY[kind].create(rng, x, y, hpMult);
}

export function updateEnemy(world: World, e: Enemy, dt: number): void {
  REGISTRY[e.kind].update(world, e, dt);
}

/** 此刻这个敌人威胁玩家的底价（还没乘 penMult 和连击税）。 */
export const threatOf = (e: Enemy): number => REGISTRY[e.kind].threat(e);

export type { EnemyBehavior } from './behavior';
