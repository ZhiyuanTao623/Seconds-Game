import { describe, expect, it } from 'vitest';
import { FIXED_STEP, MEDIC } from '../src/game/config';
import { angleTo, dist } from '../src/core/math';
import { IDLE_INPUT } from '../src/core/input';
import { labelFor } from '../src/game/pricing';
import { spawnEnemy, threatOf } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { Run } from '../src/game/run';
import { buildRoom } from '../src/game/room';
import { makeWorld, recordCharges } from './helpers';
import type { PriceContext } from '../src/game/pricing';

/**
 * 医疗兵：全场第一个不直接威胁玩家的敌人。这里守三件事：
 *   · 它永远不挂价签、永远不扣玩家的秒（架构上就没有 hitPlayer 调用）
 *   · 治疗真的会发生，且不会顶过血量上限，且没人受伤时不空转
 *   · 走位会收敛到「盟友与玩家之间、盟友背后」，不是随便乱跟
 */

const idleCtx: PriceContext = { invulnerable: false, penMult: 1, streak: 0 };

describe('医疗兵：不挂价签、不伤害玩家', () => {
  it('threat 恒为 0，priceLabel 恒为 null', () => {
    const e = spawnEnemy('medic', new RngStream(1), 0, 0);
    expect(threatOf(e)).toBe(0);
    expect(labelFor(threatOf(e), idleCtx)).toBeNull();
  });

  it('贴脸站着不会扣玩家一秒 —— 它从不调用 hitPlayer', () => {
    const world = makeWorld();
    const medic = spawnEnemy('medic', new RngStream(1), world.player.x, world.player.y);
    world.enemies = [medic];
    const charges = recordCharges(world);

    for (let i = 0; i < 300; i++) world.step(FIXED_STEP, IDLE_INPUT);

    expect(world.ledger.penalty).toBe(0);
    expect(charges.length).toBe(0);
  });
});

describe('医疗兵：治疗', () => {
  it('预警结束后给附近受伤的盟友回血，且不超过血量上限', () => {
    const world = makeWorld();
    const rng = new RngStream(2);
    const medic = spawnEnemy('medic', rng, 500, 300);
    const ally = spawnEnemy('charger', rng, 500 + 50, 300); // 在 healRadius(140) 内
    ally.hp = ally.maxHp - 10;
    world.enemies = [medic, ally];
    medic.cd = 0; // 跳过 idle 的初始等待，下一帧立刻满足触发条件

    const steps = Math.ceil((MEDIC.telegraph + 0.2) / FIXED_STEP);
    for (let i = 0; i < steps; i++) world.step(FIXED_STEP, IDLE_INPUT);

    expect(ally.hp).toBeGreaterThan(ally.maxHp - 10);
    expect(ally.hp).toBeLessThanOrEqual(ally.maxHp);
    expect(medic.state).toBe('recover');
  });

  it('回血封顶在 maxHp，不会顶过去', () => {
    const world = makeWorld();
    const rng = new RngStream(3);
    const medic = spawnEnemy('medic', rng, 500, 300);
    const ally = spawnEnemy('charger', rng, 500 + 30, 300);
    ally.hp = ally.maxHp - 1; // 差一点点满血，MEDIC.healAmount(16) 会顶过去
    world.enemies = [medic, ally];
    medic.cd = 0;

    const steps = Math.ceil((MEDIC.telegraph + 0.2) / FIXED_STEP);
    for (let i = 0; i < steps; i++) world.step(FIXED_STEP, IDLE_INPUT);

    expect(ally.hp).toBe(ally.maxHp);
  });

  it('场上没人掉血时不触发 —— 不做无意义的空转特效', () => {
    const world = makeWorld();
    const rng = new RngStream(4);
    const medic = spawnEnemy('medic', rng, 500, 300);
    const ally = spawnEnemy('charger', rng, 500 + 50, 300); // 满血
    world.enemies = [medic, ally];
    medic.cd = 0;

    const steps = Math.ceil(3 / FIXED_STEP); // 远超一次治疗周期的时长
    for (let i = 0; i < steps; i++) world.step(FIXED_STEP, IDLE_INPUT);

    expect(medic.state).toBe('idle');
    expect(world.fx.items.length).toBe(0);
    expect(world.fx.floats.length).toBe(0);
  });
});

describe('医疗兵：走位', () => {
  it('会收敛到「盟友与玩家之间、盟友背后」，而不是贴着盟友', () => {
    const world = makeWorld();
    const rng = new RngStream(5);
    const ally = spawnEnemy('charger', rng, 500, 400); // 玩家在 (500,530)，盟友在其上方
    const medic = spawnEnemy('medic', rng, 700, 250); // 起点随便找个远处
    world.enemies = [ally, medic];

    const allyStart = { x: ally.x, y: ally.y };
    const steps = Math.ceil(2 / FIXED_STEP);
    for (let i = 0; i < steps; i++) {
      world.step(FIXED_STEP, IDLE_INPUT);
      // 盟友自己的 AI 也会走位；这里只想单独验证医疗兵的跟随逻辑，
      // 所以每帧把盟友摁回原位，相当于给它一个静止的锚点。
      ally.x = allyStart.x;
      ally.y = allyStart.y;
    }

    expect(dist(medic, world.player), '医疗兵应该比盟友离玩家更远——躲在背后')
      .toBeGreaterThan(dist(ally, world.player));

    const away = angleTo(ally, world.player) + Math.PI;
    const expected = {
      x: ally.x + Math.cos(away) * MEDIC.followDistance,
      y: ally.y + Math.sin(away) * MEDIC.followDistance,
    };
    expect(dist(medic, expected), '应该收敛到目标站位附近').toBeLessThan(MEDIC.approachStop + 5);
  });

  it('没有可跟随的盟友时原地待命，不会乱跑向玩家', () => {
    const world = makeWorld();
    const medic = spawnEnemy('medic', new RngStream(6), 700, 250);
    world.enemies = [medic];
    const start = { x: medic.x, y: medic.y };

    for (let i = 0; i < 120; i++) world.step(FIXED_STEP, IDLE_INPUT);

    expect(dist(medic, start)).toBeLessThan(1);
  });
});

describe('医疗兵：房间生成', () => {
  const seeds = [1, 7, 42, 1234, 20260802];

  it('floor >= 2 的战斗房带医疗兵，floor 1 的战斗房不带', () => {
    for (const seed of seeds) {
      const run = new Run(seed, 'blade');
      for (const node of run.map.nodes.values()) {
        if (node.kind !== 'combat') continue;
        const world = buildRoom(run, node);
        const hasMedic = world.enemies.some((e) => e.kind === 'medic');
        if (node.floor >= 2) {
          expect(hasMedic, `${node.id} (floor ${node.floor}) 应该带医疗兵`).toBe(true);
        } else {
          expect(hasMedic, `${node.id} (floor ${node.floor}) 不该带医疗兵`).toBe(false);
        }
      }
    }
  });

  it('精英房永远带至少一个医疗兵', () => {
    for (const seed of seeds) {
      const run = new Run(seed, 'blade');
      for (const node of run.map.nodes.values()) {
        if (node.kind !== 'elite') continue;
        const world = buildRoom(run, node);
        expect(world.enemies.some((e) => e.kind === 'medic'), `${node.id} 精英房应该带医疗兵`).toBe(true);
      }
    }
  });

  it('Boss 房不带医疗兵（Boss 房只有 Boss 自己）', () => {
    const run = new Run(1, 'blade');
    const bossNode = run.map.nodes.get(run.map.bossId)!;
    const world = buildRoom(run, bossNode);
    expect(world.enemies.map((e) => e.kind)).toEqual(['boss']);
  });
});
