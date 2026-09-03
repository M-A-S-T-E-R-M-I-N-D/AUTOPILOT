// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The ask endpoints (`POST /api/ask` and `POST /api/ask/stream`) — validation,
 * CSRF guard, and both handlers (epic 0002 "shell decomposition" — split from
 * `server.ts`; the server shell wires these into its router with a shared
 * rate limiter so a client can't dodge the cap by alternating endpoints).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AskTurn, Activity as AskActivity } from '@autopilot/engine';
import type { RateLimiter } from './rate-limit.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';

// Input caps for fields whose body is otherwise only bounded by MAX_BODY_BYTES
// (64KB) — that ceiling is generous enough to let an oversized single field (a
// question fed straight into a model prompt) through as a quota-spend or
// work-amplification vector.
const MAX_QUESTION_CHARS = 2000;
// The client-embedded "which dashboard page is the operator on" label (e.g.
// "project page: acme-web") — short by construction, capped for the same
// amplification reason as the other ask fields (an operator never types it).
const MAX_VIEW_CHARS = 200;
// The Ask panel's persona toggle (ARCHITECT chat v2 slice 2, docs/epics/
// 0011-architect-chat-v2.md, board web-msnqmgge-oijj8x) — GENIUS (default,
// read-only) or ARCHITECT (control-tool intent routing lands in slice 3;
// this slice only threads the choice through the wire and echoes it back on
// the terminal SSE frame so the client can confirm which persona answered).
const ASK_PERSONAS = ['genius', 'architect'] as const;
export type AskPersona = (typeof ASK_PERSONAS)[number];
// A prior turn's answer can run longer than a fresh question but is still
// bounded — an unbounded history entry is the same quota-spend vector as an
// unbounded question, just arriving through a different field.
const MAX_HISTORY_ANSWER_CHARS = 4000;
const MAX_HISTORY_TURNS = 20;
// Shared across /api/ask and /api/ask/stream (both spend Claude CLI quota) —
// caps a single client's runaway loop, not legitimate back-and-forth chat.
export const ASK_RATE_LIMIT = 20;
export const ASK_RATE_WINDOW_MS = 60_000;

/** Ask one grounded question about one project (injected; spends quota). */
export interface AskApiResult {
  readonly ok: boolean;
  readonly answer: string;
  readonly sources: readonly string[];
  /** ARCHITECT persona only (epic 0011 slice 3, docs/epics/0011-architect-
   *  chat-v2.md, board web-msnqmgge-oijj8x): the control-tool action the
   *  model proposed, lifted out of the answer by `ask/architect-
   *  proposal.ts`'s `parseArchitectProposal` — present only when `persona`
   *  was `'architect'` AND the answer carried a valid proposal block.
   *  Untrusted model output: nothing executes until the operator confirms it
   *  via the action card against `/api/control/execute`. */
  readonly proposal?: unknown;
}
export type AskApi = (
  projectId: string,
  question: string,
  history?: readonly AskTurn[],
  view?: string,
  /** Epic 0012 slice 3's manual Deep-toggle trigger: forces escalation to the
   *  read-only agentic tier regardless of tier-1 source availability. */
  deep?: boolean,
  /** ARCHITECT chat v2 slice 3: the validated persona choice, threaded to the
   *  service layer so `'architect'` appends the control-proposal addendum
   *  and lifts a proposal into {@link AskApiResult.proposal}. */
  persona?: AskPersona,
) => Promise<AskApiResult>;

/** Same contract as {@link AskApi}, but `onChunk` fires with each answer-text
 *  chunk as it streams in (the `/api/ask/stream` SSE relay). `onActivity`
 *  (epic 0012 slice 3) fires for each tool the escalation session uses, in
 *  real time, when either trigger escalates — the SSE relay for the "what's
 *  it reading right now" chips. */
export type AskStreamApi = (
  projectId: string,
  question: string,
  onChunk: (text: string) => void,
  history?: readonly AskTurn[],
  view?: string,
  deep?: boolean,
  onActivity?: (activity: AskActivity) => void,
  /** Same ARCHITECT persona threading as {@link AskApi}'s `persona` param. */
  persona?: AskPersona,
) => Promise<AskApiResult>;

interface AskInput {
  readonly project: string;
  readonly question: string;
  readonly history?: readonly AskTurn[] | undefined;
  readonly view?: string | undefined;
  /** Epic 0012 slice 3's manual Deep-toggle trigger — see {@link AskApi}. */
  readonly deep: boolean;
  readonly persona: AskPersona;
}
type AskParseResult =
  | { readonly ok: true; readonly input: AskInput }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

/** Validate an untrusted `history` field: absent is fine; present must be an
 *  array of `{question, answer}` string pairs, bounded on both count and size —
 *  the same quota-spend concern MAX_QUESTION_CHARS guards against, just spread
 *  across a conversation instead of one field. Returns null on any violation. */
function parseHistory(value: unknown): readonly AskTurn[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_HISTORY_TURNS) return null;
  const turns: AskTurn[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { question, answer } = entry as { question?: unknown; answer?: unknown };
    if (typeof question !== 'string' || typeof answer !== 'string') return null;
    if (question.length > MAX_QUESTION_CHARS || answer.length > MAX_HISTORY_ANSWER_CHARS) {
      return null;
    }
    turns.push({ question, answer });
  }
  return turns;
}

/** Validate an untrusted `view` field: absent is fine; present must be a short
 *  string (the client-embedded "which dashboard page" label) — bounded so a
 *  direct API call can't use it to inflate the prompt. */
function parseView(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_VIEW_CHARS) return null;
  return value;
}

/** Validate an untrusted `persona` field: absent is fine (defaults to
 *  `'genius'`); present must be one of {@link ASK_PERSONAS}. */
function parsePersona(value: unknown): AskPersona | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !ASK_PERSONAS.includes(value as AskPersona)) return null;
  return value as AskPersona;
}

/**
 * Shared CSRF guard + body validation for both ask endpoints (`/api/ask` and
 * `/api/ask/stream`): POST + `application/json` (a cross-site form cannot send
 * that Content-Type without a CORS preflight this server never approves), a
 * non-blank project + question, capped at MAX_QUESTION_CHARS (a quota-spend cap),
 * an optional `history` (prior turns) for multi-turn conversations, and an
 * optional `view` (which dashboard page the operator is on).
 */
async function parseAskRequest(req: IncomingMessage): Promise<AskParseResult> {
  if ((req.method ?? 'GET') !== 'POST') {
    return { ok: false, status: 405, body: { error: 'method not allowed' } };
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    return { ok: false, status: 415, body: { error: 'Content-Type must be application/json' } };
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    return { ok: false, status: 413, body: { error: 'request body too large' } };
  }
  let project: string;
  let question: string;
  let history: readonly AskTurn[] | null | undefined;
  let view: string | null | undefined;
  let deep: boolean;
  let persona: AskPersona | null | undefined;
  try {
    const body = JSON.parse(raw) as {
      project?: unknown;
      question?: unknown;
      history?: unknown;
      view?: unknown;
      deep?: unknown;
      persona?: unknown;
    };
    project = String(body.project ?? '');
    question = String(body.question ?? '');
    history = parseHistory(body.history);
    view = parseView(body.view);
    deep = body.deep === true;
    persona = parsePersona(body.persona);
  } catch {
    return { ok: false, status: 400, body: { error: 'invalid JSON' } };
  }
  if (project.length === 0 || question.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: 'a project id and a question are required' },
    };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return {
      ok: false,
      status: 400,
      body: { error: `question must be ${MAX_QUESTION_CHARS} characters or fewer` },
    };
  }
  if (history === null) {
    return {
      ok: false,
      status: 400,
      body: { error: 'history must be an array of at most 20 {question, answer} string pairs' },
    };
  }
  if (view === null) {
    return {
      ok: false,
      status: 400,
      body: { error: `view must be a string of ${MAX_VIEW_CHARS} characters or fewer` },
    };
  }
  if (persona === null) {
    return {
      ok: false,
      status: 400,
      body: { error: `persona must be one of: ${ASK_PERSONAS.join(', ')}` },
    };
  }
  return {
    ok: true,
    input: { project, question, history, view, deep, persona: persona ?? 'genius' },
  };
}

/**
 * The ask endpoint (`POST /api/ask`, body `{project, question}`). Spends quota
 * (one tool-less model call), so it is a CSRF-guarded JSON POST like every other
 * state/spend endpoint. The answer is grounded in the project's indexed code by
 * the injected AskApi (retrieve → injection-defended prompt → model).
 */
export async function handleAsk(
  req: IncomingMessage,
  res: ServerResponse,
  ask: AskApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!ask) {
    send(404, { error: 'ask unavailable' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many questions — slow down and try again shortly.' });
    return;
  }
  const parsed = await parseAskRequest(req);
  if (!parsed.ok) {
    send(parsed.status, parsed.body);
    return;
  }
  try {
    send(
      200,
      await ask(
        parsed.input.project,
        parsed.input.question,
        parsed.input.history,
        parsed.input.view,
        parsed.input.deep,
        parsed.input.persona,
      ),
    );
  } catch {
    send(200, { ok: false, answer: 'Ask failed — try again shortly.', sources: [] });
  }
}

/**
 * The streaming ask endpoint (`POST /api/ask/stream`, body `{project,
 * question, deep?, persona?}`). Identical CSRF guard + validation as
 * `/api/ask` (still a JSON POST — the transport changes, not the
 * spend-guard); once validated it switches to SSE and relays the answer as
 * `{delta}` frames as they arrive, `{activity}` frames when an escalated
 * answer's Read/Grep/Glob tool use fires (epic 0012 slice 3's manual
 * Deep-toggle trigger, `deep: true`, or slice 2's automatic empty-sources
 * trigger — both paths through `AskStreamApi`'s `onActivity`), then a
 * terminal `{done, ok, answer, sources, proposal?, persona}` frame —
 * `persona` echoes back the request's (validated, defaulted-to-`'genius'`)
 * persona choice; `'architect'` is also threaded into the service call
 * (ARCHITECT chat v2 slice 3, docs/epics/0011-architect-chat-v2.md), which
 * appends the control-proposal prompt addendum and may lift a proposed
 * action into `proposal` — untrusted model output the client renders as an
 * action card, nothing executes until the operator confirms it. A
 * `fetch().body.getReader()` client
 * (not `EventSource`, which cannot carry the guarding JSON POST body) reads
 * this to render the answer progressively.
 */
export async function handleAskStream(
  req: IncomingMessage,
  res: ServerResponse,
  askStream: AskStreamApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!askStream) {
    send(404, { error: 'ask unavailable' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many questions — slow down and try again shortly.' });
    return;
  }
  const parsed = await parseAskRequest(req);
  if (!parsed.ok) {
    send(parsed.status, parsed.body);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...headers,
  });
  const sendEvent = (payload: unknown): void => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      /* client went away mid-write */
    }
  };
  const stop = (): void => {
    if (!res.writableEnded) res.end();
  };
  req.on('close', stop);
  req.on('error', stop);

  try {
    const result = await askStream(
      parsed.input.project,
      parsed.input.question,
      (text) => sendEvent({ delta: text }),
      parsed.input.history,
      parsed.input.view,
      parsed.input.deep,
      (activity) => sendEvent({ activity }),
      parsed.input.persona,
    );
    sendEvent({ done: true, ...result, persona: parsed.input.persona });
  } catch {
    sendEvent({
      done: true,
      ok: false,
      answer: 'Ask failed — try again shortly.',
      sources: [],
      persona: parsed.input.persona,
    });
  }
  stop();
}
