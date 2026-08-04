import type { Stats } from './config';
import { BASE_STATS, MODULES } from './config';
import { t } from '../i18n/i18n';
import type { RngStream } from '../core/rng';
import type { ModuleId } from './modules';
import { applyModuleBase } from './modules';
import type { UpgradeId } from '../i18n/i18n';

export type EvolutionBranch = 'a' | 'b';
export type EvolutionKey = `${UpgradeId}:${EvolutionBranch}`;

export interface Upgrade {
  readonly id: UpgradeId;
  /** 属于哪个模组的专属强化；通用强化不挂在任何模组下。 */
  readonly module: ModuleId | 'universal';
  /** 商店基础价（秒）。战斗房/精英房掉落免费。 */
  readonly cost: number;
  readonly name: string;
  readonly desc: string;
  apply(s: Stats): void;
}

/**
 * 强化只有两个阶段：基础 → 进化 A 或 B。选完一条分支，另一条永久关闭，
 * 强化本身完成进化，不再出现在任何奖励/商店池子里，也不能继续叠数值。
 */
export interface Evolution {
  readonly key: EvolutionKey;
  readonly id: UpgradeId;
  readonly branch: EvolutionBranch;
  readonly module: ModuleId | 'universal';
  readonly cost: number;
  readonly name: string;
  readonly desc: string;
  apply(s: Stats): void;
}

interface UpgradeDef {
  id: UpgradeId;
  module: ModuleId | 'universal';
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
    module: def.module,
    cost: def.cost,
    apply: def.apply,
    get name(): string { return t().upgrades[def.id].name; },
    get desc(): string { return t().upgrades[def.id].desc; },
  };
}

/**
 * 通用强化：适用于所有模组，但不能取代模组自身玩法。
 * 模组专属强化（飞刃/掠影/蓄势各 3 个）分别在各自里程碑加入这个数组。
 */
export const UPGRADES: readonly Upgrade[] = [
  mkUpgrade({ id: 'un_gale', module: 'universal', cost: 10, apply: (s) => { s.spd *= 1.12; s.dashCd *= 0.88; } }),
  mkUpgrade({ id: 'un_blade', module: 'universal', cost: 13, apply: (s) => { s.dmg *= 1.22; s.penMult *= 1.15; } }),
  mkUpgrade({ id: 'un_tough', module: 'universal', cost: 12, apply: (s) => { s.penMult *= 0.78; s.dmg *= 0.94; } }),
  mkUpgrade({ id: 'un_abacus', module: 'universal', cost: 11, apply: (s) => { s.refundNormal = 0.25; s.refundElite = 0.25; } }),

  // ---- 飞刃模组专属 ----
  mkUpgrade({
    id: 'bl_pierce', module: 'blade', cost: 13,
    apply: (s) => { s.bladePierceMode = 'stack'; s.bladePierce = 1; s.bladePierceFalloff = 0.75; },
  }),
  mkUpgrade({
    id: 'bl_return', module: 'blade', cost: 14,
    apply: (s) => { s.bladeReturn = true; s.bladeReturnSpeed = MODULES.blade.speed; },
  }),
  mkUpgrade({
    id: 'bl_mark', module: 'blade', cost: 15,
    apply: (s) => { s.markMax = 3; s.markDuration = 3.0; s.markDamagePerStack = 0.20; },
  }),
];

const UPGRADE_BY_ID = new Map<string, Upgrade>(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id: string): Upgrade | undefined => UPGRADE_BY_ID.get(id);

interface EvolutionDef {
  id: UpgradeId;
  branch: EvolutionBranch;
  module: ModuleId | 'universal';
  cost: number;
  apply(s: Stats): void;
}

function mkEvolution(def: EvolutionDef): Evolution {
  return {
    key: `${def.id}:${def.branch}`,
    id: def.id,
    branch: def.branch,
    module: def.module,
    cost: def.cost,
    apply: def.apply,
    get name(): string { return `${t().upgrades[def.id].name} · ${t().evolutions[def.id][def.branch].name}`; },
    get desc(): string { return t().evolutions[def.id][def.branch].desc; },
  };
}

/**
 * 每个强化恰好 2 条进化，互斥。数值目标是「持有基础强化后的总效果」，
 * 用相对基础值的比例写，而不是写死一套独立效果 —— 这样 apply 顺序
 * （基础 → 选中分支）永远给出同一个确定结果。
 */
export const EVOLUTIONS: readonly Evolution[] = [
  // ---- 疾风
  mkEvolution({
    id: 'un_gale', branch: 'a', module: 'universal', cost: 15,
    apply: (s) => { s.spd *= 1.22 / 1.12; s.dashSpeedMult *= 1.12; },
  }),
  mkEvolution({
    id: 'un_gale', branch: 'b', module: 'universal', cost: 15,
    apply: (s) => { s.dashCd *= 0.68 / 0.88; s.dashSpeedMult *= 0.92; },
  }),

  // ---- 利刃
  mkEvolution({
    id: 'un_blade', branch: 'a', module: 'universal', cost: 18,
    apply: (s) => { s.dmg *= 1.52 / 1.22; s.penMult *= 1.40 / 1.15; },
  }),
  mkEvolution({
    id: 'un_blade', branch: 'b', module: 'universal', cost: 17,
    apply: (s) => { s.dmg *= 1.34 / 1.22; s.penMult /= 1.15; },
  }),

  // ---- 韧体
  mkEvolution({
    id: 'un_tough', branch: 'a', module: 'universal', cost: 17,
    apply: (s) => { s.penMult *= 0.58 / 0.78; s.dmg *= 0.84 / 0.94; },
  }),
  mkEvolution({
    id: 'un_tough', branch: 'b', module: 'universal', cost: 16,
    apply: (s) => { s.taxWindow = 3.2; },
  }),

  // ---- 精算
  mkEvolution({
    id: 'un_abacus', branch: 'a', module: 'universal', cost: 15,
    apply: (s) => { s.refundNormal = 0.45; s.refundElite = 0.45; },
  }),
  mkEvolution({
    id: 'un_abacus', branch: 'b', module: 'universal', cost: 16,
    apply: (s) => { s.refundElite = 0.75; s.refundEliteClear = 1.0; },
  }),

  // ---- 贯刃 → 无阻 / 贯心
  mkEvolution({
    id: 'bl_pierce', branch: 'a', module: 'blade', cost: 19,
    apply: (s) => { s.bladePierce = 3; s.bladePierceFalloff = 0.85; },
  }),
  mkEvolution({
    id: 'bl_pierce', branch: 'b', module: 'blade', cost: 19,
    apply: (s) => { s.bladePierceMode = 'finale'; s.bladePierce = 1; s.bladePierceBonus = 1.8; },
  }),

  // ---- 回旋 → 归刃 / 环身
  mkEvolution({
    id: 'bl_return', branch: 'a', module: 'blade', cost: 20,
    apply: (s) => { s.bladeReturnSpeed = 820; s.bladeReturnDamageMult = 1.35; },
  }),
  mkEvolution({
    id: 'bl_return', branch: 'b', module: 'blade', cost: 20,
    apply: (s) => { s.bladeOrbit = true; s.bladeOrbitDuration = 0.8; },
  }),

  // ---- 刃印 → 猎印 / 爆印
  mkEvolution({
    id: 'bl_mark', branch: 'a', module: 'blade', cost: 21,
    apply: (s) => { s.markMax = 5; s.markMeleeBonusPerStack = 0.05; },
  }),
  mkEvolution({
    id: 'bl_mark', branch: 'b', module: 'blade', cost: 21,
    apply: (s) => { s.markDetonate = true; s.markDetonateDamageMult = 0.9; s.markDetonateSplashMult = 0.45; },
  }),
];

const EVOLUTIONS_BY_ID = new Map<UpgradeId, [Evolution, Evolution]>();
for (const e of EVOLUTIONS) {
  const pair = EVOLUTIONS_BY_ID.get(e.id) ?? ([] as unknown as [Evolution, Evolution]);
  pair[e.branch === 'a' ? 0 : 1] = e;
  EVOLUTIONS_BY_ID.set(e.id, pair);
}

/** 一个强化的两条进化分支（若存在）。 */
export function evolutionsFor(id: UpgradeId): readonly Evolution[] {
  return EVOLUTIONS_BY_ID.get(id) ?? [];
}

export function evolutionByKey(key: EvolutionKey): Evolution | undefined {
  const [id, branch] = key.split(':') as [UpgradeId, EvolutionBranch];
  return evolutionsFor(id).find((e) => e.branch === branch);
}

/**
 * 把模组基础能力 + 持有的强化 + 选中的进化叠到基础值上。
 *
 * `evolved` 记录每个已完成进化的强化选中了哪条分支；同一个强化只会
 * 出现一次（选了 A 就不可能再选 B），所以这里不存在顺序歧义。
 */
export function computeStats(
  module: ModuleId,
  owned: readonly Upgrade[],
  evolved: ReadonlyMap<UpgradeId, EvolutionBranch> = new Map(),
): Stats {
  const s: Stats = { ...BASE_STATS };
  applyModuleBase(module, s);
  for (const u of owned) u.apply(s);
  for (const u of owned) {
    const branch = evolved.get(u.id);
    if (!branch) continue;
    const evolution = evolutionsFor(u.id).find((e) => e.branch === branch);
    evolution?.apply(s);
  }
  return s;
}

/** 一个强化是否已经完成进化（选中了任意一条分支）。 */
export const isEvolved = (evolved: ReadonlyMap<UpgradeId, EvolutionBranch>, id: UpgradeId): boolean =>
  evolved.has(id);

/**
 * 抽 k 个还没拿到的强化，限定在给定模组集合内（自己的模组 + 通用）。
 * 用调用方传进来的 rng —— 保证同一个 seed 下，同一个节点开出的
 * 强化永远一样，和玩家在别处做了什么无关。
 */
export function drawUpgrades(
  rng: RngStream,
  owned: ReadonlySet<string>,
  allowedModules: ReadonlySet<ModuleId | 'universal'>,
  k: number,
): Upgrade[] {
  const pool = UPGRADES.filter((u) => !owned.has(u.id) && allowedModules.has(u.module));
  const out: Upgrade[] = [];
  while (out.length < k && pool.length > 0) {
    const picked = rng.take(pool);
    if (picked) out.push(picked);
  }
  return out;
}
