import { BOSS, FEEL, HIT, PLAYER } from './config';
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
import type { Bullet, Enemy } from './entities';
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
  private slow = 0;
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
    p.streakT = HIT.taxWindow;
    p.inv = HIT.invTime;

    // 围殴护栏：被围到第 3 下起僵直减半，否则冲刺一进冷却就再也挣不脱
    p.hitstunTotal = p.streak >= HIT.hitstunHalveAtStreak ? HIT.hitstun / 2 : HIT.hitstun;
    p.hitstun = p.hitstunTotal;
    p.flash = HIT.flash;
    p.charging = false;
    p.chargeT = 0;

    // 反击窗口只有持有「反击」强化时才存在
    if (this.stats.counterDmg > 0) p.counter = HIT.riposteWindow;

    this.addShake(HIT.shake);
    this.addHitstop(HIT.hitstop);
    this.fx.float(p.x, p.y - 30, `+${formatSeconds(sec)}s`, '#ff4444', 34);
    if (tax > 1) this.fx.float(p.x, p.y - 66, `连击税 ×${tax.toFixed(2)}`, '#ff8a5c', 15);
    this.fx.ring(p.x, p.y, 10, 60, '#ff4444', 0.3);

    const away = source ? angleTo(source, p) : p.aim + Math.PI;
    p.vx += Math.cos(away) * PLAYER.selfKnockback;
    p.vy += Math.sin(away) * PLAYER.selfKnockback;
  }

  damageEnemy(e: Enemy, damage: number): void {
    let d = damage;
    if (this.stats.counterDmg > 0 && this.player.counter > 0) d *= 1 + this.stats.counterDmg;
    if (e.kind === 'boss' && e.vulnerable > 0) d *= BOSS.phaseTwo.weakPointDamageMult;

    e.hp -= d;
    e.flash = 0.12;

    if (this.stats.exec > 0 && e.kind !== 'boss' && e.hp / e.maxHp < this.stats.exec) e.hp = 0;
    if (e.hp > 0 || e.dead) return;

    e.dead = true;
    this.fx.ring(e.x, e.y, e.r, e.r + 46, '#fff', 0.3);
    if (this.stats.refund > 0 && e.kind !== 'boss') {
      this.ledger.addRefund(this.stats.refund);
      this.fx.float(e.x, e.y - 20, `-${formatSeconds(this.stats.refund)}s`, '#8fe388', 20);
    }
  }

  // ---------------------------------------------------------------- 演出钩子

  addShake(v: number): void { this.shake = Math.max(this.shake, v); }
  addHitstop(v: number): void { this.hitstop = Math.max(this.hitstop, v); }
  applySlow(duration: number): void { this.slow = Math.max(this.slow, duration); }

  // ---------------------------------------------------------------- 主循环

  get cleared(): boolean { return this.enemies.length === 0; }

  /** 世界在走多快（1 = 全速；顿帧期间 = hitstopScale）。账本按同一比例走表。 */
  get timeScale(): number { return this._timeScale; }

  /**
   * 推进一个固定步长。
   *
   * `dt` 是真实经过的时间。顿帧期间世界按 hitstopScale 放慢，
   * 账本也按同一比例走表（见 timeScale）——世界停住的那一瞬不计入成绩。
   * 「时停」只放慢敌人，玩家照常操作，所以不影响 timeScale。
   */
  step(dt: number, input: InputSource): void {
    let worldDt = dt;
    this._timeScale = 1;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      worldDt = dt * FEEL.hitstopScale;
      this._timeScale = FEEL.hitstopScale;
    }

    let enemyDt = worldDt;
    if (this.slow > 0) {
      this.slow -= worldDt;
      enemyDt = worldDt * FEEL.slowScale;
    }

    updatePlayer(this, input, worldDt);

    for (const e of this.enemies) {
      if (e.dead) continue;
      updateEnemyCommon(e, enemyDt);
      updateEnemy(this, e, enemyDt);
      if (e.kind === 'boss') this.arena.clampToBounds(e);
      else this.arena.collide(e);
    }

    this.updateBullets(enemyDt);
    this.timeline.advance(enemyDt);
    this.fx.update(worldDt);

    this.enemies = this.enemies.filter((e) => !e.dead);

    if (this.shake > 0) {
      this.shake *= friction(FEEL.shakeDecay, dt);
      if (this.shake < FEEL.shakeCutoff) this.shake = 0;
    }
  }

  private updateBullets(dt: number): void {
    const p = this.player;

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || !this.arena.contains(b) || this.arena.hitsWall(b)) {
        b.dead = true;
        continue;
      }

      if (b.hostile) {
        // 敌方弹不可被清除，只能靠走位和冲刺躲
        if (dist(p, b) < p.r + b.r) {
          this.hitPlayer(b.pen, b);
          b.dead = true;
        }
      } else {
        // 玩家的刃弹：命中一个敌人即消失
        for (const e of this.enemies) {
          if (e.dead || dist(e, b) >= e.r + b.r) continue;
          this.damageEnemy(e, b.damage);
          this.fx.ring(b.x, b.y, 2, 18, '#fff', 0.18);
          b.dead = true;
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => !b.dead);
  }
}

/** 所有敌人共有的每帧处理：击退位移与白闪衰减。 */
function updateEnemyCommon(e: Enemy, dt: number): void {
  e.flash -= dt;
  e.x += e.knockback.x * dt;
  e.y += e.knockback.y * dt;
  const f = friction(PLAYER.enemyFriction, dt);
  e.knockback.x *= f;
  e.knockback.y *= f;
}
