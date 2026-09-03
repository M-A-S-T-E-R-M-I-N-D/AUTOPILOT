// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { buildFlightSettings } from '@autopilot/engine';
import { verifyGuardSettings } from '../../src/flight/guard-verify.js';

const TARGET_ROOT = '/repo/target';
const SCRIPT_PATH = '/repo/dist/guard-hook.js';
const SETTINGS_PATH = '/tmp/flight-guard-fly-widget.settings.json';

describe('verifyGuardSettings', () => {
  const expected = buildFlightSettings(TARGET_ROOT, SCRIPT_PATH);
  const validRaw = `${JSON.stringify(expected, null, 2)}\n`;

  it('passes when the file reads back exactly what was written and the guard script exists', () => {
    const result = verifyGuardSettings(
      SETTINGS_PATH,
      expected,
      SCRIPT_PATH,
      () => validRaw,
      () => true,
    );
    expect(result).toEqual({ ok: true });
  });

  it('fails when the settings file cannot be read back (a write that silently failed)', () => {
    const result = verifyGuardSettings(
      SETTINGS_PATH,
      expected,
      SCRIPT_PATH,
      () => {
        throw new Error('ENOENT');
      },
      () => true,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('could not be read back');
  });

  it('fails when the file on disk is not valid JSON (a truncated/corrupted write)', () => {
    const result = verifyGuardSettings(
      SETTINGS_PATH,
      expected,
      SCRIPT_PATH,
      () => '{ not valid json',
      () => true,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('did not parse back as valid JSON');
  });

  it('fails when the parsed content does not match the intended settings (a stale/foreign file at that path)', () => {
    const wrong = buildFlightSettings('/repo/some-other-root', SCRIPT_PATH);
    const result = verifyGuardSettings(
      SETTINGS_PATH,
      expected,
      SCRIPT_PATH,
      () => `${JSON.stringify(wrong)}\n`,
      () => true,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('do not match what fly.ts intended to write');
  });

  it('fails when the guard-hook script the settings reference does not exist on disk', () => {
    const result = verifyGuardSettings(
      SETTINGS_PATH,
      expected,
      SCRIPT_PATH,
      () => validRaw,
      () => false,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('guard-hook script not found');
    expect(result.reason).toContain(SCRIPT_PATH);
  });
});
