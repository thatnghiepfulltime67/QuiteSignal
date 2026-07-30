# P1 — Protocol kernel

Status: `in_progress`

## Objective

Implement a Sepolia-tested protocol whose state, custody, ACL, recovery, payout,
and score behavior satisfies I1–I10 without plaintext shadow accounting.

## Prerequisites

- P0 is `complete`, G0–G4 are `passed`, and the transition is explicitly approved.
- Exact Nox asset/ACL patterns and one resolution target are recorded by ADR/evidence.
- Domain paths and production paths from the deliverables register are accepted.

## Work-item register

| ID | Outcome | Primary artifacts | Required tests | Intended commit |
|---|---|---|---|---|
| PK-01 | Pure reference model | Domain states, transitions, math, schemas, errors | Transition table, Brier/payout vectors, property model | `feat: add protocol reference model` |
| PK-02 | Stable public interfaces | Pool/factory/adapter interfaces, events, errors | ABI snapshots, selector/event compatibility | `feat: define protocol interfaces and events` |
| PK-03 | Immutable deployment | Factory and pool configuration | Invalid config, uniqueness, immutable target/code binding | `feat: add immutable pool factory` |
| PK-04 | Confidential commit/custody | Signal import, clamp, allocation, position, token pull | I1/I2/I7/I10, duplicate/deadline/ACL cases | `feat: add confidential signal custody` |
| PK-05 | Cohort/aggregate | close, k-gate, request, aggregate proof | Below-k, reveal scope, substitute proof, replay | `feat: add k gated aggregate lifecycle` |
| PK-06 | Resolution/recovery | aggregate finalization, feed condition, freshness, grace refund | I4/I5, stale round, wrong target, zero custody, recovery | `feat: add bounded resolution and recovery` |
| PK-07 | Settlement/owner terminal paths | resolve, score, claim, refund | I3/I6/I8/I10, rounding and conflict cases | `feat: add private settlement and score` |
| PK-08 | Independent verifier/manifest | Verifier rules, manifest schema, CLI | Mutation rejection, stale binding, wrong code hash | `feat: add independent protocol verifier` |
| PK-09 | Adversarial/invariant gate | Fuzz, reference-model, static analysis suites | I1–I10 and mandatory negatives | `test: close protocol correctness gate` |

## PK-01 work-item record

ID: `PK-01`

Status: `complete`

Outcome: Establish the pure TypeScript reference model for the revised
zero-custody-resolution lifecycle before defining a production ABI or contract. The
model is an offline mathematical and state-transition oracle only; it cannot call
RPC, deploy contracts, synthesize Nox handles, transfer assets, or serve production
state.

Output files: `modules/domain/package.json`, `modules/domain/src/state.ts`,
`modules/domain/src/errors.ts`, `modules/domain/src/schemas.ts`,
`modules/domain/src/reference-model.ts`, `modules/domain/src/index.ts`,
`modules/domain/test/reference-model.test.ts`, root `package.json`,
`package-lock.json`, `DESIGN.md`, `docs/engineering/01-protocol-spec.md`,
`docs/engineering/02-api-and-events.md`, this work-package record, and the
traceability matrix when a model boundary is clarified.

Acceptance criteria: The model defines immutable configuration validation; open,
aggregate-pending, resolution-pending, settled, and refundable transitions; one
commit per owner; confidential-equivalent allocation arithmetic; exact public
aggregate matching; request replay rejection; fresh objective resolution validation;
resolution-grace refund; private-score math; floor payout; and mutually exclusive
one-time claim/refund. It records every state funds location as confidential pool
custody. Deterministic tests include explicit boundary vectors and at least 1,000
offline generated property cases for conservation, payout bound, and terminal flag
exclusivity.

Negative cases: Invalid immutable timings or precision; empty/duplicate owner;
commit after deadline; close before deadline; below-k aggregate request; unmatched or
replayed aggregate request; aggregate mismatch; premature, stale, incomplete, or
non-positive feed round; zero winning aggregate; early resolution-grace refund;
duplicate claim/refund; and claim/refund conflict must fail in the pure model.

Privacy/custody impact: Model fixtures contain only public, deterministic bigint
test values and never represent production plaintext, Nox handle, proof, wallet,
signature, or RPC data. The model has no chain, token, or adapter dependency and
cannot create custody or authority.

Funds location/recovery impact: Every model state labels collateral as confidential
pool custody. Aggregate timeout and resolution-grace paths return the model to
`REFUNDABLE`; a zero winning aggregate remains resolution-pending until the same
grace recovery is available. No modeled path moves assets to the public feed.

Checks: `npm run test:model`, `npm run typecheck`, `npm run compile`,
`npm run check:offline`, and `git diff --check`.

Evidence path: `modules/domain/test/reference-model.test.ts` output. The six named
`T-DOMAIN-PK01-*` cases include a deterministic 1,000-vector run; the G5
reference-model report will be created by PK-09. PK-01 makes no Sepolia evidence
claim; production contract conclusions remain reserved for named Sepolia tests.

Recorded checks: `npm run test:model`, `npm run typecheck`, `npm run compile`, and
`npm run check:offline` passed before this work-item was completed. `git diff --check`
is run immediately before its commit.

Intended commit: `feat: add protocol reference model`.

Rollback/failure action: Revert only this isolated domain-model commit. A model
counterexample, undefined funds location, or conflict with a privacy/custody
invariant blocks PK-02 onward until a documented architecture decision resolves it.

## PK-02 work-item record

ID: `PK-02`

Status: `complete`

Outcome: Freeze the smallest public Solidity ABI for factory, pool, direct
price-feed resolution, common types, events, and stable errors before any custody or
lifecycle implementation. The pinned Nox `IERC7984` interface remains the canonical
confidential-collateral ABI; this slice references it rather than copying it.

Output files: `modules/protocol/contracts/interfaces/QuietSignalTypes.sol`,
`modules/protocol/contracts/interfaces/IQuietSignalErrors.sol`,
`modules/protocol/contracts/interfaces/IQuietSignalFactory.sol`,
`modules/protocol/contracts/interfaces/IQuietSignalPool.sol`,
`modules/protocol/contracts/interfaces/IResolutionAdapter.sol`,
`modules/protocol/test/unit/interface-compatibility.test.ts`,
`modules/protocol/package.json`, root `package.json`,
`docs/engineering/01-protocol-spec.md`, `docs/engineering/02-api-and-events.md`,
this work-package record, and the traceability matrix if named ABI tests clarify a
requirement.

Acceptance criteria: Factory creation, pool lifecycle, owner terminal actions,
read models, direct resolution metadata, events, common state/outcome/config types,
and custom errors have one ABI definition. `commitSignal` accepts only encrypted
Nox external handles and proof bytes; it exposes no plaintext stake or probability
parameter. Finalization accepts a request id and proof only; settlement accepts no
caller-supplied outcome. The adapter exposes immutable target, code-hash, condition,
and fresh-resolution fields only and has no asset method. ABI tests snapshot every
function selector, event topic, error selector, state mutability, and critical
parameter shape.

Negative cases: ABI test rejects a changed selector, event topic, error selector,
parameter order, mutability, a plaintext numeric commit parameter, a caller-supplied
settlement result, a duplicate collateral interface, or a payable adapter method.

Privacy/custody impact: This slice creates declarations and static ABI artifacts
only. It never imports/decrypts a confidential value, moves collateral, grants ACL,
deploys a production contract, or adds a resolver/backend authority. Events must not
include proofs, raw confidential handles, stake, probability, payout, refund, or
score values.

Funds location/recovery impact: No funds can move through an interface declaration.
The ABI exposes only the previously documented permissionless timeout and
resolution-grace recovery operations; actual funds behavior stays unimplemented and
unproven until named Sepolia tests in PK-04 through PK-07.

Checks: `npm run test:interfaces`, `npm run typecheck`, `npm run compile`,
`npm run check:offline`, and `git diff --check`.

Evidence path: `modules/protocol/test/unit/interface-compatibility.test.ts` output.
This is static/offline ABI evidence only; no G5 or Sepolia claim is made.

Recorded checks: `npm run test:interfaces`, `npm run typecheck`, `npm run compile`,
and `npm run check:offline` passed before this work-item was completed. `git diff
--check` is run immediately before its commit.

Intended commit: `feat: define protocol interfaces and events`.

Rollback/failure action: Revert this isolated ABI commit before any production pool
deployment. Any interface conflict with the P0 Nox/ACL feasibility findings, the
reference model, or the zero-custody adapter boundary blocks PK-03 and requires an
ADR if resolution changes trust, custody, privacy, state, or a public interface.

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
- [ ] Deadline, `kMin`, timeouts, target, condition, collateral, and adapter are immutable.
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
- [ ] Aggregate request IDs are context-bound and single-use.
- [ ] `publicYes + publicNo` is proof-verified before resolution and determines the payout rate.
- [ ] Feed target, threshold, observation time, maximum age, and grace are immutable hard checks.
- [ ] Aggregate timeout and resolution grace follow the documented confidential funds map.

### Settlement, score, and terminal actions

- [ ] Resolution is read and normalized from the selected unchanged public feed.
- [ ] Collateral remains confidential until payout; no adapter or target receives it.
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
  - invalid/stale feed → resolution grace refund;
  - wrong target or caller-supplied resolution rejection with state preservation.

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
