import { comboTax, formatSeconds } from '../game/pricing';
import { onLocaleChange, t } from '../i18n/i18n';
import type { Run } from '../game/run';
import type { Player } from '../game/player';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/**
 * HUD 只读 Run 和 Player，自己不持有任何状态。
 * 「BOSS 强度」那一行已经删掉 —— 敌人强度不再随累计时间变化。
 */
export class Hud {
  private clock = el('clock');
  private play = el('bPlay');
  private penalty = el('bPen');
  private spend = el('bSpend');
  private refund = el('bRef');
  private tax = el('bTax');
  private nodeInfo = el('nodeinfo');
  private seedInfo = el('seedinfo');
  private upgrades = el('upglist');

  private lblPlay = el('lblPlay');
  private lblPen = el('lblPen');
  private lblSpend = el('lblSpend');
  private lblRef = el('lblRef');

  private lastUpgradeCount = -1;

  constructor() {
    this.applyStaticLabels();
    // Hud 和 App 一样活到进程结束，不需要真的取消订阅
    onLocaleChange(() => {
      this.applyStaticLabels();
      // 强化名字是取值时才查词典的 getter（见 game/upgrades.ts），
      // 但 upglist 的 innerHTML 是按数量缓存的 —— 数量没变就不会重画，
      // 必须手动作废一次缓存，语言切换才能立刻体现在已持有的强化上。
      this.lastUpgradeCount = -1;
    });
  }

  private applyStaticLabels(): void {
    const s = t().hud;
    this.lblPlay.textContent = s.play;
    this.lblPen.textContent = s.pen;
    this.lblSpend.textContent = s.spend;
    this.lblRef.textContent = s.ref;
  }

  update(run: Run | null, player: Player | null, dt: number): void {
    if (!run) return;

    const { ledger } = run;
    if (ledger.jolt > 0) ledger.jolt -= dt;

    this.clock.textContent = formatSeconds(ledger.total);
    this.clock.classList.toggle('jolt', ledger.jolt > 0);
    this.play.textContent = formatSeconds(ledger.play);
    this.penalty.textContent = formatSeconds(ledger.penalty);
    this.spend.textContent = formatSeconds(ledger.spend);
    this.refund.textContent = formatSeconds(ledger.refund);

    this.tax.textContent =
      player && player.streak > 0
        ? t().hud.tax(comboTax(player.streak).toFixed(2), formatSeconds(Math.max(0, player.streakT)))
        : '';

    this.nodeInfo.textContent = run.floorLabel;
    this.seedInfo.textContent = t().hud.seed(run.seed);

    if (run.owned.length !== this.lastUpgradeCount) {
      this.lastUpgradeCount = run.owned.length;
      this.upgrades.innerHTML = run.owned.map((u) => `<span>${u.name}</span>`).join('');
    }
  }

  reset(): void {
    this.lastUpgradeCount = -1;
    this.upgrades.innerHTML = '';
    this.tax.textContent = '';
    this.nodeInfo.textContent = '';
    this.seedInfo.textContent = '';
  }
}
