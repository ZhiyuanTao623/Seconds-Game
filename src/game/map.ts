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
  rerouteShortcuts(map);

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
 * 把捷径门的出边改指到「孙节点」。
 *
 * 这样它在地图上就是一条画得出来的跨层斜边：你能亲眼看见它跳过了
 * 哪一层、绕开了哪个精英房、也错过了哪个商店。
 */
function rerouteShortcuts(map: RunMap): void {
  for (const n of map.nodes.values()) {
    if (n.kind !== 'shortcut') continue;

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

// ---------------------------------------------------------------- 查询
// 房间标签/提示文案已经搬进 i18n/strings.ts（Strings.rooms），
// 这样地图不用关心当前是哪种语言。
