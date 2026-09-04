// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, worker-layout slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `layoutGraph` assigns deterministic swimlane positions to the
 * `SpanGraph` `spansToGraph` produces. Pure and side-effect-free, per the epic's own phase
 * order (model → worker layout → tree sidebar → canvases → file lens): still no rendering,
 * no DOM, no canvas — this only computes where each node WOULD sit.
 *
 * One lane per distinct `traceId`, in order of first appearance in `graph.nodes` — that
 * order is already time-sorted by `spansToGraph`, so this function trusts it rather than
 * re-deriving it from `startTimeUnixNano` a second time. Within a lane, nodes get
 * sequential columns in the order they appear, which is a no-op in `mode: 'grouped'`
 * (exactly one node per lane) and lays out a trace's span chain left-to-right in
 * `mode: 'flat'`.
 *
 * Layout swappability is part of the epic's acceptance ("per-lens layered/compact
 * modes … not a follow-on"), so the lane rule above is now `mode: 'layered'`, the
 * default. `mode: 'compact'` additionally folds traces connected by cross-trace
 * continuation edges (the grouped fleet lens's `autopilot.item` chains) into ONE
 * shared lane, columns sequential across the whole chain — a board item's firing
 * relay reads left-to-right instead of stair-stepping down one lane per trace.
 * Edges within a single trace already share a lane, so compact and layered agree
 * on every graph without cross-trace edges.
 *
 * `mode: 'compact'` further wraps fully DISCONNECTED single-node lanes — a trace
 * with exactly one span and no continuation edge to any other trace, the common
 * case once a fleet runs many unrelated board items — into a grid instead of
 * stacking each in its own row (board web-mtmpf1zc-6yzprb: 43 such lanes rendered
 * as one 2140px-tall single-column canvas). Only lanes with more than one node
 * are guaranteed edge-free zero-column-width connections to route around, so
 * grid-packed nodes never need edge-routing accommodation (see
 * `pipeline-canvas.ts`'s `edgePoints`: an isolated node is by construction never
 * an edge endpoint, since `compactLaneKeys` unions a lane group above size 1
 * precisely BECAUSE an edge touched it). Grid-eligible lanes are packed in
 * first-appearance order after every real (multi-node or edge-linked) lane's row,
 * `gridColumns` wide (default {@link DEFAULT_GRID_COLUMNS}), wrapping to
 * additional rows as needed. `mode: 'layered'` never grid-packs — the tree
 * sidebar's one-lane-per-traceId ARIA contract (`pipeline-tree.ts`) depends on
 * layered mode staying literal, which is why the panel composer always builds the
 * sidebar from a `mode: 'layered'` layout regardless of the canvas's own mode
 * (`pipeline-panel.ts`).
 */

import type { SpanGraph } from './pipeline-graph.js';

export type GraphLayoutMode = 'layered' | 'compact';

/** Default max nodes per row when `mode: 'compact'` wraps disconnected single-node lanes into a grid. */
export const DEFAULT_GRID_COLUMNS = 8;

export interface GraphLayoutOptions {
  readonly mode: GraphLayoutMode;
  /** `mode: 'compact'` only — max nodes per row in the disconnected-lane grid (default {@link DEFAULT_GRID_COLUMNS}). */
  readonly gridColumns?: number;
}

export interface GraphNodePosition {
  readonly id: string;
  /** Sequence within its lane — 0 for the first node of that `traceId`. */
  readonly x: number;
  /** Lane index — one per distinct `traceId`, ordered by first appearance. */
  readonly y: number;
}

export interface GraphLayout {
  readonly positions: readonly GraphNodePosition[];
}

/** Follows parent links to a trace's lane-group representative (union-find, no ranking). */
function rootOf(parent: Map<string, string>, traceId: string): string {
  let current = traceId;
  for (let next = parent.get(current); next !== undefined; next = parent.get(current)) {
    current = next;
  }
  return current;
}

/**
 * Maps each `traceId` to its compact lane key: traces joined by a cross-trace edge share a
 * key. Which representative wins is irrelevant — lane INDEX comes from node order later.
 */
function compactLaneKeys(graph: SpanGraph): Map<string, string> {
  const traceByNode = new Map(graph.nodes.map((node) => [node.id, node.traceId]));
  const parent = new Map<string, string>();
  for (const edge of graph.edges) {
    const fromTrace = traceByNode.get(edge.from);
    const toTrace = traceByNode.get(edge.to);
    if (fromTrace === undefined || toTrace === undefined) continue;
    const fromRoot = rootOf(parent, fromTrace);
    const toRoot = rootOf(parent, toTrace);
    if (fromRoot !== toRoot) parent.set(toRoot, fromRoot);
  }
  return new Map(graph.nodes.map((node) => [node.traceId, rootOf(parent, node.traceId)]));
}

/**
 * Assigns each node a swimlane position: one lane per `traceId` (`mode: 'layered'`, the
 * default) or per continuation-connected trace group (`mode: 'compact'`), columns in node
 * order within the lane. `mode: 'compact'` additionally grid-packs lane groups of exactly
 * one node (see the module header) instead of giving each its own row.
 */
export function layoutGraph(
  graph: SpanGraph,
  options: GraphLayoutOptions = { mode: 'layered' },
): GraphLayout {
  const laneKeyByTrace = options.mode === 'compact' ? compactLaneKeys(graph) : null;
  const keyOf = (traceId: string): string => laneKeyByTrace?.get(traceId) ?? traceId;

  // First pass: first-appearance order and node count per lane key — the count decides
  // which keys are grid-eligible (compact mode, exactly one node, so provably edge-free).
  const keyOrder: string[] = [];
  const countByKey = new Map<string, number>();
  for (const node of graph.nodes) {
    const key = keyOf(node.traceId);
    const count = countByKey.get(key);
    if (count === undefined) {
      countByKey.set(key, 1);
      keyOrder.push(key);
    } else {
      countByKey.set(key, count + 1);
    }
  }

  const gridEligible = (key: string): boolean =>
    options.mode === 'compact' && countByKey.get(key) === 1;

  // Real lanes (multi-node, or single-node under 'layered') get dense sequential rows first,
  // in first-appearance order — unchanged from the pre-grid behaviour.
  const rowByKey = new Map<string, number>();
  for (const key of keyOrder) {
    if (gridEligible(key)) continue;
    rowByKey.set(key, rowByKey.size);
  }

  // Grid-eligible lanes are packed after every real row, left-to-right, wrapping at
  // gridColumns — still in first-appearance order, so the layout stays deterministic.
  const gridColumns = Math.max(1, options.gridColumns ?? DEFAULT_GRID_COLUMNS);
  const gridRowStart = rowByKey.size;
  const gridPositionByKey = new Map<string, { readonly x: number; readonly y: number }>();
  let gridIndex = 0;
  for (const key of keyOrder) {
    if (!gridEligible(key)) continue;
    gridPositionByKey.set(key, {
      x: gridIndex % gridColumns,
      y: gridRowStart + Math.floor(gridIndex / gridColumns),
    });
    gridIndex++;
  }

  const nextColumnByKey = new Map<string, number>();
  const positions: GraphNodePosition[] = graph.nodes.map((node) => {
    const key = keyOf(node.traceId);
    const gridPosition = gridPositionByKey.get(key);
    if (gridPosition) return { id: node.id, x: gridPosition.x, y: gridPosition.y };
    const lane = rowByKey.get(key)!;
    const column = nextColumnByKey.get(key) ?? 0;
    nextColumnByKey.set(key, column + 1);
    return { id: node.id, x: column, y: lane };
  });
  return { positions };
}
