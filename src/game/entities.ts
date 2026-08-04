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
  /** 玩家刃弹的伤害 */
  damage: number;
  /** 玩家刃弹已经打过的敌人，防止一颗弹连续结算 */
  spent?: boolean;
}
