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
 * One lane per distinct `traceId`, ordered by each trace's first-appearance `y` — NOT `y`
 * itself as a lane index: `layoutGraph(g, { mode: 'compact' })` grid-packs several
 * disconnected single-node traces onto one shared `y` row (columns differ, `y` doesn't), so
 * `y` is a many-per-lane sort key here, never a unique slot. Items within a lane are ordered
 * by `layout`'s column (`GraphNodePosition.x`), trusted rather than re-derived, exactly as
 * `layoutGraph` trusts `spansToGraph`'s time-sorted node order instead of re-deriving it a
 * second time. `graph` and `layout` must come from the same `spansToGraph` / `layoutGraph`
 * pair (every node in `graph.nodes` has a matching `layout.positions` entry) — this function
 * does not defend against a mismatched pair, the same trust boundary `layoutGraph` itself
 * draws.
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

/** Groups `graph`'s nodes into one lane per `traceId`, ordered by each lane's first-appearance `y`. */
export function buildPipelineTree(graph: SpanGraph, layout: GraphLayout): readonly TreeLane[] {
  const positionById = new Map(layout.positions.map((position) => [position.id, position]));
  // Keyed by traceId, not by `position.y` — under `layoutGraph(g, { mode: 'compact' })`'s
  // grid-packing, several disconnected single-node traces share one `y` row (distinguished
  // only by `x`), so `y` is not a unique per-trace lane index (see the module doc comment).
  // `x` is likewise not used as a direct array index: grid mode's `x` is a column within the
  // shared GLOBAL grid, not a per-lane-local sequence, so entries are collected then sorted
  // by `x` instead — a no-op reordering in layered/grouped mode, where `x` is already
  // per-lane-sequential from 0.
  const entriesByTrace = new Map<string, { x: number; item: TreeItem }[]>();
  const firstYByTrace = new Map<string, number>();
  for (const node of graph.nodes) {
    const position = positionById.get(node.id)!;
    let entries = entriesByTrace.get(node.traceId);
    if (entries === undefined) {
      entries = [];
      entriesByTrace.set(node.traceId, entries);
      firstYByTrace.set(node.traceId, position.y);
    }
    entries.push({
      x: position.x,
      item: {
        id: node.id,
        label: node.label,
        status: node.status,
        spanCount: node.spanCount,
        ...(node.firingOrdinal !== undefined ? { firingOrdinal: node.firingOrdinal } : {}),
        ...(node.firingSubject !== undefined ? { firingSubject: node.firingSubject } : {}),
      },
    });
  }
  return [...entriesByTrace.entries()]
    .sort(([traceA], [traceB]) => firstYByTrace.get(traceA)! - firstYByTrace.get(traceB)!)
    .map(([traceId, entries]) => ({
      traceId,
      items: entries.sort((a, b) => a.x - b.x).map((entry) => entry.item),
    }));
}
