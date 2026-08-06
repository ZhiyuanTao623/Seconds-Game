import { comboTax, formatSeconds } from '../game/pricing';
import { onLocaleChange, t } from '../i18n/i18n';
import type { Run } from '../game/run';
import type { Player } from '../game/player';
import type { TimedChestView } from '../game/timedChest';

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
  private moduleInfo = el('moduleinfo');
  private upgrades = el('upglist');
  private chestHud = el('chesthud');
  private chestTitle = el('chesttitle');
  private chestTime = el('chesttime');
  private chestDetail = el('chestdetail');

  private lblPlay = el('lblPlay');
  private lblPen = el('lblPen');
  private lblSpend = el('lblSpend');
  private lblRef = el('lblRef');

  private lastUpgradeVersion = -1;

  constructor() {
    this.applyStaticLabels();
    // Hud 和 App 一样活到进程结束，不需要真的取消订阅
    onLocaleChange(() => {
      this.applyStaticLabels();
      // 强化名字是取值时才查词典的 getter（见 game/upgrades.ts），
      // 但 upglist 的 innerHTML 是按数量缓存的 —— 数量没变就不会重画，
      // 必须手动作废一次缓存，语言切换才能立刻体现在已持有的强化上。
      this.lastUpgradeVersion = -1;
    });
  }

  private applyStaticLabels(): void {
    const s = t().hud;
    this.lblPlay.textContent = s.play;
    this.lblPen.textContent = s.pen;
    this.lblSpend.textContent = s.spend;
    this.lblRef.textContent = s.ref;
  }

  update(run: Run | null, player: Player | null, chest: TimedChestView | null, dt: number): void {
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
    // 竞速模式前缀为空串 —— 这一行的输出和加练习模式之前逐字节一致
    const modeTag = run.mode === 'practice' ? `[${t().modes.practice}] ` : '';
    this.moduleInfo.textContent =
      modeTag + t().hud.module(t().modules[run.module].name, run.owned.length, run.evolved.size);

    this.updateTimedChest(chest);

    if (run.upgradeVersion !== this.lastUpgradeVersion) {
      this.lastUpgradeVersion = run.upgradeVersion;
      this.upgrades.innerHTML = run.owned
        .map((u) => `<span${run.evolved.has(u.id) ? ' class="evolved"' : ''}>${run.upgradeLabel(u)}</span>`)
        .join('');
    }
  }

  private updateTimedChest(chest: TimedChestView | null): void {
    this.chestHud.className = '';
    if (!chest) return;

    const s = t().timedChest;
    this.chestHud.classList.add('on');
    this.chestTitle.textContent = s.title;
    this.chestHud.classList.toggle('critical', chest.state === 'Critical');
    this.chestHud.classList.toggle('hit', chest.hitFlash > 0);
    this.chestHud.classList.toggle('succeeded', chest.state === 'Succeeded');
    this.chestHud.classList.toggle('expired', chest.state === 'Expired');

    if (chest.state === 'Succeeded') {
      this.chestTime.textContent = s.succeeded;
      this.chestDetail.textContent = s.rewardBonus;
    } else if (chest.state === 'Expired') {
      this.chestTime.textContent = s.expired;
      this.chestDetail.textContent = s.expiredDetail;
    } else {
      this.chestTime.textContent = `${Math.max(0, chest.remaining).toFixed(1)}s`;
      this.chestDetail.textContent = s.objective;
    }
  }

  reset(): void {
    this.lastUpgradeVersion = -1;
    this.upgrades.innerHTML = '';
    this.tax.textContent = '';
    this.nodeInfo.textContent = '';
    this.seedInfo.textContent = '';
    this.moduleInfo.textContent = '';
    this.chestHud.className = '';
  }
}
