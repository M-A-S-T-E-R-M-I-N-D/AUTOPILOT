// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { layoutGraph, DEFAULT_GRID_COLUMNS } from '../../src/read/pipeline-layout.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

describe('layoutGraph', () => {
  it('returns no positions for an empty graph', () => {
    expect(layoutGraph(graph([]))).toEqual({ positions: [] });
  });

  it('assigns one lane per distinct traceId, in order of first appearance', () => {
    const result = layoutGraph(
      graph([
        { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
        { id: 's2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
        { id: 's3', traceId: 't1', label: 'implement', spanCount: 1, status: 0 },
      ]),
    );
    expect(result).toEqual({
      positions: [
        { id: 's1', x: 0, y: 0 },
        { id: 's2', x: 0, y: 1 },
        { id: 's3', x: 1, y: 0 },
      ],
    });
  });

  it('gives each grouped node (one per trace) its own lane at column 0', () => {
    const result = layoutGraph(
      graph([
        { id: 't1', traceId: 't1', label: 'plan', spanCount: 3, status: 0 },
        { id: 't2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
      ]),
    );
    expect(result).toEqual({
      positions: [
        { id: 't1', x: 0, y: 0 },
        { id: 't2', x: 0, y: 1 },
      ],
    });
  });

  it('trusts the graph’s existing node order instead of re-sorting by time', () => {
    // spansToGraph already guarantees time-sorted node order; layoutGraph must mirror it
    // verbatim rather than re-deriving order, or the two could silently diverge.
    const result = layoutGraph(
      graph([
        { id: 'b', traceId: 't1', label: 'second', spanCount: 1, status: 0 },
        { id: 'a', traceId: 't1', label: 'first', spanCount: 1, status: 0 },
      ]),
    );
    expect(result.positions.map((p) => p.id)).toEqual(['b', 'a']);
  });

  describe('layout swappability — epic 0015 acceptance: per-lens layered/compact modes', () => {
    // Grouped fleet-lens shape: one node per trace, continuation edges between traces.
    const chained = graph(
      [
        { id: 'tA', traceId: 'tA', label: 'autopilot.firing', spanCount: 1, status: 0 },
        { id: 'tB', traceId: 'tB', label: 'autopilot.firing', spanCount: 1, status: 0 },
        { id: 'tC', traceId: 'tC', label: 'autopilot.firing', spanCount: 1, status: 0 },
        { id: 'tD', traceId: 'tD', label: 'autopilot.firing', spanCount: 1, status: 0 },
      ],
      [
        { from: 'tA', to: 'tC' },
        { from: 'tC', to: 'tD' },
      ],
    );

    it("an explicit mode: 'layered' matches the default one-lane-per-trace layout", () => {
      expect(layoutGraph(chained, { mode: 'layered' })).toEqual(layoutGraph(chained));
    });

    it("mode: 'compact' folds continuation-chained traces into one shared lane, columns in node order", () => {
      expect(layoutGraph(chained, { mode: 'compact' })).toEqual({
        positions: [
          { id: 'tA', x: 0, y: 0 },
          { id: 'tB', x: 0, y: 1 },
          { id: 'tC', x: 1, y: 0 },
          { id: 'tD', x: 2, y: 0 },
        ],
      });
    });

    it("mode: 'compact' grid-packs fully disconnected single-node traces instead of stacking them one per row (board web-mtmpf1zc-6yzprb)", () => {
      const unlinked = graph([
        { id: 't1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
        { id: 't2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
      ]);
      // Under 'layered' these stack into two rows; 'compact' packs them side by side on
      // row 0 instead, since neither has an edge to route around.
      expect(layoutGraph(unlinked)).toEqual({
        positions: [
          { id: 't1', x: 0, y: 0 },
          { id: 't2', x: 0, y: 1 },
        ],
      });
      expect(layoutGraph(unlinked, { mode: 'compact' })).toEqual({
        positions: [
          { id: 't1', x: 0, y: 0 },
          { id: 't2', x: 1, y: 0 },
        ],
      });
    });

    it("mode: 'compact' wraps the disconnected-node grid at gridColumns, in first-appearance order", () => {
      const manyIsolated = graph(
        Array.from({ length: DEFAULT_GRID_COLUMNS + 3 }, (_, i) => ({
          id: `t${i}`,
          traceId: `t${i}`,
          label: 'solo',
          spanCount: 1,
          status: 0,
        })),
      );
      const result = layoutGraph(manyIsolated, { mode: 'compact' });
      expect(result.positions.slice(0, DEFAULT_GRID_COLUMNS)).toEqual(
        Array.from({ length: DEFAULT_GRID_COLUMNS }, (_, i) => ({ id: `t${i}`, x: i, y: 0 })),
      );
      expect(result.positions.slice(DEFAULT_GRID_COLUMNS)).toEqual([
        { id: `t${DEFAULT_GRID_COLUMNS}`, x: 0, y: 1 },
        { id: `t${DEFAULT_GRID_COLUMNS + 1}`, x: 1, y: 1 },
        { id: `t${DEFAULT_GRID_COLUMNS + 2}`, x: 2, y: 1 },
      ]);
    });

    it("mode: 'compact' packs the disconnected-node grid below every real (multi-node or edge-linked) lane's row", () => {
      const mixed = graph(
        [
          { id: 'solo1', traceId: 'solo1', label: 'solo', spanCount: 1, status: 0 },
          { id: 'tA', traceId: 'tA', label: 'a', spanCount: 1, status: 0 },
          { id: 'tB', traceId: 'tB', label: 'b', spanCount: 1, status: 0 },
          { id: 'solo2', traceId: 'solo2', label: 'solo', spanCount: 1, status: 0 },
        ],
        [{ from: 'tA', to: 'tB' }],
      );
      expect(layoutGraph(mixed, { mode: 'compact' })).toEqual({
        positions: [
          { id: 'solo1', x: 0, y: 1 },
          { id: 'tA', x: 0, y: 0 },
          { id: 'tB', x: 1, y: 0 },
          { id: 'solo2', x: 1, y: 1 },
        ],
      });
    });

    it("mode: 'compact' respects a caller-supplied gridColumns", () => {
      const isolated = graph([
        { id: 't1', traceId: 't1', label: 'a', spanCount: 1, status: 0 },
        { id: 't2', traceId: 't2', label: 'b', spanCount: 1, status: 0 },
        { id: 't3', traceId: 't3', label: 'c', spanCount: 1, status: 0 },
      ]);
      expect(layoutGraph(isolated, { mode: 'compact', gridColumns: 2 })).toEqual({
        positions: [
          { id: 't1', x: 0, y: 0 },
          { id: 't2', x: 1, y: 0 },
          { id: 't3', x: 0, y: 1 },
        ],
      });
    });

    it("mode: 'compact' treats intra-trace edges (flat mode chains) as already same-lane — identical to layered", () => {
      const flat = graph(
        [
          { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
          { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 0 },
        ],
        [{ from: 's1', to: 's2' }],
      );
      expect(layoutGraph(flat, { mode: 'compact' })).toEqual(layoutGraph(flat));
    });

    it("mode: 'compact' merges transitively even when the linking edge appears before both lanes exist", () => {
      // tX→tZ arrives while tZ is later in node order than unrelated tY: the merged lane
      // is still the FIRST appearance's lane and tY's lane index stays dense (1, not 2).
      const result = layoutGraph(
        graph(
          [
            { id: 'tX', traceId: 'tX', label: 'a', spanCount: 1, status: 0 },
            { id: 'tY', traceId: 'tY', label: 'b', spanCount: 1, status: 0 },
            { id: 'tZ', traceId: 'tZ', label: 'c', spanCount: 1, status: 0 },
          ],
          [{ from: 'tX', to: 'tZ' }],
        ),
        { mode: 'compact' },
      );
      expect(result).toEqual({
        positions: [
          { id: 'tX', x: 0, y: 0 },
          { id: 'tY', x: 0, y: 1 },
          { id: 'tZ', x: 1, y: 0 },
        ],
      });
    });
  });
});
