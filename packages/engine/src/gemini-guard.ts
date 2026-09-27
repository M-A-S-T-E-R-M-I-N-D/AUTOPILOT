// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The containment guard for the Gemini CLI (epic 0036). `ClaudeCliModel` gets
 * its tool-level guard from a `--settings` PreToolUse hook
 * (`buildFlightSettings`); `GeminiCliModel` runs under `--approval-mode yolo`,
 * where nothing stops its shell tool running `git push --force` or reaching
 * outside the worktree. Gemini has the same kind of hook, a `BeforeTool`
 * command hook fed the tool call as JSON on stdin, so ONE `guard-hook.js`
 * serves both CLIs: this file turns a Gemini tool call into the Claude-shaped
 * payloads `evaluateHookInput` already judges, and a Claude deny back into
 * Gemini's `{"decision":"deny","reason":…}`.
 *
 * The contract, read from google-gemini/gemini-cli source on 2026-09-27:
 * - `packages/core/src/hooks/types.ts`: `BeforeToolInput` carries
 *   `hook_event_name: 'BeforeTool'`, `tool_name` and `tool_input`; a
 *   `decision` of `deny` (or `block`) stops the tool and `reason` reaches the model.
 * - `packages/core/src/hooks/hookRunner.ts`: stdout is parsed as JSON, and a
 *   command hook's `timeout` is in MILLISECONDS (Claude's is seconds).
 * - `packages/core/src/hooks/hookPlanner.ts`: `matcher` is an unanchored
 *   `RegExp.test` over the tool name, so the one below is anchored.
 * - `packages/core/src/tools/definitions/base-declarations.ts`: tool and
 *   parameter names.
 * - `packages/cli/src/config/settings.ts`: `GEMINI_CLI_SYSTEM_SETTINGS_PATH`
 *   names the system settings file, which merges LAST (over user and workspace),
 *   so a repo's own `.gemini/settings.json` cannot switch the hook off.
 *
 * Gemini already confines its file tools and the shell's `dir_path` to the
 * workspace (`validatePathAccess`, `packages/core/src/tools/shell.ts`). The gap
 * this closes is the shell COMMAND text, which `yolo` runs unchecked. The file
 * tools and `dir_path` are judged too, for read hygiene and as a second line
 * behind Gemini's own checks.
 */

import { guardHookCommand, GUARD_TIMEOUT_S } from './guard.js';

/** The Gemini tools the guard judges, including `grep_search`'s legacy alias. */
export const GEMINI_GUARDED_TOOLS = [
  'run_shell_command',
  'read_file',
  'write_file',
  'replace',
  'glob',
  'grep_search',
  'search_file_content',
  'list_directory',
  'read_many_files',
  'web_fetch',
] as const;

/** The hook's `name`, which is how Gemini lists it (and `hooksConfig.disabled` names it). */
export const GEMINI_GUARD_HOOK_NAME = 'autopilot-containment-guard';

/**
 * The URLs `web_fetch` would fetch from its free-text `prompt`, by the tool's
 * own rule (`parsePrompt`, gemini-cli `packages/core/src/tools/web-fetch.ts`):
 * whitespace-split tokens holding `://` that parse as http(s). A token the tool
 * would refuse (schemeless, another scheme) it never fetches, so it is not judged.
 */
function urlsInPrompt(prompt: string): string[] {
  return prompt.split(/\s+/).filter((token) => {
    if (!token.includes('://')) return false;
    try {
      const { protocol } = new URL(token);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  });
}

/** The command the shell tool runs, as run from its `dir_path` when it names one. */
function shellCommand(input: Record<string, unknown>): unknown {
  const command = input['command'];
  const dir = input['dir_path'];
  return typeof command === 'string' && typeof dir === 'string' && dir.length > 0
    ? `cd "${dir}" && ${command}`
    : command;
}

interface ClaudePayload {
  readonly tool_name: string;
  readonly tool_input: Record<string, unknown>;
}

function recordOrNull(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** The Claude tool calls one Gemini tool call amounts to; none for a tool the guard does not judge. */
function toClaudePayloads(toolName: unknown, input: Record<string, unknown>): ClaudePayload[] {
  switch (toolName) {
    case 'run_shell_command':
      return [{ tool_name: 'Bash', tool_input: { command: shellCommand(input) } }];
    case 'read_file':
      return [{ tool_name: 'Read', tool_input: { file_path: input['file_path'] } }];
    case 'write_file':
      return [{ tool_name: 'Write', tool_input: { file_path: input['file_path'] } }];
    case 'replace':
      return [{ tool_name: 'Edit', tool_input: { file_path: input['file_path'] } }];
    case 'glob':
      return [
        { tool_name: 'Glob', tool_input: { pattern: input['pattern'], path: input['dir_path'] } },
      ];
    case 'grep_search':
    case 'search_file_content':
      return [
        { tool_name: 'Grep', tool_input: { pattern: input['pattern'], path: input['dir_path'] } },
      ];
    case 'list_directory':
      return [{ tool_name: 'Glob', tool_input: { path: input['dir_path'] } }];
    case 'read_many_files': {
      const include: unknown[] = Array.isArray(input['include']) ? input['include'] : [];
      return include
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => ({ tool_name: 'Read', tool_input: { file_path: entry } }));
    }
    case 'web_fetch': {
      const prompt = input['prompt'];
      if (typeof prompt !== 'string') return [];
      return urlsInPrompt(prompt).map((url) => ({ tool_name: 'WebFetch', tool_input: { url } }));
    }
    default:
      return [];
  }
}

/**
 * The Claude-shaped PreToolUse payloads (raw JSON) one Gemini `BeforeTool`
 * call amounts to, or `null` when `raw` is not a Gemini BeforeTool payload (a
 * Claude one, or malformed): the dialect test `guard-hook.ts` branches on. A
 * tool the guard does not judge (MCP tools, memory, todos) yields none, which
 * is no decision, the same as a tool Claude's matchers leave out.
 */
export function geminiToClaudeHookPayloads(raw: string): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const input = recordOrNull(parsed);
  if (input?.['hook_event_name'] !== 'BeforeTool') return null;
  const toolInput = recordOrNull(input['tool_input']) ?? {};
  return toClaudePayloads(input['tool_name'], toolInput).map((payload) => JSON.stringify(payload));
}

/**
 * Gemini's deny for a Claude deny decision (`buildDenyDecision`'s JSON): the
 * same reason, in the `decision`/`reason` shape Gemini's hook runner reads.
 * Text that is not a Claude decision becomes the reason itself, so a deny is
 * never lost in translation.
 */
export function toGeminiDenyDecision(claudeDecision: string): string {
  let reason: unknown;
  try {
    const output = recordOrNull(recordOrNull(JSON.parse(claudeDecision))?.['hookSpecificOutput']);
    reason = output?.['permissionDecisionReason'];
  } catch {
    reason = undefined;
  }
  return JSON.stringify({
    decision: 'deny',
    reason: typeof reason === 'string' ? reason : claudeDecision,
  });
}

/** The generated Gemini settings payload (the hooks part of its `settings.json` schema). */
export interface GeminiFlightSettings {
  readonly hooksConfig: { readonly enabled: true };
  readonly hooks: {
    readonly BeforeTool: readonly {
      readonly matcher: string;
      readonly hooks: readonly {
        readonly type: 'command';
        readonly name: string;
        readonly command: string;
        readonly timeout: number;
      }[];
    }[];
  };
}

/**
 * The settings a Gemini flight's `GEMINI_CLI_SYSTEM_SETTINGS_PATH` names: one
 * `BeforeTool` hook over {@link GEMINI_GUARDED_TOOLS} that runs the same guard
 * command `buildFlightSettings` gives Claude, and `hooksConfig.enabled` set
 * here, where it outranks a user or workspace file that turns hooks off.
 */
export function buildGeminiFlightSettings(
  targetRoot: string,
  guardScriptPath: string,
): GeminiFlightSettings {
  return {
    hooksConfig: { enabled: true },
    hooks: {
      BeforeTool: [
        {
          matcher: `^(?:${GEMINI_GUARDED_TOOLS.join('|')})$`,
          hooks: [
            {
              type: 'command',
              name: GEMINI_GUARD_HOOK_NAME,
              command: guardHookCommand(targetRoot, guardScriptPath),
              timeout: GUARD_TIMEOUT_S * 1000,
            },
          ],
        },
      ],
    },
  };
}
