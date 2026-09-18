// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator, 2026-09-18: "the file reader looks much better, but like in
 * MDVIEWER it must support — absolutely — tables, charts, diagrams, text
 * styling (bold, italic and so on)… and checkboxes too."
 *
 * Drives the REAL reader: the docs viewer's own load path (a doc-open press,
 * `/api/file`, `renderMarkdown` with the viewer's project and path) against
 * one document that uses every construct the slice added, and reads the DOM
 * back. Security is part of parity: a `javascript:` link and a path that
 * climbs out of the repository stay words, and an image is a link labelled
 * by its alt text — the reader never fetches a remote image on the page's
 * behalf.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'registered',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const DOC_PATH = 'docs/guide/index.md';

const DOC = [
  '# Guide',
  '',
  'Intro with **bold**, *italic*, ~~gone~~, `code` and [external](https://x.test/y).',
  'See [the plan](#the-plan) and [the other doc](../other.md), an ![diagram](https://x.test/d.png),',
  'a [bad](javascript:alert(1)) one and a [climb](../../../x.md).',
  '',
  '> A quote with *emphasis*',
  '> spanning two lines',
  '',
  '---',
  '',
  '## The Plan',
  '',
  '- [ ] open task',
  '- [x] done task',
  '  - nested child',
  '    1. deeper ordered',
  '- plain',
  '',
  '| Left | Center | Right |',
  '| :--- | :----: | ----: |',
  '| a | b | c |',
  '',
  '```ts',
  'const x = 1;',
  '```',
  '',
  '```mermaid',
  'graph TD; A-->B;',
  '```',
].join('\n');

let fetchCalls: string[] = [];

async function bootAndOpen(): Promise<HTMLElement> {
  document.open();
  document.write(renderShell());
  document.close();
  fetchCalls = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    fetchCalls.push(u);
    if (u.includes('/api/file')) {
      return {
        ok: true,
        json: async () => ({ path: DOC_PATH, content: DOC, touchedAt: null }),
      } as Response;
    }
    return { ok: true, json: async () => STATE } as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);

  const viewer = document.createElement('div');
  viewer.setAttribute('data-docs-viewer', 'p1');
  document.body.appendChild(viewer);
  const open = document.createElement('button');
  open.setAttribute('data-doc-open', DOC_PATH);
  open.setAttribute('data-doc-pid', 'p1');
  document.body.appendChild(open);
  open.click();
  await vi.advanceTimersByTimeAsync(5);
  const body = viewer.querySelector('.docs-viewer-body') as HTMLElement;
  expect(body, 'the document rendered').not.toBeNull();
  return body;
}

describe('the docs reader renders every construct of the parity slice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('headings carry prefixed anchors; inline styling covers bold, italic, strikethrough and code', async () => {
    const body = await bootAndOpen();
    expect(body.querySelector('h1')?.id).toBe('doc-guide');
    expect(body.querySelector('h2')?.id).toBe('doc-the-plan');
    const intro = body.querySelector('p')!;
    expect(intro.querySelector('strong')?.textContent).toBe('bold');
    expect(intro.querySelector('em')?.textContent).toBe('italic');
    expect(intro.querySelector('s')?.textContent).toBe('gone');
    expect(intro.querySelector('code')?.textContent).toBe('code');
  });

  it('links: external opens a new tab, an anchor scrolls inside this body, a relative path opens THAT document here, and the dangerous ones stay words', async () => {
    const body = await bootAndOpen();
    const external = body.querySelector('a[href="https://x.test/y"]') as HTMLAnchorElement;
    expect(external.target).toBe('_blank');
    expect(external.rel).toContain('noopener');

    const anchor = body.querySelector('a.docs-anchor') as HTMLAnchorElement;
    expect(anchor.getAttribute('data-doc-anchor')).toBe('the-plan');
    expect(anchor.textContent).toBe('the plan');
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    anchor.click();
    expect(scrolled).toHaveBeenCalled();
    expect(location.hash).toBe('');

    const doc = body.querySelector('a.docs-link') as HTMLAnchorElement;
    expect(doc.getAttribute('data-doc-open')).toBe('docs/other.md');
    expect(doc.getAttribute('data-doc-pid')).toBe('p1');
    const before = fetchCalls.length;
    doc.click();
    await vi.advanceTimersByTimeAsync(5);
    expect(fetchCalls.slice(before).some((u) => u.includes('path=docs%2Fother.md'))).toBe(true);
    expect(location.hash).toBe('');

    const image = body.querySelector('a[href="https://x.test/d.png"]') as HTMLAnchorElement;
    expect(image.textContent).toBe(`diagram (${STRINGS.en.docsImage})`);
    expect(body.querySelector('img')).toBeNull();

    expect(body.querySelector('a[href^="javascript"]')).toBeNull();
    expect(body.querySelector('[data-doc-open="x.md"]')).toBeNull();
    expect(body.textContent).toContain('bad');
    expect(body.textContent).toContain('climb');
  });

  it('a multi-line blockquote, a rule, task checkboxes and nested lists', async () => {
    const body = await bootAndOpen();
    const quote = body.querySelector('blockquote')!;
    expect(quote.querySelector('em')?.textContent).toBe('emphasis');
    expect(quote.textContent).toContain('spanning two lines');
    expect(body.querySelector('hr')).not.toBeNull();

    const tasks = Array.from(body.querySelectorAll('li.task'));
    expect(tasks).toHaveLength(2);
    const boxes = tasks.map((li) => li.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    expect(boxes.every((b) => b.disabled)).toBe(true);
    expect(tasks[0]?.textContent).toContain('open task');

    const nested = tasks[1]!.querySelector(':scope > ul > li')!;
    expect(nested.textContent).toContain('nested child');
    expect(nested.querySelector(':scope > ol > li')?.textContent).toContain('deeper ordered');
    const top = body.querySelector('ul')!;
    expect(Array.from(top.children).map((li) => li.textContent?.trim().slice(0, 5))).toEqual([
      'open ',
      'done ',
      'plain',
    ]);
  });

  it('table cells take the alignment the separator row declares', async () => {
    const body = await bootAndOpen();
    const ths = Array.from(body.querySelectorAll('th')) as HTMLElement[];
    expect(ths.map((th) => th.style.textAlign)).toEqual(['start', 'center', 'end']);
    const tds = Array.from(body.querySelectorAll('td')) as HTMLElement[];
    expect(tds.map((td) => td.style.textAlign)).toEqual(['start', 'center', 'end']);
  });

  it('fences carry their language; a mermaid fence is a diagram-source block, not a script', async () => {
    const body = await bootAndOpen();
    const ts = body.querySelector('pre[data-lang="ts"]')!;
    expect(ts.querySelector('code')?.className).toBe('language-ts');
    expect(ts.textContent).toBe('const x = 1;');
    const diagram = body.querySelector('pre.docs-diagram')!;
    expect(diagram.getAttribute('data-lang')).toBe('mermaid');
    expect(diagram.textContent).toBe('graph TD; A-->B;');
    expect(body.querySelector('script')).toBeNull();
  });
});
