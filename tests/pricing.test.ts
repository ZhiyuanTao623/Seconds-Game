import { describe, expect, it } from 'vitest';
import { BOSS, ENEMY } from '../src/game/config';
import { labelFor, priceLabel } from '../src/game/pricing';
import { spawnEnemy, threatOf } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { makeWorld } from './helpers';
import type { World } from '../src/game/world';

/**
 * 这个游戏唯一不能坏的不变式：
 *
 *     屏幕上显示的秒数 === 玩家实际被扣的秒数
 *
 * 每个用例都先读一次「此刻价签上会显示什么」，再真的挨一下，
 * 然后比对账本差额。两者必须逐字相同。
 */

const rng = new RngStream(7);

/** 读价签：走的是渲染层调用的同一个函数。 */
const readLabel = (w: World, base: number): string | null => labelFor(base, w.priceContext);

/** 真的挨一下，返回账本上的差额。 */
function charge(w: World, base: number): number {
  const before = w.ledger.penalty;
  w.hitPlayer(base);
  return w.ledger.penalty - before;
}

/** 一个完整的断言：先读签，再挨打，两边必须一致。 */
function expectMatch(w: World, base: number, note: string): void {
  const label = readLabel(w, base);
  const charged = charge(w, base);
  expect(label, note).toBe(priceLabel(charged));
}

describe('报价 === 实扣', () => {
  it('基础敌人无强化', () => {
    for (const kind of ['charger', 'shooter', 'brute'] as const) {
      const w = makeWorld();
      const e = spawnEnemy(kind, rng, 500, 300);
      expectMatch(w, threatOf(e), kind);
    }
  });

  it('penMult 强化会同时影响价签和实扣', () => {
    const withBlade = makeWorld(['blade']); // penMult ×1.4
    const charger = spawnEnemy('charger', rng, 500, 300);
    expectMatch(withBlade, threatOf(charger), '利刃');
    expect(withBlade.ledger.penalty).toBeCloseTo(2.0 * 1.4, 9);

    const withTough = makeWorld(['tough']); // penMult ×0.65
    const brute = spawnEnemy('brute', rng, 500, 300);
    expectMatch(withTough, threatOf(brute), '韧体');
    expect(withTough.ledger.penalty).toBeCloseTo(4.0 * 0.65, 9);
  });

  it('连击税逐次累进，价签同步涨价', () => {
    const w = makeWorld();
    const e = spawnEnemy('charger', rng, 500, 300);
    const expected = [2.0, 2.6, 3.38, 4.394];

    for (let i = 0; i < expected.length; i++) {
      w.player.inv = 0; // 模拟无敌已过
      const before = w.ledger.penalty;
      expectMatch(w, threatOf(e), `第 ${i + 1} 下`);
      expect(w.ledger.penalty - before).toBeCloseTo(expected[i]!, 9);
    }
  });

  it('无敌期间：价签一个字都不画，账本一秒都不扣', () => {
    for (const setup of [
      (w: World) => { w.player.inv = 0.3; },
      (w: World) => { w.player.dashT = 0.1; },
    ]) {
      const w = makeWorld();
      setup(w);
      const e = spawnEnemy('charger', rng, 500, 300);

      expect(readLabel(w, threatOf(e))).toBeNull();
      expect(charge(w, threatOf(e))).toBe(0);
      expect(w.ledger.penalty).toBe(0);
    }
  });

  it('Boss 分招式报价', () => {
    const cases: { state: string; threat: number; expected: number; note: string }[] = [
      { state: 'bossSlamTel', threat: 0, expected: BOSS.slam.pen, note: '震波预警' },
      { state: 'bossBurstTel', threat: 0, expected: BOSS.burst.pen, note: '弹幕预警' },
      { state: 'bossCharge', threat: 0, expected: BOSS.contactPen, note: '冲锋接触' },
      // 关键回归：震波已放出、状态已回 idle，报价不能跳回接触价 5.0
      { state: 'idle', threat: BOSS.slam.pen, expected: BOSS.slam.pen, note: '震波飞行中' },
    ];

    for (const c of cases) {
      const w = makeWorld();
      const e = spawnEnemy('boss', rng, 500, 150);
      e.state = c.state as typeof e.state;
      e.threat = c.threat;

      expect(threatOf(e), c.note).toBe(c.expected);
      expectMatch(w, threatOf(e), c.note);
      expect(w.ledger.penalty, c.note).toBeCloseTo(c.expected, 9);
    }
  });

  it('子弹的价签和实扣也共用同一条公式', () => {
    const plain = makeWorld();
    expectMatch(plain, ENEMY.shooter.pen, '射手弹');

    const w = makeWorld(['blade']);
    w.player.inv = 0;
    expectMatch(w, BOSS.burst.pen, 'Boss 弹 · 利刃');
    w.player.inv = 0;
    expectMatch(w, BOSS.burst.pen, 'Boss 弹 · 利刃 + 连击税');
    // 1 层税：2.5 × 1.4 × 1.3
    expect(w.ledger.penalty).toBeCloseTo(2.5 * 1.4 + 2.5 * 1.4 * 1.3, 9);
  });
});

describe('报价格式化', () => {
  it('0 或负数不画任何字', () => {
    expect(priceLabel(0)).toBeNull();
    expect(priceLabel(-1)).toBeNull();
  });

  it('总是一位小数，和飘字逐字一致', () => {
    expect(priceLabel(2)).toBe('+2.0s');
    expect(priceLabel(3.38)).toBe('+3.4s');
  });
});
