// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { layoutCanvas, type CanvasCellSize } from '../../src/read/pipeline-canvas.js';
import { layoutGraph } from '../../src/read/pipeline-layout.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

const CELL: CanvasCellSize = { width: 120, height: 40, columnGap: 20, rowGap: 10 };

describe('layoutCanvas', () => {
  it('returns an empty, zero-sized layout for an empty graph', () => {
    const g = graph([]);
    expect(layoutCanvas(g, layoutGraph(g), CELL)).toEqual({
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
    });
  });

  it('places single-column lanes at x=0 stacked by row height + gap', () => {
    const g = graph([
      { id: 't1', traceId: 't1', label: 'plan', spanCount: 3, status: 0 },
      { id: 't2', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
    ]);
    const result = layoutCanvas(g, layoutGraph(g), CELL);
    expect(result).toEqual({
      nodes: [
        { id: 't1', x: 0, y: 0, width: 120, height: 40 },
        { id: 't2', x: 0, y: 50, width: 120, height: 40 },
      ],
      edges: [],
      width: 120,
      height: 90,
    });
  });

  it('lays a flat trace chain out left-to-right and paths its edges rightward', () => {
    const g = graph(
      [
        { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
        { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 0 },
      ],
      [{ from: 's1', to: 's2' }],
    );
    const result = layoutCanvas(g, layoutGraph(g), CELL);
    expect(result).toEqual({
      nodes: [
        { id: 's1', x: 0, y: 0, width: 120, height: 40 },
        { id: 's2', x: 140, y: 0, width: 120, height: 40 },
      ],
      edges: [
        {
          from: 's1',
          to: 's2',
          points: [
            { x: 120, y: 20 },
            { x: 140, y: 20 },
          ],
        },
      ],
      width: 260,
      height: 40,
    });
  });

  it('routes a cross-lane continuation edge orthogonally through the gap bands', () => {
    const g = graph(
      [
        { id: 't1', traceId: 't1', label: 'fix tests', spanCount: 2, status: 0 },
        { id: 't2', traceId: 't2', label: 'fix tests', spanCount: 1, status: 0 },
      ],
      [{ from: 't1', to: 't2' }],
    );
    const result = layoutCanvas(g, layoutGraph(g), CELL);
    expect(result.edges).toEqual([
      {
        from: 't1',
        to: 't2',
        points: [
          { x: 120, y: 20 },
          { x: 130, y: 20 },
          { x: 130, y: 45 },
          { x: 60, y: 45 },
          { x: 60, y: 50 },
        ],
      },
    ]);
  });

  it('routes an upward cross-lane edge through the row gap below its target', () => {
    const g = graph(
      [
        { id: 'a', traceId: 'ta', label: 'a', spanCount: 1, status: 0 },
        { id: 'b', traceId: 'tb', label: 'b', spanCount: 1, status: 0 },
      ],
      [{ from: 'b', to: 'a' }],
    );
    const result = layoutCanvas(g, layoutGraph(g), CELL);
    expect(result.edges).toEqual([
      {
        from: 'b',
        to: 'a',
        points: [
          { x: 120, y: 70 },
          { x: 130, y: 70 },
          { x: 130, y: 45 },
          { x: 60, y: 45 },
          { x: 60, y: 40 },
        ],
      },
    ]);
  });

  it('keeps a compacted continuation edge straight once both traces share a lane', () => {
    const g = graph(
      [
        { id: 't1', traceId: 't1', label: 'fix tests', spanCount: 2, status: 0 },
        { id: 't2', traceId: 't2', label: 'fix tests', spanCount: 1, status: 0 },
      ],
      [{ from: 't1', to: 't2' }],
    );
    const result = layoutCanvas(g, layoutGraph(g, { mode: 'compact' }), CELL);
    expect(result.edges).toEqual([
      {
        from: 't1',
        to: 't2',
        points: [
          { x: 120, y: 20 },
          { x: 140, y: 20 },
        ],
      },
    ]);
  });

  it('drops an edge whose endpoint has no matching layout position', () => {
    const g = graph(
      [{ id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 }],
      [{ from: 's1', to: 'missing' }],
    );
    const result = layoutCanvas(g, layoutGraph(g), CELL);
    expect(result.edges).toEqual([]);
  });
});
