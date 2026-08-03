import { ARENA } from '../game/config';
import { TAU } from '../core/math';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /**
   * 设备像素比。canvas 的物理像素缓冲区（width/height）要按它放大，
   * CSS 尺寸（style.width/height）才是真正决定屏幕上占多大地方的 ——
   * 这是两件事。之前两者都按逻辑分辨率 1000×620 走，在高分屏上等于
   * 把一张分辨率不够的位图硬拉伸，线条和文字全糊。
   */
  private dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  /** 逻辑分辨率固定在 1000×620，所有绘制坐标都还是直接按这个写，不用改。 */
  fit(): void {
    const scale = Math.min(window.innerWidth / ARENA.w, window.innerHeight / ARENA.h);
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(ARENA.w * this.dpr);
    this.canvas.height = Math.round(ARENA.h * this.dpr);
    this.canvas.style.width = `${ARENA.w * scale}px`;
    this.canvas.style.height = `${ARENA.h * scale}px`;

    this.resetTransform();
  }

  begin(): void {
    const { ctx } = this;
    this.resetTransform();
    ctx.clearRect(0, 0, ARENA.w, ARENA.h);
    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  }

  /** 震屏。抖动量由调用方给的随机源决定，渲染层自己不持有随机状态。 */
  shake(amount: number, rand: () => number): void {
    if (amount <= 0) return;
    this.ctx.translate((rand() * 2 - 1) * amount, (rand() * 2 - 1) * amount);
  }

  /**
   * 回到「逻辑坐标系的单位变换」—— 不是物理像素的单位变换。
   * 高分屏上这两者不是一回事，所有要清空变换的地方都必须走这里，
   * 不能自己写死 `setTransform(1,0,0,1,0,0)`。
   */
  resetTransform(): void { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  polygon(x: number, y: number, r: number, sides: number, rotation: number): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i / sides) * TAU;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}
