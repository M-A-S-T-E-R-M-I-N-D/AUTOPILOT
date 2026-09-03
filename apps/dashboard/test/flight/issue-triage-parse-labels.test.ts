// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseIssueLabels } from '../../src/flight/issue-triage.js';

describe('parseIssueLabels', () => {
  it('reduces gh-shaped label objects to their names, in order', () => {
    const result = parseIssueLabels([{ name: 'bug' }, { name: 'pool: ux' }]);

    expect(result).toEqual(['bug', 'pool: ux']);
  });

  it('drops entries with a non-string name, a missing name, or a non-object shape', () => {
    const result = parseIssueLabels([
      { name: 'bug' },
      { name: 3 },
      { id: 1 },
      'nope',
      42,
      null,
      { name: 'duplicate' },
    ]);

    expect(result).toEqual(['bug', 'duplicate']);
  });

  it('returns an empty array for non-array input', () => {
    expect(parseIssueLabels(null)).toEqual([]);
    expect(parseIssueLabels(undefined)).toEqual([]);
    expect(parseIssueLabels('labels')).toEqual([]);
    expect(parseIssueLabels({ name: 'bug' })).toEqual([]);
  });

  it('returns an empty array for an empty array', () => {
    expect(parseIssueLabels([])).toEqual([]);
  });
});
