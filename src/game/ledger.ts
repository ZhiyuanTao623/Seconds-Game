import { formatSeconds } from './pricing';

/**
 * 时间账本。
 *
 * 总时间 = 游戏时间 + 受击惩罚 + 秒数消费 − 击杀返还
 *
 * 四个分项只能通过下面四个方法改动，别处一律只读。
 * 这样「我的成绩为什么是这个数」永远能追溯到具体的一次调用。
 */
export class Ledger {
  private _play = 0;
  private _penalty = 0;
  private _spend = 0;
  private _refund = 0;

  /** 时钟刚被扣了一笔（用来触发 HUD 红闪）。 */
  jolt = 0;

  get play(): number { return this._play; }
  get penalty(): number { return this._penalty; }
  get spend(): number { return this._spend; }
  get refund(): number { return this._refund; }

  get total(): number {
    return this._play + this._penalty + this._spend - this._refund;
  }

  /** 走表。哪些场景会调用它由场景自己的 countsTime 决定。 */
  tick(dt: number): void { this._play += dt; }

  addPenalty(sec: number): void { this._penalty += sec; this.jolt = 1; }
  addSpend(sec: number): void { this._spend += sec; this.jolt = 1; }
  addRefund(sec: number): void { this._refund += sec; }

  /** 时间修复站：直接抹掉一部分已累计的受击惩罚，返回抹掉了多少。 */
  mendPenalty(ratio: number): number {
    const cut = this._penalty * ratio;
    this._penalty -= cut;
    this.jolt = 1;
    return cut;
  }

  toString(): string { return `${formatSeconds(this.total)}s`; }
}
