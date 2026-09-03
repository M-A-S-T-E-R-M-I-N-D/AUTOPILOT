# SOTA MAP — LLM-Native Software Engineering
**Version:** 2026-08 · **Audience:** flagship reasoning models (Claude Opus / Fable class) · **Purpose:** context pack, not a tutorial

---

## HOW TO READ THIS FILE

Every entry has the same five fields. Read only what the task needs; the IDs are stable so you can cross-reference.

```
ID          stable identifier — cite it instead of restating
STATE       what is true as of 2026-08
RULE        the decision, in imperative form
WHEN NOT    the condition that invalidates the rule
WATCH       the signal that would change the entry
```

**Confidence markers:** `[SETTLED]` broad consensus · `[CONTESTED]` credible disagreement · `[MOVING]` expect change within 2 quarters · `[SPECULATIVE]` do not build on this.

**Global rule:** every quantitative claim in this file is harness-dependent, vendor-reported, or both. Reproduce on your own workload before acting on a number.

---

# DOMAIN A — AGENT ARCHITECTURE & ORCHESTRATION

## A1 · Pattern catalog `[SETTLED]`

**STATE.** Seven patterns cover essentially all production multi-agent coding systems. They differ on one axis: **who holds the plan.**

| Pattern | Plan holder | Intermediate results live in | Scale ceiling |
|---|---|---|---|
| Single agent + tools | the model, per turn | one context window | 1 task |
| Supervisor / orchestrator-worker | lead agent, per turn | lead's context | ~3–8 workers |
| Fan-out (map) | lead agent | lead's context | ~10 branches |
| Pipeline (sequential) | design-time definition | shared state | fixed stages |
| Debate / adversarial + judge | judge | judge's context | 2–5 debaters |
| Peer handoff / swarm | whichever agent is active | transferred context | 50+ independent subtasks |
| **Workflow-as-script** | **the script** | **script variables** | **hundreds of agents** |

**RULE.** Start at supervisor. Add fan-out only when branches are genuinely independent. Move to workflow-as-script when the plan itself should be a reviewable, rerunnable artifact. Reach for swarm only above ~50 truly independent subtasks.

**WHEN NOT.** Orchestration sophistication must follow workload complexity, never precede it. A three-subagent supervisor handles more than teams assume; deploying swarm infrastructure below its fit range spends engineering budget on capability the use case does not need.

**WATCH.** Native swarm primitives arriving in model-layer APIs would lower the swarm threshold.

---

## A2 · Workflow-as-script — the 2026 inflection `[MOVING]`

**STATE.** The significant architectural change of 2026 is moving orchestration out of the context window and into executable code. A script holds the loop, branching, and intermediate results; the model's context receives only the final answer. Reference implementation shape:

```javascript
const inv    = await agent(prompt, { schema })          // one agent, typed output
const parts  = await pipeline(items, i => agent(...))   // one agent per item
const checked= await pipeline(parts, p => agent(...))   // independent verification
```

**Why it dominates for audits and migrations:** the script can apply a repeatable quality pattern — independent agents adversarially reviewing each other's findings before they are reported, or drafting a plan from several angles and weighing them — rather than merely running more agents.

**RULE.** Any task with the shape *"do the same analysis across N items, then synthesize"* belongs in a script, not a conversation. Persist the script; a run you cannot rerun is not a process.

**WHEN NOT.** Tasks needing mid-run human judgment. Scripts typically cannot accept user input mid-run — split each approval boundary into its own run.

**WATCH.** Resume semantics. In current implementations, cached results stop at the first agent that did not finish, and **every agent started after it reruns even if it completed.** Consequence: fan out to many small agents rather than few long ones — small-agent fan-out preserves far more progress across an interruption.

---

## A3 · Verification topology `[SETTLED]` — the highest-leverage design choice

**STATE.** Self-review by the agent that produced the work is structurally weak. The production pattern is a reviewer with (a) fresh context, (b) no investment in the original approach, (c) an instruction to find problems rather than to assess quality.

Four topologies, increasing cost:

| Topology | Mechanism | Catches |
|---|---|---|
| Deterministic check | pattern match, linter, compiler, test | known-bad forms |
| Independent reviewer | separate call, fresh context, diff only | semantic defects |
| Adversarial verifier | *"refute this claim; read the cited lines"* | fabricated and overstated findings |
| Quorum / vote | N verifiers, majority, unverifiable ≠ refuted | low-confidence claims |

**RULE.** Every generative phase gets a verification phase run by a different context. Preserve a three-valued verdict: `confirmed` / `refuted` / `unverifiable`. Collapsing `unverifiable` into `refuted` silently deletes real findings when a verifier hits a rate limit or tool error.

**WHEN NOT.** Cheap, reversible, already-tested changes. Verification cost must be proportional to the cost of being wrong.

---

## A4 · Isolation substrate `[SETTLED]`

**STATE.** Git branches were designed for sequential work; agents introduced parallel work, which made worktrees load-bearing. One `.git` object database, N checkouts, no duplicated history. The canonical fleet unit is **one worktree + one branch + one PR per agent.**

**RULE.** Ordering of isolation strength: worktree < container < VM < separate host. Choose by blast radius, not convenience. For anything running unattended, add filesystem and network isolation on top, plus credential masking so the agent never holds a real secret.

**WHEN NOT.** Single agent, single task — a feature branch is sufficient and worktrees are pure overhead.

**WATCH.** Cleanup. Worktree directories accumulate; make removal part of the lifecycle, not a manual chore.

---

## A5 · Inter-agent communication `[CONTESTED]`

**STATE.** Two schools. Direct messaging (peer-to-peer, shared task list) versus **repository-as-bus** (an agent commits its state; the next pulls and reads it). Practitioners report the repository approach is simpler and avoids coordination overhead entirely.

**RULE.** Default to repository-as-bus for coding work. Reserve direct messaging for cases where agents must genuinely negotiate — competing hypotheses, contested design decisions.

**WHEN NOT.** Latency-sensitive coordination. Commit round-trips cost seconds.

**WATCH.** Context loss on handoff is the dominant failure mode: pass full context (expensive, eventually exceeds the window) or summarize (lossy, errors accumulate across transfers). Neither is solved; schema-typed handoffs (B6) mitigate.

---

## A6 · Known failure modes `[SETTLED]`

| Failure | Trigger | Mitigation |
|---|---|---|
| Infinite handoff loop | no single agent owns the task | one owner; hop budget; terminal state |
| Context loss on transfer | summarization at each hop | typed artifacts, not prose summaries |
| Non-deterministic agent chain | runtime routing | log the chain; pin routing for reproducibility |
| Coordination overhead exceeds gain | too many agents for the task | measure task shape first |
| Confident wrong turn, no second opinion | single agent on a hard problem | A3 |
| Runaway spawn | recursive delegation | hard agent caps; token projection alarms |

**RULE.** Most multi-agent systems fail on engineering concerns — state, cost, reliability — not on agent intelligence. Budget accordingly: orchestration complexity is technical debt that compounds with scale.

---

# DOMAIN B — CONTEXT ENGINEERING

## B1 · The bottleneck has moved `[SETTLED]`

**STATE.** Context engineering is the defining cost discipline of the period. The scarce resource is not window size but **effective attention within the window** plus **cache hit rate across turns**.

**RULE.** Measure a *safe-context budget* empirically per model: build a small eval of multi-hop questions whose answers require reasoning across chunks, run it at increasing context sizes, and take the largest size where accuracy stays in range. For a 1M window, practitioners commonly land at 200K–400K. Treat the remainder as unusable, not as headroom.

**WATCH.** Long-context degradation ("context rot") is model-specific and changes every release. Re-measure on upgrade.

---

## B2 · Prefix stability — the rule most teams miss `[SETTLED]`

**STATE.** KV cache reuse depends on **prefix continuity**. Truncating, reordering, or rewriting earlier context mutates input boundaries and destroys cache hits from that point forward. The original append-only agent loop achieves cumulative cache hits precisely because it never mutates the layout.

**RULE.** Treat context as append-only. Put volatile content (timestamps, changing status, per-turn injections) at the **end**. Never edit earlier turns to "clean up." Prefer eviction at a boundary over rewriting in place.

**WHEN NOT.** When a single request's prefill cost is dominated by a context so large that a smaller mutated prefix genuinely wins — measure, do not assume.

**WATCH.** Actions that silently invalidate cache in agent harnesses: switching models, changing effort/reasoning level, connecting or disconnecting a tool server, enabling or disabling a plugin, denying a tool wholesale, compacting, upgrading the harness. Actions that typically preserve it: editing repository files, changing output style or permission mode, invoking skills.

---

## B3 · Compaction `[MOVING]`

**STATE.** Compaction interfaces are now specified rather than ad hoc: configurable thresholds, custom summarization instructions, streamed compaction blocks, and a pause-after-compaction control. Map-reduce compaction (chunk → summarize in parallel → combine) is the scalable variant.

**RULE.** Never rely on compaction to preserve critical state. Re-inject the invariants explicitly after every compaction event via a post-compaction hook. Assume anything not re-injected is gone.

**WHEN NOT.** If the session is short enough to finish inside the safe-context budget, compaction is pure risk — start a fresh session instead.

**WATCH.** The compaction↔cache interaction requires explicit engineering at the infrastructure layer: a compaction event must invalidate the cached prefix, or stale pre-compaction prefixes get served into post-compaction turns. This has already shipped as a real bug in a major harness.

---

## B4 · Memory tiering `[MOVING]`

**STATE.** Four distinct tiers with different loading semantics:

| Tier | Loads | Scope | Cost |
|---|---|---|---|
| Always-on instructions | every session, in full | whole project | every request |
| Path-scoped rules | when matching files are touched | directory / glob | only on match |
| On-demand skills | descriptions at start, body when invoked | task-specific | low until used |
| Isolated worker context | fresh per spawn | one task | separate window |

**RULE.** Keep always-on instructions under ~200 lines. Everything conditional becomes a path-scoped rule; everything referential becomes an on-demand skill; everything verbose becomes an isolated worker. Instructions with side effects should be manually-invoked only, so they cost zero context until triggered.

**WHEN NOT.** Small repositories with one convention set — tiering is overhead.

**WATCH.** Layered instruction files are **additive across levels**, and conflicts are resolved by model judgment. Contradictions between levels produce nondeterminism. Audit the merged result, not the individual files.

---

## B5 · Do not auto-generate your context files `[SETTLED]`

**STATE.** Evaluated across 138 real repositories: LLM-generated context files **reduced** agent task success rates in a majority of tested settings while increasing inference cost by 20–23% and adding 2.45–3.92 steps per task. Human-written files outperformed generated ones for every agent tested, by roughly 4 percentage points.

**Mechanism.** Agents follow generated instructions faithfully, which broadens exploration and raises reasoning cost without improving outcomes.

**RULE.** Generate a *candidate inventory* automatically, then have a human select and compress. Signal density beats coverage. One code example per convention beats three paragraphs describing it.

**WATCH.** This is a finding about *generated instruction text*, not about tooling. Generated **schemas, tests, and fitness functions** are fine — they are verifiable.

---

## B6 · Schema-typed handoffs `[SETTLED]`

**STATE.** Every agent boundary is a serialization boundary. Prose handoffs lose structure and cannot be validated; typed handoffs can.

**RULE.** Every inter-agent artifact carries a JSON Schema. Validate at the boundary and fail loudly. Prefer enums over free text for anything downstream logic branches on (severity, verdict, status). Never regex-parse another agent's markdown.

---

## B7 · Retrieval as context, not as a separate system `[SETTLED]`

**STATE.** For code, symbol-level navigation via a language server frequently **reduces** net context: a definition lookup replaces reading a whole file. For documents, see Domain G.

**RULE.** Order of preference for getting code into context: (1) language-server symbol lookup, (2) targeted grep with tight ranges, (3) whole-file read, (4) directory sweep. Block reads of generated, vendored, and build output entirely.

---

# DOMAIN C — LLM-NATIVE SDLC FLOWS

## C1 · The canonical loop `[SETTLED]`

```
SPEC → EXPLORE → PLAN → (approve) → IMPLEMENT → VERIFY → REVIEW → LAND
         ↑                                          │
         └──────────── verification failure ────────┘
```

**RULE.** Three non-negotiables, in priority order:
1. **Give the agent something to verify against** before it writes code — a failing test, a schema, a type signature, an executable spec. An agent without a verification target optimizes for plausibility.
2. **Explore before planning, plan before implementing.** Read-only exploration in an isolated context is the cheapest phase and the highest-leverage.
3. **Approve the plan, not the diff.** Reviewing a plan costs minutes; reviewing a 1,500-line diff costs an afternoon and gets skimmed.

**WHEN NOT.** Trivial mechanical edits where the spec *is* the diff.

---

## C2 · Spec-driven development `[MOVING]`

**STATE.** The workflow where an evidence-grounded specification, not a disposable prompt, drives implementation. Drift is the new technical debt: when intent lives only in a chat thread, every agent run re-litigates the same requirements.

**RULE.** The spec is a committed artifact with a version. Agents read it; they do not infer it. When implementation diverges from spec, one of the two is wrong — decide which, explicitly, and update it.

**WHEN NOT.** Exploratory prototyping where the goal is to discover the requirement. Do not spec what you are still learning.

**WATCH.** Garbage in, garbage out applies with force: a spec that does not reflect what users asked for produces confidently wrong software faster than before.

---

## C3 · The enforcement ladder `[SETTLED]` — apply everywhere

**STATE.** Instructions are requests; mechanisms are guarantees. Six tiers, and you should always use the lowest one that works:

| Tier | Mechanism | Deterministic | Context cost |
|---|---|---|---|
| 1 | Pre-action hook / permission deny | yes | zero |
| 2 | Deterministic pattern match on each edit | yes | zero until match |
| 3 | Single-call LLM check on a lifecycle event | no, but always fires | low |
| 4 | Sub-agent verification with tool access | no, but always fires | medium |
| 5 | Model review of a diff (independent context) | no | high |
| 6 | CI / policy-as-code | yes | none (but late) |

**RULE.** If you are writing a sentence that begins with *"always"* or *"never"*, you are writing a tier-1 or tier-2 rule in the wrong place. Move it.

**Critical asymmetry:** in well-designed harnesses, pre-action hooks fire **before** permission-mode evaluation, so a hook denial holds even under permission-bypass modes. The reverse does not hold — a hook cannot grant what policy denies. Hooks tighten; they never loosen. Put unbypassable controls in hooks and hard boundaries in policy.

---

## C4 · Small batches, enforced `[SETTLED]`

**STATE.** Agent-generated diffs default to one large PR. AI-generated PRs wait ~4.6× longer for review pickup and are accepted at ~32.7% versus ~84.4% for human PRs.

**RULE.** Hard-gate diff size (400–500 changed lines is the common threshold). If the task needs more, it is more than one PR. This is the gate teams most often skip and should not: at 1,500 lines nobody reviews properly — they skim, approve, and hope.

**WHEN NOT.** Mechanical, tool-generated, verifiable-in-bulk changes (a codemod with a passing test suite). Gate on *review burden*, not raw line count.

---

## C5 · Review topology `[SETTLED]`

Four stages, each catching what the previous missed. Value comes from reducing volume downstream, not from any single stage:

| Stage | Latency | What it catches | Cost |
|---|---|---|---|
| Per-edit pattern match | milliseconds | known-dangerous forms | zero |
| End-of-turn diff review | seconds, background | authz bypass, IDOR, injection, SSRF, weak crypto | one model call per changed turn |
| Commit-time agentic review | seconds, background | findings that need surrounding code (callers, sanitizers) to adjudicate | several turns per commit |
| PR-time multi-agent review | minutes | cross-cutting correctness with full repo context | highest |

**RULE.** Install all four. Note that in-session review layers typically **do not block** — findings arrive as instructions the agent may or may not act on. Anything that must not ship needs tier 1, 2, or 6.

---

## C6 · Evals for prompts, skills, and agents `[MOVING]`

**STATE.** Prompt and skill regressions are invisible without evals. This is the least-adopted high-value practice in the field.

**RULE.** Every reusable skill or agent definition gets a small eval set drawn from real repository tasks with known-good outcomes. Run on change. Track pass rate, step count, and token cost together — an "improvement" that doubles steps is a regression.

**WHEN NOT.** One-off prompts.

---

## C7 · Governance and measurement of AI-in-SDLC `[SETTLED]`

**STATE.** The controlling finding: **AI is an amplifier.** It magnifies the strengths of high-performing organizations and the dysfunctions of struggling ones. Throughput improves; stability often degrades when the foundation is weak. Seven capabilities gate whether individual gains reach organizational outcomes: a clear and communicated AI stance, healthy data ecosystems, AI-accessible internal data, strong version-control practice, small batches, user-centric focus, and a quality internal platform.

**RULE.** Do not expand agent autonomy while version control, testing, or CI gates are weak — you are amplifying a defect. Fix the foundation first, in that order.

**Measurement.** Export agent-harness telemetry (OTLP) to your observability stack and SIEM: session and token counters, cost, lines-of-code and PR counters, tool-decision events, permission-mode changes, skill activations, hook executions, compaction events, refusals. This converts "we have an AI policy" from a document into a measurable control, and answers audit questions like *who changed the permission mode, and when*.

---

# DOMAIN D — AUTOMATED SOFTWARE, VERSION, AND FILE MANAGEMENT

## D1 · The fleet unit `[SETTLED]`

**STATE.** Worktree + branch + PR per agent task. Agent fixes its own CI failures and addresses review comments on its own PR.

**RULE.** Naming convention encodes ownership: `agent/<TICKET>-<slug>`. Commit trailers record which model and harness produced the change. Responsibility does not transfer to the model — it stays with the engineer who authorized the merge.

---

## D2 · Merge queues `[SETTLED]`

**STATE.** Table stakes since 2025. The problem they solve: two independently passing PRs that break trunk when combined. Monorepo-aware queues route PRs into disjoint parallel lanes by impacted target so unrelated changes do not block each other.

**RULE.** With more than ~2 agents landing per day, a merge queue is mandatory, not optional. Add priority lanes so hotfixes can jump.

---

## D3 · Stacked PRs `[MOVING]`

**STATE.** Entered native public preview on major forges in July 2026: an ordered series of PRs, each a focused layer, tracked as a dependency graph, reviewable in parallel, and mergeable in one operation that lands every unmerged layer below. Coding agents are named as first-class stack participants — an explicit acknowledgment that agent diffs tend toward one giant PR by default.

**RULE.** Stacking is the correct answer to the agent-mega-PR problem: keep the small-PR review discipline without the sequential blocking. The rebase cascade — historically the tedious part — is now maintained by the forge.

**WHEN NOT.** Genuinely independent changes; those are parallel PRs, not a stack.

---

## D4 · Version and release automation `[SETTLED]`

| Tool class | Trigger | Best fit |
|---|---|---|
| Commit-convention driven | Conventional Commits since last tag | fully automated CI/CD, single package |
| Changeset-file driven | explicit intent file per PR, bot opens the release PR | monorepos with independent versioning |
| Interactive / scripted | human runs it | when you want control |

**RULE.** Enforce the commit convention with a lint step in CI, not only a local hook — local hooks get bypassed. For monorepos with independently versioned packages, the changeset model has the more mature story: one file can specify different bump types for different packages in the same PR.

**Adoption note.** You can adopt commit-driven releases on an existing repo without rewriting history: tag the current state, start the discipline from there. Only commits since the last tag affect version calculation.

---

## D5 · Dependency automation `[SETTLED]`

**RULE.** Automated dependency PRs plus a **cooldown window** before adopting a fresh release. Version-pin everything build-critical; pin CI actions to immutable references (full commit SHA, image digest), never to mutable tags. Direct agent commits are acceptable only for deterministic, well-tested automation like dependency bumps — and even then require CI to pass before auto-merge.

---

## D6 · Checkpointing is not version control `[SETTLED]`

**STATE.** Harness-level checkpoints have consistent, documented gaps: changes made through shell commands are typically not tracked; sub-agent edits are typically not restored; external modifications are invisible; symlinked and hard-linked paths may not be restored.

**RULE.** Commit as the real restore point. Use checkpoints for fast intra-turn undo only. Never let an unattended run go more than one logical step without a commit.

---

## D7 · Artifact, data, and provenance versioning `[SETTLED]`

**RULE.** Four things get versioned and signed independently: source (git), dependencies (lockfile + SBOM), build (provenance attestation verified at deploy, not only produced at build), and data/models (content-addressed store). Modern SBOM minimum-element sets now require component hash, license, tool name, and generation context — regenerate rather than patching old SBOMs.

---

## D8 · Repository as agent state `[MOVING]`

**STATE.** The emerging convention for fleets: agents do not talk to each other; they go through the repo. An agent commits its state; the next pulls and reads it.

**RULE.** Define a state directory with a schema (`.work/<task-id>/state.json`) if agents must hand off. Keep it out of the shipping artifact. Prefer this over message passing (see A5).

---

## D9 · Large-scale migration pattern `[SETTLED]`

**RULE.** Discover the target set → transform each item in an **isolated copy** so edits cannot conflict → verify each result independently → aggregate. Never let N agents edit one working tree. Cap concurrency at the harness limit and below your CPU core count.

---

# DOMAIN E — INFERENCE & SERVING OPTIMIZATION

> This is the domain where your hardware matters. Everything here assumes you are serving open-weight models locally alongside frontier API calls.

## E1 · The bottleneck model — read this first `[SETTLED]`

**STATE.** Two phases with opposite constraints:

| Phase | Bound by | Scales with | Optimize via |
|---|---|---|---|
| **Prefill** (processing input) | compute (FLOPs) | batch, sequence length | chunked prefill, quantization, cache reuse |
| **Decode** (generating output) | **memory bandwidth** | model size | quantization, speculative decoding, MLA-class models |

At batch size 1, every generated token reloads the whole model from memory once. **Tokens/sec ≈ memory bandwidth ÷ model bytes.** Two accelerators with equal bandwidth decode at the same speed even if one has six times the peak compute.

**RULE.** Size hardware from GB/s and GB of memory, not TFLOPS or TOPS. Compute matters for prefill, batch throughput, and training — not for interactive single-stream latency.

**Consequence for agents.** Agent workloads are prefill-heavy and prefix-repetitive (long stable context, short new turn). That makes **cache hit rate**, not raw decode speed, the dominant lever. See E3.

---

## E2 · Engine selection `[MOVING]`

| Engine | Core mechanism | Wins on |
|---|---|---|
| vLLM | PagedAttention (OS-style paging of KV blocks) | ecosystem breadth, hardware variety, encoder-decoder, largest contributor base |
| SGLang | RadixAttention (radix-tree prefix reuse) | prefix-heavy workloads, structured output, agent pipelines |
| TensorRT-LLM | ahead-of-time compiled kernels | standardized NVIDIA fleets where tail latency is the metric |
| FlashInfer | kernel backend under the above | new-architecture attention (MLA), FP4 kernels, multi-token prediction |
| MLX / llama.cpp | unified-memory native | Apple Silicon; LoRA on small models |

**Reported comparison** `[CONTESTED]`: RadixAttention gives roughly a 29% throughput edge over paged attention on one H100 harness (≈16.2K vs ≈12.5K tok/s), rising to multiples on prefix-heavy workloads like RAG and multi-turn chat.

**RULE.** For agent serving — long stable prefixes, heavy prompt reuse, structured tool-call output — prefer the prefix-reuse-native engine. For mixed hardware and breadth, prefer the paged engine. Benchmark your model, quantization, and concurrency; do not port a published number.

**WATCH.** On accelerators without high-speed interconnect, tensor-parallel synchronization over PCIe becomes the limiter at small message sizes; PCIe-optimized all-reduce paths matter more than the engine choice.

---

## E3 · KV cache — the six-layer strategy `[SETTLED]`

**STATE.** KV cache management is no longer "fit everything in HBM." Six layers operate simultaneously:

1. **Precision** — FP8 or 4-bit KV roughly halves or quarters capacity requirements. Quantization introduces measurable perplexity drift (single-digit percent, model-dependent) — validate on your eval, not on a paper.
2. **Architecture** — latent-attention (MLA-class) models reduce KV structurally, not just numerically. This is a model-selection decision with serving consequences.
3. **Fragmentation** — paged allocation eliminates the 60–80% waste of contiguous per-request allocation.
4. **Prefix sharing** — radix-tree reuse within an engine, plus a persistent cross-engine cache layer for reuse across queries and processes.
5. **Tiering** — a working heuristic across deployments: active KV from the last ~30 seconds in HBM, ~30 s–10 min in CPU RAM, beyond ~10 min on NVMe. Restore cost: hundreds of milliseconds from CPU over PCIe; ~2–3 s for a 128K-token KV from Gen5 NVMe. Pipeline a two-stage restore (NVMe → CPU → GPU) asynchronously for long-idle sessions.
6. **Isolation** — per-tenant TTL and fairness policy, or one heavy session starves the rest.

**RULE.** Instrument **KV cache hit rate as a first-class SLI**, next to latency and cost. For agent workloads it is the single number that predicts spend.

**Pre-warming.** If every session begins with the same large context (a codebase, a knowledge base), compute and store its KV during idle capacity rather than on the first live request. High-value for multi-tenant agents with stable per-tenant context.

**WATCH.** Storage path matters more than expected: direct GPU-to-storage paths (GPUDirect-class) bypass host RAM staging entirely, but require a sizeable pinned HBM staging buffer per GPU — budget it against your model's HBM allocation. Managed GPU services that abstract the hardware often block direct NVMe access, capping you at CPU-RAM offload.

---

## E4 · Phase disaggregation `[MOVING]`

**STATE.** Splitting prefill and decode across separate accelerator pools so a long prefill cannot stall interactive decoding. Reproduced in production by large-scale open-model deployments; also available in the "same-GPU" form as chunked prefill with stall-free scheduling.

**RULE.** Single node or few users: chunked prefill is sufficient and far simpler. Multi-node with a tail-latency SLO: disaggregate. The prerequisite is a fast KV transfer path between pools — that transfer, not the compute, is the design problem.

**WHEN NOT.** Below roughly a node's worth of sustained traffic, disaggregation adds a network hop to buy nothing.

---

## E5 · Speculative decoding `[MOVING]`

**STATE.** Lossless-output acceleration by drafting multiple tokens cheaply and verifying in one pass. Active families: self-speculation / multi-token prediction heads, EAGLE-family trained drafters, tree-structured drafts with adaptive shape, diffusion-model drafters, and runtime-learned adaptive speculators. Reported speedups vary widely by acceptance rate; batch interaction is nontrivial and gains compress at high batch sizes.

**RULE.** Speculative decoding attacks exactly the bottleneck agents suffer from (single-stream decode latency). Enable it for interactive paths. Measure **acceptance rate** — below roughly 60–70% the verification overhead eats the gain. Do not stack it with aggressive KV quantization without re-measuring; both perturb the distribution.

**WHEN NOT.** Throughput-oriented batch jobs at high concurrency, where the GPU is already saturated.

---

## E6 · Quantization `[MOVING]`

**STATE.** 4-bit floating-point formats with hardware tensor-core support on current-generation accelerators are the new default for weight-and-activation quantization; FP8 is the conservative choice; weight-only 4-bit integer methods remain the widest-compatibility option.

**RULE.** Quantize in this order and re-evaluate after each step: weights → KV cache → activations. Never quantize the verification path (the model or check that decides whether output is correct) at the same aggressiveness as the generation path. Keep a full-precision or higher-precision reference for eval.

**WATCH.** Confidential-computing modes on current accelerators can invert normal optimization direction because DMA concurrency changes — if you run in a TEE, re-tune from scratch rather than porting a config.

---

## E7 · Structured and constrained decoding `[SETTLED]`

**STATE.** Grammar-constrained generation guarantees syntactic validity of tool calls and JSON output. Some engines treat this as a first-class feature with materially better performance than bolt-on validators.

**RULE.** Every tool call and every inter-agent artifact goes through schema-constrained decoding where the serving stack supports it. Constrained decoding guarantees *shape*, never *semantics* — you still validate meaning downstream.

---

## E8 · Hardware tiers and role assignment `[MOVING]`

**STATE.** Local single-box classes as of mid-2026, and what each is actually for:

| Class | Memory | Distinguishing constraint | Best role |
|---|---|---|---|
| Unified-memory ARM+GPU dev box (~128 GB LPDDR5X) | large capacity, modest bandwidth | loads big models the bandwidth cannot race through | full CUDA parity for development; high-concurrency multi-agent serving of small models |
| Workstation GPU (~96 GB GDDR7 ECC, ~1.8 TB/s) | high bandwidth, high power (~600 W) | only class in the desk tier that trains anything serious | throughput serving; fine-tuning; the tokens/sec choice |
| Apple unified memory (~128 GB) | highest bandwidth in its class, silent | MLX/Metal, not a CUDA replacement | daily driver + local inference + LoRA on small models |
| Consumer flagship (~32 GB) | cannot hold a 70B at 4-bit (~35 GB) | excellent sub-30B | drafter models, embedding/rerank, small-model loop steps |
| Rack superchip (up to ~748 GB) | company budget | frontier open weights locally | shared team inference |

**RULE — role assignment, the highest-value decision in this domain.** Do not ask "which model can my hardware run." Ask "which *roles* should run locally." Assign by sensitivity to error and to latency:

| Role | Where | Why |
|---|---|---|
| Embedding, reranking, classification, extraction | **local** | small, batchable, bandwidth-cheap, high call volume |
| Drafter for speculative decoding | **local** | must be co-resident with the target |
| Pattern matching, lint triage, log parsing, commit-message drafting | **local, 3–9 B** | a small model handles most agentic loop steps faster and cheaper than a frontier call |
| Deterministic verification (tests, compilers, scanners) | **local, no model** | tier 1–2 of the enforcement ladder |
| Bulk read-only exploration and summarization | **local mid-size** | high token volume, low stakes per call |
| Architecture decisions, security adjudication, plan synthesis, adversarial verification | **frontier API** | error cost dominates token cost |
| Anything on a compliance or safety path | **frontier API** | capability floor is the requirement |

**Multi-agent economics** `[CONTESTED]`: pairing a strong orchestrator with a cheap local search/read sub-agent reportedly beats upgrading the orchestrator model. This matches the structure of agent work — most tokens are spent reading, few are spent deciding.

---

## E9 · Serving SLOs for agent workloads `[SETTLED]`

**RULE.** Define and alert on four numbers: **TTFT** (dominated by prefill and cache hit rate), **TPOT / inter-token latency** (dominated by bandwidth), **cache hit rate**, and **cost per completed task**. A representative production target for interactive agent serving is a p99 TTFT under ~500 ms alongside thousands of effective tok/s per node — reachable only when all six KV layers (E3) operate together.

**WHEN NOT.** Batch and overnight lanes should optimize throughput and cost, with latency unbounded. Run them as a separate serving profile, not the same one detuned.

---

# DOMAIN F — MODEL CUSTOMIZATION

## F1 · The cost ladder `[SETTLED]`

**RULE.** Climb only when the rung below demonstrably fails, and prove it with an eval:

```
1  better context / retrieval        (hours,   reversible,   no artifact)
2  skills, tools, and scaffolding    (days,    reversible,   versioned artifact)
3  prompt-level optimization + evals (days,    reversible,   measured)
4  LoRA / adapter on a small model   (weeks,   artifact to maintain)
5  RLVR on an executable environment (months,  environment to maintain forever)
6  full post-training                (rarely justified outside labs)
```

Most teams that reach for rung 4 have an unmeasured rung-1 problem.

---

## F2 · RLVR — the dominant post-training paradigm `[SETTLED]`

**STATE.** Reinforcement Learning from Verifiable Rewards has displaced preference-model RLHF for tasks where correctness is machine-checkable. Mechanism: the environment supplies the reward (compiler result, unit-test outcome, exact match, formal proof) instead of a learned reward model. The dominant optimizer is group-relative policy optimization, which removes the critic by sampling a group of responses per prompt (commonly 16) and normalizing advantage within the group — collapsing the four-model preference pipeline to roughly two.

**Applied to coding agents:** RLVR is run *inside the agentic scaffold*, optimizing the whole trajectory rather than single outputs. The agent operates in an instrumented repository exposing search, edit, and test-execution tools; candidate patches execute and return compilation and test signals as deterministic rewards with no human annotation. Reported training configurations reach 256K context and up to ~200 interaction turns per episode.

**Sequence-level importance sampling variants** improve stability, notably for mixture-of-experts models.

**RULE.** Prerequisites, all mandatory: a verifier you trust, an executable environment, and a held-out eval you did not train against. Missing any one means you will optimize a proxy.

**WHEN NOT.** Tasks whose success is a matter of judgment. Applying step-wise RLVR recipes to agent training with ambiguous intermediate rewards leads to suboptimal policies through distribution shift.

**WATCH.** Reward hacking. Binary test-passing rewards teach test-passing, which is not correctness. Hold out tests; vary the verifier; inspect failures manually and continuously.

---

## F3 · Environments as the real asset `[MOVING]`

**STATE.** The scarce input is not compute or data — it is **executable environments with trustworthy verifiers**. Public agentic training sets and scaffolds exist; the differentiator is domain-specific environments plus per-instance checkers. Self-evolving synthesis pipelines that generate tool-grounded interactions *together with* executable per-instance checkers are the current frontier for closing that gap without human annotation.

**RULE.** If you invest here, invest in the environment and the verifier, not the training run. The environment outlives every model generation; the fine-tune does not.

---

## F4 · Distillation `[SETTLED]`

**RULE.** On-policy distillation from a strong teacher into a small local model is the highest-return customization for the local roles in E8 (classification, extraction, triage, drafting). Multi-domain teacher mixtures outperform single-domain. This is rung 4 with far better economics than RLVR.

---

# DOMAIN G — NLP / REPRESENTATION LAYER

## G1 · Retrieval architecture has settled `[SETTLED]`

**STATE.** The 2023 "retrieve once, then generate" pattern is obsolete. The 2026 stack:

```
query rewriting → hybrid retrieval (BM25/SPLADE + dense) → RRF fusion
  → cross-encoder rerank (top 50–100) → optional graph hop
  → generator that may re-retrieve → continuous eval
```

**Four settled findings:**
1. **Dense-only lost.** Hybrid sparse+dense fused with reciprocal rank fusion beats either alone across public benchmarks. Dense wins paraphrase and concept; sparse wins exact terms, SKUs, error codes, proper nouns, rare vocabulary. Dense-only is now a code smell.
2. **Rerankers earn their cost.** A cross-encoder on top adds roughly 5–15 points of MRR on hard sets. Costs more per pair than the embedder, dramatically more accurate at fine-grained relevance.
3. **Agentic retrieval is real.** Retrieval as a tool the model calls repeatedly within one turn: inspect the question, decide if more evidence is needed, rewrite and re-search, generate only when sufficient. Cost is tokens and latency; benefit is fewer hallucinations on multi-hop and coverage of queries a single-pass retriever cannot answer.
4. **Long context did not kill retrieval.** Million-token windows make some cases optional, but cost and latency math still favors retrieval.

**RULE.** Never ship dense-only. Always rerank. Add the agentic loop only for multi-hop questions — it is not free.

---

## G2 · Component selection `[MOVING]`

| Layer | 2026 status | Selection rule |
|---|---|---|
| Embedder | LLM-derived embedders dominate; strong open multilingual and code-specific families | pick for your domain and language; **budget the re-embedding and index-migration cost of every future upgrade** |
| Reranker | consolidated to a small set of hosted and open cross-encoders | latency budget decides; measure MRR lift on your own hard set |
| Chunking | late chunking, semantic chunking, and recursive hierarchical summarization are the live techniques | passage-level indexing remains the deployed default for effectiveness and efficiency |
| Vector store | commodity | choose on ops burden and filtering capability, not ANN benchmark |

**WATCH `[SETTLED]`.** There are **theoretical limitations to embedding-based retrieval** — some relevance relations cannot be represented in a fixed-dimensional single-vector space at all. This is a structural argument for hybrid and for multi-vector or late-interaction approaches, not a tuning problem.

---

## G3 · Agentic memory `[MOVING]`

**STATE.** An active research frontier distinct from RAG: memory systems for long-horizon agents. Live directions include context-conditioned ("evolvable") representations that avoid stale retrievals when the same query means different things in different contexts, temporal-structure-aware memory (segment trees over event order), lightweight memory-augmented generation, and disk-persistent quantized KV as memory — the last reporting order-of-magnitude TTFT reductions by eliminating re-prefill, at the cost of quantization drift.

**RULE.** Treat agentic memory as `[MOVING]`. Build the interface (retrieve / write / forget with explicit schemas) and keep the implementation swappable. Do not couple business logic to a specific memory framework this year.

---

## G4 · Evaluation of retrieval and generation `[SETTLED]`

**RULE.** Five metrics, measured continuously, not once: **context recall**, **context precision**, **faithfulness / groundedness**, **answer relevance**, **hallucination rate**. Instrument both hops so an answer is traceable to specific retrieved chunks. Surface low-scoring traces into the next tuning round — otherwise you tune the chunker against intuition.

**LLM-as-judge:** usable, but calibrate against human labels on a fixed set and re-calibrate on every judge-model change. An uncalibrated judge silently redefines your quality bar.

---

## G5 · Non-autoregressive decoding `[SPECULATIVE]`

**STATE.** Diffusion language models have scaled to the ~100 B class and are being used as *drafters* inside speculative decoding — currently their most credible production role.

**RULE.** Monitor. Do not architect around them. The near-term value is as an acceleration component, not a replacement generator.

---

# DOMAIN H — EVALUATION & BENCHMARKS

## H1 · The benchmark hierarchy `[SETTLED]`

| Benchmark class | Measures | Frontier status 2026-08 |
|---|---|---|
| SWE-bench Verified | one scoped issue in a well-known Python repo | **saturated** — top models clustered within ~1 point |
| SWE-bench Pro | multi-file diffs, actively maintained repos, no ground-truth leakage | high but not saturated |
| Terminal-Bench 2.1 | real command-line work: builds, git, config | high |
| **Frontier-Bench** | **long-horizon professional task completion** | **~43%** |
| ARC-AGI-3 | novel reasoning, resistant to memorization | ~30% |

**RULE — the load-bearing inference of this entire file.** The gap between a saturated single-issue benchmark and a ~43% long-horizon benchmark tells you precisely where to spend engineering effort. Code generation is not the constraint. **Holding a long plan together is.** Every recommendation in Domains A, B, and C exists to close that specific gap: orchestration for plan persistence, context engineering for state retention, verification topology for error detection.

---

## H2 · Harness sensitivity `[SETTLED]`

**STATE.** Published numbers for the same model and benchmark diverge across sources — commonly attributable to different trial counts or different scaffolds. Divergences large enough to change a purchasing decision appear routinely.

**RULE.** Never cite a single benchmark number as a decision input. State the harness or do not state the number. When two sources disagree, the disagreement *is* the finding: the metric is scaffold-sensitive, which means **your scaffold is a bigger lever than your model choice.**

---

## H3 · Build your own eval `[SETTLED]`

**RULE.** Twenty to fifty real tasks from your own repository with known-good outcomes beats any public leaderboard for model selection. Report four numbers together: pass rate, **variance across runs**, median steps, and cost per solved task. Optimizing pass rate alone selects for expensive, high-variance configurations.

**Trajectory evaluation.** Score the path, not only the final state: unnecessary file reads, redundant tool calls, backtracking, and abandoned approaches all predict production cost and are invisible to outcome-only scoring.

---

# DOMAIN I — SECURITY & GOVERNANCE OF AGENT SYSTEMS

## I1 · The agentic threat model `[SETTLED]`

**STATE.** Three risk layers, each with its own published taxonomy: model-level (prompt injection, poisoning), tool-connection-level (the protocol layer between agent and external systems), and actor-level. The actor-level list — goal hijack, tool misuse, agent identity and privilege abuse, agentic supply-chain compromise, unexpected code execution, memory and context poisoning, insecure inter-agent communication, cascading failures, human-agent trust exploitation, rogue agents — exists because an agent with goals, credentials, tools, memory, and autonomy over many steps is a different object than a text generator.

**RULE.** Enumerate every agent, every tool it can reach, and every credential it holds. You cannot govern an inventory you do not have.

---

## I2 · Trust boundaries `[SETTLED]`

**RULE.** Retrieved content, tool output, file contents, issue bodies, PR titles, branch names, commit messages, and webhook payloads are all **untrusted input**. Never interpolate them into a command line or treat them as instructions. Note that well-designed harnesses restrict privileged opt-in keywords to input the human physically typed, specifically so a relayed payload cannot escalate — mirror that principle in anything you build.

**Structural mitigation.** Separate the channel carrying instructions from the channel carrying data. If they share a channel, injection is a design property, not a bug.

---

## I3 · Least capability and identity `[SETTLED]`

**RULE.** Per-tool permissioning, not per-agent. A summarization agent gets a read-only role; an integration agent gets one scoped token. Every agent is a non-human identity with an owner, a TTL, short-lived credentials via workload identity or OIDC, and an audit trail. No long-lived keys in an agent's reach. Where the harness supports credential masking inside a sandbox, use it: the agent should never hold a real secret to leak.

**Human checkpoints.** Irreversible actions require explicit approval regardless of permission mode. Define the irreversible set explicitly — deletion, production deploy, external send, payment, credential rotation.

---

## I4 · Supply chain of agent configuration `[MOVING]`

**STATE.** Plugins, tool servers, skills, and marketplaces are executable configuration. They are part of your trusted computing base and are a current attack vector.

**RULE.** Pin, review, and restrict marketplace sources. Enforce the allowed set through managed policy so it cannot be widened locally. Audit configuration changes to an append-only log. Verify archive integrity on install.

---

# DOMAIN J — QUANTUM COMPUTING: HONEST POSITIONING

## J1 · Where the field actually is `[SETTLED]`

**STATE.** 2026 is the year quantum error correction crossed from research demonstration to engineering discipline. Concretely: below-threshold error suppression demonstrated (logical error rates *decrease* as lattice size grows, roughly ~2× per code-distance step on a ~105-physical-qubit superconducting chip); 12 logical qubits at a logical error rate of ~2×10⁻³ demonstrated on a trapped-ion system in March 2026, used to simulate the chromium dimer ground state; a ~4,158-physical-qubit modular system targeting demonstrated advantage on a useful workload by end of 2026; new code constructions combining LDPC and concatenated codes to lower both space and time overhead.

**The tension, stated plainly:** the physics is mature, the engineering is accelerating, and the gap between what has been demonstrated and what is commercially useful remains wide. Advantage claims in this period are `[CONTESTED]`.

---

## J2 · Timeline `[CONTESTED]`

| Horizon | Expectation |
|---|---|
| Now | cloud pay-as-you-go QPU access; hybrid quantum-classical pipelines as the deployment model; industrial pilots in pharma, catalysis, materials |
| 2027–2028 | first early fault-tolerant circuits; logical operations on ~5–20 logical qubits; practical advantage on chemistry workloads |
| End of decade | credible cryptographic threat horizon |

**Metric note.** Practitioners argue the meaningful 2026 measure is **quantum operations executed reliably**, not logical qubit counts or advantage headlines. Treat qubit-count press releases as marketing.

---

## J3 · What is actionable for you right now `[SETTLED]`

**Exactly one thing has hard dates: post-quantum cryptography migration.**

| Date | Obligation |
|---|---|
| 2030 | quantum-vulnerable public-key algorithms (RSA, ECDSA, ECDH, FFDH) **deprecated** — continued use requires documented risk acceptance |
| 2035 | **disallowed** — the risk-acceptance option is removed |

**RULE.** The gap to close this quarter is not "adopt PQC" — it is **cryptographic inventory**. In complex estates the inventory phase alone runs six to twelve months. Then: crypto agility (can you change an algorithm without touching fifty call sites?), then hybrid classical+PQC key establishment during transition. Harvest-now-decrypt-later means data with long confidentiality requirements is already exposed to collection today.

**Severity guidance.** No inventory → `High`. Inventory without a migration plan → `Medium`. Plan in execution → `Low`.

---

## J4 · Where quantum meets your actual workload `[SETTLED]`

| Claim | Verdict |
|---|---|
| Quantum will accelerate LLM training or inference | **No.** Not this decade. Do not plan around it. |
| Quantum ML will outperform classical on your data | **No** credible near-term case at your scale. |
| Quantum-inspired *classical* solvers deliver value now | **Yes** — for combinatorial optimization: scheduling, routing, portfolio, resource allocation. This is classical software with quantum-derived algorithmic structure, available today. |
| Hybrid pipelines are the realistic deployment shape | **Yes** — a QPU handles one bounded bottleneck inside a larger classical pipeline. Relevant if you have a chemistry, materials, or specific optimization kernel. |
| Quantum breaks your crypto soon | **Not yet**, but J3 obligations are already binding. |

**RULE.** Allocate quantum effort as: 90% PQC migration, 10% monitoring. If you have a genuine combinatorial optimization bottleneck, evaluate quantum-inspired classical solvers — that is a normal software procurement decision, not a quantum program.

**WATCH — trigger conditions that would change this entry.** Logical qubit counts reaching the low hundreds with error rates below ~10⁻⁶; a *reproduced, uncontested* advantage result on a workload resembling yours; a FIPS-level standard for hybrid key establishment.

---

# DOMAIN K — PROCESS ECONOMICS

## K1 · Measure cost per completed task `[SETTLED]`

**RULE.** Token price is not cost. The metric is **cost per successfully completed and merged task**, including failed attempts, review time, and rework. A model at twice the token price that fails half as often on long-horizon work is cheaper. This is the only framing under which frontier-versus-local decisions resolve correctly.

---

## K2 · Routing `[SETTLED]`

**RULE.** Route by task shape, not by default:

| Task shape | Route |
|---|---|
| High-volume, low-stakes, verifiable | smallest local model that passes your eval |
| Bulk reading and summarization | mid-size local |
| Decisions where being wrong is expensive | frontier, high reasoning effort |
| Long-horizon autonomous runs | most capable available; a failed multi-hour run wastes more than the token delta |
| Adversarial verification | different model or context from the generator — independence matters more than capability |

Where the harness exposes a reasoning-effort dial, treat it as the primary cost lever: it is finer-grained and more reversible than switching models mid-flow (which also invalidates the prompt cache — see B2).

---

## K3 · Cache economics `[SETTLED]`

**RULE.** For agent workloads, **cache hit rate is the primary cost KPI**. It dominates model choice and quantization in total spend. Protect it structurally: append-only context (B2), stable system prefixes, no mid-run configuration changes, pre-warmed caches for stable large contexts (E3).

---

## K4 · Runaway detection `[SETTLED]`

**RULE.** Every autonomous run needs three caps and one alarm: max concurrent agents, max total agents, max token projection, and an alert when projected spend crosses a threshold. Calibrate on a slice — one directory, one narrow question — before committing to full scope. A run you cannot stop mid-flight without losing all progress is a design error (see A2).

---

## K5 · Batch and offline lanes `[SETTLED]`

**RULE.** Separate serving and pricing profiles for interactive versus batch. Anything without a human waiting (nightly scans, bulk embedding, regression evals, index rebuilds, drift audits) goes to the batch lane at a fraction of the cost and with latency unbounded.

---

# APPENDIX 1 — FLOW SELECTION TABLE

Match the task shape to the flow. This is the fastest path from "what am I doing" to "how should it be structured."

| Task shape | Flow | Isolation | Verification | Domain refs |
|---|---|---|---|---|
| One scoped bug | single agent, plan mode, failing test first | branch | test suite | C1, C3 |
| Feature touching several files | supervisor + 2–4 workers | worktree per worker | tier 2–4 + PR review | A1, C4, C5 |
| Audit N files for the same property | **workflow-as-script**, one agent per file | read-only | adversarial verifier per finding | A2, A3 |
| Migration across N files | workflow, isolated copy per file | worktree per item | per-item verify + aggregate | A2, D9 |
| "Fix until the check passes" | loop with progress condition and iteration cap | branch | the check itself is the verifier | C1, K4 |
| Research across many sources | fan-out readers → cross-check → synthesize | none | quorum vote; keep `unverifiable` | A1, A3 |
| Hard architectural decision | independent plans from N angles → weigh | none | human approves the plan, not the diff | A3, C1 |
| Continuous drift detection | scheduled / event-triggered run on the delta | ephemeral | deterministic gates | C7, D5 |
| Long unattended autonomous run | most capable model, sandboxed, small-agent fan-out | container or VM | tier 1 hooks + commit per step | A2, A4, D6 |

---

# APPENDIX 2 — ANTI-PATTERN INDEX

| # | Anti-pattern | Why it fails | Correct move |
|---|---|---|---|
| 1 | Orchestration complexity ahead of workload complexity | pays for infrastructure the task does not need | A1 |
| 2 | Self-review by the generating context | no independence; confirms rather than checks | A3 |
| 3 | Mutating earlier context to "clean it up" | destroys cache continuity from that point on | B2 |
| 4 | Relying on compaction to preserve invariants | compaction is lossy by construction | B3 |
| 5 | LLM-generated instruction files | measurably lowers success, raises cost | B5 |
| 6 | Regex-parsing another agent's markdown | brittle, silent failure | B6 |
| 7 | Sizing hardware from TOPS | decode is bandwidth-bound | E1 |
| 8 | One number from one benchmark as a decision input | scaffold-sensitive | H2 |
| 9 | Optimizing pass rate alone | selects high-variance, high-cost configs | H3 |
| 10 | Fine-tuning before instrumenting context | solves the wrong rung | F1 |
| 11 | Binary test-pass reward without held-out tests | teaches test-passing, not correctness | F2 |
| 12 | Dense-only retrieval | loses exact-match queries entirely | G1 |
| 13 | Uncalibrated LLM-as-judge | silently redefines the quality bar | G4 |
| 14 | Instructions where mechanisms belong | requests are not guarantees | C3 |
| 15 | Agent mega-PR | unreviewable; skimmed and approved | C4, D3 |
| 16 | Checkpoints as the restore strategy | does not cover shell or sub-agent edits | D6 |
| 17 | N agents in one working tree | edit conflicts, corrupted state | A4, D9 |
| 18 | Treating retrieved content as instructions | injection by design | I2 |
| 19 | Long-lived credentials in agent reach | one compromise is total | I3 |
| 20 | Planning around quantum for AI workloads | no near-term path | J4 |
| 21 | Expanding autonomy on a weak foundation | AI amplifies dysfunction | C7 |
| 22 | Optimizing token price instead of cost per merged task | selects the wrong model | K1 |

---

# APPENDIX 3 — SPECIALIZATION HOOKS

This map is deliberately hardware-agnostic and stack-agnostic. Four inputs collapse most of it into concrete numbers:

1. **Accelerator memory capacity and bandwidth (GB, GB/s), interconnect, and count** — determines E8 role assignment, largest local model, and whether E4 disaggregation is even relevant.
2. **System RAM and NVMe generation/capacity** — determines the E3 tiering policy and whether direct GPU-to-storage KV offload is available.
3. **Language and repository shape** (monorepo vs multi-repo, typed vs untyped, LOC, service count) — determines whether code intelligence pays, whether stacking or parallel PRs fit, and the D-domain tooling choices.
4. **Where the agents run** — local, cloud, or self-hosted runners — determines the I-domain isolation and identity model.

Absent these, apply the `RULE` lines as written and treat every number as a starting hypothesis to be measured, not a target to be hit.

---

# APPENDIX 4 — VERIFY BEFORE RELYING

| Area | Half-life | Verify at |
|---|---|---|
| Agent harness capabilities | weeks | vendor docs index, changelog |
| Inference engine features and perf | weeks | engine release notes; re-benchmark |
| Model benchmark scores | days | multiple trackers; note the harness |
| Hardware availability and price | weeks | current listings — prices moved substantially in 2026 |
| Embedding and reranker leaderboards | months | public leaderboards + your own hard set |
| Standards versions (security, SBOM, supply chain) | quarters | issuing body directly |
| Regulatory dates | quarters | official register; dates shifted during 2026 |
| Quantum milestones | quarters | primary announcements; treat aggregators as unreliable |
| PQC deprecation dates (2030 / 2035) | stable | the controlling standard |

**Closing rule.** When this file disagrees with the tool in front of you, the tool is right. Verify, correct the entry, and record what changed. A reference that is not updated is the first gap to close.
