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
    expect(backlogJs()).toContain('body.replaceChildren(unavailable);');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = backlogJs();
    expect(out).toBe(out.trim());
  });

  it('tags its own literal text data-i18n and sweeps freshly built DOM (board web-msnsndki-dz3vn1)', () => {
    const out = backlogJs();
    expect(out).toContain("title.setAttribute('data-i18n', 'backlogTitle');");
    expect(out).toContain("loading.setAttribute('data-i18n', 'backlogChecking');");
    expect(out).toContain("empty.setAttribute('data-i18n', 'backlogEmpty');");
    expect(out).toContain("confirmBtn.setAttribute('data-i18n', 'backlogConfirmDone');");
    expect(out).toContain("unavailable.setAttribute('data-i18n', 'backlogUnavailable');");
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      4,
    );
  });
});
