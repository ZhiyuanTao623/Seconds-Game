import { REWARDS } from './config';
import { UPGRADES, drawUpgrades, evolutionsFor, isEvolved } from './upgrades';
import type { Evolution, EvolutionBranch, Upgrade } from './upgrades';
import type { RngStream } from '../core/rng';
import type { ModuleId } from './modules';
import type { UpgradeId } from '../i18n/i18n';

/**
 * 一张奖励/商店卡片：要么是一个还没拿到的基础强化，要么是一条进化分支。
 * 两者共用同一套卡片 UI，所以统一成一个 union，配一组读取器而不是到处判 kind。
 */
export type Offer =
  | { kind: 'upgrade'; upgrade: Upgrade }
  | { kind: 'evolution'; evolution: Evolution };

export const offerId = (o: Offer): UpgradeId => (o.kind === 'upgrade' ? o.upgrade.id : o.evolution.id);
export const offerName = (o: Offer): string => (o.kind === 'upgrade' ? o.upgrade.name : o.evolution.name);
export const offerDesc = (o: Offer): string => (o.kind === 'upgrade' ? o.upgrade.desc : o.evolution.desc);
export const offerBaseCost = (o: Offer): number => (o.kind === 'upgrade' ? o.upgrade.cost : o.evolution.cost);
export const offerModule = (o: Offer): ModuleId | 'universal' =>
  o.kind === 'upgrade' ? o.upgrade.module : o.evolution.module;

/** 奖励生成只需要知道这些 —— 不依赖 Run 的其余状态，方便单测直接构造。 */
export interface RewardState {
  module: ModuleId;
  ownedIds: ReadonlySet<UpgradeId>;
  owned: readonly Upgrade[];
  evolved: ReadonlyMap<UpgradeId, EvolutionBranch>;
}

const upgradeOffer = (u: Upgrade): Offer => ({ kind: 'upgrade', upgrade: u });
const evolutionOffer = (e: Evolution): Offer => ({ kind: 'evolution', evolution: e });

/** 已拥有、还没完成进化的强化 —— 它的两条分支都还开着，随时可能被抽到。 */
function evolvableUpgrades(state: RewardState, module?: ModuleId | 'universal'): Upgrade[] {
  return state.owned.filter((u) => !isEvolved(state.evolved, u.id) && (module === undefined || u.module === module));
}

function randomEvolutionOf(rng: RngStream, u: Upgrade): Offer | null {
  const branches = evolutionsFor(u.id);
  return branches.length > 0 ? evolutionOffer(rng.pick(branches)) : null;
}

/** 防无效选项规则 5：候选不够就用通用强化补齐。 */
function fillWithUniversal(rng: RngStream, offers: Offer[], state: RewardState, want: number): Offer[] {
  if (offers.length >= want) return offers;
  const excluded = new Set<UpgradeId>([...state.ownedIds, ...offers.map(offerId)]);
  const filler = drawUpgrades(rng, excluded, new Set(['universal']), want - offers.length);
  return [...offers, ...filler.map(upgradeOffer)];
}

/**
 * 战斗房：2 个模组专属 + 1 个通用（都是未获得的基础强化）。
 * 35% 概率把其中一张换成一条进化分支（前提：存在可进化的已拥有强化）。
 */
export function drawCombatReward(rng: RngStream, state: RewardState): Offer[] {
  const moduleOnly = drawUpgrades(rng, state.ownedIds, new Set([state.module]), 2);
  const excludedAfterModule = new Set<UpgradeId>([...state.ownedIds, ...moduleOnly.map((u) => u.id)]);
  const universalOnly = drawUpgrades(rng, excludedAfterModule, new Set(['universal']), 1);

  let offers = [...moduleOnly, ...universalOnly].map(upgradeOffer);
  offers = fillWithUniversal(rng, offers, state, REWARDS.combatChoices);

  if (offers.length > 0 && rng.bool(REWARDS.combatEvolutionChance)) {
    const evolvable = evolvableUpgrades(state);
    if (evolvable.length > 0) {
      const evo = randomEvolutionOf(rng, rng.pick(evolvable));
      if (evo) offers[rng.int(offers.length)] = evo;
    }
  }
  return offers;
}

/**
 * 精英房：尽量多给进化选项（至少 2 个，若可进化的强化够多可以给满 3 个），
 * 剩余位置用未获得的模组专属强化补齐。没有任何可进化强化时退化成
 * 3 个未获得的模组专属强化 —— 精英房的价值是稳定完成构筑，不是单纯多选一。
 */
export function drawEliteReward(rng: RngStream, state: RewardState): Offer[] {
  const pool = evolvableUpgrades(state);
  const evoOffers: Offer[] = [];
  while (evoOffers.length < REWARDS.eliteChoices && pool.length > 0) {
    const u = rng.take(pool);
    if (!u) break;
    const evo = randomEvolutionOf(rng, u);
    if (evo) evoOffers.push(evo);
  }

  let offers: Offer[];
  if (evoOffers.length === 0) {
    offers = drawUpgrades(rng, state.ownedIds, new Set([state.module]), REWARDS.eliteChoices).map(upgradeOffer);
  } else {
    offers = evoOffers;
    if (offers.length < REWARDS.eliteChoices) {
      const excluded = new Set<UpgradeId>([...state.ownedIds, ...offers.map(offerId)]);
      const bases = drawUpgrades(rng, excluded, new Set([state.module]), REWARDS.eliteChoices - offers.length);
      offers = [...offers, ...bases.map(upgradeOffer)];
    }
  }
  return fillWithUniversal(rng, offers, state, REWARDS.eliteChoices);
}

export interface ShopSlot {
  offer: Offer | null;
  /** 第 4 槽「随机折扣强化」；价格另按 PRICES.discountSlotMult 打折。 */
  discounted: boolean;
}

/**
 * 商店固定 4 槽：模组基础 / 模组基础或进化 / 通用或通用进化 / 随机折扣。
 * 每槽独立判定，货源不够就退回 null（「已售出」样式的空位）。
 */
export function drawShopStock(rng: RngStream, state: RewardState): ShopSlot[] {
  const excluded = new Set<UpgradeId>(state.ownedIds);
  const slots: ShopSlot[] = [];

  const takeBase = (modules: ReadonlySet<ModuleId | 'universal'>): Offer | null => {
    const u = drawUpgrades(rng, excluded, modules, 1)[0];
    if (!u) return null;
    excluded.add(u.id);
    return upgradeOffer(u);
  };

  // 位置 1：模组专属基础强化
  const slot1 = takeBase(new Set([state.module]));
  slots.push({ offer: slot1, discounted: false });

  // 位置 2：模组专属基础强化，货源没有了就换成一条模组专属进化
  const slot2 = takeBase(new Set([state.module]))
    ?? (() => {
      const evolvable = evolvableUpgrades(state, state.module);
      return evolvable.length > 0 ? randomEvolutionOf(rng, rng.pick(evolvable)) : null;
    })();
  slots.push({ offer: slot2, discounted: false });

  // 位置 3：通用强化，或者通用强化的进化（各半概率，优先满足能给的那一种）
  const universalEvolvable = evolvableUpgrades(state, 'universal');
  const wantEvo = rng.bool(0.5) && universalEvolvable.length > 0;
  const slot3 = wantEvo
    ? randomEvolutionOf(rng, rng.pick(universalEvolvable))
    : takeBase(new Set(['universal'])) ?? (universalEvolvable.length > 0 ? randomEvolutionOf(rng, rng.pick(universalEvolvable)) : null);
  slots.push({ offer: slot3, discounted: false });

  // 位置 4：随机折扣强化 —— 货架上还没出现过、玩家还没拿到的任意强化
  const shownIds = new Set(slots.map((s) => s.offer).filter((o): o is Offer => o !== null).map(offerId));
  const discountPool = UPGRADES.filter(
    (u) => !state.ownedIds.has(u.id) && !shownIds.has(u.id) && (u.module === state.module || u.module === 'universal'),
  );
  const slot4 = discountPool.length > 0 ? upgradeOffer(rng.pick(discountPool)) : null;
  slots.push({ offer: slot4, discounted: slot4 !== null });

  return slots;
}
