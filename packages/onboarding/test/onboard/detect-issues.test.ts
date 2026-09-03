// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectIssues } from '../../src/onboard/detect-issues.js';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';

describe('detectIssues', () => {
  it('detects nothing in an empty folder', () => {
    expect(detectIssues(makeFsSnapshot({ files: [], contents: {} }))).toEqual([]);
  });

  it('detects nothing when no filename carries a copy marker', () => {
    const snapshot = makeFsSnapshot({ files: ['a.png', 'b.jpg', 'notes.md'], contents: {} });
    expect(detectIssues(snapshot)).toEqual([]);
  });

  it('flags a "(1)" suffix duplicate only when the canonical file is also present', () => {
    const withCanonical = makeFsSnapshot({
      files: ['report.txt', 'report (1).txt'],
      contents: {},
    });
    expect(detectIssues(withCanonical)).toEqual([
      {
        kind: 'likely-duplicate',
        description:
          '1 likely-duplicate file(s) found (e.g. "report (1).txt") — review before deleting.',
        suggestion:
          'Move the likely-duplicate file(s) into a _duplicates/ folder for review — do not delete anything unasked.',
      },
    ]);

    const withoutCanonical = makeFsSnapshot({ files: ['report (1).txt'], contents: {} });
    expect(detectIssues(withoutCanonical)).toEqual([]);
  });

  it('flags "copy of" and "-copy"/"_copy"/" copy" markers', () => {
    const snapshot = makeFsSnapshot({
      files: [
        'photo.jpg',
        'Copy of photo.jpg',
        'notes.md',
        'notes-copy.md',
        'draft.doc',
        'draft_copy.doc',
        'plan.txt',
        'plan copy.txt',
      ],
      contents: {},
    });
    const issues = detectIssues(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues).toContainEqual(
      expect.objectContaining({
        kind: 'likely-duplicate',
        description: expect.stringContaining('4 likely-duplicate file(s) found'),
      }),
    );
  });

  it('scopes canonical matching to the same directory', () => {
    const snapshot = makeFsSnapshot({
      files: ['a/report.txt', 'b/report (1).txt'],
      contents: {},
    });
    expect(detectIssues(snapshot)).toEqual([]);
  });

  it('is not fooled by an unrelated file that merely ends in a number in parens', () => {
    const snapshot = makeFsSnapshot({ files: ['season (1).mp4'], contents: {} });
    expect(detectIssues(snapshot)).toEqual([]);
  });

  it('flags extensionless and dotfile duplicates (no "." or a leading "." in the basename)', () => {
    const extensionless = makeFsSnapshot({ files: ['README', 'README (1)'], contents: {} });
    expect(detectIssues(extensionless)).toEqual([
      {
        kind: 'likely-duplicate',
        description:
          '1 likely-duplicate file(s) found (e.g. "README (1)") — review before deleting.',
        suggestion:
          'Move the likely-duplicate file(s) into a _duplicates/ folder for review — do not delete anything unasked.',
      },
    ]);

    const dotfile = makeFsSnapshot({ files: ['.env', '.env copy'], contents: {} });
    expect(dotfile.files).toContain('.env copy');
    expect(detectIssues(dotfile)).toEqual([
      {
        kind: 'likely-duplicate',
        description:
          '1 likely-duplicate file(s) found (e.g. ".env copy") — review before deleting.',
        suggestion:
          'Move the likely-duplicate file(s) into a _duplicates/ folder for review — do not delete anything unasked.',
      },
    ]);
  });
});
