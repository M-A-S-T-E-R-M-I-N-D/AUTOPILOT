// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the LANDING EXECUTE result-message math
 * (`web/landing-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, forty-third cut. `landing-execute-restart.test.ts`
 * only ever asserted the bare success text through the real client bundle;
 * the failure branch (details, error fallback, and the generic "landing
 * failed." message) had no coverage at all before this — these tests cover
 * every branch directly, without DOM/fetch.
 */

import { describe, it, expect } from 'vitest';
import { landingExecuteResult } from '../../src/web/landing-panel.js';

describe('landingExecuteResult', () => {
  it('renders a success message with the details', () => {
    const result = landingExecuteResult({ ok: true, details: 'merged.' });

    expect(result.text).toBe('✓ Landed — merged.');
    expect(result.className).toBe('landing-result landing-result-ok');
  });

  it('falls back to "merged." when a success response carries no details', () => {
    const result = landingExecuteResult({ ok: true });

    expect(result.text).toBe('✓ Landed — merged.');
  });

  it('renders a failure message from details', () => {
    const result = landingExecuteResult({
      ok: false,
      details: 'a flight is currently running against this project',
    });

    expect(result.text).toBe('✗ a flight is currently running against this project');
    expect(result.className).toBe('landing-result landing-result-fail');
  });

  it('falls back to error, then a generic message, when a failure carries no details', () => {
    expect(landingExecuteResult({ ok: false, error: 'boom' }).text).toBe('✗ boom');
    expect(landingExecuteResult({ ok: false }).text).toBe('✗ landing failed.');
  });

  it('treats a null/undefined response as a failure', () => {
    expect(landingExecuteResult(null).text).toBe('✗ landing failed.');
    expect(landingExecuteResult(undefined).className).toBe('landing-result landing-result-fail');
  });
});
