export const TAU = Math.PI * 2;

export interface Vec2 { x: number; y: number }
export interface Circle extends Vec2 { r: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const angleTo = (from: Vec2, to: Vec2): number =>
  Math.atan2(to.y - from.y, to.x - from.x);

/** 两角之差，归一化到 [-π, π]。 */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * 指数摩擦：`v *= base ^ dt`。
 * 写成函数是为了强调它与帧率无关 —— 直接 `v *= 0.9` 会让高刷屏减速更快。
 */
export const friction = (base: number, dt: number): number => Math.pow(base, dt);

export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
