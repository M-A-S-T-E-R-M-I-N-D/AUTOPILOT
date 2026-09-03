// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Parse Claude Code's `--output-format stream-json` NDJSON into a live activity
 * timeline (MASTER-PLAN §5.2 activity map; REACTIVITY §4 live-stream). Each line
 * is one event: `assistant` (with `tool_use` blocks — the actions), `user`
 * (`tool_result` — outcomes), or `result` (the final cost/token envelope). This
 * module is pure — it turns lines into typed activities; the streaming spawn +
 * sink live in the adapter. Field names are read defensively (`command` for Bash,
 * `file_path`/`path` for file tools, `pattern` for search) so a tool-schema tweak
 * degrades to a best-effort target rather than breaking.
 */

export interface Activity {
  /** Tool name — Bash / Read / Write / Edit / Grep / … */
  readonly tool: string;
  /** The command, file path, or query the tool acted on (already truncated). */
  readonly target: string;
  readonly kind: 'command' | 'file' | 'search' | 'other';
  /** Bounded excerpt of the assistant message's stated reasoning (the `text`
   *  blocks alongside this tool call, in the SAME message) — the WHY before the
   *  action. Null when the message carried no text (a bare tool call). */
  readonly reasoning: string | null;
  /** The model that produced this step (`message.model` on the SAME assistant
   *  event), or null when the envelope carried none — MICRO-ACTION TELEMETRY:
   *  an honest per-turn cost approximation instead of only a per-firing total. */
  readonly model: string | null;
  /** `message.usage.input_tokens` for the SAME assistant event, or null when absent. */
  readonly tokensIn: number | null;
  /** `message.usage.output_tokens` for the SAME assistant event, or null when absent. */
  readonly tokensOut: number | null;
}

const TARGET_MAX = 160;
const REASONING_MAX = 240;

function truncate(value: string, max: number = TARGET_MAX): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Join every `text` block in an assistant message's content into one bounded
 *  excerpt, or null when the message carried no non-empty text (a bare tool
 *  call with no stated reasoning). */
function textExcerpt(content: readonly unknown[]): string | null {
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as Record<string, unknown>)['type'] === 'text'
    ) {
      const text = str((block as Record<string, unknown>)['text']);
      if (text !== null && text.trim().length > 0) parts.push(text);
    }
  }
  if (parts.length === 0) return null;
  return truncate(parts.join(' '), REASONING_MAX);
}

/** Parse one NDJSON line into a plain object, or null if it isn't JSON. */
export function parseStreamLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    // The `{` guard above means a successful parse can only ever yield a JSON
    // object per the JSON grammar (RFC 8259 §3) — no further type/null check
    // is reachable, so none is made.
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numOrNull(value: unknown): number | null {
  // Number.isFinite (unlike the global isFinite) never coerces — it already
  // returns false for every non-number Type, so a preceding `typeof value
  // === 'number'` check would be unreachable dead code.
  const asNumber = value as number;
  return Number.isFinite(asNumber) ? asNumber : null;
}

/** Per-message model + token usage, shared by every tool call in one assistant
 *  event (verified wire format: `message.model`, `message.usage.input_tokens` /
 *  `output_tokens` — same place `content` lives, read just as defensively). */
export interface MessageUsage {
  readonly model: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

function usageFromContainer(container: Record<string, unknown>): MessageUsage {
  const model = str(container['model']);
  const usage = container['usage'];
  if (usage === null || typeof usage !== 'object') {
    return { model, tokensIn: null, tokensOut: null };
  }
  const u = usage as Record<string, unknown>;
  return {
    model,
    tokensIn: numOrNull(u['input_tokens']),
    tokensOut: numOrNull(u['output_tokens']),
  };
}

function toActivity(
  name: string,
  input: Record<string, unknown>,
  reasoning: string | null,
  usage: MessageUsage,
): Activity {
  const command = str(input['command']);
  if (command !== null)
    return { tool: name, target: truncate(command), kind: 'command', reasoning, ...usage };

  const file = str(input['file_path']) ?? str(input['path']) ?? str(input['notebook_path']);
  if (file !== null)
    return { tool: name, target: truncate(file), kind: 'file', reasoning, ...usage };

  const query = str(input['pattern']) ?? str(input['query']);
  if (query !== null)
    return { tool: name, target: truncate(query), kind: 'search', reasoning, ...usage };

  // Agent/Task tool calls carry no command/path/pattern — their input is a
  // subagent brief (`description`, `prompt`, `subagent_type`). The short
  // `description` is the best one-line label; without this the activity
  // rendered with an empty target ("Using Agent" with nothing after it).
  const description = str(input['description']);
  if (description !== null)
    return { tool: name, target: truncate(description), kind: 'other', reasoning, ...usage };

  return { tool: name, target: '', kind: 'other', reasoning, ...usage };
}

/**
 * Extract the tool-use activities from one stream event (an `assistant` message).
 * Non-assistant events, or events with no tool uses, yield an empty list.
 */
export function activitiesFromEvent(event: Record<string, unknown>): Activity[] {
  if (event['type'] !== 'assistant') return [];
  const message = event['message'];
  const container =
    message && typeof message === 'object' ? (message as Record<string, unknown>) : event;
  const content = container['content'];
  if (!Array.isArray(content)) return [];

  const reasoning = textExcerpt(content);
  const usage = usageFromContainer(container);
  const activities: Activity[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as Record<string, unknown>)['type'] === 'tool_use'
    ) {
      const b = block as Record<string, unknown>;
      const name = str(b['name']);
      const input = b['input'];
      if (name !== null) {
        activities.push(
          toActivity(name, (input as Record<string, unknown>) ?? {}, reasoning, usage),
        );
      }
    }
  }
  return activities;
}

/** Whether a stream event is the terminal `result` (carries the final envelope). */
export function isResultEvent(event: Record<string, unknown>): boolean {
  return event['type'] === 'result';
}

/**
 * The exact prefixes `guard.ts`'s `evaluateHookInput` puts on every deny
 * reason it hands back to the model (`CONTAINMENT: …` for the Bash/path
 * checks, `READ HYGIENE: …` for the generated/vendored-output check) — see
 * `packages/engine/src/guard.ts`'s two `deny(...)` call sites. Matched here,
 * not guessed: a PreToolUse deny is "shown to Claude" as that tool's own
 * `tool_result`, per Claude Code's hooks reference, so the reason text is
 * already flowing through this same wire format with no hook-side change
 * needed — the "guard-denial chip" gap (board web-msnqqjmd-9bx0wd) is a
 * parsing gap on an existing signal, not a missing one.
 */
const GUARD_DENIAL_PREFIXES = ['CONTAINMENT:', 'READ HYGIENE:'];

/** A `tool_result` content field is either a plain string or an array of
 *  content blocks (Anthropic API's documented tool-result shape) — joins the
 *  `text` blocks the same defensive way {@link textExcerpt} does for an
 *  assistant message's `content`. */
function toolResultText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  return textExcerpt(content);
}

function isGuardDenialText(text: string): boolean {
  return GUARD_DENIAL_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * One structured guard denial parsed off the wire (GUARD-DENIAL telemetry,
 * board web-msr0ug27-hj1w27) — exactly the events-row payload shape the
 * anomalies panel and activity log need (`type` + `target`); the firing id is
 * the recorder's to attach at insert time, since only it knows which firing
 * the stream belongs to.
 */
export interface GuardDenialDetail {
  /** Which guard said no: `guard.ts`'s CONTAINMENT or READ HYGIENE deny path. */
  readonly kind: 'containment' | 'read-hygiene';
  /**
   * The denial's specific reason/target — the deny text with `guard.ts`'s
   * fixed boilerplate (prefix, "confined to <root> — " lead-in, closing
   * instruction sentence) stripped, so an events row carries "Read of a path
   * outside the target repo: /etc/passwd." rather than the whole lecture.
   * Length-capped; never empty (falls back to the raw prefix-stripped text).
   */
  readonly target: string;
}

// Guard-denial boilerplate — must mirror `guard.ts`'s two deny text shapes
// (`CONTAINMENT: this flight is confined to <root> — <reason>. Work only
// inside the target repository.` / `READ HYGIENE: <reason>. Consult the repo
// source or official docs.`), same matched-not-guessed contract as
// GUARD_DENIAL_PREFIXES above.
const CONTAINMENT_LEAD_IN = ' — ';
const CONTAINMENT_SUFFIX = ' Work only inside the target repository.';
const READ_HYGIENE_SUFFIX = ' Consult the repo source or official docs.';
const MAX_DENIAL_TARGET_CHARS = 300;

/** Strip one guard deny text down to its reason/target portion (defensive:
 *  an unexpected shape degrades to the prefix-stripped whole text, never ''). */
function denialTarget(kind: GuardDenialDetail['kind'], text: string): string {
  let rest =
    kind === 'containment' ? text.slice('CONTAINMENT:'.length) : text.slice('READ HYGIENE:'.length);
  const suffix = kind === 'containment' ? CONTAINMENT_SUFFIX : READ_HYGIENE_SUFFIX;
  if (rest.endsWith(suffix)) rest = rest.slice(0, -suffix.length);
  if (kind === 'containment') {
    // Drop the "this flight is confined to <root>" lead-in when present — the
    // first em-dash separator is guard.ts's own (the lead-in itself is fixed
    // text with no em-dash), so anything after it is the real reason.
    const sep = rest.indexOf(CONTAINMENT_LEAD_IN);
    if (sep !== -1) rest = rest.slice(sep + CONTAINMENT_LEAD_IN.length);
  }
  const trimmed = rest.trim();
  return (trimmed.length > 0 ? trimmed : text).slice(0, MAX_DENIAL_TARGET_CHARS);
}

/**
 * Structured guard denials in one `user` event (a `tool_result` block whose
 * `is_error` is true and whose text starts with a known guard-deny prefix),
 * in wire order. Non-`user` events, or a `user` event with no denial among
 * its blocks, yield [] — a caller concatenates across a firing's stream to
 * build its events rows.
 */
export function guardDenialDetailsFromEvent(
  event: Record<string, unknown>,
): readonly GuardDenialDetail[] {
  if (event['type'] !== 'user') return [];
  const message = event['message'];
  const container =
    message && typeof message === 'object' ? (message as Record<string, unknown>) : event;
  const content = container['content'];
  if (!Array.isArray(content)) return [];

  const details: GuardDenialDetail[] = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b['type'] !== 'tool_result' || b['is_error'] !== true) continue;
    const text = toolResultText(b['content']);
    if (text === null || !isGuardDenialText(text)) continue;
    const kind = text.startsWith('CONTAINMENT:') ? 'containment' : 'read-hygiene';
    details.push({ kind, target: denialTarget(kind, text) });
  }
  return details;
}

/**
 * Count of guard-denied tool calls in one `user` event — delegates to
 * {@link guardDenialDetailsFromEvent} so the count and the structured rows
 * can never drift apart. Never negative, always a plain count a caller can
 * sum across a firing's whole stream.
 */
export function guardDenialsFromEvent(event: Record<string, unknown>): number {
  return guardDenialDetailsFromEvent(event).length;
}

/**
 * Mutating file tools — the "first edit" that ends a firing's ORIENT phase.
 * Bash is deliberately excluded: running `git log` or the gate is
 * orientation/verification, not editing, and counting it would blind the
 * anomaly to firings that churn commands without ever converging on a change.
 */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/**
 * ORIENT-length span — COGNITIVE DEFENSES (web-mssn107s-qh8d95): a firing
 * that reads for 40 turns before its first edit is lost or looping, and no
 * per-firing total (cost, numTurns) can see that shape. `turns` counts
 * assistant events seen on the wire (the same granularity the activity
 * timeline renders); `turnsBeforeFirstEdit` is how many had passed when the
 * first mutating file tool appeared, null while (or forever if) none did —
 * a doc-only firing legitimately never edits, so null is "no edit", not 0.
 */
export interface OrientSpan {
  readonly turns: number;
  readonly turnsBeforeFirstEdit: number | null;
}

export const INITIAL_ORIENT_SPAN: OrientSpan = { turns: 0, turnsBeforeFirstEdit: null };

/**
 * Fold one stream event into the ORIENT span (pure — returns a new span,
 * matching this module's stateless style; the adapter owns the running
 * value). Non-assistant events pass through untouched; the first-edit turn
 * count latches once set.
 */
export function foldOrientSpan(span: OrientSpan, event: Record<string, unknown>): OrientSpan {
  if (event['type'] !== 'assistant') return span;
  const isFirstEdit =
    span.turnsBeforeFirstEdit === null &&
    activitiesFromEvent(event).some((activity) => EDIT_TOOLS.has(activity.tool));
  return {
    turns: span.turns + 1,
    turnsBeforeFirstEdit: isFirstEdit ? span.turns : span.turnsBeforeFirstEdit,
  };
}

/**
 * The model + token usage carried by one `assistant` event, or null for any
 * other event type — DEATH-COST capture (docs/EVALUATION-2026-08.md §3.6):
 * lets a caller keep the LAST usage snapshot seen on the wire so an abnormal
 * exit (killed before the terminal `result` event) can still persist real
 * observed turns/tokens instead of a fabricated $0/0 row.
 */
export function usageFromEvent(event: Record<string, unknown>): MessageUsage | null {
  if (event['type'] !== 'assistant') return null;
  const message = event['message'];
  const container =
    message && typeof message === 'object' ? (message as Record<string, unknown>) : event;
  return usageFromContainer(container);
}

/**
 * Extract one incremental answer-text chunk from a `--include-partial-messages`
 * event, or null if this event carries no answer text (verified against the real
 * CLI wire format: `{type:"stream_event", event:{type:"content_block_delta",
 * delta:{type:"text_delta", text}}}`). Deliberately excludes `thinking_delta` —
 * extended-thinking content is never part of the answer shown to the user.
 */
export function textDeltaFromEvent(event: Record<string, unknown>): string | null {
  if (event['type'] !== 'stream_event') return null;
  const inner = event['event'];
  if (inner === null || typeof inner !== 'object') return null;
  const e = inner as Record<string, unknown>;
  if (e['type'] !== 'content_block_delta') return null;
  const delta = e['delta'];
  if (delta === null || typeof delta !== 'object') return null;
  const d = delta as Record<string, unknown>;
  if (d['type'] !== 'text_delta') return null;
  return str(d['text']);
}
