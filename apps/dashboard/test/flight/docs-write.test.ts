// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  DOCS_WRITE_ALLOWED_ROOTS,
  isDocsWritePathAllowed,
  planDocsWrite,
  type DocsWriteRequest,
} from '../../src/flight/docs-write.js';

function request(overrides: Partial<DocsWriteRequest> = {}): DocsWriteRequest {
  return {
    path: 'docs/README.md',
    content: '# Hello\n',
    author: 'octocat',
    when: '2026-09-25T00:00:00.000Z',
    page: 'docs-reader',
    ...overrides,
  };
}

describe('isDocsWritePathAllowed', () => {
  it('allows any file nested under docs/', () => {
    expect(isDocsWritePathAllowed('docs/README.md')).toBe(true);
    expect(isDocsWritePathAllowed('docs/epics/0023-docs-reader.md')).toBe(true);
    expect(isDocsWritePathAllowed('docs/a/b/c.md')).toBe(true);
  });

  it('allows the two exact root-level files', () => {
    expect(isDocsWritePathAllowed('README.md')).toBe(true);
    expect(isDocsWritePathAllowed('CHANGELOG.md')).toBe(true);
  });

  it('refuses a bare docs/ root naming no file', () => {
    expect(isDocsWritePathAllowed('docs/')).toBe(false);
    expect(isDocsWritePathAllowed('docs')).toBe(false);
  });

  it('refuses any path outside the allow-list', () => {
    expect(isDocsWritePathAllowed('package.json')).toBe(false);
    expect(isDocsWritePathAllowed('apps/dashboard/src/server/server.ts')).toBe(false);
    expect(isDocsWritePathAllowed('README.md.bak')).toBe(false);
    expect(isDocsWritePathAllowed('docsREADME.md')).toBe(false);
  });

  it('refuses parent-directory traversal at any depth', () => {
    expect(isDocsWritePathAllowed('docs/../README.md')).toBe(false);
    expect(isDocsWritePathAllowed('docs/../../etc/passwd')).toBe(false);
    expect(isDocsWritePathAllowed('docs/a/../../b.md')).toBe(false);
    expect(isDocsWritePathAllowed('..')).toBe(false);
  });

  it('refuses an absolute path', () => {
    expect(isDocsWritePathAllowed('/etc/passwd')).toBe(false);
    expect(isDocsWritePathAllowed('/docs/README.md')).toBe(false);
    expect(isDocsWritePathAllowed('C:/docs/README.md')).toBe(false);
  });

  it('refuses a path carrying a literal backslash', () => {
    expect(isDocsWritePathAllowed('docs\\README.md')).toBe(false);
    expect(isDocsWritePathAllowed('docs/..\\README.md')).toBe(false);
  });

  it('refuses a doubled-slash path (an empty segment)', () => {
    expect(isDocsWritePathAllowed('docs//README.md')).toBe(false);
  });

  it('refuses an empty path', () => {
    expect(isDocsWritePathAllowed('')).toBe(false);
  });
});

describe('planDocsWrite', () => {
  it('accepts an allowed path and appends a provenance line', () => {
    const plan = planDocsWrite(request({ content: '# Hello\n' }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('expected ok plan');
    expect(plan.path).toBe('docs/README.md');
    expect(plan.content).toBe(
      '# Hello\n\n<!-- edited via dashboard by octocat on 2026-09-25T00:00:00.000Z from docs-reader -->\n',
    );
  });

  it('refuses a path outside the allow-list with a reasoned message', () => {
    const plan = planDocsWrite(request({ path: 'apps/dashboard/src/server/server.ts' }));
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a rejection');
    expect(plan.reason).toContain('apps/dashboard/src/server/server.ts');
    expect(plan.reason).toContain('allow-list');
  });

  it('refuses traversal even when the final segment looks like an allowed file', () => {
    const plan = planDocsWrite(request({ path: 'docs/../CHANGELOG.md' }));
    expect(plan.ok).toBe(false);
  });

  it('refuses binary content (a NUL byte) even on an allowed path', () => {
    const plan = planDocsWrite(request({ content: 'binary\u0000blob' }));
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('expected a rejection');
    expect(plan.reason).toContain('binary');
  });

  it('never mutates the request object', () => {
    const req = request();
    const frozen = Object.freeze({ ...req });
    expect(() => planDocsWrite(frozen)).not.toThrow();
  });
});

describe('DOCS_WRITE_ALLOWED_ROOTS', () => {
  it('is exactly the three roots the epic names', () => {
    expect(DOCS_WRITE_ALLOWED_ROOTS).toEqual(['docs/', 'README.md', 'CHANGELOG.md']);
  });
});
