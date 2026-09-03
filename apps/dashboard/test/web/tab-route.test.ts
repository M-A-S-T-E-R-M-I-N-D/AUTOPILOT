// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D2.13 "tabbed IA" routing slice (epic 0015, board web-mtdc6wuk-0exzb4) — direct unit
 * coverage for `web/tab-route.ts`'s pure `location.hash` tab addressing, before any client
 * wiring exists (see the module header for why nothing calls it yet).
 */

import { describe, it, expect } from 'vitest';
import { tabIdFromHash, hashForTab } from '../../src/web/tab-route.js';
import type { TabDef } from '../../src/web/tabs.js';

const TABS: readonly TabDef[] = [
  { id: 'process', label: 'Process' },
  { id: 'evaluations', label: 'Evaluations' },
  { id: 'releases', label: 'Releases' },
  { id: 'runtime', label: 'Runtime' },
];

describe('tabIdFromHash', () => {
  it('resolves a hash naming a known tab, leading # included', () => {
    expect(tabIdFromHash('#evaluations', TABS, 'process')).toBe('evaluations');
  });

  it('tolerates a hash with no leading #', () => {
    expect(tabIdFromHash('releases', TABS, 'process')).toBe('releases');
  });

  it('falls back on an empty hash', () => {
    expect(tabIdFromHash('', TABS, 'process')).toBe('process');
    expect(tabIdFromHash('#', TABS, 'process')).toBe('process');
  });

  it('falls back on a hash naming an unknown or stale tab, not a throw', () => {
    expect(tabIdFromHash('#gone', TABS, 'process')).toBe('process');
    expect(tabIdFromHash('#gone', [], 'process')).toBe('process');
  });
});

describe('hashForTab', () => {
  it('prefixes the tab id with #', () => {
    expect(hashForTab('evaluations')).toBe('#evaluations');
  });

  it('round-trips through tabIdFromHash for every known tab', () => {
    for (const tab of TABS) {
      expect(tabIdFromHash(hashForTab(tab.id), TABS, 'process')).toBe(tab.id);
    }
  });
});
