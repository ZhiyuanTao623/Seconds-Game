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

/**
 * 强化会在这份基础值上叠乘。字段全部可写，因为 Stats 是它的一份拷贝。
 *
 * 模组基础能力（飞刃/掠影/蓄势）在 computeStats 里最先结算 —— 见 modules.ts。
 * 三个 charge* 字段不只是「蓄力强不强」，蓄势模组选中的那一刻就把
 * chargedSlash 打开，chargeTime/chargeDamageMult 等数值也一起写好；
 * 之后的专属进化只是在这些数值上继续叠乘。
 */
export interface Stats {
  dmg: number;
  atkCd: number;
  range: number;
  arc: number;
  spd: number;
  dashCd: number;
  /** 冲刺速度倍率，决定冲刺距离（时长不变）。 */
  dashSpeedMult: number;
  penMult: number;
  costMult: number;
  /** 连击税窗口：距上次受击多久内继续累进。 */
  taxWindow: number;
  /** 击杀普通敌人（冲锋兵/射手）返还的秒数。0 = 未持有精算。 */
  refundNormal: number;
  /** 击杀重甲/医疗兵返还的秒数。 */
  refundElite: number;
  /** 精英房清空时额外返还的秒数（一次性，不按击杀数）。 */
  refundEliteClear: number;
  /** 飞刃模组：挥砍时附带发射刃弹 */
  projectile: boolean;
  /** 刃弹伤害倍率。0 = 未选飞刃模组。 */
  projectileDamageMult: number;
  /** 掠影模组：冲刺撞到敌人时的伤害倍率。0 = 未选掠影模组。 */
  dashDamage: number;
  /** 蓄势模组：按住左键蓄力，松开打出全向斩 */
  chargedSlash: boolean;
  /** 蓄满所需时长。0 = 未选蓄势模组。 */
  chargeTime: number;
  /** 满蓄斩的伤害倍率。 */
  chargeDamageMult: number;
  /** 满蓄斩的范围倍率（相对普通挥砍 range）。 */
  chargeRangeMult: number;
  /** 满蓄斩命中/落空后的后摇 = atkCd × 这个数。 */
  chargeRecoverMult: number;
  /** 蓄力过程中的移速倍率。 */
  chargeMoveSpeedMult: number;

  // ---- 飞刃：贯刃 ----
  /** 'off' = 未持有贯刃；'stack' = 无阻式层层衰减；'finale' = 贯心式二段终结。 */
  bladePierceMode: 'off' | 'stack' | 'finale';
  /** stack 模式下还能再穿透几个敌人（不含本次命中）。 */
  bladePierce: number;
  /** stack 模式下每次穿透后的伤害衰减倍率。 */
  bladePierceFalloff: number;
  /** finale 模式下第二个目标的伤害加成倍率。 */
  bladePierceBonus: number;

  // ---- 飞刃：回旋 ----
  /** 是否持有回旋（达到最大距离/撞墙后飞回玩家）。 */
  bladeReturn: boolean;
  /** 回程速度（px/s）。 */
  bladeReturnSpeed: number;
  /** 回程命中的伤害倍率。 */
  bladeReturnDamageMult: number;
  /** 环身进化：回到玩家身边后环绕一段时间。 */
  bladeOrbit: boolean;
  bladeOrbitDuration: number;

  // ---- 飞刃：刃印 ----
  /** 刃印最大层数。0 = 未持有刃印。 */
  markMax: number;
  markDuration: number;
  /** 普通挥砍消耗刃印时，每层额外造成的伤害 = dmg × 这个数。 */
  markDamagePerStack: number;
  /** 猎印进化：普通挥砍对已刃印敌人，每层额外的伤害倍率加成。 */
  markMeleeBonusPerStack: number;
  /** 爆印进化：刃印叠满时自动引爆，不再靠挥砍消耗。 */
  markDetonate: boolean;
  markDetonateDamageMult: number;
  markDetonateSplashMult: number;

  // ---- 掠影：连闪 ----
  /** 每命中一个新敌人减少的冲刺冷却。0 = 未持有连闪。 */
  dashFlashCdPerHit: number;
  /** 单次冲刺最多减少的冷却（封顶）。 */
  dashFlashCdCap: number;
  /** 无间进化：单次冲刺命中 ≥3 个敌人时，冲刺结束获得的额外无敌时长。 */
  dashFlashInvulnBonus: number;
  /** 精准闪避进化：险境中起跳的这次冲刺结束后，返还的冷却比例（0~1）。 */
  dashFlashDodgeRefund: number;

  // ---- 掠影：破阵 ----
  /** 被冲刺穿过的敌人受到的伤害加成（非 Boss）。0 = 未持有破阵。 */
  breakMult: number;
  /** 同上，Boss 版本。 */
  breakBossMult: number;
  /** false = 只有 MELEE 命中吃加成（基础）；true = 所有伤害来源都吃（碎甲）。 */
  breakAll: boolean;
  /** 追杀进化：击杀破阵状态的敌人时减冲刺冷却 + 短暂加速。 */
  breakChaseEnabled: boolean;
  breakChaseCdRefund: number;
  breakChaseSpeedMult: number;
  breakChaseSpeedDuration: number;

  // ---- 掠影：残影 ----
  /** 是否持有残影。 */
  ghostEnabled: boolean;
  /** 冲刺结束到残影爆发之间的延迟。 */
  ghostDelay: number;
  /** 残影伤害倍率（相对 dmg）。 */
  ghostDamageMult: number;
  /** 双生残影进化：冲刺起点和终点各留一个。 */
  ghostTwin: boolean;

  // ---- 蓄势：精准释放 ----
  /** 精准窗口下限。0 = 未持有精准释放。 */
  chargePreciseMin: number;
  /** 精准窗口上限。 */
  chargePreciseMax: number;
  /** 精准释放的伤害倍率（覆盖普通满蓄倍率 chargeDamageMult）。 */
  chargePreciseDamageMult: number;
  /** 精准释放的后摇倍率（覆盖普通满蓄后摇 chargeRecoverMult）。 */
  chargePreciseRecoverMult: number;
  /** 完美时机进化：精准释放命中 ≥2 个敌人时，额外减少的冲刺冷却。 */
  chargePreciseDashRefund: number;
  /** 宽容节拍进化：精准释放一个敌人都没命中时，后摇再打对折。 */
  chargePreciseMissHalvesRecover: boolean;

  // ---- 蓄势：震荡 ----
  /** 是否持有震荡（蓄力斩可以打断非 Boss 敌人的预警）。 */
  shockEnabled: boolean;
  /** 被打断的敌人重新抽冷却时乘的倍率。封招进化把它提到 1.4。 */
  shockCdMult: number;
  /** 封招进化：被打断的敌人额外硬直这么久（完全冻结，见 Enemy.stunT）。 */
  shockStunDuration: number;
  /** 反震进化：本次蓄力斩每打断一个敌人，额外造成 dmg × 这个数的伤害（最多按 3 层算）。 */
  shockReboundMult: number;

  // ---- 蓄势：余震 ----
  /** 是否持有余震。 */
  aftershockEnabled: boolean;
  /** 第一段延迟。 */
  aftershockDelay: number;
  /** 第一段伤害倍率（相对 dmg）。 */
  aftershockDamageMult: number;
  /** 余震半径倍率（相对蓄力斩命中范围）。 */
  aftershockRadiusMult: number;
  /** 二重余震进化：第二段伤害倍率。0 = 没有第二段。 */
  aftershockStage2Mult: number;
  /** 二重余震进化：第二段延迟。 */
  aftershockStage2Delay: number;
  /** 扩散余震进化：额外给命中的敌人加一次强击退。0 = 没有这个效果。 */
  aftershockKnockback: number;
}

export const BASE_STATS: Readonly<Stats> = {
  dmg: 12,
  atkCd: 0.36,
  range: 78,
  arc: 1.9,
  spd: 268,
  dashCd: 1.05,
  dashSpeedMult: 1,
  penMult: 1,
  costMult: 1,
  taxWindow: 5.0,
  refundNormal: 0,
  refundElite: 0,
  refundEliteClear: 0,
  projectile: false,
  projectileDamageMult: 0,
  dashDamage: 0,
  chargedSlash: false,
  chargeTime: 0,
  chargeDamageMult: 0,
  chargeRangeMult: 1,
  chargeRecoverMult: 1,
  chargeMoveSpeedMult: 1,

  bladePierceMode: 'off',
  bladePierce: 0,
  bladePierceFalloff: 1,
  bladePierceBonus: 1,

  bladeReturn: false,
  bladeReturnSpeed: 0,
  bladeReturnDamageMult: 1,
  bladeOrbit: false,
  bladeOrbitDuration: 0,

  markMax: 0,
  markDuration: 0,
  markDamagePerStack: 0,
  markMeleeBonusPerStack: 0,
  markDetonate: false,
  markDetonateDamageMult: 0,
  markDetonateSplashMult: 0,

  dashFlashCdPerHit: 0,
  dashFlashCdCap: 0,
  dashFlashInvulnBonus: 0,
  dashFlashDodgeRefund: 0,

  breakMult: 0,
  breakBossMult: 0,
  breakAll: false,
  breakChaseEnabled: false,
  breakChaseCdRefund: 0,
  breakChaseSpeedMult: 1,
  breakChaseSpeedDuration: 0,

  ghostEnabled: false,
  ghostDelay: 0,
  ghostDamageMult: 0,
  ghostTwin: false,

  chargePreciseMin: 0,
  chargePreciseMax: 0,
  chargePreciseDamageMult: 0,
  chargePreciseRecoverMult: 1,
  chargePreciseDashRefund: 0,
  chargePreciseMissHalvesRecover: false,

  shockEnabled: false,
  shockCdMult: 1,
  shockStunDuration: 0,
  shockReboundMult: 0,

  aftershockEnabled: false,
  aftershockDelay: 0,
  aftershockDamageMult: 0,
  aftershockRadiusMult: 0,
  aftershockStage2Mult: 0,
  aftershockStage2Delay: 0,
  aftershockKnockback: 0,
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

  /** 每多挨一次，价码乘这个数。窗口时长走 Stats.taxWindow（「适应」进化会改它）。 */
  taxStep: 1.3,

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

// ---------------------------------------------------------------- 模组基础能力

/**
 * 开局选中的模组会立即把这些数值写进 Stats（见 modules.ts 的 applyModuleBase）。
 * 这是「开局基础能力」，和后面 9 个专属强化是两回事——不选强化也一直生效。
 */
export const MODULES = {
  blade: {
    // 试玩反馈：v3 首版 0.40 打出来太肉，飞刃刃弹伤害回调到接近旧版 0.55 的水平
    damageMult: 0.55,
    speed: 620,
    radius: 5,
    life: 0.9,
    /** 爆印：引爆范围内的溅射半径。 */
    markSplashRadius: 90,
    /** 环身：环绕玩家的半径与角速度（rad/s）。 */
    orbitRadius: 40,
    orbitSpeed: 8,
  },
  dash: {
    damageMult: 0.85,
    /** 精准闪避：起跳前多近的险境才算数（秒，敌方弹预计命中时间 ≤ 这个数）。 */
    perfectDodgeWindow: 0.18,
    /** 破阵持续时间：普通敌人 / Boss。两条进化都不改这两个数。 */
    breakDuration: 1.6,
    breakBossDuration: 1.0,
    /** 残影引爆半径。两条进化都不改这个数。 */
    ghostRadius: 75,
  },
  charge: {
    chargeTime: 0.60,
    damageMult: 2.2,
    rangeMult: 1.05,
    recoverMult: 1.8,
    moveSpeedMult: 0.72,
  },
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
  /** 战斗房 3 选 1：2 模组专属 + 1 通用（未获得）。 */
  combatChoices: 3,
  /** 战斗房把其中一个基础位换成进化选项的概率（前提：存在可进化的已拥有强化）。 */
  combatEvolutionChance: 0.35,
  /** 精英房 3 选 1，至少这么多个是进化选项。 */
  eliteChoices: 3,
  eliteEvolutionMin: 2,
  /** 商店 4 槽：专属基础 / 专属基础或进化 / 通用或通用进化 / 随机折扣。 */
  shopSlots: 4,
} as const;

// ---------------------------------------------------------------- 限时宝箱原型

/** 只在本局进入的第二个普通战斗房启用；不参与地图房型生成。 */
export const TIMED_CHEST = {
  initialTime: 30,
  criticalTime: 5,
  hitFlashTime: 0.32,
  rewardChoices: 4,
  /** 空场，避免原型宝箱与墙体重叠。 */
  layoutIndex: 4,
  position: { x: 900, y: 520 },
  enemyPlan: ['charger', 'charger', 'shooter', 'shooter', 'brute'] as const,
} as const;

/** 商店/奖励里各档强化的基础价区间，见 DESIGN.md §2.3。 */
export const PRICES = {
  moduleBase: [12, 16] as const,
  moduleEvo: [17, 22] as const,
  universalBase: [10, 14] as const,
  universalEvo: [15, 19] as const,
  /** 商店第 4 槽「随机折扣强化」的折扣比例。 */
  discountSlotMult: 0.75,
} as const;

/**
 * 精英房的血量倍率。这是房间类型属性，不是时间函数 —— 与累计时间无关。
 * 🎚️ 原为 1.35：叠在本就最肉的重甲身上（78hp → 105.3hp）过头了，
 * 配合 elitePlan 里放缓的重甲数量公式一起调轻。不降到 1.0 —— 精英房的
 * 房间定位就是"更多更硬"，完全去掉倍率会让精英怪和杂兵数值一样，
 * 只是数量多，丢了"精英"该有的单位强度感。
 */
export const ELITE_HP_MULT = 1.2;

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
  /** 通用减速倍率常数，供 Timeline 的「世界慢下来排期也跟着慢」测试使用。 */
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
