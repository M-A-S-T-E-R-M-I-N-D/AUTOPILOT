// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { formatFlightDoneLine } from '../../src/flight/flight-summary.js';

describe('formatFlightDoneLine', () => {
  it('names the requested count when stopped by max-iterations, so a defaulted 1-firing fleet launch reads as by-request rather than as an early death', () => {
    expect(formatFlightDoneLine({ firings: 1, stoppedBy: 'max-iterations' }, 1, 1, 1)).toBe(
      'Done — 1 firing(s) (requested 1), 1/1 shipped (gate-verified). Stopped by: max-iterations.',
    );
  });

  it('names the requested count for a multi-firing max-iterations stop too', () => {
    expect(formatFlightDoneLine({ firings: 5, stoppedBy: 'max-iterations' }, 5, 3, 5)).toBe(
      'Done — 5 firing(s) (requested 5), 3/5 shipped (gate-verified). Stopped by: max-iterations.',
    );
  });

  it('omits the requested-count note on a stop request — an intentional stop needs no by-request clarification', () => {
    expect(formatFlightDoneLine({ firings: 3, stoppedBy: 'stop' }, 5, 2, 3)).toBe(
      'Done — 3 firing(s), 2/3 shipped (gate-verified). Stopped by: stop.',
    );
  });
});
