// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * "PAPER change visibility" (web-msnsgcyq-36jf4u) — the self-study Evidence
 * Log's automated entries (`scripts/self-study/generate-data.mjs`) gained a
 * `[View the previous version on GitHub](url)` markdown link per entry so a
 * reader always sees WHAT changed, not just the DELTA chips. But the Docs
 * viewer's `renderMarkdown`/`appendInline` (`web/features/search.ts`) had no
 * link syntax at all — a `[text](url)` would have rendered as literal
 * bracket-and-paren text, not a clickable link. This covers the fix: a real,
 * keyboard-reachable `<a>` built via `createElement`/property assignment
 * (never innerHTML), restricted to http(s) hrefs so a doc can never smuggle
 * a `javascript:`/`data:` URL.
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

const DOC_CONTENT =
  '## 8. Evidence Log\n\n' +
  '- **2026-08-12** — Automated flight update: 5 firing(s) this flight (5 shipped), 100 total recorded.\n' +
  '  - Since the previous update: firings 95 → 100 (+5 ↑).\n' +
  '  - View what changed: `git diff eef91d1 -- docs/SELF-STUDY/PAPER.md` (this document as of the previous update, vs. now).\n' +
  '  - [View the previous version on GitHub](https://github.com/org/repo/blob/eef91d1/docs/SELF-STUDY/PAPER.md)\n' +
  '  - [suspicious](javascript:alert(1))\n';

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

describe('Evidence Log "view previous version" link in the Docs viewer', () => {
  it('renders a [text](url) markdown link as a real, keyboard-reachable <a>', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const body = document.querySelector('.docs-viewer-body')!;
    const link = Array.from(body.querySelectorAll('a')).find(
      (a) => a.textContent === 'View the previous version on GitHub',
    );
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe(
      'https://github.com/org/repo/blob/eef91d1/docs/SELF-STUDY/PAPER.md',
    );
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(body.textContent).not.toContain('[View the previous version on GitHub]');
  });

  it('leaves the git diff command line as plain inline code, not a link', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const body = document.querySelector('.docs-viewer-body')!;
    const code = Array.from(body.querySelectorAll('code')).find((c) =>
      (c.textContent ?? '').startsWith('git diff eef91d1'),
    );
    expect(code).toBeDefined();
  });

  it('never builds an <a> whose href uses a non-http(s) scheme', async () => {
    boot();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
    await flush();

    const body = document.querySelector('.docs-viewer-body')!;
    const links = Array.from(body.querySelectorAll('a'));
    expect(links.some((a) => (a.getAttribute('href') ?? '').startsWith('javascript:'))).toBe(false);
    // The malformed "[suspicious](javascript:alert(1))" source line renders as literal text instead.
    expect(body.textContent).toContain('[suspicious](javascript:alert(1))');
  });
});
