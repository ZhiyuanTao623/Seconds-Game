import { describe, expect, it } from 'vitest';
import { BOSS, FEEL, FIXED_STEP } from '../src/game/config';
import { Run } from '../src/game/run';
import { Timeline } from '../src/core/timeline';
import { buildRoom } from '../src/game/room';
import { IDLE_INPUT } from '../src/core/input';
import { recordCharges } from './helpers';

/**
 * 游戏时钟。
 *
 * 原型里 Boss 三段震波用 setTimeout 排期，走的是真实时间：一旦触发顿帧
 * 或开了「时停」，画面上的预警环在慢放，判定却按真实时间落地了 ——
 * 玩家看到的和被收的钱对不上。这里守的就是「排期必须跟着世界的 dt 走」。
 */

describe('Timeline', () => {
  it('按游戏时间到点触发', () => {
    const tl = new Timeline();
    let fired = false;
    tl.after(0.5, () => { fired = true; });

    tl.advance(0.4);
    expect(fired).toBe(false);
    tl.advance(0.2);
    expect(fired).toBe(true);
  });

  it('世界慢下来，排期就跟着慢下来', () => {
    const tl = new Timeline();
    let fired = false;
    tl.after(0.19, () => { fired = true; });

    // 「时停」把敌人的 dt 压到 0.4 倍：真实时间过了 0.19s，游戏时间只过了 0.076s
    for (let i = 0; i < 23; i++) tl.advance(FIXED_STEP * FEEL.slowScale);
    expect(fired, '时停期间排期不该按真实时间落地').toBe(false);

    for (let i = 0; i < 40; i++) tl.advance(FIXED_STEP * FEEL.slowScale);
    expect(fired).toBe(true);
  });

  it('clear() 之后排期一个都不许再响', () => {
    const tl = new Timeline();
    let fired = 0;
    tl.after(0.1, () => { fired += 1; });
    tl.after(0.2, () => { fired += 1; });

    tl.clear();
    expect(tl.pending).toBe(0);
    tl.advance(10);
    expect(fired).toBe(0);
  });

  it('回调里再排期不会在同一次 advance 里递归引爆', () => {
    const tl = new Timeline();
    let count = 0;
    const chain = (): void => {
      count += 1;
      if (count < 5) tl.after(0, chain);
    };
    tl.after(0, chain);

    tl.advance(1);
    expect(count).toBe(1);
    tl.advance(0);
    expect(count).toBe(2);
  });
});

describe('Boss 三段震波', () => {
  const bossWorld = (seed: number) => {
    const run = new Run(seed);
    return buildRoom(run, run.map.nodes.get(run.map.bossId)!);
  };

  it('震波飞行期间报价压在震波价，不跳回接触价', () => {
    const world = bossWorld(2026);
    const boss = world.enemies[0]!;

    boss.state = 'bossSlamTel';
    boss.t = 0.0001;
    world.player.x = boss.x;
    world.player.y = boss.y + BOSS.slam.radii[0]!;

    // 推一步让震波放出来
    world.step(FIXED_STEP, IDLE_INPUT);

    expect(boss.state).toBe('idle');
    expect(boss.threat).toBe(BOSS.slam.pen);
  });

  it('Boss 已经不在场上时，还在排期里的震波不许收钱', () => {
    const world = bossWorld(4242);
    const boss = world.enemies[0]!;
    const charges = recordCharges(world);

    boss.state = 'bossSlamTel';
    boss.t = 0.0001;
    world.player.x = boss.x;
    world.player.y = boss.y + BOSS.slam.radii[1]!;
    world.step(FIXED_STEP, IDLE_INPUT);

    // 第一段落地后就把 Boss 打死
    boss.dead = true;
    world.enemies = [];

    const chargesBefore = charges.length;
    for (let i = 0; i < 120; i++) world.step(FIXED_STEP, IDLE_INPUT);
    expect(charges.length, '死掉的 Boss 还在收钱').toBe(chargesBefore);
  });
});
