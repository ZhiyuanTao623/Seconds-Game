import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { DamageTag } from '../game/entities';

/** 伤害占比一行：`标签名 XX%`，按占比降序排列，零值标签不显示。 */
function damageBreakdownHtml(run: SceneContext['run']): string {
  const s = t().result;
  const tally = run.damageByTag;
  const total = (Object.values(tally) as number[]).reduce((a, b) => a + b, 0);
  if (total <= 0) return s.damageNone;
  const tags = Object.keys(tally) as DamageTag[];
  return tags
    .filter((tag) => tally[tag] > 0)
    .sort((a, b) => tally[b] - tally[a])
    .map((tag) => `${s.damageTag[tag]} ${((tally[tag] / total) * 100).toFixed(0)}%`)
    .join(s.listSep);
}

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
        <em>${s.mode}</em>${t().modes[run.mode]}<br>
        <em>${s.module}</em>${t().modules[run.module].name}<br>
        <em>${s.owned}</em>${run.owned.map((u) => run.upgradeLabel(u)).join(s.listSep) || s.none}<br>
        <em>${s.damage}</em>${damageBreakdownHtml(run)}
      </div>
      <br>
      <div class="btn" id="again">${s.retry}</div>
      <div class="btn" id="fresh">${s.fresh}</div>
    `);

    // 同 seed 重跑是竞速的基本诉求：同一张图才能比出谁快
    // 模式必须一起带上：练习重跑忘了带 mode 会静默变成竞速局
    overlay.onClick('again', () => this.ctx.startRun(run.seed, run.module, run.mode));
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
