import { REWARDS } from '../game/config';
import { cardsHtml } from '../ui/overlay';
import { drawUpgrades } from '../game/upgrades';
import { formatSeconds } from '../game/pricing';
import type { CardSpec } from '../ui/overlay';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { Upgrade } from '../game/upgrades';
import type { MapNode } from '../game/map';

/**
 * 秒 · 商店。你永远买得起 —— 因为代价直接记在你的计时器上，
 * 不存在「钱不够」这回事，每一次购买都是纯粹的价值判断。
 *
 * ⚠️ 逛店期间时钟在走：这个判断还必须**快**，你不能站在货架前把账算到底。
 */
export class ShopScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private stock: (Upgrade | null)[];

  constructor(private ctx: SceneContext, private node: MapNode) {
    this.stock = drawUpgrades(
      ctx.run.rngFor(node.id, 'shop'),
      ctx.run.ownedIds,
      REWARDS.shopSlots,
    );
  }

  enter(): void { this.render_(); }

  update(_dt: number): void {
    const index = this.ctx.input.cardIndex();
    if (index !== null) this.ctx.overlay.pressCard(index);
  }

  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }

  private render_(): void {
    const { run, overlay } = this.ctx;

    const cards: CardSpec[] = this.stock.map((u) =>
      u === null
        ? { kind: '已 售 出', name: '—', desc: '', price: { cls: 'cost', text: '' }, disabled: true }
        : {
            kind: '强化',
            name: u.name,
            desc: u.desc,
            price: { cls: 'cost', text: `− ${run.shopPrice(u)}s` },
          },
    );

    overlay.show(`
      <div class="ov-title">秒 · 商 店</div>
      <div class="ov-sub">
        你永远买得起 —— 因为代价直接记在你的计时器上。<br>
        当前总计 <b style="color:#fff">${formatSeconds(run.ledger.total)}s</b> ·
        <b style="color:#ff8a5c">逛店也在计时</b>
      </div>
      ${cardsHtml(cards)}
      <div class="btn" id="leave">离 开 商 店</div>
    `);

    overlay.onCards((i) => this.buy(i));
    overlay.onClick('leave', () => this.leave());
  }

  private buy(index: number): void {
    const upgrade = this.stock[index];
    if (!upgrade) return;

    const price = this.ctx.run.shopPrice(upgrade);
    this.ctx.run.ledger.addSpend(price);
    this.ctx.run.takeUpgrade(upgrade);
    this.stock[index] = null;

    this.ctx.overlay.toast(`花费 ${price}s 购入 ${upgrade.name}`);
    this.render_();
  }

  private leave(): void {
    this.ctx.run.advance(this.node);
    this.ctx.toMap();
  }
}
