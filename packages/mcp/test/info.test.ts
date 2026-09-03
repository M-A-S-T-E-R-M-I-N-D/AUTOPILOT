// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mcpInfo, MCP_TOOLS, MCP_VERSION } from '../src/info.js';

describe('mcpInfo', () => {
  it('reports the package name and version', () => {
    const info = mcpInfo();
    expect(info.name).toBe('@autopilot/mcp');
    expect(info.version).toBe('0.1.0');
    expect(info.version).toBe(MCP_VERSION);
  });

  it('is read-only and exposes the retrieval tool set', () => {
    const info = mcpInfo();
    expect(info.readOnly).toBe(true);
    expect(info.tools).toEqual(MCP_TOOLS);
  });

  it('exposes exactly the five retrieval tools, in order', () => {
    expect(MCP_TOOLS).toEqual(['list', 'read', 'search', 'annotations', 'recent-changes']);
  });
});
