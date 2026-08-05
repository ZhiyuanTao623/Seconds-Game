import { HIT, MODULES, PLAYER } from './config';
import { TAU, angleDiff, angleTo, dist, friction } from '../core/math';
import type { Bullet, Enemy } from './entities';
import type { World } from './world';
import type { InputSource } from '../core/input';

export interface Player {
  x: number; y: number; r: number;
  vx: number; vy: number;
  /** 瞄准角度，永远跟着光标 */
  aim: number;

  atkCd: number;

  dashCd: number;
  dashT: number;
  dashDir: number;
  /** 本次冲刺已经用掠影打过的敌人，冲刺结束时清空 */
  dashHits: Set<Enemy>;
  /** 本次冲刺的起点（残影专属：爆炸埋在这里，不是冲刺结束的位置） */
  dashStartX: number;
  dashStartY: number;
  /** 连闪：本次冲刺已经减掉的冷却，用来在 cap 前停手 */
  dashFlashReduced: number;
  /** 精准闪避：这次冲刺是不是在险境中起跳的（冲刺开始那一刻判定一次） */
  dashPerfectDodge: boolean;

  /** 追杀（破阵进化）给的临时加速剩余时间 */
  speedBuffT: number;

  /** 受击无敌剩余 */
  inv: number;
  /** 受击僵直剩余 */
  hitstun: number;
  /** 本次僵直的总时长（判断「过半可冲刺取消」用） */
  hitstunTotal: number;
  /** 受击红闪剩余 */
  flash: number;

  /** 连击税层数 */
  streak: number;
  /** 距离清零还有多久 */
  streakT: number;

  /** 蓄力中（仅持「蓄力」强化时） */
  charging: boolean;
  chargeT: number;
}

export function createPlayer(): Player {
  return {
    x: PLAYER.spawn.x, y: PLAYER.spawn.y, r: PLAYER.radius,
    vx: 0, vy: 0, aim: -Math.PI / 2,
    atkCd: 0,
    dashCd: 0, dashT: 0, dashDir: 0, dashHits: new Set(),
    dashStartX: 0, dashStartY: 0, dashFlashReduced: 0, dashPerfectDodge: false,
    speedBuffT: 0,
    inv: 0, hitstun: 0, hitstunTotal: 0, flash: 0,
    streak: 0, streakT: 0,
    charging: false, chargeT: 0,
  };
}

export const isInvulnerable = (p: Player): boolean => p.inv > 0 || p.dashT > 0;

/** 僵直是否已经过半 —— 过半之后可以用冲刺打断。 */
const canDashCancel = (p: Player): boolean =>
  p.hitstun <= 0 || p.hitstunTotal - p.hitstun >= HIT.hitstunDashCancelAt;

export function updatePlayer(world: World, input: InputSource, dt: number): void {
  const p = world.player;

  p.aim = angleTo(p, input.pointer);

  p.dashCd -= dt;
  p.atkCd -= dt;
  p.inv -= dt;
  p.flash -= dt;
  if (p.hitstun > 0) p.hitstun -= dt;
  if (p.speedBuffT > 0) p.speedBuffT -= dt;

  if (p.streakT > 0) {
    p.streakT -= dt;
    if (p.streakT <= 0) p.streak = 0;
  }

  updateDash(world, input, dt);
  updateMovement(world, input, dt);
  updateAttack(world, input, dt);
}

// ---------------------------------------------------------------- 冲刺

function updateDash(world: World, input: InputSource, dt: number): void {
  const p = world.player;
  const s = world.stats;

  const wantsDash = input.wasPressed('Space') || input.wasMousePressed('right');
  if (wantsDash && p.dashCd <= 0 && p.dashT <= 0 && canDashCancel(p)) {
    p.dashT = PLAYER.dashTime;
    p.dashCd = s.dashCd;
    // 冲刺一律朝光标，与移动键无关，且在按下那一帧就锁死
    p.dashDir = p.aim;
    p.dashHits.clear();
    p.dashStartX = p.x;
    p.dashStartY = p.y;
    p.dashFlashReduced = 0;
    // 精准闪避：起跳那一刻是不是正处在险境里，只判一次
    p.dashPerfectDodge = s.dashFlashDodgeRefund > 0 && isNearMiss(world);
    // 冲刺打断僵直与蓄力 —— 这是被围住时唯一的技术性出口
    p.hitstun = 0;
    p.charging = false;
    p.chargeT = 0;
    world.fx.ring(p.x, p.y, 6, 34, '#88aaff', 0.22);
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += Math.cos(p.dashDir) * PLAYER.dashSpeed * s.dashSpeedMult * dt;
    p.y += Math.sin(p.dashDir) * PLAYER.dashSpeed * s.dashSpeedMult * dt;
    if (s.dashDamage > 0) applyPhantomStrike(world, dt);
    if (p.dashT <= 0) finishDash(world);
  }
}

/**
 * 精准闪避的「险境」判定：敌方弹即将命中，或冲锋兵正处于冲刺攻击阶段。
 * 简化实现——不逐个敌人精确读秒到 0.18s，只覆盖两类最常见、最好读的威胁。
 */
function isNearMiss(world: World): boolean {
  const p = world.player;
  for (const b of world.bullets) {
    if (!b.hostile) continue;
    const gap = dist(p, b) - p.r - b.r;
    if (gap < 0) return true;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0 && gap / speed <= MODULES.dash.perfectDodgeWindow) return true;
  }
  for (const e of world.enemies) {
    if (!e.dead && e.kind === 'charger' && e.state === 'attack') return true;
  }
  return false;
}

/** 冲刺刚结束那一帧：结算无间的额外无敌、精准闪避的冷却返还、残影落点。 */
function finishDash(world: World): void {
  const p = world.player;
  const s = world.stats;

  if (s.dashFlashInvulnBonus > 0 && p.dashHits.size >= 3) {
    p.inv = Math.max(p.inv, s.dashFlashInvulnBonus);
  }
  if (p.dashPerfectDodge && s.dashFlashDodgeRefund > 0) {
    p.dashCd = Math.max(0, p.dashCd - s.dashCd * s.dashFlashDodgeRefund);
  }
  p.dashPerfectDodge = false;

  if (s.ghostEnabled) {
    world.spawnAfterimage(p.dashStartX, p.dashStartY);
    if (s.ghostTwin) world.spawnAfterimage(p.x, p.y);
  }

  p.dashHits.clear();
}

/** 掠影：冲刺穿过敌人时造成伤害，同一次冲刺对同一敌人只结算一次。 */
function applyPhantomStrike(world: World, _dt: number): void {
  const p = world.player;
  const s = world.stats;
  for (const e of world.enemies) {
    if (e.dead || p.dashHits.has(e)) continue;
    if (dist(p, e) > p.r + e.r) continue;
    p.dashHits.add(e);
    world.damageEnemy(e, s.dmg * s.dashDamage, 'DASH');
    world.fx.ring(e.x, e.y, 4, e.r + 26, '#88aaff', 0.24);
    world.addHitstop(0.02);

    // 连闪：每命中一个新敌人减一点冷却，单次冲刺封顶
    if (s.dashFlashCdPerHit > 0 && p.dashFlashReduced < s.dashFlashCdCap) {
      const cut = Math.min(s.dashFlashCdPerHit, s.dashFlashCdCap - p.dashFlashReduced);
      p.dashCd = Math.max(0, p.dashCd - cut);
      p.dashFlashReduced += cut;
    }
    // 破阵：被冲刺穿过的敌人进入易伤状态
    if (s.breakMult > 0) {
      e.brokenT = e.kind === 'boss' ? MODULES.dash.breakBossDuration : MODULES.dash.breakDuration;
    }
  }
}

// ---------------------------------------------------------------- 移动

function updateMovement(world: World, input: InputSource, dt: number): void {
  const p = world.player;
  const s = world.stats;

  if (p.dashT <= 0) {
    // 僵直期间移动输入无效，但击退速度照常生效 —— 你会被打飞，只是不能自己走
    let ix = 0;
    let iy = 0;
    if (p.hitstun <= 0) {
      ix = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
      iy = (input.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (input.isDown('KeyW', 'ArrowUp') ? 1 : 0);
      const mag = Math.hypot(ix, iy);
      if (mag > 0) { ix /= mag; iy /= mag; }
    }
    // 蓄势模组蓄力中移速打折 —— 判断安全窗口的代价；追杀（破阵进化）给的临时加速
    const speedMult = (p.charging ? s.chargeMoveSpeedMult : 1) * (p.speedBuffT > 0 ? s.breakChaseSpeedMult : 1);
    const spd = s.spd * speedMult;
    p.x += (ix * spd + p.vx) * dt;
    p.y += (iy * spd + p.vy) * dt;
  }

  const f = friction(PLAYER.selfFriction, dt);
  p.vx *= f;
  p.vy *= f;
  world.arena.collide(p);
}

// ---------------------------------------------------------------- 攻击

function updateAttack(world: World, input: InputSource, dt: number): void {
  const p = world.player;
  const s = world.stats;

  if (p.hitstun > 0) {
    p.charging = false;
    p.chargeT = 0;
    return;
  }

  if (s.chargedSlash) {
    updateChargedAttack(world, input, dt);
    return;
  }

  // 默认：按住左键，按 atkCd 的节奏连续挥砍
  if (input.isMouseDown('left') && p.atkCd <= 0) slash(world, false);
}

/**
 * 持有「蓄力」后按键语义改变：按住不再自动连砍。
 *   短按松开（< 0.5s）→ 普通挥砍
 *   按住 ≥ 0.5s 松开   → 360° 全向斩
 * 失去「按住不放自动输出」是它明码标价的代价。
 */
function updateChargedAttack(world: World, input: InputSource, dt: number): void {
  const p = world.player;

  if (input.wasMousePressed('left')) {
    p.charging = true;
    p.chargeT = 0;
  }

  if (p.charging && input.isMouseDown('left')) p.chargeT += dt;

  if (p.charging && input.wasMouseReleased('left')) {
    const s = world.stats;
    // 精准释放：窗口下限可能低于 chargeTime 本身，命中窗口就算「满蓄」，
    // 不需要真的攒够 chargeTime——这是它「提前一点点也能打出满蓄斩」的意义所在
    const precise = s.chargePreciseMin > 0 && p.chargeT >= s.chargePreciseMin && p.chargeT <= s.chargePreciseMax;
    const full = precise || p.chargeT >= s.chargeTime;
    p.charging = false;
    p.chargeT = 0;
    if (full) slash(world, true, precise);
    else if (p.atkCd <= 0) slash(world, false);
  }

  // 松开事件在切场景等情况下可能丢失，按键已经不在按下状态就收回蓄力
  if (p.charging && !input.isMouseDown('left')) {
    p.charging = false;
    p.chargeT = 0;
  }
}

function slash(world: World, charged: boolean, precise = false): void {
  const p = world.player;
  const s = world.stats;

  const range = charged ? s.range * s.chargeRangeMult : s.range;
  const arc = charged ? TAU : s.arc;
  const chargeDamageMult = precise ? s.chargePreciseDamageMult : s.chargeDamageMult;
  const chargeRecoverMult = precise ? s.chargePreciseRecoverMult : s.chargeRecoverMult;
  const damage = charged ? s.dmg * chargeDamageMult : s.dmg;

  p.atkCd = charged ? s.atkCd * chargeRecoverMult : s.atkCd;

  if (!charged) {
    // 普通挥砍带一点点前冲，让「够到」这件事有手感
    p.x += Math.cos(p.aim) * PLAYER.attackLunge;
    p.y += Math.sin(p.aim) * PLAYER.attackLunge;
    world.arena.collide(p);
  }

  world.fx.slash(p.x, p.y, p.aim, range, arc, charged ? 0.26 : 0.18);
  if (charged) world.fx.ring(p.x, p.y, 10, range, '#ffd166', 0.3);

  // 先圈出这一下能打到谁——震荡的打断次数要在真正结算伤害前数完，
  // 因为反震的加成是「这一整下蓄力斩」的加成，不是按命中顺序累进的
  const hitList: Enemy[] = [];
  for (const e of world.enemies) {
    if (e.dead) continue;
    if (dist(p, e) >= range + e.r) continue;
    if (!charged && Math.abs(angleDiff(angleTo(p, e), p.aim)) >= arc / 2) continue;
    hitList.push(e);
  }

  let interrupts = 0;
  if (charged && s.shockEnabled) {
    for (const e of hitList) if (world.interruptEnemy(e)) interrupts += 1;
  }
  const reboundBonus = interrupts > 0 && s.shockReboundMult > 0
    ? Math.min(interrupts, 3) * s.shockReboundMult * s.dmg
    : 0;

  for (const e of hitList) {
    const toEnemy = angleTo(p, e);
    world.damageEnemy(e, damage + reboundBonus, charged ? 'CHARGE' : 'MELEE');
    e.knockback.x += Math.cos(toEnemy) * PLAYER.enemyKnockback;
    e.knockback.y += Math.sin(toEnemy) * PLAYER.enemyKnockback;
    world.addHitstop(0.03);
  }

  if (charged && precise) {
    // 完美时机：精准释放命中 ≥2 个敌人，额外减冲刺冷却
    if (s.chargePreciseDashRefund > 0 && hitList.length >= 2) {
      p.dashCd = Math.max(0, p.dashCd - s.chargePreciseDashRefund);
    }
    // 宽容节拍：精准释放一个敌人都没打中，后摇再打对折
    if (s.chargePreciseMissHalvesRecover && hitList.length === 0) {
      p.atkCd *= 0.5;
    }
  }

  // 余震：蓄力斩释放位置留一个定时爆炸区
  if (charged && s.aftershockEnabled) {
    world.spawnAftershock(p.x, p.y, range * s.aftershockRadiusMult);
  }

  // 飞刃只挂在普通挥砍上 —— 全向斩已经是 360°，再往一个方向丢一枚没有意义
  if (s.projectile && !charged) {
    const bullet: Bullet = {
      x: p.x, y: p.y,
      vx: Math.cos(p.aim) * MODULES.blade.speed,
      vy: Math.sin(p.aim) * MODULES.blade.speed,
      r: MODULES.blade.radius,
      pen: 0,
      life: MODULES.blade.life,
      dead: false,
      hostile: false,
      damage: s.dmg * s.projectileDamageMult,
    };

    if (s.bladePierceMode !== 'off') {
      bullet.pierceMode = s.bladePierceMode;
      bullet.pierceLeft = s.bladePierce;
      bullet.pierceFalloff = s.bladePierceFalloff;
      bullet.pierceBonus = s.bladePierceBonus;
      bullet.hitEnemies = new Set();
    } else if (s.bladeReturn) {
      // 回旋但没贯刃：仍需要去重集合——去程和回程各命中一次
      bullet.hitEnemies = new Set();
    }

    if (s.bladeReturn) {
      bullet.phase = 'out';
      bullet.maxRange = MODULES.blade.speed * MODULES.blade.life;
      bullet.originX = p.x;
      bullet.originY = p.y;
    }

    world.bullets.push(bullet);
  }
}
