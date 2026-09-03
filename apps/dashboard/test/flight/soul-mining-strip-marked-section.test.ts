// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { stripMarkedSection } from '../../src/flight/soul-mining.js';

const MARKER = '## Learned: recurring checkpoint pattern';

describe('stripMarkedSection', () => {
  it('returns the soul unchanged when the marker is absent', () => {
    const soul = '# SOUL\n\n## Gate\n- test: pnpm run test\n';

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe(soul);
  });

  it('cuts the marked section up through the next heading, preserving what follows', () => {
    const soul =
      '# SOUL\n\n## Gate\n- x\n\n' +
      `${MARKER}\n- Note bla bla\n\n` +
      '## Another Section\n- content\n';

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n\n## Gate\n- x\n\n## Another Section\n- content\n');
  });

  it('only removes the first following heading boundary, leaving later sections intact', () => {
    const soul =
      '# SOUL\n\n' + `${MARKER}\n- one\n\n` + '## Second\n- two\n\n' + '## Third\n- three\n';

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n\n## Second\n- two\n\n## Third\n- three\n');
    expect(result).toContain('## Third');
  });

  it('collapses to a trailing newline when the marker is the very last section', () => {
    const soul = '# SOUL\n\n## Gate\n- x\n\n' + `${MARKER}\n- Note bla bla\n`;

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n\n## Gate\n- x\n');
  });

  it('collapses to a trailing newline when nothing follows the marker at all', () => {
    const soul = `# SOUL\n\n${MARKER}`;

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n');
  });

  it('trims trailing blank lines from the preserved prefix before the marker', () => {
    const soul = '# SOUL\n\n\n\n' + `${MARKER}\n- Note\n`;

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n');
  });

  it('retains a heading that sits immediately after the marker with no body between them', () => {
    const soul = '# SOUL\n\n' + `${MARKER}\n## Immediately Next\n- content\n`;

    const result = stripMarkedSection(soul, MARKER);

    expect(result).toBe('# SOUL\n\n## Immediately Next\n- content\n');
  });
});
