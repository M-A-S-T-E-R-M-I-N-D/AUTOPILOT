<!-- SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Ecosystem research — adopt / avoid decisions (2026-08)

What the LLM-agent ecosystem offers AUTOPILOT, what we adopt, what we deliberately
skip, and the packaging/deployment path. Researched from vendor docs, official
package registries, and the 2026 framework-comparison literature. Every decision
here is reversible but **recorded** — changing it is a deliberate act.

## 1. Agent frameworks (LangChain / LangGraph / CrewAI / …) — **AVOID for the core loop**

The 2026 landscape consolidated around six production frameworks (LangGraph,
CrewAI, OpenAI Agents SDK, Claude Agent SDK, Google ADK, MS Semantic Kernel);
for TypeScript specifically the field favors Mastra / Vercel AI SDK / the
official TS SDKs.

**Why AUTOPILOT does not sit on any of them:**

1. **They orchestrate API-key model calls.** AUTOPILOT's economic core is the
   external loop over `claude -p` on the user's **subscription** auth — no API
   key, no per-token billing surprise. Wrapping LangGraph around that would
   re-introduce exactly the dependency we designed out.
2. **The Claude CLI already IS the agent runtime.** Tools, permissions,
   PreToolUse hooks (our containment guard!), MCP, streaming — battle-tested by
   Anthropic. A framework would duplicate this with less fidelity for coding
   agents. (Princeton's HAL data shows scaffold choice swings agent scores by up
   to ~30 points — our scaffold is the one tuned by the model's own vendor.)
3. **Our loop is deliberately tiny and auditable** (fire → gate → commit/revert →
   un-fakeable telemetry). The gate is the product; frameworks optimize
   flexibility we don't want inside the safety boundary.

**Nearest legitimate option, noted for later:** the official **Claude Agent SDK
(TypeScript)** — same engine as the CLI, programmatic. If the CLI-spawn seam ever
binds us, that is the ONLY migration candidate (it preserves the hook/permission
model). Not now: our `ClaudeCliModel` adapter already delivers subscription auth +
stream-json + `--settings` guard injection.

## 2. Hybrid RAG (the open M4 gap) — **ADOPT: sqlite-vec + local ONNX embeddings + RRF**

All fully free, local, no API keys, aligned with our existing better-sqlite3 store:

| Piece | Choice | License | Why |
| --- | --- | --- | --- |
| Vector store | **`sqlite-vec`** (asg017) | Apache-2.0/MIT dual | Loads straight into better-sqlite3 (`load()` API); vectors live in the SAME `.db` as FTS5 + telemetry; zero infra. Successor to sqlite-vss. |
| Embeddings | **`fastembed`** (Qdrant's JS port) or **`@huggingface/transformers`** | Apache-2.0 | Local ONNX inference, model downloaded on first use, no GPU needed. 384-dim `bge-small-en-v1.5` / `all-MiniLM-L6-v2` keeps the DB small. |
| Fusion | **Reciprocal Rank Fusion** (k=60, per the original paper) | — (pure math) | Rank-based, so BM25 and cosine scores never need calibrating against each other; the standard for FTS+vector hybrids. **Implemented in-repo — pure, tested, zero deps.** |

Known limit (recorded honestly): sqlite-vec brute-force-scans (no ANN index yet) —
fine at our scale (a practitioner reports ~50K chunks / 83MB working well); we
benchmark before 1.0 if indexes grow past that.

Rollout order: RRF core (done, this commit) → `sqlite-vec` table + embedding
pipeline behind the existing `SearchStorePort` (so `/api/search` + `/api/ask`
upgrade transparently) → embedding backfill during onboarding.

## 3. Packaging & deployment — **the path: npm → Docker → Cloudflare Containers**

Researched via Cloudflare's official docs (Containers "Getting started" +
"Execute commands"):

1. **Local-first (now):** the product runs on the user's machine — it spawns the
   `claude` CLI and touches local git repos. Ship as an npm-installable CLI
   (`npx autopilot` → dashboard up). This is BACKLOG §L's first item.
2. **Docker (packaging step, not an alternative):** a Dockerfile bundling
   node + the built workspace + the `claude` CLI. Required anyway for step 3 —
   Cloudflare deploys **Docker images** (`wrangler deploy` builds + pushes to
   Cloudflare's integrated registry).
3. **Cloudflare Containers (hosted option, LAST):** a Worker routes requests to
   container instances; containers run long-lived Node servers and can execute
   additional processes inside the active container (their documented "exec"
   surface) — i.e. the dashboard + engine + CLI can run server-side. Plain
   Workers CANNOT spawn processes; Containers are the only Cloudflare fit.
   **Auth on a server:** interactive subscription login doesn't exist there —
   the already-built `oauth-token` / `api-key` connection modes are the
   server-side answer (this is why the connect screen supports them).
   Provisioning note from their docs: first deploy takes minutes before
   containers accept requests.

**Not adopted:** hosted vector DBs (Pinecone/Weaviate — infra + cost vs. our
zero-infra sqlite-vec), LangSmith-style observability SaaS (our telemetry is
un-fakeable and local), CrewAI/AutoGen multi-agent runtimes (M7's supervisor will
orchestrate *flights*, which are already whole agents).

## 4. Sources

- Framework comparisons (2026): speakeasy.com "Choosing an agent framework", requesty.ai, particula.tech, digitalapplied.com matrices, langfuse.com framework comparison, qubittool.com showdown.
- sqlite-vec: alexgarcia.xyz/sqlite-vec/js.html (official JS guide), asg017/sqlite-vec (repo + NBC-headlines hybrid example), sqlite-hybrid-search (liamca), patentllm.org "Hybrid RAG in 200 lines" (FTS5+vec+RRF in SQL).
- Embeddings: npmjs.com/package/fastembed, huggingface.co/docs/transformers.js.
- Hybrid/RRF: digitalapplied.com "Hybrid Search: BM25, Vector & Reranking Reference 2026" (RRF k=60, rank-based rationale).
- Cloudflare: developers.cloudflare.com/containers/get-started + /containers/execute-commands (official).
