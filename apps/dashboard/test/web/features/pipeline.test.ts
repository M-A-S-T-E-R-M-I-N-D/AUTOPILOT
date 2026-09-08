// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The PIPELINE VIEW panel's fetch-and-inject client (epic 0015 D4, board
 * web-mtdc6wq3-5wuc6i — `web/features/pipeline.ts`): the slice that makes the
 * server-rendered `/api/pipeline` panel user-visible on the project page.
 * Three contracts keep it honest:
 *
 * 1. NO-DRIFT SPLICE — the client's fetch URL builder is `pipelineApiUrl`'s
 *    real compiled source (`.toString()`), never a hand-retyped copy, so the
 *    endpoint path can only move together with the server route.
 * 2. CHUNK PLACEMENT — the panel rides /project.js (called exclusively from
 *    `renderProjectPage()`), never the budget-tight core /app.js.
 * 3. GUARDED INJECTION — the one sanctioned innerHTML sink accepts only a
 *    string `html` field and keeps DOM-API fallbacks for every failure path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { pipelineJs } from '../../../src/web/features/pipeline.js';
import { pipelineApiUrl, renderPipelinePanel } from '../../../src/web/pipeline-panel.js';
import { coreClientJs, projectClientJs, renderShell, clientJs } from '../../../src/web/shell.js';
import type { SpanGraph } from '../../../src/read/pipeline-graph.js';

describe('pipelineJs (the PIPELINE VIEW panel client)', () => {
  it('splices pipelineApiUrl by its real compiled source and fetches through it', () => {
    const js = pipelineJs();
    expect(js).toContain(pipelineApiUrl.toString());
    expect(js).toContain(
      "var url = pipelineApiUrl(pid) + '&lens=' + state.lens + '&mode=' + state.mode + '&layout=' + state.layout;",
    );
    expect(js).toContain('fetch(url)');
  });

  it('defines pipelineSection with loading, unavailable, and injection paths', () => {
    const js = pipelineJs();
    expect(js).toContain('function pipelineSection(pid)');
    expect(js).toContain("tr('pipelineLoading')");
    expect(js).toContain("tr('pipelineUnavailable')");
    // the injection is guarded: only a string `html` field ever reaches innerHTML
    expect(js).toContain("typeof data.html !== 'string'");
    expect(js).toContain('body.innerHTML = data.html');
  });

  it('defaults to the server defaults and sends lens/mode/layout on every fetch', () => {
    const js = pipelineJs();
    expect(js).toContain(
      "state = { lens: 'fleet', mode: 'grouped', layout: 'layered', selectedId: null }",
    );
    expect(js).toContain(
      "pipelineApiUrl(pid) + '&lens=' + state.lens + '&mode=' + state.mode + '&layout=' + state.layout",
    );
  });

  it('wires an accessible, aria-pressed switch group for lens, mode, and layout', () => {
    const js = pipelineJs();
    expect(js).toContain("group.setAttribute('role', 'group')");
    expect(js).toContain("b.setAttribute('aria-pressed', String(opt.value === state[key]))");
    // lens: fleet/file
    expect(js).toContain("'Pipeline lens', 'pipelineLensLabel'");
    expect(js).toContain("{ value: 'fleet', label: 'Fleet', i18nKey: 'pipelineLensFleet' }");
    expect(js).toContain("{ value: 'file', label: 'Files', i18nKey: 'pipelineLensFiles' }");
    // mode: grouped/flat
    expect(js).toContain("'Pipeline node grouping', 'pipelineModeLabel'");
    expect(js).toContain("{ value: 'grouped', label: 'Grouped', i18nKey: 'pipelineModeGrouped' }");
    expect(js).toContain("{ value: 'flat', label: 'Flat', i18nKey: 'pipelineModeFlat' }");
    // layout: layered/compact
    expect(js).toContain("'Pipeline canvas layout', 'pipelineLayoutLabel'");
    expect(js).toContain(
      "{ value: 'layered', label: 'Layered', i18nKey: 'pipelineLayoutLayered' }",
    );
    expect(js).toContain(
      "{ value: 'compact', label: 'Compact', i18nKey: 'pipelineLayoutCompact' }",
    );
  });

  it('tags the title and switch group aria-labels/button labels for i18n', () => {
    const js = pipelineJs();
    expect(js).toContain("title.setAttribute('data-i18n', 'pipelineViewTitle')");
    expect(js).toContain("group.setAttribute('data-i18n-aria', labelI18nKey)");
    expect(js).toContain("b.setAttribute('data-i18n', opt.i18nKey)");
  });

  it('exposes the lens switch — filesTouched flows from the engine, so file is a real option', () => {
    const js = pipelineJs();
    expect(js).toContain('pipeline-lens-switch');
    expect(js).toContain("'&lens=' + state.lens");
  });
});

describe('pipeline chunk placement (BUNDLE DIET — the core budget stays untouched)', () => {
  it('rides /project.js, not the core /app.js', () => {
    expect(projectClientJs()).toContain('function pipelineSection(');
    expect(coreClientJs()).not.toContain('function pipelineSection(');
  });

  it('renderProjectPage (core) calls it — the project-page expression exists', () => {
    expect(coreClientJs()).toContain('pipelineSection(pid)');
  });
});

/**
 * Real-DOM coverage for the SELECTION INTERACTION the module header documents: click and
 * arrow-key handling read the ALREADY-RENDERED tree/canvas DOM and restyle in place, so these
 * boot the actual client bundle (`clientJs()`) against jsdom — the same `new
 * Function(clientJs())()` pattern `report-from-here-embed.test.ts` uses — rather than asserting
 * on the source string, since the thing worth proving is that a click/keypress genuinely moves
 * `aria-selected`/`tabindex`/`data-selected`/`data-connected`, not just that the code exists.
 */
describe('pipeline selection interaction (real DOM)', () => {
  // Lane t1 (first-appearance order): s1 → s2 (edge). Lane t2: s3, alone.
  const GRAPH: SpanGraph = {
    nodes: [
      { id: 's1', traceId: 't1', label: 'plan', spanCount: 1, status: 0 },
      { id: 's2', traceId: 't1', label: 'implement', spanCount: 1, status: 2 },
      { id: 's3', traceId: 't2', label: 'ship', spanCount: 1, status: 1 },
    ],
    edges: [{ from: 's1', to: 's2' }],
  };

  const PROJECT = {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'idle',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    languages: [{ language: 'typescript', files: 2, bytes: 100 }],
    topDirs: [],
    hotFiles: [],
    gate: 'js · vitest run',
    backedUp: true,
    firings: 0,
    shipped: 0,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    shipRate: 0,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: 1,
    flightLog: [],
    activity: [],
    tasks: [],
  };

  const STATE = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [PROJECT],
    empty: false,
  };

  function boot(): { calls: string[] } {
    const calls: string[] = [];
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      calls.push(href);
      if (href.startsWith('/api/pipeline')) {
        return { ok: true, json: async () => ({ html: renderPipelinePanel(GRAPH) }) } as Response;
      }
      return { ok: true, json: async () => STATE } as Response;
    }) as unknown as typeof fetch;
    new Function(clientJs())();
    return { calls };
  }

  function items(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.pipeline-item'));
  }

  function itemById(id: string): HTMLElement {
    return items().find((i) => i.getAttribute('data-node-id') === id)!;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with nothing selected — the first item is the only Tab stop, none aria-selected', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(itemById('s1').getAttribute('tabindex')).toBe('0');
    expect(itemById('s2').getAttribute('tabindex')).toBe('-1');
    for (const item of items()) expect(item.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking a tree item selects it in place — no refetch', async () => {
    const { calls } = boot();
    await vi.advanceTimersByTimeAsync(1);
    const pipelineCallsBefore = calls.filter((c) => c.startsWith('/api/pipeline')).length;

    itemById('s2').click();

    expect(itemById('s2').getAttribute('aria-selected')).toBe('true');
    expect(itemById('s2').getAttribute('tabindex')).toBe('0');
    expect(itemById('s1').getAttribute('aria-selected')).toBe('false');
    expect(itemById('s1').getAttribute('tabindex')).toBe('-1');
    // s1 is s2's only edge neighbour — the tree AND canvas both flag it connected.
    expect(itemById('s1').getAttribute('data-connected')).toBe('true');
    const edge = document.querySelector('.pipeline-edge[data-edge-from="s1"][data-edge-to="s2"]')!;
    expect(edge.getAttribute('data-connected')).toBe('true');
    const svgNode = (id: string) => document.querySelector(`.pipeline-node[data-node-id="${id}"]`)!;
    expect(svgNode('s2').getAttribute('data-selected')).toBe('true');
    expect(svgNode('s1').getAttribute('data-connected')).toBe('true');
    // s3 shares no edge with s2 — stays unflagged.
    expect(itemById('s3').getAttribute('data-connected')).toBeNull();

    const pipelineCallsAfter = calls.filter((c) => c.startsWith('/api/pipeline')).length;
    expect(pipelineCallsAfter).toBe(pipelineCallsBefore); // restyled locally, no round trip
  });

  it('ArrowRight/ArrowLeft move within a lane, clamped at its edges', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    // Nothing is explicitly selected yet — the first arrow press just activates the
    // already-focused default (lane 0's first item), same as moveTreeSelection's "start
    // somewhere sane" rule for a fresh Tab.
    itemById('s1').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(itemById('s1'));

    itemById('s1').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(itemById('s2'));
    expect(itemById('s2').getAttribute('aria-selected')).toBe('true');

    // Only two items in lane t1 — ArrowRight again clamps instead of throwing/wrapping.
    itemById('s2').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(itemById('s2'));

    itemById('s2').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(itemById('s1'));
    expect(itemById('s1').getAttribute('aria-selected')).toBe('true');
    expect(itemById('s2').getAttribute('aria-selected')).toBe('false');

    // ArrowLeft at the first item of the first lane clamps too.
    itemById('s1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(itemById('s1'));
  });

  it('ArrowDown/ArrowUp move a lane, clamping the item index to the target lane length', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    // Select s2 (lane t1, item index 1), then ArrowDown into lane t2, which has only one item.
    itemById('s2').click();
    itemById('s2').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemById('s3'));
    expect(itemById('s3').getAttribute('aria-selected')).toBe('true');

    // Lane t2 is the last lane — ArrowDown again clamps rather than wrapping.
    itemById('s3').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemById('s3'));

    // ArrowUp back into lane t1 clamps the item index to that lane's first item (index 0).
    itemById('s3').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(itemById('s1'));
  });

  it('carries the selected id into a mode/layout refetch, so it survives a graph reshape', async () => {
    const { calls } = boot();
    await vi.advanceTimersByTimeAsync(1);

    itemById('s2').click();
    const flatButton = Array.from(document.querySelectorAll('.pipeline-mode-switch button')).find(
      (b) => b.textContent === 'Flat',
    ) as HTMLButtonElement;
    flatButton.click();
    await vi.advanceTimersByTimeAsync(1);

    const lastPipelineCall = calls.filter((c) => c.startsWith('/api/pipeline')).pop()!;
    expect(lastPipelineCall).toContain('mode=flat');
    expect(lastPipelineCall).toContain('selected=s2');
  });

  it('switching the lens refetches with lens=file and carries the selected id', async () => {
    const { calls } = boot();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.filter((c) => c.startsWith('/api/pipeline')).pop()).toContain('lens=fleet');

    itemById('s2').click();
    const filesButton = Array.from(document.querySelectorAll('.pipeline-lens-switch button')).find(
      (b) => b.textContent === 'Files',
    ) as HTMLButtonElement;
    filesButton.click();
    await vi.advanceTimersByTimeAsync(1);

    const lastPipelineCall = calls.filter((c) => c.startsWith('/api/pipeline')).pop()!;
    expect(lastPipelineCall).toContain('lens=file');
    expect(lastPipelineCall).toContain('selected=s2');
  });

  it('tags the panel title and the lens switch group/buttons for i18n — English by default', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const title = document.querySelector('.pipeline-title')!;
    expect(title.textContent).toBe('🛠️ Pipeline view');
    expect(title.getAttribute('data-i18n')).toBe('pipelineViewTitle');

    const lensGroup = document.querySelector('.pipeline-lens-switch')!;
    expect(lensGroup.getAttribute('aria-label')).toBe('Pipeline lens');
    expect(lensGroup.getAttribute('data-i18n-aria')).toBe('pipelineLensLabel');

    const filesButton = Array.from(lensGroup.querySelectorAll('button')).find(
      (b) => b.textContent === 'Files',
    )!;
    expect(filesButton.getAttribute('data-i18n')).toBe('pipelineLensFiles');
  });

  it('switching to Hebrew translates the panel title and the lens switch group/buttons', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    expect(document.querySelector('.pipeline-title')?.textContent).toBe(
      STRINGS.he.pipelineViewTitle,
    );

    const lensGroup = document.querySelector('.pipeline-lens-switch')!;
    expect(lensGroup.getAttribute('aria-label')).toBe(STRINGS.he.pipelineLensLabel);

    const filesButton = Array.from(lensGroup.querySelectorAll('button')).find(
      (b) => b.getAttribute('data-i18n') === 'pipelineLensFiles',
    )!;
    expect(filesButton.textContent).toBe(STRINGS.he.pipelineLensFiles);
  });

  it('unavailable copy comes from tr() — Hebrew when that locale is already active', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    globalThis.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;

    const filesButton = Array.from(document.querySelectorAll('.pipeline-lens-switch button')).find(
      (b) => b.getAttribute('data-i18n') === 'pipelineLensFiles',
    ) as HTMLButtonElement;
    filesButton.click();
    await vi.advanceTimersByTimeAsync(1);

    const body = document.querySelector('.pipeline-body')!;
    expect(body.textContent).toBe(STRINGS.he.pipelineUnavailable);
  });
});
