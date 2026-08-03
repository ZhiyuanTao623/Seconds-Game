import { ELITE_HP_MULT, LAYOUT_WHITELIST, SPAWN } from './config';
import { World } from './world';
import { spawnEnemy } from './enemies';
import type { EnemyKind } from './entities';
import type { MapNode } from './map';
import type { Run } from './run';
import type { RngStream } from '../core/rng';

/**
 * 按节点搭出一个可以打的房间。
 *
 * 生成用的随机流来自 `run.rngFor(node.id)` —— 同一个 seed 下，
 * 同一个节点的墙体和敌人位置永远一样。
 */
export function buildRoom(run: Run, node: MapNode): World {
  const rng = run.rngFor(node.id);
  const world = new World(pickLayout(rng, node), rng, run.ledger, run.stats);

  if (node.kind === 'boss') {
    world.enemies = [spawnEnemy('boss', rng, world.arena.w / 2, 150)];
    return world;
  }

  const plan = node.kind === 'elite' ? elitePlan(rng, node.floor) : combatPlan(rng, node.floor);
  const hpMult = node.kind === 'elite' ? ELITE_HP_MULT : 1;

  for (const kind of plan) {
    const { x, y } = findSpawnPoint(rng, world);
    const enemy = spawnEnemy(kind, rng, x, y, hpMult);
    world.arena.collide(enemy);
    world.enemies.push(enemy);
  }

  return world;
}

/**
 * 布局白名单。
 *
 * 子弹不可被打掉之后，掩体从「锦上添花」变成了「能不能打」：
 * 空场配一堆射手是无处可躲的，空场配一堆重甲是无处可绕的。
 * Boss 房反过来固定用空场 —— 三连冲锋和三段震波需要完整场地，
 * 掩体会让判定读不清。
 */
function pickLayout(rng: RngStream, node: MapNode): number {
  const pool =
    node.kind === 'boss' ? LAYOUT_WHITELIST.boss
    : node.kind === 'elite' ? LAYOUT_WHITELIST.elite
    : node.floor >= 3 ? LAYOUT_WHITELIST.combatLate
    : LAYOUT_WHITELIST.combatEarly;
  return rng.pick(pool);
}

function combatPlan(rng: RngStream, floor: number): EnemyKind[] {
  const plan: EnemyKind[] = [];
  for (let i = 0; i < 2 + floor; i++) {
    plan.push(rng.pick(['charger', 'charger', 'shooter'] as const));
  }
  if (floor >= 3) plan.push('brute');
  return plan;
}

function elitePlan(rng: RngStream, floor: number): EnemyKind[] {
  const plan: EnemyKind[] = [];
  for (let i = 0; i < 2 + Math.floor(floor / 2); i++) plan.push('brute');
  for (let i = 0; i < 2 + floor; i++) {
    plan.push(rng.pick(['charger', 'shooter'] as const));
  }
  return plan;
}

/** 生成点必须离玩家足够远，否则一进门就被贴脸。 */
function findSpawnPoint(rng: RngStream, world: World): { x: number; y: number } {
  const p = world.player;
  let best = { x: rng.range(...SPAWN.xRange), y: rng.range(...SPAWN.yRange) };

  for (let i = 0; i < SPAWN.maxTries; i++) {
    const candidate = { x: rng.range(...SPAWN.xRange), y: rng.range(...SPAWN.yRange) };
    if (Math.hypot(candidate.x - p.x, candidate.y - p.y) >= SPAWN.minDistanceFromPlayer) {
      return candidate;
    }
    best = candidate;
  }
  return best;
}
