import { describe, expect, it } from 'vitest';
import { RngStream } from '../src/core/rng';
import { Run } from '../src/game/run';
import { drawCombatReward, drawEliteReward, offerId } from '../src/game/rewards';
import { computeStats, evolutionsFor, isEvolved, upgradeById } from '../src/game/upgrades';
import type { RewardState } from '../src/game/rewards';

const owned = (...ids: string[]) => ids.map((id) => {
  const upgrade = upgradeById(id);
  if (!upgrade) throw new Error(`unknown upgrade: ${id}`);
  return upgrade;
});

const stateFor = (ids: string[]): RewardState => ({
  module: 'blade',
  owned: owned(...ids),
  ownedIds: new Set(ids.map((id) => upgradeById(id)!.id)),
  evolved: new Map(),
});

describe('强化只有两个阶段：基础 → 进化', () => {
  it('选中一条分支后，这个强化完成进化，两条分支都不再出现在池子里', () => {
    const run = new Run(88, 'blade');
    for (const upgrade of owned('un_gale', 'un_blade', 'un_tough')) run.takeUpgrade(upgrade);

    expect(isEvolved(run.evolved, 'un_gale')).toBe(false);
    run.takeEvolution(evolutionsFor('un_gale')[0]!);
    expect(isEvolved(run.evolved, 'un_gale')).toBe(true);

    // 精英奖励的可进化池不会再抽到 un_gale —— 它已经完成进化了
    for (let seed = 0; seed < 20; seed++) {
      const offers = drawEliteReward(new RngStream(seed), run.rewardState);
      const evolutionIds = offers.filter((o) => o.kind === 'evolution').map(offerId);
      expect(evolutionIds).not.toContain('un_gale');
    }
  });

  it('未进化的强化在多次抽取里，两条分支都可能出现 —— 分支保留直到被选中', () => {
    const state = stateFor(['un_gale']);
    const seenBranches = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const offers = drawEliteReward(new RngStream(seed), state);
      for (const o of offers) if (o.kind === 'evolution') seenBranches.add(o.evolution.branch);
    }
    expect(seenBranches).toEqual(new Set(['a', 'b']));
  });

  it('精英奖励同一张卡不会给同一个强化的两条分支', () => {
    const state = stateFor(['un_gale', 'un_blade', 'un_tough', 'un_abacus']);
    for (let seed = 0; seed < 40; seed++) {
      const offers = drawEliteReward(new RngStream(seed), state);
      const evoIds = offers.filter((o) => o.kind === 'evolution').map(offerId);
      expect(new Set(evoIds).size).toBe(evoIds.length);
    }
  });

  it('战斗房 35% 概率把一个基础位换成进化，且候选来自已拥有的强化', () => {
    const state = stateFor(['un_gale']);
    let sawEvolution = false;
    for (let seed = 0; seed < 200 && !sawEvolution; seed++) {
      const offers = drawCombatReward(new RngStream(seed), state);
      if (offers.some((o) => o.kind === 'evolution')) sawEvolution = true;
    }
    expect(sawEvolution, '跑了 200 个 seed 一次进化替换都没出现，35% 概率不该这么小概率').toBe(true);
  });
});

describe('强化数值：模组基础 → 强化 → 进化', () => {
  it('un_blade 基础 + 进化 A（孤注）叠出 DESIGN.md 里写的总倍率', () => {
    const [blade] = owned('un_blade');
    const evolved = new Map([['un_blade', 'a']] as const);
    const stats = computeStats('blade', [blade!], evolved);
    expect(stats.dmg).toBeCloseTo(12 * 1.52, 9);
    expect(stats.penMult).toBeCloseTo(1.40, 9);
  });

  it('un_tough 进化 B（适应）只改连击税窗口，不再改 penMult', () => {
    const [tough] = owned('un_tough');
    const evolved = new Map([['un_tough', 'b']] as const);
    const stats = computeStats('blade', [tough!], evolved);
    expect(stats.penMult).toBeCloseTo(0.78, 9);
    expect(stats.taxWindow).toBeCloseTo(3.2, 9);
  });

  it('un_abacus 进化 B（高额结算）按敌人种类给不同返还，外加精英房清空奖励', () => {
    const [abacus] = owned('un_abacus');
    const evolved = new Map([['un_abacus', 'b']] as const);
    const stats = computeStats('blade', [abacus!], evolved);
    expect(stats.refundNormal).toBeCloseTo(0.25, 9);
    expect(stats.refundElite).toBeCloseTo(0.75, 9);
    expect(stats.refundEliteClear).toBeCloseTo(1.0, 9);
  });

  it('模组基础能力在没有任何强化时就生效', () => {
    const bladeStats = computeStats('blade', []);
    expect(bladeStats.projectile).toBe(true);
    expect(bladeStats.projectileDamageMult).toBeGreaterThan(0);

    const dashStats = computeStats('dash', []);
    expect(dashStats.dashDamage).toBeGreaterThan(0);

    const chargeStats = computeStats('charge', []);
    expect(chargeStats.chargedSlash).toBe(true);
    expect(chargeStats.chargeTime).toBeGreaterThan(0);
  });
});
