import { normalizeSeed, randomSeed } from '../core/rng';
import { t } from '../i18n/i18n';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';

/** 标题页。不计时 —— 还没开局。 */
export class TitleScene implements Scene {
  readonly countsTime = false;
  readonly pausable = false;

  constructor(private ctx: SceneContext) {}

  enter(): void {
    const s = t().title;
    this.ctx.overlay.show(`
      <div class="ov-title">${s.brand}</div>
      <div style="font-size:34px;font-weight:700;margin-bottom:18px">${s.tagline}</div>
      <div class="ov-sub">
        ${s.line1}<br>
        ${s.line2}<br>
        <span style="color:#ff8a5c">${s.line3}</span><br><br>
        <span style="opacity:.7">${s.controls}</span>
      </div>
      <div style="margin-bottom:8px;font-size:11px;opacity:.45;letter-spacing:2px">${s.seedLabel}</div>
      <input class="seedin" id="seed" placeholder="${s.seedPlaceholder}" autocomplete="off">
      <br><div class="btn" id="start">${s.start}</div>
    `);

    const input = document.getElementById('seed') as HTMLInputElement | null;
    const start = (): void => this.ctx.startRun(
      input && input.value.trim() !== '' ? normalizeSeed(input.value) : randomSeed(),
    );

    this.ctx.overlay.onClick('start', start);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  }

  exit(): void { this.ctx.overlay.hide(); }
  update(): void {}
  render(_r: Renderer): void {}
}
