// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { extractAdrSpec } from '../../src/flight/adr-spec.js';

describe('extractAdrSpec', () => {
  it('extracts the trailing path after the ADR: marker', () => {
    expect(
      extractAdrSpec('Adopt event sourcing for the audit log ADR: docs/adr/0006-event-sourcing.md'),
    ).toBe('docs/adr/0006-event-sourcing.md');
  });

  it('stops at the path when a DELIVERABLE: clause follows (the epic-spec web-mss50i9r-gvkf81 demotion bug, same tail-grab class)', () => {
    expect(
      extractAdrSpec(
        'Adopt event sourcing for the audit log ADR: docs/adr/0006-event-sourcing.md. DELIVERABLE: audit log uses append-only events',
      ),
    ).toBe('docs/adr/0006-event-sourcing.md');
  });

  it('strips trailing sentence punctuation without harming the .md extension', () => {
    expect(extractAdrSpec('Task ADR: docs/adr/0001-no-framework-core-loop.md,')).toBe(
      'docs/adr/0001-no-framework-core-loop.md',
    );
    expect(extractAdrSpec('Task ADR: docs/adr/0001-no-framework-core-loop.md')).toBe(
      'docs/adr/0001-no-framework-core-loop.md',
    );
  });

  it('returns null when the title has no ADR clause', () => {
    expect(extractAdrSpec('Fix the flaky test in runner.test.ts')).toBeNull();
  });

  it('returns null when the marker is present but the path is blank', () => {
    expect(extractAdrSpec('Some task ADR:   ')).toBeNull();
  });
});
