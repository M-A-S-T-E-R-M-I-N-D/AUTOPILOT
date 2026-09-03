// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's DETECTED BACKLOG panel client
 * (`web/features/backlog.ts`) — a whole assembler function extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { backlogMatchText } from '../../../src/shared/backlog-match.js';
import { backlogCandidateMeta } from '../../../src/web/backlog-panel.js';
import { backlogJs } from '../../../src/web/features/backlog.js';

describe('backlogJs', () => {
  it('embeds backlogMatchText/backlogCandidateMeta real compiled source via .toString()', () => {
    const out = backlogJs();
    expect(out).toContain(backlogMatchText.toString());
    expect(out).toContain(backlogCandidateMeta.toString());
  });

  it('declares backlogSection and renderBacklogBody', () => {
    const out = backlogJs();
    expect(out).toContain('function backlogSection(pid) {');
    expect(out).toContain('function renderBacklogBody(body, candidates) {');
  });

  it('keeps no module-level state — every render fetches fresh', () => {
    expect(backlogJs()).not.toContain('var backlog');
  });

  it('fetches on demand rather than folding into the polled /api/state', () => {
    expect(backlogJs()).toContain("fetch('/api/backlog?project=' + encodeURIComponent(pid))");
  });

  it('degrades to an honest unavailable message on fetch failure', () => {
    expect(backlogJs()).toContain(
      "body.replaceChildren(el('p', 'muted', 'Detected backlog unavailable.'));",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = backlogJs();
    expect(out).toBe(out.trim());
  });
});
