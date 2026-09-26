// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0025 (board web-mtywp7zq-55f3o9), law 4 — "Credits": the complete
 * upstream Lucide licence travels in `LICENSES/ISC.txt`, THANKS.md gains a
 * Lucide line, and docs/README.md names it. The operator's ask carried this
 * half explicitly ("and don't forget to update the credits documents"), and it
 * is the half nothing else checks: the emoji census pins the chrome, but a
 * credit dropped from a doc fails no build.
 *
 * Found live on 2026-09-26: the docs index never named Lucide, the
 * third-party inventory — "the licenses of what the product ships" — listed
 * only npm packages, and THANKS.md promised "nothing vendored" a few lines
 * above crediting the icons and typefaces it vendors (and credited the bundled
 * Roboto under Apache-2.0 while the text shipped beside it is OFL-1.1).
 *
 * Deliberately phrase-light: each doc may reword its credit freely. It may not
 * drop the name, the licence path, or the vendored-assets truth.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function read(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), 'utf8');
}

const THANKS = read('THANKS.md');
const INVENTORY = read('docs', 'THIRD-PARTY-LICENSES.md');
const DOCS_INDEX = read('docs', 'README.md');

describe('icon system credits (epic 0025 law 4)', () => {
  it('ships the complete Lucide ISC text with the Feather MIT notice it carries', () => {
    const licence = read('LICENSES', 'ISC.txt');
    expect(licence).toContain('Copyright (c) 2026 Lucide Icons and Contributors');
    expect(licence).toContain('Permission to use, copy, modify, and/or distribute');
    expect(licence).toContain('Copyright (c) 2013-present Cole Bemis');
  });

  it('declares ISC and both upstream holders in the SPDX header of the vendored icon data', () => {
    const header = read('apps', 'dashboard', 'src', 'web', 'icons.ts').split('\n', 5).join('\n');
    expect(header).toContain('SPDX-License-Identifier: Apache-2.0 AND ISC');
    expect(header).toContain('Lucide Icons and Contributors');
    expect(header).toContain('Cole Bemis');
  });

  it.each([
    ['THANKS.md', THANKS],
    ['docs/THIRD-PARTY-LICENSES.md', INVENTORY],
    ['docs/README.md', DOCS_INDEX],
  ])('%s names Lucide and links the licence text it ships under', (_doc, content) => {
    expect(content).toContain('Lucide');
    expect(content).toMatch(/LICENSES\/ISC\.txt/);
  });

  it('no credit surface claims the product vendors nothing', () => {
    for (const content of [THANKS, INVENTORY]) {
      expect(content).not.toMatch(/nothing vendored|vendors none/i);
    }
  });

  it('credits both self-hosted typefaces under the OFL-1.1 their bundled texts carry', () => {
    for (const face of ['inter', 'roboto']) {
      const text = read('apps', 'dashboard', 'src', 'assets', `OFL-${face}.txt`);
      expect(text).toContain('SIL Open Font License, Version 1.1');
    }
    const letters = THANKS.slice(
      THANKS.indexOf('## The letters themselves'),
      THANKS.indexOf('## The icons'),
    );
    expect(letters).toContain('Roboto');
    expect(letters).toContain('OFL-1.1');
    expect(letters).not.toContain('Apache-2.0');
    expect(INVENTORY).toMatch(/Inter[\s\S]*Roboto[\s\S]*OFL-1\.1/);
  });
});
