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
});
