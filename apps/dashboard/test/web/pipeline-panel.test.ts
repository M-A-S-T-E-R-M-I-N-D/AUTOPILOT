// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D4 pipeline-view, panel-composition slice (board web-mtdc6wq3-5wuc6i) — drives
 * `renderPipelinePanel` end to end over `SpanGraph` fixtures (the same shape
 * `pipeline-svg.test.ts`/`pipeline-tree-html.test.ts` use) and asserts on the composed panel
 * markup: section wrapper, empty-state gating, layered-sidebar-vs-mode-canvas split, and the
 * shared selection threading into both views.
 */

import { describe, it, expect } from 'vitest';
import { renderPipelinePanel, PIPELINE_PANEL_CELL } from '../../src/web/pipeline-panel.js';
import type { SpanGraph } from '../../src/read/pipeline-graph.js';

function graph(nodes: SpanGraph['nodes'], edges: SpanGraph['edges'] = []): SpanGraph {
  return { nodes, edges };
}

const CHAIN = graph(
  [
    { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
    { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 2 },
  ],
  [{ from: 's1', to: 's2' }],
);

/** Two single-node traces chained by a continuation edge — the compact-merge fixture. */
const CONTINUATION = graph(
  [
    { id: 's1', traceId: 't1', label: 'firing 1', spanCount: 1, status: 1 },
    { id: 's2', traceId: 't2', label: 'firing 2', spanCount: 1, status: 1 },
  ],
  [{ from: 's1', to: 's2' }],
);

describe('renderPipelinePanel', () => {
  it('renders the empty-state copy inside the labelled section for an empty graph', () => {
    const html = renderPipelinePanel(graph([]));
    expect(html).toBe(
      '<section class="pipeline-panel" aria-label="Pipeline view" data-i18n-aria="pipelineView" data-layout="layered">' +
        '<p class="pipeline-empty">No pipeline spans recorded for this project yet.</p></section>',
    );
    expect(html).not.toContain('role="tree"');
    expect(html).not.toContain('<svg');
  });

  it('renders honest file-lens empty-state copy — spans may exist yet predate file tracking', () => {
    const html = renderPipelinePanel(graph([]), { lens: 'file' });
    expect(html).toBe(
      '<section class="pipeline-panel" aria-label="Pipeline view" data-i18n-aria="pipelineView" data-layout="layered">' +
        '<p class="pipeline-empty">No file activity recorded for this project yet — the Files ' +
        'lens shows only files captured from gate-passed firings.</p></section>',
    );
    expect(html).not.toContain('No pipeline spans recorded');
  });

  it('keeps the span-recording empty-state copy under the fleet lens', () => {
    const html = renderPipelinePanel(graph([]), { lens: 'fleet' });
    expect(html).toContain('No pipeline spans recorded for this project yet.');
  });

  it('wraps the tree sidebar and svg canvas in one labelled section', () => {
    const html = renderPipelinePanel(CHAIN);
    expect(html).toContain(
      '<section class="pipeline-panel" aria-label="Pipeline view" data-i18n-aria="pipelineView" data-layout="layered">',
    );
    expect(html.match(/role="tree"/g)).toHaveLength(1);
    expect(html.match(/<svg class="pipeline-canvas" role="img"/g)).toHaveLength(1);
    expect(html.indexOf('role="tree"')).toBeLessThan(html.indexOf('<svg'));
    expect(html.endsWith('</svg></section>')).toBe(true);
  });

  it('sizes the canvas from the default cell geometry', () => {
    expect(PIPELINE_PANEL_CELL).toEqual({ width: 120, height: 40, columnGap: 20, rowGap: 10 });
    expect(renderPipelinePanel(CHAIN)).toContain('viewBox="0 0 260 40"');
  });

  it('lets the caller override the cell geometry', () => {
    const html = renderPipelinePanel(CHAIN, {
      cell: { width: 100, height: 20, columnGap: 10, rowGap: 10 },
    });
    expect(html).toContain('viewBox="0 0 210 20"');
  });

  it('keeps the sidebar layered while compact mode merges the canvas lanes', () => {
    const layered = renderPipelinePanel(CONTINUATION);
    expect(layered).toContain('viewBox="0 0 120 90"');

    const compact = renderPipelinePanel(CONTINUATION, { layout: 'compact' });
    expect(compact).toContain('data-layout="compact"');
    expect(compact).toContain('viewBox="0 0 260 40"');
    // The tree keeps one role="group" lane per trace in BOTH modes — buildPipelineTree's
    // dense, layered-mode trust boundary.
    for (const html of [layered, compact]) {
      expect(html.match(/role="group"/g)).toHaveLength(2);
      expect(html).toContain('data-trace-id="t1"');
      expect(html).toContain('data-trace-id="t2"');
    }
  });

  it('threads one shared selection into both views', () => {
    const html = renderPipelinePanel(CHAIN, { selectedId: 's2' });
    expect(html).toContain('aria-selected="true" tabindex="0"');
    expect(html).toContain('data-node-id="s2" data-status="error" data-selected="true"');
    // s1 is one edge away from s2 → connected in the sidebar and on the canvas.
    expect(html.match(/data-node-id="s1" data-status="unset" data-connected="true"/g)).toHaveLength(
      2,
    );
  });

  it('resolves a stale selection to the no-selection state instead of throwing', () => {
    const html = renderPipelinePanel(CHAIN, { selectedId: 'gone' });
    expect(html).not.toContain('data-selected="true"');
    expect(html).not.toContain('aria-selected="true"');
  });
});
