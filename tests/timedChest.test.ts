import { describe, expect, it } from 'vitest';
import { FEEL, FIXED_STEP, TIMED_CHEST } from '../src/game/config';
import { RngStream } from '../src/core/rng';
import { Ledger } from '../src/game/ledger';
import { Run } from '../src/game/run';
import { buildRoom } from '../src/game/room';
import { TimedChest } from '../src/game/timedChest';
import { World } from '../src/game/world';
import { computeStats, upgradeById } from '../src/game/upgrades';
import { spawnEnemy } from '../src/game/enemies';
import { drawCombatReward } from '../src/game/rewards';
import type { InputSource } from '../src/core/input';
import type { MapNode } from '../src/game/map';

const node = (id: string, kind: MapNode['kind'] = 'combat'): MapNode => ({
  id, floor: 3, col: 0, kind, next: [], prev: [], visited: false,
});

const idle: InputSource = {
  pointer: { x: 500, y: 300 },
  isDown: () => false,
  wasPressed: () => false,
  isMouseDown: () => false,
  wasMousePressed: () => false,
  wasMouseReleased: () => false,
};

function chestWorld(upgradeIds: string[] = []): { world: World; chest: TimedChest } {
  const upgrades = upgradeIds.map((id) => upgradeById(id)!).filter(Boolean);
  const chest = new TimedChest();
  const world = new World(
    TIMED_CHEST.layoutIndex,
    new RngStream(1),
    new Ledger(),
    computeStats('blade', upgrades),
    chest,
  );
  chest.activate();
  return { world, chest };
}

describe('限时宝箱房间选择与编成', () => {
  it('只把第二个首次进入的普通战斗房标记为宝箱房', () => {
    const run = new Run(42, 'blade');
    const first = node('first');
    const elite = node('elite', 'elite');
    const second = node('second');

    run.enter(first);
    run.enter(first); // 重复进入不重复计数
    run.enter(elite);
    expect(run.normalCombatRoomsEntered).toBe(1);
    expect(run.isTimedChestRoom(first)).toBe(false);

    run.enter(second);
    expect(run.normalCombatRoomsEntered).toBe(2);
    expect(run.isTimedChestRoom(second)).toBe(true);
  });

  it('宝箱房固定为空场与 2冲锋+2射手+1重甲', () => {
    const run = new Run(7, 'blade');
    run.enter(node('first'));
    const target = node('target');
    run.enter(target);

    const world = buildRoom(run, target);
    expect(world.arena.walls).toHaveLength(0);
    expect(world.timedChest).not.toBeNull();
    expect(world.enemies.map((e) => e.kind).sort()).toEqual(
      ['brute', 'charger', 'charger', 'shooter', 'shooter'],
    );
  });
});

describe('限时宝箱状态与统一罚时', () => {
  it('30 秒正常递减，最后 5 秒危急，归零后永久失效', () => {
    const chest = new TimedChest();
    expect(chest.state).toBe('Inactive');
    chest.activate();
    chest.advance(25);
    expect(chest.state).toBe('Critical');
    expect(chest.remaining).toBeCloseTo(5, 9);
    chest.advance(5);
    expect(chest.state).toBe('Expired');
    chest.advance(10);
    chest.applyPenalty(10);
    expect(chest.remaining).toBe(0);
    expect(chest.succeed()).toBe(false);
  });

  it('受击直接使用 penaltyFor 的实扣秒数，强化和连击税同步且无敌不重复扣', () => {
    const { world, chest } = chestWorld(['un_blade']);
    world.hitPlayer(4);
    expect(chest.remaining).toBeCloseTo(30 - 4 * 1.15, 9);

    world.player.inv = 0;
    world.hitPlayer(4);
    expect(chest.remaining).toBeCloseTo(30 - 4 * 1.15 - 4 * 1.15 * 1.3, 9);

    const frozen = chest.remaining;
    world.hitPlayer(4); // 仍在无敌期
    expect(chest.remaining).toBe(frozen);
  });

  it('顿帧时按 World.timeScale 推进，暂停等价于不调用推进', () => {
    const { world, chest } = chestWorld();
    world.addHitstop(1);
    world.step(FIXED_STEP, idle);
    world.advanceTimedChest(FIXED_STEP * world.timeScale);
    expect(chest.remaining).toBeCloseTo(30 - FIXED_STEP * FEEL.hitstopScale, 9);

    const paused = chest.remaining;
    expect(chest.remaining).toBe(paused);
  });

  it('最后击杀发生时严格大于 0 则立即成功，后续罚时与推进不能反转', () => {
    const { world, chest } = chestWorld();
    chest.applyPenalty(29.9);
    const enemy = spawnEnemy('charger', new RngStream(2), 500, 300);
    enemy.hp = 1;
    world.enemies = [enemy];

    world.damageEnemy(enemy, 1);
    expect(chest.state).toBe('Succeeded');
    const frozen = chest.remaining;
    world.player.inv = 0;
    world.hitPlayer(99);
    world.advanceTimedChest(99);
    expect(chest.state).toBe('Succeeded');
    expect(chest.remaining).toBeCloseTo(frozen, 9);
  });

  it('先归零再清场保持失败', () => {
    const { world, chest } = chestWorld();
    chest.applyPenalty(30);
    world.resolveTimedChestClear();
    expect(chest.state).toBe('Expired');
  });
});

describe('宝箱奖励候选数量', () => {
  it('默认仍是 3 选 1，成功参数生成 4 个不重复候选', () => {
    const run = new Run(88, 'blade');
    const normal = drawCombatReward(new RngStream(9), run.rewardState);
    const bonus = drawCombatReward(new RngStream(9), run.rewardState, TIMED_CHEST.rewardChoices);
    expect(normal).toHaveLength(3);
    expect(bonus).toHaveLength(4);
    const ids = bonus.map((o) => o.kind === 'upgrade' ? o.upgrade.id : o.evolution.id);
    expect(new Set(ids).size).toBe(4);
  });
});
