// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { selectInboxFiles } from '../../src/flight/inbox.js';

describe('selectInboxFiles', () => {
  it('sorts the dropped files for deterministic ordering', () => {
    expect(selectInboxFiles(['b.md', 'a.md'])).toEqual(['a.md', 'b.md']);
  });

  it('excludes the convention README (instructions, not a note)', () => {
    expect(selectInboxFiles(['README.md', 'note.md'])).toEqual(['note.md']);
    expect(selectInboxFiles(['readme.md', 'note.md'])).toEqual(['note.md']);
  });

  it('excludes dotfiles', () => {
    expect(selectInboxFiles(['.gitkeep', '.DS_Store', 'note.md'])).toEqual(['note.md']);
  });

  it('returns an empty list for an empty or all-ignored folder', () => {
    expect(selectInboxFiles([])).toEqual([]);
    expect(selectInboxFiles(['README.md', '.gitkeep'])).toEqual([]);
  });

  it('does not mutate the caller-supplied array', () => {
    const original = ['b.md', 'a.md'];
    const input = [...original];
    selectInboxFiles(input);
    expect(input).toEqual(original);
  });
});
