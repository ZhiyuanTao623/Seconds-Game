import { ARENA, WALL_LAYOUTS } from './config';
import { clamp, pointInRect } from '../core/math';
import type { Circle, Rect, Vec2 } from '../core/math';

const EDGE_MARGIN = 8;

export class Arena {
  readonly walls: readonly Rect[];
  readonly w = ARENA.w;
  readonly h = ARENA.h;

  constructor(layoutIndex: number) {
    const layout = WALL_LAYOUTS[layoutIndex] ?? [];
    this.walls = layout.map(([x, y, w, h]) => ({ x, y, w, h }));
  }

  /** 把圆推出所有墙体，并夹在场地边界内。 */
  collide(o: Circle): void {
    for (const wall of this.walls) {
      const cx = clamp(o.x, wall.x, wall.x + wall.w);
      const cy = clamp(o.y, wall.y, wall.y + wall.h);
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d = Math.hypot(dx, dy);
      if (d >= o.r) continue;
      if (d === 0) {
        // 圆心正好在墙内：没有可靠的法线，往左推出去就好
        o.x = wall.x - o.r;
        continue;
      }
      o.x = cx + (dx / d) * o.r;
      o.y = cy + (dy / d) * o.r;
    }
    this.clampToBounds(o);
  }

  /** Boss 太大，塞不进墙缝，所以它只受边界约束。 */
  clampToBounds(o: Circle): void {
    o.x = clamp(o.x, o.r + EDGE_MARGIN, this.w - o.r - EDGE_MARGIN);
    o.y = clamp(o.y, o.r + EDGE_MARGIN, this.h - o.r - EDGE_MARGIN);
  }

  contains(p: Vec2): boolean {
    return p.x >= 0 && p.x <= this.w && p.y >= 0 && p.y <= this.h;
  }

  hitsWall(p: Vec2): boolean {
    return this.walls.some((wall) => pointInRect(p, wall));
  }

  /**
   * 视线是否被墙挡住。
   *
   * 按固定步长采样而不是固定份数 —— 原型里用的是 `t += 0.07`（14 段），
   * 长距离时相邻采样点能隔出 30px 以上，薄墙会被整个跳过去。
   */
  lineBlocked(a: Vec2, b: Vec2): boolean {
    if (this.walls.length === 0) return false;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.ceil(len / 12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (this.hitsWall(p)) return true;
    }
    return false;
  }
}
