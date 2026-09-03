// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the Docs
 * viewer's chart renderer (`sanitizeChartNode` in web/features/search.ts)
 * turns every bar's/point's native <title> into the shared data-tip primitive
 * — and gave EVERY such shape its own unconditional `tabindex="0"`. The
 * SELF-STUDY PAPER's five DATA:CHART SVGs carried 51 titled shapes, so a
 * keyboard user pressed Tab 51 times to get from the chart section's heading
 * to the next paragraph, and the per-day chart grows by two stops a day.
 * Each chart is now ONE roving group: only its first titled shape (in DOM
 * order) is a real Tab stop, the rest land at -1, and the shared wireRoving()
 * Left/Right/Home/End + focusin handlers move the stop within that chart —
 * never into the next one. Same jsdom + `new Function(clientJs())()` +
 * mocked `/api/docs`/`/api/file` harness as docs-chart-svg.test.ts.
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

// The exact vocabulary scripts/self-study/generate-data.mjs emits: a root
// <title>/<desc> pair, an untitled background rect, then titled bars/points.
const BAR_CHART =
  '<svg viewBox="0 0 640 260" width="640" height="260" role="img" xmlns="http://www.w3.org/2000/svg">' +
  '<title>Firings per day, split into shipped vs. not shipped</title>' +
  '<desc>Stacked bar chart, 3 day(s).</desc>' +
  '<rect x="0" y="0" width="640" height="260" fill="none"/>' +
  '<rect x="68.3" y="185.9" width="48.0" height="40.1" rx="3" fill="#009E73">' +
  '<title>2026-08-07: 21 shipped</title></rect>' +
  '<rect x="68.3" y="120.0" width="48.0" height="65.9" rx="3" fill="#D55E00">' +
  '<title>2026-08-07: 3 not shipped</title></rect>' +
  '<rect x="130.3" y="150.9" width="48.0" height="75.1" rx="3" fill="#009E73">' +
  '<title>2026-08-08: 30 shipped</title></rect>' +
  '<circle cx="92.3" cy="168.4" r="3.5" fill="#0072B2"><title>2026-08-08: $82.60</title></circle>' +
  '</svg>';

const LINE_CHART =
  '<svg viewBox="0 0 640 220" width="640" height="220" role="img" xmlns="http://www.w3.org/2000/svg">' +
  '<title>Ship rate per day</title>' +
  '<desc>Line chart, 2 day(s).</desc>' +
  '<rect x="0" y="0" width="640" height="220" fill="none"/>' +
  '<circle cx="80.0" cy="100.0" r="3.5" fill="#009E73"><title>2026-08-07: 87.5%</title></circle>' +
  '<circle cx="160.0" cy="90.0" r="3.5" fill="#009E73"><title>2026-08-08: 90.9%</title></circle>' +
  '</svg>';

const DOC_CONTENT =
  '# Self-study\n\n**Firings per day**\n\n' +
  BAR_CHART +
  '\n\n**Ship rate**\n\n' +
  LINE_CHART +
  '\n\n<!-- DATA:CHART:END -->\n\nA paragraph after the charts.\n';

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

async function openDoc(): Promise<void> {
  boot();
  await flush();
  document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
  await flush();
}

function charts(): SVGSVGElement[] {
  return Array.from(document.querySelectorAll<SVGSVGElement>('.docs-viewer-body svg'));
}

/** The titled shapes of one chart, in DOM order — the roving group's items. */
function shapes(chart: Element): SVGElement[] {
  return Array.from(chart.querySelectorAll<SVGElement>('[data-tip]'));
}

function tabindexes(nodes: Element[]): (string | null)[] {
  return nodes.map((n) => n.getAttribute('tabindex'));
}

function key(target: Element, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('Docs viewer chart bars/points use one roving Tab stop per chart', () => {
  it('seeds only the first titled shape of each chart as a Tab stop; the rest land at -1', async () => {
    await openDoc();

    const [bar, line] = charts();
    if (!bar || !line) throw new Error('expected both charts to render');
    expect(tabindexes(shapes(bar))).toEqual(['0', '-1', '-1', '-1']);
    expect(tabindexes(shapes(line))).toEqual(['0', '-1']);
    // The untitled background rect was never a stop and still is not.
    expect(bar.querySelector('rect[fill="none"]')!.hasAttribute('tabindex')).toBe(false);
    // Whole-doc measurement: two charts, two Tab stops — not six.
    expect(document.querySelectorAll('.docs-viewer-body svg [tabindex="0"]').length).toBe(2);
  });

  it('moves the stop with ArrowRight/End/Home inside one chart and never into the next chart', async () => {
    await openDoc();

    const [bar, line] = charts();
    if (!bar || !line) throw new Error('expected both charts to render');
    const [s0, s1, s2, s3] = shapes(bar);
    if (!s0 || !s1 || !s2 || !s3) throw new Error('expected four titled shapes in the bar chart');

    s0.focus();
    key(s0, 'ArrowRight');
    expect(document.activeElement).toBe(s1);
    expect(tabindexes([s0, s1, s2, s3])).toEqual(['-1', '0', '-1', '-1']);

    key(s1, 'End');
    expect(document.activeElement).toBe(s3);
    // ArrowRight on the chart's last shape stays put — the next chart is its
    // own group, so the stop never leaks across.
    key(s3, 'ArrowRight');
    expect(document.activeElement).toBe(s3);
    expect(tabindexes([s0, s1, s2, s3])).toEqual(['-1', '-1', '-1', '0']);
    expect(tabindexes(shapes(line))).toEqual(['0', '-1']);

    key(s3, 'Home');
    expect(document.activeElement).toBe(s0);
    expect(tabindexes([s0, s1, s2, s3])).toEqual(['0', '-1', '-1', '-1']);
  });

  it('follows direct focus too, so Tab returns to where the user left the chart', async () => {
    await openDoc();

    const [bar] = charts();
    if (!bar) throw new Error('expected the bar chart to render');
    const group = shapes(bar);
    group[2]!.focus();
    expect(tabindexes(group)).toEqual(['-1', '-1', '0', '-1']);
  });

  it('keeps the shared data-tip primitive on a -1 shape: focusing it still shows its value', async () => {
    await openDoc();

    const [bar] = charts();
    if (!bar) throw new Error('expected the bar chart to render');
    const second = shapes(bar)[1]!;
    expect(second.getAttribute('tabindex')).toBe('-1');
    second.dispatchEvent(new Event('focusin', { bubbles: true }));
    const tip = document.querySelector('.spark-tip') as HTMLElement | null;
    expect(tip).not.toBeNull();
    expect(tip!.hidden).toBe(false);
    expect(tip!.textContent).toBe('2026-08-07: 3 not shipped');
  });
});
