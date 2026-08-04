import { Ledger } from '../src/game/ledger';
import { RngStream } from '../src/core/rng';
import { World } from '../src/game/world';
import { computeStats, upgradeById } from '../src/game/upgrades';
import { labelFor, penaltyFor, priceLabel } from '../src/game/pricing';
import type { PriceContext } from '../src/game/pricing';
import type { EvolutionBranch, Upgrade } from '../src/game/upgrades';
import type { ModuleId } from '../src/game/modules';
import type { UpgradeId } from '../src/i18n/i18n';

/** 造一个不需要浏览器的空房间。默认模组是飞刃 —— 大多数用例不关心具体是哪个。 */
export function makeWorld(
  upgradeIds: readonly string[] = [],
  module: ModuleId = 'blade',
  layout = 4,
  evolved: ReadonlyMap<UpgradeId, EvolutionBranch> = new Map(),
): World {
  const owned: Upgrade[] = upgradeIds.map((id) => {
    const u = upgradeById(id);
    if (!u) throw new Error(`unknown upgrade: ${id}`);
    return u;
  });
  return new World(layout, new RngStream(1234), new Ledger(), computeStats(module, owned, evolved));
}

export interface Charge {
  base: number;
  /** 实际从账本扣掉的秒数 */
  charged: number;
  /** 扣款发生那一刻的报价上下文 */
  ctx: PriceContext;
  /** 那一刻价签上应该显示的字（null = 什么都不该画） */
  label: string | null;
}

/**
 * 把 world.hitPlayer 包一层，记下每一次扣款以及扣款**发生前**那一瞬间的报价上下文。
 *
 * 这是整个测试套件的核心手法：有了它，就能对一整局模拟战斗断言
 * 「游戏收过的每一笔钱，都正好等于那一刻价签上会显示的数字」。
 */
export function recordCharges(world: World): Charge[] {
  const charges: Charge[] = [];
  const originalHit = world.hitPlayer.bind(world);
  const ledger = world.ledger;
  const originalAdd = ledger.addPenalty.bind(ledger);

  let pending: { base: number; ctx: PriceContext } | null = null;

  // 记的是**传进账本的那个数**，不是「账本前后之差」。
  // 后者会因为浮点累加丢精度：6.5 + 1.95 存成 8.449999999999999，
  // 相减得到 1.9499999999999993，在 .05 的四舍五入边界上会翻到 1.9。
  // 那是测量误差，不是游戏的报价错了。
  ledger.addPenalty = (sec: number): void => {
    originalAdd(sec);
    if (!pending) return;
    charges.push({ base: pending.base, charged: sec, ctx: pending.ctx, label: labelFor(pending.base, pending.ctx) });
    pending = null;
  };

  world.hitPlayer = (base: number, source?: { x: number; y: number }): void => {
    pending = { base, ctx: { ...world.priceContext } };
    originalHit(base, source);
    pending = null;
  };

  return charges;
}

/** 断言一次扣款和它当时的价签严丝合缝。 */
export function assertChargeMatchesLabel(c: Charge): void {
  const expected = penaltyFor(c.base, c.ctx);
  if (Math.abs(c.charged - expected) > 1e-9) {
    throw new Error(`扣款 ${c.charged} 与公式结果 ${expected} 不符`);
  }
  if (c.label !== priceLabel(c.charged)) {
    throw new Error(`价签「${c.label}」与实扣「${priceLabel(c.charged)}」对不上`);
  }
}
