// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * data-model/fresh-store — loads `@autopilot/store`'s BUILT output only after
 * bringing it up to date with `packages/store/src/`.
 *
 * `generate-doc.mjs` introspects the schema through `packages/store/dist/`.
 * It used to import that build statically, so a migration added to
 * `src/schema.ts` and not yet compiled regenerated DATA-MODEL.md from the
 * pre-edit build — the new migration silently missing — and a local
 * `ci:data-model --check` passed against it
 * (docs/debriefs/2026-09-26-cost-unknown-revert-root-cause-stale-dist-trap.md).
 *
 * `tsc -b` is incremental, a no-op when `dist/` is already current, so it
 * runs every time rather than behind a staleness guess: mtimes lie after a
 * merge rewrites byte-identical files (apps/dashboard/src/landing/freshness.ts).
 * A failed build throws — the stale `dist/` is never a fallback.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** The command that compiles `packages/store` with this checkout's own
 *  TypeScript: node running `typescript/bin/tsc` directly, so no shell and
 *  no `pnpm`/`npx` shim is involved on any OS. */
export function storeBuildArgv(repoRoot) {
  return {
    file: process.execPath,
    args: [require.resolve('typescript/bin/tsc'), '-b', join(repoRoot, 'packages', 'store')],
  };
}

/** Compiles `packages/store`; throws when tsc exits non-zero, with its
 *  diagnostics already printed. */
export function buildStore(repoRoot) {
  const { file, args } = storeBuildArgv(repoRoot);
  execFileSync(file, args, { cwd: repoRoot, stdio: 'inherit', windowsHide: true });
}

/** The store module, loaded from a `dist/` that `build` has just refreshed.
 *  `build` and `load` are seams for tests. */
export async function importFreshStore(
  repoRoot,
  { build = buildStore, load = (href) => import(href) } = {},
) {
  build(repoRoot);
  return load(pathToFileURL(join(repoRoot, 'packages', 'store', 'dist', 'index.js')).href);
}
