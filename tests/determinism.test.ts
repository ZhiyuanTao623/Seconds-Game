import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RngStream, hashSeed, normalizeSeed } from '../src/core/rng';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** 去掉注释和字符串字面量 —— 只有真正的代码才算违规。 */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

/**
 * 一条漏网的 `Math.random()` 就会让整个竞速模式失效 —— 同一个 seed
 * 跑出两张不同的图，而且极难排查（症状是「偶尔对不上」）。
 * 所以这条规则不留例外，用测试当 lint 强制执行。
 */
describe('全局禁用 Math.random()', () => {
  it('src/ 下不存在任何 Math.random 调用', () => {
    const offenders = walk(SRC)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /Math\s*\.\s*random/.test(stripNonCode(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));

    expect(offenders, `这些文件里有 Math.random，随机必须走 RngStream：\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});

describe('RngStream', () => {
  it('同一个 seed 给出同一串数', () => {
    const a = new RngStream(12345);
    const b = new RngStream(12345);
    for (let i = 0; i < 200; i++) expect(a.float()).toBe(b.float());
  });

  it('派生流互相独立，且可复现', () => {
    const left = new RngStream(9).derive('map');
    const right = new RngStream(9).derive('map');
    const other = new RngStream(9).derive('combat');

    const seqLeft = Array.from({ length: 20 }, () => left.float());
    const seqRight = Array.from({ length: 20 }, () => right.float());
    const seqOther = Array.from({ length: 20 }, () => other.float());

    expect(seqLeft).toEqual(seqRight);
    expect(seqLeft).not.toEqual(seqOther);
  });

  it('int 永远落在 [0, n)', () => {
    const rng = new RngStream(1);
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('weighted 只会返回给定的取值', () => {
    const rng = new RngStream(2);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      seen.add(rng.weighted([['a', 3], ['b', 1], ['c', 0]] as const));
    }
    expect([...seen].sort()).toEqual(['a', 'b']);
  });

  it('take 会从池子里移除，实现「同一局内不重复」', () => {
    const rng = new RngStream(3);
    const pool = [1, 2, 3, 4, 5];
    const drawn = [rng.take(pool), rng.take(pool), rng.take(pool)];
    expect(new Set(drawn).size).toBe(3);
    expect(pool.length).toBe(2);
  });

  it('字符串 seed 稳定地 hash 成同一个数', () => {
    expect(normalizeSeed('秒')).toBe(hashSeed('秒'));
    expect(normalizeSeed('  42 ')).toBe(42);
    expect(normalizeSeed('abc')).toBe(normalizeSeed('abc'));
  });
});
