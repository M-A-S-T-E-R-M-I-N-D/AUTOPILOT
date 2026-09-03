// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import { directCommand } from '../manifests.js';

/**
 * Rust gate detector. `Cargo.toml` is the signal. `cargo check` is the fast
 * typecheck; a `[workspace]` manifest adds `--workspace` so the whole tree gates.
 */
export const rustDetector: EcosystemDetector = {
  id: 'rust',
  detect(snap) {
    const cargo = snap.read('Cargo.toml');
    if (cargo === null) return null;

    const workspace = cargo.includes('[workspace]') ? ['--workspace'] : [];
    const gate: MutableGateCommands = {
      typecheck: directCommand('cargo', ['check', ...workspace]),
      test: directCommand('cargo', ['test', ...workspace]),
      build: directCommand('cargo', ['build', ...workspace]),
      lint: directCommand('cargo', ['clippy', ...workspace]),
    };
    const evidence = workspace.length > 0 ? ['Cargo.toml', 'workspace'] : ['Cargo.toml'];
    const score = Object.keys(gate).length + 1;
    return { gate, score, evidence };
  },
};
