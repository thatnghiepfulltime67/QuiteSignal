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

Status: `in_progress`

Outcome: Add a typed Sepolia public-read and transaction boundary that consumes
sealed SDK-02 inputs without exposing encrypted material, encodes the frozen pool
ABI, and maps retries to one logical request.

Active slice: `SDK-03-CLIENT-01`.

Output files: transaction/read client source, frozen ABI declaration, exports,
unit and ABI-compatibility tests, this record, and traceability updates.

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
and `git diff --check`. A later live Sepolia sender/read case must prove this client
before any G6 claim.

Evidence path: unit output for this slice; later live evidence under
`evidence/{offline,sepolia}/G6/SDK-03-TRANSACTION-CLIENT.json`.

Intended commit: `feat: add protocol transaction client`.

Rollback/failure action: Revert only SDK-03 and retain SDK-02's sealed boundary. Do
not fall back to manual calldata, durable encrypted-material storage, automatic
replacement transactions, or a service-held signer.

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
