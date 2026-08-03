import { HIT } from './config';

/**
 * ===== 报价单一真相源 =====
 *
 * 这个游戏唯一不能坏的不变式：
 *
 *     屏幕上显示的秒数 === 玩家实际被扣的秒数
 *
 * 屏幕上任何一个 "+X.Xs" 和账本上任何一次扣款，都必须经过这里的
 * `penaltyFor()`，并用这里的 `formatSeconds()` 转成字符串。
 * 不许在别处重算，不许在别处四舍五入。
 *
 * 这条不变式由 tests/pricing.test.ts 守着。
 */

/** 玩家此刻的报价上下文。渲染和结算读的是同一个对象。 */
export interface PriceContext {
  /** 受击无敌 or 冲刺无敌 */
  invulnerable: boolean;
  penMult: number;
  streak: number;
}

/** 连击税：每多挨一次，价码 ×1.3。 */
export const comboTax = (streak: number): number => Math.pow(HIT.taxStep, streak);

/**
 * 底价 → 此刻的实际扣秒。
 * 无敌期间返回 0，这时候全场真的不要钱，价签也必须跟着消失。
 */
export function penaltyFor(base: number, ctx: PriceContext): number {
  if (ctx.invulnerable) return 0;
  return base * ctx.penMult * comboTax(ctx.streak);
}

/** 全局唯一的秒数格式化。飘字、价签、HUD、结算页共用。 */
export const formatSeconds = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/**
 * 价签文字。返回 null 表示「这一刻不要钱，一个字都不画」。
 *
 * 原型里无敌时会显示绿色的「免费」，但无敌只有 0.17–0.40 秒，
 * 绿字一闪而过反而在最需要读屏的瞬间制造噪音。
 * 价签消失本身就是最清晰的「现在不要钱」信号 —— 场上安静下来了。
 */
export function priceLabel(sec: number): string | null {
  return sec <= 0 ? null : `+${formatSeconds(sec)}s`;
}

/**
 * 底价 → 屏幕上那行字。渲染层和测试都只走这一个函数，
 * 这样「显示的字」和「扣的钱」之间不可能出现第二条路径。
 */
export function labelFor(base: number, ctx: PriceContext): string | null {
  return priceLabel(penaltyFor(base, ctx));
}
