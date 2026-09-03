// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import { directCommand } from '../manifests.js';

/** Manifest markers owned by other detectors — their presence means an HTML
 *  file belongs to a real JS/Python/Go/Rust project (e.g. templates or a
 *  built `dist/`), not a bare static site. */
const OTHER_ECOSYSTEM_MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
] as const;

/**
 * Static-site gate detector. Claims a repo that ships `.html`/`.htm` pages
 * but no manifest for any other ecosystem — plain HTML/CSS/JS with no build
 * tooling. Commands run through `npx` directly (not the package-manager
 * `scripts.*` path `js.ts` uses) since a repo this detector claims has no
 * `package.json` to hang a script off of; `--yes` lets npx fetch the tool on
 * first run instead of requiring a pre-existing local install.
 */
export const staticSiteDetector: EcosystemDetector = {
  id: 'static-site',
  detect(snap) {
    if (!snap.hasSuffix('.html', '.htm')) return null;
    if (OTHER_ECOSYSTEM_MANIFESTS.some((marker) => snap.has(marker))) return null;

    const evidence: string[] = ['*.html'];
    const gate: MutableGateCommands = {
      lint: directCommand('npx', ['--yes', 'html-validate', '.']),
      test: directCommand('npx', ['--yes', 'linkinator', '.', '--recurse']),
    };
    evidence.push('html-validate', 'linkinator');

    const score = Object.keys(gate).length;
    return { gate, score, evidence };
  },
};
