// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { ClockPort } from '../ports.js';

/** Real system clock. Injected everywhere so tests stay deterministic. */
export class SystemClock implements ClockPort {
  nowEpochSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  nowIso(): string {
    return new Date().toISOString();
  }
}
