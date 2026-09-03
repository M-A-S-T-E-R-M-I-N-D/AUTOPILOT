// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export const MCP_VERSION = '0.1.0';

/**
 * Read-only retrieval tools planned for the knowledge MCP server (REACTIVITY
 * §1.1, MDVIEWER §3) — distinct from the already-shipped CONTROL server
 * (`control.ts`'s `createControlServer`), whose task/project tools include
 * write and destructive actions. This descriptor scopes to the retrieval side
 * only, which is why {@link mcpInfo} reports `readOnly: true`.
 */
export const MCP_TOOLS = ['list', 'read', 'search', 'annotations', 'recent-changes'] as const;
export type McpTool = (typeof MCP_TOOLS)[number];

export interface McpInfo {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly McpTool[];
  readonly readOnly: true;
}

/**
 * Static capability descriptor for the read-only retrieval server. The control
 * server has since shipped (`control.ts`); the retrieval server this describes
 * is still forthcoming, so this stays a plain descriptor with no live transport.
 */
export function mcpInfo(): McpInfo {
  return {
    name: '@autopilot/mcp',
    version: MCP_VERSION,
    tools: MCP_TOOLS,
    readOnly: true,
  };
}
