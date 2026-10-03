// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import { directCommand } from '../manifests.js';

/**
 * Static-site gate detector: plain HTML/CSS/JS with no package manager
 * (`samples/README.md`'s documented gap — folder-triage already treats
 * `.html`/`.css` as the dominant extension, but no detector recognised it).
 * A `package.json` means some other ecosystem already owns the repo, so this
 * detector defers rather than doubling up. Tools run via `npx --yes` (not the
 * `--no-install` idiom the `js` detector uses) because there is no local
 * install to reuse — the site has no build tooling by definition.
 *
 * html-validate gets one pattern per extension the detector matches on: it
 * exits 1 only when its patterns together match no file, so an `.html`-only
 * glob failed every `.htm`-only site's gate and skipped a mixed site's `.htm`
 * pages, while a pattern that matches nothing beside one that does is fine.
 */
const PAGE_PATTERNS = ['**/*.html', '**/*.htm'];

export const staticSiteDetector: EcosystemDetector = {
  id: 'static-site',
  detect(snap) {
    if (snap.has('package.json')) return null;
    if (!snap.hasSuffix('.html', '.htm')) return null;

    const evidence: string[] = ['*.html'];
    const gate: MutableGateCommands = {
      lint: directCommand('npx', ['--yes', 'html-validate', ...PAGE_PATTERNS]),
      test: directCommand('npx', ['--yes', 'linkinator', '.', '--recurse']),
    };
    evidence.push('html-validate', 'linkinator');

    const hasIndex = snap.has('index.html');
    if (hasIndex) evidence.push('index.html');

    const score = Object.keys(gate).length + (hasIndex ? 1 : 0);
    return { gate, score, evidence };
  },
};
