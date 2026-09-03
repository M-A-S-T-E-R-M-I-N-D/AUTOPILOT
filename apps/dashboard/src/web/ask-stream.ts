// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure SSE frame-decode math for the Ask feature's `/api/ask/stream` reader —
 * client-only (no server counterpart), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `search-history.ts`/
 * `flights.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `searchJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** {@link splitSseFrames}'s result: every complete `\n\n`-terminated frame
 *  found so far, plus the trailing partial frame still being buffered. */
export interface SseSplitResult {
  readonly frames: readonly string[];
  readonly rest: string;
}

/** Splits an ever-growing decoded SSE buffer into complete frames plus the
 *  trailing partial one — the standard incremental-parse shape for a
 *  `\n\n`-delimited stream read in arbitrary-sized chunks. */
export function splitSseFrames(buf: string): SseSplitResult {
  const frames = buf.split('\n\n');
  const rest = frames.pop() ?? '';
  return { frames, rest };
}

/** {@link applyAskStreamFrame}'s result: the next accumulated answer text,
 *  plus sources once the terminal `done` frame carries them, plus one
 *  escalation tool-activity entry (epic 0012 slice 3) when this frame was an
 *  `{activity}` frame — `answered`/`sources` are unchanged from the input on
 *  an activity frame, so the caller can render the chip without touching the
 *  answer text. `proposal` carries the terminal frame's ARCHITECT-mode
 *  control-tool proposal (ARCHITECT chat v2 slice 3, docs/epics/0011-
 *  architect-chat-v2.md) — `null` on every other frame, so the caller only
 *  ever sees a real proposal once the answer is complete. */
export interface AskStreamUpdate {
  readonly answered: string;
  readonly sources: unknown;
  readonly activity: unknown;
  readonly proposal: unknown;
}

/** The shape of one decoded `data: {...}` frame's JSON payload. */
interface AskStreamFramePayload {
  readonly delta?: unknown;
  readonly done?: unknown;
  readonly answer?: unknown;
  readonly sources?: unknown;
  readonly activity?: unknown;
  readonly proposal?: unknown;
}

/** Parses one `/api/ask/stream` SSE frame against the answer accumulated so
 *  far and returns the next accumulated answer, or `null` when the frame is
 *  a non-`data:` line, unparsable JSON, or a payload with none of `delta`,
 *  `activity`, nor `done` — nothing for the caller to act on. A `delta`
 *  frame appends to `answered`; an `activity` frame (epic 0012 slice 3 — the
 *  escalated tier's live Read/Grep/Glob tool use) leaves `answered`
 *  untouched and carries the activity entry instead; the terminal `done`
 *  frame replaces `answered` with `payload.answer` when that's a string,
 *  keeping the streamed-in text otherwise (the terminal frame can omit
 *  `answer` and rely on the deltas already rendered), and carries
 *  `payload.proposal` (ARCHITECT chat v2 slice 3) verbatim — `null` when the
 *  answer carried no control-tool proposal. */
export function applyAskStreamFrame(frame: string, answered: string): AskStreamUpdate | null {
  if (frame.indexOf('data: ') !== 0) return null;
  let payload: AskStreamFramePayload;
  try {
    payload = JSON.parse(frame.slice(6)) as AskStreamFramePayload;
  } catch {
    return null;
  }
  if (typeof payload.delta === 'string') {
    return { answered: answered + payload.delta, sources: null, activity: null, proposal: null };
  }
  if (payload.activity !== undefined && payload.activity !== null) {
    return { answered, sources: null, activity: payload.activity, proposal: null };
  }
  if (payload.done) {
    return {
      answered: typeof payload.answer === 'string' ? payload.answer : answered,
      sources: payload.sources,
      activity: null,
      proposal: payload.proposal ?? null,
    };
  }
  return null;
}
