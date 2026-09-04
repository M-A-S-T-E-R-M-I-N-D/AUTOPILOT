// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, SVG-markup slice (board web-mtdc6wq3-5wuc6i) — drives
 * `renderPipelineSvg` through the real `layoutGraph` → `layoutCanvas` chain
 * (the same fixture shape `pipeline-canvas.test.ts` uses) and asserts on the
 * markup string the eventual pipeline panel will insert.
 */

import { describe, it, expect } from 'vitest';
import { renderPipelineSvg } from '../../src/web/pipeline-svg.js';
import { layoutCanvas, type CanvasCellSize } from '../../src/read/pipeline-canvas.js';
import { layoutGraph } from '../../src/read/pipeline-layout.js';
import { resolveSelection } from '../../src/read/pipeline-selection.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

const CELL: CanvasCellSize = { width: 120, height: 40, columnGap: 20, rowGap: 10 };

function render(g: SpanGraph, selectedId: string | null = null): string {
  return renderPipelineSvg(
    g,
    layoutCanvas(g, layoutGraph(g), CELL),
    resolveSelection(g, selectedId),
  );
}

const CHAIN = graph(
  [
    { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
    { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 2 },
  ],
  [{ from: 's1', to: 's2' }],
);

describe('renderPipelineSvg', () => {
  it('renders an empty string for an empty graph so the caller can gate to empty-state copy', () => {
    expect(render(graph([]))).toBe('');
  });

  it('sizes the viewBox from the canvas bounds and labels the image with node/link counts', () => {
    const svg = render(CHAIN);
    expect(svg).toContain('<svg class="pipeline-canvas" role="img" viewBox="0 0 260 40"');
    expect(svg).toContain('aria-label="Pipeline graph: 2 nodes, 1 link"');
  });

  it('pins the natural render size with width/height attributes so CSS can only shrink, never inflate (the 43-lane full-screen-node regression)', () => {
    const svg = render(CHAIN);
    expect(svg).toContain('viewBox="0 0 260 40" width="260" height="40"');
  });

  it('renders each node as a rect at its canvas position with a centered label', () => {
    const svg = render(CHAIN);
    expect(svg).toContain('<rect x="0" y="0" width="120" height="40"/>');
    expect(svg).toContain('<rect x="140" y="0" width="120" height="40"/>');
    expect(svg).toContain('<text x="60" y="20">plan</text>');
    expect(svg).toContain('<text x="200" y="20">implement</text>');
  });

  it('maps OTLP status codes onto data-status and folds status into the hover title', () => {
    const svg = render(CHAIN);
    expect(svg).toContain('data-node-id="s1" data-status="unset"');
    expect(svg).toContain('data-node-id="s2" data-status="error"');
    expect(svg).toContain('<title>plan — 1 span, unset</title>');
    expect(svg).toContain('<title>implement — 1 span, error</title>');
  });

  it('renders each edge as a polyline through its routed points', () => {
    const svg = render(CHAIN);
    expect(svg).toContain(
      '<polyline class="pipeline-edge" data-edge-from="s1" data-edge-to="s2" points="120,20 140,20"/>',
    );
  });

  it('flags the selected node, its one-hop neighbours, and incident edges', () => {
    const svg = render(CHAIN, 's1');
    expect(svg).toContain('data-node-id="s1" data-status="unset" data-selected="true"');
    expect(svg).toContain('data-node-id="s2" data-status="error" data-connected="true"');
    expect(svg).toContain('data-edge-to="s2" data-connected="true"');
  });

  it('emits no selection flags when nothing is selected', () => {
    const svg = render(CHAIN);
    expect(svg).not.toContain('data-selected');
    expect(svg).not.toContain('data-connected');
  });

  it('escapes markup-significant characters in labels, titles, and ids', () => {
    const g = graph([
      { id: 'a"<b>', traceId: 't1', label: '<join> & "quote"', spanCount: 2, status: 1 },
    ]);
    const svg = render(g);
    expect(svg).toContain('data-node-id="a&quot;&lt;b&gt;"');
    expect(svg).toContain('<text x="60" y="20">&lt;join&gt; &amp; &quot;quote&quot;</text>');
    expect(svg).toContain('<title>&lt;join&gt; &amp; &quot;quote&quot; — 2 spans, ok</title>');
    expect(svg).not.toContain('<join>');
  });

  it('draws edges under nodes so node rects always sit on top', () => {
    const svg = render(CHAIN);
    const edgesAt = svg.indexOf('<g class="pipeline-edges">');
    const nodesAt = svg.indexOf('<g class="pipeline-nodes">');
    expect(edgesAt).toBeGreaterThan(-1);
    expect(nodesAt).toBeGreaterThan(edgesAt);
  });
});
