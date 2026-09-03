// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Narrator overflow (board web-msqgnkdw-s7zlmm): the worker-card sentence is
 * composed pure in `shared/narrator.ts`, so the compose-time defenses live
 * there — a hard cap on the finished line, and a summary for the known noisy
 * shape (a multi-task-id command loop reads as "Updating N tasks" instead of
 * quoting raw command soup). The CSS clamp on `.live-worker-narrator` is the
 * render-side belt; these tests pin the compose-side suspenders.
 */

import { describe, it, expect } from 'vitest';
import { narratorLine, narratorPhrase } from '../../src/shared/narrator.js';

function command(target: string) {
  return { tool: 'Bash', target, kind: 'command', phase: 'do' };
}

describe('narrator compose-time overflow defenses', () => {
  it('caps the finished line at 90 characters with an ellipsis', () => {
    const line = narratorLine([
      {
        tool: 'mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation',
        target: 'x'.repeat(80),
        kind: 'mystery',
        phase: 'do',
      },
    ]);
    expect(line.length).toBeLessThanOrEqual(90);
    expect(line.endsWith('…')).toBe(true);
  });

  it('leaves a short line untouched (no cap side effects)', () => {
    expect(narratorLine([{ tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do' }])).toBe(
      'Editing a.ts.',
    );
  });

  it('summarizes a multi-task-id command as "Updating N tasks"', () => {
    const phrase = narratorPhrase(
      command(
        'for id in web-msnt5cdl-pox921 web-msniol15-foo6oi web-msqgnkdw-s7zlmm; do node scripts/board.mjs done $id; done',
      ),
    );
    expect(phrase).toBe('Updating 3 tasks');
  });

  it('leaves a single-task-id command as a plain Running sentence', () => {
    const phrase = narratorPhrase(command('node scripts/board.mjs done web-msqgnkdw-s7zlmm'));
    expect(phrase).toMatch(/^Running: /);
  });
});
