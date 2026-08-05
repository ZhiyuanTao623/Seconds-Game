import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../src/game/config';
import { makeWorld } from './helpers';
import type { Button, InputSource } from '../src/core/input';

/**
 * 两个真实试玩反馈修的 bug：
 *   1. 进房间那一刻左键如果还带着「点地图/点卡片」时的按下状态（isMouseDown
 *      是电平信号，分不清这次按下发生在哪个场景），飞刃会白打一发刃弹出去。
 *   2. 冲刺应该跟着方向键走，不是无论按什么方向都冲向鼠标。
 */

function heldLeftInput(pointer = { x: 500, y: 300 }): InputSource {
  return {
    pointer,
    isDown: () => false,
    wasPressed: () => false,
    isMouseDown: (btn: Button) => btn === 'left',
    wasMousePressed: () => false,
    wasMouseReleased: () => false,
  };
}

describe('左键「解锁」：进房间时残留的按下状态不会白打一下', () => {
  it('左键从第一帧起就一直按着（没有按下沿）：不开火，直到松开过一次', () => {
    const world = makeWorld([], 'blade');
    world.player.x = 500; world.player.y = 300;
    const input = heldLeftInput();

    for (let i = 0; i < 30; i++) world.step(FIXED_STEP, input);
    expect(world.bullets.length).toBe(0);
  });

  it('松开一次之后再按住：正常连砍/发刃弹', () => {
    const world = makeWorld([], 'blade');
    world.player.x = 500; world.player.y = 300;

    let down = false;
    const input: InputSource = {
      pointer: { x: 500, y: 300 },
      isDown: () => false,
      wasPressed: () => false,
      isMouseDown: () => down,
      wasMousePressed: () => false,
      wasMouseReleased: () => false,
    };

    world.step(FIXED_STEP, input); // 第一帧：左键没按，解锁
    down = true;
    for (let i = 0; i < 10; i++) world.step(FIXED_STEP, input);
    expect(world.bullets.length).toBeGreaterThan(0);
  });
});

describe('冲刺方向跟着方向键走', () => {
  function dashInput(code: string, pointer = { x: 900, y: 300 }): InputSource {
    let pressed = true;
    return {
      pointer,
      isDown: (...codes: string[]) => codes.includes(code),
      wasPressed: (...codes: string[]) => {
        if (codes.includes('Space') && pressed) { pressed = false; return true; }
        return false;
      },
      isMouseDown: () => false,
      wasMousePressed: () => false,
      wasMouseReleased: () => false,
    };
  }

  it('按住 A（朝左）时冲刺，即使鼠标在右边，也朝左冲', () => {
    const world = makeWorld([], 'blade');
    world.player.x = 500; world.player.y = 300;
    const input = dashInput('KeyA');

    world.step(FIXED_STEP, input);
    expect(world.player.dashT).toBeGreaterThan(0);
    expect(Math.cos(world.player.dashDir)).toBeLessThan(-0.9);
  });

  it('没按任何方向键时，退回朝鼠标冲', () => {
    const world = makeWorld([], 'blade');
    world.player.x = 500; world.player.y = 300;
    const input = dashInput('__none__', { x: 500, y: 0 }); // 鼠标在正上方，没按方向键

    world.step(FIXED_STEP, input);
    expect(world.player.dashT).toBeGreaterThan(0);
    expect(Math.sin(world.player.dashDir)).toBeLessThan(-0.9);
  });
});
