<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Engineering Doctrine — patterns, when to use them, and where the truth lives

> The engineering pattern REFERENCE CATALOG — RAG-indexed and retrievable
> like every doc here, though the firing prompt does not name it directly
> (its "Research first" rule points at official docs). Covers the FULL
> canonical pattern landscape and HOW TO CHOOSE. Sources are the most
> authoritative catalogs in the field — never re-research what this file
> already answers; DO verify version-specific details against the live
> official docs of the library at hand.

## 0. The decision doctrine (read this first)

1. **Constraints before patterns.** Name the quality attributes that actually
   matter here (performance, modifiability, security, availability,
   testability — the SEI method), THEN pick structure. A pattern chosen
   before its constraint is decoration.
2. **The simplest thing that works wins.** A pattern earns its complexity
   only when the constraint is real (KISS/YAGNI). Modular monolith before
   microservices; function before framework.
3. **Research first.** For any non-trivial decision: consult this doctrine →
   the canonical catalog for that layer (§6) → the library's OFFICIAL docs.
   Prefer a battle-tested, actively-maintained open-source package over
   hand-rolled code (vet: maintenance cadence, adoption, license, security
   posture — see §7).
4. **Record the decision.** A chosen architecture/pattern goes in the commit
   body or docs/ — the next firing must find WHY, not just WHAT.

## 1. Architecture styles (the coarsest grain — pick ONE spine)

| Style | Use when | Avoid when |
|---|---|---|
| **Layered** | Clear abstraction tiers (UI/domain/data); team familiarity matters | Layers would just proxy calls through |
| **Hexagonal / Ports & Adapters** | Core logic must stay testable + tech-agnostic (AUTOPILOT's engine is built this way) | Tiny scripts/tools |
| **Modular monolith** | One deployable, clean internal module seams; DEFAULT for new products | Independent scaling/deploy per module is a REAL need |
| **Microservices** | Independent deploy/scale/ownership per capability, org is ready to operate it | Small team; latency-sensitive in-process calls; no ops maturity |
| **Service-based** | Coarse services without full microservice ops burden | — |
| **Service-oriented (SOA)** | Enterprise integration across heterogeneous systems | Greenfield products |
| **Event-driven** | Async reactions, decoupled producers/consumers, spiky load | Simple request/response CRUD |
| **Pipes & Filters** | Data flows through composable transform stages (our gate chain) | Rich shared state between stages |
| **Microkernel (plug-in)** | Stable core + extensible plug-ins (IDEs, our detector registry) | No third-party extension story |
| **Space-based** | Extreme scale, in-memory data grids, tuple spaces | Almost everything else |

## 2. System-level architecture patterns

Resilience: **Circuit Breaker · Retry (with backoff+jitter) · Throttling /
Rate limiting** (we ship one: `rate-limit.ts`) **· Queue-based load leveling ·
Competing consumers**.
Data/consistency: **Saga** (distributed transactions) **· Inbox/Outbox**
(exactly-once messaging) **· Claim-Check** (big payloads out-of-band) **·
CQRS** (read models ≠ write models — our fleet view IS a read model).
Evolution: **Strangler Fig** (incremental replacement) **· Public vs
Published interfaces** (what you may still change).
Topology: **Client–server · Peer-to-peer · Pub/Sub · Request–response ·
Backends-for-Frontends · Blackboard · Rule-based**.

## 3. Design patterns (GoF, in-process grain)

Creational: **Factory Method · Abstract Factory · Builder · Prototype ·
Singleton** (rarely — prefer DI).
Structural: **Adapter** (our Ports/Adapters seam) **· Bridge · Composite ·
Decorator** (our RemediatingGate wraps GateRunner) **· Facade · Flyweight ·
Proxy**.
Behavioral: **Chain of Responsibility · Command · Iterator · Mediator ·
Memento · Observer** (our SSE stream) **· State** (our resilience machine) **·
Strategy · Template Method · Visitor**.
Rule of thumb: patterns are VOCABULARY, not goals — name them when they
emerge from the constraint; never install one for its own sake.

## 4. Enterprise application patterns (Fowler PoEAA)

Domain logic: Transaction Script → Domain Model → Table Module (in rising
domain complexity). Data access: Repository (we use it) · Data Mapper ·
Active Record · Unit of Work · Identity Map · Lazy Load. Web: MVC · Page/
Front Controller · Template View. Concurrency/state: Optimistic vs
Pessimistic locking (our tasks use CHECK-guarded optimistic writes).

## 5. Integration & messaging (EIP — 65 patterns)

Channels (p2p, pub-sub, dead-letter) · Messages (command/document/event) ·
Routing (content-based router, splitter, aggregator, scatter-gather) ·
Transformation (envelope, enricher, claim-check, normalizer) · Endpoints
(polling consumer, event-driven consumer, idempotent receiver) · Management
(control bus, wire tap — our activity feed is a wire tap).

## 6. The canonical source registry (each layer's ground truth)

| Layer | Canonical source |
|---|---|
| Foundational architecture | POSA vol. 1–5 (Buschmann/Schmidt et al.) — vol. 4 links hundreds of patterns into one language; vol. 5 is the reference manual |
| Enterprise app internals | Fowler, *PoEAA* — official catalog: martinfowler.com/eaaCatalog |
| Integration/messaging | Hohpe & Woolf, *EIP* — enterpriseintegrationpatterns.com (65 patterns, the de-facto async vocabulary) |
| Cloud/distributed | Azure Architecture Center patterns — learn.microsoft.com/azure/architecture/patterns (tech-agnostic; sample repo: github.com/mspnp/cloud-design-patterns) |
| Microservices | Richardson's pattern language — microservices.io/patterns |
| How to CHOOSE (methodology) | Bass/Clements/Kazman, *Software Architecture in Practice* (SEI, 4th ed.) — quality-attribute-driven selection |
| GoF teaching reference | refactoring.guru/design-patterns (the operator's chosen teaching source) + the original *Design Patterns* (Gamma et al.) |
| Style/pattern index | en.wikipedia.org/wiki/List_of_software_architecture_styles_and_patterns |
| Ops discipline | 12factor.net · OWASP ASVS/Top-10 · Google SRE book |

## 7. Package-vetting protocol (before adopting ANY dependency)

1. **Maintenance**: commits/releases in the last 6 months; responsive issues.
2. **Adoption**: meaningful downloads/stars relative to niche; used by
   projects we respect.
3. **License**: compatible (MIT/Apache/BSD/OFL); recorded in LICENSES/.
4. **Security**: no known CVEs; no install scripts unless justified
   (pnpm onlyBuiltDependencies is our gate); minimal transitive surface.
5. **Fit**: solves ≥80% of the need without wrapping half of it.
6. Prefer the platform (Node stdlib, SQLite, CSS) when it is enough.
