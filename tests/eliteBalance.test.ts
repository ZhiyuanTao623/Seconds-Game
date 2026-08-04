import { describe, expect, it } from 'vitest';
import { Run } from '../src/game/run';
import { buildRoom } from '../src/game/room';

/**
 * 精英房数量护栏。
 *
 * 医疗兵上线那次只核算了"它本身该不该直接伤害玩家"，没有同步核算加进去
 * 之后精英房的总戏份——floor 6 一度堆到 5 重甲 + 8 杂兵 + 1 医疗兵 = 14 只，
 * 叠 1.35× 血量后重甲单个涨到 105.3hp，玩家反馈"太多太乱"+"太肥太痛"。
 *
 * 这里把"精英房到底有多少只、重甲占多少"钉成断言，以后再往 elitePlan
 * 加东西，这条测试会先炸给人看，而不是又要等玩家反馈才发现算爆了。
 */

const seeds = [1, 7, 42, 1234, 20260802];

/** 目前唯一会打到精英房的层数区间（见 map.ts 的"第 2 层不出精英"约束）。 */
const ELITE_FLOOR_RANGE = [3, 4, 5, 6] as const;

describe('精英房数量护栏', () => {
  it('重甲数量按 1+floor(层数/3) 走，不会又悄悄涨回去', () => {
    for (const seed of seeds) {
      const run = new Run(seed);
      for (const node of run.map.nodes.values()) {
        if (node.kind !== 'elite') continue;
        const world = buildRoom(run, node);
        const bruteCount = world.enemies.filter((e) => e.kind === 'brute').length;
        const expected = 1 + Math.floor(node.floor / 3);
        expect(bruteCount, `${node.id} (floor ${node.floor}) 重甲数量`).toBe(expected);
      }
    }
  });

  it('精英房总敌人数不超过 13——超了说明有人往里加东西时忘了核算总量', () => {
    for (const seed of seeds) {
      const run = new Run(seed);
      for (const node of run.map.nodes.values()) {
        if (node.kind !== 'elite') continue;
        const world = buildRoom(run, node);
        expect(world.enemies.length, `${node.id} (floor ${node.floor}) 总敌人数`).toBeLessThanOrEqual(13);
      }
    }
  });

  it('floor 3–6 精英房的重甲数量在 2–3 之间（不该出现降级前的 3–5）', () => {
    for (const floor of ELITE_FLOOR_RANGE) {
      const expected = 1 + Math.floor(floor / 3);
      expect(expected).toBeGreaterThanOrEqual(2);
      expect(expected).toBeLessThanOrEqual(3);
    }
  });
});
