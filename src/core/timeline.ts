/**
 * 游戏时钟上的延时队列 —— `setTimeout` 的替代品。
 *
 * 为什么必须有这个：原型里 Boss 三段震波用 `setTimeout(fn, 190)` 排期，
 * 走的是真实时间。一旦触发顿帧或开了「时停」，画面上的预警环还在慢放，
 * 判定却已经按真实时间落地了 —— 玩家看到的和被收的钱对不上。
 *
 * Timeline 只被世界的 dt 推进，所以顿帧、时停、暂停会自动地、
 * 正确地影响所有排期。房间切换时 `clear()` 一次即可，不会有回调
 * 活得比它所属的战斗更久。
 */
export interface ScheduledHandle {
  cancel(): void;
}

interface Item {
  at: number;
  fn: () => void;
  cancelled: boolean;
}

export class Timeline {
  private now = 0;
  private items: Item[] = [];

  /** `delay` 秒后（游戏时间）执行。 */
  after(delay: number, fn: () => void): ScheduledHandle {
    const item: Item = { at: this.now + Math.max(0, delay), fn, cancelled: false };
    this.items.push(item);
    return { cancel: () => { item.cancelled = true; } };
  }

  advance(dt: number): void {
    this.now += dt;
    if (this.items.length === 0) return;

    // 到期的回调可能会再排新的期，所以先摘出来再执行，
    // 新排的期最早也要等下一次 advance —— 避免同一帧内的无限递归。
    const due: Item[] = [];
    const rest: Item[] = [];
    for (const item of this.items) {
      if (item.cancelled) continue;
      (item.at <= this.now ? due : rest).push(item);
    }
    this.items = rest;

    due.sort((a, b) => a.at - b.at);
    for (const item of due) if (!item.cancelled) item.fn();
  }

  clear(): void {
    for (const item of this.items) item.cancelled = true;
    this.items = [];
  }

  get pending(): number { return this.items.length; }
  get time(): number { return this.now; }
}
