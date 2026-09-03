// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the operator-facing POOL CLIENT panel client
 * (`web/features/pool-client.ts`) — the browse/claim renderer and the
 * panel's own claim click handler, extracted out of `shell.ts`'s
 * `fleetJs()` into one file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage already
 * exists for this panel through the real client bundle
 * (`test/web/pool-client-panel.test.ts`); this adds the direct coverage its
 * siblings (`pr-review.test.ts`, `release.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  poolClaimDecisionLabel,
  poolClaimConfirmMessage,
  poolClaimExecuteResult,
  poolClaimExecuteTip,
} from '../../../src/web/pool-client-panel.js';
import { poolClientJs } from '../../../src/web/features/pool-client.js';

describe('poolClientJs', () => {
  it('embeds every pool-client-panel splice real compiled source via .toString()', () => {
    const out = poolClientJs();
    expect(out).toContain(poolClaimDecisionLabel.toString());
    expect(out).toContain(poolClaimConfirmMessage.toString());
    expect(out).toContain(poolClaimExecuteResult.toString());
    expect(out).toContain(poolClaimExecuteTip.toString());
  });

  it('declares refreshPoolClientProjectOptions, syncPoolClientProjects, renderPoolClientPanel, and loadPoolClientPanel', () => {
    const out = poolClientJs();
    expect(out).toContain('function refreshPoolClientProjectOptions() {');
    expect(out).toContain('function syncPoolClientProjects(projects) {');
    expect(out).toContain('function renderPoolClientPanel(entries) {');
    expect(out).toContain('function loadPoolClientPanel() {');
  });

  it('fetches the pool client preview on its own timer rather than riding the fleet stream', () => {
    const out = poolClientJs();
    expect(out).toContain("fetch('/api/pool-client', { headers: { accept: 'application/json' } })");
    expect(out).toContain('var POOL_CLIENT_POLL_MS = 30000;');
    expect(out).toContain('setInterval(loadPoolClientPanel, POOL_CLIENT_POLL_MS);');
  });

  it('self-initializes by calling loadPoolClientPanel() at load, independent of any project', () => {
    const out = poolClientJs();
    expect(out.trim().endsWith('setInterval(loadPoolClientPanel, POOL_CLIENT_POLL_MS);')).toBe(
      true,
    );
    expect(out).toContain(
      'loadPoolClientPanel();\nsetInterval(loadPoolClientPanel, POOL_CLIENT_POLL_MS);',
    );
  });

  it('carries its own claim click handler, confirm-guarded', () => {
    const out = poolClientJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-pool-client-execute]');",
    );
    expect(out).toContain(
      'if (!window.confirm(poolClaimConfirmMessage(entry.issue, entry.decision, projectName))) return;',
    );
    expect(out).toContain("fetch('/api/pool-client/execute', {");
  });

  it('keeps its own module-level state, not shared with any other module', () => {
    const out = poolClientJs();
    expect(out).toContain('var poolClientEntriesByNumber = {};');
    expect(out).toContain('var lastPoolClientProjects = [];');
  });

  it('reuses the shared el/tipChip helpers rather than re-declaring them', () => {
    const out = poolClientJs();
    expect(out).toContain("el('h3', 'pool-client-title'");
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
  });

  it('tags the panel title for i18n — an el()-built heading the regex scanner cannot see', () => {
    const out = poolClientJs();
    expect(out).toContain("title.setAttribute('data-i18n', 'poolTitle')");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = poolClientJs();
    expect(out).toBe(out.trim());
  });
});
