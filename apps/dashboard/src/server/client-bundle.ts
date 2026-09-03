// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { transformSync } from 'esbuild';
import { clientJs, coreClientJs, projectClientJs, panelsClientJs } from '../web/shell.js';

const cache = new Map<string, string>();

/**
 * The bytes actually sent for the client scripts — each chunk run through
 * esbuild's minifier and cached (the source never changes within a process
 * lifetime, so paying esbuild's transform cost more than once would be pure
 * waste). Kept out of web/shell.ts deliberately: esbuild's native transform
 * breaks under jsdom (its `TextEncoder`/`Uint8Array` realm invariant fails
 * there), and dozens of web/*.test.ts files import shell.ts inside a jsdom
 * environment to `eval` `clientJs()`/`fleetJs()` etc. and exercise DOM
 * behavior directly — this stays a server/Node-only, HTTP-transport concern
 * so those tests never load esbuild.
 *
 * `charset: 'utf8'` keeps non-ASCII source characters (—, ✗, …) as literal
 * UTF-8 bytes instead of esbuild's default `\uXXXX` escapes — several bytes
 * cheaper per occurrence. Safe because every chunk is served with an explicit
 * `charset=utf-8` Content-Type (routes.ts) and Node's `res.end(string)`
 * writes UTF-8 by default, so the wire bytes decode correctly either way.
 */
function minified(key: string, source: () => string): string {
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = transformSync(source(), { minify: true, loader: 'js', charset: 'utf8' }).code;
    cache.set(key, hit);
  }
  return hit;
}

/**
 * CODE-SPLIT chunks (epic 0002 slice 2 / BUNDLE DIET — see web/chunks.ts for
 * the chunk map and safety argument): `/app.js` is the core every page
 * loads; `/project.js` carries renderProjectPage's panels and is emitted
 * only on `/p/<id>` pages; `/panels.js` carries the self-init operator
 * panels with `defer` on every page. The three together are byte-equivalent
 * to the old single bundle's module set.
 */
export function minifiedCoreJs(): string {
  return minified('core', coreClientJs);
}

export function minifiedProjectJs(): string {
  return minified('project', projectClientJs);
}

export function minifiedPanelsJs(): string {
  return minified('panels', panelsClientJs);
}

/** The FULL bundle (every chunk, one script) — kept for the bundle-wide
 *  analysis tests and any consumer that wants the whole client in one string;
 *  no route serves this anymore. */
export function minifiedClientJs(): string {
  return minified('full', clientJs);
}
