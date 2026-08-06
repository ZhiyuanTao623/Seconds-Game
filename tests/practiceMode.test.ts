import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/game/config';
import { Run } from '../src/game/run';
import { CombatScene } from '../src/scenes/combat';
import { MapScene } from '../src/scenes/mapScene';
import { RewardScene } from '../src/scenes/reward';
import { ShopScene } from '../src/scenes/shop';
import type { SceneContext } from '../src/scenes/scene';
import type { World } from '../src/game/world';

/**
 * 练习模式：决策界面停表，战斗照常计时。
 *
 * 走表的唯一开关是 `Scene.timeScale`（App 主循环按它缩放 `ledger.tick`），
 * 所以这里直接断言三个决策场景的报价，而不是绕一整个 App。
 * 端到端的那一份在 `boot.test.ts` 的「练习模式」里。
 */

const nullInput = {
  pointer: { x: 500, y: 300 },
  isDown: () => false,
  wasPressed: () => false,
  isMouseDown: () => false,
  wasMousePressed: () => false,
  wasMouseReleased: () => false,
  cardIndex: () => null,
};

function makeCtx(run: Run): SceneContext {
  return {
    input: nullInput,
    overlay: { hide(): void {}, toast(): void {}, show(): void {}, onCards(): void {}, onClick(): void {}, pressCard(): void {} },
    run,
    go(): void {},
    toMap(): void {},
    toResult(): void {},
    toModeSelect(): void {},
    toModuleSelect(): void {},
    startRun(): void {},
    toTitle(): void {},
  } as unknown as SceneContext;
}

/** 商店节点在地图上不一定挨着入口，直接从整张图里捞一个。 */
function shopNode(run: Run) {
  return [...run.map.nodes.values()].find((n) => n.kind === 'shop')!;
}

describe('决策界面的走表开关', () => {
  it('竞速模式：地图/奖励/商店全额走表', () => {
    const run = new Run(42, 'blade', 'speedrun');
    const node = run.map.byFloor[0]![0]!;

    expect(new MapScene(makeCtx(run)).timeScale).toBe(1);
    expect(new RewardScene(makeCtx(run), node).timeScale).toBe(1);
    expect(new ShopScene(makeCtx(run), shopNode(run)).timeScale).toBe(1);
  });

  it('练习模式：地图/奖励/商店全部停表', () => {
    const run = new Run(42, 'blade', 'practice');
    const node = run.map.byFloor[0]![0]!;

    expect(new MapScene(makeCtx(run)).timeScale).toBe(0);
    expect(new RewardScene(makeCtx(run), node).timeScale).toBe(0);
    expect(new ShopScene(makeCtx(run), shopNode(run)).timeScale).toBe(0);
  });

  it('三个决策场景的 countsTime 仍然是 true —— 停表靠 timeScale，不是关掉整条通道', () => {
    const run = new Run(42, 'blade', 'practice');
    const node = run.map.byFloor[0]![0]!;

    expect(new MapScene(makeCtx(run)).countsTime).toBe(true);
    expect(new RewardScene(makeCtx(run), node).countsTime).toBe(true);
    expect(new ShopScene(makeCtx(run), shopNode(run)).countsTime).toBe(true);
  });
});

describe('战斗不受模式影响', () => {
  it('练习模式下战斗照常计时，清空后的过场照常停表', () => {
    const run = new Run(42, 'blade', 'practice');
    const node = run.map.byFloor[0]![0]!;
    const scene = new CombatScene(makeCtx(run), node);
    const world = (scene as unknown as { world: World }).world;

    scene.update(FIXED_STEP);
    expect(scene.timeScale, '练习模式的战斗仍然要计时').toBe(1);

    world.enemies = [];
    scene.update(FIXED_STEP);
    expect(scene.timeScale, '过场是纯动画，两种模式都停表').toBe(0);
  });
});

describe('模式不进入 seed', () => {
  it('同一个 seed 在两种模式下生成同一张地图', () => {
    const speed = new Run(20260806, 'charge', 'speedrun');
    const practice = new Run(20260806, 'charge', 'practice');

    const fingerprint = (run: Run): string =>
      [...run.map.nodes.values()].map((n) => `${n.id}:${n.kind}:${n.floor}:${n.col}`).join('|');

    expect(fingerprint(practice)).toBe(fingerprint(speed));
    expect(practice.map.bossId).toBe(speed.map.bossId);
  });

  it('缺省是竞速模式 —— 旧的两参数构造保持原行为', () => {
    expect(new Run(1, 'blade').mode).toBe('speedrun');
  });
});
