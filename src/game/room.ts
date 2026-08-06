import { ELITE_HP_MULT, LAYOUT_WHITELIST, SPAWN, TIMED_CHEST } from './config';
import { World } from './world';
import { TimedChest } from './timedChest';
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
  const hasTimedChest = run.isTimedChestRoom(node);
  const layout = hasTimedChest ? TIMED_CHEST.layoutIndex : pickLayout(rng, node);
  const world = new World(layout, rng, run.ledger, run.stats, hasTimedChest ? new TimedChest() : null);

  if (node.kind === 'boss') {
    world.enemies = [spawnEnemy('boss', rng, world.arena.w / 2, 150)];
    return world;
  }

  const plan: readonly EnemyKind[] = hasTimedChest
    ? TIMED_CHEST.enemyPlan
    : node.kind === 'elite' ? elitePlan(rng, node.floor) : combatPlan(rng, node.floor);
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
  // 比重甲早一层出现——先教玩家认识"躲在盟友背后回血"这件事，
  // 再让重甲把"清路"这件事变得更贵
  if (floor >= 2) plan.push('medic');
  return plan;
}

function elitePlan(rng: RngStream, floor: number): EnemyKind[] {
  const plan: EnemyKind[] = [];
  // 原来是 2+floor(层数/2)，floor6 能堆到 5 只重甲——重甲本来就是全场最肉最痛的单位，
  // 数量涨得比杂兵还快，是精英房"又多又硬"的主要来源。放缓成 1+floor(层数/3)。
  for (let i = 0; i < 1 + Math.floor(floor / 3); i++) plan.push('brute');
  for (let i = 0; i < 2 + floor; i++) {
    plan.push(rng.pick(['charger', 'shooter'] as const));
  }
  // 精英房按地图规则从不在 floor<3 出现（见 map.ts 的 elite 约束），
  // 所以这里不用再加 floor 门槛——精英房必带一个医疗兵
  plan.push('medic');
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
