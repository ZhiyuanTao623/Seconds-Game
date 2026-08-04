import { cardsHtml } from '../ui/overlay';
import { drawUpgrades } from '../game/upgrades';
import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import type { CardSpec } from '../ui/overlay';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { Evolution, Upgrade } from '../game/upgrades';
import type { MapNode } from '../game/map';

/**
 * 战斗奖励：不花秒，因为你已经用「游戏时间」买过单了。
 * ⚠️ 挑卡期间时钟照走。
 */
export class RewardScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private options: Upgrade[];
  private evolutions: Evolution[] = [];

  constructor(private ctx: SceneContext, private node: MapNode, count: number) {
    this.options = node.kind === 'elite'
      ? []
      : drawUpgrades(ctx.run.rngFor(node.id, 'reward'), ctx.run.ownedIds, count);
    if (node.kind === 'elite') this.evolutions = ctx.run.drawEliteEvolutions(count);
  }

  enter(): void {
    if (this.options.length === 0 && this.evolutions.length === 0) { this.leave(); return; }

    const s = t().reward;
    const cards: CardSpec[] = (this.evolutions.length > 0 ? this.evolutions : this.options).map((u) => ({
      kind: this.evolutions.length > 0 ? s.eliteKind : s.kind,
      name: u.name,
      desc: u.desc,
      price: { cls: 'free', text: s.free },
    }));

    const elite = this.evolutions.length > 0;
    this.ctx.overlay.show(`
      <div class="ov-title">${elite ? s.eliteCleared : s.cleared}</div>
      <div class="ov-sub">${elite ? s.eliteBody : s.body}</div>
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
    const evolution = this.evolutions[index];
    if (evolution) {
      this.ctx.run.takeEvolution(evolution);
      this.ctx.overlay.toast(t().reward.evolved(evolution.name));
      this.leave();
      return;
    }
    const upgrade = this.options[index];
    if (!upgrade) return;
    this.ctx.run.takeUpgrade(upgrade);
    this.ctx.overlay.toast(t().reward.got(upgrade.name));
    this.leave();
  }

  private leave(): void {
    this.ctx.run.advance(this.node);
    this.ctx.toMap();
  }
}
