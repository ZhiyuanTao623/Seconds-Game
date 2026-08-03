/** 纯表现层的特效。不参与任何判定，所以可以随便加随便删。 */

export interface Ring {
  kind: 'ring';
  x: number; y: number;
  r0: number; r1: number;
  color: string;
  t: number; life: number;
}

export interface Slash {
  kind: 'slash';
  x: number; y: number;
  angle: number; range: number; arc: number;
  t: number; life: number;
}

export type FxItem = Ring | Slash;

export interface FloatText {
  x: number; y: number;
  text: string;
  color: string;
  size: number;
  t: number; life: number;
}

export class Fx {
  items: FxItem[] = [];
  floats: FloatText[] = [];

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.35): void {
    this.items.push({ kind: 'ring', x, y, r0, r1, color, t: 0, life });
  }

  slash(x: number, y: number, angle: number, range: number, arc: number, life = 0.18): void {
    this.items.push({ kind: 'slash', x, y, angle, range, arc, t: 0, life });
  }

  float(x: number, y: number, text: string, color: string, size = 22): void {
    this.floats.push({ x, y, text, color, size, t: 0, life: 1.1 });
  }

  /**
   * 用世界时间推进，而不是渲染帧时间 —— 顿帧时飘字和血花会跟着一起慢下来，
   * 这正是顿帧想要的「重量感」。
   */
  update(dt: number): void {
    for (const item of this.items) item.t += dt;
    for (const f of this.floats) f.t += dt;
    this.items = this.items.filter((i) => i.t < i.life);
    this.floats = this.floats.filter((f) => f.t < f.life);
  }

  clear(): void {
    this.items = [];
    this.floats = [];
  }
}
