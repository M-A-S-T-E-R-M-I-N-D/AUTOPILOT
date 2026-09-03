// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { resolveSelection, moveTreeSelection } from '../../src/read/pipeline-selection.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';
import type { TreeLane } from '../../src/read/pipeline-tree.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

const NODES: SpanGraph['nodes'] = [
  { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
  { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 0 },
  { id: 's3', traceId: 't1', label: 'commit', spanCount: 1, status: 0 },
  { id: 's4', traceId: 't2', label: 'other', spanCount: 1, status: 0 },
];

describe('resolveSelection', () => {
  it('resolves null to nothing selected, no connections', () => {
    const g = graph(NODES, [{ from: 's1', to: 's2' }]);
    expect(resolveSelection(g, null)).toEqual({ selectedId: null, connectedIds: new Set() });
  });

  it('resolves an id with no matching node to nothing selected, same as null', () => {
    const g = graph(NODES, [{ from: 's1', to: 's2' }]);
    expect(resolveSelection(g, 'missing')).toEqual({
      selectedId: null,
      connectedIds: new Set(),
    });
  });

  it('selects a node with no edges: connectedIds is empty', () => {
    const g = graph(NODES);
    expect(resolveSelection(g, 's1')).toEqual({ selectedId: 's1', connectedIds: new Set() });
  });

  it('collects neighbors reachable as an edge source', () => {
    const g = graph(NODES, [{ from: 's1', to: 's2' }]);
    expect(resolveSelection(g, 's1')).toEqual({
      selectedId: 's1',
      connectedIds: new Set(['s2']),
    });
  });

  it('collects neighbors reachable as an edge target', () => {
    const g = graph(NODES, [{ from: 's1', to: 's2' }]);
    expect(resolveSelection(g, 's2')).toEqual({
      selectedId: 's2',
      connectedIds: new Set(['s1']),
    });
  });

  it('collects neighbors from both directions for a mid-chain selection', () => {
    const g = graph(NODES, [
      { from: 's1', to: 's2' },
      { from: 's2', to: 's3' },
    ]);
    expect(resolveSelection(g, 's2')).toEqual({
      selectedId: 's2',
      connectedIds: new Set(['s1', 's3']),
    });
  });

  it('never includes nodes from an unrelated trace', () => {
    const g = graph(NODES, [{ from: 's1', to: 's2' }]);
    const result = resolveSelection(g, 's1');
    expect(result.connectedIds.has('s4')).toBe(false);
  });
});

function item(id: string): TreeLane['items'][number] {
  return { id, label: id, status: 0, spanCount: 1 };
}

const LANES: readonly TreeLane[] = [
  { traceId: 't1', items: [item('a1'), item('a2'), item('a3')] },
  { traceId: 't2', items: [item('b1'), item('b2')] },
];

describe('moveTreeSelection', () => {
  it("resolves null to the grid's first item", () => {
    expect(moveTreeSelection(LANES, null, 'down')).toBe('a1');
  });

  it("resolves an id with no matching item to the grid's first item, same as null", () => {
    expect(moveTreeSelection(LANES, 'missing', 'right')).toBe('a1');
  });

  it('resolves to null when there are no lanes at all', () => {
    expect(moveTreeSelection([], null, 'down')).toBeNull();
  });

  it('right moves to the next item within the lane', () => {
    expect(moveTreeSelection(LANES, 'a1', 'right')).toBe('a2');
  });

  it("right clamps at the lane's last item instead of wrapping", () => {
    expect(moveTreeSelection(LANES, 'a3', 'right')).toBe('a3');
  });

  it('left moves to the previous item within the lane', () => {
    expect(moveTreeSelection(LANES, 'a2', 'left')).toBe('a1');
  });

  it("left clamps at the lane's first item instead of wrapping", () => {
    expect(moveTreeSelection(LANES, 'a1', 'left')).toBe('a1');
  });

  it('down moves to the same item index in the next lane', () => {
    expect(moveTreeSelection(LANES, 'a1', 'down')).toBe('b1');
  });

  it("down clamps the item index to the target lane's last item when it is shorter", () => {
    expect(moveTreeSelection(LANES, 'a3', 'down')).toBe('b2');
  });

  it('up moves to the same item index in the previous lane', () => {
    expect(moveTreeSelection(LANES, 'b1', 'up')).toBe('a1');
  });

  it('up clamps at the first lane instead of wrapping', () => {
    expect(moveTreeSelection(LANES, 'a1', 'up')).toBe('a1');
  });

  it('down clamps at the last lane instead of wrapping', () => {
    expect(moveTreeSelection(LANES, 'b1', 'down')).toBe('b1');
  });

  it('up/down leaves the selection unchanged when the target lane has no items', () => {
    const lanesWithEmptyMiddle: readonly TreeLane[] = [
      { traceId: 't1', items: [item('a1')] },
      { traceId: 't2', items: [] },
      { traceId: 't3', items: [item('c1')] },
    ];
    expect(moveTreeSelection(lanesWithEmptyMiddle, 'a1', 'down')).toBe('a1');
  });
});
