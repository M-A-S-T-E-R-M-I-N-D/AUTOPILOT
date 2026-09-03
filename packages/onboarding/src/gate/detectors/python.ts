// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { EcosystemDetector, MutableGateCommands } from '../types.js';
import { tomlHasSection, directCommand } from '../manifests.js';

/**
 * Python gate detector. Recognises a repo by a manifest (pyproject/setup) or the
 * presence of `.py` files, then maps common tools (pytest / ruff|flake8 / mypy).
 * Tools are proposed as direct invocations; the operator can adjust per SOUL.
 */
export const pythonDetector: EcosystemDetector = {
  id: 'python',
  detect(snap) {
    const pyproject = snap.read('pyproject.toml');
    const hasManifest =
      pyproject !== null ||
      snap.has('setup.py') ||
      snap.has('setup.cfg') ||
      snap.has('requirements.txt');
    if (!hasManifest && !snap.hasSuffix('.py')) return null;

    const evidence: string[] = [];
    if (pyproject !== null) evidence.push('pyproject.toml');
    else if (snap.has('setup.py')) evidence.push('setup.py');
    else if (snap.has('setup.cfg')) evidence.push('setup.cfg');
    else if (snap.has('requirements.txt')) evidence.push('requirements.txt');

    const gate: MutableGateCommands = {};

    const hasPytest =
      snap.has('pytest.ini') ||
      snap.has('tox.ini') ||
      tomlHasSection(pyproject, 'tool.pytest') ||
      snap.hasGlob('test_*.py') ||
      snap.hasGlob('*_test.py');
    if (hasPytest) {
      gate.test = directCommand('pytest', []);
      evidence.push('pytest');
    }

    if (snap.has('mypy.ini') || tomlHasSection(pyproject, 'tool.mypy')) {
      gate.typecheck = directCommand('mypy', ['.']);
      evidence.push('mypy');
    }

    if (snap.has('ruff.toml') || snap.has('.ruff.toml') || tomlHasSection(pyproject, 'tool.ruff')) {
      gate.lint = directCommand('ruff', ['check', '.']);
      evidence.push('ruff');
    } else if (snap.has('.flake8') || tomlHasSection(pyproject, 'tool.flake8')) {
      gate.lint = directCommand('flake8', []);
      evidence.push('flake8');
    }

    const detected = Object.keys(gate).length;
    const score = detected + (hasManifest ? 1 : 0);
    return { gate, score, evidence };
  },
};
