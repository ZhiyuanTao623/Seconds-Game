import { cardsHtml } from '../ui/overlay';
import { drawCombatReward, drawEliteReward, offerDesc, offerName } from '../game/rewards';
import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import type { CardSpec } from '../ui/overlay';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { Offer } from '../game/rewards';
import type { MapNode } from '../game/map';

/**
 * 战斗/精英奖励：不花秒，因为你已经用「游戏时间」买过单了。
 * ⚠️ 挑卡期间时钟照走。
 */
export class RewardScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private options: Offer[];
  private readonly elite: boolean;

  constructor(private ctx: SceneContext, private node: MapNode) {
    this.elite = node.kind === 'elite';
    const rng = ctx.run.rngFor(node.id, 'reward');
    this.options = this.elite
      ? drawEliteReward(rng, ctx.run.rewardState)
      : drawCombatReward(rng, ctx.run.rewardState);
  }

  enter(): void {
    if (this.options.length === 0) { this.leave(); return; }

    const s = t().reward;
    const cards: CardSpec[] = this.options.map((o) => ({
      kind: o.kind === 'evolution' ? s.eliteKind : s.kind,
      name: offerName(o),
      desc: offerDesc(o),
      price: { cls: 'free', text: s.free },
    }));

    this.ctx.overlay.show(`
      <div class="ov-title">${this.elite ? s.eliteCleared : s.cleared}</div>
      <div class="ov-sub">${this.elite ? s.eliteBody : s.body}</div>
      <div class="reward-total">
        <span>${s.total}</span><strong id="rewardTotal">${formatSeconds(this.ctx.run.ledger.total)}s</strong>
        <small>${s.clockNote}</small>
      </div>
      ${cardsHtml(cards)}
    `);
    this.ctx.overlay.onCards((i) => this.pick(i));
  }

  update(_dt: number): void {
    const total = document.getElementById('rewardTotal');
    if (total) total.textContent = `${formatSeconds(this.ctx.run.ledger.total)}s`;
    const index = this.ctx.input.cardIndex();
    if (index !== null) this.ctx.overlay.pressCard(index);
  }

  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }

  private pick(index: number): void {
    const offer = this.options[index];
    if (!offer) return;
    this.ctx.run.takeOffer(offer);
    this.ctx.overlay.toast(offer.kind === 'evolution' ? t().reward.evolved(offerName(offer)) : t().reward.got(offerName(offer)));
    this.leave();
  }

  private leave(): void {
    this.ctx.run.advance(this.node);
    this.ctx.toMap();
  }
}
