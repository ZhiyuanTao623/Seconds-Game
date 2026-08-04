import type { Renderer } from '../render/renderer';
import type { Input } from '../core/input';
import type { Overlay } from '../ui/overlay';
import type { Run } from '../game/run';
import type { Player } from '../game/player';

/**
 * 场景之间不互相 import —— 全部通过这几个跳转方法走 App，
 * 否则 地图↔战斗↔奖励 之间会绕成一个循环依赖。
 */
export interface SceneContext {
  readonly input: Input;
  readonly overlay: Overlay;
  readonly run: Run;
  go(next: Scene): void;
  toMap(): void;
  toResult(): void;
  startRun(seed: number): void;
  toTitle(): void;
}

export interface Scene {
  /**
   * 这个界面走不走表。
   *
   * 地图、奖励、商店全部为 true —— 让「思考」本身也有价格。
   * 原型里站在地图界面可以无限盘算，时间压迫感在最需要它的地方消失了。
   */
  readonly countsTime: boolean;
  /**
   * 走表速度（省略 = 1 全额走表）。
   *
   * 规则：玩家能够操作或作决定时，时间才计入成绩。
   * 纯动画（房间清空后的过场）返回 0；顿帧期间返回世界速度。
   */
  readonly timeScale?: number;
  /** 能不能按 ESC 暂停（标题页和结算页不需要） */
  readonly pausable: boolean;
  /** HUD 要读的玩家（只有战斗场景有） */
  readonly player?: Player | null;

  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(r: Renderer): void;
}
