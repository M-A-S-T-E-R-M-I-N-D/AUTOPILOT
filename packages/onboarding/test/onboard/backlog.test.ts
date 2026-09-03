// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectBacklogPath, parseSoulBacklogPath } from '../../src/onboard/backlog.js';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';

function snap(files: readonly string[]) {
  return makeFsSnapshot({ files, contents: {} });
}

describe('detectBacklogPath', () => {
  it('returns null for a project with no backlog file', () => {
    expect(detectBacklogPath(snap(['package.json', 'src/index.ts', 'README.md']))).toBeNull();
  });

  it('finds a root-level BACKLOG.md', () => {
    expect(detectBacklogPath(snap(['BACKLOG.md', 'README.md']))).toBe('BACKLOG.md');
  });

  it('finds a root-level TODO.md', () => {
    expect(detectBacklogPath(snap(['TODO.md', 'README.md']))).toBe('TODO.md');
  });

  it("finds AUTOPILOT's own numbered docs/BACKLOG-999.md convention", () => {
    expect(detectBacklogPath(snap(['docs/BACKLOG-999.md', 'src/index.ts']))).toBe(
      'docs/BACKLOG-999.md',
    );
  });

  it('is case-insensitive', () => {
    expect(detectBacklogPath(snap(['backlog.MD']))).toBe('backlog.MD');
  });

  it('prefers the shallowest match, then lexical order, for determinism', () => {
    expect(detectBacklogPath(snap(['docs/TODO.md', 'BACKLOG.md']))).toBe('BACKLOG.md');
    expect(detectBacklogPath(snap(['b/TODO.md', 'a/BACKLOG.md']))).toBe('a/BACKLOG.md');
  });

  it('prefers a shallow match even against a much deeper, longer path', () => {
    // A regression case for the depth comparator: it must compare segment
    // *counts* (`.split('/').length`), not raw character counts — a long
    // basename shouldn't be able to outweigh a real depth difference.
    expect(detectBacklogPath(snap(['BACKLOG.md', 'x/y/z/w/todo.md']))).toBe('BACKLOG.md');
  });

  it('prefers depth over lexical order when the two disagree', () => {
    // Alphabetically, 'a/a/TODO.md' sorts before 'zzz/BACKLOG.md' — depth
    // must be compared first, with localeCompare only a tie-break.
    expect(detectBacklogPath(snap(['zzz/BACKLOG.md', 'a/a/TODO.md']))).toBe('zzz/BACKLOG.md');
  });

  it('does not match a non-.md file, even one named "backlog"', () => {
    expect(detectBacklogPath(snap(['my-backlog.txt', 'notes/backlog.json']))).toBeNull();
  });

  it('requires the basename to start with "backlog"/"todo", not just contain it', () => {
    expect(detectBacklogPath(snap(['myproject-backlog.md']))).toBeNull();
  });

  it('requires the basename to end right after ".md", not just contain it', () => {
    expect(detectBacklogPath(snap(['backlog.md.bak']))).toBeNull();
  });
});

describe('parseSoulBacklogPath', () => {
  it('returns null when SOUL has no Backlog line', () => {
    expect(parseSoulBacklogPath('# SOUL — x\n\nStack: js\n')).toBeNull();
  });

  it('reads an operator-declared Backlog: <path> line', () => {
    const soul = '# SOUL — x\n\nStack: js\nBacklog: planning/roadmap.md\n\n## Gate\n';
    expect(parseSoulBacklogPath(soul)).toBe('planning/roadmap.md');
  });

  it('requires Backlog: to start the line, not just appear in it', () => {
    expect(parseSoulBacklogPath('Notes: See Backlog: docs/x.md')).toBeNull();
  });

  it('is case-insensitive on the keyword, like Stack:', () => {
    expect(parseSoulBacklogPath('backlog: docs/NOTES.md')).toBe('docs/NOTES.md');
  });

  it('trims surrounding whitespace', () => {
    expect(parseSoulBacklogPath('Backlog:   docs/NOTES.md   ')).toBe('docs/NOTES.md');
  });

  it('treats a value-less Backlog: line as no declaration', () => {
    expect(parseSoulBacklogPath('Backlog:\nStack: js')).toBeNull();
  });
});
