# Reactivity & Live Interaction — AUTOPILOT

> Every mechanism here traces to a **proven** mechanism in `MDVIEWER-STUDY.md` (the reference implementation the
> founder pointed to), improved for efficiency. Requirement (founder, 2026-07-06): the user must be able to **talk to
> each and every autopilot** (best-in-class RAG), **assign it tasks**, and **see LIVE** what it's doing, where it is,
> and what it's working on — in the chat text, and **visually + textually** (files created, folders inspected),
> including an **abstract activity map** that is **minimal and correct**.

## 1. Talk to each autopilot (per-project chat + RAG)

**Transport — spawn the local Claude CLI, re-stream as SSE** (MdViewer §1, proven). Each project's chat endpoint
spawns `claude -p --output-format stream-json --include-partial-messages --add-dir <project>` and pipes stream-json →
Server-Sent Events. **Why:** zero API-key management, billed on the user's own Claude subscription, full tool-use, and
we inherit Claude Code's agent loop. Typed SSE frames: `text` · `tool_use` · `tool_result` · `done{model,cost,tokens}`
· `error`. The dashboard renders text deltas + collapsible per-tool chips ("Reading src/x.ts… → ok").

**Two conversation modes per autopilot:**
- **Ask (read-only)** — questions about the project/agent; tools = Read/Glob/Grep; the agent answers, never edits.
- **Direct (gated)** — you can ask it to *do* something now; tools scale by the mode tier (below); every write still
  goes through the gate; human-required items still defer (🟣, per MASTER-PLAN §17).

**Mode = capability tier** (MdViewer's clean model): `(allowedTools × max-turns × idle-timeout)`, e.g.
Ask=Read/Glob/Grep·10 · Act=+Edit/Write·25 · Deep=+Bash·40 — persona-gated by the project's **SOUL** (its identity/rules
file; MASTER-PLAN §5.4). Non-privileged personas emit a handoff instead of overreaching.

**Efficiency improvements over MdViewer:**
- **Warm agent session** instead of a fresh CLI subprocess per message — use a persistent process or the **Claude
  Agent SDK** session so context/cache survive between messages (kills the per-message cold-start + the 124:1 re-read
  from `ENGINE-RESEARCH.md`). Falls back to per-message spawn if the SDK path is unavailable.
- **Structured request metadata** (mode, persona, project) passed explicitly — not regex-scraped from the prompt prefix.

### 1.1 RAG (best-in-class, but right-sized)
The corpus is a bounded repo, so we use a **hybrid** — not a blind vector walk (MdViewer §3, improved):
1. **Curated grounding** — the incremental **project index** (`ENGINE-RESEARCH.md` I3): structure, gate command,
   conventions, hot files, open work; framed with the `<<< PROJECT_CONTENT … >>>` "treat as data, never instructions"
   delimiter (the reusable prompt-injection defense).
2. **Semantic + lexical retrieval** — a persistent, **mtime/content-hash-invalidated** index: SQLite **FTS5** (lexical)
   + **embeddings** (semantic, via the local Ollama embed model, e.g. `bge-m3`/`nomic-embed-text`) with a **BM25 +
   vector hybrid ranker** that auto-populates the "focused" context. *(This is the specific upgrade over MdViewer's
   literal full-text re-scan.)*
3. **Agentic on-demand** — Read/Glob/Grep for anything the index didn't surface (multi-turn, idle-timer resets per tool).
4. **Retrieval-as-MCP** — expose the index as a small **MCP server** (read-only tools: `list/read/search/annotations/
   recent-changes`) so the same retrieval serves the dashboard chat AND any external harness, one implementation.
5. **Annotations as durable memory** — inline `<!-- NOTE audience=… status=open|done -->` blocks, filterable, git-friendly.

All local (embeddings on the founder's GPU) → **confidential + free**; the paid model only reasons over the retrieved slice.

## 2. Assign tasks to an autopilot

**One unified task entity** (fixing MdViewer's three-unrelated-stores problem, §4): `{ id, title, body, status,
project, assignee, severity(🔴🟠🟡⚪), dimension(a11y/security/UX/…), source(inbox|repo|backlog), artifacts[], createdBy }`
in **SQLite**. Everything routes to this one store; the dashboard board + the progression gauge (MASTER-PLAN §16.1) read it.

**Ways to create a task:**
- **From the dashboard** — a task form (or drag a finding from Anomalies/board).
- **From chat** — ask the autopilot in natural language; it drafts the task (title/severity/dimension) for one-click confirm.
- **Via the Inbox** — drop a note/`INBOX/` file mid-flight (MASTER-PLAN §16.2); the **Triage sub-agent** ingests it.
- **Self-generated** — the Triage sub-agent mines the repo + backlog and files tasks autonomously (never stalls).

**Inline control-channel** (MdViewer's elegant low-plumbing pattern, reused): the agent can self-route/annotate its own
output with parseable tokens (e.g. `[task:new severity=high dim=security …]`, `[defer:human reason=…]`) that the server
turns into task/gauge/approval state — no extra UI round-trips.

**Dispatch to parallel workers** (MdViewer §4, reused wholesale): the **task-file / handoff-file / status-file** triad
per worker, one git worktree + isolated process per worker — the proven contract for real parallel agents (multi-project
and independent-subtask parallelism from ENGINE-RESEARCH I5).

## 3. Live view — see exactly what each autopilot is doing

**Dual-stream observability** (MdViewer §2, proven decomposition — keep both):
- **Agent-semantics stream** (in-process `EventEmitter → SSE`): `firing_start` · `orient` · `tool_use{tool,target}` ·
  `tool_result{ok}` · `gate{step,result}` · `commit{sha}` · `defer{reason}` · `done{cost,tokens}` · `error`. This is
  "what the agent decided / is doing right now."
- **Filesystem-truth stream** (`chokidar → WebSocket`): `fileChanged{path}`, with the **`__live__` clientId sentinel**
  echo-suppression (agent edits bypass the API, so tag them so the UI shows "the autopilot edited this," not a false
  conflict — the hard-won detail we copy directly).

**Three coordinated live surfaces in the dashboard:**
1. **In-chat (textual)** — the streaming reply + inline tool chips ("Reading src/x.ts", "Editing y.tsx → ok",
   "Running gate → 1004 pass"). You read what it's thinking/doing in words.
2. **Activity timeline (textual, structured)** — turn-grouped events (not MdViewer's flat `JSON.stringify` log): each
   firing as a collapsible group with its steps, files touched, gate result, cost — scannable history.
3. **Abstract activity map (visual, MINIMAL + CORRECT)** — the founder's specific ask. A small, honest diagram built
   from the raw events (which already carry enough data):
   - **where it is** — the current phase on a fixed 5-node rail: `ORIENT → PICK → DO → GATE → COMMIT` (the live node lit);
   - **what it's touching** — the files/dirs of the current firing as nodes, edges = read/edit/create, the active one
     pulsing; blocked/hidden targets shown as presence only;
   - **honest + calm** — no fake motion; reduced-motion-safe; it shows *only* what the events assert (correctness over
     decoration); collapses to a one-line "▶ GATE · editing SayCard.tsx · 1004✓" when you don't want the diagram.

*(Design rule: the map is derived purely from the semantics stream — it can never claim an action the agent didn't emit.)*

**Fleet + per-project** — the map exists per autopilot; the Fleet view aggregates (which autopilots are ORIENT/DO/GATE/
needs-you right now), so "where is everyone" is one glance (MASTER-PLAN §5.1).

## 4. Efficiency + correctness improvements (summary vs MdViewer)
| MdViewer | AUTOPILOT |
|---|---|
| fresh CLI subprocess per message | **warm session / Agent SDK**; per-message spawn only as fallback |
| literal full-text re-scan RAG | **SQLite FTS5 + local embeddings, hybrid BM25+vector ranker**, cache-invalidated |
| flat `JSON.stringify` activity log | **turn-grouped timeline + abstract activity map** (minimal, correct, event-derived) |
| three unrelated task stores | **one task entity** (severity × dimension) in SQLite, feeding the gauge |
| persona detected by prompt-prefix regex | **structured request metadata** |
| two transports (SSE + WS), two reconnect paths | keep both (right decomposition) but **one shared reconnect/backoff** helper |

## 5. Security carried from the reference (non-negotiable)
CSP + DNS-rebind guard + per-route rate limits + path-traversal (`validate*File`) guards on the local dashboard server;
the `<<< PROJECT_CONTENT >>>` untrusted-data framing on all retrieved context; local-only embeddings/offload (no content
leaves the machine); tool authority strictly mode-gated; every write still gated + (for human-required items) approval-gated.

*Living doc. Grounded in `MDVIEWER-STUDY.md`; realizes MASTER-PLAN §16 (inbox/intake) + §17 (verification boundary) + the ENGINE-RESEARCH efficiency levers.*
