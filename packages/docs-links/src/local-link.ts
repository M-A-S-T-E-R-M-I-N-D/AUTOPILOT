// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Markdown local-link resolution — the pure decision core `scripts/docs/
 * check-links.mjs` has carried inline since it first shipped, extracted here
 * so the docs reader panel (epic 0023 "the docs reader", slice 1: "every
 * internal link is checked as it renders") can reuse the exact same rules
 * instead of a second implementation that drifts. `apps/dashboard/src` has
 * `rootDir: src` in its tsconfig, so a relative import reaching outside it
 * into `scripts/` would break the production build (`tsc -b` refuses an
 * input file outside a composite project's rootDir) — a workspace package
 * import (`@autopilot/docs-links`) has no such restriction, the same
 * reason `@autopilot/tokens` and `@autopilot/engine` already cross that
 * boundary. Pure — no fs access — so both the CI script and the dashboard's
 * server-side resolver can unit-test it directly against fixture strings.
 */

import { dirname, join, normalize } from 'node:path';

/** Every `[text](target)` — optionally followed by a `"title"` — inside `markdown`. */
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * A link target this module can verify against the filesystem — repo-relative
 * paths only. Absolute URLs, protocol links and in-page anchors are not
 * git-verifiable, so they are deliberately out of scope rather than guessed.
 */
export function isLocalTarget(target: string): boolean {
  if (target.length === 0) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, …
  if (target.startsWith('#')) return false;
  if (target.startsWith('//')) return false;
  return true;
}

/** Every raw link target found in `markdown`, in document order, unfiltered —
 *  callers narrow to git-verifiable ones with {@link isLocalTarget}. */
export function extractLinkTargets(markdown: string): readonly string[] {
  const targets: string[] = [];
  for (const match of markdown.matchAll(LINK_RE)) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }
  return targets;
}

/** Every local link target found in `markdown` — {@link extractLinkTargets}
 *  already filtered through {@link isLocalTarget}. */
export function localLinkTargets(markdown: string): readonly string[] {
  return extractLinkTargets(markdown).filter(isLocalTarget);
}

/**
 * Resolve a local link `target` written inside `fromFile` to the path it
 * names, relative to the same root `fromFile` is relative to. An `#anchor`
 * suffix names a heading inside the target, not a file, and is stripped
 * first; a target that is nothing BUT an anchor (`"#top"` already rejected by
 * {@link isLocalTarget}, but a bare `"#"` reaching here) resolves to nothing.
 */
export function resolveLocalLinkPath(fromFile: string, target: string): string | null {
  const path = target.split('#')[0];
  if (path === undefined || path.length === 0) return null;
  return normalize(join(dirname(fromFile), path));
}
