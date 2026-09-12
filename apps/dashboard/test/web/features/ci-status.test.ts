// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the CI-health panel client
 * (`web/features/ci-status.ts`) — mirrors `foundation.test.ts`'s
 * static-source-assertion shape (the generated string is a classic script,
 * never executed under vitest/jsdom here).
 */

import { describe, it, expect } from 'vitest';
import { ciStatusJs } from '../../../src/web/features/ci-status.js';

describe('ciStatusJs', () => {
  it('declares renderCiStatusPanel and loadCiStatusPanel', () => {
    const out = ciStatusJs();
    expect(out).toContain('function renderCiStatusPanel(workflows) {');
    expect(out).toContain('function loadCiStatusPanel() {');
  });

  it('fetches /api/ci-status on demand', () => {
    expect(ciStatusJs()).toContain(
      "fetch('/api/ci-status', { headers: { accept: 'application/json' } })",
    );
  });

  it('self-initializes and polls on its own timer, matching the server cache TTL', () => {
    const out = ciStatusJs();
    expect(out).toContain('loadCiStatusPanel();');
    expect(out).toContain('setInterval(loadCiStatusPanel, CI_STATUS_POLL_MS);');
    expect(out).toContain('var CI_STATUS_POLL_MS = 60000;');
  });

  it('hides the #ci-status-panel host whenever there are zero workflows', () => {
    expect(ciStatusJs()).toContain('var ciPanelHidden = workflows.length === 0;');
  });

  it('renders one tipChip per workflow, colored by ok/fail', () => {
    const out = ciStatusJs();
    expect(out).toContain("var badgeClass = 'ci-status-badge-' + (w.ok ? 'ok' : 'fail');");
    expect(out).toContain('tipChip(w.workflow, w.detail,');
  });

  it('tags the title for i18n and re-translates on every rebuild', () => {
    const out = ciStatusJs();
    expect(out).toContain("title.setAttribute('data-i18n', 'ciStatusTitle');");
    expect(out).toContain("translateDom(document.documentElement.lang || 'en');");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = ciStatusJs();
    expect(out).toBe(out.trim());
  });
});
