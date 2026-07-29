# P4 — Sepolia and release hardening

Status: `not_started`

## Objective

Turn the G7 product into a cleanly reproducible release candidate whose code,
deployment, public claims, evidence, dependencies, and recovery procedures agree.

## Prerequisites

- P3 is complete and G7 is passed.
- Primary success and recovery browser journeys pass against the canonical manifest.
- No feature or architecture change is accepted during hardening without returning
  to the owning upstream gate.

## Work-item register

| ID | Outcome | Primary artifacts | Required checks | Intended commit |
|---|---|---|---|---|
| REL-01 | Reproducible build freeze | Engines, lockfile, compiler/settings, generated bindings | clean `npm ci`, compile/build twice, artifact hashes | `build: freeze release toolchain and artifacts` |
| REL-02 | Verified deployment | Canonical manifest, verified sources, runtime/ABI hashes | RPC re-read, constructor args, target provenance | `docs: publish verified sepolia manifest` |
| REL-03 | Security/quality closure | Static, dependency, license, secret, fuzz, coverage reports | no unresolved stop-ship/high-critical issue | `test: close release security gates` |
| REL-04 | Clean reproduction | Fresh-checkout run record and deterministic outputs | install, doctor, offline checks, Sepolia reads and named live cases | `test: prove clean release reproduction` |
| REL-05 | Recovery operations | Recovery, automation, indexer, RPC/gateway outage runbooks | live/read rehearsals and funds-location audit | `docs: add operational recovery runbooks` |
| REL-06 | Documentation/claims sync | Setup, usage, deployment, security, verification, feedback | link/command check, P1–P7 claim audit | `docs: finalize release documentation` |
| REL-07 | Risk and exception closure | Risk register, ADRs, accepted limitations | owner/date/evidence for every residual risk | `docs: close release risks and limitations` |
| REL-08 | G8 evidence and readiness | G8 report, evidence ledger, release checklist | evidence validator, clean worktree, complete traceability | `docs: record release readiness evidence` |

## Freeze policy

After REL-01 begins:

- Feature scope, public interfaces, contract behavior, and design tokens are frozen.
- A correctness fix returns to its owning phase/gate, receives focused tests/evidence,
  then re-runs every affected downstream gate.
- Lockfile changes require dependency/license/advisory re-scan.
- Contract/config changes require new deployment, manifest, generated bindings, live
  cases, and verifier evidence; an address is never silently reused.
- Documentation-only fixes still run link, command, secret, and claim checks.

## REL-01 — Reproducible build freeze

Acceptance:

- Exact Node/npm engines and direct dependencies match G0 evidence.
- `npm ci` succeeds in two clean directories/processes from the committed lockfile.
- Contract bytecode, ABI, generated bindings, and web production assets are deterministic
  or have documented nondeterministic metadata excluded from canonical hashes.
- No untracked generated artifact is required for build or verification.

## REL-02 — Deployment verification

Manifest must include:

- chain id, deployment timestamp/block, source commit, dirty-worktree flag (`false`);
- owned contract addresses, deployment transaction hashes, deployer role disclosure;
- compiler, optimizer, EVM target, constructor arguments, source/ABI/runtime hashes;
- external target addresses, runtime hashes, package/source provenance, and license;
- generated-binding hash and verification/explorer status;
- canonical frontend/read endpoints only after they pass health checks.

The verifier re-reads all runtime code and public configuration from RPC. A copied
manifest value is never accepted as its own proof.

## REL-03 — Security and quality closure

Required outputs:

- Solidity static analysis and manual high-risk review (ACL, custody, external calls,
  reentrancy, replay, rounding, time, denial of service, oracle/resolution).
- Dependency advisory and license reports for every npm workspace and action/tool.
- Repository, history, build, trace, screenshot, and evidence secret/plaintext scans.
- G8 fuzz run with recorded seeds/counts and minimized-failure policy.
- Web accessibility, console, network, storage, and primary-route mock-import scans.

No report may be generated and ignored: every finding links to a fix commit, accepted
risk, false-positive rationale, or stop-ship state.

## REL-04 — Clean reproduction

Reproduction sequence:

```text
clean checkout
→ npm ci
→ npm run doctor
→ npm run check:offline
→ npm run check:sepolia:read
→ npm run test:web
→ npm run scan:secrets
→ npm run verify:deployment
→ npm run verify:evidence
→ required named Sepolia write cases under the release budget
```

Record exact duration, environment facts, commit, and sanitized output summaries.
No ignored developer artifact may be copied into the clean checkout. The Sepolia
write cases must deploy or target only the canonical test manifest and record receipts.

## REL-05 — Operations and recovery

Runbooks cover:

- aggregate request stalled before unwrap;
- unwrap requested but adapter/automation unavailable;
- resolution pending;
- relayer duplicate/race/outage;
- indexer reorg/corruption/full rebuild;
- RPC or Nox gateway degradation;
- user replacement/dropped transaction and account/network change;
- manifest mismatch or external target code change.

Every runbook states detection, funds location, safe action, forbidden action,
permission required, evidence to capture, and escalation/stop condition.

## REL-06 — Documentation and claims

Required documents:

```text
README.md
DESIGN.md
docs/setup.md
docs/usage.md
docs/deployment.md
docs/security.md
docs/verification.md
docs/runbooks/recovery.md
docs/runbooks/automation.md
docs/operations/nox-feedback.md
LICENSE
```

Every command is executed from a clean checkout. Every public privacy claim maps to
P1–P7 and traceable evidence. Limitations explicitly cover public membership/timing,
non-Sybil k, TEE/gateway trust, oracle/resolution liveness, and post-execution recovery.

## REL-07 — Risk closure

- Critical risks must be closed; they cannot be accepted for G8.
- High risks require closure or explicit user-approved acceptance where the gate allows.
- Each residual medium/low risk has owner, trigger, detection, response, and review date.
- Accepted limitations appear consistently in product UI, security docs, and evidence report.

## REL-08 — G8 readiness

Acceptance:

- All required commands in the verification matrix pass.
- Every requirement/invariant row resolves to tests and validated evidence.
- Evidence ledger has no missing G0–G8 artifact and no forbidden content.
- Deployment facts, generated bindings, web configuration, verifier, and docs match.
- No stop-ship condition, TODO placeholder, broken local link, stale address, dirty file,
  or uncommitted change remains.

## Exit checklist

- [ ] REL-01 through REL-08 are independently committed.
- [ ] G8 is passed and recorded with a clean source commit.
- [ ] All critical/high issues satisfy the closure policy.
- [ ] Clean reproduction succeeds without privileged or historical local state.
- [ ] Product is release-ready; deferred presentation work may be planned separately.

## Stop conditions

Stop and return to the owning gate for any privacy/custody regression, live/local
divergence, manifest/runtime mismatch, secret/plaintext detection, unverifiable target,
clean-build failure, or public claim broader than evidence.
