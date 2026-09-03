// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, canvases slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `layoutCanvas` projects a `SpanGraph` and its `GraphLayout` (lane/column
 * indices) into the pixel-space rects and edge paths the eventual SVG canvas will draw. Pure and
 * side-effect-free, per the epic's own phase order (model → worker layout → tree sidebar →
 * canvases → file lens): still no rendering, no DOM, no SVG — this only computes the geometry the
 * canvas WOULD draw.
 *
 * Cell sizing is caller-supplied (`CanvasCellSize`) rather than hardcoded here — the epic's "no
 * non-token values" constraint governs CSS declarations, and this module has none; the eventual
 * canvas-rendering slice is the one that owns translating design tokens into a `CanvasCellSize`
 * and passing it in. Baking pixel constants into this pure layer would only mean re-deriving them
 * later, the same trust-boundary shape `pipeline-layout.ts` and `pipeline-tree.ts` already draw.
 *
 * Same-lane edges route as a straight two-point path from the source node's right-center to the
 * target node's left-center — intra-trace chains (and compacted continuation chains) are
 * same-row, left-to-right segments. Cross-lane edges — the grouped fleet lens's `autopilot.item`
 * continuation edges under `mode: 'layered'` — route orthogonally through the grid's node-free
 * gap bands instead of cutting a diagonal across other lanes: out of the source's right-center
 * into its column gap, along that gap to the row gap facing the source's side of the target,
 * along that row gap to the target's column, then into the target's nearest horizontal edge at
 * its center. Every lane shares one column grid (`nodeOrigin` is lane-independent), so gap-band
 * segments can never cross a node interior — overlap avoidance by construction, not search.
 */

import type { SpanGraph } from './pipeline-graph.js';
import type { GraphLayout, GraphNodePosition } from './pipeline-layout.js';

export interface CanvasCellSize {
  readonly width: number;
  readonly height: number;
  readonly columnGap: number;
  readonly rowGap: number;
}

export interface CanvasNodeRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasEdgePath {
  readonly from: string;
  readonly to: string;
  readonly points: readonly CanvasPoint[];
}

export interface CanvasLayout {
  readonly nodes: readonly CanvasNodeRect[];
  readonly edges: readonly CanvasEdgePath[];
  /** Bounding size that fits every node rect — 0 for an empty graph. */
  readonly width: number;
  readonly height: number;
}

function nodeOrigin(x: number, y: number, cell: CanvasCellSize): CanvasPoint {
  return { x: x * (cell.width + cell.columnGap), y: y * (cell.height + cell.rowGap) };
}

/**
 * Routes one edge: straight right-center → left-center within a lane, or an orthogonal path
 * through the (node-free, shared-grid) gap bands when the endpoints sit in different lanes,
 * entering the target through the horizontal edge that faces the source's lane.
 */
function edgePoints(
  from: GraphNodePosition,
  to: GraphNodePosition,
  cell: CanvasCellSize,
): CanvasPoint[] {
  const fromOrigin = nodeOrigin(from.x, from.y, cell);
  const toOrigin = nodeOrigin(to.x, to.y, cell);
  const exit: CanvasPoint = { x: fromOrigin.x + cell.width, y: fromOrigin.y + cell.height / 2 };
  if (from.y === to.y) {
    return [exit, { x: toOrigin.x, y: toOrigin.y + cell.height / 2 }];
  }
  const isDownward = to.y > from.y;
  const gapX = exit.x + cell.columnGap / 2;
  const gapY = isDownward
    ? toOrigin.y - cell.rowGap / 2
    : toOrigin.y + cell.height + cell.rowGap / 2;
  const entryX = toOrigin.x + cell.width / 2;
  const entryY = isDownward ? toOrigin.y : toOrigin.y + cell.height;
  return [
    exit,
    { x: gapX, y: exit.y },
    { x: gapX, y: gapY },
    { x: entryX, y: gapY },
    { x: entryX, y: entryY },
  ];
}

/** Projects `graph`/`layout`'s lane/column indices into pixel rects and straight edge paths. */
export function layoutCanvas(
  graph: SpanGraph,
  layout: GraphLayout,
  cell: CanvasCellSize,
): CanvasLayout {
  const positionById = new Map(layout.positions.map((position) => [position.id, position]));
  const nodes: CanvasNodeRect[] = layout.positions.map((position) => {
    const origin = nodeOrigin(position.x, position.y, cell);
    return { id: position.id, x: origin.x, y: origin.y, width: cell.width, height: cell.height };
  });

  const edges: CanvasEdgePath[] = [];
  for (const edge of graph.edges) {
    const from = positionById.get(edge.from);
    const to = positionById.get(edge.to);
    if (!from || !to) continue;
    edges.push({ from: edge.from, to: edge.to, points: edgePoints(from, to, cell) });
  }

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0);
  const maxY = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
  return { nodes, edges, width: maxX, height: maxY };
}
