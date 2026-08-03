import type { Stats } from './config';
import { BASE_STATS } from './config';
import type { RngStream } from '../core/rng';

export interface Upgrade {
  id: string;
  name: string;
  /** 商店基础价（秒）。战斗房掉落免费。 */
  cost: number;
  desc: string;
  apply(s: Stats): void;
}

/**
 * 13 个强化，同一局内不重复。
 *
 * 前 10 个只改数字；最后 3 个（掷刃 / 掠影 / 蓄力）各自动了一条不同的
 * 操作前提 —— 输出必须贴身、冲刺是纯防御、按住左键连点。
 */
export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'blade', name: '利刃', cost: 14,
    desc: '伤害 +60%，但受击时间惩罚 +40%。',
    apply: (s) => { s.dmg *= 1.6; s.penMult *= 1.4; },
  },
  {
    id: 'gale', name: '疾风', cost: 16,
    desc: '移速 +16%，冲刺冷却 -35%。',
    apply: (s) => { s.spd *= 1.16; s.dashCd *= 0.65; },
  },
  {
    id: 'tough', name: '韧体', cost: 15,
    desc: '受击时间惩罚 -35%，但伤害 -15%。',
    apply: (s) => { s.penMult *= 0.65; s.dmg *= 0.85; },
  },
  {
    id: 'reach', name: '长刃', cost: 12,
    desc: '攻击范围 +45%，挥砍弧度略增。',
    apply: (s) => { s.range *= 1.45; s.arc *= 1.15; },
  },
  {
    id: 'rapid', name: '连斩', cost: 14,
    desc: '攻击速度 +40%，单次伤害 -10%。',
    apply: (s) => { s.atkCd *= 0.6; s.dmg *= 0.9; },
  },
  {
    id: 'exec', name: '处决', cost: 20,
    desc: '敌人生命低于 30% 时被斩击立即斩杀。',
    apply: (s) => { s.exec = Math.max(s.exec, 0.3); },
  },
  {
    id: 'greed', name: '贪婪', cost: 13,
    desc: '此后所有秒数消费 -35%。',
    apply: (s) => { s.costMult *= 0.65; },
  },
  {
    id: 'stasis', name: '时停', cost: 18,
    desc: '冲刺时全场减速 60%，持续 0.55 秒。',
    apply: (s) => { s.dashSlow = 0.55; },
  },
  {
    id: 'riposte', name: '反击', cost: 11,
    desc: '受击后 2 秒内伤害 +85%。',
    apply: (s) => { s.counterDmg = 0.85; },
  },
  {
    id: 'abacus', name: '精算', cost: 15,
    desc: '每击杀一个敌人返还 0.5 秒。',
    apply: (s) => { s.refund += 0.5; },
  },

  // ---- 改变操作方式的三个
  {
    id: 'throw', name: '掷刃', cost: 17,
    desc: '每次挥砍额外向光标方向掷出一枚刃弹（伤害 55%）。<b>你不再必须贴身才有输出。</b>',
    apply: (s) => { s.projectile = true; },
  },
  {
    id: 'phantom', name: '掠影', cost: 16,
    desc: '冲刺穿过敌人时造成 120% 伤害，每次冲刺对同一敌人只结算一次。<b>冲刺不再只是逃跑键。</b>',
    apply: (s) => { s.dashDamage = 1.2; },
  },
  {
    id: 'charge', name: '蓄力', cost: 15,
    desc: '按住左键 0.5 秒蓄力，松开打出 260% 伤害的 360° 全向斩。<b>代价：按住不再自动连砍。</b>',
    apply: (s) => { s.chargedSlash = true; },
  },
];

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id: string): Upgrade | undefined => UPGRADE_BY_ID.get(id);

/** 把持有的强化叠到基础值上。顺序无关 —— 全部是乘法或取最大值。 */
export function computeStats(owned: readonly Upgrade[]): Stats {
  const s: Stats = { ...BASE_STATS };
  for (const u of owned) u.apply(s);
  return s;
}

/**
 * 抽 k 个还没拿到的强化。
 *
 * 用调用方传进来的 rng —— 保证同一个 seed 下，同一个节点开出的
 * 强化永远一样，和玩家在别处做了什么无关。
 */
export function drawUpgrades(rng: RngStream, owned: ReadonlySet<string>, k: number): Upgrade[] {
  const pool = UPGRADES.filter((u) => !owned.has(u.id));
  const out: Upgrade[] = [];
  while (out.length < k && pool.length > 0) {
    const picked = rng.take(pool);
    if (picked) out.push(picked);
  }
  return out;
}
