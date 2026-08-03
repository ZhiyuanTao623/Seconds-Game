import { cardsHtml } from '../ui/overlay';
import { drawUpgrades } from '../game/upgrades';
import type { CardSpec } from '../ui/overlay';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { Upgrade } from '../game/upgrades';
import type { MapNode } from '../game/map';

/**
 * 战斗奖励：不花秒，因为你已经用「游戏时间」买过单了。
 * ⚠️ 挑卡期间时钟照走。
 */
export class RewardScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private options: Upgrade[];

  constructor(private ctx: SceneContext, private node: MapNode, count: number) {
    this.options = drawUpgrades(
      ctx.run.rngFor(node.id, 'reward'),
      ctx.run.ownedIds,
      count,
    );
  }

  enter(): void {
    if (this.options.length === 0) { this.leave(); return; }

    const cards: CardSpec[] = this.options.map((u) => ({
      kind: '强化',
      name: u.name,
      desc: u.desc,
      price: { cls: 'free', text: '免费 · 已用战斗时间支付' },
    }));

    this.ctx.overlay.show(`
      <div class="ov-title">房 间 已 清 空</div>
      <div class="ov-sub">你用游戏时间换来了它 —— 免费拿走一个。<b style="color:#ff8a5c">时钟还在走。</b></div>
      ${cardsHtml(cards)}
    `);
    this.ctx.overlay.onCards((i) => this.pick(i));
  }

  update(_dt: number): void {
    const index = this.ctx.input.cardIndex();
    if (index !== null) this.ctx.overlay.pressCard(index);
  }

  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }

  private pick(index: number): void {
    const upgrade = this.options[index];
    if (!upgrade) return;
    this.ctx.run.takeUpgrade(upgrade);
    this.ctx.overlay.toast(`获得 ${upgrade.name}`);
    this.leave();
  }

  private leave(): void {
    this.ctx.run.advance(this.node);
    this.ctx.toMap();
  }
}
