import type { Vec2 } from '../core/math';

export type EnemyKind = 'charger' | 'shooter' | 'brute' | 'medic' | 'boss';

/** 敌人状态机的状态名。各类型共用这套词汇，但含义由各自的行为文件解释。 */
export type EnemyState =
  | 'idle' | 'telegraph' | 'attack' | 'recover'
  | 'bossBurstTel' | 'bossChargeTel' | 'bossCharge' | 'bossSlamTel';

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
  /** 本次冲刺已经打过的敌人（掠影用），冲刺结束时清空 */
  hitThisDash?: Set<Enemy>;
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
