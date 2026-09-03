// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import { directCommand } from '../manifests.js';

/**
 * Go gate detector. `go.mod` is the strong signal. `go build` doubles as the
 * typecheck; `go vet` is the default lint unless golangci-lint is configured.
 */
export const goDetector: EcosystemDetector = {
  id: 'go',
  detect(snap) {
    if (!snap.has('go.mod')) return null;

    const evidence = ['go.mod'];
    const gate: MutableGateCommands = {
      test: directCommand('go', ['test', './...']),
      build: directCommand('go', ['build', './...']),
    };

    if (snap.hasGlob('.golangci.*')) {
      gate.lint = directCommand('golangci-lint', ['run']);
      evidence.push('golangci-lint');
    } else {
      gate.lint = directCommand('go', ['vet', './...']);
      evidence.push('go vet');
    }

    const score = Object.keys(gate).length + 1;
    return { gate, score, evidence };
  },
};
