import { describe, expect, it } from 'vitest';
import { MAP } from '../src/game/config';
import { Run } from '../src/game/run';
import { generateMap } from '../src/game/map';
import { RngStream } from '../src/core/rng';
import { buildRoom } from '../src/game/room';
import type { RunMap } from '../src/game/map';

const SEEDS = [1, 7, 42, 1234, 20260802, 999983, 31337, 65535];

const mapFor = (seed: number): RunMap => generateMap(new RngStream(seed).derive('map'));

/** 把整张图压成一个字符串，用来做「同 seed 必须完全一致」的比对。 */
function fingerprint(map: RunMap): string {
  return [...map.nodes.values()]
    .sort((a, b) => a.floor - b.floor || a.col - b.col)
    .map((n) => `${n.id}:${n.kind}>${[...n.next].sort().join(',')}`)
    .join('|');
}

describe('Seed 可复现', () => {
  it('同一个 seed 永远生成同一张地图', () => {
    for (const seed of SEEDS) {
      expect(fingerprint(mapFor(seed))).toBe(fingerprint(mapFor(seed)));
    }
  });

  it('不同 seed 生成不同地图', () => {
    const prints = new Set(SEEDS.map((s) => fingerprint(mapFor(s))));
    expect(prints.size).toBe(SEEDS.length);
  });

  it('房间内容按节点独立派生 —— 玩家在别处做了什么都不影响它', () => {
    const a = new Run(555, 'blade');
    const b = new Run(555, 'blade');
    const node = a.map.byFloor[0]![0]!;

    // b 先在别的地方消耗一堆随机，再建同一个房间
    const other = b.rngFor('noise');
    for (let i = 0; i < 500; i++) other.float();

    const roomA = buildRoom(a, node);
    const roomB = buildRoom(b, b.map.nodes.get(node.id)!);

    expect(roomA.enemies.map((e) => `${e.kind}@${e.x.toFixed(3)},${e.y.toFixed(3)}`))
      .toEqual(roomB.enemies.map((e) => `${e.kind}@${e.x.toFixed(3)},${e.y.toFixed(3)}`));
    expect(roomA.arena.walls).toEqual(roomB.arena.walls);
  });
});

describe('地图结构约束', () => {
  it('第 1 层全是战斗房', () => {
    for (const seed of SEEDS) {
      for (const n of mapFor(seed).byFloor[0]!) expect(n.kind).toBe('combat');
    }
  });

  it('顶层是唯一的 Boss 节点，所有路径汇聚于此', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const top = map.byFloor[MAP.floors - 1]!;
      expect(top.length).toBe(1);
      expect(top[0]!.kind).toBe('boss');
      for (const n of map.byFloor[MAP.floors - 2]!) {
        expect(n.next).toContain(map.bossId);
      }
    }
  });

  it('倒数第二层是休整层：只出商店或修复站', () => {
    for (const seed of SEEDS) {
      for (const n of mapFor(seed).byFloor[MAP.floors - 2]!) {
        expect(['shop', 'mend']).toContain(n.kind);
      }
    }
  });

  it('第 1–2 层不出精英房', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const n of [...map.byFloor[0]!, ...map.byFloor[1]!]) {
        expect(n.kind).not.toBe('elite');
      }
    }
  });

  it('保底：每张图至少 1 个商店、2 个精英房', () => {
    for (const seed of SEEDS) {
      const kinds = [...mapFor(seed).nodes.values()].map((n) => n.kind);
      expect(kinds.filter((k) => k === 'shop').length).toBeGreaterThanOrEqual(MAP.minShops);
      expect(kinds.filter((k) => k === 'elite').length).toBeGreaterThanOrEqual(MAP.minElites);
    }
  });

  it('至少有一条路线连续经过 2 个精英房（DESIGN.md v3 §9.1）', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const hasConsecutive = [...map.nodes.values()].some(
        (n) => n.kind === 'elite' && n.next.some((id) => map.nodes.get(id)?.kind === 'elite'),
      );
      expect(hasConsecutive, `seed ${seed} 没有连续两个精英房的路线`).toBe(true);
    }
  });

  it('所有完整路线都能到达至少 1 个精英房——不存在完全绕开精英的路线（DESIGN.md v3 §9.1）', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      // 从入口出发、绝不踏进精英房，看最远能不能摸到 Boss
      const visited = new Set<string>();
      const stack = [...map.entries];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        const n = map.nodes.get(id);
        if (!n || n.kind === 'elite') continue;
        visited.add(id);
        stack.push(...n.next);
      }
      expect(visited.has(map.bossId), `seed ${seed} 存在完全避开精英房也能到 Boss 的路线`).toBe(false);
    }
  });

  it('精英路线两条约束、孤儿节点、保底商店在大范围 seed 上都成立（覆盖修复逻辑碰到的各种拓扑）', () => {
    // 这条测试是在开发期间用来大范围试跑、逐一揪出修复逻辑边界情况的产物——
    // 过程中先后抓到三个真实 bug：①按「整层转换」堵精英路线，堵不住借道捷径
    // 绕过去的路线；②只在「单独一条代表路线」上找可转换节点，找错代表路线时
    // 会误判成无解；③两个捷径门重定向后可能同时跳离同一个子节点，如果那正好
    // 是它唯一的两个父节点，它会变成谁都进不去的孤儿房间（这是继承自 v2 就
    // 存在的老 bug，不是这次新加的）。20000 个 seed 的验证见开发过程记录，
    // 这里留 2000 个作为长期回归门槛，兼顾覆盖面和测试跑起来的速度。
    for (let seed = 0; seed < 2000; seed++) {
      const map = mapFor(seed);

      const hasConsecutive = [...map.nodes.values()].some(
        (n) => n.kind === 'elite' && n.next.some((id) => map.nodes.get(id)?.kind === 'elite'),
      );
      expect(hasConsecutive, `seed ${seed} 没有连续两个精英房的路线`).toBe(true);

      const visited = new Set<string>();
      const stack = [...map.entries];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        const n = map.nodes.get(id);
        if (!n || n.kind === 'elite') continue;
        visited.add(id);
        stack.push(...n.next);
      }
      expect(visited.has(map.bossId), `seed ${seed} 存在完全避开精英房也能到 Boss 的路线`).toBe(false);

      for (const n of map.nodes.values()) {
        if (n.floor === 1) continue;
        expect(n.prev.length, `seed ${seed} 节点 ${n.id} 是孤儿，没有任何父节点`).toBeGreaterThan(0);
      }
    }
  });

  it('沿同一条路径，商店和修复站不连着来两次', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const n of map.nodes.values()) {
        if (n.kind !== 'shop' && n.kind !== 'mend') continue;
        // 休整层是硬性规定的，不受这条约束管
        if (n.floor === MAP.floors - 1) continue;
        for (const parentId of n.prev) {
          expect(map.nodes.get(parentId)?.kind).not.toBe(n.kind);
        }
      }
    }
  });

  it('捷径门跳两层，且只出现在允许的层', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const n of map.nodes.values()) {
        if (n.kind !== 'shortcut') continue;
        expect(MAP.shortcutFloors as readonly number[]).toContain(n.floor);
        for (const id of n.next) {
          expect(map.nodes.get(id)!.floor - n.floor).toBe(2);
        }
      }
    }
  });

  it('没有孤儿节点：除第 1 层外，每个节点都至少有一个父节点', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const n of map.nodes.values()) {
        if (n.floor === 1) continue;
        expect(n.prev.length, `${n.id} 走不到`).toBeGreaterThan(0);
      }
    }
  });

  it('每个起点都能走到 Boss', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const entry of map.entries) {
        const seen = new Set<string>();
        const stack = [entry];
        let reached = false;
        while (stack.length > 0) {
          const id = stack.pop()!;
          if (seen.has(id)) continue;
          seen.add(id);
          if (id === map.bossId) { reached = true; break; }
          stack.push(...(map.nodes.get(id)?.next ?? []));
        }
        expect(reached, `${entry} 走不到 Boss`).toBe(true);
      }
    }
  });

  it('同层的边不交叉 —— 交叉的地图读不懂', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (let floor = 1; floor < MAP.floors; floor++) {
        const edges: { from: number; to: number }[] = [];
        for (const n of map.byFloor[floor - 1]!) {
          // 捷径门是有意跨层的斜边，不参与同层交叉检查
          if (n.kind === 'shortcut') continue;
          for (const id of n.next) {
            const child = map.nodes.get(id)!;
            if (child.floor !== floor + 1) continue;
            edges.push({ from: n.col, to: child.col });
          }
        }
        for (const a of edges) {
          for (const b of edges) {
            const crossing = (a.from < b.from && a.to > b.to) || (a.from > b.from && a.to < b.to);
            expect(crossing, `第 ${floor} 层有交叉边`).toBe(false);
          }
        }
      }
    }
  });
});

describe('布局白名单', () => {
  it('Boss 房固定空场；层数 ≥3 的战斗房与精英房都不出空场', () => {
    const EMPTY_LAYOUT_WALLS = 0;

    for (const seed of SEEDS) {
      const run = new Run(seed, 'blade');
      for (const node of run.map.nodes.values()) {
        if (node.kind === 'shop' || node.kind === 'mend' || node.kind === 'shortcut') continue;
        const world = buildRoom(run, node);
        const wallCount = world.arena.walls.length;

        if (node.kind === 'boss') {
          expect(wallCount, 'Boss 房必须是空场').toBe(EMPTY_LAYOUT_WALLS);
        } else if (node.kind === 'elite' || node.floor >= 3) {
          expect(wallCount, `${node.id} 需要掩体`).toBeGreaterThan(EMPTY_LAYOUT_WALLS);
        }
      }
    }
  });
});
