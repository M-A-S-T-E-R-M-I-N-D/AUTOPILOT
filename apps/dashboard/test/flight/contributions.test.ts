// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT THIS OPERATOR HAS ACTUALLY CONTRIBUTED (operator, 2026-09-15). The
 * ladder used to tick these two steps from marks this browser wrote, so an
 * operator with dozens of filed issues and merged pull requests still read
 * as having contributed nothing. These pin the real read, including the
 * shapes `gh` really returns.
 */

import { describe, it, expect } from 'vitest';
import {
  readContributions,
  NO_CONTRIBUTIONS,
  ISSUE_SEARCH_ARGS,
  PR_SEARCH_ARGS,
} from '../../src/flight/contributions.js';

// Verbatim from `gh search … --json` on the operator's own account.
const REAL_ISSUES = `[{"number":49},{"number":28},{"number":27}]`;
const REAL_PRS = `[{"number":68,"state":"merged"},{"number":63,"state":"closed"},{"number":62,"state":"closed"}]`;

describe('readContributions', () => {
  it('sees the contributions that were there all along', () => {
    expect(readContributions(REAL_ISSUES, REAL_PRS)).toEqual({
      hasIssue: true,
      hasPr: true,
      hasMergedPr: true,
    });
  });

  it('separates "opened a pull request" from "had one merged"', () => {
    // Opening is an act the contributor alone controls; merging is one a
    // third party had to agree to. Only the second is worth showing in
    // public, so the two are never collapsed into one flag.
    const openOnly = `[{"number":1,"state":"open"},{"number":2,"state":"closed"}]`;
    expect(readContributions('[]', openOnly)).toMatchObject({
      hasPr: true,
      hasMergedPr: false,
    });
  });

  it('reports nothing found when the search could not run at all', () => {
    // No gh, not signed in, offline. "We do not know of a contribution" is
    // the honest answer, and the only consequence is an unticked row — so it
    // is never an error.
    expect(readContributions(undefined, undefined)).toEqual(NO_CONTRIBUTIONS);
  });

  it('never throws on a malformed or surprising answer', () => {
    for (const bad of ['', 'not json', '{}', 'null', '[1,2,3]']) {
      expect(() => readContributions(bad, bad)).not.toThrow();
    }
    expect(readContributions('{}', 'null')).toEqual(NO_CONTRIBUTIONS);
    // A bare array of non-objects still counts as rows — it is an answer
    // with entries, and `state` simply reads as absent.
    expect(readContributions('[1,2,3]', '[1]')).toMatchObject({ hasIssue: true, hasPr: true });
  });

  it('reads an empty result as no contribution, not as a failure', () => {
    expect(readContributions('[]', '[]')).toEqual(NO_CONTRIBUTIONS);
  });
});

describe('the searches themselves', () => {
  it('are read-only, scoped to the signed-in account, and bounded', () => {
    for (const args of [ISSUE_SEARCH_ARGS, PR_SEARCH_ARGS]) {
      expect(args[0]).toBe('search');
      expect(args).toContain('--author=@me');
      expect(args).toContain('--limit');
      // Nothing here may create, edit, close or comment on anything.
      for (const verb of ['create', 'edit', 'close', 'comment', 'merge', 'delete']) {
        expect(args, `${verb} has no business in a read`).not.toContain(verb);
      }
    }
  });

  it('asks for a pull request’s state, since merged is the fact that matters', () => {
    expect(PR_SEARCH_ARGS.join(' ')).toContain('state');
  });
});
