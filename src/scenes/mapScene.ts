import { COSTS } from '../game/config';
import { drawMap, nodeAt } from '../render/drawMap';
import { formatSeconds } from '../game/pricing';
import { t } from '../i18n/i18n';
import { CombatScene } from './combat';
import { ShopScene } from './shop';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { MapNode } from '../game/map';

/**
 * 分支地图。整张图开局就摊开给你看，路线是规划出来的而不是抽出来的。
 *
 * ⚠️ 竞速模式下这个界面计时，看得越久成绩越差；练习模式停表，可以慢慢规划。
 */
export class MapScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private hovered: MapNode | null = null;

  constructor(private ctx: SceneContext) {}

  /** 练习模式：选路不计时。走的是和战斗过场同一条停表通道。 */
  get timeScale(): number { return this.ctx.run.mode === 'practice' ? 0 : 1; }

  enter(): void { this.ctx.overlay.hide(); }

  update(_dt: number): void {
    const { input, run } = this.ctx;
    this.hovered = nodeAt(run.map, input.pointer, run.available);
    if (input.wasMousePressed('left') && this.hovered) this.select(this.hovered);
  }

  render(r: Renderer): void {
    const { run } = this.ctx;
    drawMap(r, run.map, run.available, run.current?.id ?? null, this.hovered, run.mode === 'practice');
  }

  private select(node: MapNode): void {
    const { run, overlay } = this.ctx;
    run.enter(node);

    switch (node.kind) {
      case 'combat':
      case 'elite':
      case 'boss':
        this.ctx.go(new CombatScene(this.ctx, node));
        return;

      case 'shop':
        this.ctx.go(new ShopScene(this.ctx, node));
        return;

      case 'mend': {
        const cost = run.mendCost;
        run.ledger.addSpend(cost);
        const cut = run.ledger.mendPenalty(COSTS.mendRatio);
        overlay.toast(t().map.mendToast(cost, formatSeconds(cut)));
        this.leave(node);
        return;
      }

      case 'shortcut': {
        const cost = run.shortcutCost;
        run.ledger.addSpend(cost);
        const skipped = node.skippedKinds ?? [];
        const elite = skipped.includes('elite');
        const label = skipped.length > 0 ? t().rooms[skipped[0]!].label : '';
        overlay.toast(t().map.shortcutToast(cost, label, elite));
        this.leave(node);
        return;
      }
    }
  }

  /** 无战斗的房间：结算完直接摊开下一批节点，留在地图上。 */
  private leave(node: MapNode): void {
    this.ctx.run.advance(node);
    this.hovered = null;
  }
}
