# P2 — Integration, SDK, automation, and live protocol

Status: `complete`

## Objective

Turn the passed G5 protocol into a typed, automatable, independently verifiable
Sepolia lifecycle without plaintext handling or privileged service authority.

## Prerequisites

- P1 is complete and G5 is passed.
- Contract ABI, events, manifest schema, and resolution bindings are frozen.
- Every Sepolia write is named, budgeted, and recorded before the next write.

## Completed work-item register

| ID      | Delivered outcome                                            | Primary evidence/checks                                            | Intended commit                                   |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| INT-01  | Production public-resolution adapter integration             | runtime, freshness, threshold, and zero-custody checks             | `feat: integrate selected public resolution feed` |
| SDK-01  | Branded public types, exact decimal parsing, and schemas     | compile-time misuse and boundary vectors                           | `feat: add typed protocol sdk`                    |
| SDK-02  | Context-bound confidential input and owner decrypt client    | serialization exclusion and real Nox smoke                         | `feat: add nox signal client`                     |
| SDK-03  | Transaction preparation, replacement/retry, and public reads | ABI, idempotency, chain/account, and expiry checks                 | `feat: add protocol transaction client`           |
| VER-01  | Read-only public verifier CLI                                | manifest, runtime, receipt, state, and mutation checks             | `feat: add public verification cli`               |
| AUT-01  | Permissionless lifecycle automation                          | policy, race, duplicate, selector, and bounded-action checks       | `feat: add permissionless lifecycle relayer`      |
| IDX-01  | Rebuildable public event read model                          | replay, finalized checkpoint, reset, and schema checks             | `feat: add chain derived read model`              |
| DEP-01  | Guarded canonical Sepolia deployment                         | budget, address, runtime, immutable binding, and manifest checks   | `build: add guarded sepolia deployment`           |
| LIVE-01 | Fresh two-owner success lifecycle                            | forecast, aggregate, resolution, settlement, and terminal evidence | `test: prove live sepolia lifecycle`              |
| LIVE-02 | Below-k and timeout recovery lifecycles                      | terminal state, refund, replay, and read-verifier evidence         | `test: prove live failure recovery paths`         |

## Acceptance and negative coverage

- SDK types prevent unsafe numeric, address, handle, proof, and public/private mixing.
- Confidential input is encrypted locally and cannot enter relayer/indexer schemas.
- The relayer has no exclusive authority and submits only currently eligible public
  lifecycle actions.
- The indexer derives public state only and rebuilds from finalized chain events.
- Canonical deployment outputs are manifest-bound and independently verified.
- Live Sepolia evidence covers both the two-owner success lifecycle and the below-k
  and timeout owner-recovery paths.

## Verification

- `npm run test:sdk`
- `npm run test:automation`
- `npm run test:indexer`
- `npm run verify:protocol:sepolia -- --manifest=<path>`
- `npm run verify:g6:evidence -- --out=evidence/sepolia/G6/G6-PROTOCOL.json`
- `npm run check:offline`
- `npm run check:sepolia:read`
- `git diff --check`

## Evidence and recovery

The passed G6 aggregate and its sixteen named components live under
`evidence/sepolia/G6/`. Automation and indexing are optional conveniences; direct
contract reads and permissionless timeout/grace recovery remain available if either
service is absent.

## Completion decision

P2 is complete and G6 passed with the canonical deployment, typed SDK, public
verifier, automation, read-model rebuild, success lifecycle, and recovery evidence.
