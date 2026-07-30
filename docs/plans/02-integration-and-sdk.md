# P2 — Integration, SDK, automation, and live protocol

Status: `in_progress`

Pre-G5 preparation exception: While P1 is explicitly `awaiting_chain`, one
dependency-independent pure TypeScript SDK slice may be `in_progress`. It cannot
send a transaction, bind an address as a deployment, accept confidential input, or
claim G6/P2 completion. The phase remains `not_started` until G5 passes.

## Objective

Turn the G5 protocol into a typed, automatable, independently verifiable Sepolia
lifecycle without introducing plaintext or privileged service authority.

## Prerequisites

- P1 is complete and G5 is passed.
- Contract ABI/events and manifest schema are frozen for the P2 release candidate.
- The selected resolution adapter passed G4 and its live target facts are rechecked.

## Work-item register

| ID      | Outcome                       | Primary artifacts                                     | Required checks                                                        | Intended commit                                   |
| ------- | ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| INT-01  | Production resolution adapter | Selected adapter, target config, integration tests    | Runtime hash, freshness, resolution, zero custody, residual collateral | `feat: integrate selected public resolution feed` |
| SDK-01  | Safe public types             | Branded types, schemas, decimal parser, domain config | Compile-time misuse tests, boundary vectors                            | `feat: add typed protocol sdk`                    |
| SDK-02  | Confidential client           | Encrypt/import preparation, owner decrypt, ACL reads  | Context binding, no plaintext serialization, live smoke                | `feat: add nox signal client`                     |
| SDK-03  | Transaction/read client       | Prepare/send/replacement/retry, public reads          | ABI compatibility, idempotency, chain/account changes                  | `feat: add protocol transaction client`           |
| VER-01  | Public verifier CLI           | RPC reader, I1–I10 observable checks, report          | Mutated manifest/event/receipt rejection                               | `feat: add public verification cli`               |
| AUT-01  | Permissionless relayer        | dry-run/once/poll/health, policy, bounded budget      | race, duplicate, stale request, RPC failure                            | `feat: add permissionless lifecycle relayer`      |
| IDX-01  | Rebuildable read model        | event reducer, checkpoint, reorg, rebuild             | deterministic replay, checkpoint reset, no private schema              | `feat: add chain derived read model`              |
| DEP-01  | Deterministic Sepolia deploy  | deploy plan/write scripts, manifest generation        | chain guard, cost plan, source/runtime verification                    | `build: add guarded sepolia deployment`           |
| LIVE-01 | Success lifecycle             | Multi-user live lifecycle and evidence                | signal → aggregate → resolve → settle → score/claim                    | `test: prove live sepolia lifecycle`              |
| LIVE-02 | Failure/recovery lifecycle    | Named live negative cases and evidence                | below-k, unauthorized, replay, timeout/recovery, stale feed            | `test: prove live failure recovery paths`         |

## SDK-01 pre-G5 work-item record

ID: `SDK-01`

Status: `complete`

Outcome: Create the framework-independent public SDK type boundary: branded public
identifiers and exact decimal/base-unit parsing that rejects unsafe JavaScript
numbers and all confidential-value-shaped fields.

Files/modules allowed: `modules/confidential-client/package.json`,
`modules/confidential-client/src/{public,index}.ts`,
`modules/confidential-client/test/public.test.ts`, root workspace scripts/lockfile,
this record, and the traceability matrix.

Acceptance criteria: Addresses, pool IDs, request IDs, transaction hashes, and
decimal values use explicit brands; public decimal parsing is exact and rejects
scientific notation, unsafe precision, negative values, malformed decimals, and
values exceeding declared decimals. No public SDK type contains `stake`,
`probability`, `position`, `payout`, `refund`, `score`, `handle`, or `proof` fields.

Privacy/custody impact: This slice has no RPC, wallet, Nox, encryption, secret, or
confidential-input dependency. It provides validation only and cannot move funds.

Funds location/recovery impact: No funds or chain state exist in this slice. A parse
failure is local, deterministic, and retryable with corrected public input.

Checks: public SDK unit tests, `npm run typecheck`, `npm run check:offline`, and
`git diff --check`.

Evidence path: `modules/confidential-client/test/public.test.ts` output. This is
offline SDK preparation evidence only and cannot advance G5 or G6.

Intended commit: `feat: add typed protocol sdk`.

Rollback/failure action: Revert the isolated SDK package and retain P2 as
`not_started`; do not replace type validation with permissive `string`/`number`
values or serialize confidential input locally.

Completion evidence: source commit `a4fe65d` added the public-only workspace with
four passing `T-SDK-01-*` cases for identifier shape, exact decimal/base-unit
conversion, malformed/unsafe value rejection, and prohibited confidential-shaped
field/dependency absence. `npm run check:offline` passed. This remains pre-G5
preparation; it makes no live-protocol or G6 claim.

## SDK-02 work-item record

ID: `SDK-02`

Status: `complete`

Outcome: Provide a Sepolia-only Nox encryption boundary that binds each encrypted
uint256 input to its chain, pool, and caller-generated request nonce, serializes
same-client encryption safely, and prevents raw encrypted material from entering
ordinary serialization paths.

Output files: `modules/confidential-client/src/confidential.ts`, public exports,
the Sepolia smoke runner/package script, unit tests, this record, and the
traceability matrix where behavior changes.

Acceptance criteria: The production constructor refuses a non-Sepolia wallet. Every
input validates uint256 range and a canonical public context before Nox encryption.
The returned sealed value does not expose raw encrypted fields or serialize; contract
encoding requires an exact context match. Sequential use of one Nox client is
enforced even when callers initiate concurrent requests.

Privacy/custody impact: Plaintext exists only in the caller process long enough for
local Nox input encryption. No plaintext, raw handle, proof, wallet credential, or
signature is logged, stored, returned in JSON, or sent to a service other than the
configured Nox protocol path. This SDK has no token or custody authority.

Funds location/recovery impact: The slice performs no contract write. A rejected
input or failed encryption does not move funds; the caller may retry with the same
public context and a new request nonce.

Checks: SDK unit tests, `npm run typecheck`, `npm run check:offline`,
`npm run test:sdk:nox:sepolia -- --pool=<named-pool>`, and `git diff --check`.
This named Sepolia smoke is SDK-02 evidence only; it is not a G6 claim.

Evidence path: SDK unit test output for this boundary slice; later live evidence is
recorded under `evidence/{offline,sepolia}/G6/SDK-02-CLIENT.json`.

Intended commit: `feat: add nox confidential input client`.

Rollback/failure action: Revert only the SDK boundary and leave SDK-02 incomplete.
Do not replace context binding or serialization rejection with permissive strings,
browser storage, telemetry, a trusted service, or a plaintext shadow record.

Completion evidence: `a50feb6` added the named smoke runner. It passed against the
short-fixture claim pool on Ethereum Sepolia and wrote
`evidence/{offline,sepolia}/G6/SDK-02-CLIENT.json`. The runner checked the connected
Sepolia chain and named pool runtime, performed a real Nox uint256 input encryption
bound to the pool/request context, required explicit matching context for contract
encoding, and confirmed JSON serialization rejection. It persisted no value, raw
handle, proof, credential, or signature. SDK-02 is complete; the artifact is only a
G6 component and does not claim the gate.

## SDK-03 work-item record

ID: `SDK-03`

Status: `complete`

Outcome: Add a typed Sepolia public-read and transaction boundary that consumes
sealed SDK-02 inputs without exposing encrypted material, encodes the frozen pool
ABI, and maps retries to one logical request.

Output files: transaction/read client source, frozen ABI declaration, exports,
unit and ABI-compatibility tests, the bounded Sepolia fixture runner, this record,
and traceability updates.

Acceptance criteria: Public reads return only public pool epoch/config facts. A
prepared encrypted commit remains non-serializable and requires matching pool/chain/
request context. The sender accepts at most one identical logical operation and
rejects a request ID reused for different pool or calldata. The ABI declaration is
checked against the compiled protocol artifact; no client error reflects encrypted
material.

Privacy/custody impact: The client may submit a user-signed transaction through the
connected wallet, but it has no relayer key, custody, decryption, telemetry, storage,
or privileged contract path. Raw encrypted material remains in memory only until
wallet submission.

Funds location/recovery impact: Prepared data creates no chain state. A submitted
logical operation retains its request-to-transaction mapping in process so a caller
retry cannot silently issue a second commit. A reload requires an on-chain public
state read before retry, which is implemented by later LIVE evidence.

Checks: unit/ABI compatibility tests, `npm run typecheck`, `npm run check:offline`,
`npm run test:sdk-transaction:sepolia`, and `git diff --check`. The named fixture
uses no collateral transfer: it submits one encrypted commit intent and then reaches
the existing permissionless pending-commit expiry path before evidence is recorded.
This is SDK-03 evidence only, not a G6 claim.

Evidence path: unit output for this slice; later live evidence under
`evidence/{offline,sepolia}/G6/SDK-03-TRANSACTION-CLIENT.json`.

Intended commit: `feat: add protocol transaction client`.

Rollback/failure action: Revert only SDK-03 and retain SDK-02's sealed boundary. Do
not fall back to manual calldata, durable encrypted-material storage, automatic
replacement transactions, or a service-held signer.

Completion evidence: The dedicated Sepolia fixture deployed adapter
`0x3f9f6be890629ec9b0794d618c032b488726aadf`, factory
`0xfbb68704479ae4aada685a409f4a3c2fe38506be`, and pool
`0x390E27a689bA7c3fC2aa003984b8A923B43A79C1`. The SDK submitted one real encrypted
`commitSignal` transaction at block `11382992`. Its callback was intentionally absent,
and the permissionless expiry emitted `SignalIntentCleared` at block `11383000`,
returning the pool to `OPEN` with no pending owner or participant. The independent
read verifier passed and emitted `evidence/{offline,sepolia}/G6/SDK-03-TRANSACTION-CLIENT.json`.
An interrupted runner invocation produced a second, reverted expiry receipt in the
same block after the successful expiry; both receipts remain in the append-only
ledger, while the verifier requires the successful event and terminal public state.
SDK-03 is complete and remains a G6 component only.

## DEP-01 work-item record

ID: `DEP-01`

Status: `complete`

Outcome: Produce a deterministic, guarded Ethereum Sepolia deployment plan and
canonical public manifest for the MVP's confidential collateral, immutable public
adapter, permissionless factory, and one bound pool.

Active slice: none; `VER-01` is complete and the next P2 item must be selected
before implementation.

Output files: deployment plan/write/verify scripts, generated canonical manifest and
consumer bindings, deployment tests, this record, evidence ledger entries, and
runbook updates.

Acceptance criteria: A read-only plan validates chain, selected feed runtime/facts,
compiled artifacts, constructor/configuration inputs, deterministic deployment order,
estimated gas, and the committed spend budget before any write. Writes require the
explicit Sepolia confirmation and a clean tree. The generated manifest records
source/compiler/runtime hashes, constructor inputs, deployment receipts, and public
pool state; consumers import it rather than copying addresses. A read-only verifier
must reject altered runtime, receipt, binding, or public epoch values.

Privacy/custody impact: Deployment has no owner decrypt, no input plaintext, and no
relayer authority. The wrapper/pool own confidential collateral only after a later
owner transaction; the deployer cannot move user assets through the manifest tool.

Funds location/recovery impact: Deployment transactions retain only native gas at
the signer. A pool is created empty; failed deployment stages have no user
collateral. A failed post-deployment validation leaves the manifest unpublished and
the named contracts visible for independent inspection, never silently substituted.

Checks: manifest/unit mutations, artifact/runtime checks, `npm run typecheck`,
`npm run check:offline`, read-only `deploy:sepolia:plan`, guarded Sepolia stages,
independent manifest verification, and `git diff --check`.

Evidence path: `deployments/sepolia/quiet-signal.json` and
`evidence/{offline,sepolia}/G6/DEP-01-DEPLOYMENT.json`.

Intended commit: `build: add guarded sepolia deployment`.

Rollback/failure action: Do not publish a manifest or generated bindings. Record
public receipts and the failed validation reason, then deploy a new explicitly named
configuration only after correcting the cause; never rewrite a canonical manifest or
point consumers at an unverified address.

### DEP-01-PLAN-01 work-item record

Status: `in_progress`

Outcome: Add a chain-read-only canonical Sepolia deployment planner before a
deployment sender exists.

Output files: `modules/protocol/src/deployment-plan.ts`,
`modules/protocol/scripts/deploy/plan-sepolia.mts`,
`modules/protocol/test/unit/deployment-plan.test.ts`, workspace commands, and this
record.

Acceptance criteria: The planner derives the four sequential CREATE addresses and
the factory CREATE2 pool address from a verified deployer nonce, uses one immutable
ETH/USD Chainlink adapter configuration, validates feed runtime/round facts and
compiled artifact shape, estimates every immediately executable CREATE, applies a
declared maximum bound to the not-yet-deployable pool creation, and rejects a plan
that exceeds the remaining committed Sepolia gas budget. It only performs RPC reads
and estimations; it creates no wallet client and submits no transaction.

Canonical public market decision: the MVP resolves the immutable condition
`ETH/USD >= $2,000.00` using Chainlink Sepolia feed
`0x694AA1769357215DE4FAC081bf1f309aDC325306` (8 decimals). The commit window is
25 minutes and the observation is fixed 35 minutes after planning, leaving a
10-minute post-close observation lead. This is a product-market configuration, not
a change to custody, privacy, state transitions, or the adapter interface.

Privacy/custody impact: Inputs and output are public deployment metadata only. The
planner derives a public deployer address from local configuration but never emits a
key, signature, confidential input, raw Nox material, or token approval. It cannot
move native or confidential assets.

Funds location/recovery impact: The only network operations are `eth_call`, code,
block, nonce, fee, and gas-estimate reads. A rejected plan has no on-chain effect;
the operator corrects the public configuration or budget before a separate guarded
write slice is considered.

Checks: `npm run typecheck`, `npm run test:deployment-plan`,
`npm run deploy:sepolia:plan`, broader `npm run check:offline`, and `git diff --check`.

Evidence location: the command's sanitized plan output is reviewed before write;
the later committed deployment evidence remains
`evidence/{offline,sepolia}/G6/DEP-01-DEPLOYMENT.json`. This planning slice makes no
DEP-01 or G6 completion claim.

Intended commit: `build: add canonical deployment plan`.

Rollback/failure action: Revert only the planner slice. Do not manually copy its
predicted addresses into any consumer, deploy from its stdout, or replace the
factory CREATE2 derivation with an opaque address.

Completion evidence: source commit `bb84f8c` added the deterministic address/config
builder, planner command, and three `T-DEP-01-PLAN-*` tests. `npm run check:offline`
and the read-only `npm run deploy:sepolia:plan` passed. The latter verified the
selected feed's runtime/round facts, artifact hashes, live nonce, gas estimates, and
the remaining gas budget without submitting a transaction. This completes the
planner slice only; DEP-01 and G6 remain incomplete.

### DEP-01-COLLATERAL-01 work-item record

Status: `in_progress`

Outcome: Replace the P0 harness-branded collateral deployment input with a product
named ERC-7984 wrapper that preserves the exact audited Nox/OpenZeppelin wrapper
behavior and has no extra authority.

Output files: `modules/protocol/contracts/core/QuietSignalConfidentialCollateral.sol`,
the deployment planner artifact binding, decision log, this record, and compiled
interface checks.

Acceptance criteria: The new constructor only sets product metadata and delegates to
the unchanged `ERC20ToERC7984Wrapper` base. It adds no owner, upgrade, mint,
withdraw, resolver, or backend authority; its ABI exposes the ERC-7984 surface the
factory already validates. The planner selects this artifact exclusively for the
canonical deployment, while P0/P1 evidence continues to retain its historical
harness artifacts.

Privacy/custody impact: The collateral token still keeps balances confidential and
the pool receives collateral only through the standard ERC-7984 callback. No
plaintext, privileged viewer, or new transfer path is introduced.

Funds location/recovery impact: This slice submits no transaction. A canonical pool
will remain empty after deployment; later wrapping and transfer recovery semantics
are unchanged from the verified ERC-7984 path.

Checks: contract compile, ABI/interface checks, canonical plan unit/read checks,
`npm run check:offline`, and `git diff --check`.

Evidence location: compiled artifact and planner output only. The later deployment
manifest will contain the exact product-wrapper runtime hash and source reference.

Intended commit: `feat: add canonical confidential collateral wrapper`.

Rollback/failure action: Revert only the product wrapper/planner binding. Never
rename or rewrite historical feasibility evidence, and never substitute a custom
confidential balance implementation for the audited standard wrapper.

Completion evidence: source commit `39ce293` added
`QuietSignalConfidentialCollateral`, rebinding the canonical planner to its compiled
artifact. Contract compilation, public interface checks, planner unit tests, and the
read-only Sepolia plan passed. ADR-020 records why this changes only deployment
identity/metadata rather than confidential custody or ACL behavior. This completes
the collateral identity slice only; no canonical contract was deployed.

### DEP-01-WRITE-01 work-item record

Status: `in_progress`

Outcome: Add the separately guarded canonical Sepolia sender and manifest producer.

Output files: `modules/protocol/scripts/deploy/write-sepolia.mts`, workspace command,
deployment-plan constants, this record, and the later generated public manifest and
spend-ledger entries.

Acceptance criteria: The sender refuses an unclean tree, a non-Sepolia RPC, absent
explicit confirmation, an existing canonical manifest, prior code at a predicted
address, a stale deadline, an over-budget cost, a mismatched deterministic CREATE
address, failed receipt, bad factory CREATE2 binding, or non-empty initial epoch.
It pins the pending nonce before the first transaction, rechecks live gas/budget
before every write, and emits the canonical manifest with observed runtime hashes
only after all five writes and readbacks pass.

Privacy/custody impact: The only signer is the locally configured deployment wallet;
the script has no user signal, decrypted balance, owner position, Nox handle, proof,
or token-transfer command. It deploys an empty pool and cannot assign a privileged
contract role because the contracts expose none.

Funds location/recovery impact: Native gas is the sole asset spent. Until a manifest
is written the deployment is unpublished; any stage failure stops immediately and
leaves public receipts/spend entries for inspection. It never overwrites the
canonical manifest or retries a consumed nonce automatically.

Checks: typecheck, planner tests/read plan, source/static sender review, full offline
check, `git diff --check`, then one explicitly confirmed Sepolia execution followed
by independent manifest verification.

Evidence location: `deployments/sepolia/quiet-signal.json`,
`evidence/sepolia/spend-ledger.json`, and later
`evidence/{offline,sepolia}/G6/DEP-01-DEPLOYMENT.json`.

Intended commit: `build: add guarded canonical deployment writer`.

Rollback/failure action: Revert the unexecuted sender source. After any submitted
transaction, retain the append-only ledger and public receipts, do not overwrite a
manifest, and create a new explicit deployment plan only after reviewing the failed
stage.

Completion evidence: source commit `e2161d8` added the guarded sender. Its first
confirmed canonical execution deployed the fixture, product collateral wrapper,
adapter, factory, and CREATE2 pool at Sepolia blocks `11383118` through `11383123`.
The sender wrote five successful receipt entries to the append-only spend ledger and
created the canonical manifest only after runtime, factory/pool binding, immutable
configuration, and initial empty `OPEN` epoch checks passed. This deployment is
pending the separate independent verifier/evidence slice before DEP-01 is complete.

### DEP-01-VERIFY-01 work-item record

Status: `in_progress`

Outcome: Make the independent manifest verifier distinguish a deployment baseline
from a live pool, then verify the canonical deployment without freezing future epoch
transitions.

Output files: manifest parser/verifier source and mutation tests, canonical manifest,
sanitized DEP-01 evidence, evidence ledger entry, this record, and deployment
runbook updates.

Acceptance criteria: A manifest containing a public deployment block reads the
initial epoch at that exact Sepolia block while runtime, receipts, and immutable
bindings are verified from live chain data. A normal live-evidence manifest retains
current-state epoch verification. The verifier rejects malformed deployment block,
wrong initial epoch, altered runtime/configuration/receipt, or forbidden fields.

Privacy/custody impact: All new fields are public block/address/hash facts. The
verifier has read-only RPC access and cannot obtain or process confidential values.

Funds location/recovery impact: This slice sends no transaction. A failed verifier
does not alter the freshly deployed empty pool; it leaves the manifest unpublished
in Git until the public discrepancy is resolved.

Checks: verifier mutation tests, `npm run check:offline`, canonical Sepolia verifier
run with a generated report, evidence validator, and `git diff --check`.

Evidence location: `deployments/sepolia/quiet-signal.json` and
`evidence/{offline,sepolia}/G6/DEP-01-DEPLOYMENT.json`.

Intended commit: `test: verify canonical deployment manifest`.

Rollback/failure action: Revert only the verifier compatibility change before
publishing evidence. Never alter the deployment receipts, runtime hashes, or
immutable canonical configuration to force a passing report.

Completion evidence: source commit `6e6ae47` adds historical deployment-block epoch
verification with two `T-VERIFIER-DEP-01-*` mutation cases. The canonical manifest
at `deployments/sepolia/quiet-signal.json` records five successful DEP-01 receipts
from blocks `11383118`–`11383123`: fixture
`0x691737deF57e67805D534374Fa814FeFa37e15F0`, product wrapper
`0x4573692a780edb31A18455f7Bff160af8159128d`, adapter
`0x646d694B3eec38F10Cda8Ff55f08f76D2f596E84`, factory
`0x1c421A76C1E28A21Fa6ae969B0273d3C4BD1f858`, and canonical pool
`0xe73B691b490baaDa2FfC8da9Ee9c799B35770149`. The independent verifier passed at
block `11383137`, re-reading all five runtimes, immutable pool bindings, five
successful receipts, and the empty initial epoch specifically at block `11383123`.
The sanitized report is `evidence/sepolia/G6/DEP-01-DEPLOYMENT.json`. DEP-01 is
complete as a G6 component; G6 remains `not_run` until every required P2 live item
passes.

## VER-01 work-item record

ID: `VER-01`

Status: `in_progress`

Outcome: Turn the existing manifest checker into a public, read-only release
verifier for the canonical factory, pool, collateral, adapter, and feed boundary.

### VER-01-PLAN-01

Status: `in_progress`

Output files: this work-item record, verifier acceptance/test matrix additions, and
the following implementation-slice design before verifier code changes.

Acceptance criteria: The released verifier must independently validate the Sepolia
chain, manifest schema and sanitization, all observed runtime hashes, every recorded
receipt, factory pool-id/address binding, pool immutable config, ERC-7984 interface
support, adapter target/runtime/configuration, target feed round shape, zero native
adapter custody, and a manifest-declared public epoch snapshot. It must distinguish
immutable baseline checks from state-specific lifecycle evidence and fail closed on
wrong chain, hash, binding, target, state, or receipt. It can claim only observables;
confidential conservation, private ACL, payout, and score conclusions remain bound
to named Sepolia lifecycle evidence rather than guessed from public data.

Privacy/custody impact: The verifier takes a public manifest and public RPC only. It
has no signer, Nox client, decryption request, event-calldata storage, or schema that
can accept confidential amounts, owner positions, handles, or proofs.

Funds location/recovery impact: Read-only calls cannot affect any deployment or
live pool. A failed verification signals a public release/evidence mismatch; direct
on-chain recovery remains available without a verifier service.

Checks: pure parser/mutation tests, static public-schema scan, `npm run check:offline`,
canonical read-only Sepolia verifier run, and `git diff --check`.

Evidence location: `evidence/{offline,sepolia}/G6/VER-01-PUBLIC-VERIFIER.json` and
the relevant manifest/lifecycle reports.

Intended commit: `feat: add public release verifier`.

Rollback/failure action: Revert the verifier slice only; retain the already verified
DEP-01 baseline. Do not add a trusted backend, relax schema sanitization, or report
non-observable confidential facts as verifier output.

Completion evidence: source commit `9ca7114` adds canonical manifest parsing and
the public release verifier. Its nine offline verifier tests include factory,
collateral, and stale-feed mutations. The read-only canonical command passed at
block `11383180` and wrote
`evidence/sepolia/G6/VER-01-PUBLIC-VERIFIER.json`: runtime/receipt/pool baseline
checks plus factory pool binding, ERC-7984 support, immutable adapter configuration,
feed runtime/round validity, and zero native adapter custody. VER-01 is complete as
a G6 component; G6 remains `not_run` until automation, indexer, and live cases pass.

## Dependency graph

```text
INT-01 ───────────────┐
SDK-01 → SDK-02 → SDK-03 ─┬→ DEP-01 → LIVE-01 → LIVE-02 → G6
VER-01 ───────────────────┤
AUT-01 ───────────────────┤
IDX-01 ───────────────────┘
```

AUT-01 and IDX-01 may start after ABI freeze but cannot be used as evidence for
contract correctness. Deployment begins only after offline checks and required P1
Sepolia suites pass.

## SDK contract

- [ ] Inputs use decimal strings and bigint; JavaScript `number` is forbidden for value fields.
- [ ] Handles, proofs, addresses, request IDs, and transaction hashes use branded types.
- [ ] Every encrypted input binds chain id, pool, and client request nonce.
- [ ] No SDK error, telemetry, or serialization path includes plaintext signal values.
- [ ] Replacement transactions map to one logical operation; retries are idempotent.
- [ ] Public and private response types are separate and cannot be accidentally interchanged.
- [ ] Owner decrypt requires connected-account match and displays the trust boundary.

## Relayer contract

- Stateless with respect to correctness; optional checkpoint/cache is rebuildable.
- Supports `dry-run`, `once`, `poll`, and `health` modes.
- Uses per-loop and per-pool action budgets, exponential backoff, and finality depth.
- Re-reads state immediately before write; handles replacement/race as expected outcomes.
- Rejects schemas containing stake, probability, position, payout, score, handle, or proof logs.
- Never holds a user key, owner viewer right, confidential token, or exclusive keeper role.

## Indexer contract

- Consumes public events only and stores no owner-decrypted data.
- Reducer output is deterministic for the same finalized event sequence.
- Checkpoint includes chain id, block number/hash, manifest hash, and reducer version.
- Reorg handling rewinds to a safe checkpoint; full rebuild is a supported command.
- Application correctness and recovery remain available through direct RPC if indexer is absent.

## Sepolia deployment contract

- `deploy:sepolia:plan` is read-only and prints deterministic inputs, predicted/new
  addresses where possible, target hashes, estimated writes, and cost.
- Write requires chain `11155111`, explicit confirmation, ignored throwaway wallet
  configuration, and a maximum-cost guard.
- Manifest records compiler/settings, constructor args, source commit, ABI/runtime
  hashes, target facts, deployment txs, and verification status.
- Generated bindings for all consumers derive from this manifest; handwritten address
  copies fail CI.

## Live case register

| Case ID          | Required result                                                                                                 | Evidence                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| LIVE-SUCCESS-01  | At least k distinct wallets commit; aggregate finalizes; fresh feed outcome settles; owner score/claim succeeds | G6 lifecycle JSON/report  |
| LIVE-K-01        | Below-k closes to refund and no aggregate public-decrypt permission exists                                      | G6 failure JSON/report    |
| LIVE-ACL-01      | Unrelated wallet cannot view/compute owner position or score                                                    | G6 ACL report             |
| LIVE-REPLAY-01   | Reused/wrong-context request fails without state/fund movement                                                  | G6 receipt/report         |
| LIVE-RECOVERY-01 | Resolution grace expiry reaches confidential refund without target custody                                      | G6 recovery report        |
| LIVE-FEED-01     | Stale or invalid feed rejection preserves state and confidential funds                                          | G6 receipt/balance report |
| LIVE-VERIFY-01   | Independent CLI validates manifest and observable invariants                                                    | G6 verifier report        |

## Verification

- Strict typecheck plus offline unit, encoding-vector, ABI, reducer, and relayer race tests.
- Secret/plaintext structured-log scan across all package tests.
- Clean Sepolia deployment from documented public configuration.
- All LIVE cases pass without fixture substitution or chain-state editing.
- Evidence validator resolves references and rejects sanitized-schema violations.

## Exit checklist

- [ ] INT/SDK/VER/AUT/IDX/DEP items are independently committed.
- [ ] LIVE-01 and LIVE-02 evidence is validated and committed safely.
- [ ] G6 is passed; deployment manifest and generated bindings are synchronized.
- [ ] Third party can reproduce deploy/read/verify instructions from a clean environment.
- [ ] Relayer/indexer outage does not block direct correctness or owner recovery.
- [ ] Worktree is clean and the web package has stable SDK/read-model contracts.

## Stop conditions

Stop for any Sepolia ACL/custody failure, any required plaintext service path, any
unverifiable target bytecode, or any lifecycle that needs manual chain edits.
