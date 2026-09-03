// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, selection slice (epic 0015 "cockpit supervisory control", board
 * web-mtdc6wq3-5wuc6i) — `resolveSelection` is the "one selection model" the epic's acceptance
 * criteria calls for: a single, pure source of truth for "what's selected" that both the tree
 * sidebar and the canvas will read, instead of each view growing its own selection logic and
 * silently drifting apart (the same duplicate-state failure mode the epic tracks elsewhere).
 * Pure and side-effect-free, per the epic's own phase order: still no rendering, no DOM.
 *
 * `selectedId` is treated as untrusted external state (URL param / click target) rather than an
 * always-valid id — a trace can scroll out of the graph between the id being captured and this
 * function running, so an id with no matching node resolves to "nothing selected" rather than a
 * dangling reference the caller has to separately guard against.
 *
 * `moveTreeSelection` is this same model's keyboard-navigation twin, against `buildPipelineTree`'s
 * lane/item grid rather than the raw graph — the eventual ARIA tree sidebar's arrow-key handling
 * needs "what should become selected" as a pure function of the current selection and a direction,
 * the same shape `resolveSelection` already gives the click/URL path. Still pure, still no DOM.
 */

import type { SpanGraph } from './pipeline-graph.js';
import type { TreeLane } from './pipeline-tree.js';

export interface SelectionState {
  readonly selectedId: string | null;
  /** Ids of nodes one edge away from `selectedId`, either direction. Empty when nothing is selected. */
  readonly connectedIds: ReadonlySet<string>;
}

const EMPTY_SELECTION: SelectionState = { selectedId: null, connectedIds: new Set() };

/**
 * Resolves `selectedId` against `graph` into the shared selection state. An id with no matching
 * node (stale selection) resolves to the same "nothing selected" state as `null`.
 */
export function resolveSelection(graph: SpanGraph, selectedId: string | null): SelectionState {
  if (selectedId === null) return EMPTY_SELECTION;
  if (!graph.nodes.some((node) => node.id === selectedId)) return EMPTY_SELECTION;

  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from === selectedId) connectedIds.add(edge.to);
    else if (edge.to === selectedId) connectedIds.add(edge.from);
  }
  return { selectedId, connectedIds };
}

export type TreeMoveDirection = 'up' | 'down' | 'left' | 'right';

function firstItemId(lanes: readonly TreeLane[]): string | null {
  for (const lane of lanes) {
    if (lane.items.length > 0) return lane.items[0]!.id;
  }
  return null;
}

/**
 * Resolves the id that one arrow-key press should select next against `lanes` (`buildPipelineTree`'s
 * output) — the same row/cell shape WAI-ARIA's treegrid navigation pattern describes: `up`/`down`
 * move a lane at a time, staying in the same item index (clamped to the target lane's last item);
 * `left`/`right` move an item at a time within the current lane. Movement clamps at grid edges
 * rather than wrapping — `up` on the first lane, or `left` on a lane's first item, leaves the
 * selection unchanged, since a silent wrap-around is a worse surprise for a screen-reader user than
 * a press that visibly does nothing.
 *
 * `selectedId` outside `lanes` — `null`, or stale the same way `resolveSelection` treats a dangling
 * id — resolves to the grid's first item, the same "start somewhere sane" a fresh Tab into the tree
 * needs; an empty `lanes` (nothing to select) resolves to `null`.
 */
export function moveTreeSelection(
  lanes: readonly TreeLane[],
  selectedId: string | null,
  direction: TreeMoveDirection,
): string | null {
  let laneIndex = -1;
  let itemIndex = -1;
  if (selectedId !== null) {
    for (let i = 0; i < lanes.length; i++) {
      const idx = lanes[i]!.items.findIndex((item) => item.id === selectedId);
      if (idx !== -1) {
        laneIndex = i;
        itemIndex = idx;
        break;
      }
    }
  }
  if (laneIndex === -1) return firstItemId(lanes);

  if (direction === 'left') {
    return lanes[laneIndex]!.items[Math.max(0, itemIndex - 1)]!.id;
  }
  if (direction === 'right') {
    const items = lanes[laneIndex]!.items;
    return items[Math.min(items.length - 1, itemIndex + 1)]!.id;
  }

  const targetLaneIndex = direction === 'up' ? laneIndex - 1 : laneIndex + 1;
  if (targetLaneIndex < 0 || targetLaneIndex >= lanes.length) return selectedId;
  const targetItems = lanes[targetLaneIndex]!.items;
  if (targetItems.length === 0) return selectedId;
  return targetItems[Math.min(itemIndex, targetItems.length - 1)]!.id;
}
