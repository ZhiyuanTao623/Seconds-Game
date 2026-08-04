import { describe, expect, it } from 'vitest';
import { RngStream } from '../src/core/rng';
import { Run } from '../src/game/run';
import { computeStats, drawEvolutions, upgradeById } from '../src/game/upgrades';

const owned = (...ids: string[]) => ids.map((id) => {
  const upgrade = upgradeById(id);
  if (!upgrade) throw new Error(`unknown upgrade: ${id}`);
  return upgrade;
});

describe('精英进化奖励', () => {
  it('单次展示的两条进化必定来自不同原强化', () => {
    const options = drawEvolutions(new RngStream(7), owned('blade', 'tough', 'rapid'), new Set(), 2);
    expect(options).toHaveLength(2);
    expect(new Set(options.map((option) => option.id)).size).toBe(2);
  });

  it('展示过的分支会永久淘汰，但同一强化未展示的另一分支仍可进入池子', () => {
    const run = new Run(88);
    for (const upgrade of owned('blade', 'tough', 'rapid')) run.takeUpgrade(upgrade);
    const elite = [...run.map.nodes.values()].find((node) => node.kind === 'elite');
    expect(elite).toBeDefined();
    run.enter(elite!);

    const first = run.drawEliteEvolutions(2);
    expect(first).toHaveLength(2);
    expect([...run.seenEvolutions]).toEqual(expect.arrayContaining(first.map((option) => option.key)));

    const later = drawEvolutions(new RngStream(99), run.owned, run.seenEvolutions, 2);
    for (const option of later) expect(run.seenEvolutions.has(option.key)).toBe(false);

    const bladeOnly = drawEvolutions(
      new RngStream(99),
      owned('blade'),
      new Set(['blade:numeric']),
      2,
    );
    expect(bladeOnly.map((option) => option.key)).toEqual(['blade:costRemoval']);
  });

  it('解除代价与数值进化可叠加，且结算顺序不取决于获得顺序', () => {
    const [blade] = owned('blade');
    const stats = computeStats([blade!], new Set(['blade:numeric', 'blade:costRemoval']));
    expect(stats.dmg).toBeCloseTo(12 * 2, 9);
    expect(stats.penMult).toBeCloseTo(1, 9);
  });
});
