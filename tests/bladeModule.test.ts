import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/game/config';
import { IDLE_INPUT } from '../src/core/input';
import { spawnEnemy } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { makeWorld } from './helpers';
import type { Bullet, Enemy } from '../src/game/entities';
import type { World } from '../src/game/world';

/**
 * 飞刃模组三个专属强化：贯刃（穿透）、回旋（去而复返）、刃印（叠层/消耗/引爆）。
 *
 * 敌人用 spawnEnemy 造，但立刻冻住（spd=0、cd=极大)——只借用它的 hp/半径，
 * 不需要它的 AI 在测试过程中乱走，位置判定才能保持确定性。
 */

const rng = new RngStream(1);

function frozenEnemy(x: number, y: number): Enemy {
  const e = spawnEnemy('charger', rng, x, y);
  e.spd = 0;
  e.cd = 999;
  return e;
}

function step(world: World, times: number): void {
  for (let i = 0; i < times; i++) world.step(FIXED_STEP, IDLE_INPUT);
}

describe('贯刃：穿透', () => {
  it('基础（穿 1 个，falloff 0.75）：第二下伤害打折，命中 2 个后消失', () => {
    const world = makeWorld(['bl_pierce']);
    world.player.x = 500; world.player.y = 300;
    const e1 = frozenEnemy(540, 300);
    const e2 = frozenEnemy(580, 300);
    world.enemies.push(e1, e2);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10,
      pierceMode: 'stack', pierceLeft: 1, pierceFalloff: 0.75, hitEnemies: new Set(),
    };
    world.bullets.push(bullet);

    step(world, 40);

    expect(e1.hp).toBeCloseTo(e1.maxHp - 10, 6);
    expect(e2.hp).toBeCloseTo(e2.maxHp - 7.5, 6);
    expect(world.bullets.length).toBe(0);
  });

  it('无阻（穿 3 个，falloff 0.85）：伤害逐次复合衰减', () => {
    const world = makeWorld(['bl_pierce'], 'blade', 4, new Map([['bl_pierce', 'a']]));
    world.player.x = 500; world.player.y = 300;
    const enemies = [frozenEnemy(540, 300), frozenEnemy(580, 300), frozenEnemy(620, 300)];
    world.enemies.push(...enemies);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10,
      pierceMode: 'stack', pierceLeft: 3, pierceFalloff: 0.85, hitEnemies: new Set(),
    };
    world.bullets.push(bullet);

    step(world, 50);

    expect(enemies[0]!.hp).toBeCloseTo(enemies[0]!.maxHp - 10, 6);
    expect(enemies[1]!.hp).toBeCloseTo(enemies[1]!.maxHp - 10 * 0.85, 6);
    expect(enemies[2]!.hp).toBeCloseTo(enemies[2]!.maxHp - 10 * 0.85 * 0.85, 6);
  });

  it('贯心：第二个目标 +80% 伤害后立即消失，不会有第三下', () => {
    const world = makeWorld(['bl_pierce'], 'blade', 4, new Map([['bl_pierce', 'b']]));
    world.player.x = 500; world.player.y = 300;
    const enemies = [frozenEnemy(540, 300), frozenEnemy(580, 300), frozenEnemy(620, 300)];
    world.enemies.push(...enemies);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10,
      pierceMode: 'finale', pierceLeft: 1, pierceBonus: 1.8, hitEnemies: new Set(),
    };
    world.bullets.push(bullet);

    step(world, 60);

    expect(enemies[0]!.hp).toBeCloseTo(enemies[0]!.maxHp - 10, 6);
    expect(enemies[1]!.hp).toBeCloseTo(enemies[1]!.maxHp - 18, 6);
    expect(enemies[2]!.hp).toBe(enemies[2]!.maxHp); // 没轮到第三个
    expect(world.bullets.length).toBe(0);
  });
});

describe('回旋：去而复返', () => {
  it('基础：撞到最大距离转身回程，同一个敌人去程回程各命中一次', () => {
    const world = makeWorld(['bl_return']);
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300); // 60px 处，去程回程都会经过
    world.enemies.push(e);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10, hitEnemies: new Set(),
      phase: 'out', maxRange: 200, originX: 500, originY: 300,
    };
    world.bullets.push(bullet);

    // 去程命中一次
    step(world, 15);
    expect(e.hp).toBeCloseTo(e.maxHp - 10, 6);

    // 继续飞到 200px 转身，再飞回来，第二次经过同一个敌人
    step(world, 80);
    expect(e.hp).toBeCloseTo(e.maxHp - 20, 6);

    // 没有环身，飞回玩家身边后应该消失
    step(world, 40);
    expect(world.bullets.length).toBe(0);
  });

  it('归刃：回程速度和伤害都提升', () => {
    const world = makeWorld(['bl_return'], 'blade', 4, new Map([['bl_return', 'a']]));
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(560, 300);
    world.enemies.push(e);

    expect(world.stats.bladeReturnSpeed).toBe(820);
    expect(world.stats.bladeReturnDamageMult).toBeCloseTo(1.35, 9);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10, hitEnemies: new Set(),
      phase: 'out', maxRange: 200, originX: 500, originY: 300,
    };
    world.bullets.push(bullet);

    step(world, 15); // 去程命中：原始伤害
    expect(e.hp).toBeCloseTo(e.maxHp - 10, 6);

    step(world, 60); // 转身 + 回程命中：×1.35
    expect(e.hp).toBeCloseTo(e.maxHp - 10 - 10 * 1.35, 6);
  });

  it('环身：回到玩家身边后环绕一段时间，期间命中范围内的敌人各一次', () => {
    const world = makeWorld(['bl_return'], 'blade', 4, new Map([['bl_return', 'b']]));
    world.player.x = 500; world.player.y = 300;
    // 环绕半径固定在玩家附近；放一个敌人在环绕轨迹经过的范围内
    const e = frozenEnemy(500, 340);
    world.enemies.push(e);

    const bullet: Bullet = {
      x: 500, y: 300, vx: 620, vy: 0, r: 5, pen: 0, life: 0.9, dead: false,
      hostile: false, damage: 10, hitEnemies: new Set(),
      phase: 'out', maxRange: 40, originX: 500, originY: 300,
    };
    world.bullets.push(bullet);

    // 飞出去（不会碰到敌人，敌人在玩家附近）、转身回程、进入环绕
    step(world, 20);
    const afterReturn = world.bullets[0];
    expect(afterReturn?.phase).toBe('orbit');

    // 环绕 0.8s（96 步），足够转一整圈碰到敌人
    step(world, 100);

    expect(e.hp).toBeLessThan(e.maxHp);
    expect(world.bullets.length).toBe(0); // 环绕结束后消失
  });
});

describe('刃印：叠层、消耗、引爆', () => {
  it('基础：BLADE 命中叠层（封顶 3），MELEE 命中消耗并按层数加伤', () => {
    const world = makeWorld(['bl_mark']);
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);

    world.damageEnemy(e, 5, 'BLADE');
    world.damageEnemy(e, 5, 'BLADE');
    world.damageEnemy(e, 5, 'BLADE');
    expect(e.markStacks).toBe(3);
    expect(e.markT).toBeCloseTo(3.0, 9);

    // 第 4 下：封顶，不会变成 4 层
    world.damageEnemy(e, 5, 'BLADE');
    expect(e.markStacks).toBe(3);

    const hpBeforeMelee = e.hp;
    world.damageEnemy(e, 12, 'MELEE');
    // 12（普通挥砍） + 12(dmg) × 0.20 × 3 层 = 19.2
    expect(hpBeforeMelee - e.hp).toBeCloseTo(19.2, 6);
    expect(e.markStacks).toBe(0);
  });

  it('刃印会随时间过期', () => {
    const world = makeWorld(['bl_mark']);
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);

    world.damageEnemy(e, 5, 'BLADE');
    expect(e.markStacks).toBe(1);

    step(world, 400); // 400/120 ≈ 3.33s，超过 3.0s 的持续时间
    expect(e.markStacks).toBe(0);
  });

  it('猎印：层数越高，普通挥砍伤害倍率越高，且仍叠加固定加成', () => {
    const world = makeWorld(['bl_mark'], 'blade', 4, new Map([['bl_mark', 'a']]));
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);

    expect(world.stats.markMax).toBe(5);
    for (let i = 0; i < 4; i++) world.damageEnemy(e, 5, 'BLADE');
    expect(e.markStacks).toBe(4);

    const before = e.hp;
    world.damageEnemy(e, 12, 'MELEE');
    // (12 × (1 + 0.05×4)) + 12×0.20×4 = 14.4 + 9.6 = 24
    expect(before - e.hp).toBeCloseTo(24, 6);
  });

  it('爆印：叠满 3 层自动引爆，本体 + 周围溅射，之后不再等挥砍消耗', () => {
    const world = makeWorld(['bl_mark'], 'blade', 4, new Map([['bl_mark', 'b']]));
    const target = frozenEnemy(500, 300);
    const nearby = frozenEnemy(540, 300); // 40px < 90px 溅射半径
    const faraway = frozenEnemy(700, 300); // 远超溅射半径
    world.enemies.push(target, nearby, faraway);

    world.damageEnemy(target, 5, 'BLADE');
    world.damageEnemy(target, 5, 'BLADE');
    expect(target.markStacks).toBe(2);

    const targetHpBefore = target.hp;
    const nearbyHpBefore = nearby.hp;
    world.damageEnemy(target, 5, 'BLADE'); // 第 3 层：自动引爆

    // 本体：这一下的 5 点 + 引爆 12×0.9
    expect(targetHpBefore - target.hp).toBeCloseTo(5 + 12 * 0.9, 6);
    // 溅射：12×0.45
    expect(nearbyHpBefore - nearby.hp).toBeCloseTo(12 * 0.45, 6);
    expect(faraway.hp).toBe(faraway.maxHp);
    expect(target.markStacks).toBe(0);
  });

  it('递归禁令：EXPLOSION 标签的伤害不会叠加刃印', () => {
    const world = makeWorld(['bl_mark'], 'blade', 4, new Map([['bl_mark', 'b']]));
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);

    world.damageEnemy(e, 5, 'EXPLOSION');
    expect(e.markStacks).toBe(0);
  });
});
