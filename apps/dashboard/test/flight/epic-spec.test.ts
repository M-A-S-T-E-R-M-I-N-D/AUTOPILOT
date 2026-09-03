// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { extractEpicSpec } from '../../src/flight/epic-spec.js';

describe('extractEpicSpec', () => {
  it('extracts the trailing path after the EPIC-SPEC: marker', () => {
    expect(
      extractEpicSpec('MUTATION TESTING ... EPIC-SPEC: docs/epics/0002-mutation-testing.md'),
    ).toBe('docs/epics/0002-mutation-testing.md');
  });

  it('stops at the path when a DELIVERABLE: clause follows (the web-mss50i9r-gvkf81 demotion bug)', () => {
    expect(
      extractEpicSpec(
        'PLATFORM 2/7 - CI verify on PRs. EPIC-SPEC: docs/epics/0007-platform-maintainer-and-pool.md. DELIVERABLE: a PR shows the gate check',
      ),
    ).toBe('docs/epics/0007-platform-maintainer-and-pool.md');
  });

  it('strips trailing sentence punctuation without harming the .md extension', () => {
    expect(extractEpicSpec('Task EPIC-SPEC: docs/epics/0001-parallel-flights.md,')).toBe(
      'docs/epics/0001-parallel-flights.md',
    );
    expect(extractEpicSpec('Task EPIC-SPEC: docs/epics/0001-parallel-flights.md')).toBe(
      'docs/epics/0001-parallel-flights.md',
    );
  });

  it('strips EVERY consecutive trailing punctuation char, not just the last one', () => {
    expect(extractEpicSpec('(see EPIC-SPEC: docs/epics/0001-parallel-flights.md);')).toBe(
      'docs/epics/0001-parallel-flights.md',
    );
  });

  it('returns null when the title has no EPIC-SPEC clause', () => {
    expect(extractEpicSpec('Fix the flaky test in runner.test.ts')).toBeNull();
  });

  it('returns null when the marker is present but the path is blank', () => {
    expect(extractEpicSpec('Some task EPIC-SPEC:   ')).toBeNull();
  });
});
