import { cardsHtml } from '../ui/overlay';
import { drawShopStock, offerDesc, offerName } from '../game/rewards';
import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import type { CardSpec } from '../ui/overlay';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { ShopSlot } from '../game/rewards';
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

  private stock: ShopSlot[];

  constructor(private ctx: SceneContext, private node: MapNode) {
    this.stock = drawShopStock(ctx.run.rngFor(node.id, 'shop'), ctx.run.rewardState);
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
    const s = t().shop;

    const cards: CardSpec[] = this.stock.map((slot) => {
      if (!slot.offer) return { kind: s.sold, name: '—', desc: '', price: { cls: 'cost', text: '' }, disabled: true };
      const price = run.shopPrice(slot.offer, slot.discounted);
      return {
        kind: slot.offer.kind === 'evolution' ? t().reward.eliteKind : t().reward.kind,
        name: offerName(slot.offer),
        desc: offerDesc(slot.offer),
        price: { cls: 'cost', text: slot.discounted ? `${s.discount} − ${price}s` : `− ${price}s` },
      };
    });

    overlay.show(`
      <div class="ov-title">${s.title}</div>
      <div class="ov-sub">
        ${s.body}<br>
        ${s.total(`<b style="color:#fff">${formatSeconds(run.ledger.total)}s</b>`)}
        <b style="color:#ff8a5c">${s.clockNote}</b>
      </div>
      ${cardsHtml(cards)}
      <div class="btn" id="leave">${s.leave}</div>
    `);

    overlay.onCards((i) => this.buy(i));
    overlay.onClick('leave', () => this.leave());
  }

  private buy(index: number): void {
    const slot = this.stock[index];
    if (!slot?.offer) return;

    const price = this.ctx.run.shopPrice(slot.offer, slot.discounted);
    this.ctx.run.ledger.addSpend(price);
    this.ctx.run.takeOffer(slot.offer);
    this.stock[index] = { offer: null, discounted: false };

    this.ctx.overlay.toast(t().shop.bought(price, offerName(slot.offer)));
    this.render_();
  }

  private leave(): void {
    this.ctx.run.advance(this.node);
    this.ctx.toMap();
  }
}
