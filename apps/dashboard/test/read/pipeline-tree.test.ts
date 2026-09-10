// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { buildPipelineTree } from '../../src/read/pipeline-tree.js';
import { layoutGraph } from '../../src/read/pipeline-layout.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';
import type { GraphLayout } from '../../src/read/pipeline-layout.js';

function graph(nodes: SpanGraph['nodes']): SpanGraph {
  return { nodes, edges: [] };
}

describe('buildPipelineTree', () => {
  it('returns no lanes for an empty graph', () => {
    const g = graph([]);
    expect(buildPipelineTree(g, layoutGraph(g))).toEqual([]);
  });

  it('groups nodes into one lane per traceId, in lane-index order, items in column order', () => {
    const g = graph([
      { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
      { id: 's2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
      { id: 's3', traceId: 't1', label: 'implement', spanCount: 1, status: 0 },
    ]);
    expect(buildPipelineTree(g, layoutGraph(g))).toEqual([
      {
        traceId: 't1',
        items: [
          { id: 's1', label: 'plan', spanCount: 1, status: 0 },
          { id: 's3', label: 'implement', spanCount: 1, status: 0 },
        ],
      },
      {
        traceId: 't2',
        items: [{ id: 's2', label: 'other', spanCount: 1, status: 0 }],
      },
    ]);
  });

  it('gives a grouped-mode graph (one node per trace) a single-item lane each', () => {
    const g = graph([
      { id: 't1', traceId: 't1', label: 'plan', spanCount: 3, status: 2 },
      { id: 't2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
    ]);
    expect(buildPipelineTree(g, layoutGraph(g))).toEqual([
      { traceId: 't1', items: [{ id: 't1', label: 'plan', spanCount: 3, status: 2 }] },
      { traceId: 't2', items: [{ id: 't2', label: 'other', spanCount: 1, status: 0 }] },
    ]);
  });

  it('carries a node’s firingOrdinal/firingSubject through onto its TreeItem (board web-mtmpf1zc-6yzprb)', () => {
    const g = graph([
      {
        id: 't1',
        traceId: 't1',
        label: 'plan',
        spanCount: 1,
        status: 0,
        firingOrdinal: 52,
        firingSubject: 'fix(dashboard): something',
      },
    ]);
    expect(buildPipelineTree(g, layoutGraph(g))).toEqual([
      {
        traceId: 't1',
        items: [
          {
            id: 't1',
            label: 'plan',
            spanCount: 1,
            status: 0,
            firingOrdinal: 52,
            firingSubject: 'fix(dashboard): something',
          },
        ],
      },
    ]);
  });

  it('keeps every disconnected single-node trace when fed a compact-mode grid layout, even though several share one row', () => {
    // `layoutGraph(g, { mode: 'compact' })` grid-packs disconnected single-node traces onto
    // shared rows, distinguished only by column (pipeline-layout.ts's `gridPositionByKey`) —
    // e.g. two traces both land at y:0, at x:0 and x:1. `buildPipelineTree` must key lanes by
    // traceId, not treat `position.y` as a unique per-trace lane index, or it silently drops
    // whichever trace it visits first at that row.
    const g = graph([
      { id: 's1', traceId: 't1', label: 'first', spanCount: 1, status: 0 },
      { id: 's2', traceId: 't2', label: 'second', spanCount: 1, status: 0 },
    ]);
    const layout: GraphLayout = layoutGraph(g, { mode: 'compact' });
    expect(layout.positions).toEqual([
      { id: 's1', x: 0, y: 0 },
      { id: 's2', x: 1, y: 0 },
    ]);
    expect(buildPipelineTree(g, layout)).toEqual([
      { traceId: 't1', items: [{ id: 's1', label: 'first', spanCount: 1, status: 0 }] },
      { traceId: 't2', items: [{ id: 's2', label: 'second', spanCount: 1, status: 0 }] },
    ]);
  });
});
