import { ARENA } from '../game/config';
import { TAU } from '../core/math';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  /** 逻辑分辨率固定，只改 CSS 尺寸 —— 所有绘制坐标都可以直接按 1000×620 写。 */
  fit(): void {
    const scale = Math.min(window.innerWidth / ARENA.w, window.innerHeight / ARENA.h);
    this.canvas.width = ARENA.w;
    this.canvas.height = ARENA.h;
    this.canvas.style.width = `${ARENA.w * scale}px`;
    this.canvas.style.height = `${ARENA.h * scale}px`;
  }

  begin(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ARENA.w, ARENA.h);
    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  }

  /** 震屏。抖动量由调用方给的随机源决定，渲染层自己不持有随机状态。 */
  shake(amount: number, rand: () => number): void {
    if (amount <= 0) return;
    this.ctx.translate((rand() * 2 - 1) * amount, (rand() * 2 - 1) * amount);
  }

  resetTransform(): void { this.ctx.setTransform(1, 0, 0, 1, 0, 0); }

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
