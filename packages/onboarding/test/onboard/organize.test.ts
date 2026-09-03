// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { proposeOrganization, ORGANIZE_MIN_COUNT } from '../../src/onboard/organize.js';
import { triageFolder } from '../../src/onboard/folder-triage.js';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';

describe('proposeOrganization', () => {
  it('proposes nothing for an empty folder', () => {
    const triage = triageFolder(makeFsSnapshot({ files: [], contents: {} }));
    expect(proposeOrganization(triage)).toEqual([]);
  });

  it('proposes nothing for a code folder', () => {
    const triage = triageFolder(makeFsSnapshot({ files: ['go.mod', 'main.go'], contents: {} }));
    expect(proposeOrganization(triage)).toEqual([]);
  });

  it('proposes nothing when the folder is already just its dominant category', () => {
    const triage = triageFolder(
      makeFsSnapshot({ files: ['a.png', 'b.jpg', 'c.mp4'], contents: {} }),
    );
    expect(triage.kind).toBe('media');
    expect(proposeOrganization(triage)).toEqual([]);
  });

  it('proposes grouping each sizeable non-dominant category, skipping "other"', () => {
    const triage = triageFolder(
      makeFsSnapshot({
        files: [
          'a.md',
          'b.md',
          'c.md',
          'd.md',
          'e.md',
          'f.md',
          'g.png',
          'h.jpg',
          'i.lock',
          'j.exe',
        ],
        contents: {},
      }),
    );
    expect(triage.kind).toBe('docs'); // docs = 6/10, at the dominance threshold
    expect(triage.inventory).toContainEqual({ category: 'other', count: 2 }); // 2 'other' files, ignored below

    const proposals = proposeOrganization(triage);
    expect(proposals).toEqual([
      { category: 'media', count: 2, suggestion: 'Group 2 media files into a media/ folder.' },
    ]);
  });

  it('skips a category under the minimum count threshold', () => {
    const triage = triageFolder(
      makeFsSnapshot({
        files: Array.from({ length: 5 }, (_, i) => `doc${i}.md`).concat('lone.png'),
        contents: {},
      }),
    );
    expect(triage.kind).toBe('docs');
    expect(proposeOrganization(triage)).toEqual([]);
    expect(ORGANIZE_MIN_COUNT).toBeGreaterThan(1);
  });

  it('proposes for every non-dominant category in a mixed folder', () => {
    const triage = triageFolder(
      makeFsSnapshot({
        files: ['a.md', 'b.md', 'c.png', 'd.jpg', 'e.json', 'f.csv'],
        contents: {},
      }),
    );
    expect(triage.kind).toBe('mixed');

    const proposals = proposeOrganization(triage);
    expect(proposals.map((p) => p.category).sort()).toEqual(['data', 'docs', 'media']);
    for (const p of proposals) {
      expect(p.suggestion).toBe(
        `Group ${p.count} ${p.category} files into a ${p.category}/ folder.`,
      );
    }
  });
});
