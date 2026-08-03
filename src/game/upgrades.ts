import type { Stats } from './config';
import { BASE_STATS } from './config';
import { t } from '../i18n/i18n';
import type { RngStream } from '../core/rng';
import type { UpgradeId } from '../i18n/i18n';

export interface Upgrade {
  readonly id: UpgradeId;
  /** 商店基础价（秒）。战斗房掉落免费。 */
  readonly cost: number;
  readonly name: string;
  readonly desc: string;
  apply(s: Stats): void;
}

interface UpgradeDef {
  id: UpgradeId;
  cost: number;
  apply(s: Stats): void;
}

/**
 * `name`/`desc` 做成 getter，取值时才去查当前语言的词典 —— 不是构造时
 * 拍死的字符串。这样切换语言不需要重建任何一个已经拿到的 Upgrade 引用：
 * 结算页里躺着的旧强化列表、HUD 里已经攒了半局的强化条，读一次就是新语言。
 */
function mkUpgrade(def: UpgradeDef): Upgrade {
  return {
    id: def.id,
    cost: def.cost,
    apply: def.apply,
    get name(): string { return t().upgrades[def.id].name; },
    get desc(): string { return t().upgrades[def.id].desc; },
  };
}

/**
 * 13 个强化，同一局内不重复。
 *
 * 前 10 个只改数字；最后 3 个（掷刃 / 掠影 / 蓄力）各自动了一条不同的
 * 操作前提 —— 输出必须贴身、冲刺是纯防御、按住左键连点。
 */
export const UPGRADES: readonly Upgrade[] = [
  mkUpgrade({ id: 'blade', cost: 14, apply: (s) => { s.dmg *= 1.6; s.penMult *= 1.4; } }),
  mkUpgrade({ id: 'gale', cost: 16, apply: (s) => { s.spd *= 1.16; s.dashCd *= 0.65; } }),
  mkUpgrade({ id: 'tough', cost: 15, apply: (s) => { s.penMult *= 0.65; s.dmg *= 0.85; } }),
  mkUpgrade({ id: 'reach', cost: 12, apply: (s) => { s.range *= 1.45; s.arc *= 1.15; } }),
  mkUpgrade({ id: 'rapid', cost: 14, apply: (s) => { s.atkCd *= 0.6; s.dmg *= 0.9; } }),
  mkUpgrade({ id: 'exec', cost: 20, apply: (s) => { s.exec = Math.max(s.exec, 0.3); } }),
  mkUpgrade({ id: 'greed', cost: 13, apply: (s) => { s.costMult *= 0.65; } }),
  mkUpgrade({ id: 'stasis', cost: 18, apply: (s) => { s.dashSlow = 0.55; } }),
  mkUpgrade({ id: 'riposte', cost: 11, apply: (s) => { s.counterDmg = 0.85; } }),
  mkUpgrade({ id: 'abacus', cost: 15, apply: (s) => { s.refund += 0.5; } }),

  // ---- 改变操作方式的三个
  mkUpgrade({ id: 'throw', cost: 17, apply: (s) => { s.projectile = true; } }),
  mkUpgrade({ id: 'phantom', cost: 16, apply: (s) => { s.dashDamage = 1.2; } }),
  mkUpgrade({ id: 'charge', cost: 15, apply: (s) => { s.chargedSlash = true; } }),
];

const UPGRADE_BY_ID = new Map<string, Upgrade>(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id: string): Upgrade | undefined => UPGRADE_BY_ID.get(id);

/** 把持有的强化叠到基础值上。顺序无关 —— 全部是乘法或取最大值。 */
export function computeStats(owned: readonly Upgrade[]): Stats {
  const s: Stats = { ...BASE_STATS };
  for (const u of owned) u.apply(s);
  return s;
}

/**
 * 抽 k 个还没拿到的强化。
 *
 * 用调用方传进来的 rng —— 保证同一个 seed 下，同一个节点开出的
 * 强化永远一样，和玩家在别处做了什么无关。
 */
export function drawUpgrades(rng: RngStream, owned: ReadonlySet<string>, k: number): Upgrade[] {
  const pool = UPGRADES.filter((u) => !owned.has(u.id));
  const out: Upgrade[] = [];
  while (out.length < k && pool.length > 0) {
    const picked = rng.take(pool);
    if (picked) out.push(picked);
  }
  return out;
}
