// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0019 S3 per project, the PREVIEW half (board ap-muhqoogl-0), over
 * HTTP. A gated preview refuses a checkout of another repository by throwing
 * `MirrorPassRepoMismatchError`; each of the five preview routes keeps its
 * existing degrade-to-null body and adds why, so the panel can say "this
 * project is not the repository gh acts on" instead of "nothing to
 * reconcile". Any other failure degrades exactly as before.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createServer, type ServerDeps } from '../../src/server/server.js';
import { MirrorPassRepoMismatchError } from '../../src/flight/mirror-pass-execute.js';

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function start(deps: ServerDeps): Promise<string> {
  server = createServer(deps);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

const refuse = async (): Promise<never> => {
  throw new MirrorPassRepoMismatchError('someone-else/their-project', 'octocat/hello-world');
};

const fail = async (): Promise<never> => {
  throw new Error('gh exploded');
};

const ROUTES = [
  ['/api/mirror-pass', 'mirrorPass', 'mirrorPass'],
  ['/api/mirror-pass/landing-note', 'mirrorPassLandingNote', 'landingNote'],
  ['/api/mirror-pass/drift', 'mirrorPassDrift', 'drift'],
  ['/api/mirror-pass/stale-claims', 'mirrorPassStaleClaim', 'staleClaims'],
  ['/api/mirror-pass/priority-follow', 'mirrorPassPriorityFollow', 'priorityFollow'],
] as const;

describe('the mirror-pass preview routes say why a checkout of another repo was refused (epic 0019 S3 per project)', () => {
  it.each(ROUTES)(
    'GET %s keeps its null body and names both repositories',
    async (path, dep, key) => {
      const base = await start({ [dep]: refuse } as ServerDeps);

      const res = await fetch(`${base}${path}?project=p1`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        [key]: null,
        skippedReason: 'repo-mismatch',
        projectRepo: 'someone-else/their-project',
        ghRepo: 'octocat/hello-world',
      });
    },
  );

  it.each(ROUTES)(
    'GET %s still degrades any other failure to the bare null body',
    async (path, dep, key) => {
      const base = await start({ [dep]: fail } as ServerDeps);

      const res = await fetch(`${base}${path}?project=p1`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ [key]: null });
    },
  );
});
