import type { Vec2 } from './math';

export type Button = 'left' | 'right';

/**
 * 玩法逻辑只依赖这个接口，不依赖具体的 DOM 事件采集。
 * 测试里可以喂一个纯对象，把整个战斗跑起来而不需要浏览器。
 */
export interface InputSource {
  readonly pointer: Vec2;
  isDown(...codes: string[]): boolean;
  wasPressed(...codes: string[]): boolean;
  isMouseDown(btn: Button): boolean;
  wasMousePressed(btn: Button): boolean;
  wasMouseReleased(btn: Button): boolean;
}

/** 什么都不按。测试用。 */
export const IDLE_INPUT: InputSource = {
  pointer: { x: 0, y: 0 },
  isDown: () => false,
  wasPressed: () => false,
  isMouseDown: () => false,
  wasMousePressed: () => false,
  wasMouseReleased: () => false,
};

/**
 * 输入采集。
 *
 * 「按下沿」（pressed）与「持续按住」（down）分开：冲刺和数字选卡要的是
 * 前者，移动和挥砍要的是后者。pressed 集合在每个逻辑步末尾清空。
 */
export class Input implements InputSource {
  private down = new Set<string>();
  private pressedThisStep = new Set<string>();
  private mouseDown = new Set<Button>();
  private mousePressed = new Set<Button>();
  private mouseReleased = new Set<Button>();

  readonly pointer: Vec2 = { x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private world: { w: number; h: number },
  ) {
    this.pointer.x = world.w / 2;
    this.pointer.y = world.h / 2;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Space') e.preventDefault();
    this.down.add(e.code);
    this.pressedThisStep.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };

  /** 切走标签页时松开一切，回来时角色不会自己一直跑。 */
  private onBlur = (): void => {
    this.down.clear();
    this.mouseDown.clear();
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * this.world.w;
    this.pointer.y = ((e.clientY - rect.top) / rect.height) * this.world.h;
  };

  private onMouseDown = (e: MouseEvent): void => {
    const btn = this.buttonOf(e.button);
    if (!btn) return;
    if (btn === 'right') e.preventDefault();
    this.mouseDown.add(btn);
    this.mousePressed.add(btn);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const btn = this.buttonOf(e.button);
    if (!btn) return;
    if (this.mouseDown.delete(btn)) this.mouseReleased.add(btn);
  };

  private buttonOf(n: number): Button | null {
    return n === 0 ? 'left' : n === 2 ? 'right' : null;
  }

  /**
   * 取走一个「按下沿」并把它消费掉。
   * 给暂停这种在固定步长循环之外处理的按键用 —— 不消费的话
   * endStep 还没轮到就会被重复读到，一按 ESC 会反复开关。
   */
  consume(code: string): boolean {
    return this.pressedThisStep.delete(code);
  }

  isDown(...codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes: string[]): boolean { return codes.some((c) => this.pressedThisStep.has(c)); }
  isMouseDown(btn: Button): boolean { return this.mouseDown.has(btn); }
  wasMousePressed(btn: Button): boolean { return this.mousePressed.has(btn); }
  wasMouseReleased(btn: Button): boolean { return this.mouseReleased.has(btn); }

  /** 每个逻辑步结束时调用，翻页所有「沿」信号。 */
  endStep(): void {
    this.pressedThisStep.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
  }

  /** 数字键 1–4 的选卡索引，没按就返回 null。 */
  cardIndex(): number | null {
    for (let i = 1; i <= 4; i++) {
      if (this.pressedThisStep.has(`Digit${i}`)) return i - 1;
    }
    return null;
  }
}
