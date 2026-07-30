# P1 — Protocol kernel

Status: `completed`

## Objective

Implement a Sepolia-tested protocol whose state, custody, ACL, recovery, payout,
and score behavior satisfies I1–I10 without plaintext shadow accounting.

## Prerequisites

- P0 is `complete`, G0–G4 are `passed`, and the transition is explicitly approved.
- Exact Nox asset/ACL patterns and one resolution target are recorded by ADR/evidence.
- Domain paths and production paths from the deliverables register are accepted.

## Work-item register

| ID    | Outcome                         | Primary artifacts                                               | Required tests                                            | Intended commit                               |
| ----- | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| PK-01 | Pure reference model            | Domain states, transitions, math, schemas, errors               | Transition table, Brier/payout vectors, property model    | `feat: add protocol reference model`          |
| PK-02 | Stable public interfaces        | Pool/factory/adapter interfaces, events, errors                 | ABI snapshots, selector/event compatibility               | `feat: define protocol interfaces and events` |
| PK-03 | Immutable deployment            | Factory and pool configuration                                  | Invalid config, uniqueness, immutable target/code binding | `feat: add immutable pool factory`            |
| PK-04 | Confidential commit/custody     | Signal import, clamp, allocation, position, token pull          | I1/I2/I7/I10, duplicate/deadline/ACL cases                | `feat: add confidential signal custody`       |
| PK-05 | Cohort/aggregate                | close, k-gate, request, aggregate proof                         | Below-k, reveal scope, substitute proof, replay           | `feat: add k gated aggregate lifecycle`       |
| PK-06 | Resolution/recovery             | aggregate finalization, feed condition, freshness, grace refund | I4/I5, stale round, wrong target, zero custody, recovery  | `feat: add bounded resolution and recovery`   |
| PK-07 | Settlement/owner terminal paths | resolve, score, claim, refund                                   | I3/I6/I8/I10, rounding and conflict cases                 | `feat: add private settlement and score`      |
| PK-08 | Independent verifier/manifest   | Verifier rules, manifest schema, CLI                            | Mutation rejection, stale binding, wrong code hash        | `feat: add independent protocol verifier`     |
| PK-09 | Adversarial/invariant gate      | Fuzz, reference-model, static analysis suites                   | I1–I10 and mandatory negatives                            | `test: close protocol correctness gate`       |

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

## PK-03A work-item record

ID: `PK-03A`

Status: `complete`

Outcome: Pull forward the read-only production implementation of the already frozen
direct price-feed adapter so PK-03 factory validation can use an actual Sepolia
adapter instead of a mock. This is a build-order adjustment only: it does not add
settlement, custody, Nox, factory, or pool lifecycle behavior, and it does not alter
the accepted ABI or ADR-017 trust boundary.

Output files: `modules/protocol/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol`,
`modules/protocol/scripts/core/run-pk03a-adapter-sepolia.mts`,
`modules/protocol/package.json`, root `package.json`,
`evidence/{offline,sepolia}/G5/PK-03A-ADAPTER.json`,
`docs/engineering/01-protocol-spec.md`, the verification matrix, this work-package
record, the evidence ledger, and the spend ledger.

Acceptance criteria: The adapter implements `IResolutionAdapter` exactly; captures
one non-empty target and its runtime hash immutably; validates positive threshold,
observation time, and maximum age; rechecks target runtime before every resolution;
returns only `YES=1` or `NO=2` from an unchanged positive complete fresh Chainlink
round; rejects early, stale, incomplete, future, invalid, or changed-target reads;
has no payable/fallback/receive or asset/handle method; and retains zero balance.
Sepolia evidence deploys fresh adapter instances against the accepted Chainlink
ETH/USD target and proves both outcomes plus the negative cases without a mock.

Negative cases: Zero/non-contract target, zero threshold, zero observation time,
zero maximum age, early observation, stale round, malformed round, target runtime
mismatch, value transfer, and a caller-supplied result must fail or be impossible.

Privacy/custody impact: Inputs and outputs are public feed metadata only. The
adapter neither imports nor stores Nox handles, proofs, plaintext signals, private
positions, or confidential assets, and it cannot transfer any asset.

Funds location/recovery impact: The adapter has no funds location. A failed read
does not change pool state or custody; the later pool's immutable grace refund is
the only recovery path. This slice cannot settle a pool.

Checks: `npm run test:interfaces`, `npm run compile`,
`npm run test:adapter:sepolia`, `npm run check:offline`,
`npm run check:sepolia:read`, and `git diff --check`.

Evidence path: `evidence/{offline,sepolia}/G5/PK-03A-ADAPTER.json` and committed
spend-ledger entries. No partial adapter result passes G5; PK-03A is a named input
to the later G5 combined report.

Recorded checks: `npm run test:interfaces`, `npm run compile`,
`npm run check:offline`, `npm run assess:g4:resolution:sepolia`, and the confirmed
`npm run test:adapter:sepolia -- --write` composite run passed. The follow-up
read-only verification records both positive outcomes, stale and premature reverts,
constructor reverts, target/runtime binding, value rejection, and zero balances.

Intended commit: `feat: add immutable price feed adapter`.

Rollback/failure action: Revert this isolated adapter commit and leave PK-03A
incomplete. A production-adapter failure cannot be replaced with a fixture, trusted
resolver, copied feed, or caller-selected result; it blocks factory deployment until
the documented resolution boundary is repaired or an ADR records a true blocker.

Partial-run record: Source commit `4ef78df` deployed all four immutable adapters at
Sepolia blocks `11381029` through `11381034`, then stopped before writing its final
artifact because the G5 evidence directories did not exist. The resume runner
redundantly deployed a second zero-custody `stale`/`premature` pair at blocks
`11381061` and `11381062`, then completed the full post-deployment checks. All six
adapters have zero ETH balance and no asset recovery is required. The append-only
partial artifacts remain historical only; the passed PK-03A artifact uses the first
`yes`/`no` pair and follow-up negative pair. The runner now refuses verify-only
artifact writes from a dirty worktree.

## PK-03B work-item record

ID: `PK-03B`

Status: `completed`

Outcome: Implement and Sepolia-test permissionless factory deployment of a single
configuration-only pool shell with immutable collateral, adapter, deadline, k, and
recovery timings. The shell has no confidential callback or lifecycle action yet;
those production behaviors remain owned by PK-04 through PK-07.

Output files: `modules/protocol/contracts/core/QuietSignalFactory.sol`,
`modules/protocol/contracts/core/QuietSignalPool.sol`,
`modules/protocol/scripts/core/run-pk03b-factory-sepolia.mts`,
`modules/protocol/package.json`, root `package.json`,
`evidence/{offline,sepolia}/G5/PK-03B-FACTORY.json`,
`docs/engineering/01-protocol-spec.md`, this work-package record, the evidence
ledger, and the spend ledger.

Acceptance criteria: The permissionless factory rejects native value, empty/EOA
collateral or adapter, non-ERC-7984 collateral, invalid/future-incompatible adapter
metadata, zero k/timeouts, past deadlines, reused deployment salts, and duplicate
immutable configurations. It computes a deterministic pool id, creates exactly one
pool with CREATE2, emits the frozen public configuration, and maps the id to that
pool. The pool stores its config, epoch id, and initial `OPEN` public epoch only;
it has no payable, fallback, asset callback, privileged role, upgrade path, or
hidden lifecycle implementation. Live tests use a fresh real production adapter
against Chainlink ETH/USD and the already Sepolia-proven pinned ERC-7984 wrapper;
they do not use a mock collateral or resolver.

Negative cases: Every rejected configuration above, duplicate factory creation, a
deadline after the adapter observation boundary, a changed adapter target runtime,
and native value fail without creating a pool or moving assets. A valid deployment
must leave factory and pool ETH balances at zero and cannot expose an owner/admin.

Privacy/custody impact: No confidential input, proof, ACL operation, token callback,
or transfer exists in this shell. The collateral address is immutable metadata only;
no pool method can receive or move collateral before PK-04.

Funds location/recovery impact: No funds may enter factory or pool. The frozen
aggregate/resolution timeout values are read-only configuration for later
permissionless recovery; no recovery claim is made before its lifecycle exists.

Checks: `npm run test:interfaces`, `npm run compile`,
`npm run test:factory:sepolia`, `npm run check:offline`,
`npm run check:sepolia:read`, and `git diff --check`.

Evidence path: `evidence/{offline,sepolia}/G5/PK-03B-FACTORY.json` and committed
spend-ledger entries. This contributes immutable deployment evidence only and cannot
pass G5 by itself.

Intended commit: `feat: add immutable pool factory`.

Runner follow-up commit: `test: add Sepolia factory runner`.

The unchanged canonical feed cannot be bytecode-mutated for a negative case without
introducing a forbidden mock. PK-03B therefore verifies the adapter's stored target
hash against the live Sepolia runtime, verifies the factory repeats that binding,
and rejects a live contract with incompatible adapter metadata. A later runtime
change will fail both production boundaries without relying on simulated target
mutation.

Rollback/failure action: Revert only this factory/shell slice. An incompatible real
ERC-7984 wrapper or direct adapter is a production feasibility blocker; do not
substitute a mock or loosen configuration validation. A trust, custody, state, or
public-interface change requires an ADR before retrying.

Recorded result: Source commit `d0a125d` passed the confirmed Sepolia runner at
blocks `11381154` through `11381157`. The immutable adapter is
`0x98fe9f203eec9752ef4576a6ce10a8c5cccdf4aa`, the permissionless factory is
`0x9f2e004c221eeac79cf966ca730dba4fef32eae0`, and the CREATE2 pool shell is
`0xBc21e28952155EffbC5b5Ef4E36Df8C438d354E7`. All configuration, duplicate,
incompatible dependency, timing, value-rejection, deterministic-address, initial
state, ABI-surface, runtime-binding, and zero-native-balance checks passed. No
confidential callback, handle, proof, ACL operation, or asset transfer occurred.
PK-03B is a completed G5 component and does not pass G5 by itself.

## PK-04 work-item record

ID: `PK-04`

Status: `in_progress`

Outcome: Implement and Sepolia-test the intent-bound two-step confidential commit
defined by ADR-018. This is the smallest real custody slice: it may import owner
inputs, perform confidential allocation, accept exact ERC-7984 collateral through
the unchanged callback boundary, and recover an interrupted pending commit. It does
not begin the cohort, aggregate, resolution, payout, or score lifecycle.

Output files: `modules/protocol/contracts/core/QuietSignalPool.sol`,
`modules/protocol/contracts/core/QuietSignalFactory.sol`,
`modules/protocol/contracts/interfaces/QuietSignalTypes.sol`,
`modules/protocol/contracts/interfaces/IQuietSignalErrors.sol`,
`modules/protocol/contracts/interfaces/IQuietSignalPool.sol`,
`modules/protocol/test/unit/interface-compatibility.test.ts`,
`modules/protocol/scripts/core/run-pk04-stage-sepolia.mts`, package scripts,
`evidence/{offline,sepolia}/G5/PK-04-COMMIT.json`, the spend ledger, protocol/API
specifications, ADR-018, risk R-22, this record, and the traceability matrix.

Acceptance criteria: A same-owner encrypted intent imports stake and probability
once, clamps probability confidentially, derives exact overflow-safe YES/NO
allocation, records no plaintext or handle in an event, and opens one bounded
pending commit. The unchanged real ERC-7984 wrapper calls the pool; the pool checks
wrapper/operator/owner binding, derives the received amount only from the
pre/post-balance delta, grants the wrapper transient access only to an encrypted
acceptance boolean, and lets the wrapper refund a mismatch atomically. A true proof
stores only owner-viewable position handles, updates encrypted aggregates, and
increments the public participant count once. False proof, abandoned intent, and a
timed-out successful callback are permissionlessly recoverable without an admin.

Negative cases: Empty or replayed input proof, duplicate owner/pending intent,
late intent, wrong callback sender/operator/owner, mismatched amount, invalid or
replayed acceptance proof, early timeout, timeout after no callback, timeout after
successful callback, and native value must fail or recover without plaintext,
unbounded authority, or collateral loss. Test all contract/Nox/ACL/asset behavior
only against the real pinned ERC-7984 wrapper on Ethereum Sepolia.

Privacy/custody impact: This is the first production custody slice. Owner input,
allocation, balance delta, aggregate, and return amount remain encrypted; only
sender, pending status/timing, and an amount-free acceptance boolean may be public.
The pool receives persistent compute access only to its own handles, the owner gets
viewer access only to final position handles, and the wrapper gets no persistent
authority.

Funds location/recovery impact: Before the callback, collateral stays in owner
confidential custody. During a callback it is either atomically refunded by the
wrapper or held as the encrypted pending amount in the pool. A true proof makes it
confidential pool custody; a false proof clears it; timeout returns the
conditionally-held encrypted amount to the owner or clears an uncalled intent.

Checks: `npm run test:interfaces`, `npm run compile`, `npm run test:commit:sepolia`,
`npm run check:offline`, `npm run check:sepolia:read`, and `git diff --check`.

Evidence path: `evidence/{offline,sepolia}/G5/PK-04-COMMIT.json` plus append-only
spend-ledger entries. This is a named G5 component only.

Intended commits: `docs: define bounded confidential commit` followed by
`feat: add confidential signal custody`, `test: stage Sepolia commit verification`,
and `test: record Sepolia commit evidence`.

Rollback/failure action: Revert this isolated production custody slice and leave
PK-04 incomplete. A failure of owner-bound proof import, exact callback-delta
matching, scoped wrapper ACL, or timeout return is a stop-ship blocker; do not
replace it with a mock, plaintext amount, trusted relayer, backend escrow, or
permanent wrapper authority.

Partial-run record: Source commit `9d986fb` deployed a fresh fixture
`0x9e2d1b5c8de8a774de20c76402e0ca05acf3b0da`, unchanged inherited wrapper
`0x3aede623df09d33c1f33a5c46953920b6ac10a50`, and immutable adapter
`0x8bd72fb95ad3312b6c71420831f422dc4d39a875` at blocks `11381264` through
`11381267`. The same invocation continued through factory
`0xda40842629be6da6087640e64253ec222ced89c9`, pool
`0x1caab9d1f4182d9791ccccef56e8f4ebbaf5b57f`, fixture mint/wrap, and one accepted
commit at blocks `11381269` through `11381278`, then stopped before mismatch and
timeout branches. The accepted collateral is encrypted pool custody at the recorded
pool; no native value entered it. The resume runner must reuse the exact fixture,
wrapper, and adapter addresses and must not deploy replacements.

The first resume reused those dependencies and deployed a second factory
`0x4865cf531e7ff239ae6cfd2e17d1f91a26acc262` at block `11381300`, then completed
another isolated accepted commit through block `11381308`. It stopped at a
read-only replay probe after finalization; that probe has no custody role and is
removed from the write runner. The associated accepted pool retains only its
documented encrypted collateral. Remaining mismatch and timeout cases must run from
a clean source commit without repeating a completed callback assertion.

A second bounded resume used the same fixture, wrapper, and adapter, deployed
factory `0x5bc56d1be173b97196cc5eb936348741c7f39e05`, and finalized one further
isolated accepted commit at pool `0x1b071d07bf0ce7d60d56969e141322cf760176aa`
through block `11381331`. That accepted pool likewise holds only its documented
encrypted collateral. The source runner will be split into independently invokable
write stages before any remaining negative or recovery branch is attempted; this is
a verification-orchestration change only and does not alter custody, authority, or
the production protocol.

The staged negative-branch fixtures use distinct public `kMin` values solely to
produce distinct immutable test configurations through the factory's deliberate
one-pool-per-configuration constraint. They do not represent multiple markets in
one pool or change the production one-pool/one-market/one-epoch rule.

Completion evidence: `evidence/{offline,sepolia}/G5/PK-04-COMMIT.json` was
independently read on Sepolia after source commit `be918fb`. It binds the compiled
fixture, unchanged inherited wrapper, adapter, factory, and four isolated pools;
checks every recorded receipt against the spend ledger; verifies terminal public
state, owner viewer access, confidential owner conservation, zero native balances,
and direct callback/operator/native-value rejections. The accepted pool retains
only its documented confidential collateral. PK-04 is a completed G5 component,
not G5 itself.

## PK-05 work-item record

ID: `PK-05`

Status: `completed`

Outcome: Implement and Sepolia-test the permissionless cohort close and aggregate
disclosure boundary. A close after the immutable deadline must enter `REFUNDABLE`
below `kMin` without granting aggregate public decryption; at or above `kMin`, it
must request public decryption for the encrypted YES and NO aggregates only, bind a
single request to the pool epoch and aggregate handles, and accept matching Nox YES
and NO proofs into public totals before entering `RESOLUTION_PENDING`.

Output files: `modules/protocol/contracts/core/QuietSignalPool.sol`, common
interfaces and ABI compatibility tests where a selector/error/event changes,
`modules/protocol/scripts/core/run-pk05-aggregate-sepolia.mts`, package scripts,
`evidence/{offline,sepolia}/G5/PK-05-AGGREGATE.json`, the spend ledger, protocol
and API specifications, risk/traceability documents, and this record.

Acceptance criteria: `closeEpoch` is permissionless and rejects early or pending
commit states. Below-k has no aggregate disclosure or request. At/above-k exposes no
owner value, stake, probability, position, total-collateral, payout, or refund
handle; it exposes only aggregate YES/NO to Nox public decryption. Aggregate request
IDs are one-time and context-bound. Valid proof output must exactly match the two
encrypted aggregates; wrong request, context, replay, substituted value, incomplete
proof, and duplicate request must fail with state preservation. The aggregate timeout
starts only when the aggregate request becomes pending; its custody recovery belongs
to PK-06.

Privacy/custody impact: Aggregate YES/NO is the first intentionally public
disclosure in the production pool and occurs only after the `kMin` threshold. Owner
inputs, individual allocations, aggregate total, collateral, and all transfer
amounts remain encrypted. Collateral stays in confidential pool custody in both
below-k and aggregate-pending states.

Funds location/recovery impact: Below-k transitions to `REFUNDABLE` without moving
collateral. At/above-k retains confidential pool custody while a proof is pending;
PK-06 alone may make the elapsed aggregate timeout refundable. No callback, adapter,
or admin may move collateral in this slice.

Checks: `npm run test:interfaces`, `npm run compile`, `npm run test:aggregate:sepolia`,
`npm run check:offline`, `npm run check:sepolia:read`, and `git diff --check`.

Evidence path: `evidence/{offline,sepolia}/G5/PK-05-AGGREGATE.json` plus append-only
spend-ledger entries. This is a named G5 component only.

Intended commits: `docs: define aggregate disclosure boundary`,
`feat: add k gated aggregate lifecycle`, and `test: record Sepolia aggregate evidence`.

Rollback/failure action: Revert this isolated lifecycle slice and leave PK-05
incomplete. A below-k disclosure, public owner/total handle, unbound/replayable proof,
or any collateral movement is stop-ship; do not replace it with a mock, plaintext
aggregate, trusted indexer, or backend proof service.

Completion evidence: `evidence/{offline,sepolia}/G5/PK-05-AGGREGATE.json` passed
independent Sepolia reads at block `11381707`. It verifies below-k `REFUNDABLE`
without aggregate disclosure, the two-member threshold aggregate proof result,
request context, receipt ledger, and zero native balances. PK-05 is a completed G5
component, not G5 itself.

## PK-06 work-item record

ID: `PK-06`

Status: `in_progress`

Outcome: Implement and Sepolia-test permissionless aggregate-timeout recovery and
immutable-adapter resolution. Aggregate timeout may transition only an
`AGGREGATE_PENDING` pool to `REFUNDABLE`; settlement may transition only a
proof-finalized `RESOLUTION_PENDING` pool to `SETTLED` using the adapter's own
read-only result; resolution grace may transition only an unresolved pool to
`REFUNDABLE`.

Output files: `modules/protocol/contracts/core/QuietSignalPool.sol`, ABI tests if
needed, the `PK-06` mode of
`modules/protocol/scripts/core/run-pk05-aggregate-sepolia.mts`,
`modules/protocol/scripts/core/verify-pk06-resolution-sepolia.mts`, package scripts,
`evidence/{offline,sepolia}/G5/PK-06-RESOLUTION.json`, spend ledger,
protocol/API/risk/traceability documents, and this record.

Acceptance criteria: Early aggregate timeout and resolution grace revert. A valid,
fresh, positive adapter round is the only source of the binary winner, round id, and
answer; no caller input selects a result. Wrong/invalid adapter output, zero winning
aggregate, or unavailable round preserves `RESOLUTION_PENDING`. Both recovery paths
are permissionless, have no asset transfer, and preserve confidential pool custody.

The shared staged Sepolia harness uses three distinct PK-06 pools: `timeout` proves
the aggregate-pending guard and elapsed timeout recovery; `grace` proves unavailable
adapter state, the early grace guard, and elapsed grace recovery; `success` proves
adapter-only settlement after the immutable observation time. Each has two real
encrypted commitments and distinct immutable configuration, so no mocked state
transition substitutes for lifecycle evidence.

PK-06 staging timeouts are deliberately at least 120 seconds. This provides enough
time to commit the append-only receipt ledger and perform the required early-revert
read without repeating a deployed lifecycle solely because a short test window
elapsed.

Privacy/custody impact: Resolution adds only public feed facts already returned by
the immutable adapter. It does not decrypt any new Nox handle or reveal owner,
stake, total collateral, transfer, payout, or refund values.

Funds location/recovery impact: All three states retain confidential pool custody.
`cancelBeforeResolution` and `cancelAfterResolutionGrace` only make owners eligible
for PK-07 confidential refunds; they never transfer collateral themselves.

Checks: `npm run test:interfaces`, `npm run compile`,
`npm run test:resolution:sepolia`, `npm run check:offline`, and `git diff --check`.

Evidence path: `evidence/{offline,sepolia}/G5/PK-06-RESOLUTION.json` plus append-only
spend-ledger entries. This is a named G5 component only.

Intended commits: `feat: add bounded resolution and recovery` and
`test: record Sepolia resolution evidence`.

Rollback/failure action: Revert this isolated slice and leave PK-06 incomplete. A
caller-selected outcome, stale/unbound adapter result, premature recovery, any new
public disclosure, or collateral transfer is stop-ship.

## Sequencing

```text
PK-01 → PK-02 → PK-03 → PK-04 → PK-05 → PK-06 → PK-07
                    └──────────────────────────────→ PK-08
PK-01..PK-08 → PK-09 → G5
```

No SDK, relayer, indexer, or web implementation begins in P1.

## Contract behavior checklist

### Deployment and configuration

- [x] Factory validates collateral/wrapper/adapter compatibility and non-zero addresses.
- [x] One pool owns exactly one market and one epoch; deployment starts in `OPEN`.
- [x] Deadline, `kMin`, timeouts, target, condition, collateral, and adapter are immutable.
- [x] Duplicate configuration and deployment salt fail; the ABI is binary-only and accepts no configurable outcome count.
- [x] No upgrade, pause, owner sweep, or hidden administrative settlement path exists.

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
