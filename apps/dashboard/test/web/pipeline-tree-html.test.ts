// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, tree-sidebar markup slice (board web-mtdc6wq3-5wuc6i) — drives
 * `renderPipelineTreeHtml` through the real `layoutGraph` → `buildPipelineTree` chain (the
 * same fixture shape `pipeline-svg.test.ts` uses) and asserts on the sidebar markup string
 * the eventual pipeline panel will insert.
 */

import { describe, it, expect } from 'vitest';
import { renderPipelineTreeHtml } from '../../src/web/pipeline-tree-html.js';
import { buildPipelineTree } from '../../src/read/pipeline-tree.js';
import { layoutGraph } from '../../src/read/pipeline-layout.js';
import { resolveSelection } from '../../src/read/pipeline-selection.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

function render(g: SpanGraph, selectedId: string | null = null): string {
  return renderPipelineTreeHtml(
    buildPipelineTree(g, layoutGraph(g)),
    resolveSelection(g, selectedId),
  );
}

const TWO_LANES = graph(
  [
    { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
    { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 2 },
    { id: 's3', traceId: 't2', label: 'review', spanCount: 3, status: 1 },
  ],
  [{ from: 's1', to: 's2' }],
);

describe('renderPipelineTreeHtml', () => {
  it('renders an empty string for an empty graph so the caller can gate to empty-state copy', () => {
    expect(render(graph([]))).toBe('');
  });

  it('wraps the sidebar in one role="tree" labelled with lane/node counts', () => {
    const html = render(TWO_LANES);
    expect(html).toContain(
      '<div class="pipeline-tree" role="tree" aria-label="Pipeline lanes: 2 lanes, 3 nodes">',
    );
    expect(html.match(/role="tree"/g)).toHaveLength(1);
  });

  it('renders each lane as a labelled role="group" with a visible label hidden from the a11y tree', () => {
    const html = render(TWO_LANES);
    expect(html).toContain(
      '<div class="pipeline-lane" role="group" aria-label="Lane t1 — 2 nodes" data-trace-id="t1">',
    );
    expect(html).toContain(
      '<div class="pipeline-lane" role="group" aria-label="Lane t2 — 1 node" data-trace-id="t2">',
    );
    expect(html).toContain('<span class="pipeline-lane-label" aria-hidden="true">t1</span>');
  });

  it('renders each item as a treeitem named with the canvas title string shape', () => {
    const html = render(TWO_LANES);
    expect(html).toContain(
      'aria-label="plan — 1 span, unset" data-node-id="s1" data-status="unset"',
    );
    expect(html).toContain(
      'aria-label="implement — 1 span, error" data-node-id="s2" data-status="error"',
    );
    expect(html).toContain('aria-label="review — 3 spans, ok" data-node-id="s3" data-status="ok"');
    expect(html).toContain('>plan</div>');
  });

  it('gives every treeitem an explicit aria-selected and roves tabindex to the selected item', () => {
    const html = render(TWO_LANES, 's2');
    expect(html).toContain('role="treeitem" aria-selected="true" tabindex="0"');
    expect(html.match(/aria-selected="false" tabindex="-1"/g)).toHaveLength(2);
  });

  it('flags the selected item one-hop neighbours as connected, mirroring the canvas hook', () => {
    const html = render(TWO_LANES, 's2');
    expect(html).toContain('data-node-id="s1" data-status="unset" data-connected="true"');
    expect(html).not.toContain('data-node-id="s3" data-status="ok" data-connected');
  });

  it('roves tabindex to the first item when nothing is selected, and sets no selection flags', () => {
    const html = render(TWO_LANES);
    expect(html).toContain('aria-selected="false" tabindex="0" aria-label="plan — 1 span, unset"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-selected="true"');
    expect(html).not.toContain('data-connected');
  });

  it('escapes markup-significant characters in labels, names, and ids', () => {
    const g = graph([
      { id: 'a"<b>', traceId: 't<1>', label: '<join> & "quote"', spanCount: 2, status: 1 },
    ]);
    const html = render(g);
    expect(html).toContain('data-node-id="a&quot;&lt;b&gt;"');
    expect(html).toContain('data-trace-id="t&lt;1&gt;"');
    expect(html).toContain('aria-label="&lt;join&gt; &amp; &quot;quote&quot; — 2 spans, ok"');
    expect(html).toContain('>&lt;join&gt; &amp; &quot;quote&quot;</div>');
    expect(html).not.toContain('<join>');
  });
});
