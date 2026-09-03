// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for shared/backlog-match.ts — the `≈ <sha> "<subject>"`
 * fragment both fly.ts's end-of-flight reconciliation console line and the
 * DETECTED BACKLOG panel (web/backlog-panel.ts) render for one candidate.
 */

import { describe, it, expect } from 'vitest';
import { backlogMatchText } from '../../src/shared/backlog-match.js';

describe('backlogMatchText', () => {
  it('renders a subject match with no caveat suffix', () => {
    expect(
      backlogMatchText({
        matchedVia: 'subject',
        commitSha: 'abc1234',
        commitSubject: 'feat(widget): add widget parser support',
      }),
    ).toBe('≈ abc1234 "feat(widget): add widget parser support"');
  });

  it('appends the weaker-signal caveat for a path match', () => {
    expect(
      backlogMatchText({
        matchedVia: 'path',
        commitSha: 'def5678',
        commitSubject: 'wip(autopilot): checkpoint — firing 12 died mid-unit',
      }),
    ).toBe(
      '≈ def5678 "wip(autopilot): checkpoint — firing 12 died mid-unit" [matched via changed files, not subject text]',
    );
  });
});
