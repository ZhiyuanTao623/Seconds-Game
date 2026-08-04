import { describe, expect, it } from 'vitest';
import { BOSS, FIXED_STEP } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { makeWorld } from './helpers';
import type { InputSource } from '../src/core/input';

const idleInput: InputSource = {
  pointer: { x: 500, y: 520 },
  isDown: () => false,
  wasPressed: () => false,
  isMouseDown: () => false,
  wasMousePressed: () => false,
  wasMouseReleased: () => false,
};

function step(world: ReturnType<typeof makeWorld>, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / FIXED_STEP); i++) world.step(FIXED_STEP, idleInput);
}

function bossWorld() {
  const world = makeWorld();
  const enemy = spawnEnemy('boss', new RngStream(5), 500, 150);
  world.enemies = [enemy];
  return { world, enemy };
}

describe('Boss 二阶段：回收', () => {
  it('半血后的当前招式结束后才转阶段', () => {
    const { world, enemy } = bossWorld();
    enemy.hp = enemy.maxHp * BOSS.phaseTwo.threshold;
    enemy.state = 'bossCharge';
    enemy.t = 1;
    step(world, FIXED_STEP);
    expect(enemy.phaseTwo).toBe(false);

    enemy.state = 'idle';
    step(world, FIXED_STEP);
    expect(enemy.state).toBe('bossPhaseShift');
    step(world, BOSS.phaseTwo.shiftTime + FIXED_STEP);
    expect(enemy.phaseTwo).toBe(true);
  });

  it('回收后的破绽使 Boss 受到 150% 伤害', () => {
    const { world, enemy } = bossWorld();
    enemy.vulnerable = 1;
    world.damageEnemy(enemy, 10);
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - 10 * BOSS.phaseTwo.weakPointDamageMult, 9);
  });

  it('二阶段弹幕使用两圈带缺口的 10 发弹幕，并在结束后打开破绽', () => {
    const { world, enemy } = bossWorld();
    enemy.phaseTwo = true;
    enemy.state = 'bossBurstTel';
    enemy.t = 0;

    step(world, FIXED_STEP);
    expect(world.bullets).toHaveLength(BOSS.burst.recall.count);
    expect(enemy.state).toBe('bossBurstRecall');

    step(world, BOSS.burst.recall.delay + FIXED_STEP);
    expect(world.bullets).toHaveLength(BOSS.burst.recall.count * 2);
    expect(enemy.vulnerable).toBeGreaterThan(0);
  });

  it('二阶段震波回收只会排定一组由外向内的三段波', () => {
    const { world, enemy } = bossWorld();
    enemy.phaseTwo = true;
    enemy.state = 'bossSlamTel';
    enemy.t = 0;

    step(world, BOSS.slam.recallTelegraph + 0.45);
    expect(enemy.state).toBe('bossSlamRecall');
    expect(world.timeline.pending).toBeGreaterThan(0);
    expect(world.timeline.pending).toBeLessThanOrEqual(3);

    step(world, FIXED_STEP * 4);
    expect(world.timeline.pending).toBeLessThanOrEqual(3);
  });
});
