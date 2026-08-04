import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/game/config';
import { Ledger } from '../src/game/ledger';
import { Run } from '../src/game/run';
import { buildRoom } from '../src/game/room';
import { upgradeById } from '../src/game/upgrades';
import { assertChargeMatchesLabel, recordCharges } from './helpers';
import type { InputSource } from '../src/core/input';
import type { MapNode } from '../src/game/map';
import type { ModuleId } from '../src/game/modules';
import type { World } from '../src/game/world';

/**
 * 真实循环 fuzz。
 *
 * 跑完整的房间（真的敌人、真的 Boss、真的子弹），然后对**每一笔**扣款断言：
 * 这笔钱正好等于那一刻价签上会显示的数字。
 *
 * 这条断言能同时抓住三类回归：
 *   · 有人在别处重算了报价，和 penaltyFor 走岔了
 *   · 无敌期间漏了判断，收了不该收的钱
 *   · 多段招式（Boss 震波）落地时报价跳回了接触价
 */

/** 线性同余。跟游戏本体的 seed 流无关，只用来抖动测试输入。 */
function testRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface FuzzInput extends InputSource {
  advance(): void;
}

/** 一个会乱按的假玩家：让走位、冲刺、挥砍、蓄力都真的发生。 */
function chaoticInput(rand: () => number): FuzzInput {
  const pointer = { x: 500, y: 300 };
  let leftDown = false;
  let leftEdge = false;
  let releaseEdge = false;
  let dashEdge = false;
  let moving = false;

  return {
    pointer,
    isDown: () => moving,
    wasPressed: () => dashEdge,
    isMouseDown: () => leftDown,
    wasMousePressed: () => leftEdge,
    wasMouseReleased: () => releaseEdge,
    advance(): void {
      pointer.x = rand() * 1000;
      pointer.y = rand() * 620;
      moving = rand() < 0.7;
      dashEdge = rand() < 0.02;
      const wantLeft = rand() < 0.6;
      leftEdge = wantLeft && !leftDown;
      releaseEdge = !wantLeft && leftDown;
      leftDown = wantLeft;
    },
  };
}

function simulate(world: World, steps: number, rand: () => number): void {
  const input = chaoticInput(rand);
  for (let i = 0; i < steps; i++) {
    input.advance();
    world.step(FIXED_STEP, input);
  }
}

const firstNode = (run: Run): MapNode => run.map.byFloor[0]![0]!;

/** 三个模组基础能力（刃弹/掠影穿刺/蓄力斩）轮流覆盖到，而不用把每个 seed 都跑三遍。 */
const MODULES: readonly ModuleId[] = ['blade', 'dash', 'charge'];

describe('真实循环 fuzz：每一笔扣款都等于当时的价签', () => {
  const seeds = [1, 42, 777, 20260802, 999983];
  seeds.forEach((seed, i) => {
    const module = MODULES[i % MODULES.length]!;
    it(`seed ${seed} · ${module} 模组 · 跑遍这张地图上的每一个战斗房`, () => {
      const run = new Run(seed, module);
      const rand = testRng(seed);
      let totalCharges = 0;

      const combatNodes = [...run.map.nodes.values()].filter(
        (n) => n.kind === 'combat' || n.kind === 'elite' || n.kind === 'boss',
      );
      expect(combatNodes.length).toBeGreaterThan(0);

      for (const node of combatNodes) {
        const world = buildRoom(run, node);
        const charges = recordCharges(world);

        simulate(world, node.kind === 'boss' ? 2400 : 900, rand);
        for (const c of charges) assertChargeMatchesLabel(c);
        totalCharges += charges.length;

        // 房间一走，所有排期作废 —— 不会有回调活得比它所属的战斗更久
        world.timeline.clear();
        expect(world.timeline.pending).toBe(0);
      }

      // fuzz 一次都没挨打的话，这个测试其实什么都没验证
      expect(totalCharges, 'fuzz 强度不够：整局一次都没被收钱').toBeGreaterThan(0);
    });
  });

  it('拿满全部通用强化也不会让报价和实扣走岔', () => {
    const run = new Run(31337, 'blade');
    for (const id of ['un_gale', 'un_blade', 'un_tough', 'un_abacus']) {
      const u = upgradeById(id);
      if (u) run.takeUpgrade(u);
    }

    const bossNode = run.map.nodes.get(run.map.bossId);
    expect(bossNode).toBeDefined();

    const world = buildRoom(run, bossNode!);
    const charges = recordCharges(world);
    simulate(world, 2400, testRng(5));

    for (const c of charges) assertChargeMatchesLabel(c);
    expect(charges.length).toBeGreaterThan(0);
  });
});

describe('无敌与僵直', () => {
  const world = (seed: number): World => {
    const run = new Run(seed, 'blade');
    return buildRoom(run, firstNode(run));
  };

  it('无敌期间一秒都不扣', () => {
    const w = world(11);
    w.player.inv = 1;
    w.hitPlayer(99);
    expect(w.ledger.penalty).toBe(0);
  });

  it('僵直必须短于无敌 —— 否则僵直一结束就站在原地挨第二下', () => {
    const w = world(12);
    w.hitPlayer(2);
    expect(w.player.hitstunTotal).toBeLessThan(w.player.inv);
  });

  it('围殴护栏：连击到第 3 下起僵直减半', () => {
    const w = world(13);
    const stuns: number[] = [];
    for (let i = 0; i < 4; i++) {
      w.player.inv = 0;
      w.hitPlayer(2);
      stuns.push(w.player.hitstunTotal);
    }
    expect(stuns[0]).toBe(stuns[1]);
    expect(stuns[2]).toBeCloseTo(stuns[0]! / 2, 9);
    expect(stuns[3]).toBeCloseTo(stuns[0]! / 2, 9);
  });

});

describe('账本', () => {
  it('总时间 = 游戏 + 受击 + 消费 − 返还', () => {
    const ledger = new Ledger();
    ledger.tick(10);
    ledger.addPenalty(3);
    ledger.addSpend(5);
    ledger.addRefund(1);
    expect(ledger.total).toBeCloseTo(10 + 3 + 5 - 1, 9);
  });

  it('时间修复站按比例抹掉受击惩罚', () => {
    const ledger = new Ledger();
    ledger.addPenalty(20);
    expect(ledger.mendPenalty(0.4)).toBeCloseTo(8, 9);
    expect(ledger.penalty).toBeCloseTo(12, 9);
  });
});
