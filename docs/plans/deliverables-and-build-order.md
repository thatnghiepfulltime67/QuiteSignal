# Deliverables and build order

Paths in this document are planned outputs. A path is created only in its owning
work item; empty scaffolding does not count as progress.

## Target repository map

```text
.
├── apps/
│   └── web/                         # user journey and owner-only decryption
├── services/
│   ├── automation/                  # permissionless lifecycle automation
│   └── indexer/                     # rebuildable public read model
├── modules/
│   ├── protocol/                    # Hardhat project, contracts, tests, deploy
│   ├── domain/                      # pure states, schemas, math, errors
│   ├── confidential-client/         # branded handles, encrypt/decrypt, proof binding
│   ├── verifier/                    # independent public invariant verifier
│   └── config/                      # chains, schemas, manifests, generated bindings
├── ops/scripts/                     # doctor, deploy, evidence, release orchestration
├── deployments/sepolia/             # public canonical deployment manifest
├── evidence/                        # sanitized gate evidence only
├── docs/                            # normative product/architecture/operations/plans
├── AGENTS.md
├── Plan.md
├── package.json
└── package-lock.json
```

## Build-order register

| Build ID | Deliverable | Depends on | Required outputs | Gate |
|---|---|---|---|---|
| B00 | Workspace/toolchain | Documentation baseline | Root workspace, lockfile, TS/Solidity formatting, environment doctor | G0 |
| B01 | Feasibility harness | B00 | Isolated Nox arithmetic, ACL, asset, proof, and adapter spikes | G1–G4 |
| B02 | Domain kernel | G0–G4 passed | State enum, transitions, schemas, math model, stable errors | G5 |
| B03 | Contract interfaces | B02 | Factory/pool/adapter/token interfaces and events | G5 |
| B04 | Confidential pool | B03 | Custody, signal math, aggregate, recovery, settlement, score/refund | G5 |
| B05 | Public adapter | B03 + G4 | One immutable target adapter and balance-delta checks | G5 |
| B06 | Independent verifier/config | B03–B05 | Manifest schema, code-hash checks, I1–I10 verifier | G5 |
| B07 | Nox client SDK | B03 + G1–G3 | Typed encryption, binding, owner decrypt, tx preparation | G6 |
| B08 | Relayer and indexer | B06–B07 | Idempotent jobs, public event model, checkpoint/reorg behavior | G6 |
| B09 | Web application | G6 + B07–B08 | Real wallet/encrypt/commit/position/score/claim/refund/verify routes | G7 |
| B10 | Deployment/release | G7 | Verified deployment, evidence, runbooks, scans, clean reproduction | G8 |

## B00 — Workspace/toolchain outputs

```text
.nvmrc
package.json
package-lock.json
tsconfig.base.json
.editorconfig
.gitignore
ops/scripts/doctor.mts
ops/scripts/check-secrets.mts
```

Acceptance: clean frozen install, doctor, format check, compile smoke, and Sepolia
read/version preflight pass. Exact versions are outputs of G0, not guessed in advance.

## B01 — Feasibility outputs

```text
modules/protocol/contracts/feasibility/
modules/protocol/test/feasibility/
modules/protocol/scripts/feasibility/
evidence/{offline,sepolia}/G1-G4/
docs/operations/nox-feedback.md
```

Feasibility code remains isolated from production contracts. Production modules may
reuse proven patterns only through a reviewed implementation, never by importing a spike.

## B02–B06 — Protocol outputs

```text
modules/domain/src/state.ts
modules/domain/src/errors.ts
modules/domain/src/schemas.ts
modules/domain/src/reference-model.ts
modules/protocol/contracts/core/QuietSignalFactory.sol
modules/protocol/contracts/core/QuietSignalPool.sol
modules/protocol/contracts/interfaces/IMarketAdapter.sol
modules/protocol/contracts/adapters/<SelectedAdapter>.sol
modules/protocol/test/unit/
modules/protocol/test/invariant/
modules/protocol/test/adversarial/
modules/verifier/src/invariants/
modules/verifier/src/cli.ts
modules/config/src/deployment-schema.ts
deployments/sepolia/manifest.json
```

Contract build order is interfaces → pure state/model tests → pool state transitions →
ACL/custody → aggregate/recovery → adapter → settlement/score → verifier. Do not
implement UI bindings before ABI and event contracts pass G5.

## B07 — SDK outputs

```text
modules/confidential-client/src/types.ts
modules/confidential-client/src/domain.ts
modules/confidential-client/src/encrypt.ts
modules/confidential-client/src/decrypt.ts
modules/confidential-client/src/transactions.ts
modules/confidential-client/src/read.ts
modules/confidential-client/test/vectors/
```

Acceptance: branded opaque types, decimal-safe parsing, mandatory domain binding,
replacement/retry semantics, ABI compatibility, and no plaintext-capable relayer payload.

## B08 — Automation/read-model outputs

```text
services/automation/src/jobs/
services/automation/src/policy.ts
services/automation/src/cli.ts
services/indexer/src/reducer.ts
services/indexer/src/checkpoint.ts
services/indexer/src/rebuild.ts
```

The relayer supports dry-run, once, poll, and health modes with bounded action budgets.
The indexer derives only public state, handles reorg/checkpoint reset, and can rebuild
without a private database dependency.

## B09 — Web outputs

```text
apps/web/app/markets/
apps/web/app/pool/[address]/
apps/web/app/position/
apps/web/app/verify/
apps/web/src/features/signal/
apps/web/src/features/lifecycle/
apps/web/src/features/privacy-boundary/
apps/web/e2e/
```

The route names may adapt to the selected framework, but feature boundaries and
acceptance paths are stable. The primary route cannot import fixture/demo modules.

## B10 — Release outputs

```text
deployments/sepolia/manifest.json
evidence/reports/G8-summary.md
docs/setup.md
docs/deployment.md
docs/security.md
docs/verification.md
docs/runbooks/recovery.md
docs/runbooks/relayer.md
LICENSE
```

## Artifact synchronization rules

- Contract ABI/address bindings are generated from one canonical manifest and checked in CI.
- Web, relayer, indexer, SDK, and verifier cannot carry handwritten address copies.
- Runtime code hashes are verified before a manifest is accepted.
- Generated artifacts include generator version and source commit.
- A stale binding or manifest mismatch fails build and release gates.

## Commit slicing rule

Each Build ID is an epic, not a commit. Split by one interface, state transition,
test family, CLI capability, route, or runbook. Every slice must satisfy the Definition
of Ready/Done in `Plan.md` and name its intended commit before code changes.
