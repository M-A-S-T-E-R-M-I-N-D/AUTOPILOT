// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  collaborationClaimStateLabel,
  isMyCollaborationClaim,
} from '../../src/web/collaboration-panel.js';

describe('collaborationClaimStateLabel', () => {
  it('reads "Unclaimed" for an entry with no assignees', () => {
    expect(collaborationClaimStateLabel({ assignees: [] })).toBe('Unclaimed');
  });

  it('names the single assignee, @-prefixed', () => {
    expect(collaborationClaimStateLabel({ assignees: ['octocat'] })).toBe('Claimed by @octocat');
  });

  it('joins multiple assignees with a comma', () => {
    expect(collaborationClaimStateLabel({ assignees: ['octocat', 'monalisa'] })).toBe(
      'Claimed by @octocat, @monalisa',
    );
  });
});

describe('isMyCollaborationClaim', () => {
  it('is false when the viewer login is not among the assignees', () => {
    expect(isMyCollaborationClaim({ assignees: ['octocat'] }, 'monalisa')).toBe(false);
  });

  it('is true when the viewer login is among the assignees', () => {
    expect(isMyCollaborationClaim({ assignees: ['octocat', 'monalisa'] }, 'monalisa')).toBe(true);
  });

  it('is false for an unresolved viewer login (null/undefined) — no viewer, no claim', () => {
    expect(isMyCollaborationClaim({ assignees: ['octocat'] }, null)).toBe(false);
    expect(isMyCollaborationClaim({ assignees: ['octocat'] }, undefined)).toBe(false);
  });

  it('is false for an unassigned entry regardless of login', () => {
    expect(isMyCollaborationClaim({ assignees: [] }, 'octocat')).toBe(false);
  });
});
