// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, tree-sidebar data slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `buildPipelineTree` folds a `SpanGraph` and its `GraphLayout` into the
 * lane → item hierarchy the eventual ARIA tree sidebar will render (`role="tree"` per lane
 * group, `role="treeitem"` per item). Pure and side-effect-free, per the epic's own phase order
 * (model → worker layout → tree sidebar → canvases → file lens): still no rendering, no DOM —
 * this only computes the hierarchy the sidebar WOULD walk.
 *
 * One lane per distinct `traceId`, ordered by `layout`'s lane index (`GraphNodePosition.y`,
 * itself first-appearance order per `layoutGraph`'s own doc comment) — trusted rather than
 * re-derived, exactly as `layoutGraph` trusts `spansToGraph`'s time-sorted node order instead
 * of re-deriving it a second time. `graph` and `layout` must come from the same `spansToGraph`
 * / `layoutGraph` pair (every node in `graph.nodes` has a matching `layout.positions` entry) —
 * this function does not defend against a mismatched pair, the same trust boundary
 * `layoutGraph` itself draws.
 */

import type { SpanGraph } from './pipeline-graph.js';
import type { GraphLayout } from './pipeline-layout.js';

export interface TreeItem {
  readonly id: string;
  readonly label: string;
  readonly status: number;
  readonly spanCount: number;
  /** Mirrors `SpanGraphNode.firingOrdinal` — ABSENT under the same rule (see there). */
  readonly firingOrdinal?: number;
  /** Mirrors `SpanGraphNode.firingSubject` — ABSENT under the same rule (see there). */
  readonly firingSubject?: string;
}

export interface TreeLane {
  readonly traceId: string;
  /** This lane's items, in `layout`'s column order (`GraphNodePosition.x`). */
  readonly items: readonly TreeItem[];
}

/** Groups `graph`'s nodes into lanes using `layout`'s lane assignment, in lane-index order. */
export function buildPipelineTree(graph: SpanGraph, layout: GraphLayout): readonly TreeLane[] {
  const positionById = new Map(layout.positions.map((position) => [position.id, position]));
  const laneIndexByTrace = new Map<string, number>();
  const lanes: TreeItem[][] = [];
  const traceIdByLaneIndex: string[] = [];
  for (const node of graph.nodes) {
    const position = positionById.get(node.id)!;
    let laneIndex = laneIndexByTrace.get(node.traceId);
    if (laneIndex === undefined) {
      laneIndex = position.y;
      laneIndexByTrace.set(node.traceId, laneIndex);
      lanes[laneIndex] = [];
      traceIdByLaneIndex[laneIndex] = node.traceId;
    }
    lanes[laneIndex]![position.x] = {
      id: node.id,
      label: node.label,
      status: node.status,
      spanCount: node.spanCount,
      ...(node.firingOrdinal !== undefined ? { firingOrdinal: node.firingOrdinal } : {}),
      ...(node.firingSubject !== undefined ? { firingSubject: node.firingSubject } : {}),
    };
  }
  return lanes.map((items, laneIndex) => ({
    traceId: traceIdByLaneIndex[laneIndex]!,
    items,
  }));
}
