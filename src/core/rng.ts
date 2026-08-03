/**
 * 可复现随机。
 *
 * 这是竞速模式的地基：`seed + 总时间` 才构成一个可验证、可比较的成绩。
 * 全局禁用 `Math.random()`（由 tests/no-global-random.test.ts 强制），
 * 所有随机都必须从一条具名的 RngStream 上取。
 */

/** 32 位整数 hash，用来把字符串 seed 或 (seed, nodeId) 混成一个新的种子。 */
export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 末尾雪崩，避免相邻输入产生相邻种子
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 —— 32 位状态，够快够均匀，适合游戏用途。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RngStream {
  readonly seed: number;
  private next: () => number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.next = mulberry32(this.seed);
  }

  /** 派生一条独立的子流。同一个 (父 seed, label) 永远给出同一条流。 */
  derive(label: string | number): RngStream {
    return new RngStream(hashSeed(`${this.seed}:${label}`));
  }

  /** [0, 1) */
  float(): number { return this.next(); }

  /** [lo, hi) */
  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }

  /** [0, n) 的整数 */
  int(n: number): number { return Math.floor(this.next() * n) % Math.max(1, n); }

  bool(chance: number): boolean { return this.next() < chance; }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[this.int(arr.length)]!;
  }

  /** 取出并移除一个元素（会修改传入数组）。用于「同一局内不重复」的强化抽取。 */
  take<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr.splice(this.int(arr.length), 1)[0];
  }

  /** 按权重挑选。权重不需要归一化。 */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}

/** 把用户输入的 seed（可能是空串 / 数字 / 任意文字）规范成一个 uint32。 */
export function normalizeSeed(input: string): number {
  const trimmed = input.trim();
  if (trimmed === '') return randomSeed();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  return hashSeed(trimmed);
}

/**
 * 只在「玩家没有指定 seed」时调用一次，用来挑一局新游戏的种子。
 * 刻意不走 Math.random —— 保证代码库里一个 Math.random 都不存在，
 * 这样那条 lint 测试才能是一条无例外的硬规则。
 */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(buf);
    return buf[0]! >>> 0;
  }
  return hashSeed(`${Date.now()}`);
}
