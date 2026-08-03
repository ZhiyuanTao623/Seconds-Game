import { ARENA, MAP } from '../game/config';
import { TAU } from '../core/math';
import { t } from '../i18n/i18n';
import type { Renderer } from './renderer';
import type { MapNode, RoomKind, RunMap } from '../game/map';
import type { Vec2 } from '../core/math';

const MARGIN_X = 120;
const MARGIN_TOP = 96;
const MARGIN_BOTTOM = 70;
const NODE_R = 17;
const NODE_HIT_R = 26;

/** 第 1 层在底部，Boss 在顶部 —— 和「往上爬」的直觉一致。 */
export function nodePos(n: MapNode): Vec2 {
  const colSpan = ARENA.w - MARGIN_X * 2;
  const rowSpan = ARENA.h - MARGIN_TOP - MARGIN_BOTTOM;
  return {
    x: MARGIN_X + (n.col / (MAP.cols - 1)) * colSpan,
    y: ARENA.h - MARGIN_BOTTOM - ((n.floor - 1) / (MAP.floors - 1)) * rowSpan,
  };
}

export function nodeAt(map: RunMap, p: Vec2, ids: readonly string[]): MapNode | null {
  for (const id of ids) {
    const n = map.nodes.get(id);
    if (!n) continue;
    const pos = nodePos(n);
    if (Math.hypot(pos.x - p.x, pos.y - p.y) <= NODE_HIT_R) return n;
  }
  return null;
}

const KIND_COLOR: Record<RoomKind, string> = {
  combat: '#e8e8ec',
  elite: '#ff8a5c',
  shop: '#ffd166',
  mend: '#8fe388',
  shortcut: '#9fe3ff',
  boss: '#ff4444',
};

export function drawMap(
  r: Renderer,
  map: RunMap,
  available: readonly string[],
  currentId: string | null,
  hovered: MapNode | null,
): void {
  const { ctx } = r;
  const availableSet = new Set(available);

  drawEdges(r, map, availableSet);

  for (const n of map.nodes.values()) {
    const selectable = availableSet.has(n.id);
    drawNode(r, n, selectable, n.id === currentId, hovered?.id === n.id);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,232,236,.55)';
  ctx.font = '13px monospace';
  ctx.fillText(t().map.hint, ARENA.w / 2, 38);

  if (hovered) drawTooltip(r, hovered);
}

function drawEdges(r: Renderer, map: RunMap, availableSet: Set<string>): void {
  const { ctx } = r;
  for (const n of map.nodes.values()) {
    const from = nodePos(n);
    for (const id of n.next) {
      const child = map.nodes.get(id);
      if (!child) continue;
      const to = nodePos(child);

      // 捷径门跳两层，画成虚线，让「它绕过了什么」一眼看得见
      const isShortcut = child.floor - n.floor > 1;
      const live = availableSet.has(id) || n.visited;

      ctx.save();
      ctx.strokeStyle = live ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.13)';
      ctx.lineWidth = isShortcut ? 2 : 1.5;
      if (isShortcut) ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawNode(r: Renderer, n: MapNode, selectable: boolean, current: boolean, hovered: boolean): void {
  const { ctx } = r;
  const pos = nodePos(n);
  const color = KIND_COLOR[n.kind];

  const alpha = selectable || current ? 1 : n.visited ? 0.55 : 0.24;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (selectable) {
    // 可选节点外面套一圈呼吸光晕，不用读文字就知道现在能点哪
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (0.25 + pulse * 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_R + 8 + pulse * 3, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  ctx.fillStyle = current ? color : '#121218';
  ctx.strokeStyle = color;
  ctx.lineWidth = hovered ? 3 : 2;
  drawShape(r, n.kind, pos.x, pos.y, NODE_R);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(t().rooms[n.kind].label, pos.x, pos.y + NODE_R + 14);
  ctx.restore();
}

function drawShape(r: Renderer, kind: RoomKind, x: number, y: number, size: number): void {
  const { ctx } = r;
  switch (kind) {
    case 'combat': r.polygon(x, y, size, 3, -Math.PI / 2); break;
    case 'elite': r.polygon(x, y, size, 6, 0.3); break;
    case 'boss': r.polygon(x, y, size * 1.25, 8, performance.now() / 2600); break;
    case 'shop':
      ctx.beginPath();
      ctx.rect(x - size * 0.8, y - size * 0.8, size * 1.6, size * 1.6);
      break;
    case 'mend':
      ctx.beginPath();
      ctx.arc(x, y, size * 0.85, 0, TAU);
      break;
    case 'shortcut': r.polygon(x, y, size, 4, 0); break;
  }
}

function drawTooltip(r: Renderer, n: MapNode): void {
  const { ctx } = r;
  const room = t().rooms[n.kind];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,232,236,.8)';
  ctx.font = '700 14px monospace';
  ctx.fillText(room.label, ARENA.w / 2, ARENA.h - 34);
  ctx.fillStyle = 'rgba(232,232,236,.45)';
  ctx.font = '11px monospace';
  ctx.fillText(room.hint, ARENA.w / 2, ARENA.h - 16);
  ctx.restore();
}
