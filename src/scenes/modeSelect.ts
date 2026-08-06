import { cardsHtml } from '../ui/overlay';
import { GAME_MODES } from '../game/mode';
import { t } from '../i18n/i18n';
import type { CardSpec } from '../ui/overlay';
import type { GameMode } from '../game/mode';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';

/**
 * 开局二选一：竞速 / 练习。模式是每局的选择，不进入 seed。
 * 不计时 —— 和模组选择页一样，这里还没开局。
 */
export class ModeSelectScene implements Scene {
  readonly countsTime = false;
  readonly pausable = false;

  constructor(private ctx: SceneContext, private seed: number) {}

  enter(): void {
    const s = t().modeSelect;
    const cards: CardSpec[] = GAME_MODES.map((id) => ({
      kind: s.kind,
      name: s[id].name,
      desc: s[id].desc,
      price: { cls: 'free', text: s.pick },
    }));

    this.ctx.overlay.show(`
      <div class="ov-title">${s.title}</div>
      <div class="ov-sub">${s.body}</div>
      ${cardsHtml(cards)}
    `);
    this.ctx.overlay.onCards((i) => this.pick(GAME_MODES[i]));
  }

  update(_dt: number): void {
    const index = this.ctx.input.cardIndex();
    if (index !== null) this.ctx.overlay.pressCard(index);
  }

  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }

  private pick(mode: GameMode | undefined): void {
    if (!mode) return;
    this.ctx.toModuleSelect(this.seed, mode);
  }
}
