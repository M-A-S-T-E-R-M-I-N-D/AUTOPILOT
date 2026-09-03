// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';

/** Env var that overrides where the dashboard reads the store from. */
export const DB_ENV_VAR = 'AUTOPILOT_DB';

/** Default store location relative to the workspace: `.autopilot/autopilot.db`. */
export const DEFAULT_DB_RELATIVE = join('.autopilot', 'autopilot.db');

/**
 * Resolve the store path the dashboard reads. `AUTOPILOT_DB` wins when set;
 * otherwise the workspace-local default. Env + cwd are injectable for testing.
 */
export function resolveDbPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env[DB_ENV_VAR];
  return override ? override : join(cwd, DEFAULT_DB_RELATIVE);
}
