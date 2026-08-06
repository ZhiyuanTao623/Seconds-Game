import { TIMED_CHEST } from './config';

export type TimedChestState =
  | 'Inactive'
  | 'CountingDown'
  | 'Critical'
  | 'Succeeded'
  | 'Expired';

/** HUD/渲染层只需要读这些字段，不应拥有或推进宝箱状态。 */
export interface TimedChestView {
  readonly state: TimedChestState;
  readonly remaining: number;
  readonly hitFlash: number;
  readonly animationTime: number;
}

/**
 * 单个战斗房间的限时宝箱。
 *
 * 正常流逝由 CombatScene 按 World.timeScale 推进；受击扣时则由
 * World.hitPlayer 把 penaltyFor() 已经算好的实扣秒数直接送进来。
 * 两条来源刻意分开，绝不从 Ledger.total 的差值反推，避免罚时双扣。
 */
export class TimedChest implements TimedChestView {
  private _state: TimedChestState = 'Inactive';
  private _remaining: number = TIMED_CHEST.initialTime;
  private _hitFlash = 0;
  private _animationTime = 0;

  get state(): TimedChestState { return this._state; }
  get remaining(): number { return this._remaining; }
  get hitFlash(): number { return this._hitFlash; }
  get animationTime(): number { return this._animationTime; }

  activate(): void {
    if (this.state === 'Inactive') this._state = 'CountingDown';
  }

  advance(dt: number): void {
    if (dt <= 0) return;
    this._animationTime += dt;
    this._hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.isActive) this.setRemaining(this.remaining - dt);
  }

  applyPenalty(seconds: number): boolean {
    if (!this.isActive || seconds <= 0) return false;
    this._hitFlash = TIMED_CHEST.hitFlashTime;
    this.setRemaining(this.remaining - seconds);
    return true;
  }

  succeed(): boolean {
    if (!this.isActive || this.remaining <= 0) return false;
    this._state = 'Succeeded';
    this._hitFlash = 0;
    return true;
  }

  get isActive(): boolean {
    return this.state === 'CountingDown' || this.state === 'Critical';
  }

  private setRemaining(value: number): void {
    this._remaining = Math.max(0, value);
    if (this.remaining <= 0) {
      this._state = 'Expired';
    } else if (this.remaining <= TIMED_CHEST.criticalTime) {
      this._state = 'Critical';
    } else {
      this._state = 'CountingDown';
    }
  }
}
