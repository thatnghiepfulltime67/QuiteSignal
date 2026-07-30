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

## FND-02 work item record

ID: `FND-02`

Outcome: Prove the encrypted probability, stake, allocation, and Brier-score
arithmetic primitives against Ethereum Sepolia NoxCompute before a production pool
or token flow exists.

Status: `complete`

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
`docs/operations/02-risk-register.md`, `docs/operations/03-decision-log.md`, and
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
`npm run doctor -- --assert-missing-nox-runtime`, `npm run budget:status`, `npm run check:offline`,
`npm run check:sepolia:read`, `npm run scan:secrets`, and `git diff --check`.

Evidence path: `evidence/offline/G1/FND-02.json`,
`evidence/sepolia/G1/FND-02.json`, and `evidence/reports/G1-summary.md`.

Intended commit: `test: prove encrypted signal arithmetic`.

Rollback/failure action: Revert only the isolated FND-02 source commit. The
deployed Sepolia spike has no asset custody and needs no on-chain recovery. A
failed required primitive, proof binding, or runtime behavior is a G1 failure;
FND-03 through FND-07 and P1 remain blocked until an ADR-approved redesign passes
the complete G1 gate.

Completion: The isolated arithmetic harness and encrypted vector batch confirmed
at Sepolia blocks `11377593` and `11377594`. A bytecode-matched read-only
verification passed ten vectors, 33 public feasibility assertions, four encrypted
input negative cases, and the missing-runtime Sepolia preflight. Sanitized evidence
is recorded at `evidence/offline/G1/FND-02.json`,
`evidence/sepolia/G1/FND-02.json`, and `evidence/reports/G1-summary.md`. The
harness has no asset custody. G1 remained running until FND-03 proved ACL and
persistence behavior; the combined gate is now passed.

## FND-03 work item record

ID: `FND-03`

Outcome: Prove persistent Nox handle authority and minimal viewer access directly
on Ethereum Sepolia before any confidential asset or pool lifecycle exists.

Status: `complete`

Prerequisite gates: G0 passed and FND-02 arithmetic evidence is recorded. G1 passed
after the recorded FND-03 Sepolia verification. The throwaway deployer both encrypts
and submits the owner input, because Nox verifies the input proof against the
application caller. Other test-only actor keys come from an ignored mnemonic when
configured, or from ignored `.secrets/` otherwise. Private material must never
enter output, source, evidence, or Git.

Files/modules allowed: `modules/protocol/contracts/feasibility/`,
`modules/protocol/scripts/feasibility/`, `modules/protocol/test/feasibility/`,
`ops/scripts/`, `package.json`, `package-lock.json`,
`evidence/offline/G1/`, `evidence/sepolia/G1/`,
`evidence/sepolia/spend-ledger.json`, `evidence/reports/`,
`docs/plans/00-foundation-and-feasibility.md`,
`docs/plans/evidence-ledger.md`, `docs/operations/nox-feedback.md`,
`docs/operations/02-risk-register.md`, and
`docs/operations/04-source-and-assumption-register.md`.

Acceptance criteria: An isolated Sepolia ACL spike imports an encrypted owner
input bound to its own address, stores only a derived encrypted handle, grants the
owner viewer access without compute access, and proves in later transactions that
only the spike retains the compute authority needed for its next operation. A
separate transient recipient must use delegated access inside one transaction and
lose it afterwards. The owner client can decrypt its own derived test value without
the value being logged; the stored owner-shaped handle is never publicly decryptable.

Negative cases: A replayed import, input encrypted for another spike, wrong
encrypted type, uninitialized external handle, unrelated viewer decrypt, keeper,
adapter, and token compute/view attempts, and a public-decrypt attempt on the
owner-shaped handle must fail or report denied authority on Sepolia. The actor
matrix must cover the pool spike, owner, unrelated wallet, keeper, adapter, and
token identities without exposing their private material.

Privacy/custody impact: The runner may compare an owner decryption to an expected
test value only in process memory. No test plaintext, handle, proof, calldata,
signature, mnemonic, or environment value may appear in logs, evidence, or
committed fixtures. This spike has no token or collateral path.

Funds location/recovery impact: Only bounded Sepolia gas is permitted. No assets
are accepted; a failed ACL proof leaves no funds to recover. Record every confirmed
receipt in the spend ledger and stop dependent work if the owner-shaped handle can
be public-decrypted or a non-pool actor receives persistent compute authority.

Resume behavior: A partial no-custody run may resume only with the three
bytecode-matched deployed harness addresses after a clean-source and fresh-budget
preflight. The runner first confirms that the primary spike has a materialized
derived handle, skips import, and begins the persistence and transient-access proof
steps. It refreshes the fee estimate for each such write.

Commands/checks: `npm run compile`, `npm run test:nox:sepolia -- FND-03 --dry-run`,
`npm run test:nox:sepolia -- FND-03`, `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Evidence path: `evidence/offline/G1/FND-03.json`,
`evidence/sepolia/G1/FND-03.json`, and `evidence/reports/G1-summary.md`.

Intended commit: `test: prove handle binding and acl lifecycle`.

Rollback/failure action: Revert only the isolated FND-03 source commit. Deployed
spikes have no custody. If a required ACL condition cannot be proven on Sepolia,
record the sanitized receipt and authority matrix, mark G1 failed, and do not
replace the result with a trusted backend or a local-chain substitute.

Completion: Three bytecode-matched isolated contracts were deployed at Sepolia
blocks `11377738` through `11377741`. The primary spike imported the encrypted
owner input at block `11377788`, proved persistent computation at `11377790`, and
proved transient-recipient expiry at `11377791`. A read-only verification at block
`11377822` passed the full authority matrix, owner decryption scope, and eleven
negative assertions. Sanitized evidence is recorded at
`evidence/offline/G1/FND-03.json`, `evidence/sepolia/G1/FND-03.json`, and
`evidence/reports/G1-summary.md`. The isolated harness has no asset custody. G1 is
passed; FND-04 is the next eligible work item.

## FND-04 work item record

ID: `FND-04`

Outcome: Prove the real Nox `ERC20ToERC7984Wrapper` confidential-asset lifecycle
on Ethereum Sepolia, including encrypted pull, owner-only return, proof-gated
unwrap finalization, and delayed rewrap recovery before any production collateral
path exists.

Status: `complete`

Prerequisite gates: G0 and G1 passed. The feasibility harness must use the pinned
`@iexec-nox/nox-confidential-contracts@0.2.2` wrapper implementation unchanged.
An isolated mintable ERC-20 fixture may supply valueless test collateral only; it
cannot replace wrapper, Nox, proof, ACL, or Sepolia evidence requirements.

Files/modules allowed: `modules/protocol/contracts/feasibility/`,
`modules/protocol/scripts/feasibility/`, `modules/protocol/test/feasibility/`,
`ops/scripts/`, `package.json`, `package-lock.json`, `evidence/offline/G2/`,
`evidence/sepolia/G2/`, `evidence/sepolia/spend-ledger.json`,
`evidence/reports/`, `docs/plans/00-foundation-and-feasibility.md`,
`docs/plans/evidence-ledger.md`, `docs/operations/nox-feedback.md`,
`docs/operations/02-risk-register.md`, and
`docs/operations/04-source-and-assumption-register.md`.

Acceptance criteria: A bytecode-matched Sepolia spike deploys an isolated public
ERC-20 fixture, an unchanged inherited Nox ERC20-to-ERC7984 wrapper, and a
receiver/recovery spike. Before the callback, the owner registers a context-bound
encrypted expected stake and the receiver snapshots its permitted wrapper balance.
The callback derives the encrypted post-transfer delta, compares it to the expected
stake, and returns that encrypted equality result to the unchanged wrapper. A false
result must make the wrapper refund the transfer in the same transaction; only a
public-decrypt proof for the equality boolean, never an amount, can finalize an
accepted deposit. Only the recorded owner can receive the accepted confidential
amount once. The spike burns the accepted confidential amount into a
public-decryptable unwrap request; a gateway proof finalizes the release and the
observed public ERC-20 balance delta equals the released amount. A delayed recovery
path rewraps the released balance into confidential custody before a one-time owner
refund.

Negative cases: Missing callback ACL, absent or replayed intent, callback amount
that differs from the registered encrypted intent, unauthorized caller, wrong token
callback, wrong recipient, repeated return/refund, stale or duplicate unwrap
finalization, early recovery, malformed or unavailable unwrap proof, and an unwrap
whose observed underlying balance delta differs from the requested public amount
must fail directly on Sepolia. The test must prove that public decryption is limited
to the protocol-required unwrap request and an amount-free deposit-acceptance
boolean; it must never expose the owner-shaped stake handle.

Privacy/custody impact: Test values, raw handles, proofs, calldata, signatures,
and environment material remain process-local and are never logged or committed.
The only added public-decryption surface is an encrypted equality boolean that
reveals acceptance, not a stake amount. The fixture ERC-20 has no external value.
The wrapper and all confidential transfer, wrapper refund, burn, public-decryption
proof, finalization, and rewrap behavior are live Sepolia operations; no local chain
or fake confidential-token substitute is evidence.

Funds location/recovery impact: The only real expenditure is bounded Sepolia gas.
Fixture collateral moves among the owner, wrapper, and isolated spike. During an
unwrap request the underlying remains in the wrapper; after valid finalization it is
at the recovery spike until rewrapped; after return/refund it is in the owner's
confidential wrapper balance. Every confirmed receipt is appended to the spend
ledger. If wrapper semantics, proof finalization, or recovery cannot be proven,
record the sanitized evidence and stop G2-dependent work.

Commands/checks: `npm run compile`, `npm run test:nox:sepolia -- FND-04 --dry-run`,
`npm run test:nox:sepolia -- FND-04`, `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Evidence path: `evidence/offline/G2/FND-04.json`,
`evidence/sepolia/G2/FND-04.json`, and `evidence/reports/G2-summary.md`.

Intended commit: `test: prove confidential asset recovery`.

Rollback/failure action: Revert only isolated FND-04 source commits. The fixture
token and wrapper have no real asset custody; no recovery beyond the recorded
fixture-balance location is required. Any failed proof-finalization, ACL, balance
delta, or rewrap condition fails G2 and blocks FND-05 through FND-07 and P1.

Checkpoint: The first live run deployed the fixture collateral, unchanged wrapper,
and two isolated spikes at blocks `11377909` through `11377913`, then completed
fixture mint, approval, and first wrap. A read-only `confidentialTransferAndCall`
probe proved that its callback amount lacks receiver compute access; F-004 and
ADR-012 record the required recipient-balance-delta design. A corrected happy-path
run then passed at blocks `11377980` through `11377995`, including return, unwrap,
rewrap, and terminal read-only verification. That run exposed F-005: using the
whole post-callback balance without a registered encrypted intent can let an
unrelated direct transfer contaminate the recorded stake. G2 remains running. The
next hardened slice must prove encrypted intent/delta equality, wrapper refund on a
mismatch, amount-free acceptance proof, and the existing lifecycle directly on
Sepolia. The first hardened run deployed three intent-bound spikes at blocks
`11378064` through `11378067` and registered its first intent at block `11378069`,
but its callback simulation exposed F-006: the wrapper needs transient access to
the encrypted acceptance boolean it consumes for its atomic refund. The corrected
receiver must grant that one-transaction ACL explicitly before returning the boolean.
The next run passed the callback and acceptance proof at blocks `11378095` through
`11378098`, then exposed F-007 during return simulation: the wrapper also needs
one-transaction access to the encrypted held amount whenever it transfers or burns
that amount. The corrected receiver must grant this scoped access immediately before
each wrapper call. The old isolated direct spike at
`0x5a6cd68e2ee9aef073e7f95354fa9d0b7d7cb210` now holds valueless fixture
collateral from that accepted test transfer and cannot execute its missing ACL grant;
it is permanently excluded from all subsequent runs. Its location and lack of
recovery are recorded in F-007. The harness now snapshots the encrypted owner
balance in memory at the beginning of each clean retry and proves exact return
relative to that baseline. The final intent-bound run passed at blocks `11378127`
through `11378152`; its read-only verifier passed at block `11378163`. Sanitized
evidence is recorded at `evidence/offline/G2/FND-04.json`,
`evidence/sepolia/G2/FND-04.json`, and `evidence/reports/G2-summary.md`. G2 is
passed; FND-05 is the next eligible work item. The confirmed receipts are in the
append-only Sepolia spend ledger.

## FND-05 work item record

ID: `FND-05`

Status: `in_progress`

Outcome: Prove an isolated, real Nox confidential-cohort lifecycle on Ethereum
Sepolia: distinct-address commits with confidential collateral, below-k refund with
no aggregate disclosure, aggregate-only public decryption at k, a context-bound
single-use aggregate proof, pre-unwrap timeout, and delayed unwrap finalization plus
rewrap recovery. This is a feasibility harness, not a production pool or adapter.

Prerequisites: G1 and G2 are passed. The harness must use a fresh Sepolia fixture
collateral deployment and a bytecode-matched, unchanged inherited Nox
`ERC20ToERC7984Wrapper`; it must not reuse the documented pre-fix FND-04 residue.
The second cohort member is a newly generated local test account that receives only
the bounded Sepolia gas needed to sign and submit its own inputs. Its key is stored
only in an owner-readable, Git-ignored local recovery record until terminal refunds
are verified, then deleted; it is never printed, committed, or included in evidence.

Output files: `modules/protocol/contracts/feasibility/AggregateRecoverySpike.sol`,
`modules/protocol/scripts/feasibility/run-aggregate-recovery-sepolia.mts`,
`modules/protocol/scripts/feasibility/run-nox-sepolia.mts`,
`modules/protocol/scripts/feasibility/recover-fnd05-timeout-sepolia.mts`, the narrowly required
protocol test/model files, `evidence/offline/G3/FND-05.json`,
`evidence/sepolia/G3/FND-05.json`, `evidence/reports/G3-summary.md`,
`evidence/sepolia/spend-ledger.json`, `docs/plans/evidence-ledger.md`, and this
work-package record. Findings, risk, source, or decision records are added only if
the live behavior changes an existing conclusion.

Acceptance and test plan:

- `T-FND-05-BELOW-K-01`: one real sender commits confidential collateral, deadline
  closes below k, aggregate handles remain non-public, and the recorded owner can
  refund once from confidential custody.
- `T-FND-05-AGGREGATE-01`: two independently signing Sepolia senders commit and
  transfer confidential collateral; only encrypted YES/NO cohort aggregates acquire
  public-decrypt permission after the k-gate. Individual stake, probability, and
  aggregate total do not.
- `T-FND-05-PROOF-01`: aggregate finalization accepts only its derived
  `(chainId, pool, epochId, requestId)` context, rejects cross-pool, wrong-chain,
  wrong-epoch, and replayed requests, and rejects a substituted aggregate plaintext
  against the valid gateway proof.
- `T-FND-05-TIMEOUT-01`: an aggregate-pending epoch cancels before unwrap only after
  the timeout and returns each committed confidential stake through the refund path.
- `T-FND-05-RECOVERY-01`: after an aggregate proof requests unwrap, a delayed,
  permissionless finalization measures the real underlying balance delta, requires
  `publicYes + publicNo == releasedCollateral` before any execution boundary, wraps
  all released fixture collateral back into confidential custody, and enables each
  owner refund exactly once.

Privacy impact: artificial test values are encrypted before submission and no
owner-shaped handle is marked publicly decryptable. Public permission is granted
only to cohort YES/NO aggregates after the threshold; public identities, membership,
transaction timing, aggregate totals, and the isolated fixture addresses remain
public as documented. This slice does not make an anonymity claim.

Funds location and rollback: during `OPEN`, `AGGREGATE_PENDING`, and `REFUNDABLE`,
accepted valueless fixture collateral is in the harness's confidential wrapper
balance. During `CommitPending` before a callback, it remains with the committing
owner; after a callback it is either accepted into the harness or atomically refunded
by the wrapper until the public acceptance proof resolves that outcome. During
`UNWRAP_PENDING`, it is a wrapper burn awaiting proof; recovery finalizes into the
harness public balance only long enough to measure the delta and immediately rewraps
it before refunds. A failed or reverted path leaves the wrapper state unchanged.
Failed feasibility means record sanitized evidence, preserve any known fixture
location, and block G3/P1; do not introduce a mock adapter or trusted recovery
service. Reverting this isolated source is the code rollback; deployed fixture
contracts have no product custody.

Commands/checks: `npm run compile`, `npm run test:nox:sepolia -- FND-05 --dry-run`,
`npm run test:nox:sepolia -- FND-05`, `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Evidence path: `evidence/offline/G3/FND-05.json`,
`evidence/sepolia/G3/FND-05.json`, and `evidence/reports/G3-summary.md`.

Intended commit: `test: prove aggregate disclosure and recovery`.

Checkpoint: The first FND-05 Sepolia attempt from source commit `e4ad2bf` deployed a
fresh fixture at `0x63d3dd9dfce5c3e8daec5dbc4420df9d1e39e50e`, an unchanged wrapper
at `0x86af5b01f0165afda75f4d93c5974c8bd7f275c5`, and isolated below-k, timeout, and
recovery spikes at `0x3b72756b9325f3eadd045f6d729ee1227575da38`,
`0x4fdeb45b1e6ff87cd60c71967ced0e78b32d7414`, and
`0xf9721a2615b099f7aaafd65770f0e48338565c11`. The below-k branch reached refund
and returned its fixture collateral. The timeout spike reached
`AGGREGATE_PENDING` with the expected two accepted fixture commitments and only its
YES/NO aggregate handles public. The original 45-second timeout expired between the
aggregate request and the intended negative call because Sepolia block cadence made
the requested early-timeout check non-deterministic. The runner stopped before a
timeout cancellation or refund write; G3 remains running, not passed.

The timeout spike holds only deterministic, valueless fixture collateral. The
deployer-owned portion remains refund-recoverable after permissionless cancellation;
the independent test actor used a process-local key that was discarded when the
failed process exited, so its owner-authorized fixture refund is unavailable. This
is not product custody and none of these contracts may be reused. The location,
exclusion, and runner correction are recorded in
`evidence/reports/G3-FND-05-timeout-retry-finding.md`. The retry must use a longer
timeout and a local ignored recovery record for its generated test actor, deleting
that record only after terminal refunds have been independently verified.

The second fresh attempt from source commit `2ce876f` deployed fixture
`0xf78a45a3386537f439bd8c3a38d8947a3e835ac6`, wrapper
`0xc8306a034c4a0724ab0e426924b62006d2acf693`, and isolated spikes
`0xbbc754d76e94d9e34e2aaea753a2a6997b56aa8d`,
`0x36e1addccf167fc094c404de877a5cc45fb9ac8d`, and
`0x5211fa15c33ba0f7b0d4c964be7a10936e81200c` at blocks `11378338` through
`11378377`. It again passed the below-k refund and reached
`AGGREGATE_PENDING` with two accepted members. It then proved that increasing the
duration alone was insufficient: the harness measured aggregate timeout from the
commit deadline, allowing a long multi-user commit sequence to consume it before
the state transition. It stopped before cancellation or refunds. The persisted
ignored actor recovery record permits a dedicated legacy recovery to return both
fixture stakes. The next fresh attempt starts that timeout on the on-chain
`AGGREGATE_PENDING` transition, which matches the normative state machine.

The dedicated legacy recovery then passed at blocks `11378407` through `11378410`:
it cancelled the second attempt permissionlessly and completed both confidential
owner refunds. The runner verified the two terminal owner balances locally and
deleted its ignored secondary-actor recovery record. The second attempt therefore
has no remaining fixture custody; only the separately documented first-attempt
process-local-key residue remains excluded.

The third fresh attempt from source commit `76756cc` deployed fixture
`0x7e6b7da523a1ac5ead6c74ca7463d5eb46d5a9e2`, wrapper
`0x81af22666159e5c0fe0145345e429d855408e892`, and timeout spike
`0x0d5a263352d4d6046e9eb1d471f4ce474599eab8` at blocks `11378423` through
`11378459`. It stopped immediately after the aggregate request and before timeout
cancellation or refunds. Investigation showed that Hardhat's incremental build had
reported no Solidity work after the timeout-state source change, leaving the runner
with stale compiled artifacts. The contracts in this attempt are excluded and their
two fixture stakes are recoverable through the persisted ignored actor record. The
compile command now forces rebuilds, and the next attempt may begin only after that
legacy recovery passes and fresh runtime bytecode is confirmed.

That third-attempt legacy recovery passed at blocks `11378471` through `11378474`,
returned both fixture stakes, verified terminal owner balances locally, and deleted
the ignored actor recovery record. The third attempt therefore has no remaining
fixture custody.

The fourth attempt from `cc2b438` used the forced build and deployed fixture
`0x504e30b11860d5c85efc2f098b03582e1710067e`, unchanged wrapper
`0x574bdcd473425c78c0b68c5d5a0a8feb3943937e`, and timeout spike
`0x22a27c2794f3a5f7420e4257bfa4124bb44cc224` at blocks `11378485` through
`11378526`. It passed the below-k branch and reached aggregate pending with the
state-entry timeout timestamp set on-chain and only YES/NO aggregate access.
Because it did not emit a terminal result after its aggregate request, no timeout
negative assertion is claimed from this attempt. Its retained ignored actor record
enables a permissionless timeout cancellation and both owner refunds before the next
staged fresh run. The full sanitized finding is in
`evidence/reports/G3-FND-05-timeout-retry-finding.md`.

The fourth-attempt recovery completed at blocks `11379485` through `11379488`.
It cancelled permissionlessly, returned both owner stakes exactly once, verified the
two terminal confidential balances locally, and deleted the ignored actor recovery
record. It has no remaining fixture custody, but remains excluded from G3 evidence
because the interrupted execution did not record its timeout negative assertion.
The recovery runner retries boundedly for Nox owner decryption and can resume an
already refundable fixture without repeating an on-chain cancellation or refund.

The fifth fresh attempt from `1d1c69f` deployed fixture
`0x58efcb66dce89743b2ecf293b0ea12450a286524`, unchanged wrapper
`0x37e364e0d521425b2caf07336e7e1448d248288e`, and timeout spike
`0x056d4605f541f7f9d374372c59bccc93bda3c750` at blocks `11379507` through
`11379548`. It completed the below-k refund and reached threshold aggregate pending,
but the RPC simulation for the early timeout negative assertion did not return. No
timeout cancellation or refund was sent. This is not a contract conclusion and the
attempt is excluded from G3 evidence. Its ignored actor record enables recovery of
both fixture stakes. The next revision replaces that unbounded simulation with a
real, bounded Sepolia transaction whose reverted receipt is the required evidence.
The fifth-attempt recovery passed at blocks `11379571` through `11379574`, verified
both terminal owner balances with bounded retries, and deleted the ignored actor
record. The fixture has no remaining custody and remains excluded from G3 evidence.
The revised runner bounds all RPC observation calls and treats a transport failure as
a test failure. Its early-timeout negative case sends a fixed-gas, expected-revert
Sepolia transaction and records the receipt cost in the spend ledger.

The sixth attempt from `ecefae9` deployed fixture
`0x33f1dbbbb5d8d2ca5ad5bfde9ebed26bc47b3402`, unchanged wrapper
`0xe9d3c7d76ed48272f363517349dba7acc43a6b06`, and below-k spike
`0x4378f7fbb7f2f2c3a06b2398901efa09a52b6e71` at blocks `11379587` through
`11379611`. It verified below-k terminal state and no aggregate disclosure, then
returned its committed stake. It was stopped before threshold work so every remaining
negative simulation can be replaced with a chain-native expected-revert receipt.
The fixture is excluded from G3 evidence and its uncommitted actor key was deleted.
The runner now records every contract-state negative assertion through a bounded
Sepolia transaction with an expected-revert receipt. Only Nox gateway decryption
denials remain off-chain observations; they have a hard timeout and fail the run if
the gateway cannot return a result.

The seventh attempt from `715bef5` deployed fixture
`0x4b317e2379456b26bbe68767e05a6707f7341380`, unchanged wrapper
`0xdad15c2ec05442ca55f6834a05865265fb6e028f`, and timeout spike
`0xc2e11c9358110b0a840d3c342629d912ddad299b` at blocks `11379629` through
`11379667`. It completed the below-k path and emitted expected-revert receipts for
early close, duplicate refund, and early timeout cancellation. The runner then
retained a cached block while the timeout was already elapsed on-chain, before it
sent any cancellation or refund. The fixture is excluded and recoverable; set public
client cache time to zero before a fresh run.
The seventh-attempt recovery passed at blocks `11379685` through `11379687`,
cancelled permissionlessly, refunded both recorded owners, verified terminal
confidential balances locally, and deleted the ignored actor record.
The public feasibility client now disables response caching, so every lifecycle wait
observes a fresh Ethereum Sepolia block timestamp.

The eighth attempt from `5d719a7` deployed fixture
`0x7030020b8def6ec1525139cab662a726b7eec68d`, unchanged wrapper
`0xba9f988ecc52947537dcbebe9435d74bc7194cd6`, and timeout spike
`0xfb9be2653c1d3cb183ab6d1917d7a20f825acb57` at blocks `11379697` through
`11379735`. It completed below-k and recorded the expected early rejections, but
Viem lifecycle polling did not advance after the on-chain timeout. No cancellation
or refund was sent. The fixture is recoverable and excluded; replace lifecycle waits
with bounded direct RPC latest-block reads before another fresh verification.
The eighth-attempt recovery passed at blocks `11379758` through `11379760`,
cancelled permissionlessly, refunded both owners, verified terminal balances locally,
and deleted the ignored actor record.

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
- [x] G1 passed: arithmetic, context binding, ACL, and persistence pass directly on Sepolia.
- [x] G2 passed: confidential asset success and recovery conserve funds.
- [ ] G3 passed: aggregate-only disclosure and proof/recovery semantics pass.
- [ ] G4 passed: one unchanged public protocol and adapter boundary are selected.
- [ ] Evidence ledger contains validated, sanitized records for G0–G4.
- [ ] All P0 findings, risks, and architecture consequences are documented.
- [ ] User explicitly approves transition to P1.

## Exit decision

`PASS`: mark P0 complete and begin P1.

`REDESIGN`: update architecture/ADR, reset affected gates to `not_run`, and repeat.

`STOP`: mark P0 blocked; do not hide the failure with mocks or trusted services.
