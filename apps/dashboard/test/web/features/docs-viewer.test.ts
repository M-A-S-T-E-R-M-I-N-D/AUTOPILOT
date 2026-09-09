// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's Docs reader panel client
 * (`web/features/docs-viewer.ts`) — a whole assembler function extracted out
 * of `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { docFileTip } from '../../../src/web/docs-panel.js';
import { docsViewerJs } from '../../../src/web/features/docs-viewer.js';

describe('docsViewerJs', () => {
  it('embeds docFileTip real compiled source via .toString()', () => {
    expect(docsViewerJs()).toContain(docFileTip.toString());
  });

  it('declares docsSection and loadDoc', () => {
    const out = docsViewerJs();
    expect(out).toContain('function docsSection(pid) {');
    expect(out).toContain('function loadDoc(pid, path, viewer) {');
  });

  it('remembers the currently open doc per project across re-renders', () => {
    const out = docsViewerJs();
    expect(out).toContain('var openDoc = {};');
    expect(out).toContain('openDoc[pid] = path;');
  });

  it('event-delegates doc-open clicks instead of per-button listeners', () => {
    expect(docsViewerJs()).toContain("e.target.closest('[data-doc-open]');");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = docsViewerJs();
    expect(out).toBe(out.trim());
  });

  it('pins CONTRIBUTOR-STANDING.md to the top of the list (board ap-mtu6l8ct-3)', () => {
    const out = docsViewerJs();
    expect(out).toContain("var STANDING_DOC_PATH = '.github/CONTRIBUTOR-STANDING.md';");
    expect(out).toContain('files.unshift(STANDING_DOC_PATH);');
    expect(out).toContain("'🤝 Contributor Standing'");
  });

  it('tags its own literal text data-i18n and sweeps freshly built DOM (board web-msnsndki-dz3vn1)', () => {
    const out = docsViewerJs();
    expect(out).toContain("head.setAttribute('data-i18n', 'docsTitle');");
    expect(out).toContain("empty.setAttribute('data-i18n', 'docsEmpty');");
    expect(out).toContain("unavailable.setAttribute('data-i18n', 'docsUnavailable');");
    // One sweep per tagged-DOM creation site: the panel's own title (fresh
    // mount only), the empty state, and the fetch-failure state.
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      3,
    );
  });

  // Epic 0018 "calm cockpit", STABILITY LAW "the reader is sacred": the docs
  // viewer must survive a full renderProjectPage() rebuild (fired on every
  // live-state tick) with scroll position and rendered content intact,
  // instead of the wrap/list/viewer nodes — and the open doc's fetch — being
  // thrown away and recreated from scratch each tick.
  describe('survives a project-page rebuild tick (epic 0018 slice 1)', () => {
    it('caches the mounted panel per project instead of building fresh nodes every call', () => {
      const out = docsViewerJs();
      expect(out).toContain('var docsPanelCache = {};');
    });

    it('docsSection returns the cached wrap on a repeat call for the same project', () => {
      const out = docsViewerJs();
      expect(out).toMatch(/if \(cached\) \{[\s\S]*?return cached\.wrap;\s*\}/);
    });

    it('tracks which doc is actually loaded in the viewer', () => {
      const out = docsViewerJs();
      expect(out).toContain('viewer.dataset.loadedPath = path;');
    });

    it('skips reloading the viewer when the open doc is already the one loaded', () => {
      const out = docsViewerJs();
      expect(out).toContain('viewer.dataset.loadedPath !== openDoc[pid]');
    });
  });
});
