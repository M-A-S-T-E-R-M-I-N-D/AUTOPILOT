// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for read/source.ts's parseLanguages/parseTopDirs/
 * parseHotFiles/parseActivityRows — previously only exercised indirectly
 * through source.test.ts's readFleet integration tests (which assert the
 * assembled FleetView, not each parser's own defensive-decode contract:
 * the limit clamps, the malformed-entry skip, and the try/catch degrade).
 */

import { describe, it, expect } from 'vitest';
import {
  parseLanguages,
  parseTopDirs,
  parseHotFiles,
  parseActivityRows,
} from '../../src/read/source.js';
import type { ProjectIndexMetaRow } from '@autopilot/store';

function meta(summary: string, hotFiles = '[]'): ProjectIndexMetaRow {
  return {
    project_id: 'p1',
    tree_hash: 'a'.repeat(64),
    file_count: 0,
    total_bytes: 0,
    summary,
    hot_files: hotFiles,
    tool_version: '1',
    built_at: 1,
    updated_at: 1,
  };
}

describe('parseLanguages', () => {
  it('returns [] for a null meta row (never-indexed project)', () => {
    expect(parseLanguages(null)).toEqual([]);
  });

  it('maps a valid languages array, defaulting a missing bytes to 0', () => {
    const result = parseLanguages(
      meta(
        JSON.stringify({
          languages: [
            { language: 'typescript', files: 9, bytes: 3000 },
            { language: 'json', files: 3 },
          ],
        }),
      ),
    );
    expect(result).toEqual([
      { language: 'typescript', files: 9, bytes: 3000 },
      { language: 'json', files: 3, bytes: 0 },
    ]);
  });

  it('skips entries missing a string language or a number files', () => {
    const result = parseLanguages(
      meta(
        JSON.stringify({
          languages: [
            { language: 'typescript', files: 9 },
            { language: 42, files: 3 },
            { language: 'json', files: '3' },
            {},
          ],
        }),
      ),
    );
    expect(result).toEqual([{ language: 'typescript', files: 9, bytes: 0 }]);
  });

  it('returns [] when summary.languages is not an array', () => {
    expect(parseLanguages(meta(JSON.stringify({ languages: 'nope' })))).toEqual([]);
  });

  it('returns [] on malformed summary JSON, never throwing', () => {
    expect(parseLanguages(meta('not valid json {{{'))).toEqual([]);
  });
});

describe('parseTopDirs', () => {
  it('returns [] for a null meta row', () => {
    expect(parseTopDirs(null)).toEqual([]);
  });

  it('maps a valid topDirs array', () => {
    const result = parseTopDirs(
      meta(
        JSON.stringify({
          topDirs: [
            { dir: 'src', files: 9 },
            { dir: '.', files: 3 },
          ],
        }),
      ),
    );
    expect(result).toEqual([
      { dir: 'src', files: 9 },
      { dir: '.', files: 3 },
    ]);
  });

  it('caps the result at the top-5 limit, skipping malformed entries without counting toward it', () => {
    const result = parseTopDirs(
      meta(
        JSON.stringify({
          topDirs: [
            { dir: 'a', files: 1 },
            { dir: 42, files: 1 }, // malformed — skipped, does not consume a limit slot
            { dir: 'b', files: 2 },
            { dir: 'c', files: 3 },
            { dir: 'd', files: 4 },
            { dir: 'e', files: 5 },
            { dir: 'f', files: 6 }, // beyond the cap — never reached
          ],
        }),
      ),
    );
    expect(result).toEqual([
      { dir: 'a', files: 1 },
      { dir: 'b', files: 2 },
      { dir: 'c', files: 3 },
      { dir: 'd', files: 4 },
      { dir: 'e', files: 5 },
    ]);
  });

  it('returns [] when summary.topDirs is not an array', () => {
    expect(parseTopDirs(meta(JSON.stringify({ topDirs: null })))).toEqual([]);
  });

  it('returns [] on malformed summary JSON, never throwing', () => {
    expect(parseTopDirs(meta('not valid json {{{'))).toEqual([]);
  });
});

describe('parseHotFiles', () => {
  it('returns [] for a null meta row', () => {
    expect(parseHotFiles(null)).toEqual([]);
  });

  it('accepts bare-string entries', () => {
    expect(parseHotFiles(meta('{}', JSON.stringify(['src/a.ts', 'README.md'])))).toEqual([
      'src/a.ts',
      'README.md',
    ]);
  });

  it('accepts {path} object entries and a mix of both shapes', () => {
    expect(
      parseHotFiles(meta('{}', JSON.stringify(['src/a.ts', { path: 'src/b.ts', size: 900 }]))),
    ).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('skips an entry with neither a string form nor a string path', () => {
    expect(
      parseHotFiles(meta('{}', JSON.stringify(['src/a.ts', { size: 900 }, { path: 42 }, 7]))),
    ).toEqual(['src/a.ts']);
  });

  it('caps the result at the top-5 limit', () => {
    const hot = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(parseHotFiles(meta('{}', JSON.stringify(hot)))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns [] when hot_files is not an array', () => {
    expect(parseHotFiles(meta('{}', JSON.stringify({ also: 'not an array' })))).toEqual([]);
  });

  it('returns [] on malformed hot_files JSON, never throwing', () => {
    expect(parseHotFiles(meta('{}', 'not valid json {{{'))).toEqual([]);
  });
});

describe('parseActivityRows', () => {
  it('returns [] for an empty row list', () => {
    expect(parseActivityRows([])).toEqual([]);
  });

  it('skips a row with a null payload', () => {
    expect(parseActivityRows([{ firing_id: 'f1', payload: null, created_at: 100 }])).toEqual([]);
  });

  it('maps a valid payload, deriving phase from tool/target/kind', () => {
    const result = parseActivityRows([
      {
        firing_id: 'f1',
        payload: JSON.stringify({ tool: 'Edit', target: 'src/a.ts', kind: 'file' }),
        created_at: 100,
      },
    ]);
    expect(result).toEqual([
      {
        tool: 'Edit',
        target: 'src/a.ts',
        kind: 'file',
        phase: 'do',
        at: 100,
        firingId: 'f1',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('defaults target to "" and kind to "other" when the payload omits them', () => {
    const result = parseActivityRows([
      { firing_id: 'f1', payload: JSON.stringify({ tool: 'Bash' }), created_at: 100 },
    ]);
    expect(result[0]).toMatchObject({ tool: 'Bash', target: '', kind: 'other', phase: 'other' });
  });

  it('carries reasoning/model through, and coerces non-string values to null', () => {
    const result = parseActivityRows([
      {
        firing_id: 'f1',
        payload: JSON.stringify({ tool: 'Bash', reasoning: 'checking status', model: 'sonnet' }),
        created_at: 100,
      },
      {
        firing_id: 'f2',
        payload: JSON.stringify({ tool: 'Bash', reasoning: 42, model: false }),
        created_at: 200,
      },
    ]);
    expect(result[0]).toMatchObject({ reasoning: 'checking status', model: 'sonnet' });
    expect(result[1]).toMatchObject({ reasoning: null, model: null });
  });

  it('coerces a non-finite tokensIn/tokensOut (NaN, Infinity, non-number) to null via numOrNull', () => {
    const result = parseActivityRows([
      {
        firing_id: 'f1',
        payload: JSON.stringify({ tool: 'Bash', tokensIn: 500, tokensOut: 40 }),
        created_at: 100,
      },
      {
        firing_id: 'f2',
        payload: JSON.stringify({ tool: 'Bash', tokensIn: 'not-a-number', tokensOut: null }),
        created_at: 200,
      },
    ]);
    expect(result[0]).toMatchObject({ tokensIn: 500, tokensOut: 40 });
    expect(result[1]).toMatchObject({ tokensIn: null, tokensOut: null });
  });

  it('skips a row whose payload lacks a string tool', () => {
    const result = parseActivityRows([
      { firing_id: 'f1', payload: JSON.stringify({ target: 'a.ts' }), created_at: 100 },
    ]);
    expect(result).toEqual([]);
  });

  it('skips a row with malformed JSON, never throwing', () => {
    const result = parseActivityRows([
      { firing_id: 'f1', payload: 'not-json{{', created_at: 100 },
      {
        firing_id: 'f2',
        payload: JSON.stringify({ tool: 'Bash', target: 'git commit', kind: 'command' }),
        created_at: 200,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ tool: 'Bash', phase: 'commit', firingId: 'f2' });
  });

  it('preserves a null firing_id (rows recorded before firing_id existed)', () => {
    const result = parseActivityRows([
      { firing_id: null, payload: JSON.stringify({ tool: 'Bash' }), created_at: 100 },
    ]);
    expect(result[0]).toMatchObject({ firingId: null });
  });
});
