// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import * as esbuild from 'esbuild';
import type * as Esbuild from 'esbuild';

vi.mock('esbuild', async (importOriginal) => {
  const actual = await importOriginal<typeof Esbuild>();
  return { ...actual, transformSync: vi.fn(actual.transformSync) };
});

import { minifiedClientJs } from '../../src/server/client-bundle.js';

describe('minifiedClientJs', () => {
  // Minifying the full client bundle can exceed the 30s default when sibling
  // gates share the machine — the cost is contention, not a hang.
  it('minifies the client bundle once and reuses the cached result on later calls', () => {
    const first = minifiedClientJs();
    const second = minifiedClientJs();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(vi.mocked(esbuild.transformSync)).toHaveBeenCalledTimes(1);
  }, 120_000);
});
