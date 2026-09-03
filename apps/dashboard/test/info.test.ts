// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  dashboardInfo,
  DASHBOARD_SCREENS,
  DASHBOARD_VERSION,
  PRODUCT_VERSION,
} from '../src/info.js';

describe('dashboardInfo', () => {
  it('reports the full static capability descriptor', () => {
    expect(dashboardInfo()).toEqual({
      name: '@autopilot/dashboard',
      version: '0.1.0',
      screens: ['fleet', 'project', 'approvals', 'soul', 'versions', 'settings', 'anomalies'],
    });
  });

  it('declares the seven control-panel screens in order', () => {
    expect(DASHBOARD_SCREENS).toEqual([
      'fleet',
      'project',
      'approvals',
      'soul',
      'versions',
      'settings',
      'anomalies',
    ]);
  });

  it('pins the workspace package version until first external publish', () => {
    expect(DASHBOARD_VERSION).toBe('0.1.0');
  });

  it('carries a real semver product version, distinct from the workspace version', () => {
    expect(PRODUCT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PRODUCT_VERSION).not.toBe(DASHBOARD_VERSION);
  });

  it('MATCHES the released version in the root package.json — the constant must never drift', () => {
    // 2026-08-24 live incident: the release automation bumps package.json,
    // CHANGELOG and the git tag, but PRODUCT_VERSION is a hand-written
    // constant it never touched — so the app told the operator "you run
    // v0.12.0" three releases after v0.12.0, and the LTS chip compared the
    // wrong number against upstream. Shape-only assertions let that drift
    // through; this pins the actual value.
    const rootPkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
    ) as { version: string };
    expect(PRODUCT_VERSION).toBe(rootPkg.version);
  });
});
