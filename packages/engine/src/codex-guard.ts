// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The containment guard for a Codex CLI `apply_patch` (epic 0036). A Codex
 * shell call reaches `guard-hook.js` as the Claude `Bash` payload it already
 * judges; a file edit reaches it as `apply_patch` with the whole patch as its
 * `command`, naming no path the guard can read. This file reads the files a
 * patch names, by Codex's own header rules, and turns each into the Claude
 * `Write`/`Edit` payload `evaluateHookInput` already judges for containment.
 * A Claude deny is a Codex deny, so the decision goes back unchanged.
 *
 * The contract, read from openai/codex source on 2026-10-02:
 * - `core/src/tools/hook_names.rs`: the hook payload's `tool_name` is
 *   `apply_patch`, and `core/src/tools/handlers/apply_patch.rs`
 *   (`pre_tool_use_payload`) sends `tool_input` as `{"command": <patch>}`. The
 *   handler takes only that freeform form, so every patch passes the hook.
 * - `apply-patch/src/streaming_parser.rs`: lines split on `\n`; a header is
 *   read from the line trimmed whole (`str::trim`), but inside an Update hunk
 *   from the line trimmed at its end only, so an indented header there is a
 *   context line. `*** Move to: ` is read only inside an Update hunk.
 * - The handler resolves every path against the turn's cwd, which the hook
 *   payload carries as `cwd` (`hooks/schema/generated/pre-tool-use.command.input.schema.json`).
 *
 * The workspace-write sandbox already confines a patch's writes where Codex
 * has a sandbox; this is the same second line Gemini's file tools get. Like
 * every path check in `guard.ts` it is textual: a symlink inside the target
 * that points out of it is not followed.
 */

import { posix, win32 } from 'node:path';

const BEGIN_PATCH = '*** Begin Patch';
const END_PATCH = '*** End Patch';
const MOVE_TO = '*** Move to: ';

/** Each file header, and the Claude tool the file operation amounts to. */
const FILE_HEADERS = [
  { marker: '*** Add File: ', tool: 'Write' },
  { marker: '*** Delete File: ', tool: 'Edit' },
  { marker: '*** Update File: ', tool: 'Edit' },
] as const;

/**
 * Rust's `char::is_whitespace` (Unicode White_Space), what `str::trim` strips,
 * as UTF-16 code units: every one is a single unit. JavaScript's `trim` leaves
 * NEL (0x85) on, so a NEL-led header Codex reads would slip past it.
 */
const RUST_WS_CODES = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

function isRustWhitespace(code: number): boolean {
  return RUST_WS_CODES.has(code) || (code >= 0x2000 && code <= 0x200a);
}

/**
 * `str::trim_end`, as a scan rather than a `[…]+$` regex, which backtracks
 * quadratically over a long blank run that does not end the line: a patch
 * built to stall the hook past its timeout.
 */
function trimEnd(line: string): string {
  let end = line.length;
  while (end > 0 && isRustWhitespace(line.charCodeAt(end - 1))) end -= 1;
  return line.slice(0, end);
}

function trim(line: string): string {
  const kept = trimEnd(line);
  let start = 0;
  while (start < kept.length && isRustWhitespace(kept.charCodeAt(start))) start += 1;
  return kept.slice(start);
}

/** One file a patch adds, deletes, updates or moves to, as the Claude tool that amounts to. */
export interface CodexPatchPath {
  readonly tool: 'Write' | 'Edit';
  readonly path: string;
}

/**
 * Every file `patch` names, in order: each Add, Delete and Update header, and
 * an Update hunk's Move to. Lines before `*** Begin Patch` are skipped, so a
 * heredoc wrapper adds nothing; lines after `*** End Patch` are read again
 * from the next `*** Begin Patch`, a patch Codex itself refuses, since reading
 * too much here can only deny.
 */
export function codexPatchPaths(patch: string): CodexPatchPath[] {
  const found: CodexPatchPath[] = [];
  let mode: 'outside' | 'patch' | 'update' = 'outside';
  for (const line of patch.split('\n')) {
    if (mode === 'outside') {
      if (trim(line) === BEGIN_PATCH) mode = 'patch';
      continue;
    }
    const header: string = mode === 'update' ? trimEnd(line) : trim(line);
    if (header === END_PATCH) {
      mode = 'outside';
      continue;
    }
    const file = FILE_HEADERS.find(({ marker }) => header.startsWith(marker));
    if (file !== undefined) {
      found.push({ tool: file.tool, path: header.slice(file.marker.length) });
      mode = file.marker === '*** Update File: ' ? 'update' : 'patch';
    } else if (mode === 'update' && header.startsWith(MOVE_TO)) {
      found.push({ tool: 'Write', path: header.slice(MOVE_TO.length) });
    }
  }
  return found;
}

function recordOrNull(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isWindowsAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);
}

/** `p` resolved against `cwd` by the path rules of the platform `cwd` is written for. */
function resolveAgainst(cwd: string, p: string): string {
  return (isWindowsAbsolute(cwd) ? win32 : posix).resolve(cwd, p);
}

/**
 * The Claude-shaped PreToolUse payloads (raw JSON) one Codex `apply_patch`
 * call amounts to, one `Write` or `Edit` per file it names, each path resolved
 * against the turn's `cwd` (or `targetRoot` when the payload carries no
 * absolute one), so a `../` escape is judged where it lands. `null` when `raw`
 * is not a Codex `apply_patch` payload: a Claude or Codex `Bash` call is judged
 * as it stands. No patch text yields no payloads, and so no decision.
 */
export function codexPatchToClaudeHookPayloads(
  raw: string,
  targetRoot: string,
): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const input = recordOrNull(parsed);
  if (input?.['hook_event_name'] !== 'PreToolUse' || input['tool_name'] !== 'apply_patch') {
    return null;
  }
  const patch = recordOrNull(input['tool_input'])?.['command'];
  if (typeof patch !== 'string') return [];
  const payloadCwd = input['cwd'];
  const cwd =
    typeof payloadCwd === 'string' && (isWindowsAbsolute(payloadCwd) || payloadCwd.startsWith('/'))
      ? payloadCwd
      : targetRoot;
  return codexPatchPaths(patch).map(({ tool, path }) =>
    JSON.stringify({ tool_name: tool, tool_input: { file_path: resolveAgainst(cwd, path) } }),
  );
}
