# P0 — Foundation and feasibility

Status: `in_progress`

## Objective

Replace every load-bearing technical assumption with direct Sepolia evidence before
production modules are created. Pure arithmetic/reference expectations are tested offline.

## Prerequisites

- Product, privacy, protocol, and architecture documents are internally consistent.
- No application implementation has started.
- A throwaway Sepolia wallet strategy and evidence-sanitization policy are approved.

## Work-item register

| ID     | Outcome                       | Planned artifacts                                        | Checks/evidence                                                             | Gate  | Intended commit                                 |
| ------ | ----------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| FND-01 | Reproducible toolchain        | Root workspace, lockfile, doctor, Sepolia read preflight | Frozen install ×2, compile smoke, RPC/network/version capture               | G0    | `build: pin verified workspace toolchain`       |
| FND-02 | Encrypted signal math proven  | Isolated arithmetic spike/tests                          | Offline reference vectors plus matching Sepolia contract cases              | G1    | `test: prove encrypted signal arithmetic`       |
| FND-03 | ACL lifecycle proven          | Isolated ACL spike/tests                                 | Context binding, persistent handle, viewer-only, unauthorized, public scope | G1    | `test: prove handle binding and acl lifecycle`  |
| FND-04 | Asset lifecycle proven        | Isolated confidential-asset spike/tests                  | Pull, payout, refund, unwrap, finalize, rewrap, replay                      | G2    | `test: prove confidential asset recovery`       |
| FND-05 | Aggregate/recovery proven     | Isolated cohort/aggregate spike                          | Below-k, aggregate-only reveal, proof binding, timeout, rewrap              | G3    | `test: prove aggregate disclosure and recovery` |
| FND-06 | Public protocol selected      | Decision matrix + minimal adapter spike                  | License, unchanged target, code hash, execution, slippage, redemption       | G4    | `test: prove open protocol adapter boundary`    |
| FND-07 | Feasibility decision recorded | Evidence JSON/reports, feedback, risks, ADR updates      | Evidence validator and full G0–G4 review                                    | G0–G4 | `docs: record feasibility gates and decisions`  |

Only one FND item may be in progress. Each item must be committed before the next
item begins; feasibility spikes never share a commit with production contracts.

## FND-01 work item record

ID: `FND-01`

Outcome: Establish a reproducible npm-workspace toolchain that can perform
sanitized Ethereum Sepolia read preflight checks without creating application or
protocol modules.

Status: `complete`

Prerequisite gates: None. The architecture, privacy, protocol, operations, and
work-package documents were reconciled on 2026-07-30. Official Nox release
metadata was inspected: `@iexec-nox/nox-protocol-contracts@0.2.4`,
`@iexec-nox/nox-confidential-contracts@0.2.2`, and
`@iexec-nox/handle@0.1.0-beta.13`. The protocol SDK maps Ethereum Sepolia
(`11155111`) to a deployed NoxCompute address; the mapping and runtime code must
be rechecked by the committed doctor command.

Files/modules allowed: `.nvmrc`, `.npmrc`, `.editorconfig`, `.gitignore`,
`.prettierignore`, `prettier.config.mjs`, `package.json`, `package-lock.json`,
`tsconfig.base.json`, `ops/scripts/doctor.mts`,
`ops/scripts/check-secrets.mts`, `ops/scripts/budget-status.mts`,
`ops/scripts/dependency-report.mts`,
`evidence/offline/G0/`, `evidence/reports/`,
`evidence/sepolia/spend-ledger.json`,
`docs/plans/00-foundation-and-feasibility.md`,
`docs/plans/evidence-ledger.md`, `docs/operations/02-risk-register.md`, and
`docs/operations/04-source-and-assumption-register.md`.

Acceptance criteria: Exact direct versions and npm engines are pinned; a frozen
install succeeds twice from a clean npm cache; doctor reports versions and public
Sepolia/Nox health without values from environment variables; compile and format
checks are deterministic; ignored secret, cache, and local-evidence paths are
covered by a repository scan.

Negative cases: Missing RPC configuration, an RPC reporting a non-Sepolia chain,
missing Nox runtime code, an invalid spend ledger, unsupported Node/npm versions,
or a detected committed secret must fail with a sanitized actionable message.

Privacy/custody impact: This item performs no confidential computation and sends
no transaction. It must not read, print, persist, or commit private keys,
mnemonics, RPC credentials, confidential inputs, handles, proofs, or signatures.

Funds location/recovery impact: No Sepolia write is permitted in this item; no
funds move and no recovery action is required.

Commands/checks: `npm ci` twice in clean processes, `npm run doctor`,
`npm run format:check`, `npm run compile`, `npm run scan:secrets`,
`npm run scan:dependencies`, `npm run check:offline`, and
`npm run check:sepolia:read`.

Evidence path: `evidence/offline/G0/FND-01.json` and
`evidence/reports/G0-summary.md`.

Intended commit: `build: pin verified workspace toolchain`.

Rollback/failure action: Revert only the FND-01 commit and retain the sanitized
failure report. A failed Nox runtime, package, license, or deterministic-build
check blocks FND-02 through FND-07 and creates no product-code fallback.

Completion: Source commit `6f562e2f6811aa5ab117f3163480a40b4750f755` and
sanitized evidence at `evidence/offline/G0/FND-01.json` passed the recorded G0
checks. No Sepolia write occurred. The next eligible item is FND-02.

## Active work item

ID: `FND-02`

Outcome: Prove the encrypted probability, stake, allocation, and Brier-score
arithmetic primitives against Ethereum Sepolia NoxCompute before a production pool
or token flow exists.

Status: `blocked`

Prerequisite gates: G0 passed at source commit
`6f562e2f6811aa5ab117f3163480a40b4750f755`. The pinned NoxCompute mapping has
runtime code on Ethereum Sepolia. Every write must still pass the committed chain,
budget, and throwaway-wallet preflight without printing configuration values.

Files/modules allowed: `package.json`, `package-lock.json`,
`modules/protocol/package.json`, `modules/protocol/hardhat.config.ts`,
`modules/protocol/contracts/feasibility/`,
`modules/protocol/scripts/feasibility/`,
`modules/protocol/test/feasibility/`, `ops/scripts/`,
`evidence/offline/G1/`, `evidence/sepolia/G1/`,
`evidence/sepolia/spend-ledger.json`, `evidence/reports/`,
`docs/plans/00-foundation-and-feasibility.md`,
`docs/setup-sepolia.md`,
`docs/plans/evidence-ledger.md`, `docs/operations/nox-feedback.md`,
`docs/operations/02-risk-register.md`, and
`docs/operations/04-source-and-assumption-register.md`.

Acceptance criteria: An isolated Sepolia contract imports externally encrypted
unsigned values, performs compare/select clamp, multiply, divide, subtract,
absolute difference, and square operations, and makes the resulting public test
output match the pure bigint reference model for every required boundary vector.
The test proves no production module or plaintext shadow state is used.

Negative cases: Invalid input proof, wrong input type, uninitialized handle,
division by zero, overflow/underflow, wrong chain or contract context, and a
missing Nox runtime must fail without an ambiguous success report.

Privacy/custody impact: Test input is encrypted before the write and no plaintext
value, handle, proof, calldata, or environment value may enter logs, evidence, or
committed fixtures. This spike has no token, adapter, payout, or user-custody path.

Funds location/recovery impact: The only permitted spend is bounded Sepolia gas
for an isolated feasibility deployment and calls. No collateral is accepted. If a
write fails or the primitive is unsupported, record the receipt and spend in the
sanitized ledger, retain the failure report, and stop G1-dependent work rather
than adding a local or plaintext substitute.

Commands/checks: `npm run test:model`, `npm run test:nox:sepolia -- FND-02`,
`npm run budget:status`, `npm run check:offline`,
`npm run check:sepolia:read`, `npm run scan:secrets`, and `git diff --check`.

Evidence path: `evidence/offline/G1/FND-02.json`,
`evidence/sepolia/G1/FND-02.json`, and `evidence/reports/G1-summary.md`.

Intended commit: `test: prove encrypted signal arithmetic`.

Rollback/failure action: Revert only the isolated FND-02 source commit. The
deployed Sepolia spike has no asset custody and needs no on-chain recovery. A
failed required primitive, proof binding, or runtime behavior is a G1 failure;
FND-03 through FND-07 and P1 remain blocked until an ADR-approved redesign passes
the complete G1 gate.

Resumption: The local throwaway Sepolia key and dry-run preflight passed on
2026-07-30 with no chain write. Before the confirmed run, the harness enforces the
documented per-transaction cap and rejects uninitialized external handles. The
spend ledger remains at zero and no custody exists.

## FND-01 — Toolchain lock

Definition of Ready:

- Official Nox package requirements and local plugin prerequisites have been inspected.
- Candidate Node/npm/Hardhat/Solidity versions are listed with sources.

Acceptance:

- Exact direct versions are pinned; transitive versions are frozen by lockfile.
- `npm run doctor` prints versions and public health only, never secret values.
- Clean `npm ci` succeeds twice; compile is deterministic; Sepolia read preflight verifies chain and required live addresses.
- `.gitignore` rejects environment files, wallet material, local evidence, and caches.

Failure action: apply G0 kill conditions. Do not create application workspaces.

## FND-02 — Confidential arithmetic

Required vectors:

- `p = 0, 1, 4_999, 5_000, 9_999, 10_000, 10_001, max(type)`;
- stake `0, 1, rounding boundary, typical amount, maximum approved test amount`;
- YES/NO allocation conservation for every vector;
- Brier scores for both outcomes, including exact endpoints and rounding;
- overflow/underflow behavior and division-by-zero guards.

Acceptance: Sepolia contract results match the offline pure bigint reference model.

## FND-03 — ACL and persistence

Required actors: pool, owner, unrelated wallet, confidential token, keeper, adapter.

Acceptance:

- Pool retains only the authority required for future computation.
- Owner receives viewer rights to derived position/score handles, not compute authority.
- Token access is transient and expires with the call/transaction semantics proved.
- Keeper/adapter/unrelated wallet access fails.
- Cross-pool, cross-chain, cross-request, and replayed inputs fail.
- Only aggregate/protocol-required handles can enter public-decrypt flow.

## FND-04 — Confidential asset lifecycle

Acceptance:

- Stake pull moves exactly the encrypted stake and cannot be redirected.
- Payout/refund reaches only the caller/recorded owner once.
- Unwrap proof releases exactly the burned amount measured by balance delta.
- Delayed finalize-and-rewrap returns all released collateral to confidential custody.
- Duplicate proof, stale proof, wrong recipient, and missing transient ACL fail.

## FND-05 — Aggregate and recovery

Acceptance:

- Below-k closes without public-decrypt permission and refunds remain possible.
- At/above-k marks only aggregate YES/NO handles public.
- Proof is bound to `(chainId, pool, epochId, requestId)` and consumed once.
- Substitute aggregate plaintext fails conservation.
- Timeout before unwrap and delayed recovery after unwrap have known funds locations.

## FND-06 — Adapter selection

Selection scorecard:

| Dimension                                          | Weight | Minimum |
| -------------------------------------------------- | -----: | ------- |
| Unchanged open-source protocol and license clarity |     20 | Pass    |
| Sepolia deployability/availability                 |     15 | Pass    |
| Atomic spend/slippage bound                        |     20 | Pass    |
| Deterministic resolution/redemption                |     15 | Pass    |
| No between-call adapter custody                    |     15 | Pass    |
| Verifiable runtime bytecode/provenance             |     10 | Pass    |
| Demo/read-model clarity                            |      5 | ≥3/5    |

Document all candidates evaluated, but implement only the selected adapter. A target
that misses any minimum is rejected even if its aggregate score is highest.

## Required evidence

```text
evidence/offline/G0-G4/
evidence/sepolia/G1-G4/
evidence/reports/G0-G4-summary.md
docs/operations/nox-feedback.md
docs/operations/02-risk-register.md
docs/operations/03-decision-log.md
```

## Exit checklist

- [ ] G0 passed: frozen npm toolchain and Sepolia read preflight are reproducible.
- [ ] G1 passed: arithmetic, context binding, ACL, and persistence pass directly on Sepolia.
- [ ] G2 passed: confidential asset success and recovery conserve funds.
- [ ] G3 passed: aggregate-only disclosure and proof/recovery semantics pass.
- [ ] G4 passed: one unchanged public protocol and adapter boundary are selected.
- [ ] Evidence ledger contains validated, sanitized records for G0–G4.
- [ ] All P0 findings, risks, and architecture consequences are documented.
- [ ] User explicitly approves transition to P1.

## Exit decision

`PASS`: mark P0 complete and begin P1.

`REDESIGN`: update architecture/ADR, reset affected gates to `not_run`, and repeat.

`STOP`: mark P0 blocked; do not hide the failure with mocks or trusted services.
