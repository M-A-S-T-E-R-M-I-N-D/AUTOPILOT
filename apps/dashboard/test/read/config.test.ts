// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import { DB_ENV_VAR, DEFAULT_DB_RELATIVE, resolveDbPath } from '../../src/read/config.js';

describe('DB_ENV_VAR', () => {
  it('is the AUTOPILOT_DB env var name', () => {
    expect(DB_ENV_VAR).toBe('AUTOPILOT_DB');
  });
});

describe('DEFAULT_DB_RELATIVE', () => {
  it('is .autopilot/autopilot.db', () => {
    expect(DEFAULT_DB_RELATIVE.replace(/\\/g, '/')).toBe('.autopilot/autopilot.db');
  });
});

describe('resolveDbPath', () => {
  it('honors a non-empty AUTOPILOT_DB override, ignoring cwd entirely', () => {
    const path = resolveDbPath({ [DB_ENV_VAR]: '/custom/store.db' }, '/work');
    expect(path).toBe('/custom/store.db');
  });

  it('falls back to the workspace-local default when the override is unset', () => {
    const path = resolveDbPath({}, '/work');
    expect(path.replace(/\\/g, '/')).toBe('/work/.autopilot/autopilot.db');
  });

  it('falls back to the workspace-local default when the override is an empty string', () => {
    const path = resolveDbPath({ [DB_ENV_VAR]: '' }, '/work');
    expect(path.replace(/\\/g, '/')).toBe('/work/.autopilot/autopilot.db');
  });

  it('joins the default relative path onto the given cwd', () => {
    const path = resolveDbPath({}, '/other/place');
    expect(path.replace(/\\/g, '/')).toBe('/other/place/.autopilot/autopilot.db');
  });

  describe('default parameters', () => {
    const originalCwd = process.cwd;
    const hadOverride = DB_ENV_VAR in process.env;
    const originalOverride = process.env[DB_ENV_VAR];

    afterEach(() => {
      process.cwd = originalCwd;
      if (hadOverride) {
        process.env[DB_ENV_VAR] = originalOverride as string;
      } else {
        delete process.env[DB_ENV_VAR];
      }
    });

    it('reads process.env and process.cwd() when no arguments are given', () => {
      process.cwd = () => '/mock/cwd';
      delete process.env[DB_ENV_VAR];

      expect(resolveDbPath().replace(/\\/g, '/')).toBe('/mock/cwd/.autopilot/autopilot.db');
    });

    it('honors a real process.env override when no arguments are given', () => {
      process.cwd = () => '/mock/cwd';
      process.env[DB_ENV_VAR] = '/real/override.db';

      expect(resolveDbPath()).toBe('/real/override.db');
    });
  });
});
