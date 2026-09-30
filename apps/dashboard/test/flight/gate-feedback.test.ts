// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { gateFailureFeedback } from '../../src/flight/gate-feedback.js';

describe('gateFailureFeedback', () => {
  it('says nothing after a green gate', () => {
    expect(gateFailureFeedback({ ok: true })).toBeUndefined();
  });

  it('reports a red gate as a revert, with the failing output', () => {
    const feedback = gateFailureFeedback({ ok: false, details: 'lint: 3 errors' });
    expect(feedback).toContain('THE GATE FAILED — the commit was reverted.');
    expect(feedback).toContain('Run every gate command yourself');
    expect(feedback).toContain('lint: 3 errors');
  });

  it('never tells the next firing a crashed gate reverted its commit', () => {
    // Firing 583's gate crashed on a test:impacted timeout; firing.ts kept the
    // commit (no verdict), yet firing 584 was told "the commit was reverted"
    // while that commit still sat at HEAD.
    const feedback = gateFailureFeedback({
      ok: false,
      crashed: true,
      details: 'pnpm run test:impacted failed (crashed: timeout)',
    });
    expect(feedback).not.toContain('the commit was reverted');
    expect(feedback).toContain('THE GATE CRASHED');
    expect(feedback).toContain('NOT reverted');
    expect(feedback).toContain('still at HEAD');
    expect(feedback).toContain('do not redo it');
    expect(feedback).toContain('pnpm run test:impacted failed (crashed: timeout)');
  });

  it('keeps a crash message clean when the gate gave no details', () => {
    const feedback = gateFailureFeedback({ ok: false, crashed: true });
    expect(feedback).toContain('THE GATE CRASHED');
    expect(feedback).not.toContain('undefined');
  });
});
