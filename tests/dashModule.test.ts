import { describe, expect, it } from 'vitest';
import { FIXED_STEP, MODULES } from '../src/game/config';
import { spawnEnemy } from '../src/game/enemies';
import { RngStream } from '../src/core/rng';
import { IDLE_INPUT } from '../src/core/input';
import { makeWorld } from './helpers';
import type { InputSource } from '../src/core/input';
import type { Bullet, Enemy } from '../src/game/entities';
import type { World } from '../src/game/world';
import type { EvolutionBranch } from '../src/game/upgrades';
import type { UpgradeId } from '../src/i18n/i18n';

/**
 * 掠影模组三个专属强化：连闪（冲刺穿人减冷却）、破阵（易伤 debuff）、
 * 残影（延时爆炸）。测试手法和 bladeModule 一样：敌人冻住（spd=0/cd=极大）
 * 保证位置确定，用一个「只按一次」的假输入触发一次真实冲刺。
 */

const rng = new RngStream(1);

function frozenEnemy(x: number, y: number): Enemy {
  const e = spawnEnemy('charger', rng, x, y);
  e.spd = 0;
  e.cd = 999;
  return e;
}

/** 冲刺方向朝 `aim`；`wasPressed('Space')` 只在第一次调用时为 true，此后一直 false。 */
function dashOnceInput(aim: { x: number; y: number }): InputSource {
  let fired = false;
  return {
    pointer: aim,
    isDown: () => false,
    wasPressed: (...codes: string[]) => {
      if (fired || !codes.includes('Space')) return false;
      fired = true;
      return true;
    },
    isMouseDown: () => false,
    wasMousePressed: () => false,
    wasMouseReleased: () => false,
  };
}

function step(world: World, input: InputSource, times: number): void {
  for (let i = 0; i < times; i++) world.step(FIXED_STEP, input);
}

/**
 * 冲刺命中敌人会触发顿帧（addHitstop），顿帧期间世界按 hitstopScale（0.12）
 * 慢放——包括冲刺自己的倒计时 dashT。密集穿过好几个敌人时，冲刺的「真实
 * 步数」会远超 `dashTime / FIXED_STEP` 的naive估算，所以这里不猜步数，
 * 而是驱动到 `dashT` 真正归零为止（带步数上限防止意外死循环）。
 */
function runDash(world: World, input: InputSource): void {
  world.step(FIXED_STEP, input); // 这一步触发冲刺
  let guard = 0;
  while (world.player.dashT > 0 && guard < 2000) {
    world.step(FIXED_STEP, IDLE_INPUT);
    guard += 1;
  }
  if (guard >= 2000) throw new Error('冲刺迟迟没有结束，测试装置本身可能有问题');
}

/**
 * dashCd 是一个真实倒计时——冲刺期间和结束后它照样按 dt 递减，不是只在
 * 冲刺结束那一刻才动一次。所以不能拿 `s.dashCd - 0.45` 之类的常量去比，
 * 两组测试（有连闪 / 没有连闪）跑一模一样的冲刺，用差值把「自然递减」
 * 这个共同项消掉，只留下连闪本身的贡献。
 */
function dashCdAfter(
  upgrades: string[],
  evolved: ReadonlyMap<UpgradeId, EvolutionBranch>,
  setup: (w: World) => void,
): number {
  const world = makeWorld(upgrades, 'dash', 4, evolved);
  world.player.x = 500; world.player.y = 300;
  setup(world);
  runDash(world, dashOnceInput({ x: 600, y: 300 }));
  return world.player.dashCd;
}

// 密集排列在冲刺起点附近——不依赖冲刺具体能飞多远，靠得够近才能稳定命中 6 个
const lineOfEnemies = (w: World): void => {
  for (const x of [505, 512, 519, 526, 533, 540]) w.enemies.push(frozenEnemy(x, 300));
};

describe('连闪：冲刺穿人减冷却', () => {
  it('基础：每命中一个新敌人 -0.15s，单次冲刺封顶 0.45s', () => {
    const withoutFlash = dashCdAfter([], new Map(), lineOfEnemies);
    const withFlash = dashCdAfter(['da_flash'], new Map(), lineOfEnemies);
    expect(withoutFlash - withFlash).toBeCloseTo(0.45, 6);
  });

  it('无间：封顶提高到 0.75s；命中 ≥3 个敌人时冲刺结束获得额外无敌', () => {
    const withoutFlash = dashCdAfter([], new Map(), lineOfEnemies);
    const withFlash = dashCdAfter(['da_flash'], new Map([['da_flash', 'a']]), lineOfEnemies);
    expect(withoutFlash - withFlash).toBeCloseTo(0.75, 6);

    const world = makeWorld(['da_flash'], 'dash', 4, new Map([['da_flash', 'a']]));
    world.player.x = 500; world.player.y = 300;
    lineOfEnemies(world);
    runDash(world, dashOnceInput({ x: 600, y: 300 }));
    expect(world.player.inv).toBeGreaterThan(0);
  });

  it('精准闪避：险境中起跳的冲刺结束后返还 55% 冷却', () => {
    const withDodge = dashCdAfter(['da_flash'], new Map([['da_flash', 'b']]), (w) => {
      // 贴脸的敌方弹：isNearMiss 里 gap<0 直接判定为险境
      const bullet: Bullet = {
        x: 505, y: 300, vx: -300, vy: 0, r: 5, pen: 1, life: 5, dead: false, hostile: true, damage: 0,
      };
      w.bullets.push(bullet);
    });
    const withoutDodge = dashCdAfter(['da_flash'], new Map([['da_flash', 'b']]), () => {});

    expect(withoutDodge - withDodge).toBeCloseTo(1.05 * 0.55, 6);
  });

  it('没有险境时，精准闪避不生效', () => {
    const withEvo = dashCdAfter(['da_flash'], new Map([['da_flash', 'b']]), () => {});
    const withoutEvo = dashCdAfter([], new Map(), () => {});
    expect(withoutEvo - withEvo).toBeCloseTo(0, 6);
  });
});

describe('破阵：冲刺穿过的敌人进入易伤状态', () => {
  it('基础：只有 MELEE 命中吃加成，DASH 命中不吃', () => {
    const world = makeWorld(['da_break'], 'dash');
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);
    e.brokenT = MODULES.dash.breakDuration;

    const beforeMelee = e.hp;
    world.damageEnemy(e, 10, 'MELEE');
    expect(beforeMelee - e.hp).toBeCloseTo(10 * 1.20, 6);

    const beforeDash = e.hp;
    world.damageEnemy(e, 10, 'DASH');
    expect(beforeDash - e.hp).toBeCloseTo(10, 6);
  });

  it('Boss 版本的加成倍率更低', () => {
    const world = makeWorld(['da_break'], 'dash');
    const boss = spawnEnemy('boss', rng, 500, 150);
    world.enemies.push(boss);
    boss.brokenT = MODULES.dash.breakBossDuration;

    const before = boss.hp;
    world.damageEnemy(boss, 10, 'MELEE');
    expect(before - boss.hp).toBeCloseTo(10 * 1.12, 6);
  });

  it('碎甲：所有伤害来源都吃加成，倍率提升到 +30%', () => {
    const world = makeWorld(['da_break'], 'dash', 4, new Map([['da_break', 'a']]));
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);
    e.brokenT = MODULES.dash.breakDuration;

    const beforeDash = e.hp;
    world.damageEnemy(e, 10, 'DASH');
    expect(beforeDash - e.hp).toBeCloseTo(10 * 1.30, 6);
  });

  it('易伤状态会随时间过期', () => {
    const world = makeWorld(['da_break'], 'dash');
    const e = frozenEnemy(500, 300);
    world.enemies.push(e);
    e.brokenT = 0.02;

    step(world, IDLE_INPUT, 10);
    expect(e.brokenT).toBeLessThanOrEqual(0);
  });

  it('追杀：击杀破阵状态的敌人减冲刺冷却 + 临时加速', () => {
    const world = makeWorld(['da_break'], 'dash', 4, new Map([['da_break', 'b']]));
    const e = frozenEnemy(500, 300);
    e.hp = 1;
    world.enemies.push(e);
    e.brokenT = MODULES.dash.breakDuration;
    world.player.dashCd = 1.0;

    world.damageEnemy(e, 100, 'MELEE');

    expect(world.player.dashCd).toBeCloseTo(1.0 - 0.35, 6);
    expect(world.player.speedBuffT).toBeCloseTo(1.5, 6);
  });

  it('冲刺真的穿过敌人时会施加破阵状态', () => {
    const world = makeWorld(['da_break'], 'dash');
    world.player.x = 500; world.player.y = 300;
    const e = frozenEnemy(520, 300);
    world.enemies.push(e);

    runDash(world, dashOnceInput({ x: 600, y: 300 }));

    expect(e.brokenT).toBeGreaterThan(0);
  });
});

describe('残影：冲刺结束后延时爆炸', () => {
  it('基础：0.45s 后在冲刺起点炸一次，伤害 dmg × 75%', () => {
    const world = makeWorld(['da_ghost'], 'dash');
    world.player.x = 500; world.player.y = 300;

    runDash(world, dashOnceInput({ x: 500, y: 200 }));

    const target = frozenEnemy(500, 300); // 就是冲刺起点
    world.enemies.push(target);

    // 还没到 0.45s：不该炸
    step(world, IDLE_INPUT, 40); // 40/120 ≈ 0.33s
    expect(target.hp).toBe(target.maxHp);

    // 补到 0.45s 以上
    step(world, IDLE_INPUT, 20); // 累计 ≈ 0.5s
    expect(target.hp).toBeCloseTo(target.maxHp - world.stats.dmg * 0.75, 6);
    expect(world.timeline.pending).toBe(0);
  });

  it('双生残影：起点和终点各炸一次，且都命中各自位置的敌人', () => {
    const world = makeWorld(['da_ghost'], 'dash', 4, new Map([['da_ghost', 'a']]));
    world.player.x = 500; world.player.y = 300;

    runDash(world, dashOnceInput({ x: 500, y: 200 }));
    const endX = world.player.x;
    const endY = world.player.y;
    expect(endY).toBeLessThan(300); // 确实往上冲了

    const atStart = frozenEnemy(500, 300);
    const atEnd = frozenEnemy(endX, endY);
    world.enemies.push(atStart, atEnd);

    step(world, IDLE_INPUT, 60); // 0.5s，两个残影都该炸了

    expect(atStart.hp).toBeCloseTo(atStart.maxHp - world.stats.dmg * 0.65, 6);
    expect(atEnd.hp).toBeCloseTo(atEnd.maxHp - world.stats.dmg * 0.65, 6);
  });

  it('延迟猎杀：延迟提高到 0.75s，伤害提高到 dmg × 135%', () => {
    const world = makeWorld(['da_ghost'], 'dash', 4, new Map([['da_ghost', 'b']]));
    world.player.x = 500; world.player.y = 300;

    runDash(world, dashOnceInput({ x: 500, y: 200 }));

    const target = frozenEnemy(500, 300);
    world.enemies.push(target);

    step(world, IDLE_INPUT, 65); // 0.54s：0.45s 版本早该炸了，0.75s 版本还没到
    expect(target.hp).toBe(target.maxHp);

    step(world, IDLE_INPUT, 30); // 补到 ≈0.79s
    expect(target.hp).toBeCloseTo(target.maxHp - world.stats.dmg * 1.35, 6);
  });

  it('递归禁令：残影爆炸（AFTEREFFECT）不会再排出新的残影', () => {
    const world = makeWorld(['da_ghost'], 'dash');
    world.player.x = 500; world.player.y = 300;

    runDash(world, dashOnceInput({ x: 500, y: 200 }));
    step(world, IDLE_INPUT, 60);

    // 唯一一次冲刺应该只留下一颗定时炸弹；炸完之后不该有任何新排期
    expect(world.timeline.pending).toBe(0);
  });
});
