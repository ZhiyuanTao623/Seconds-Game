import { cardsHtml } from '../ui/overlay';
import { MODULE_IDS } from '../game/modules';
import { t } from '../i18n/i18n';
import type { CardSpec } from '../ui/overlay';
import type { ModuleId } from '../game/modules';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';

/**
 * 开局三选一：飞刃 / 掠影 / 蓄势。选完不可更改。
 * 不计时 —— 这是准备阶段，真正的竞速从进第一层才开始。
 */
export class ModuleSelectScene implements Scene {
  readonly countsTime = false;
  readonly pausable = false;

  constructor(private ctx: SceneContext, private seed: number) {}

  enter(): void {
    const s = t().moduleSelect;
    const cards: CardSpec[] = MODULE_IDS.map((id) => ({
      kind: s.kind,
      name: t().modules[id].name,
      desc: t().modules[id].desc,
      price: { cls: 'free', text: s.pick },
    }));

    this.ctx.overlay.show(`
      <div class="ov-title">${s.title}</div>
      <div class="ov-sub">${s.body}</div>
      ${cardsHtml(cards)}
    `);
    this.ctx.overlay.onCards((i) => this.pick(MODULE_IDS[i]));
  }

  update(_dt: number): void {
    const index = this.ctx.input.cardIndex();
    if (index !== null) this.ctx.overlay.pressCard(index);
  }

  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }

  private pick(module: ModuleId | undefined): void {
    if (!module) return;
    this.ctx.startRun(this.seed, module);
  }
}
