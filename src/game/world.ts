import { BOSS, FEEL, HIT, MODULES, PLAYER } from './config';
import { Arena } from './arena';
import { Fx } from './fx';
import { Timeline } from '../core/timeline';
import { angleTo, dist, friction } from '../core/math';
import { comboTax, formatSeconds, penaltyFor } from './pricing';
import { isInvulnerable, createPlayer, updatePlayer } from './player';
import { updateEnemy } from './enemies';
import type { PriceContext } from './pricing';
import type { Player } from './player';
import type { Stats } from './config';
import type { Bullet, DamageTag, Enemy } from './entities';
import type { Ledger } from './ledger';
import type { RngStream } from '../core/rng';
import type { InputSource } from '../core/input';
import type { Vec2 } from '../core/math';

/**
 * 一个战斗房间的完整世界。
 *
 * 所有会改变游戏状态的东西都在这里 —— 渲染层只读它，绝不写它。
 * 敌人行为拿到的也是这个对象，所以没有任何模块级的可变全局。
 */
export class World {
  readonly arena: Arena;
  readonly player: Player;
  readonly fx = new Fx();
  readonly timeline = new Timeline();

  enemies: Enemy[] = [];
  bullets: Bullet[] = [];

  shake = 0;
  private hitstop = 0;
  /** 上一步世界时间相对真实时间的比例（顿帧时 < 1，其余为 1）。账本按它打折走表。 */
  private _timeScale = 1;

  constructor(
    layoutIndex: number,
    readonly rng: RngStream,
    readonly ledger: Ledger,
    public stats: Stats,
  ) {
    this.arena = new Arena(layoutIndex);
    this.player = createPlayer();
  }

  // ---------------------------------------------------------------- 报价

  /** 渲染价签和实际结算读的是同一个上下文对象，不存在两套口径。 */
  get priceContext(): PriceContext {
    return {
      invulnerable: isInvulnerable(this.player),
      penMult: this.stats.penMult,
      streak: this.player.streak,
    };
  }

  // ---------------------------------------------------------------- 结算

  /**
   * 收玩家的钱。全场唯一的入口。
   * `base` 是底价，最终扣多少由 penaltyFor 决定 —— 和价签同一条公式。
   */
  hitPlayer(base: number, source?: Vec2): void {
    const p = this.player;
    if (isInvulnerable(p)) return;

    const tax = comboTax(p.streak);
    const sec = penaltyFor(base, this.priceContext);
    this.ledger.addPenalty(sec);

    p.streak += 1;
    p.streakT = this.stats.taxWindow;
    p.inv = HIT.invTime;

    // 围殴护栏：被围到第 3 下起僵直减半，否则冲刺一进冷却就再也挣不脱
    p.hitstunTotal = p.streak >= HIT.hitstunHalveAtStreak ? HIT.hitstun / 2 : HIT.hitstun;
    p.hitstun = p.hitstunTotal;
    p.flash = HIT.flash;
    p.charging = false;
    p.chargeT = 0;

    this.addShake(HIT.shake);
    this.addHitstop(HIT.hitstop);
    this.fx.float(p.x, p.y - 30, `+${formatSeconds(sec)}s`, '#ff4444', 34);
    if (tax > 1) this.fx.float(p.x, p.y - 66, `连击税 ×${tax.toFixed(2)}`, '#ff8a5c', 15);
    this.fx.ring(p.x, p.y, 10, 60, '#ff4444', 0.3);

    const away = source ? angleTo(source, p) : p.aim + Math.PI;
    p.vx += Math.cos(away) * PLAYER.selfKnockback;
    p.vy += Math.sin(away) * PLAYER.selfKnockback;
  }

  /**
   * 刃印只在这里结算：MELEE 命中消耗已有层数（猎印额外乘一个易伤倍率），
   * BLADE 命中叠一层。爆印的自动引爆用 EXPLOSION 标签递归调用自己 ——
   * EXPLOSION 既不会消耗也不会叠加刃印，天然满足「爆炸不能再触发爆炸」。
   *
   * 破阵同样在这里结算：基础版只放大 MELEE 伤害，碎甲（breakAll）放大所有来源。
   */
  damageEnemy(e: Enemy, damage: number, tag: DamageTag = 'MELEE'): void {
    const s = this.stats;
    let d = damage;
    if (e.kind === 'boss' && e.vulnerable > 0) d *= BOSS.phaseTwo.weakPointDamageMult;

    if (e.brokenT > 0 && (s.breakAll || tag === 'MELEE')) {
      d *= 1 + (e.kind === 'boss' ? s.breakBossMult : s.breakMult);
    }

    let markBonus = 0;
    if (tag === 'MELEE' && s.markMax > 0 && !s.markDetonate && e.markStacks > 0) {
      d *= 1 + s.markMeleeBonusPerStack * e.markStacks;
      markBonus = s.dmg * s.markDamagePerStack * e.markStacks;
      e.markStacks = 0;
      e.markT = 0;
    }

    e.hp -= d + markBonus;
    e.flash = 0.12;
    e.lastHitTag = tag;

    if (e.hp > 0 || e.dead) {
      if (tag === 'BLADE' && s.markMax > 0 && !e.dead) this.applyMark(e);
      return;
    }

    const wasBroken = e.brokenT > 0;
    e.dead = true;
    this.fx.ring(e.x, e.y, e.r, e.r + 46, '#fff', 0.3);
    if (e.kind !== 'boss') {
      const refund = e.kind === 'brute' || e.kind === 'medic' ? this.stats.refundElite : this.stats.refundNormal;
      if (refund > 0) {
        this.ledger.addRefund(refund);
        this.fx.float(e.x, e.y - 20, `-${formatSeconds(refund)}s`, '#8fe388', 20);
      }
    }

    // 追杀（破阵进化 B）：击杀一个还处于破阵状态的敌人，减冲刺冷却 + 短暂加速
    if (wasBroken && s.breakChaseEnabled) {
      const p = this.player;
      p.dashCd = Math.max(0, p.dashCd - s.breakChaseCdRefund);
      p.speedBuffT = s.breakChaseSpeedDuration;
    }
  }

  private applyMark(e: Enemy): void {
    const s = this.stats;
    e.markStacks = Math.min(s.markMax, e.markStacks + 1);
    e.markT = s.markDuration;
    if (s.markDetonate && e.markStacks >= s.markMax) this.detonateMarks(e);
  }

  private detonateMarks(e: Enemy): void {
    const s = this.stats;
    e.markStacks = 0;
    e.markT = 0;
    this.fx.ring(e.x, e.y, 8, 96, '#ffb347', 0.3);
    this.damageEnemy(e, s.dmg * s.markDetonateDamageMult, 'EXPLOSION');
    for (const other of this.enemies) {
      if (other === e || other.dead) continue;
      if (dist(e, other) > MODULES.blade.markSplashRadius) continue;
      this.damageEnemy(other, s.dmg * s.markDetonateSplashMult, 'EXPLOSION');
    }
  }

  /**
   * 残影：冲刺结束时在给定位置埋一个定时炸弹，`ghostDelay` 秒后爆发。
   * 排期走 `timeline`，顿帧/时停都会正确影响它——不用 setTimeout。
   * 爆炸本身走 AFTEREFFECT 标签，不会再生成新的残影（没有任何代码在这个
   * 标签下调度 spawnAfterimage，禁令是结构性的，不需要额外的状态位）。
   */
  spawnAfterimage(x: number, y: number): void {
    const s = this.stats;
    this.fx.ring(x, y, MODULES.dash.ghostRadius, MODULES.dash.ghostRadius, '#88aaff', s.ghostDelay);
    this.timeline.after(s.ghostDelay, () => {
      this.fx.ring(x, y, 8, MODULES.dash.ghostRadius + 20, '#88aaff', 0.3);
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist({ x, y }, e) > MODULES.dash.ghostRadius) continue;
        this.damageEnemy(e, s.dmg * s.ghostDamageMult, 'AFTEREFFECT');
      }
    });
  }

  // ---------------------------------------------------------------- 演出钩子

  addShake(v: number): void { this.shake = Math.max(this.shake, v); }
  addHitstop(v: number): void { this.hitstop = Math.max(this.hitstop, v); }

  // ---------------------------------------------------------------- 主循环

  get cleared(): boolean { return this.enemies.length === 0; }

  /** 世界在走多快（1 = 全速；顿帧期间 = hitstopScale）。账本按同一比例走表。 */
  get timeScale(): number { return this._timeScale; }

  /**
   * 推进一个固定步长。
   *
   * `dt` 是真实经过的时间。顿帧期间世界按 hitstopScale 放慢，
   * 账本也按同一比例走表（见 timeScale）——世界停住的那一瞬不计入成绩。
   */
  step(dt: number, input: InputSource): void {
    let worldDt = dt;
    this._timeScale = 1;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      worldDt = dt * FEEL.hitstopScale;
      this._timeScale = FEEL.hitstopScale;
    }

    updatePlayer(this, input, worldDt);

    for (const e of this.enemies) {
      if (e.dead) continue;
      updateEnemyCommon(e, worldDt);
      updateEnemy(this, e, worldDt);
      if (e.kind === 'boss') this.arena.clampToBounds(e);
      else this.arena.collide(e);
    }

    this.updateBullets(worldDt);
    this.timeline.advance(worldDt);
    this.fx.update(worldDt);

    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.shake > 0) {
      this.shake *= friction(FEEL.shakeDecay, dt);
      if (this.shake < FEEL.shakeCutoff) this.shake = 0;
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (b.hostile) this.stepHostileBullet(b, dt);
      else this.stepPlayerBlade(b, dt);
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private stepHostileBullet(b: Bullet, dt: number): void {
    const p = this.player;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    // 敌方弹不可被清除，只能靠走位和冲刺躲
    if (b.life <= 0 || !this.arena.contains(b) || this.arena.hitsWall(b)) {
      b.dead = true;
      return;
    }
    if (dist(p, b) < p.r + b.r) {
      this.hitPlayer(b.pen, b);
      b.dead = true;
    }
  }

  /**
   * 玩家的飞刃。没有回旋（`phase` 为 undefined）时行为和原版一样：
   * 飞到撞墙/超时/命中一个敌人（贯刃可以多穿几个）就消失。
   * 有回旋时，撞墙/超时/到达最大距离改成「转身回程」而不是消失；
   * 回到玩家身边后要么直接消失，要么（环身）环绕玩家一段时间。
   */
  private stepPlayerBlade(b: Bullet, dt: number): void {
    const p = this.player;

    if (b.phase === 'orbit') {
      b.orbitT = (b.orbitT ?? 0) - dt;
      if (b.orbitT <= 0) { b.dead = true; return; }
      b.orbitAngle = (b.orbitAngle ?? 0) + MODULES.blade.orbitSpeed * dt;
      b.x = p.x + Math.cos(b.orbitAngle) * MODULES.blade.orbitRadius;
      b.y = p.y + Math.sin(b.orbitAngle) * MODULES.blade.orbitRadius;
      this.hitEnemiesWithBlade(b);
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    const outOfBounds = !this.arena.contains(b) || this.arena.hitsWall(b);

    if (b.phase === 'out') {
      const traveled = Math.hypot(b.x - (b.originX ?? b.x), b.y - (b.originY ?? b.y));
      if ((b.maxRange !== undefined && traveled >= b.maxRange) || outOfBounds || b.life <= 0) {
        this.turnBladeBack(b);
        return;
      }
    } else if (b.phase === 'back') {
      if (dist(p, b) < p.r + b.r || outOfBounds || b.life <= 0) {
        this.finishBladeReturn(b);
        return;
      }
    } else if (outOfBounds || b.life <= 0) {
      b.dead = true;
      return;
    }

    this.hitEnemiesWithBlade(b);
  }

  private turnBladeBack(b: Bullet): void {
    const p = this.player;
    const speed = this.stats.bladeReturnSpeed || MODULES.blade.speed;
    const angle = Math.atan2(p.y - b.y, p.x - b.x);
    b.phase = 'back';
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.life = MODULES.blade.life;
    b.legHits = 0;
    b.hitEnemies?.clear();
  }

  private finishBladeReturn(b: Bullet): void {
    if (this.stats.bladeOrbit) {
      b.phase = 'orbit';
      b.orbitT = this.stats.bladeOrbitDuration;
      b.orbitAngle = Math.atan2(b.y - this.player.y, b.x - this.player.x);
      b.legHits = 0;
      b.hitEnemies?.clear();
    } else {
      b.dead = true;
    }
  }

  /** 命中判定 + 贯刃穿透/终结逻辑。orbit 阶段单独处理，不受穿透上限约束。 */
  private hitEnemiesWithBlade(b: Bullet): void {
    if (b.phase === 'orbit') {
      for (const e of this.enemies) {
        if (e.dead || b.hitEnemies?.has(e)) continue;
        if (dist(e, b) >= e.r + b.r) continue;
        b.hitEnemies?.add(e);
        this.damageEnemy(e, b.damage, 'BLADE');
        this.fx.ring(b.x, b.y, 2, 18, '#fff', 0.18);
      }
      return;
    }

    // 没有贯刃：本段最多命中 1 个敌人；stack 模式下每多穿透 1 个，上限 +1
    const cap = b.pierceMode === 'finale' ? 2 : 1 + (b.pierceLeft ?? 0);
    if ((b.legHits ?? 0) >= cap) return;

    for (const e of this.enemies) {
      if (e.dead || b.hitEnemies?.has(e)) continue;
      if (dist(e, b) >= e.r + b.r) continue;

      b.hitEnemies?.add(e);
      const hitIndex = (b.legHits ?? 0) + 1;
      b.legHits = hitIndex;

      const finaleSecond = b.pierceMode === 'finale' && hitIndex === 2;
      const returnBonus = b.phase === 'back' ? this.stats.bladeReturnDamageMult : 1;
      const damage = (finaleSecond ? b.damage * (b.pierceBonus ?? 1) : b.damage) * returnBonus;

      this.damageEnemy(e, damage, 'BLADE');
      this.fx.ring(b.x, b.y, 2, 18, '#fff', 0.18);

      // 每次穿透后都为下一次命中打折，第一下永远是全额伤害
      if (b.pierceMode === 'stack') b.damage *= b.pierceFalloff ?? 1;

      if (finaleSecond) { b.dead = true; return; }
      if (b.phase === undefined && hitIndex >= cap) { b.dead = true; return; }
      if (hitIndex >= cap) return;
    }
  }
}

/** 所有敌人共有的每帧处理：击退位移、白闪衰减、刃印过期。 */
function updateEnemyCommon(e: Enemy, dt: number): void {
  e.flash -= dt;
  e.x += e.knockback.x * dt;
  e.y += e.knockback.y * dt;
  const f = friction(PLAYER.enemyFriction, dt);
  e.knockback.x *= f;
  e.knockback.y *= f;

  if (e.markStacks > 0) {
    e.markT -= dt;
    if (e.markT <= 0) e.markStacks = 0;
  }

  if (e.brokenT > 0) e.brokenT -= dt;
}
