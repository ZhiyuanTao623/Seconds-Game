import { formatSeconds } from '../game/pricing';
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

    overlay.show(`
      <div class="ov-title">${run.won ? '章 节 通 关' : '结 束'}</div>
      <div id="grade" style="color:${color}">${letter}</div>
      <div style="font-size:40px;font-weight:700;margin-bottom:22px">${formatSeconds(ledger.total)}s</div>
      <div id="resbreak">
        <em>游戏时间</em><span class="cPlay">${formatSeconds(ledger.play)}s</span><br>
        <em>受击惩罚</em><span class="cPen">+${formatSeconds(ledger.penalty)}s</span><br>
        <em>秒数消费</em><span class="cSpend">+${formatSeconds(ledger.spend)}s</span><br>
        <em>击杀返还</em><span class="cRef">−${formatSeconds(ledger.refund)}s</span><br>
        <em>SEED</em><span id="seedout" style="cursor:pointer;text-decoration:underline dotted">${run.seed}</span><br>
        <em>持有强化</em>${run.owned.map((u) => u.name).join('、') || '无'}
      </div>
      <br>
      <div class="btn" id="again">同 一 SEED 再 跑</div>
      <div class="btn" id="fresh">换 一 局</div>
    `);

    // 同 seed 重跑是竞速的基本诉求：同一张图才能比出谁快
    overlay.onClick('again', () => this.ctx.startRun(run.seed));
    overlay.onClick('fresh', () => this.ctx.toTitle());
    overlay.onClick('seedout', () => {
      void navigator.clipboard?.writeText(String(run.seed));
      overlay.toast('SEED 已复制');
    });
  }

  update(): void {}
  render(_r: Renderer): void {}
  exit(): void { this.ctx.overlay.hide(); }
}
