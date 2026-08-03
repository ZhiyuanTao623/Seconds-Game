import { comboTax, formatSeconds } from '../game/pricing';
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

  private lastUpgradeCount = -1;

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
        ? `　连击税 ×${comboTax(player.streak).toFixed(2)} · ${formatSeconds(Math.max(0, player.streakT))}s 后清零`
        : '';

    this.nodeInfo.textContent = run.floorLabel;
    this.seedInfo.textContent = `SEED ${run.seed}`;

    if (run.owned.length !== this.lastUpgradeCount) {
      this.lastUpgradeCount = run.owned.length;
      this.upgrades.innerHTML = run.owned.map((u) => `<span>${u.name}</span>`).join('');
    }
  }

  reset(): void {
    this.lastUpgradeCount = -1;
    this.upgrades.innerHTML = '';
    this.tax.textContent = '';
  }
}
