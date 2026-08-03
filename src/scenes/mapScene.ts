import { COSTS } from '../game/config';
import { drawMap, nodeAt } from '../render/drawMap';
import { formatSeconds } from '../game/pricing';
import { CombatScene } from './combat';
import { ShopScene } from './shop';
import type { Scene, SceneContext } from './scene';
import type { Renderer } from '../render/renderer';
import type { MapNode } from '../game/map';

/**
 * 分支地图。整张图开局就摊开给你看，路线是规划出来的而不是抽出来的。
 *
 * ⚠️ 这个界面计时。看得越久，成绩越差。
 */
export class MapScene implements Scene {
  readonly countsTime = true;
  readonly pausable = true;

  private hovered: MapNode | null = null;

  constructor(private ctx: SceneContext) {}

  enter(): void { this.ctx.overlay.hide(); }

  update(_dt: number): void {
    const { input, run } = this.ctx;
    this.hovered = nodeAt(run.map, input.pointer, run.available);
    if (input.wasMousePressed('left') && this.hovered) this.select(this.hovered);
  }

  render(r: Renderer): void {
    const { run } = this.ctx;
    drawMap(r, run.map, run.available, run.current?.id ?? null, this.hovered);
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
        overlay.toast(`花费 ${cost}s，消除了 ${formatSeconds(cut)}s 惩罚`);
        this.leave(node);
        return;
      }

      case 'shortcut': {
        const cost = run.shortcutCost;
        run.ledger.addSpend(cost);
        overlay.toast(`花费 ${cost}s 跳过一整层`);
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
