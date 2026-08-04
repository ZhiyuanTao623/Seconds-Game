import type { Stats } from './config';
import { BASE_STATS, CHARGED_SLASH, THROW_BLADE } from './config';
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

export type EvolutionKind = 'numeric' | 'costRemoval';
export type EvolutionKey = `${UpgradeId}:${EvolutionKind}`;

/** 精英房奖励：强化已有卡的一条独立分支，不会把原卡重复塞进背包。 */
export interface Evolution {
  readonly key: EvolutionKey;
  readonly id: UpgradeId;
  readonly kind: EvolutionKind;
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
  mkUpgrade({ id: 'throw', cost: 17, apply: (s) => { s.projectile = true; s.projectileDamageMult = THROW_BLADE.damageMult; } }),
  mkUpgrade({ id: 'phantom', cost: 16, apply: (s) => { s.dashDamage = 1.2; } }),
  mkUpgrade({ id: 'charge', cost: 15, apply: (s) => { s.chargedSlash = true; s.chargedDamageMult = CHARGED_SLASH.damageMult; } }),
];

const UPGRADE_BY_ID = new Map<string, Upgrade>(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id: string): Upgrade | undefined => UPGRADE_BY_ID.get(id);

interface EvolutionDef { id: UpgradeId; kind: EvolutionKind; apply(s: Stats): void }

function mkEvolution(def: EvolutionDef): Evolution {
  return {
    key: `${def.id}:${def.kind}`,
    id: def.id,
    kind: def.kind,
    apply: def.apply,
    get name(): string { return `${t().upgrades[def.id].name} · ${t().evolution[def.kind]}`; },
    get desc(): string { return t().evolutions[def.id][def.kind]?.desc ?? ''; },
  };
}

/**
 * 数值进化与解除代价是两条可叠加分支。只有真正存在副作用的原强化才有后者。
 * 所有数值都以「持有原强化后的总效果」为目标，而非额外写死一套独立效果。
 */
export const EVOLUTIONS: readonly Evolution[] = [
  mkEvolution({ id: 'blade', kind: 'numeric', apply: (s) => { s.dmg *= 1.25; } }),
  mkEvolution({ id: 'blade', kind: 'costRemoval', apply: (s) => { s.penMult /= 1.4; } }),
  mkEvolution({ id: 'gale', kind: 'numeric', apply: (s) => { s.spd *= 1.120689655; s.dashCd *= 0.8; } }),
  mkEvolution({ id: 'tough', kind: 'numeric', apply: (s) => { s.penMult *= 0.5 / 0.65; } }),
  mkEvolution({ id: 'tough', kind: 'costRemoval', apply: (s) => { s.dmg /= 0.85; } }),
  mkEvolution({ id: 'reach', kind: 'numeric', apply: (s) => { s.range *= 1.8 / 1.45; s.arc *= 1.35 / 1.15; } }),
  mkEvolution({ id: 'rapid', kind: 'numeric', apply: (s) => { s.atkCd *= 0.45 / 0.6; } }),
  mkEvolution({ id: 'rapid', kind: 'costRemoval', apply: (s) => { s.dmg /= 0.9; } }),
  mkEvolution({ id: 'exec', kind: 'numeric', apply: (s) => { s.exec = Math.max(s.exec, 0.45); } }),
  mkEvolution({ id: 'greed', kind: 'numeric', apply: (s) => { s.costMult *= 0.45 / 0.65; } }),
  mkEvolution({ id: 'stasis', kind: 'numeric', apply: (s) => { s.dashSlow = 0.85; } }),
  mkEvolution({ id: 'riposte', kind: 'numeric', apply: (s) => { s.counterDmg = 1.4; } }),
  mkEvolution({ id: 'abacus', kind: 'numeric', apply: (s) => { s.refund += 0.5; } }),
  mkEvolution({ id: 'throw', kind: 'numeric', apply: (s) => { s.projectileDamageMult = 0.85; } }),
  mkEvolution({ id: 'phantom', kind: 'numeric', apply: (s) => { s.dashDamage = 1.8; } }),
  mkEvolution({ id: 'charge', kind: 'numeric', apply: (s) => { s.chargedDamageMult = 3.4; } }),
];

const EVOLUTION_BY_KEY = new Map<EvolutionKey, Evolution>(EVOLUTIONS.map((e) => [e.key, e]));
export const evolutionByKey = (key: EvolutionKey): Evolution | undefined => EVOLUTION_BY_KEY.get(key);

/** 把持有的强化叠到基础值上。顺序无关 —— 全部是乘法或取最大值。 */
export function computeStats(owned: readonly Upgrade[], evolutionKeys: ReadonlySet<EvolutionKey> = new Set()): Stats {
  const s: Stats = { ...BASE_STATS };
  for (const u of owned) u.apply(s);
  // 解除代价必须先于数值进化结算，保证两者叠加时结果稳定且与获取顺序无关。
  for (const e of EVOLUTIONS) if (e.kind === 'costRemoval' && evolutionKeys.has(e.key)) e.apply(s);
  for (const e of EVOLUTIONS) if (e.kind === 'numeric' && evolutionKeys.has(e.key)) e.apply(s);
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

/**
 * 一次精英奖励只会给同一个原强化一张分支卡；已展示过的分支不再入池。
 * 分支在展示时即被 Run 标记为 seen，因此不选择也不会在之后重新出现。
 */
export function drawEvolutions(
  rng: RngStream,
  owned: readonly Upgrade[],
  seen: ReadonlySet<EvolutionKey>,
  k: number,
): Evolution[] {
  const byUpgrade = owned.map((u) => ({
    id: u.id,
    choices: EVOLUTIONS.filter((e) => e.id === u.id && !seen.has(e.key)),
  })).filter((entry) => entry.choices.length > 0);

  const out: Evolution[] = [];
  while (out.length < k && byUpgrade.length > 0) {
    const entry = rng.take(byUpgrade);
    if (!entry) break;
    const evolution = rng.pick(entry.choices);
    out.push(evolution);
  }
  return out;
}
