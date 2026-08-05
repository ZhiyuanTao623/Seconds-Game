import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { makeWorld } from './helpers';
import type { InputSource, Button } from '../src/core/input';
import type { Enemy, EnemyState } from '../src/game/entities';
import type { World } from '../src/game/world';

/**
 * 蓄势模组三个专属强化：精准释放（窗口内松开强化伤害/后摇）、震荡（打断预警）、
 * 余震（原地埋定时爆炸）。命中类测试驱动真实的按住-松开左键流程；
 * 状态转换类测试（震荡）直接调用 world.interruptEnemy，不用真的模拟蓄力。
 */

const rng = new RngStream(1);

function frozenEnemy(x: number, y: number, kind: Parameters<typeof spawnEnemy>[0] = 'charger'): Enemy {
  const e = spawnEnemy(kind, rng, x, y);
  e.spd = 0;
  e.cd = 999;
  return e;
}

interface MouseState { down: boolean; pressedEdge: boolean; releasedEdge: boolean }

function chargeInput(aim: { x: number; y: number }, state: MouseState): InputSource {
  return {
    pointer: aim,
    isDown: () => false,
    wasPressed: () => false,
    isMouseDown: (btn: Button) => btn === 'left' && state.down,
    wasMousePressed: (btn: Button) => btn === 'left' && state.pressedEdge,
    wasMouseReleased: (btn: Button) => btn === 'left' && state.releasedEdge,
  };
}

/** 按住左键蓄力 `targetChargeT` 秒（按固定步长取整）后松开。 */
function chargeAndRelease(world: World, targetChargeT: number, aim = { x: 600, y: 300 }): void {
  const state: MouseState = { down: false, pressedEdge: false, releasedEdge: false };
  const input = chargeInput(aim, state);
  const holdFrames = Math.max(1, Math.round(targetChargeT / FIXED_STEP));

  state.down = true;
  state.pressedEdge = true;
  world.step(FIXED_STEP, input);
  state.pressedEdge = false;

  for (let i = 1; i < holdFrames; i++) world.step(FIXED_STEP, input);

  state.down = false;
  state.releasedEdge = true;
  world.step(FIXED_STEP, input);
}

describe('精准释放：窗口内松开强化伤害/后摇', () => {
  it('基础：窗口内（0.55–0.68s）松开，伤害 dmg×2.8，后摇 atkCd×1.3', () => {
    const world = makeWorld(['ch_release'], 'charge');
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300);
    world.enemies.push(e);

    const before = e.hp;
    chargeAndRelease(world, 0.60);

    expect(before - e.hp).toBeCloseTo(world.stats.dmg * 2.8, 1);
    expect(world.player.atkCd).toBeCloseTo(world.stats.atkCd * 1.3, 6);
  });

  it('窗口下限低于蓄满时间也算数——不需要真的攒够 chargeTime', () => {
    const world = makeWorld(['ch_release'], 'charge');
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300);
    world.enemies.push(e);

    expect(0.57).toBeLessThan(world.stats.chargeTime); // 0.57 < 0.60，普通蓄势斩不算「满蓄」
    const before = e.hp;
    chargeAndRelease(world, 0.57);

    // 仍然是精准释放的伤害，而不是没蓄满时退回的普通挥砍伤害
    expect(before - e.hp).toBeCloseTo(world.stats.dmg * 2.8, 1);
  });

  it('窗口外（远低于下限）松开，退回普通挥砍', () => {
    const world = makeWorld(['ch_release'], 'charge');
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300);
    world.enemies.push(e);

    const before = e.hp;
    chargeAndRelease(world, 0.20);

    expect(before - e.hp).toBeCloseTo(world.stats.dmg, 1); // 普通挥砍伤害，不是蓄力斩
  });

  it('完美时机：窗口收窄到 0.58–0.64s，伤害 dmg×3.6，命中≥2 个敌人减冲刺冷却', () => {
    const world = makeWorld(['ch_release'], 'charge', 4, new Map([['ch_release', 'a']]));
    world.player.x = 500; world.player.y = 300;
    const e1 = frozenEnemy(540, 300);
    const e2 = frozenEnemy(560, 320);
    world.enemies.push(e1, e2);
    world.player.dashCd = 1.0;

    const before1 = e1.hp;
    chargeAndRelease(world, 0.60);

    expect(before1 - e1.hp).toBeCloseTo(world.stats.dmg * 3.6, 1);

    // dashCd 是真实倒计时，蓄力攒够 0.60s 的这段时间它自己也在自然递减——
    // 跟一个「没有命中 2 个敌人所以不该有额外返还」的对照组比差值，
    // 把这段共同的自然递减消掉，只留下完美时机本身的贡献。
    const control = makeWorld(['ch_release'], 'charge', 4, new Map([['ch_release', 'a']]));
    control.player.x = 500; control.player.y = 300;
    control.player.dashCd = 1.0;
    chargeAndRelease(control, 0.60); // 附近没有敌人，命中数为 0，不触发额外返还

    expect(control.player.dashCd - world.player.dashCd).toBeCloseTo(0.30, 6);
  });

  it('完美时机：0.55s 在旧窗口内，但新窗口下限是 0.58s，应该退回普通挥砍', () => {
    const world = makeWorld(['ch_release'], 'charge', 4, new Map([['ch_release', 'a']]));
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300);
    world.enemies.push(e);

    const before = e.hp;
    chargeAndRelease(world, 0.55);

    expect(before - e.hp).toBeCloseTo(world.stats.dmg, 1);
  });

  it('宽容节拍：一个敌人都没命中时，后摇再打对折', () => {
    const world = makeWorld(['ch_release'], 'charge', 4, new Map([['ch_release', 'b']]));
    world.player.x = 500; world.player.y = 300;
    // 故意不放任何敌人在范围内

    chargeAndRelease(world, 0.60);

    // 宽容节拍伤害倍率下的后摇是 atkCd × 1.3，未命中再打对折
    expect(world.player.atkCd).toBeCloseTo(world.stats.atkCd * 1.3 * 0.5, 6);
  });
});

describe('震荡：蓄力攻击打断敌人预警', () => {
  const kinds: Array<Parameters<typeof spawnEnemy>[0]> = ['charger', 'shooter', 'brute', 'medic'];

  for (const kind of kinds) {
    it(`能打断 ${kind} 的预警`, () => {
      const world = makeWorld(['ch_shock'], 'charge');
      const e = frozenEnemy(500, 300, kind);
      e.state = 'telegraph';
      e.t = 5;
      world.enemies.push(e);

      const interrupted = world.interruptEnemy(e);

      expect(interrupted).toBe(true);
      expect(e.state).toBe('idle');
      expect(e.cd).toBeGreaterThan(0);
    });
  }

  it('不能打断 Boss', () => {
    const world = makeWorld(['ch_shock'], 'charge');
    const boss = spawnEnemy('boss', rng, 500, 150);
    (boss as Enemy).state = 'telegraph' as EnemyState;
    world.enemies.push(boss);

    expect(world.interruptEnemy(boss)).toBe(false);
  });

  it('不在预警状态（比如 idle）时打不断', () => {
    const world = makeWorld(['ch_shock'], 'charge');
    const e = frozenEnemy(500, 300);
    e.state = 'idle';
    world.enemies.push(e);

    expect(world.interruptEnemy(e)).toBe(false);
  });

  it('封招：被打断的敌人额外硬直 1.2s，冷却延长到 ×1.4', () => {
    const world = makeWorld(['ch_shock'], 'charge', 4, new Map([['ch_shock', 'a']]));
    const e = frozenEnemy(500, 300);
    e.state = 'telegraph';
    world.enemies.push(e);

    world.interruptEnemy(e);

    expect(e.stunT).toBeCloseTo(1.2, 6);
  });

  it('硬直期间敌人完全冻结——不移动也不倒计时', () => {
    const world = makeWorld(['ch_shock'], 'charge', 4, new Map([['ch_shock', 'a']]));
    const e = frozenEnemy(500, 300);
    e.spd = 999; // 就算给它速度，硬直也不该让它动
    e.state = 'telegraph';
    world.enemies.push(e);
    world.interruptEnemy(e);

    const cdBefore = e.cd;
    const xBefore = e.x;
    for (let i = 0; i < 30; i++) world.step(FIXED_STEP, idle());

    expect(e.x).toBe(xBefore);
    expect(e.cd).toBe(cdBefore);
  });

  it('反震：本次蓄力斩每打断一个敌人额外造成 dmg×0.35 伤害', () => {
    const world = makeWorld(['ch_shock'], 'charge', 4, new Map([['ch_shock', 'b']]));
    world.player.x = 500; world.player.y = 300;
    const e1 = frozenEnemy(540, 300);
    const e2 = frozenEnemy(560, 320);
    // t 要给够——冲锋兵的 telegraph 会自己倒计时，t=0 在蓄力攒够之前就
    // 提前进了 attack 状态，带着固定冲刺速度飞走，蓄力斩落地时早就打不到了
    e1.state = 'telegraph'; e1.t = 999;
    e2.state = 'telegraph'; e2.t = 999;
    world.enemies.push(e1, e2);

    const before1 = e1.hp;
    chargeAndRelease(world, 0.60);

    // 两个都被打断：反震加成 = min(2,3) × 0.35 × dmg，叠加在每一下命中上
    const expectedBonus = 2 * 0.35 * world.stats.dmg;
    expect(before1 - e1.hp).toBeCloseTo(world.stats.dmg * world.stats.chargeDamageMult + expectedBonus, 1);
  });
});

describe('余震：蓄力斩释放位置留一个定时爆炸区', () => {
  it('基础：0.35s 后触发，伤害 dmg×65%', () => {
    const world = makeWorld(['ch_after'], 'charge');
    world.player.x = 500; world.player.y = 300;

    chargeAndRelease(world, 0.60, { x: 500, y: 200 }); // 瞄准方向不重要，攻击是 360°

    const target = frozenEnemy(500, 300); // 蓄力斩就是在玩家当前位置释放
    world.enemies.push(target);

    for (let i = 0; i < 30; i++) world.step(FIXED_STEP, idle());
    expect(target.hp).toBe(target.maxHp); // 还没到 0.35s

    for (let i = 0; i < 20; i++) world.step(FIXED_STEP, idle());
    expect(target.hp).toBeCloseTo(target.maxHp - world.stats.dmg * 0.65, 6);
  });

  it('二重余震：两段伤害分别是 55% 和 85%', () => {
    const world = makeWorld(['ch_after'], 'charge', 4, new Map([['ch_after', 'a']]));
    world.player.x = 500; world.player.y = 300;

    chargeAndRelease(world, 0.60, { x: 500, y: 200 });

    const target = frozenEnemy(500, 300);
    world.enemies.push(target);

    for (let i = 0; i < 50; i++) world.step(FIXED_STEP, idle()); // ≈0.42s：第一段该炸了
    expect(target.hp).toBeCloseTo(target.maxHp - world.stats.dmg * 0.55, 6);

    for (let i = 0; i < 50; i++) world.step(FIXED_STEP, idle()); // 累计 ≈0.83s：第二段也该炸了
    expect(target.hp).toBeCloseTo(target.maxHp - world.stats.dmg * 0.55 - world.stats.dmg * 0.85, 6);
  });

  it('扩散余震：半径更大，命中会有额外击退', () => {
    const world = makeWorld(['ch_after'], 'charge', 4, new Map([['ch_after', 'b']]));
    world.player.x = 500; world.player.y = 300;

    chargeAndRelease(world, 0.60, { x: 500, y: 200 });

    // 基础余震半径 = range(chargeRangeMult 后) × 0.8；扩散余震是 × 1.35，
    // 放一个只有扩散版本才够得到的敌人
    const wideRadius = world.stats.range * world.stats.chargeRangeMult * world.stats.aftershockRadiusMult;
    const narrowRadius = world.stats.range * world.stats.chargeRangeMult * 0.8;
    expect(wideRadius).toBeGreaterThan(narrowRadius);

    const target = frozenEnemy(500 + (narrowRadius + wideRadius) / 2, 300);
    world.enemies.push(target);

    for (let i = 0; i < 50; i++) world.step(FIXED_STEP, idle());

    expect(target.hp).toBeLessThan(target.maxHp);
    expect(target.knockback.x).not.toBe(0);
  });

  it('递归禁令：余震爆炸（AFTEREFFECT）不会再排出新的余震', () => {
    const world = makeWorld(['ch_after'], 'charge');
    world.player.x = 500; world.player.y = 300;

    chargeAndRelease(world, 0.60, { x: 500, y: 200 });
    for (let i = 0; i < 60; i++) world.step(FIXED_STEP, idle());

    expect(world.timeline.pending).toBe(0);
  });
});

function idle(): InputSource {
  return {
    pointer: { x: 0, y: 0 },
    isDown: () => false,
    wasPressed: () => false,
    isMouseDown: () => false,
    wasMousePressed: () => false,
    wasMouseReleased: () => false,
  };
}
