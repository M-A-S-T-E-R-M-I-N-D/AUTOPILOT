// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the RELEASE panel's guest note (`web/release-
 * panel.ts`'s `releaseGuestNote`) — epic 0019 law 1 ("role honesty")
 * extended to the UI, board web-mtt3f7j6-3bj899: a confirmed non-owner of
 * the repo sees this text in place of the EXECUTE button.
 */

import { describe, it, expect } from 'vitest';
import { releaseGuestNote } from '../../src/web/release-panel.js';

describe('releaseGuestNote', () => {
  it('names the repo owner and the signed-in login', () => {
    const note = releaseGuestNote({
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });

    expect(note).toBe(
      'Releases on this repo are cut by its maintainer (octocat) — you are signed in as a-contributor.',
    );
  });
});
