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
| FND-06 | Public resolution selected    | Decision matrix + minimal resolution-adapter spike       | License, unchanged target, code hash, freshness, threshold, zero custody    | G4    | `test: prove public resolution adapter boundary` |
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

Status: `complete`

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
`modules/protocol/scripts/feasibility/run-fnd05-below-k-sepolia.mts`,
`modules/protocol/scripts/feasibility/run-fnd05-timeout-sepolia.mts`,
`modules/protocol/scripts/feasibility/run-fnd05-aggregate-recovery-sepolia.mts`,
`modules/protocol/scripts/feasibility/run-nox-sepolia.mts`, and
`modules/protocol/scripts/feasibility/recover-fnd05-timeout-sepolia.mts`, the
narrowly required protocol test/model files,
`evidence/offline/G3/FND-05-*.json`, `evidence/sepolia/G3/FND-05-*.json`, the
combined `evidence/offline/G3/FND-05.json` and
`evidence/sepolia/G3/FND-05.json`, `evidence/reports/G3-summary.md`,
`evidence/sepolia/spend-ledger.json`, `docs/plans/evidence-ledger.md`, and this
work-package record, plus `ops/scripts/verify-evidence.mts` and its package
command. The historical monolithic runner is retained only for its
documented recovery context; it cannot create new G3 gate evidence. Findings, risk,
source, or decision records are added when live behavior changes an existing
conclusion.

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

Delivery slices under ADR-013 are sequential and independently terminal. They do
not relax any acceptance criterion; G3 passes only when all three have verified
evidence and the combined read verifier passes.

| Slice     | Status     | Evidence scope                                 | Terminal requirement                                                                   |
| --------- | ---------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `FND-05A` | `complete` | `T-FND-05-BELOW-K-01`                          | One owner refund once; no aggregate disclosure; no secondary actor required.           |
| `FND-05B` | `complete` | `T-FND-05-AGGREGATE-01`, `T-FND-05-TIMEOUT-01` | Permissionless timeout cancellation and both owner refunds once.                       |
| `FND-05C` | `complete` | `T-FND-05-PROOF-01`, `T-FND-05-RECOVERY-01`    | Rewrapped confidential custody and both owner refunds once after delayed finalization. |

### FND-05A work-item record

Outcome: Prove the below-k branch on a fresh Ethereum Sepolia fixture with one
confidential commitment, no public aggregate-decrypt permission, and one terminal
confidential refund. It is intentionally independent of threshold, proof, and
unwrap behavior.

Output files: `modules/protocol/scripts/feasibility/run-fnd05-below-k-sepolia.mts`,
`modules/protocol/scripts/feasibility/resume-fnd05-below-k-sepolia.mts`, and the
required dispatcher/test support,
`evidence/offline/G3/FND-05-BELOW-K.json`,
`evidence/sepolia/G3/FND-05-BELOW-K.json`, the G3 report and spend ledger.

Checks: `npm run compile`, `npm run test:nox:sepolia -- FND-05-BELOW-K --dry-run`,
the confirmed Sepolia command, and when a documented non-terminal fixture exists,
the named resume dry run and confirmed resume command; then `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Privacy impact and funds: the single artificial test input is encrypted before
submission; public identities, timing, and fixture addresses remain public. The
fixture collateral is in the wrapper during the commitment and returns once to the
same owner on terminal refund. A failure records the fixture location and blocks
this slice; it introduces neither a mock nor a trusted recovery service.

Evidence path: `evidence/offline/G3/FND-05-BELOW-K.json` and
`evidence/sepolia/G3/FND-05-BELOW-K.json`.

Intended commit: `test: isolate below-k Sepolia evidence`.

### FND-05B work-item record

Outcome: Prove the threshold branch on a fresh Ethereum Sepolia fixture with two
independently signing confidential members, public decryption permission on exactly
the YES and NO aggregates, a real early-timeout rejection, then permissionless
timeout cancellation and one terminal refund per owner. It is independent of
aggregate-proof finalization and unwrap recovery.

Prerequisites: FND-05A evidence is terminal; G1 and G2 remain passed. The second
member receives only bounded testnet gas, retains its key solely in an ignored local
recovery record, and the record is deleted only after both terminal refunds verify.

Output files: `modules/protocol/scripts/feasibility/run-fnd05-timeout-sepolia.mts`,
the required dispatcher/test support,
`evidence/offline/G3/FND-05-TIMEOUT.json`,
`evidence/sepolia/G3/FND-05-TIMEOUT.json`, the G3 report and spend ledger.

Checks: `npm run compile`, `npm run test:nox:sepolia -- FND-05-TIMEOUT --dry-run`,
the confirmed Sepolia command, `npm run budget:status`, `npm run check:offline`,
`npm run check:sepolia:read`, `npm run scan:secrets`, and `git diff --check`.

Privacy impact and funds: both artificial inputs are encrypted before submission.
Only the threshold YES/NO aggregate handles may receive public-decrypt permission;
individual inputs and aggregate total remain non-public. Before cancellation,
accepted fixture collateral is in confidential pool custody; after cancellation each
recorded owner refunds once. A failure records the exact fixture state and preserves
the local recovery record; it never introduces a mock or trusted recovery service.

Evidence path: `evidence/offline/G3/FND-05-TIMEOUT.json` and
`evidence/sepolia/G3/FND-05-TIMEOUT.json`.

Intended commit: `test: isolate threshold timeout evidence`.

Core-path triage: FND-05B is not optional. It directly covers the G3 k-gate,
aggregate disclosure scope, permissionless timeout, and confidential refund recovery.
The previous coupled runner is supporting orchestration and has been replaced by
bounded slices; further orchestration features that do not improve those acceptance
criteria are deferred. Any future removal must follow Plan §2.2 and cannot waive
`T-FND-05-AGGREGATE-01` or `T-FND-05-TIMEOUT-01`.

### FND-05C work-item record

Outcome: Prove aggregate proof-context binding and delayed, permissionless unwrap
recovery on one fresh Ethereum Sepolia fixture. Two independently signing
confidential members must reach the k-gated aggregate state; only aggregate YES/NO
may become publicly decryptable. The harness must reject a cross-pool, wrong-chain,
wrong-epoch, substituted, and replayed aggregate proof; it must reject recovery
before the delay, then measure the actual unwrap collateral, rewrap all of it into
confidential custody, and refund each owner once.

Prerequisites: FND-05A and FND-05B terminal evidence is recorded; G1 and G2 remain
passed. The context peer is an isolated no-custody contract used only to derive a
different pool context. A bounded-gas secondary actor is stored only in an ignored
local recovery record and is deleted only after both terminal refunds verify.

Output files: `modules/protocol/scripts/feasibility/run-aggregate-recovery-sepolia.mts`,
`modules/protocol/scripts/feasibility/run-fnd05-aggregate-recovery-sepolia.mts`,
`modules/protocol/scripts/feasibility/resume-fnd05-aggregate-recovery-sepolia.mts`,
`modules/protocol/contracts/feasibility/AggregateFinalizationProbe.sol`,
`modules/protocol/scripts/feasibility/run-fnd05-aggregate-proof-diagnostic-sepolia.mts`,
`modules/protocol/scripts/feasibility/recover-fnd05-stale-aggregate-sepolia.mts`,
the required dispatcher/test support,
`evidence/offline/G3/FND-05-RECOVERY.json`,
`evidence/sepolia/G3/FND-05-RECOVERY.json`,
`evidence/sepolia/G3/FND-05-PROOF-DIAGNOSTIC.json`, the G3 report, and the
append-only Sepolia spend ledger. The stale-fixture recovery record is
`evidence/sepolia/G3/FND-05C-STALE-FIXTURE-RECOVERY.json`. A local ignored failure
marker may contain only the work-item ID, sanitized stage, and error category; it
never contains an error message, input, handle, proof, calldata, signature, key, or
RPC value.

Checks: `npm run compile`,
`npm run test:nox:sepolia -- FND-05-RECOVERY --dry-run`, the confirmed Sepolia
command only after its reviewed dry run, the proof-diagnostic dry run and its
confirmed Sepolia command only after reviewed budget preflight, then `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Privacy impact and funds: both artificial inputs are encrypted before submission;
the evidence records neither plaintext, handles, proofs, calldata, signatures, nor
the local secondary key. Accepted fixture collateral remains confidential pool
custody until the valid proof starts an unwrap, then is burn-pending until delayed
permissionless recovery measures and rewraps it. Each owner refunds once only after
the spike returns to `Refundable`. Any failure preserves the local recovery record,
records the exact public fixture state, and blocks G3; it never substitutes a mock
gateway, a trusted relayer, or a custodial recovery service.

Evidence path: `evidence/offline/G3/FND-05-RECOVERY.json` and
`evidence/sepolia/G3/FND-05-RECOVERY.json`.

Rollback/failure action: Revert the isolated runner slice only. The deployed
fixtures contain deterministic valueless test collateral; a non-terminal fixture is
recovered with the retained actor record before another fresh run. A proof-context,
conservation, rewrap, or terminal-refund failure is a G3 blocker, not an optional
feature eligible for triage.

Intended commit: `test: isolate aggregate recovery evidence`.

Diagnostic sub-slice: The serialized retry at blocks `11380260` through `11380264`
again produced the required context and substituted-plaintext reverts, then the valid
fixed-gas finalization reverted after 318301 gas. A read-only Sepolia probe validates
both freshly obtained public proofs directly in Nox Compute, confirms each has a
32-byte result matching the declared aggregate, and confirms the recovery spike has
persistent access to the aggregate amount while the wrapper has persistent access to
its balance. The public RPC does not expose the nested revert selector. Before any
further recovery write, `AggregateFinalizationProbe` will call the existing
permissionless finalization once and classify only its selector into a fixed public
enum. It never emits, stores, or writes proof bytes, handles, plaintext, calldata,
or keys. A caught failure leaves the target state unchanged; an unexpected success
is the real target transition to `UNWRAP_PENDING` and must continue through the
ordinary delayed recovery and refunds. This diagnostic is not gate evidence and
does not weaken `T-FND-05-PROOF-01` or `T-FND-05-RECOVERY-01`.

Diagnostic intended commit: `test: diagnose aggregate finalization failure`.

Correction and stale-fixture recovery sub-slice: The committed diagnostic deployed
probe `0x7aaddc0f67f024cc7616ddb770da0fa83533f545` at block `11380349` and made one
real classifier call at block `11380351`. It reported `NoxUnauthorizedSender` while
leaving the target `AGGREGATE_PENDING`. Source review identifies the exact defect:
`finalizeAggregate` requests a wrapper unwrap, then incorrectly calls
`Nox.allowThis(unwrapRequest)`. The wrapper, rather than the spike, creates that
handle and only receives its transient compute access; the spike must not re-grant
it. The correction removes that invalid ACL operation. The pre-fix fixture cannot
provide post-fix evidence. The dedicated ABI-only Sepolia continuation cancelled it
at block `11380418`, returned both confidential owner refunds at blocks `11380419`
and `11380420`, and verified the terminal `Refundable` state before deleting the
local secondary-key record. Its sanitized artifact is
`evidence/sepolia/G3/FND-05C-STALE-FIXTURE-RECOVERY.json`. It never treats the old
runtime as a match for the corrected artifact or as FND-05C proof/recovery evidence.
A new isolated fixture must now prove every remaining FND-05C condition with the
corrected runtime.

Corrected-fixture checkpoint: The fresh runtime from `ed38e6c` deployed fixture
`0x927a2dcb37d6605364a2385fccb1dfc1aa63f41c`, unchanged wrapper
`0xfe835271300bff1578e52891b9f86e316b4ca3bb`, recovery spike
`0x5625f911df84ec43740b036095559e1a9b83a07a`, and no-custody context peer
`0x072f336b3926559623e2491abec74deb4c5603c6` at blocks `11380443` through
`11380447`. The fresh runner completed the deterministic fixture setup and both
independent encrypted commitments through block `11380463`, then stopped with a
sanitized local `TypeError` while the spike remained `Open`, with two participants,
no aggregate request, and no aggregate public-decrypt permission. No product or
fixture custody transition occurred beyond the two accepted confidential commitments.
The committed resume dry run verifies the corrected runtime and this exact state, so
the next confirmed command must resume only the close, proof, unwrap, recovery, and
refund steps on this fixture. It remains excluded from FND-05C evidence until
terminal completion.

Unwrap-pending checkpoint: The confirmed resume closed the corrected fixture,
requested aggregate disclosure, completed the real context and substituted-value
rejections, and accepted the valid aggregate finalization at block `11380493`. The
replayed aggregate proof reverted at block `11380495`, and early permissionless
unwrap recovery reverted at block `11380496`. The spike is now `UNWRAP_PENDING`; its
funds location is wrapper burn awaiting the public unwrap proof, and the retained
local actor record is required for the final owner refund only. A sanitized
observation `TypeError` stopped the runner before the delayed recovery. The next
runner revision must accept this exact `UNWRAP_PENDING` state and perform only the
remaining proof retrieval, delayed permissionless unwrap finalization, measured
rewrap, and both terminal refunds. It must not repeat setup, aggregate proof, or
early-recovery checks. This is an orchestration correction and does not relax any
G3 acceptance condition.

Unwrap-resume intended commit: `fix: resume delayed unwrap recovery`.

Terminal-evidence verification sub-slice: The corrected fixture is terminal only
after the delayed unwrap receipt, exact measured rewrap, two successful owner
refunds, and their duplicate-refund rejections. Add the read-only
`ops/scripts/verify-evidence.mts` verifier and `npm run verify:evidence -- G3`.
It reads the committed sanitized FND-05A, FND-05B, and FND-05C evidence plus
Ethereum Sepolia only; it must validate artifact shape, commit reachability,
historical runtime hashes and corrected runtime templates/bindings, every recorded
lifecycle receipt status sequence, the terminal `Refundable` states, aggregate ACL
tuples, released-collateral measurement, zero public spike balance, and deletion of
the ignored local secondary-actor record. It has no signer, Nox handle client,
contract write, proof, plaintext, handle, calldata, signature, or key output. Its
outputs are the verifier source, the package command, and the sanitized FND-05C and
combined G3 evidence artifacts. Prerequisites are the already-terminal corrected
fixture and append-only spend records; failure leaves the recorded fixture unchanged
and blocks G3. Checks are `npm run compile`,
`npm run verify:evidence -- G3`, `npm run check:offline`,
`npm run check:sepolia:read`, `npm run scan:secrets`, and `git diff --check`.
The only funds location it observes is terminal confidential pool custody; any
other result is a G3 blocker. Intended commit: `test: verify aggregate recovery
evidence`.

Terminal completion: The corrected recovery fixture reached `Refundable` after the
successful delayed recovery-and-rewrap receipt at block `11380523`, successful
owner refunds at `11380524` and `11380527`, and duplicate-refund rejections at
`11380526` and `11380528`. `npm run verify:evidence -- G3` passed at block
`11380652` without a write. It verified all three terminal FND-05 slices and 47
receipt statuses, including all fourteen FND-05C lifecycle receipts; matching
historical runtime hashes and corrected runtime templates/bindings; two members;
YES/NO-only public aggregate access; aggregate conservation; exact released
collateral; zero public spike balance; terminal confidential pool custody; and
secondary-record deletion. The terminal
artifacts are `evidence/offline/G3/FND-05-RECOVERY.json` and
`evidence/sepolia/G3/FND-05-RECOVERY.json`; the combined G3 artifacts and report
are `evidence/{offline,sepolia}/G3/FND-05.json` and
`evidence/reports/G3-summary.md`. FND-05C and G3 are complete. G4 is the next
eligible work item; no adapter work has started.

Correction intended commit: `fix: remove invalid unwrap request ACL`.
Stale-fixture recovery intended commit: `test: recover stale aggregate fixture`.

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

Commands/checks: `npm run compile`, the three named FND-05 slice dry runs and
confirmed Sepolia commands, `npm run budget:status`,
`npm run check:offline`, `npm run check:sepolia:read`, `npm run scan:secrets`, and
`git diff --check`.

Evidence path: the three slice artifacts, combined
`evidence/offline/G3/FND-05.json`, `evidence/sepolia/G3/FND-05.json`, and
`evidence/reports/G3-summary.md`.

Intended commit: `test: complete aggregate disclosure and recovery evidence`.

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
Lifecycle waits now use bounded direct `eth_getBlockByNumber("latest")` requests
before and after a timestamp-derived wait, independent of client cache or polling.

The ninth fresh attempt from `7fb9f7a` was deliberately stopped after setup at
blocks `11379777` through `11379786`, before any confidential commitment, Nox
request, lifecycle transition, or recovery action. It deployed fixture
`0xf5f5fc79772431696a99a5d6aa1c47804f90a771`, unchanged wrapper
`0x50aa1fa64f3b41b7a89de895f101ff1d8358a755`, and isolated spikes
`0xeb4546c180911f088dff19b0c9471601f0b11d96`,
`0x4440bbcd29f088521bbb9355c1e46156b76b2fdc`, and
`0xc91afc510d8ef06c980e6b115f1914dcf60720b3`. No spike received confidential
collateral. The unused local actor recovery record was deleted; this setup is
excluded from G3 evidence. Its receipts are retained in the spend ledger. The next
implementation replaces the monolithic runner with independently terminal Sepolia
evidence slices.

The first FND-05A execution began from `2a05bbe` and continued while source
documentation was being recorded. It deployed fixture
`0x25084db2acfd1c400e59d65d02310430996bb3e1`, unchanged wrapper
`0x05ec79b891619657e30aad419b8a080c8dca6a15`, and below-k spike
`0xdb9b227c90614ca0a17554bd8fc4ba2e634bf2e7` at blocks `11379845` through
`11379847`. It then minted and wrapped deterministic fixture collateral, finalized
one encrypted commitment, and recorded an expected reverted early close at block
`11379857`. The execution did not retain an active runner through its bounded
deadline wait, so no close or refund was sent.

A read confirms `Open` state, one finalized participant, no aggregate-decrypt
access, and the committed fixture collateral in `PoolConfidentialCustody`. The
fixture is non-terminal and excluded from FND-05A evidence. Its funds location is
known: a dedicated resume command must close below k after the reached deadline and
refund the same owner exactly once before any fresh fixture may be started.

The bounded FND-05A resume from `496f9ea` completed its terminal actions at blocks
`11379884` through `11379888`: it closed below k, confirmed that no aggregate handle
had public-decrypt access, refunded the sole owner, rejected a duplicate refund, and
verified the owner's confidential balance against its deterministic fixture baseline
without recording the value. Runtime/template verification then passed. Sanitized
artifacts are `evidence/offline/G3/FND-05-BELOW-K.json` and
`evidence/sepolia/G3/FND-05-BELOW-K.json`. FND-05A is complete; FND-05B is the only
active slice. G3 remains running until FND-05B and FND-05C complete.

The first FND-05B execution from `9740e9a` deployed fixture
`0xeb9a2aaf8575ae74c3b613e22482dfaa0ddf62ba`, unchanged wrapper
`0x3f6b508f63a015933b62540f661017f8559424c0`, and threshold timeout spike
`0x6af71d5b9427d5f07e6cf5a939ff07a60a6eff45` at blocks `11379937` through
`11379939`. It finalized two independently signed encrypted commitments at blocks
`11379940` through `11379953`, then ended before the deadline without a close,
aggregate request, cancellation, or refund. A read confirms `Open` state, two
participants, confidential pool custody, and no aggregate public-decrypt access.
Its ignored secondary-actor recovery record remains locally only. This non-terminal
fixture is excluded from FND-05B evidence; a resume must close it after the deadline,
prove its disclosure and early-timeout rejection, then complete terminal refunds.

The bounded FND-05B advance command from `8bdd012` completed at blocks `11379975`
through `11379978`: threshold close, exactly YES/NO aggregate public-decrypt access,
and a reverted early cancellation. The spike is now `AGGREGATE_PENDING`; its timeout
has elapsed and the local secondary recovery record is retained. The first recovery
invocation sent no write because the clean-source guard detected these uncommitted
receipts. Commit this checkpoint, then cancel permissionlessly and refund both owners.

The terminal FND-05B recovery completed at blocks `11380016` through `11380018`:
permissionless cancellation and one refund per recorded owner. Local balance checks
passed and the ignored actor record was deleted. A post-terminal Sepolia read matched
the compiled runtime templates and bindings, two participants, `Refundable` state,
and the exact `YES=true`, `NO=true`, `total=false` public-decrypt ACL tuple. The
immutable spend ledger retains the historical `FND-05` label for these recovery
receipts; fixture, source commit, senders, and this checkpoint identify their
FND-05B scope. Sanitized artifacts are
`evidence/offline/G3/FND-05-TIMEOUT.json` and
`evidence/sepolia/G3/FND-05-TIMEOUT.json`. FND-05B is complete; G3 remains
incomplete until FND-05C.

The first FND-05C execution from `62aecd6` deployed fixture
`0x60a87c453107ac0ead37940b727baa58c51949fc`, unchanged wrapper
`0x8290cb8fb05e3873f744eb8c2ce5a5c7395e27a2`, recovery spike
`0xbc1e525dedfa10eefb416ea89e6aef8cd4039878`, and no-custody context peer
`0x9fddf9c438f005ab5eb0122522117fee9d7dbcf4` at blocks `11380070` through
`11380073`. It prepared only deterministic fixture collateral and completed two
independently signing confidential commitments through block `11380086`, but exited
before the close deadline, aggregate request, proof checks, unwrap, recovery, or
refund. A post-exit Sepolia read confirms `Open`, two participants, no aggregate
public-decrypt permission, the expected wrapper binding, and an `Open` zero-member
context peer. This fixture is excluded from FND-05C evidence. Its ignored actor
record is retained only to resume this exact fixture; the next runner revision must
close it after the deadline and complete every remaining proof and recovery
assertion before a new C fixture is allowed.

The first resume invocation from `f1b1026` verified that exact resumable state, but
then incorrectly repeated the generic fixture mint, wrap, and secondary-distribution
setup at blocks `11380114` through `11380119` before the existing-owner commitment
preflight stopped it. No recovery-spike state transition, aggregate request, proof,
unwrap, recovery, or refund occurred; a fresh read still reports the same `Open`,
two-member, non-public aggregate state. The duplicate deterministic test collateral
is confined to the confidential wrapper and raises the owners' local test baselines;
it creates no spike custody, product custody, or external value. The next resume
revision must skip every setup write and reconstruct each terminal baseline from the
observed current confidential balance plus the known recorded stake. The fixture
remains excluded until that exact recovery reaches terminal refunds.

The corrected resume from `5116871` skipped setup and advanced the same spike at
blocks `11380145` through `11380149`: `closeEpoch` and
`requestAggregateDecrypt` succeeded, the exact YES/NO-only public-decrypt ACL was
observed, and real cross-pool and wrong-chain aggregate-context finalizations
reverted. The process stopped before wrong-epoch, substituted-value, valid-proof,
unwrap, recovery, or refund actions. The spike is now `AGGREGATE_PENDING` with the
actor record retained, so the next resume must accept that state and continue only
the uncompleted proof and recovery operations. This remains a non-terminal fixture
and is excluded from FND-05C evidence.

The aggregate-pending resume from `08bae1f` preserved that state, replayed the
three context-negative cases, and obtained real reverted receipts for cross-pool,
wrong-chain, and wrong-epoch contexts at blocks `11380176`, `11380177`, and
`11380179`. It stopped before the substituted aggregate, valid finalization, unwrap,
recovery, and refund steps. The existing receipts satisfy only their named negative
cases; no aggregate-proof or recovery conclusion is recorded until a terminal run.

The sanitized local marker from `9f928f0` identifies the next blocker as an
`EstimateGasExecutionError` while planning the valid context-bound aggregate
finalization. The spike remains `AGGREGATE_PENDING`; no valid finalization,
unwrap, recovery, or refund write was sent. This is an RPC-estimation limitation,
not evidence that the valid Nox proof is rejected. The runner must use a committed
bounded fixed gas limit for that valid Sepolia transaction, subject to the same
single-transaction and cumulative spend checks, rather than treating estimation
failure as a protocol result.

The fixed-gas retry from `6a9b6a6` broadcast the valid finalization but received a
non-out-of-gas revert after 318301 gas. The invalid substituted call also reverts,
so this does not establish a valid-proof outcome. FND-04 obtains public proof
results sequentially, while the C runner requested YES and NO concurrently. The next
isolated correction serializes the two gateway requests and repeats the same
on-chain proof verification; it changes no contract, trust, custody, or privacy
behavior and is not a gate conclusion until the valid receipt succeeds.

## FND-06A work-item record

ID: `FND-06A`

Status: `complete`

Outcome: Evaluate the smallest set of unchanged public conditional-market targets
that could satisfy G4 on Ethereum Sepolia. This discovery slice selects a target
only if it has documented source and license provenance, a live Sepolia address,
an auditable aggregate-execution bound, deterministic resolution and redemption,
and no adapter custody between calls. A target that misses any mandatory dimension
is rejected rather than emulated or replaced with a test double.

Prerequisites: G0 through G3 are passed. No product contract or adapter is created
by this discovery slice. It may inspect public official documentation, source
metadata, verified public contracts, and Ethereum Sepolia state only.

Output files: `ops/scripts/assess-g4-candidates.mts`, the root package command,
`evidence/offline/G4/FND-06-TARGET-DISCOVERY.json`,
`evidence/sepolia/G4/FND-06-TARGET-DISCOVERY.json`,
`evidence/reports/G4-adapter-feasibility.md`, the evidence ledger, source and
assumption register, risk register, and this work-package record.

Checks: `npm run assess:g4:sepolia`, `npm run compile`, `npm run check:offline`,
`npm run check:sepolia:read`, `npm run scan:secrets`, and `git diff --check`.

Privacy impact and funds: the read-only assessment sends no transaction and has no
confidential input, handle, proof, calldata, signature, asset, or local recovery
record. It records public target metadata and code hashes only. No funds move and
no recovery is necessary.

Rollback/failure action: Remove only the assessment source and evidence if it is
incorrect. A missing qualifying target is a G4 feasibility blocker: retain its
public observations, mark P0 blocked, and do not create a mock market, a trusted
resolver, or a production adapter. A later candidate is a new work item with a new
decision record.

Intended commit: `docs: record G4 target feasibility blocker`.

Discovery result: No evaluated candidate satisfied the original external-market G4
definition on Ethereum Sepolia. The official conditional-token deployment set has
no documented Sepolia target. The official v3 exchange deployment index does not
list Sepolia and does not supply binary resolution/redemption. The live Sepolia
optimistic-oracle candidate is public and readable, but its official network
guidance is testnet-only without a DVM; it is not a complete market and cannot prove
disputed deterministic resolution or aggregate execution with price slippage.
The findings remain recorded in the FND-06A evidence artifacts and G4 report. The
user then authorized removal of the non-core external-market requirements. ADR-017
supersedes the original G4 definition; FND-06B is the only active G4 work item.

## FND-06B work-item record

ID: `FND-06B`

Status: `in_progress`

Outcome: Prove that the canonical Ethereum Sepolia Chainlink ETH/USD price-feed
proxy can serve as the unchanged, zero-custody resolution dependency defined by
ADR-017. This replaces the rejected external-market execution path; it does not
replace a failed requirement with a mock, copied target, private resolver, or
caller-supplied result.

Prerequisites: G0 through G3 are passed. ADR-017 is accepted with this feasibility
gate. The investigation may read public official documentation, source metadata,
verified public contracts, and Ethereum Sepolia state only until a separate guarded
Sepolia write plan is reviewed.

Output files: `ops/scripts/assess-g4-resolution-target.mts`, the root package
command, `modules/protocol/contracts/feasibility/PriceFeedResolutionSpike.sol`,
`modules/protocol/scripts/feasibility/run-g4-resolution-sepolia.mts`,
`evidence/offline/G4/FND-06-RESOLUTION.json`,
`evidence/sepolia/G4/FND-06-RESOLUTION.json`,
`evidence/reports/G4-resolution-feasibility.md`, the evidence ledger, source and
assumption register, risk register, decision log, and this work-package record.

Acceptance criteria: The assessment identifies documented source and license
provenance, a live Sepolia proxy address, ABI compatibility, positive answer,
complete round, expected decimals/pair metadata, update time, and runtime hash. The
isolated Sepolia spike binds the target immutably, evaluates both result sides from
one real feed response, rejects a zero age bound against that same observed round,
and exposes no asset-receiving, confidential-handle, result-writing, owner, or
upgrade entry point. It sends no collateral to the target. The evidence records only
public target metadata, receipts, runtime hashes, and sanitized test conclusions.

Negative cases: Zero target, zero/negative answer, incomplete round, stale answer,
settlement before the observation time, wrong target runtime, and a caller-provided
result must fail without pool or target fund movement. A missing qualifying target
or a target that needs a trusted result writer blocks G4.

Privacy/custody impact: The target response and threshold are public. No confidential
input, handle, proof, owner position, asset amount, signature, key, RPC credential,
or local private record may be logged or committed. The target and spike receive no
collateral; all product collateral remains in confidential pool custody. A live
spike write spends only the committed Sepolia gas allowance and has no asset-recovery
operation.

Funds location/recovery impact: Before the future product's valid resolution call,
all collateral remains in the confidential pool. A feed that remains invalid after
the immutable grace deadline must lead to a permissionless confidential refund; this
is re-proven in P1/G5. The FND-06B spike has no asset balance, so failed or stale
calls need no recovery beyond retaining the sanitized receipt.

Checks: `npm run assess:g4:resolution:sepolia`, `npm run test:g4:resolution:sepolia`,
`npm run compile`, `npm run check:offline`, `npm run check:sepolia:read`,
`npm run scan:secrets`, and `git diff --check`.

Evidence path: `evidence/offline/G4/FND-06-RESOLUTION.json`,
`evidence/sepolia/G4/FND-06-RESOLUTION.json`, and
`evidence/reports/G4-resolution-feasibility.md`.

Commit sequence: `test: add public resolution spike`, then
`test: prove public resolution adapter boundary` after committed Sepolia evidence.

Rollback/failure action: Revert only the FND-06B source and documentation commit if
the target assessment is incorrect; preserve an accurate sanitized failure report.
Do not create a mock feed, fork the target, add a result writer, accept a stale
answer, or begin P1. A failing FND-06B returns P0 and G4 to `blocked`.

Partial-run history: At block `11380820`, the first `yes` spike deployment at
`0xa1aecba2ac034f44ba6165743bb2248f586fdb0b` succeeded with no collateral and an
append-only gas-ledger entry. The initial runner then rejected its runtime because
the direct byte-for-byte comparison did not account for Solidity immutable values
embedded in deployed code. This is runner-validation failure, not a target or
resolution result. The spike is not G4 evidence. The corrected runner compares the
compiler-declared immutable-bytecode template and uses explicitly sequenced nonces;
the next run must use fresh terminal evidence and retain this public partial record.

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

## FND-06 — Resolution-adapter selection

Selection scorecard:

| Dimension                                          | Weight | Minimum |
| -------------------------------------------------- | -----: | ------- |
| Unchanged open-source protocol and license clarity |     20 | Pass    |
| Sepolia deployability/availability                 |     15 | Pass    |
| Immutable objective condition/freshness            |     20 | Pass    |
| Caller-independent binary normalization            |     15 | Pass    |
| Target and adapter zero-custody boundary           |     15 | Pass    |
| Verifiable runtime bytecode/provenance             |     10 | Pass    |
| Demo/read-model clarity                            |      5 | ≥3/5    |

Document all candidates evaluated, but implement only the selected resolution
adapter. A target that misses any minimum is rejected even if its aggregate score is
highest.

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
- [x] G3 passed: aggregate-only disclosure and proof/recovery semantics pass.
- [ ] G4 passed: one unchanged public protocol and zero-custody resolution-adapter boundary are selected.
- [ ] Evidence ledger contains validated, sanitized records for G0–G4.
- [ ] All P0 findings, risks, and architecture consequences are documented.
- [ ] User explicitly approves transition to P1.

## Exit decision

`PASS`: mark P0 complete and begin P1.

`REDESIGN`: update architecture/ADR, reset affected gates to `not_run`, and repeat.

`STOP`: mark P0 blocked; do not hide the failure with mocks or trusted services.
