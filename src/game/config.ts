/**
 * 全部玩法数值的唯一入口。
 *
 * 规格见 DESIGN.md。调平衡只应该改这个文件，不应该碰逻辑代码。
 * 标了「🎚️」的是还没经过试玩校准的第一版估计。
 */

export const ARENA = { w: 1000, h: 620 } as const;

/** 逻辑固定步长。渲染帧率再高再低，判定与手感都一样。 */
export const FIXED_STEP = 1 / 120;
/** 单帧最多补多少个逻辑步 —— 防止切回标签页时一次性算几千步。 */
export const MAX_STEPS_PER_FRAME = 8;

// ---------------------------------------------------------------- 玩家

export const PLAYER = {
  radius: 13,
  spawn: { x: 500, y: 530 },

  dashTime: 0.17,
  dashSpeed: 940,

  attackLunge: 14,

  selfKnockback: 260,
  enemyKnockback: 180,
  selfFriction: 0.0016,
  enemyFriction: 0.002,
} as const;

/** 强化会在这份基础值上叠乘。字段全部可写，因为 Stats 是它的一份拷贝。 */
export interface Stats {
  dmg: number;
  atkCd: number;
  range: number;
  arc: number;
  spd: number;
  dashCd: number;
  penMult: number;
  costMult: number;
  /** 处决阈值：血量低于这个比例的非 Boss 敌人被斩击直接斩杀。0 = 关闭 */
  exec: number;
  /** 每击杀一个非 Boss 敌人返还的秒数 */
  refund: number;
  /** 冲刺触发的全场减速持续时间。0 = 关闭 */
  dashSlow: number;
  /** 反击窗口内的额外伤害倍率。0 = 没有这个强化，受击也不产生反击窗口 */
  counterDmg: number;
  /** 掷刃：挥砍时附带发射刃弹 */
  projectile: boolean;
  /** 掷刃的伤害倍率。0 = 未持有掷刃。 */
  projectileDamageMult: number;
  /** 掠影：冲刺撞到敌人时的伤害倍率。0 = 关闭 */
  dashDamage: number;
  /** 蓄力：按住左键蓄力，松开打出全向斩 */
  chargedSlash: boolean;
  /** 满蓄斩的伤害倍率。0 = 未持有蓄力。 */
  chargedDamageMult: number;
}

export const BASE_STATS: Readonly<Stats> = {
  dmg: 12,
  atkCd: 0.36,
  range: 78,
  arc: 1.9,
  spd: 268,
  dashCd: 1.05,
  penMult: 1,
  costMult: 1,
  exec: 0,
  refund: 0,
  dashSlow: 0,
  counterDmg: 0,
  projectile: false,
  projectileDamageMult: 0,
  dashDamage: 0,
  chargedSlash: false,
  chargedDamageMult: 0,
};

// ---------------------------------------------------------------- 受击经济学

export const HIT = {
  /** 受击无敌。压到刚好够脱离接触 —— 太长会让「无脑硬吃」变成最优解。 */
  invTime: 0.4,

  /** 受击僵直：期间不能移动、不能攻击，但击退照常生效。 */
  hitstun: 0.18,
  /** 僵直过半后可以用冲刺打断 —— 让它是惩罚而不是死刑。 */
  hitstunDashCancelAt: 0.09,
  /** 围殴护栏：连击层数到这个数以后僵直减半，避免被围住后无限叠税。 */
  hitstunHalveAtStreak: 3,

  /** 连击税窗口：距上次受击多久内继续累进 */
  taxWindow: 5.0,
  /** 每多挨一次，价码乘这个数 */
  taxStep: 1.3,

  /** 反击窗口时长（只有持有「反击」强化时才会开启） */
  riposteWindow: 2.0,

  flash: 0.35,
  hitstop: 0.07,
  shake: 16,
} as const;

// ---------------------------------------------------------------- 敌人

export interface EnemyStatBlock {
  hp: number;
  radius: number;
  /** 时间惩罚底价（秒）。屏幕上的价签 = 这个值 × penMult × 连击税。 */
  pen: number;
  spd: number;
}

export const ENEMY: Record<'charger' | 'shooter' | 'brute' | 'medic', EnemyStatBlock> = {
  charger: { hp: 32, radius: 15, pen: 2.0, spd: 96 },
  shooter: { hp: 24, radius: 13, pen: 1.5, spd: 118 },
  brute:   { hp: 78, radius: 24, pen: 4.0, spd: 64 },
  /** pen: 0 → 永远不挂价签，见 pricing.ts 的 priceLabel(0) === null */
  medic:   { hp: 20, radius: 13, pen: 0,   spd: 100 },
};

export const CHARGER = {
  sightRange: 400,
  approachStop: 40,
  telegraph: 0.62,
  telegraphRay: 330,
  dashTime: 0.4,
  dashSpeed: 760,
  recover: 0.55,
  cooldown: [0.5, 1.1] as const,
  initialCooldown: [0.3, 1.4] as const,
} as const;

export const SHOOTER = {
  sightRange: 460,
  tooClose: 200,
  tooFar: 330,
  telegraph: 0.48,
  telegraphRay: 520,
  cooldown: [1.8, 2.6] as const,
  initialCooldown: [0.3, 1.4] as const,
  bullet: { radius: 6, speed: 350, life: 3 },
} as const;

export const BRUTE = {
  approachStop: 78,
  triggerRange: 130,
  telegraph: 0.95,
  blastRadius: 132,
  recover: 0.8,
  cooldown: [0.8, 1.6] as const,
  initialCooldown: [0.3, 1.4] as const,
  shake: 10,
} as const;

/**
 * 医疗兵：不直接威胁玩家，靠给附近小兵加血间接拖慢你。
 * 站位躲在离玩家最近的盟友背后，逼玩家先清路才能碰到它。
 */
export const MEDIC = {
  /** 目标站位 = 锚点盟友位置 + (锚点→玩家方向取反) × followDistance */
  followDistance: 70,
  /** 离目标站位多近就不再挪，防止贴脸抖动 */
  approachStop: 20,

  initialCooldown: [0.6, 1.6] as const,
  /** 两次治疗之间的间隔 */
  cooldown: [2.2, 3.2] as const,
  telegraph: 0.9,
  recover: 1.0,

  healRadius: 140,
  /** 半管冲锋兵血量左右，逼玩家出更多 DPS 或者干脆先杀医疗兵 */
  healAmount: 16,
} as const;

// ---------------------------------------------------------------- BOSS

export const BOSS = {
  /** 🎚️ 原为 420 × bossScale；S 级速通对应 scale ≈ 2.0，所以取 840 让高手体验不变。 */
  hp: 840,
  radius: 42,
  /** 🎚️ 同上，原为 78 × (1 + (scale−1)×0.25) */
  spd: 88,
  contactPen: 5.0,
  approachStop: 200,
  initialCooldown: 1.2,

  /** 半血后进入「回收」阶段：复用已有招式，但每招都多一段反向处理。 */
  phaseTwo: {
    threshold: 0.5,
    shiftTime: 0.8,
    /** 每个回收动作结束后的破绽；奖励敢贴身的玩家。 */
    weakPointTime: 0.6,
    weakPointDamageMult: 1.5,
  },

  /** 招式权重。屏幕上的分招式报价必须和这里的 pen 对得上。 */
  burst: {
    weight: 38,
    pen: 2.5,
    telegraph: 0.8,
    /** 12 发（原 16）：缝隙门槛从 r > 103px 降到 r > 77px，贴脸也有缝可钻。 */
    count: 12,
    bullet: { radius: 7, speed: 280, life: 4 },
    cooldown: 1.0,
    shake: 12,
    recall: {
      /** 二阶段第二圈的等待时间；第一圈和第二圈的缺口相反。 */
      gap: 2,
      count: 10,
      delay: 0.42,
    },
  },
  charge: {
    weight: 34,
    telegraph: 0.7,
    telegraphRepeat: 0.38,
    telegraphRay: 700,
    time: 0.5,
    speed: 700,
    repeats: 3,
    cooldown: 1.3,
    recallTelegraph: 0.48,
  },
  slam: {
    weight: 28,
    pen: 3.0,
    telegraph: 1.0,
    /** 三道环的半径 */
    radii: [90, 175, 260] as const,
    /** 环与环之间的间隔（游戏时间，不是 setTimeout） */
    gap: 0.19,
    /** 命中带：|距离 − 半径 + inner| < width */
    bandInner: 20,
    bandWidth: 46,
    cooldown: 1.1,
    shake: 16,
    recallTelegraph: 0.58,
  },
} as const;

// ---------------------------------------------------------------- 强化专属数值

export const THROW_BLADE = {
  damageMult: 0.55,
  speed: 620,
  radius: 5,
  life: 1.1,
} as const;

export const CHARGED_SLASH = {
  /** 按住多久算蓄满 */
  chargeTime: 0.5,
  damageMult: 2.6,
  rangeMult: 1.15,
  /** 全向斩后的后摇 = atkCd × 这个数 */
  recoverMult: 1.6,
} as const;

// ---------------------------------------------------------------- 关卡

export const MAP = {
  floors: 8,
  cols: 7,
  paths: 6,
  /** 捷径门只能出现在这些层（跳两层，不能跳过休整层或 Boss） */
  shortcutFloors: [2, 3, 4, 5] as const,
  minShops: 1,
  minElites: 2,
} as const;

export const ROOM_WEIGHTS = [
  ['combat', 40],
  ['elite', 20],
  ['mend', 15],
  ['shop', 13],
  ['shortcut', 12],
] as const;

export const COSTS = {
  shortcut: 9,
  mend: 12,
  /** 时间修复站消除已累计受击惩罚的比例 */
  mendRatio: 0.4,
  /** 商店最低价，避免「贪婪」把价格压到 0 */
  minShopPrice: 3,
} as const;

export const REWARDS = {
  combatChoices: 2,
  /** 精英房从不同原强化的未见进化分支中展示两张。 */
  eliteChoices: 2,
  shopSlots: 3,
} as const;

/** 精英房的血量倍率。这是房间类型属性，不是时间函数 —— 与累计时间无关。 */
export const ELITE_HP_MULT = 1.35;

// ---------------------------------------------------------------- 场地

/** 5 种墙体预设。数值为 [x, y, w, h]。第 4 号是空场。 */
export const WALL_LAYOUTS: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [[220, 180, 110, 110], [670, 180, 110, 110], [440, 400, 120, 90]],
  [[300, 120, 60, 240], [640, 260, 60, 240]],
  [[430, 120, 140, 60], [430, 440, 140, 60], [180, 280, 90, 90], [730, 280, 90, 90]],
  [[150, 150, 90, 90], [760, 150, 90, 90], [150, 380, 90, 90], [760, 380, 90, 90]],
  [],
];

/**
 * 布局白名单。子弹不可被打掉之后，掩体从「锦上添花」变成了「能不能打」。
 * 索引对应 WALL_LAYOUTS。
 */
export const LAYOUT_WHITELIST = {
  /** 早期敌人少，空场无所谓 */
  combatEarly: [0, 1, 2, 3, 4],
  /** 层数 ≥3：射手变多，必须有掩体断视线 */
  combatLate: [0, 1, 2, 3],
  /** 多个重甲的 132px 爆炸圈需要可绕的掩体；第 1 号中间空档太大 */
  elite: [0, 2, 3],
  /** Boss 的三连冲锋和三段震波需要完整场地，掩体会让判定读不清 */
  boss: [4],
} as const;

export const SPAWN = {
  xRange: [80, ARENA.w - 80] as const,
  yRange: [60, ARENA.h - 220] as const,
  minDistanceFromPlayer: 240,
  maxTries: 40,
} as const;

// ---------------------------------------------------------------- 演出

export const FEEL = {
  hitstopOnHitEnemy: 0.03,
  hitstopScale: 0.12,
  shakeDecay: 0.0005,
  shakeCutoff: 0.4,
  /** 「时停」期间敌人与子弹的时间倍率 */
  slowScale: 0.4,
  /** 房间清空 → 结算界面的过场延迟（这段时间照常计时） */
  roomClearDelay: 0.45,
  clockJolt: 0.3,
} as const;

// ---------------------------------------------------------------- 结算

/** 🎚️ 沿用旧分界线。删掉 Boss 缩放和决策界面计时两条改动会让它失准，实现后需要取样重定。 */
export const GRADES: readonly (readonly [grade: string, under: number, color: string])[] = [
  ['S', 150, '#ffd166'],
  ['A', 195, '#8fe388'],
  ['B', 245, '#9fe3ff'],
  ['C', 310, '#e8e8ec'],
  ['D', Infinity, '#ff6a6a'],
];
