import { FEEL } from '../game/config';
import { buildRoom } from '../game/room';
import { drawWorld } from '../render/drawWorld';
import { t } from '../i18n/i18n';
import { RewardScene } from './reward';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { Player } from '../game/player';
import type { World } from '../game/world';
import type { MapNode } from '../game/map';
import type { TimedChestView } from '../game/timedChest';

export class CombatScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private world: World;
  /** 清空后到结算界面的过场倒计时；-1 = 还没清空 */
  private clearTimer = -1;
  /** 震屏抖动用的随机源。纯表现，不影响任何判定，所以不进 seed 流。 */
  private shakeRng: () => number;

  constructor(private ctx: SceneContext, private node: MapNode) {
    this.world = buildRoom(ctx.run, node);
    const rng = ctx.run.rngFor(node.id, 'shake');
    this.shakeRng = () => rng.float();
    if (node.kind === 'boss') ctx.overlay.toast(t().combat.finalFloor);
  }

  get player(): Player { return this.world.player; }
  get timedChest(): TimedChestView | null { return this.world.timedChest; }

  /**
   * 过场（纯动画，玩家已无事可做）停表；
   * 战斗进行中顿帧时按世界速度打折 —— 世界停住的那一瞬不算玩家的成绩。
   */
  get timeScale(): number {
    return this.clearTimer >= 0 ? 0 : this.world.timeScale;
  }

  // enter 会在暂停恢复时被再调用一次，所以这里只能放幂等的操作
  enter(): void {
    this.ctx.overlay.hide();
    this.world.timedChest?.activate();
  }

  update(dt: number): void {
    this.world.step(dt, this.ctx.input);

    if (this.clearTimer < 0) {
      if (this.world.cleared) {
        this.world.resolveTimedChestClear();
        this.clearTimer = FEEL.roomClearDelay;
        // 高额结算（精算 B 分支）：精英房清空时一次性额外返还，只在这一刻结算一次
        if (this.node.kind === 'elite' && this.world.stats.refundEliteClear > 0) {
          this.ctx.run.ledger.addRefund(this.world.stats.refundEliteClear);
        }
      } else {
        // 和本步最终记入 Ledger.play 的口径一致：只有仍在战斗中的步骤才走表，
        // 顿帧期间按 World.timeScale 同比例放慢。
        this.world.advanceTimedChest(dt * this.world.timeScale);
      }
      return;
    }

    // 过场是纯动画：世界照演（尸体落地、特效散场），但表已经停了（timeScale = 0）
    this.clearTimer -= dt;
    if (this.clearTimer <= 0) this.finish();
  }

  render(r: Renderer): void {
    r.shake(this.world.shake, this.shakeRng);
    drawWorld(r, this.world);
    r.resetTransform();
  }

  exit(): void {
    // 房间一走，所有排期作废 —— 不会有回调活得比它所属的战斗更久
    this.world.timeline.clear();
    this.ctx.run.mergeDamageByTag(this.world.damageByTag);
  }

  private finish(): void {
    const { run } = this.ctx;

    if (this.node.kind === 'boss') {
      run.won = true;
      this.ctx.toResult();
      return;
    }

    this.ctx.go(new RewardScene(this.ctx, this.node, this.world.timedChest?.state === 'Succeeded'));
  }
}
