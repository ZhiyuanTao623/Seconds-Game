import { COSTS, GRADES, PRICES } from './config';
import { Ledger } from './ledger';
import { generateMap } from './map';
import { computeStats } from './upgrades';
import { offerBaseCost } from './rewards';
import { createDamageTally } from './entities';
import { t } from '../i18n/i18n';
import { RngStream } from '../core/rng';
import type { MapNode, RunMap } from './map';
import type { Stats } from './config';
import type { DamageTag } from './entities';
import type { ModuleId } from './modules';
import type { Evolution, EvolutionBranch, Upgrade } from './upgrades';
import type { Offer } from './rewards';
import type { UpgradeId } from '../i18n/i18n';

/** 模组自己的核心机制打出的伤害走哪个标签——结算页「模组伤害占比」用这个映射。 */
export const MODULE_DAMAGE_TAG: Record<ModuleId, DamageTag> = {
  blade: 'BLADE',
  dash: 'DASH',
  charge: 'CHARGE',
};

/**
 * 一局游戏的全部状态。
 *
 * 随机分两条流：
 *   `mapRng`   — 开局一次，把整张地图和房型定死
 *   `rngFor(id)` — 每个节点独立派生，该房间的墙体、敌人生成点、Boss 招式
 *
 * 分流的意义：玩家在某个房间里多触发一次随机，不会往后污染任何东西。
 * 只有这样，同一个 seed 两个人跑出来才是同一局，成绩才可比。
 */
export class Run {
  readonly seed: number;
  readonly module: ModuleId;
  readonly map: RunMap;
  readonly ledger = new Ledger();

  owned: Upgrade[] = [];
  /**
   * 已完成进化的强化 → 选中的分支。分支保留直到被选中：一个强化拥有的
   * 两条分支在选择前都可能反复出现在奖励/商店里；选中一条后，这个强化
   * 整体完成进化，两条分支（包括没选的那条）都不再出现在任何池子里。
   */
  readonly evolved = new Map<UpgradeId, EvolutionBranch>();
  /** HUD 用的版本号；进化不会改变 owned.length。 */
  upgradeVersion = 0;
  stats: Stats;

  /** 当前所在节点。null = 还没踏上第 1 层。 */
  current: MapNode | null = null;
  /** 此刻可以点选的下一批节点 id。 */
  available: string[];
  won = false;

  /** 整局按标签累计的伤害（结算页用）。每个房间结束时由 `CombatScene` 并进来。 */
  readonly damageByTag = createDamageTally();

  constructor(seed: number, module: ModuleId) {
    this.seed = seed >>> 0;
    this.module = module;
    this.map = generateMap(new RngStream(this.seed).derive('map'));
    this.available = [...this.map.entries];
    this.stats = computeStats(this.module, this.owned);
  }

  /** 某个节点专属的随机流。同一个 (seed, nodeId) 永远给出同一条。 */
  rngFor(nodeId: string, purpose = 'combat'): RngStream {
    return new RngStream(this.seed).derive(`${purpose}:${nodeId}`);
  }

  node(id: string): MapNode | undefined { return this.map.nodes.get(id); }

  enter(node: MapNode): void {
    node.visited = true;
    this.current = node;
    this.available = [];
  }

  /** 房间结束，摊开下一批可选节点。 */
  advance(from: MapNode): void {
    this.available = from.next.filter((id) => this.map.nodes.has(id));
  }

  /** 房间结束时，把这个房间的伤害并进整局的总账。 */
  mergeDamageByTag(tally: Readonly<Record<DamageTag, number>>): void {
    for (const key of Object.keys(tally) as DamageTag[]) this.damageByTag[key] += tally[key];
  }

  takeUpgrade(u: Upgrade): void {
    this.owned.push(u);
    this.upgradeVersion += 1;
    this.stats = computeStats(this.module, this.owned, this.evolved);
  }

  get ownedIds(): Set<UpgradeId> { return new Set(this.owned.map((u) => u.id)); }

  /** 精英/战斗/商店共用的奖励状态快照——见 rewards.ts 的生成函数。 */
  get rewardState(): { module: ModuleId; ownedIds: ReadonlySet<UpgradeId>; owned: readonly Upgrade[]; evolved: ReadonlyMap<UpgradeId, EvolutionBranch> } {
    return { module: this.module, ownedIds: this.ownedIds, owned: this.owned, evolved: this.evolved };
  }

  /** 选中一条进化分支：强化完成进化，两条分支从此永久离开所有池子。 */
  takeEvolution(evolution: Evolution): void {
    this.evolved.set(evolution.id, evolution.branch);
    this.upgradeVersion += 1;
    this.stats = computeStats(this.module, this.owned, this.evolved);
  }

  /** 领取一张奖励卡（基础强化或进化分支都走这里）。 */
  takeOffer(offer: Offer): void {
    if (offer.kind === 'upgrade') this.takeUpgrade(offer.upgrade);
    else this.takeEvolution(offer.evolution);
  }

  upgradeLabel(u: Upgrade): string {
    const branch = this.evolved.get(u.id);
    if (!branch) return u.name;
    return `${u.name} · ${t().evolutions[u.id][branch].name}`;
  }

  // ---------------------------------------------------------------- 定价

  /** discounted = 商店第 4 槽的随机折扣位；costMult 留给未来的省钱类强化。 */
  shopPrice(offer: Offer, discounted = false): number {
    const base = offerBaseCost(offer) * (discounted ? PRICES.discountSlotMult : 1);
    return Math.max(COSTS.minShopPrice, Math.round(base * this.stats.costMult));
  }

  get shortcutCost(): number { return Math.round(COSTS.shortcut * this.stats.costMult); }
  get mendCost(): number { return Math.round(COSTS.mend * this.stats.costMult); }

  // ---------------------------------------------------------------- 结算

  get grade(): { letter: string; color: string } {
    const total = this.ledger.total;
    for (const [letter, under, color] of GRADES) {
      if (total < under) return { letter, color };
    }
    const last = GRADES[GRADES.length - 1]!;
    return { letter: last[0], color: last[2] };
  }

  get floorLabel(): string {
    const floor = this.current?.floor ?? 1;
    return t().hud.floor(floor, this.map.byFloor.length);
  }
}
