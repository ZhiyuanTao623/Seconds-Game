import type { Vec2 } from '../core/math';

export type EnemyKind = 'charger' | 'shooter' | 'brute' | 'medic' | 'boss';

/**
 * 伤害来源标签。damageEnemy 的每一次调用都带一个，写进 Enemy.lastHitTag。
 * 刃印只认 BLADE、震荡打断只认 CHARGE 之类的机制都靠它区分来源，
 * 而不是重新判断「这次调用是从哪个函数发起的」。
 */
export type DamageTag = 'MELEE' | 'BLADE' | 'DASH' | 'CHARGE' | 'EXPLOSION' | 'AFTEREFFECT';

/** 敌人状态机的状态名。各类型共用这套词汇，但含义由各自的行为文件解释。 */
export type EnemyState =
  | 'idle' | 'telegraph' | 'attack' | 'recover'
  | 'bossPhaseShift'
  | 'bossBurstTel' | 'bossBurstRecall'
  | 'bossChargeTel' | 'bossCharge' | 'bossRecallChargeTel' | 'bossRecallCharge'
  | 'bossSlamTel' | 'bossSlamRecallTel' | 'bossSlamRecall';

export interface Enemy {
  kind: EnemyKind;
  x: number; y: number;
  r: number;
  hp: number;
  maxHp: number;
  /** 时间惩罚底价（接触/默认招式） */
  pen: number;
  spd: number;

  state: EnemyState;
  /** 当前状态的剩余时间 */
  t: number;
  /** 下一次出招的冷却 */
  cd: number;
  /** 锁定的攻击方向 */
  dir: number;
  /** 受击白闪剩余时间 */
  flash: number;
  knockback: Vec2;
  dead: boolean;

  /**
   * 招式已放出、伤害还在飞的时候的「当前报价」。
   * Boss 震波落地前必须靠它把价签压在 3.0，否则会跳回接触价 5.0。
   */
  threat: number;

  /** Boss 三连冲锋的剩余次数 */
  comboLeft: number;
  /** Boss 是否已进入半血后的「回收」阶段。其他敌人恒为 false。 */
  phaseTwo: boolean;
  /** Boss 回收动作结束后的破绽剩余时间。 */
  vulnerable: number;
  /** 最近一次受到伤害的来源标签。刃印/震荡等机制靠它判断触发条件。 */
  lastHitTag?: DamageTag;

  /** 刃印层数（飞刃模组「刃印」专属，其余情况恒为 0）。 */
  markStacks: number;
  /** 刃印剩余持续时间；归零时 markStacks 清空。 */
  markT: number;

  /** 破阵状态剩余时间（掠影模组「破阵」专属，其余情况恒为 0）。 */
  brokenT: number;

  /**
   * 硬直剩余时间（蓄势模组「震荡」的封招进化专属，其余情况恒为 0）。
   * >0 时这个敌人的 update() 整个跳过——不移动、不预警、冷却也不倒计时。
   */
  stunT: number;
}

export interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  /** 时间惩罚底价。玩家的刃弹这个字段为 0。 */
  pen: number;
  life: number;
  dead: boolean;
  /** true = 敌方弹（会收玩家的钱），false = 玩家的刃弹 */
  hostile: boolean;
  /** 玩家刃弹的伤害；贯刃穿透衰减会直接改这个字段。 */
  damage: number;

  // ---- 飞刃模组专属，只有玩家刃弹（hostile === false）可能带 ----
  /** 贯刃模式：'stack' = 无阻式层层衰减，'finale' = 贯心式二段终结。未定义 = 没有贯刃。 */
  pierceMode?: 'stack' | 'finale';
  /** stack 模式下，本段还能再穿透几个敌人（不含本次命中）。 */
  pierceLeft?: number;
  /** stack 模式下每次穿透后的伤害衰减倍率。 */
  pierceFalloff?: number;
  /** finale 模式下第二个目标的伤害加成倍率。 */
  pierceBonus?: number;
  /** 已经命中过的敌人；每进入新一段（去程/回程/环绕）就清空一次。 */
  hitEnemies?: Set<Enemy>;
  /** 当前这一段（去程/回程/环绕）已经命中的次数，用于套用穿透上限。 */
  legHits?: number;
  /** 回旋阶段：out=去程，back=回程，orbit=环身进化的环绕。未定义 = 没有回旋。 */
  phase?: 'out' | 'back' | 'orbit';
  /** 触发回程所需的飞行距离。 */
  maxRange?: number;
  originX?: number;
  originY?: number;
  /** orbit 阶段剩余时间。 */
  orbitT?: number;
  /** orbit 阶段当前角度，环绕玩家转动用。 */
  orbitAngle?: number;
}
