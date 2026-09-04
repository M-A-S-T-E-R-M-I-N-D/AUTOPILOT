// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export const DASHBOARD_VERSION = '0.1.0';

/**
 * The PRODUCT version (the repo/CHANGELOG/tag line — RELEASING.md), surfaced by
 * `/api/health` so a running dashboard is identifiable. Workspace packages stay
 * at 0.1.0 until first external publish; this is the number that means "the
 * product". Bumped as part of each release commit.
 */
export const PRODUCT_VERSION = '0.22.0';

/** The canonical upstream repo (epic 0006 "GitHub connected mode", slice 4
 *  "LTS chip") a co-pilot's LTS check compares {@link PRODUCT_VERSION}
 *  against — `owner/repo`, the shape `gh api repos/<...>/releases/latest`
 *  expects. Same identity `package.json`'s `homepage` and this repo's own
 *  `NOTICE`/`CITATION.cff` already point at; kept as a plain constant here
 *  rather than read from `package.json` at runtime so an installed (non-
 *  monorepo) dashboard never needs to locate that file on disk. */
export const UPSTREAM_REPO = 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT';

/** The dashboard screens (MASTER-PLAN §5). Read-only Fleet + Project detail ship first (M3). */
export const DASHBOARD_SCREENS = [
  'fleet',
  'project',
  'approvals',
  'soul',
  'versions',
  'settings',
  'anomalies',
] as const;
export type DashboardScreen = (typeof DASHBOARD_SCREENS)[number];

export interface DashboardInfo {
  readonly name: string;
  readonly version: string;
  readonly screens: readonly DashboardScreen[];
}

/** Static capability descriptor. The hardened localhost server, token-themed
 *  shell, and live read-model data are built — a hand-authored, bundler-free
 *  vanilla-JS client (no React dependency). */
export function dashboardInfo(): DashboardInfo {
  return {
    name: '@autopilot/dashboard',
    version: DASHBOARD_VERSION,
    screens: DASHBOARD_SCREENS,
  };
}
