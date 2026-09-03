// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EnginePhase } from './ports.js';

export const ENGINE_VERSION = '0.1.0';

/** The fixed 5-node activity rail the live view lights up (REACTIVITY §3). */
export const ENGINE_PHASES: readonly EnginePhase[] = ['ORIENT', 'PICK', 'DO', 'GATE', 'COMMIT'];

export interface EngineInfo {
  readonly name: string;
  readonly version: string;
  readonly phases: readonly EnginePhase[];
}

/** Static capability descriptor — the real loop is fully implemented
 *  (see loop.ts/firing.ts/guard.ts/resilience.ts/routing.ts). */
export function engineInfo(): EngineInfo {
  return {
    name: '@autopilot/engine',
    version: ENGINE_VERSION,
    phases: ENGINE_PHASES,
  };
}
