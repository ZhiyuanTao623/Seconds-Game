import { MAP, ROOM_WEIGHTS } from './config';
import type { RngStream } from '../core/rng';

export type RoomKind = 'combat' | 'elite' | 'shop' | 'mend' | 'shortcut' | 'boss';

export interface MapNode {
  id: string;
  /** 1-based，第 1 层是起点，第 MAP.floors 层是 Boss */
  floor: number;
  /** 0-based 列号 */
  col: number;
  kind: RoomKind;
  /** 出边指向的节点 id。捷径门指向的是 floor + 2。 */
  next: string[];
  prev: string[];
  visited: boolean;
  /**
   * 捷径门专属：重定向之前，它原本指向的那一层都是什么房型。
   * 给地图提示用（DESIGN.md v3 §9.2：「跳过：精英房」这类具体提示）——
   * 重定向之后原始的直接子节点信息就丢了，必须在改边前存一份。
   */
  skippedKinds?: RoomKind[];
}

export interface RunMap {
  nodes: Map<string, MapNode>;
  /** byFloor[0] 是第 1 层 */
  byFloor: MapNode[][];
  entries: string[];
  bossId: string;
}

const key = (floor: number, col: number): string => `${floor}-${col}`;

/**
 * 生成一张杀戮尖塔式的分支地图。
 *
 * 整张图在开局时一次性生成完 —— 这是竞速模式能成立的前提：
 * 同一个 seed 永远给出同一张图、同一批房型，玩家在战斗里做了什么
 * 都不会往后污染地图内容。
 */
export function generateMap(rng: RngStream): RunMap {
  const nodes = new Map<string, MapNode>();

  const node = (floor: number, col: number): MapNode => {
    const id = key(floor, col);
    let n = nodes.get(id);
    if (!n) {
      n = { id, floor, col, kind: 'combat', next: [], prev: [], visited: false };
      nodes.set(id, n);
    }
    return n;
  };

  const connect = (from: MapNode, to: MapNode): void => {
    if (!from.next.includes(to.id)) from.next.push(to.id);
    if (!to.prev.includes(from.id)) to.prev.push(from.id);
  };

  // ---- 1. 走 6 条路径，铺出骨架
  // 每层记下已有的边，用来做「边不许交叉」的检查 —— 交叉的地图读不懂。
  const edgesByFloor = new Map<number, { from: number; to: number }[]>();
  const edgesOn = (floor: number): { from: number; to: number }[] => {
    let list = edgesByFloor.get(floor);
    if (!list) { list = []; edgesByFloor.set(floor, list); }
    return list;
  };

  const crosses = (floor: number, from: number, to: number): boolean =>
    edgesOn(floor).some((e) =>
      (e.from < from && e.to > to) || (e.from > from && e.to < to));

  const topFloor = MAP.floors - 1; // Boss 层的前一层

  for (let p = 0; p < MAP.paths; p++) {
    let col = rng.int(MAP.cols);
    node(1, col);

    for (let floor = 1; floor < topFloor; floor++) {
      const candidates: number[] = [];
      for (const delta of [-1, 0, 1]) {
        const next = col + delta;
        if (next < 0 || next >= MAP.cols) continue;
        if (crosses(floor, col, next)) continue;
        candidates.push(next);
      }
      const nextCol = candidates.length > 0 ? rng.pick(candidates) : col;

      connect(node(floor, col), node(floor + 1, nextCol));
      edgesOn(floor).push({ from: col, to: nextCol });
      col = nextCol;
    }
  }

  // ---- 2. Boss 层：所有路径汇聚到一个节点
  const bossCol = (MAP.cols - 1) / 2;
  const bossNode = node(MAP.floors, bossCol);
  bossNode.kind = 'boss';
  for (const n of nodes.values()) {
    if (n.floor === topFloor) connect(n, bossNode);
  }

  // ---- 3. 按层整理
  const byFloor: MapNode[][] = [];
  for (let floor = 1; floor <= MAP.floors; floor++) {
    byFloor.push(
      [...nodes.values()]
        .filter((n) => n.floor === floor)
        .sort((a, b) => a.col - b.col),
    );
  }

  const map: RunMap = {
    nodes,
    byFloor,
    entries: (byFloor[0] ?? []).map((n) => n.id),
    bossId: bossNode.id,
  };

  assignRoomKinds(map, rng);
  enforceMinimums(map, rng);
  preventSharedShortcutTarget(map);
  preventChainedShortcuts(map);
  rerouteShortcuts(map);
  ensureConsecutiveElites(map, rng);
  ensureEliteCoverage(map);

  return map;
}

// ---------------------------------------------------------------- 房型分配

function assignRoomKinds(map: RunMap, rng: RngStream): void {
  for (let floor = 1; floor <= MAP.floors; floor++) {
    for (const n of map.byFloor[floor - 1] ?? []) {
      if (floor === 1) { n.kind = 'combat'; continue; }
      if (floor === MAP.floors) { n.kind = 'boss'; continue; }
      // 倒数第二层是休整层：进 Boss 前一定有一次补给或修复的机会
      if (floor === MAP.floors - 1) {
        n.kind = rng.bool(0.5) ? 'shop' : 'mend';
        continue;
      }

      let chosen: RoomKind = 'combat';
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = rng.weighted(ROOM_WEIGHTS) as RoomKind;
        if (isAllowed(map, n, candidate)) { chosen = candidate; break; }
      }
      n.kind = chosen;
    }
  }
}

function isAllowed(map: RunMap, n: MapNode, kind: RoomKind): boolean {
  // 第 2 层不出精英 —— 刚上手就撞上一堆重甲太劝退
  if (kind === 'elite' && n.floor <= 2) return false;

  if (kind === 'shortcut') {
    if (!(MAP.shortcutFloors as readonly number[]).includes(n.floor)) return false;
    // 捷径门会把自己的出边改指到 floor+2，如果某个子节点只有这一个父节点，
    // 改完之后它就永远走不到了。只在不会产生孤儿节点时才允许。
    return n.next.every((childId) => (map.nodes.get(childId)?.prev.length ?? 0) > 1);
  }

  // 沿同一条路径，商店和修复站不能连着来两次
  if (kind === 'shop' || kind === 'mend') {
    return !n.prev.some((id) => map.nodes.get(id)?.kind === kind);
  }

  return true;
}

/** 保底：每张图至少 1 个商店、2 个精英房，否则构筑深度会随机到没有。 */
function enforceMinimums(map: RunMap, rng: RngStream): void {
  const countOf = (kind: RoomKind): number =>
    [...map.nodes.values()].filter((n) => n.kind === kind).length;

  const convertibleFor = (kind: RoomKind): MapNode[] =>
    [...map.nodes.values()].filter((n) => n.kind === 'combat' && isAllowed(map, n, kind));

  for (const [kind, min] of [['shop', MAP.minShops], ['elite', MAP.minElites]] as const) {
    let missing = min - countOf(kind);
    const pool = rng.shuffle(convertibleFor(kind));
    while (missing > 0 && pool.length > 0) {
      pool.pop()!.kind = kind;
      missing -= 1;
    }
  }
}

/**
 * 防止「两个捷径门跳到同一个子节点」。`isAllowed` 里对孤儿节点的检查
 * （子节点必须有 >1 个父节点）是逐个捷径门单独验证的：验证 A 的时候，
 * 子节点当时确实有 ≥2 个父节点，通过；验证 B 的时候，同一个子节点
 * 依然有 ≥2 个父节点（边的数量没变，只是父节点的「类型」还没定），
 * 也通过。等 A、B 都重定向完，各自都会把自己从子节点的 prev 里删掉——
 * 如果这个子节点的父节点恰好只有 A 和 B 这两个，两个都跳走之后，
 * 它就没有任何父节点了，变成一个进不去的孤儿房间。
 *
 * 这是继承自 v2 就存在的老 bug，试跑大范围 seed 校验精英路线保证时
 * 顺带撞见的——只留下第一个捷径门，其余降级为普通战斗房，从根上避免
 * 「同一个子节点被两个捷径门同时惦记」这件事发生。
 */
function preventSharedShortcutTarget(map: RunMap): void {
  for (const n of map.nodes.values()) {
    const shortcutParents = n.prev
      .map((id) => map.nodes.get(id))
      .filter((p): p is MapNode => p !== undefined && p.kind === 'shortcut');
    for (const extra of shortcutParents.slice(1)) extra.kind = 'combat';
  }
}

/**
 * 打断「连环捷径」：一个捷径门重定向后会落到的那个节点（它的「孙节点」，
 * 也就是它跳完之后玩家真正会站到的地方）如果自己也是捷径门，两次跳两层
 * 会叠加成跳穿 4 层，把这条路线上原本还能放精英房的楼层整段清空——
 * 试跑大范围 seed 时真的撞到过这种拓扑，撞完之后精英路线保证（见下面
 * ensureEliteCoverage）怎么修都修不回来，因为这条路线上除了两个捷径门
 * 本身，什么可转换的节点都不剩。
 *
 * 检查的是「孙节点」而不是直接的下一层节点——直接下一层就算是捷径门
 * 也不构成连环（那是两条不同的捷径分别从当前层各跳各的，不会叠加）；
 * 真正会叠加出问题的，是「跳完之后落脚的地方，本身又是一个捷径门」。
 * 必须在 rerouteShortcuts 改边之前算这个孙节点，因为下面用的是同一套
 * 「子节点的子节点」算法——改完边之后 next 已经跳到 floor+2，
 * 没法再用同一个算法反推。
 */
function preventChainedShortcuts(map: RunMap): void {
  for (const n of map.nodes.values()) {
    if (n.kind !== 'shortcut') continue;
    for (const childId of n.next) {
      for (const gcId of map.nodes.get(childId)?.next ?? []) {
        const gc = map.nodes.get(gcId);
        if (gc?.kind === 'shortcut') gc.kind = 'combat';
      }
    }
  }
}

/**
 * 把捷径门的出边改指到「孙节点」。
 *
 * 这样它在地图上就是一条画得出来的跨层斜边：你能亲眼看见它跳过了
 * 哪一层、绕开了哪个精英房、也错过了哪个商店。
 */
function rerouteShortcuts(map: RunMap): void {
  for (const n of map.nodes.values()) {
    if (n.kind !== 'shortcut') continue;

    // 改边之前先记一份被跳过那一层的房型，给地图提示用
    n.skippedKinds = n.next
      .map((childId) => map.nodes.get(childId)?.kind)
      .filter((k): k is RoomKind => k !== undefined);

    const grandchildren = new Set<string>();
    for (const childId of n.next) {
      for (const gcId of map.nodes.get(childId)?.next ?? []) grandchildren.add(gcId);
    }

    if (grandchildren.size === 0) { n.kind = 'combat'; continue; }

    for (const childId of n.next) {
      const child = map.nodes.get(childId);
      if (child) child.prev = child.prev.filter((id) => id !== n.id);
    }
    n.next = [...grandchildren];
    for (const gcId of n.next) {
      const gc = map.nodes.get(gcId);
      if (gc && !gc.prev.includes(n.id)) gc.prev.push(n.id);
    }
  }
}

// ---------------------------------------------------------------- 路线保证

/**
 * 精英房路线保证（DESIGN.md v3 §9.1）：
 *   1. 至少有一条路线连续经过 2 个精英房。
 *   2. 所有完整路线都可以到达至少 1 个精英房——不允许玩家从头到尾一个精英都不碰。
 *
 * 图是严格按层前进的 DAG（第 1 层入口 → ... → Boss），每个非 Boss 节点
 * 建图时至少有一条出边，所以「从入口能走到的节点」== 「在某条完整路线上的节点」，
 * 不需要真的枚举所有路线（列数 7、层数 8，最坏情况路线数会指数爆炸）。
 */

function hasConsecutiveElites(map: RunMap): boolean {
  for (const n of map.nodes.values()) {
    if (n.kind !== 'elite') continue;
    if (n.next.some((id) => map.nodes.get(id)?.kind === 'elite')) return true;
  }
  return false;
}

/** 从入口出发、绝不踏进精英房，最远能摸到哪些节点。 */
function collectEliteAvoiders(map: RunMap): Set<string> {
  const visited = new Set<string>();
  const stack = [...map.entries];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    const n = map.nodes.get(id);
    if (!n || n.kind === 'elite') continue; // 精英房是「避开精英」路径的终点，不再往后展开
    visited.add(id);
    stack.push(...n.next);
  }
  return visited;
}

/**
 * 一个节点能不能被精英路线修复逻辑顶替成精英房。
 *
 * 第 1–2 层、休整层、Boss 层是硬性规定死的房型，不能动。战斗房和修复站
 * 随便转（修复站没有「至少几个」的保底）。商店默认也能转，但
 * `allowShop=false` 时禁止——「一对相邻节点一起转」的调用点会传 false，
 * 因为如果这一对恰好都是商店、且全场只剩这两个商店，两个一起转掉会让
 * 商店总数跌破 `MAP.minShops`；单个转换的调用点各自实时检查数量，
 * 没有这个「两个一起消失」的风险，可以照常允许。
 *
 * `sacrificeLastShop` 是万不得已才打开的口子：极端 seed 下，「避开精英
 * 还能到 Boss」的路线上唯一能转的节点恰好是全图唯一的商店（试跑大范围
 * seed 真的撞到过）。这时候两条约束正面冲突——精英路线保证是 v3 新加的
 * 硬性要求，「至少 1 个商店」是继承自 v2 的保底，优先级更高的是前者，
 * 所以调用方只在前面所有候选都找不到时，才会带着这个参数再试最后一次。
 */
function isElitePromotable(map: RunMap, n: MapNode, opts: { allowShop?: boolean; sacrificeLastShop?: boolean } = {}): boolean {
  const { allowShop = true, sacrificeLastShop = false } = opts;
  if (n.floor <= 2 || n.floor >= MAP.floors - 1) return false;
  if (n.kind === 'combat' || n.kind === 'mend') return true;
  if (n.kind === 'shop' && allowShop) {
    if (sacrificeLastShop) return true;
    const shopCount = [...map.nodes.values()].filter((x) => x.kind === 'shop').length;
    return shopCount > MAP.minShops; // 不能把最后一个商店也转掉
  }
  return false;
}

/**
 * 补一条「连续两个精英」的路线。优先在已有精英房旁边接一个——通常够用，
 * 而且改动最小。如果两个已有精英都刚好卡在没法转换的邻居旁边（比如紧贴着
 * 休整层，前后不是战斗房），就退而求其次：随便找一对彼此相连、都能转成
 * 精英的节点，直接建一条全新的连续精英，不要求它挨着原有的精英房。
 *
 * 极端 seed 下战斗房可能一个都不剩（试跑大范围 seed 真的撞到过：某张图
 * 3–6 层全被随机成了精英/商店/修复站/捷径门，没有一个战斗房），所以两种
 * 策略都不能只认「战斗房」，得看 `isElitePromotable`。
 */
function ensureConsecutiveElites(map: RunMap, rng: RngStream): void {
  if (hasConsecutiveElites(map)) return;

  const promotable = (ids: readonly string[]): MapNode[] =>
    ids.map((id) => map.nodes.get(id)).filter((n): n is MapNode => n !== undefined && isElitePromotable(map, n));

  for (const e of rng.shuffle([...map.nodes.values()].filter((n) => n.kind === 'elite'))) {
    const forward = promotable(e.next);
    if (forward.length > 0) { rng.pick(forward).kind = 'elite'; return; }
    const backward = promotable(e.prev);
    if (backward.length > 0) { rng.pick(backward).kind = 'elite'; return; }
  }

  for (const a of rng.shuffle([...map.nodes.values()])) {
    if (!isElitePromotable(map, a, { allowShop: false })) continue;
    const partners = a.next
      .map((id) => map.nodes.get(id))
      .filter((n): n is MapNode => n !== undefined && isElitePromotable(map, n, { allowShop: false }));
    if (partners.length === 0) continue;
    a.kind = 'elite';
    rng.pick(partners).kind = 'elite';
    return;
  }
  // 真的连一对相邻的可转换节点都凑不出来：保留现状，好过错误地破坏其它约束
}

/**
 * 补齐「所有完整路线都必须经过至少 1 个精英房」：只要避开精英还能摸到
 * Boss，就在「避开精英能到达的节点」里挑一个能转的转成精英，再重新算
 * 一遍能摸到哪。优先转战斗房，其次修复站/商店（`isElitePromotable`）。
 *
 * 每次转换都会让「避开精英能到达的节点集合」严格变小（转掉的那个节点
 * 从集合里彻底出局，以后也不会再回来），图是有限的，所以一定会终止。
 *
 * 不能挑一条具体路线、只在这条路线上找候选——找到的第一条路线可能刚好
 * 全是转不了的房型，而另一条分支路线上其实就有能转的节点。按「所有当前
 * 可达节点」一起找候选，才不会因为挑错了代表路线而误判成「真的无解」
 * （这也是试跑时抓到的真实 bug：按单一路线找候选，在好几个 seed 上
 * 都提前放弃了明明可以修的地图）。
 */
function ensureEliteCoverage(map: RunMap): void {
  const maxAttempts = map.nodes.size; // 宽松上限：转换次数不可能超过节点总数
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const avoiders = collectEliteAvoiders(map);
    if (!avoiders.has(map.bossId)) return; // 避不开了，约束已经满足

    const avoiderNodes = [...avoiders].map((id) => map.nodes.get(id)!);
    const candidate =
      avoiderNodes.find((n) => n.kind === 'combat' && isElitePromotable(map, n)) ??
      avoiderNodes.find((n) => isElitePromotable(map, n)) ??
      // 万不得已：连最后一个商店都愿意牺牲，也不能留下一条完全避开精英的路
      avoiderNodes.find((n) => isElitePromotable(map, n, { sacrificeLastShop: true }));

    if (!candidate) return; // 避开精英能到的节点里一个能转的都没有：极端 seed，保留现状
    candidate.kind = 'elite';
  }
}

// ---------------------------------------------------------------- 查询
// 房间标签/提示文案已经搬进 i18n/strings.ts（Strings.rooms），
// 这样地图不用关心当前是哪种语言。
