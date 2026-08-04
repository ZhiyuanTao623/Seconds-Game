import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';

/** 结算页。停表 —— 已经跑完了。 */
export class ResultScene implements Scene {
  readonly countsTime = false;
  readonly pausable = false;

  constructor(private ctx: SceneContext) {}

  enter(): void {
    const { run, overlay } = this.ctx;
    const { letter, color } = run.grade;
    const { ledger } = run;
    const s = t().result;

    overlay.show(`
      <div class="ov-title">${run.won ? s.clear : s.over}</div>
      <div id="grade" style="color:${color}">${letter}</div>
      <div style="font-size:40px;font-weight:700;margin-bottom:22px">${formatSeconds(ledger.total)}s</div>
      <div id="resbreak">
        <em>${s.play}</em><span class="cPlay">${formatSeconds(ledger.play)}s</span><br>
        <em>${s.pen}</em><span class="cPen">+${formatSeconds(ledger.penalty)}s</span><br>
        <em>${s.spend}</em><span class="cSpend">+${formatSeconds(ledger.spend)}s</span><br>
        <em>${s.ref}</em><span class="cRef">−${formatSeconds(ledger.refund)}s</span><br>
        <em>${s.seed}</em><span id="seedout" style="cursor:pointer;text-decoration:underline dotted">${run.seed}</span><br>
        <em>${s.owned}</em>${run.owned.map((u) => run.upgradeLabel(u)).join(s.listSep) || s.none}
      </div>
      <br>
      <div class="btn" id="again">${s.retry}</div>
      <div class="btn" id="fresh">${s.fresh}</div>
    `);

    // 同 seed 重跑是竞速的基本诉求：同一张图才能比出谁快
    overlay.onClick('again', () => this.ctx.startRun(run.seed, run.module));
    overlay.onClick('fresh', () => this.ctx.toTitle());
    overlay.onClick('seedout', () => {
      void navigator.clipboard?.writeText(String(run.seed));
      overlay.toast(t().result.copied);
    });
  }

  update(): void {}
  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }
}
