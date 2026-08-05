import { describe, expect, it } from 'vitest';
import { BOSS, FIXED_STEP } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { IDLE_INPUT } from '../src/core/input';
import { makeWorld } from './helpers';
import type { World } from '../src/game/world';

/**
 * Boss 输出窗口（DESIGN.md v3 §10.3）：「每个 Boss 招式循环中，至少存在
 * 一个持续 0.65s 以上的安全输出窗口」。
 *
 * Boss 的状态机没有一个泛用的「安全」标记——安全窗口就是 `state==='idle'`
 * 期间，因为 idle 时 Boss 不会主动伤害玩家（contact 伤害只在具体的冲锋/
 * 回收状态里结算），且 idle 会一直持续到 `cd` 归零才重新选招。所以只要
 * 验证「一套招式循环结束、回到 idle 时，cd 被设成了至少 0.65s」，就等于
 * 验证了这条安全窗口的存在——不需要真的模拟到冷却算完。
 *
 * 六条终点全部把 boss 逼到位（手动摆状态，和 bossPhaseTwo.test.ts 同一
 * 手法），只推一帧看落地的 cd。
 */

function bossWorld(): { world: World; boss: ReturnType<typeof spawnEnemy> } {
  const world = makeWorld();
  const boss = spawnEnemy('boss', new RngStream(1), 500, 150);
  world.enemies = [boss];
  return { world, boss };
}

function step(world: World, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) world.step(FIXED_STEP, IDLE_INPUT);
}

const MIN_SAFE_WINDOW = 0.65;

describe('Boss 输出窗口：每套招式结束后至少留 0.65s 安全时间', () => {
  it('一阶段弹幕结束后', () => {
    const { world, boss } = bossWorld();
    boss.state = 'bossBurstTel';
    boss.t = 0;
    step(world, FIXED_STEP);
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });

  it('一阶段三连冲锋结束后', () => {
    const { world, boss } = bossWorld();
    boss.state = 'bossCharge';
    boss.comboLeft = 1;
    boss.t = 0;
    boss.dir = 0;
    step(world, FIXED_STEP);
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });

  it('一阶段三段震波结束后', () => {
    const { world, boss } = bossWorld();
    boss.state = 'bossSlamTel';
    boss.t = 0;
    step(world, FIXED_STEP);
    // 三段波排在 timeline 上，推够最后一段的时间
    step(world, BOSS.slam.gap * (BOSS.slam.radii.length - 1) + FIXED_STEP);
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });

  it('二阶段弹幕回收结束后（破绽期不会被立刻打断安全窗口）', () => {
    const { world, boss } = bossWorld();
    boss.phaseTwo = true;
    boss.state = 'bossBurstTel';
    boss.t = 0;
    step(world, FIXED_STEP); // 第一圈 + 进入回收等待
    step(world, BOSS.burst.recall.delay + FIXED_STEP); // 第二圈 + 开破绽
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });

  it('二阶段冲锋回收结束后', () => {
    const { world, boss } = bossWorld();
    boss.phaseTwo = true;
    boss.state = 'bossRecallCharge';
    boss.t = 0;
    boss.dir = 0;
    step(world, FIXED_STEP);
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });

  it('二阶段震波回收结束后', () => {
    const { world, boss } = bossWorld();
    boss.phaseTwo = true;
    boss.state = 'bossSlamRecall';
    boss.t = 0;
    step(world, FIXED_STEP);
    expect(boss.state).toBe('idle');
    expect(boss.cd).toBeGreaterThanOrEqual(MIN_SAFE_WINDOW);
  });
});
