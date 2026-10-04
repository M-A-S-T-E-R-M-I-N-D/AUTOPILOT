// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The e2e boot smoke tests (`e2e/dashboard.spec.ts`, `e2e/project-page.spec.ts`)
 * fail on any 4xx the page draws that their `badResponses` list does not name,
 * and a panel whose self-init polls an /api route the hermetic fixture leaves
 * unwired 404s there by design. Those specs run only in CI, so round 84's
 * routing console shipped green through every local gate and then turned the
 * pre-landing render red (4d220f28 listed its 404 in both). This runs the same
 * boot locally: the real client bundle in a jsdom window, every fetch
 * forwarded to the real server built exactly as `e2e-server.ts` builds it, and
 * each spec's list held to what actually failed — a new panel's 404 goes red
 * here, in the gate.
 *
 * Node environment with its own window, not the jsdom project: the server
 * pulls in esbuild, whose load-time TextEncoder invariant fails under jsdom.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server/server.js';
import { buildFleetView } from '../../src/read/fleet.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

/** The slice of jsdom this file drives (the package ships no types). */
interface BootWindow {
  fetch: unknown;
  setInterval: unknown;
  eval(source: string): unknown;
  close(): void;
}
interface JsdomModule {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: 'outside-only'; pretendToBeVisual: boolean },
  ) => { window: BootWindow };
}
const { JSDOM } = createRequire(import.meta.url)('jsdom') as JsdomModule;

const E2E_DIR = new URL('../../e2e/', import.meta.url);

/** The list a smoke spec's `expect(badResponses.sort()).toEqual([...])` names. */
function listedBadResponses(spec: string): string[] {
  const source = readFileSync(new URL(spec, E2E_DIR), 'utf8');
  const block = /expect\(badResponses\.sort\(\)\)\.toEqual\(\[([\s\S]*?)\]\);/.exec(source);
  if (!block?.[1]) throw new Error(`${spec}: no badResponses assertion found`);
  return [...block[1].matchAll(/^\s*'([^']+)',\s*$/gm)].map((match) => match[1] ?? '');
}

const fixHint = (spec: string): string =>
  `the boot's failed fetches (received) vs the badResponses list in e2e/${spec} ` +
  '(expected): a new panel poll the fixture leaves unwired is listed in BOTH smoke specs';

let server: Server | null = null;
let base = '';

/** Boots the shell at `path` and returns every 4xx/5xx its boot drew, as the
 *  smoke specs record them. A self-init's `setInterval` re-poll never fires:
 *  the specs judge the first paint, and a repeat would only be timing. */
async function bootFailures(path: string, project?: string): Promise<string[]> {
  const failures: string[] = [];
  const pending: Promise<unknown>[] = [];
  const { window } = new JSDOM(renderShell(project), {
    url: `${base}${path}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  window.fetch = (input: string, init?: RequestInit): Promise<Response> => {
    const target = String(input);
    const reply = fetch(new URL(target, base), init).then((res) => {
      if (res.status >= 400) failures.push(`${res.status} ${new URL(res.url).pathname}`);
      return res;
    });
    pending.push(reply.catch(() => undefined));
    return reply;
  };
  window.setInterval = (): number => 0;
  try {
    window.eval(clientJs());
    // Settle the boot and every request a reply chains (a short timer
    // included) before judging, exactly once per request.
    while (pending.length > 0) {
      await Promise.all(pending.splice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    window.close();
  }
  return failures.sort();
}

describe('the e2e smoke specs list every 404 the boot draws', () => {
  beforeAll(async () => {
    server = createServer({ readState: () => buildFleetView(Date.now(), []) });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.close();
    server = null;
  });

  it('reads a non-empty list from each spec', () => {
    expect(listedBadResponses('dashboard.spec.ts').length).toBeGreaterThan(0);
    expect(listedBadResponses('project-page.spec.ts').length).toBeGreaterThan(0);
  });

  it('dashboard.spec.ts names exactly what the fleet root fails to fetch', async () => {
    expect(await bootFailures('/'), fixHint('dashboard.spec.ts')).toEqual(
      listedBadResponses('dashboard.spec.ts'),
    );
  });

  it('project-page.spec.ts names exactly what /p/:id fails to fetch', async () => {
    const id = 'e2e-no-such-project';
    expect(await bootFailures(`/p/${id}`, id), fixHint('project-page.spec.ts')).toEqual(
      listedBadResponses('project-page.spec.ts'),
    );
  });
});
