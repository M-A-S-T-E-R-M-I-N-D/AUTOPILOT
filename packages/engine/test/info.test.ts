// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { engineInfo, ENGINE_PHASES, ENGINE_VERSION } from '../src/info.js';

describe('engineInfo', () => {
  it('reports the engine identity and version', () => {
    const info = engineInfo();
    expect(info.name).toBe('@autopilot/engine');
    expect(info.version).toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toBe('0.1.0');
  });

  it('exposes the fixed 5-node phase rail in order', () => {
    expect(engineInfo().phases).toEqual(['ORIENT', 'PICK', 'DO', 'GATE', 'COMMIT']);
    expect(ENGINE_PHASES).toHaveLength(5);
  });
});
