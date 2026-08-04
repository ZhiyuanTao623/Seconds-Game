import { MODULES } from './config';
import type { Stats } from './config';

/**
 * 开局三选一的战斗模组。选中的模组基础能力从第一秒起就生效——
 * 不需要拿任何强化，也不会因为拿了强化而失去。
 */
export type ModuleId = 'blade' | 'dash' | 'charge';

export const MODULE_IDS: readonly ModuleId[] = ['blade', 'dash', 'charge'];

/** 把模组基础能力写进 Stats。必须在任何强化/进化结算之前调用。 */
export function applyModuleBase(module: ModuleId, s: Stats): void {
  if (module === 'blade') {
    s.projectile = true;
    s.projectileDamageMult = MODULES.blade.damageMult;
  } else if (module === 'dash') {
    s.dashDamage = MODULES.dash.damageMult;
  } else {
    s.chargedSlash = true;
    s.chargeTime = MODULES.charge.chargeTime;
    s.chargeDamageMult = MODULES.charge.damageMult;
    s.chargeRangeMult = MODULES.charge.rangeMult;
    s.chargeRecoverMult = MODULES.charge.recoverMult;
    s.chargeMoveSpeedMult = MODULES.charge.moveSpeedMult;
  }
}
