# P1 — Protocol kernel

Status: `not_started`

## Objective

Implement a Sepolia-tested protocol whose state, custody, ACL, recovery, payout,
and score behavior satisfies I1–I10 without plaintext shadow accounting.

## Prerequisites

- P0 is `complete`, G0–G4 are `passed`, and the transition is explicitly approved.
- Exact Nox asset/ACL patterns and one adapter target are recorded by ADR/evidence.
- Domain paths and production paths from the deliverables register are accepted.

## Work-item register

| ID | Outcome | Primary artifacts | Required tests | Intended commit |
|---|---|---|---|---|
| PK-01 | Pure reference model | Domain states, transitions, math, schemas, errors | Transition table, Brier/payout vectors, property model | `feat: add protocol reference model` |
| PK-02 | Stable public interfaces | Pool/factory/adapter interfaces, events, errors | ABI snapshots, selector/event compatibility | `feat: define protocol interfaces and events` |
| PK-03 | Immutable deployment | Factory and pool configuration | Invalid config, uniqueness, immutable target/code binding | `feat: add immutable pool factory` |
| PK-04 | Confidential commit/custody | Signal import, clamp, allocation, position, token pull | I1/I2/I7/I10, duplicate/deadline/ACL cases | `feat: add confidential signal custody` |
| PK-05 | Cohort/aggregate | close, k-gate, request, aggregate proof | Below-k, reveal scope, substitute proof, replay | `feat: add k gated aggregate lifecycle` |
| PK-06 | Execution/recovery | unwrap, adapter call, slippage, timeout, rewrap | I4/I5, malicious return, revert atomicity, recovery | `feat: add bounded execution and recovery` |
| PK-07 | Settlement/owner terminal paths | resolve, redeem, wrap pot, score, claim, refund | I3/I6/I8/I10, rounding and conflict cases | `feat: add private settlement and score` |
| PK-08 | Independent verifier/manifest | Verifier rules, manifest schema, CLI | Mutation rejection, stale binding, wrong code hash | `feat: add independent protocol verifier` |
| PK-09 | Adversarial/invariant gate | Fuzz, reference-model, static analysis suites | I1–I10 and mandatory negatives | `test: close protocol correctness gate` |

## Sequencing

```text
PK-01 → PK-02 → PK-03 → PK-04 → PK-05 → PK-06 → PK-07
                    └──────────────────────────────→ PK-08
PK-01..PK-08 → PK-09 → G5
```

No SDK, relayer, indexer, or web implementation begins in P1.

## Contract behavior checklist

### Deployment and configuration

- [ ] Factory validates collateral/wrapper/adapter compatibility and non-zero addresses.
- [ ] One pool owns exactly one market and one epoch; deployment starts in `OPEN`.
- [ ] Deadline, `kMin`, timeouts, target, collateral, and adapter are immutable.
- [ ] Duplicate configuration salt and unsupported outcome count fail.
- [ ] No upgrade, pause, owner sweep, or hidden administrative settlement path exists.

### Commit and custody

- [ ] Import stake/probability proofs once with mandatory domain binding.
- [ ] Clamp probability confidentially and derive allocations with I1 conservation.
- [ ] Store owner-viewable derived position handles with pool-only compute authority.
- [ ] Pull exactly encrypted stake using the G2-proven transient ACL sequence.
- [ ] Count one public participation slot per address and reject duplicates/deadline expiry.

### Aggregate and execution

- [ ] Below-k close enters `REFUNDABLE` and never grants aggregate public decrypt.
- [ ] At/above-k close exposes only aggregate YES/NO handles.
- [ ] Aggregate and unwrap request IDs are context-bound and single-use.
- [ ] `publicYes + publicNo` equals observed released collateral before adapter call.
- [ ] Slippage and adapter balance deltas are hard checks, not relayer promises.
- [ ] Timeout and delayed finalize-and-rewrap follow the documented funds map.

### Settlement, score, and terminal actions

- [ ] Resolution is read and normalized from the selected unchanged protocol.
- [ ] Redemption is measured by public balance delta and pot is wrapped confidentially.
- [ ] Brier score matches the reference model and remains owner-viewable only.
- [ ] Payout rounds down and total claims cannot exceed the pot.
- [ ] Claim/refund are single-use and mutually exclusive.
- [ ] Rounding dust/unclaimed funds remain inaccessible; no administrative sweep.

## Verification requirements

- Every allowed and forbidden transition has a named test.
- Every stable error has at least one direct assertion.
- I1–I10 map to named test families in the traceability matrix.
- Offline reference-model fuzz floor: 1,000 cases/invariant during development and
  10,000 at G5; representative boundary/adversarial contract vectors run on Sepolia.
- Independent verifier rejects at least one mutation for every observable invariant.
- Static analysis has no unresolved high/critical issue.
- Dedicated Sepolia test deployments pass:
  - success → settle → score → claim;
  - below-k → refund;
  - aggregate timeout → refund;
  - unwrap requested → delayed finalize-and-rewrap → refund;
  - slippage/adapter revert with atomic state preservation.

## Required evidence

- Domain reference vectors and property seed summary.
- State/transition/error coverage report.
- I1–I10 invariant report with minimized failing-seed policy.
- ACL/public-decryption scope report.
- Adapter target/runtime-code manifest fixture.
- G5 verifier mutation report.

## Exit checklist

- [ ] PK-01 through PK-09 are independently committed.
- [ ] `npm run check:offline` and all required named G5 Sepolia cases pass.
- [ ] G5 is `passed` in the evidence ledger.
- [ ] Protocol spec, events/API, risks, ADRs, manifest schema, and tests agree.
- [ ] No production module imports feasibility spike code.
- [ ] Worktree is clean and P2 prerequisites are documented.

## Stop conditions

Stop P1 immediately for an invariant failure that can only be fixed with plaintext
shadow state, privileged off-chain correctness, weakened ACL, or unspecified custody.
