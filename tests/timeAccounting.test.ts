import { describe, expect, it } from 'vitest';
import { FEEL, FIXED_STEP, HIT } from '../src/game/config';
import { Run } from '../src/game/run';
import { CombatScene } from '../src/scenes/combat';
import { makeWorld } from './helpers';
import type { SceneContext } from '../src/scenes/scene';
import type { World } from '../src/game/world';

/**
 * 走表规则：玩家能够操作或作决定时，时间才计入成绩。
 *
 * 两条硬性规则钉在这里：
 *   1. 房间清空后的过场是纯动画 —— timeScale = 0，一秒都不计
 *   2. 顿帧期间世界近乎停住 —— timeScale = hitstopScale，账本按世界速度打折
 *
 * 注意反例也在守：受击僵直玩家同样不能操作，但那是惩罚本身，不停表；
 * 「时停」只放慢敌人、玩家照常操作，也不影响 timeScale。
 */

const nullInput = {
  pointer: { x: 500, y: 300 },
  isDown: () => false,
  wasPressed: () => false,
  isMouseDown: () => false,
  wasMousePressed: () => false,
  wasMouseReleased: () => false,
};

function makeCombatScene(): { scene: CombatScene; world: World } {
  const run = new Run(42);
  const node = run.map.byFloor[0]![0]!;
  const ctx = {
    input: nullInput,
    overlay: { hide(): void {}, toast(): void {} },
    run,
    go(): void {},
    toMap(): void {},
    toResult(): void {},
    startRun(): void {},
    toTitle(): void {},
  } as unknown as SceneContext;
  const scene = new CombatScene(ctx, node);
  // world 是 private，但测试就是要断言它和场景走表之间的关系
  const world = (scene as unknown as { world: World }).world;
  return { scene, world };
}

describe('World.timeScale —— 顿帧期间世界走多快', () => {
  it('平时为 1，顿帧期间等于 hitstopScale，结束后回到 1', () => {
    const world = makeWorld();
    world.step(FIXED_STEP, nullInput);
    expect(world.timeScale).toBe(1);

    world.addHitstop(HIT.hitstop);
    world.step(FIXED_STEP, nullInput);
    expect(world.timeScale).toBe(FEEL.hitstopScale);

    // 0.07s = 8.4 个逻辑步，走 16 步一定过了
    for (let i = 0; i < 16; i++) world.step(FIXED_STEP, nullInput);
    expect(world.timeScale).toBe(1);
  });

  it('受击僵直不影响 timeScale —— 僵直是惩罚，世界照常全速', () => {
    const world = makeWorld();
    world.player.inv = 0;
    world.hitPlayer(2);
    expect(world.player.hitstunTotal).toBeGreaterThan(0);
    // hitPlayer 自己触发顿帧，先把顿帧走完再断言
    for (let i = 0; i < 16; i++) world.step(FIXED_STEP, nullInput);
    expect(world.player.hitstun).toBeGreaterThan(0);
    expect(world.timeScale).toBe(1);
  });
});

describe('CombatScene.timeScale —— 场景给账本的开价', () => {
  it('战斗进行中跟随世界速度', () => {
    const { scene, world } = makeCombatScene();
    scene.update(FIXED_STEP);
    expect(scene.timeScale).toBe(1);

    world.addHitstop(HIT.hitstop);
    scene.update(FIXED_STEP);
    expect(scene.timeScale).toBe(FEEL.hitstopScale);
  });

  it('房间清空后的过场停表，整场过场期间都是 0', () => {
    const { scene, world } = makeCombatScene();
    scene.update(FIXED_STEP);
    expect(scene.timeScale).toBe(1);

    world.enemies = []; // 房间清空
    scene.update(FIXED_STEP);
    expect(scene.timeScale).toBe(0);

    // 过场 0.45s = 54 步，期间任意时刻都不许走表
    for (let i = 0; i < 50; i++) {
      scene.update(FIXED_STEP);
      expect(scene.timeScale).toBe(0);
    }
  });
});
