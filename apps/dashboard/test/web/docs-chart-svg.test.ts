// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * "PAPER interactive charts" (web-msnshaur-n40j8o) — the SELF-STUDY chart
 * data plane generates real accessible SVG (scripts/self-study/generate-
 * data.mjs), embedded as raw <svg> markup so the doc reads as a chart on
 * GitHub too. But this dashboard's own Docs viewer renders Markdown via
 * createElement/textContent only (never innerHTML — see renderMarkdown),
 * so without special handling that raw markup would land as a wall of
 * literal tag text, not a chart: the "special Docs renderer" this backlog
 * item calls for. This covers the fix — a sanitized, real SVG render — and
 * the "data-tip primitive" half: each chart bar/point's native <title> is
 * pulled off and replaced with the dashboard's shared hover+focus tooltip
 * so a chart data point behaves like every other explain-on-hover element.
 */

import { describe, it, expect } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const CHART_SVG =
  '<svg viewBox="0 0 640 260" width="640" height="260" role="img" xmlns="http://www.w3.org/2000/svg">' +
  '<title>Firings per day, split into shipped vs. not shipped</title>' +
  '<desc>Stacked bar chart, 1 day(s).</desc>' +
  '<rect x="0" y="0" width="640" height="260" fill="none"/>' +
  '<rect x="68.3" y="185.9" width="48.0" height="40.1" rx="3" fill="#009E73">' +
  '<title>2026-08-07: 21 shipped</title></rect>' +
  '<circle cx="92.3" cy="168.4" r="3.5" fill="#0072B2"><title>2026-08-07: $82.60</title></circle>' +
  '<script>alert(1)</script>' +
  '</svg>';

const DOC_CONTENT =
  '# Self-study\n\n**Firings per day**\n\n' + CHART_SVG + '\n\n<!-- DATA:CHART:END -->\n';

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = (async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/docs')) {
      return {
        ok: true,
        json: async () => ({ files: ['docs/SELF-STUDY/PAPER.md'] }),
      } as unknown as Response;
    }
    if (href.includes('/api/file')) {
      return {
        ok: true,
        json: async () => ({ path: 'docs/SELF-STUDY/PAPER.md', content: DOC_CONTENT }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as typeof fetch;
  new Function(clientJs())();
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SELF-STUDY chart SVG in the Docs viewer', () => {
  it('renders the embedded <svg> as a real SVG element, not literal tag text', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const svg = document.querySelector('.docs-viewer-body svg');
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(document.querySelector('.docs-viewer-body')!.textContent).not.toContain('<svg');
  });

  it('keeps the whole-chart accessible name/description as real <title>/<desc>', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const svg = document.querySelector('.docs-viewer-body svg')!;
    expect(svg.querySelector(':scope > title')?.textContent).toBe(
      'Firings per day, split into shipped vs. not shipped',
    );
    expect(svg.querySelector(':scope > desc')?.textContent).toBe('Stacked bar chart, 1 day(s).');
  });

  it("turns a bar's native <title> into the shared data-tip primitive, reachable by keyboard", async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const rect = document.querySelector('.docs-viewer-body svg rect[fill="#009E73"]')!;
    expect(rect.querySelector('title')).toBeNull(); // native tooltip removed, not duplicated
    expect(rect.getAttribute('data-tip')).toBe('2026-08-07: 21 shipped');
    expect(rect.getAttribute('aria-label')).toBe('2026-08-07: 21 shipped');
    expect(rect.getAttribute('tabindex')).toBe('0');

    rect.dispatchEvent(new Event('focusin', { bubbles: true }));
    const tip = document.querySelector('.spark-tip') as HTMLElement | null;
    expect(tip).not.toBeNull();
    expect(tip!.hidden).toBe(false);
    expect(tip!.textContent).toBe('2026-08-07: 21 shipped');

    rect.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(tip!.hidden).toBe(true);
  });

  it('wires a line-chart point (circle) the same way as a bar', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const circle = document.querySelector('.docs-viewer-body svg circle')!;
    expect(circle.querySelector('title')).toBeNull();
    expect(circle.getAttribute('data-tip')).toBe('2026-08-07: $82.60');

    circle.dispatchEvent(new Event('mouseover', { bubbles: true }));
    const tip = document.querySelector('.spark-tip') as HTMLElement | null;
    expect(tip!.textContent).toBe('2026-08-07: $82.60');
  });

  it('drops disallowed elements like <script> even if a doc were untrusted', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    expect(document.querySelector('.docs-viewer-body svg script')).toBeNull();
  });
});
