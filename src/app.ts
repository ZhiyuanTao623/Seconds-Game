import { ARENA, FIXED_STEP, MAX_STEPS_PER_FRAME } from './game/config';
import { Input } from './core/input';
import { Renderer } from './render/renderer';
import { Run } from './game/run';
import { Hud } from './ui/hud';
import { Overlay } from './ui/overlay';
import { getLocale, onLocaleChange, t, toggleLocale } from './i18n/i18n';
import { MapScene } from './scenes/mapScene';
import { ModeSelectScene } from './scenes/modeSelect';
import { ModuleSelectScene } from './scenes/moduleSelect';
import { ResultScene } from './scenes/result';
import { TitleScene } from './scenes/title';
import type { GameMode } from './game/mode';
import type { ModuleId } from './game/modules';
import type { Scene, SceneContext } from './scenes/scene';

export class App implements SceneContext {
  readonly input: Input;
  readonly overlay = new Overlay();

  private renderer: Renderer;
  private hud = new Hud();
  private currentRun: Run | null = null;
  private activeScene: Scene;
  private paused = false;
  private last = performance.now();
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, { w: ARENA.w, h: ARENA.h });
    this.applyLocaleToChrome();
    document.getElementById('langToggle')?.addEventListener('click', () => toggleLocale());
    onLocaleChange(this.onLocaleChange);

    this.activeScene = new TitleScene(this);
    this.activeScene.enter?.();
    this.updateLangToggleVisibility();
    requestAnimationFrame(this.frame);
  }

  get run(): Run {
    if (!this.currentRun) throw new Error('no active run');
    return this.currentRun;
  }

  /** 当前场景。只读 —— 切换一律走 go()。 */
  get scene(): Scene { return this.activeScene; }

  // ---------------------------------------------------------------- 场景跳转

  go(next: Scene): void {
    this.activeScene.exit?.();
    this.activeScene = next;
    this.activeScene.enter?.();
    this.updateLangToggleVisibility();
  }

  toMap(): void { this.go(new MapScene(this)); }
  toResult(): void { this.go(new ResultScene(this)); }
  toModeSelect(seed: number): void { this.go(new ModeSelectScene(this, seed)); }

  toModuleSelect(seed: number, mode: GameMode = 'speedrun'): void {
    this.go(new ModuleSelectScene(this, seed, mode));
  }

  startRun(seed: number, module: ModuleId, mode: GameMode = 'speedrun'): void {
    this.currentRun = new Run(seed, module, mode);
    this.hud.reset();
    this.setPaused(false);
    this.toMap();
  }

  toTitle(): void {
    this.currentRun = null;
    this.hud.reset();
    this.setPaused(false);
    this.go(new TitleScene(this));
  }

  // ---------------------------------------------------------------- 语言

  /** 页面里不归属任何场景的静态文字：帮助条、语言按钮、<title>、<html lang>。 */
  private applyLocaleToChrome(): void {
    document.documentElement.lang = t().meta.htmlLang;
    document.title = t().meta.title;

    const help = document.getElementById('help');
    if (help) help.textContent = t().help;

    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.textContent = getLocale() === 'zh' ? 'EN' : '中文';
  }

  /** 只在标题页出现 —— 开局之后没有再切语言的场景，不用一直占着屏幕角落。 */
  private updateLangToggleVisibility(): void {
    const toggle = document.getElementById('langToggle');
    if (toggle) toggle.style.display = this.activeScene instanceof TitleScene ? '' : 'none';
  }

  private onLocaleChange = (): void => {
    this.applyLocaleToChrome();

    if (this.paused) {
      this.renderPauseOverlay();
      return;
    }
    if (!this.overlay.isOpen) return;

    // 标题页的 seed 输入框会在 enter() 里被整个重建，抢救一下正在打的字
    const seedField = document.getElementById('seed') as HTMLInputElement | null;
    const savedSeed = seedField?.value;
    this.activeScene.enter?.();
    if (savedSeed) {
      const restored = document.getElementById('seed') as HTMLInputElement | null;
      if (restored) restored.value = savedSeed;
    }
  };

  // ---------------------------------------------------------------- 暂停

  private renderPauseOverlay(): void {
    const s = t().pause;
    this.overlay.show(`
      <div class="ov-title">${s.title}</div>
      <div class="ov-sub">
        ${s.note1}<br>
        ${s.note2}
      </div>
      <div class="btn" id="resume">${s.resume}</div>
      <div class="btn" id="quit">${s.quit}</div>
    `, { opaque: true });
    this.overlay.onClick('resume', () => this.setPaused(false));
    this.overlay.onClick('quit', () => this.toTitle());
  }

  private setPaused(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;

    if (value) {
      this.renderPauseOverlay();
    } else {
      this.overlay.hide();
      // 场景自己的界面（奖励卡、货架）刚才被暂停遮罩顶掉了，重建一次
      this.activeScene.enter?.();
    }
  }

  // ---------------------------------------------------------------- 主循环

  private frame = (now: number): void => {
    // 下限 0：时间戳倒退（切标签页、系统调时）绝不能把累加器推成负的，
    // 那会让整个循环静默停摆。上限 0.25：切回来时不要一次性补算几百步。
    const frameDt = Math.min(Math.max((now - this.last) / 1000, 0), 0.25);
    this.last = now;

    if (this.input.consume('Escape') && this.activeScene.pausable) this.setPaused(!this.paused);

    if (this.paused) {
      this.accumulator = 0;
      this.input.endStep();
    } else {
      this.accumulator += frameDt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
        this.accumulator -= FIXED_STEP;
        steps += 1;

        const scene = this.activeScene;
        scene.update(FIXED_STEP);
        // 场景可能在 update 里跳走了；时间记在「刚刚那一步所属的界面」上。
        // timeScale 让纯动画（战斗过场）和顿帧不按全价走表 ——
        // 玩家能操作或作决定时，时间才计入成绩。
        const scale = scene.timeScale ?? 1;
        if (scene.countsTime && this.currentRun && scale > 0) {
          this.currentRun.ledger.tick(FIXED_STEP * scale);
        }

        // 「按下沿」只在第一个逻辑步里有效，之后翻页
        this.input.endStep();
      }
      // 一步都没跑（高刷屏）时不翻页，否则会吞掉按键
      if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }

    this.renderer.begin();
    // 暂停时一帧世界都不画 —— 遮罩之外也不给任何可读信息
    if (!this.paused) this.activeScene.render(this.renderer);
    this.renderer.resetTransform();
    this.hud.update(this.currentRun, this.activeScene.player ?? null, this.activeScene.timedChest ?? null, frameDt);

    requestAnimationFrame(this.frame);
  };
}
