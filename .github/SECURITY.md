<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Security Policy

AUTOPILOT is a local-first, autonomous engineering agent. Security is a
first-class requirement, not an afterthought (see
[`docs/PATTERNS-AND-STANDARDS.md`](../docs/PATTERNS-AND-STANDARDS.md) §2).

## Supported versions

During pre-1.0 development, only the latest `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via GitHub's **[Private Vulnerability Reporting][pvr]**
("Security" tab → "Report a vulnerability") on this repository.

Please include: affected component, reproduction steps, impact assessment, and
any suggested remediation.

## Disclosure SLAs

We follow a coordinated-disclosure model:

| Stage                                                    | Target              |
| -------------------------------------------------------- | ------------------- |
| **Acknowledge** the report                               | within **48 hours** |
| **Initial assessment** + severity triage                 | within **7 days**   |
| **Fix or mitigation** for confirmed high/critical issues | within **30 days**  |

We will keep you informed throughout and credit you (if desired) once a fix ships.

## Our security posture

- **Local-first / confidential** — project content never leaves the machine
  except through the user's own Claude account; local offload stays on-device.
- **No secrets in the repo** — CI secret-scan + no-personal-paths gates on every
  change; credentials come from the user's own keychain (the Claude CLI's auth),
  never stored by us.
- **Hardened dashboard** — CSP (nonce-based), DNS-rebind guard, per-route rate
  limits, path-traversal guards (applied from M3 onward).
- **Supply chain** — pinned dependencies + lockfile integrity (SLSA-aligned),
  reputable/official sources only, dependency audit in CI.
- **LLM safety** — untrusted project content is framed as data, never
  instructions (`<<< PROJECT_CONTENT >>>`); agent tool authority is mode-gated;
  security-sensitive fixes are propose-for-approval, never silent.

[pvr]: https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability
