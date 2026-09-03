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
 */

import type { SpanGraph } from './pipeline-graph.js';

export type GraphLayoutMode = 'layered' | 'compact';

export interface GraphLayoutOptions {
  readonly mode: GraphLayoutMode;
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
 * order within the lane.
 */
export function layoutGraph(
  graph: SpanGraph,
  options: GraphLayoutOptions = { mode: 'layered' },
): GraphLayout {
  const laneKeyByTrace = options.mode === 'compact' ? compactLaneKeys(graph) : null;
  const laneByKey = new Map<string, number>();
  const nextColumnByKey = new Map<string, number>();
  const positions: GraphNodePosition[] = graph.nodes.map((node) => {
    const key = laneKeyByTrace?.get(node.traceId) ?? node.traceId;
    let lane = laneByKey.get(key);
    if (lane === undefined) {
      lane = laneByKey.size;
      laneByKey.set(key, lane);
    }
    const column = nextColumnByKey.get(key) ?? 0;
    nextColumnByKey.set(key, column + 1);
    return { id: node.id, x: column, y: lane };
  });
  return { positions };
}
