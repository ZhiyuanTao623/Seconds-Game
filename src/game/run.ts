import { COSTS, GRADES } from './config';
import { Ledger } from './ledger';
import { generateMap } from './map';
import { computeStats, drawEvolutions } from './upgrades';
import { t } from '../i18n/i18n';
import { RngStream } from '../core/rng';
import type { MapNode, RunMap } from './map';
import type { Stats } from './config';
import type { Evolution, EvolutionKey, Upgrade } from './upgrades';

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
  readonly map: RunMap;
  readonly ledger = new Ledger();

  owned: Upgrade[] = [];
  /** 已在精英奖励里展示过的分支；展示即淘汰，即使玩家没选择。 */
  readonly seenEvolutions = new Set<EvolutionKey>();
  /** 已实际装备的进化分支。 */
  readonly evolved = new Set<EvolutionKey>();
  /** HUD 用的版本号；进化不会改变 owned.length。 */
  upgradeVersion = 0;
  stats: Stats;

  /** 当前所在节点。null = 还没踏上第 1 层。 */
  current: MapNode | null = null;
  /** 此刻可以点选的下一批节点 id。 */
  available: string[];
  won = false;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.map = generateMap(new RngStream(this.seed).derive('map'));
    this.available = [...this.map.entries];
    this.stats = computeStats(this.owned);
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

  takeUpgrade(u: Upgrade): void {
    this.owned.push(u);
    this.upgradeVersion += 1;
    this.stats = computeStats(this.owned, this.evolved);
  }

  get ownedIds(): Set<string> { return new Set(this.owned.map((u) => u.id)); }

  /** 生成并立即淘汰已展示分支，确保同一局里不会二次出现。 */
  drawEliteEvolutions(count: number): Evolution[] {
    const options = drawEvolutions(this.rngFor(this.current?.id ?? 'elite', 'elite'), this.owned, this.seenEvolutions, count);
    for (const option of options) this.seenEvolutions.add(option.key);
    return options;
  }

  takeEvolution(evolution: Evolution): void {
    this.evolved.add(evolution.key);
    this.upgradeVersion += 1;
    this.stats = computeStats(this.owned, this.evolved);
  }

  upgradeLabel(u: Upgrade): string {
    const tags: string[] = [];
    if (this.evolved.has(`${u.id}:numeric`)) tags.push(t().evolution.numeric);
    if (this.evolved.has(`${u.id}:costRemoval`)) tags.push(t().evolution.costRemoval);
    return tags.length > 0 ? `${u.name} · ${tags.join('/')}` : u.name;
  }

  // ---------------------------------------------------------------- 定价

  /** 「贪婪」会打折，但商店永远不会低于底价 —— 免得强化变成白送。 */
  shopPrice(u: Upgrade): number {
    return Math.max(COSTS.minShopPrice, Math.round(u.cost * this.stats.costMult));
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
