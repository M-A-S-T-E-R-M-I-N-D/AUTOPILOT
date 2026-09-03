// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CODE-SPLIT dynamic half (web/chunks.ts): on `/` the deferred chunks arrive
 * later (defer) — on a slow connection much later — so the CORE chunk alone
 * must boot the home page. Evaluating it with the deferred chunks entirely
 * absent is exactly that first paint; a bare call into a deferred module
 * would throw here. The static half (no unguarded cross-chunk calls) lives
 * in test/tooling/chunks.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { coreClientJs } from '../../src/web/shell.js';

describe('core chunk self-sufficiency', () => {
  it('evaluating the CORE chunk alone throws nothing at load', () => {
    expect(() => new Function(coreClientJs())()).not.toThrow();
  });
});
