import { normalizeSeed, randomSeed } from '../core/rng';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';

/** 标题页。不计时 —— 还没开局。 */
export class TitleScene implements Scene {
  readonly countsTime = false;
  readonly pausable = false;

  constructor(private ctx: SceneContext) {}

  enter(): void {
    this.ctx.overlay.show(`
      <div class="ov-title">秒 · S E C O N D S</div>
      <div style="font-size:34px;font-weight:700;margin-bottom:18px">时间即货币</div>
      <div class="ov-sub">
        你没有血量。被打中只会让你的计时器变长。<br>
        买强化要花秒、开捷径要花秒、修复伤势也要花秒。<br>
        <span style="color:#ff8a5c">地图和商店界面同样在计时 —— 犹豫也是要付钱的。</span><br><br>
        <span style="opacity:.7">WASD 移动 · 鼠标瞄准 · 左键挥砍 · 空格/右键 朝光标冲刺(无敌帧)</span>
      </div>
      <div style="margin-bottom:8px;font-size:11px;opacity:.45;letter-spacing:2px">SEED（留空随机）</div>
      <input class="seedin" id="seed" placeholder="随机" autocomplete="off">
      <br><div class="btn" id="start">开 始</div>
    `);

    const input = document.getElementById('seed') as HTMLInputElement | null;
    const start = (): void => this.ctx.startRun(
      input && input.value.trim() !== '' ? normalizeSeed(input.value) : randomSeed(),
    );

    this.ctx.overlay.onClick('start', start);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  }

  exit(): void { this.ctx.overlay.hide(); }
  update(): void {}
  render(_r: Renderer): void {}
}
