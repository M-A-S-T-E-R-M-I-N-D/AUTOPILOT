// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE DOCS READER'S WRITE GUARD (epic 0023 "the docs reader" slice 3, "the
 * editor": docs/epics/0023-docs-reader.md's own wording, "save writes the
 * file through a guarded endpoint (path allow-list under `docs/`,
 * `README.md`, `CHANGELOG.md`; never outside the repo; never binary)"). The
 * same shape as `plan-guard.ts`'s `validateGateSpec` — a pure, no-I/O
 * validator callers run BEFORE ever touching the filesystem, returning the
 * one reason a path is refused rather than throwing. This slice ships only
 * that pure decision core: the actual `POST` endpoint that joins an accepted
 * path onto a project's root and writes it, the split-preview editor UI, and
 * the provenance line are their own follow-up slices, matching how this
 * codebase's other guarded-write rituals (`plan-guard.ts` itself) shipped
 * their validator unwired first.
 *
 * "Never binary" is enforced by the `.md` extension requirement: the docs
 * reader only ever lists Markdown-ish paths (`read/project-detail.ts`'s
 * `listProjectDocs` — `README%`, `LICENSE%`, `docs/%`, `%.md`), so a target
 * this guard accepts can never be a binary file the reader itself would
 * offer to open. "Never outside the repo" is enforced by rejecting any `..`
 * or `.` path segment, a leading `/`, a drive letter, and a backslash —
 * `path.join`ing an accepted path onto a project root can never climb out.
 */

export type DocsWriteValidation =
  { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: string };

const ALLOWED_EXACT_PATHS = new Set(['README.md', 'CHANGELOG.md']);
const ALLOWED_PREFIX = 'docs/';

/** Whether `rawPath` is a permitted target for the docs editor's guarded
 *  write endpoint — repo-relative, forward-slashed, traversal-free, `.md`,
 *  and either `README.md`/`CHANGELOG.md` exactly or under `docs/`. Refuses
 *  with the one reason rather than throwing, the same `{ ok, error }` shape
 *  `plan-guard.ts`'s `validateGateSpec` already uses for its own guarded
 *  write. */
export function validateDocsWritePath(rawPath: unknown): DocsWriteValidation {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, error: 'a path is required' };
  }
  const path = rawPath.trim();
  if (path.includes('\\')) return { ok: false, error: 'path must use forward slashes' };
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return { ok: false, error: 'path must be repo-relative' };
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)) {
    return { ok: false, error: 'path must not contain empty, . or .. segments' };
  }
  if (!path.toLowerCase().endsWith('.md')) {
    return { ok: false, error: 'only Markdown files can be edited' };
  }
  if (!ALLOWED_EXACT_PATHS.has(path) && !path.startsWith(ALLOWED_PREFIX)) {
    return { ok: false, error: 'path is outside the docs editor allow-list' };
  }
  return { ok: true, path };
}
