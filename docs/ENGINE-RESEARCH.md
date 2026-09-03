# Engine Research — the internal predecessor Autopilot as the base, and the SOTA product engine

> **Purpose.** The internal predecessor autopilot (the internal v2.4 loop script + prompt + telemetry + report + local_llm) is
> the **research base and working prototype** for AUTOPILOT. It has several genuinely brilliant solutions — and a few
> concrete inefficiencies the *product* must beat, using the latest knowledge. This document catalogs both, grounded in
> the **real mechanism** and **87 firings of production telemetry** (not opinion), and derives the efficiency
> architecture for the product engine.
>
> **Method (the ethos we keep).** Test, don't assume; measure the dominant cost before optimizing; name the dead-ends
> honestly. Every number below is from the actual metrics file, not estimated. This mirrors the rigor of the
> *"Wheel/Proof/Ladder"* investigation the founder referenced — and, as shown in §4, that investigation's efficiency
> principles map almost one-to-one onto autopilot efficiency.

---

## 1. The measured efficiency profile (87 firings, $906)

| Metric | Value | What it means |
|---|---|---|
| Ship-rate (last 10) | 100% | the loop reliably ships verified work |
| Cost / shipped | **$6** (from $42 early) | already an 85% improvement across prompt versions |
| Output tokens (total) | 5.1M | the actual "thinking + writing" |
| **Cache-read tokens (total)** | **639M** | the re-orientation context re-read **every firing** |
| **Cache-read : output ratio** | **124 : 1** | the dominant token *volume* is re-reading the project, not producing |
| Avg per firing | 7.3M cache-read · 59k output · **$10.4** | |
| Model split | 32 fable · 55 opus; recent = **100% opus** | fable exhausted; everything runs on the expensive tier |
| **Local offload** | **0%** (grep-confirmed) | the free local GPU is idle; 100% of work hits the paid API |
| Cost by kind | feat $290 · **docs $71 · test $43 · fix $37 · refactor $26** | a large share is *mechanical* work paid at top-tier rates |

**Two Amdahl-dominant costs jump out** (optimize the big share, not the 2.4% one — §17/§12 of the referenced doc):
1. **The paid cloud model at top tier for everything**, including mechanical work → the price lever.
2. **639M cache-read** — full re-orientation from scratch each firing → the volume lever.
Everything else (reprobe waste, self-report gaps) is micro-optimization on a small share.

---

## 2. The genius solutions (carry forward, generalize)

These are the crown jewels — keep them, make them project-agnostic.

| # | Solution | Why it's genius | In the product |
|---|---|---|---|
| G1 | **External loop over `claude -p`** | autonomy decoupled from any live session; restart-safe; re-orients each firing | keep; port to cross-platform TS |
| G2 | **Un-fakeable telemetry** — envelope facts + self-report, cross-checked by **sha + HEAD-advance** | the agent *cannot lie* about what it shipped; git is ground truth | keep; the core trust primitive |
| G3 | **Graceful telemetry degradation** — infer item/sha from the commit when self-report is skipped | observability never goes fully blind | keep |
| G4 | **Atomic firing** — one unit, METRICS emitted at commit (first-match capture) | beats truncation; bounds run length | keep |
| G5 | **The gate** — typecheck+test+build, revert-clean on red, never leave the tree red | zero-trust: every change is verified or reverted | keep; make gate-detection automatic |
| G6 | **Model resilience** — fallback + promote-on-exhaustion + time-based reprobe | adapts to per-model quota exhaustion | keep + extend (§3) |
| G7 | **Quota safety** — budget cap, adaptive cadence, weekly pacing, **global-exhaustion hibernation**, STOP-aware sleep | never spins into the wall; self-throttles | keep |
| G8 | **Learnings + retro** — append-only evidence-backed rules, curated every 10th firing | self-improvement from its own mistakes | keep; surface in the dashboard |
| G9 | **Propose-for-approval defer zones** — pixels/forks/safety deferred with a recommendation | knows the limit of what it can verify unattended | keep; this IS the 🟣 gate |
| G10 | **Lock/mutex + graceful STOP + persisted state** | safe single-instance control, restart-safe | keep; per-project |
| G11 | **Decision lifecycle** (DECISIONS↔APPLIED, reconcile, disjointness invariant) | honest, testable human-decision tracking | keep; generalize into the board |

---

## 3. The inefficiencies (evidence-based) — and the SOTA fix

| # | Inefficiency | Evidence | SOTA fix in the product |
|---|---|---|---|
| **I1** | **Local model unused (0%)** — 100% of work on paid opus | grep: 0 `local_llm` calls in 87 firings | **Make local offload a DEFAULT** for mechanical sub-work (bulk transforms, test scaffolds, summarizing tool output, first drafts). The engine routes the *grunt* to the local GPU (free, confidential); the cloud model verifies + gates. The single biggest lever. |
| **I2** | **No model-tier routing** — every firing at opus-xhigh, incl. mechanical i18n/docs/test | docs $71 + test $43 + refactor $26 + much of "?" $349, all at top tier | **Cost-aware routing by task complexity**: mechanical → cheap tier / local; hard reasoning/security/architecture → top tier. Classify per firing (or let the triage sub-agent tag complexity). |
| **I3** | **Full re-orientation every firing** — re-reads repo/docs from scratch | **639M cache-read, 124:1 vs output** | **Incremental project state** (the *rolling-residue* principle §4): maintain a persistent, incrementally-updated project index/map; a firing loads a small delta, not the whole world. Structure the context so the **stable prefix** (soul/rules/index) maximizes prompt-cache hits and the **volatile suffix** is just the task. |
| **I4** | **Full test suite every firing** | the gate runs all ~1000 tests per firing | **Test-impact analysis** (the *Merkle spot-check* principle §4): run only the tests affected by the diff, plus a periodic full run. Verify a *slice*, full-verify on a schedule — same correctness confidence, a fraction of the compute. |
| **I5** | **Serial firings** | one unit at a time per project | **Batch independent sub-tasks** (the *Nanite/batching* principle §4) + **multi-project parallelism** (the supervisor). Independent work runs concurrently. |
| **I6** | **Wasted fable reprobe** | each reprobe pays a failed fable attempt | parse reset windows where available; smarter probe schedule; small share (micro-opt). |
| **I7** | **Windows-only PS + unbounded JSONL, no query layer** | `.ps1` + append-only `.jsonl` | **cross-platform TS engine + SQLite** (indexed, queryable) — structure for the access pattern (dashboards, per-dimension rollups) instead of full-scans. |
| **I8** | **Self-report ~72–80%, not 100%** | metrics: 20–28% inferred | enforce the report **at the harness layer** (structured output), not by model compliance. |
| **I9** | **Static prompt/soul file, manual retro** | `AUTOPILOT-PROMPT.txt` + every-10th retro | structured, versioned, per-project **editable soul** + **continuous anomaly detection** as a sub-agent (not only every 10th). |

---

## 4. Efficiency principles — mapped from the referenced investigation

The founder's *"Wheel/Proof/Ladder"* investigation is, underneath the number theory, a manual of efficiency
principles. They transfer almost verbatim to an autonomous engineering agent:

| Principle (from the investigation) | Autopilot translation | Attacks |
|---|---|---|
| **Amdahl's Law** — optimize the *dominant* cost, not the 2.4% one | the dominant costs are (a) top-tier model for all work, (b) 639M re-orientation. Fix those first. | I1, I2, I3 |
| **Remove per-item overhead / batch** (Nanite meshlets; vectorized RNS) | route mechanical grunt to free/cheap compute; batch independent sub-tasks | I1, I2, I5 |
| **Rolling residues** — track state incrementally, don't recompute from scratch | persistent incremental project index instead of full re-orientation each firing | I3 |
| **Merkle spot-check** — sample-verify instead of full re-verification | test-impact analysis: run affected tests + periodic full, not all-tests-every-time | I4 |
| **Quantization** — "the largest verified lever" (INT8/FP8) | run local offload models quantized for speed on the founder's GPU | I1 |
| **Structure for the access pattern** (indexed vs full scan) | SQLite telemetry + a project index, not JSONL full-scans | I3, I7 |
| **Test, don't assume; disclose dead-ends** | already our ethos — the gate (G5), un-fakeable telemetry (G2), learnings (G8) | (keep) |

**The headline, Amdahl-honest:** the product's biggest efficiency win is **not** shaving turns — it is **(a) moving the
grunt off the paid top-tier model (routing + local offload)** and **(b) not re-reading the whole project every firing
(incremental state + cache-optimized context)**. Those two attack ~100% of the dominant cost. Everything else is polish.

---

## 5. The SOTA product engine — efficiency architecture

The AUTOPILOT engine is the v2.4 loop, generalized, with the §3 fixes built in from day one:

1. **Router (cost-aware)** — per unit of work, choose the cheapest capable executor: **local model** (mechanical, confidential) → **cheap cloud tier** (routine) → **top tier** (hard reasoning / security / architecture). Verification/gate always on the responsible tier. *(latest-knowledge refs: cost-aware LLM pipelines, agentic eval-first routing.)*
2. **Incremental project model** — a persistent, versioned index of the repo (structure, gate command, conventions, hot files, open work), updated by *delta* each firing. The firing prompt = **stable cached prefix** (soul + index) + **small volatile task** → maximizes prompt-cache hits, collapses the 124:1 re-read.
3. **Sampling gate** — test-impact analysis (affected tests) + scheduled full runs; the same revert-on-red guarantee at a fraction of the compute.
4. **Triage sub-agent** (from the master plan §16.2) — continuously feeds the board from inbox + repo + backlog, tags severity × dimension (the progression gauge), keeps the loop fully autonomous.
5. **Structured telemetry** — SQLite, indexed for the dashboard's graphs + per-dimension rollups; the METRICS contract enforced at the harness, not by model compliance.
6. **Parallelism** — independent sub-tasks batched; multiple projects run concurrently under the supervisor.
7. **Everything the prototype already nails** — un-fakeable sha/HEAD telemetry, atomic firing, quota-safe hibernation, propose-for-approval, learnings/retro — carried forward unchanged (§2).

---

## 6. Prioritized efficiency levers (do these first)

1. **Local offload as default for mechanical work (I1)** — from 0% → a large share of grunt on the free local GPU. *Biggest single cost + quota win.*
2. **Cost-aware model routing (I2)** — stop paying top-tier for docs/test/i18n. *Direct multiplier on cost/shipped.*
3. **Incremental project state + cache-optimized context (I3)** — collapse the 639M / 124:1 re-read. *Biggest token-volume win.*
4. **Sampling gate / test-impact (I4)** — cut per-firing gate compute. *Speed + cost.*
5. **Structured, enforced telemetry + SQLite (I7, I8)** — 100% observability + queryable graphs.
6. Parallelism, reprobe polish, continuous anomaly detection (I5, I6, I9) — after the big three.

---

## 7. Honest limits (the ethos)
- Numbers here are from the predecessor's telemetry on *one* project (TS/React). Routing/impact thresholds must be re-measured per project type.
- "Cheap tier / local for mechanical" assumes the classifier is reliable; misroute must fail *safe* (escalate to top tier + verify), never ship unverified local output.
- Incremental state must be *invalidation-correct* (a stale index is worse than a fresh read) — treat it like a cache with content-hash invalidation.
- The local-model quality gap is real; the cloud model + gate remain the verifier of record. Offload the grunt, never the judgment.

---

*Base: the internal autopilot v2.4 (proven, 87 firings, SOTA). Target: the AUTOPILOT product engine — same genius, far more efficient. Living doc; feeds `MASTER-PLAN.md` §13 roadmap and `BACKLOG-999.md`.*
