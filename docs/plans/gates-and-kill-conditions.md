# Gate register and kill conditions

Gate status values: `not_run`, `running`, `passed`, `failed`, `waived`.

A gate may be marked `passed` only when its required artifacts, checks, and sanitized
evidence are committed. `waived` requires an ADR, risk acceptance, and explicit user
approval; no privacy or custody gate can be waived for release.

## G0 — Reproducible toolchain lock

Required artifacts:

- `.nvmrc`, root `package.json`, workspace file, lockfile, and strict base TypeScript config.
- Exact Node, package-manager, Hardhat, Solidity, Nox, wallet, and frontend versions.
- A generated environment doctor that reports versions and missing public configuration.
- A local Nox stack health check using the official integration plugin.

Pass criteria:

- Clean install from the lockfile succeeds twice.
- Compile and a Nox hello-world test pass on a clean process.
- Tool versions and license metadata are captured without secrets.

Kill conditions:

- Required Nox packages cannot coexist on one supported toolchain.
- The official local stack cannot start deterministically after documented retries.
- A required dependency has an unacceptable license or unresolved critical advisory.

## G1 — Confidential computation and ACL

Required cases:

- External encrypted stake/probability import bound to chain and pool.
- Compare/select clamp, multiply, divide, subtract, absolute difference, and square.
- Persistent derived handle across transactions.
- Pool compute authority, owner viewer-only access, unauthorized viewer failure.
- Aggregate-only public decryption and no-op/revert behavior for invalid ACL operations.

Pass criteria:

- Cases pass on the official local stack and minimally on Sepolia.
- Local and live behavior agree on every load-bearing ACL decision.
- No plaintext shadow state is used to make a test pass.

Kill conditions:

- An owner-shaped handle becomes publicly decryptable through the required flow.
- A relayer, adapter, token, or keeper needs persistent compute authority.
- A stored score/position handle cannot remain owner-viewable across transactions.
- Local ACL behavior cannot be reconciled with Sepolia.

## G2 — Confidential asset lifecycle

Required cases:

- Exact confidential stake pull using operator and transient ACL rules.
- Owner payout and refund transfers.
- Unwrap request, proof finalization, underlying balance delta, and rewrap.
- Failure before unwrap, failure after request, and duplicate-finalization rejection.

Pass criteria:

- Conservation is proven from encrypted accounting and public balance deltas.
- No external actor can redirect, inflate, or retain pool assets.
- Recovery returns all released collateral to confidential custody.

Kill conditions:

- Pool funds can be spent without a context-bound proof.
- A required recovery leaves funds in an unspecified or third-party address.
- Unwrap finalization cannot be made replay-safe.
- The confidential asset wrapper requires a privileged backend custodian.

## G3 — Aggregate proof and recovery

Required cases:

- Below-k close enters refund without marking aggregate handles public.
- At/above-k close exposes only aggregate YES/NO handles.
- Proof binds `(chainId, pool, epochId, requestId)` and is single-use.
- Aggregate totals equal released collateral before adapter execution.
- Timeout before unwrap and delayed finalize-and-rewrap after unwrap request.

Pass criteria:

- P1–P7 and I1–I4, I7, I8, and I10 have named passing tests.
- Every state has a tested funds location and recovery transition.

Kill conditions:

- A below-k path can reveal an aggregate.
- Recovery requires public disclosure of an owner-shaped handle.
- Proof service unavailability creates an unavoidable undocumented loss state.
- A keeper can substitute plaintext totals without detection.

## G4 — Open-protocol adapter

Required cases:

- One target protocol selected with license, address, ABI, and runtime-code provenance.
- Adapter performs aggregate execution with explicit slippage limits.
- Adapter returns all assets to the caller in the same transaction.
- Resolution normalization and redemption are verified from observed balance deltas.
- Unauthorized calls, stale resolution, zero winning pool, and residual-balance cases.

Pass criteria:

- Target protocol is unchanged and independently code-hash verifiable.
- Adapter has no confidential handle access and no between-call custody.
- G4 live smoke passes on Sepolia.

Kill conditions:

- Integration requires modifying the target protocol.
- Adapter must retain user/pool assets or privileged authority between calls.
- Execution cannot enforce a hard spend bound or slippage bound.
- Resolution cannot be normalized deterministically and audited.

## G5 — Local protocol correctness

Pass criteria:

- Full success, below-k refund, pre-unwrap timeout, unwrap recovery, slippage revert,
  replay, invalid state, zero winning pool, payout rounding, and ACL paths pass.
- I1–I10 have named tests; verifier code is independent of pool accounting helpers.
- Fuzz/property bounds and static analysis meet the verification matrix.

Kill conditions:

- Any invariant fails on a minimized reproducible input.
- The only fix requires plaintext shadow accounting or trusted off-chain correctness.

## G6 — Live Sepolia lifecycle

Pass criteria:

- Clean deployment manifest and source verification are complete.
- Multi-user real lifecycle passes from encrypted input to score/claim.
- At least one live failure/recovery path and one unauthorized ACL check are recorded.
- Read-only verifier recomputes all publicly observable invariants.

Kill conditions:

- Live behavior diverges from the local gate in custody or privacy semantics.
- The lifecycle requires manually editing chain state or substituting fixture data.

## G7 — Real application journey

Pass criteria:

- Primary routes use the live deployment manifest and chain-derived state.
- Wallet, encryption, transaction replacement, retry, owner decrypt, score, claim,
  refund, loading, empty, error, keyboard, screen-reader, mobile, and reconnect paths pass.
- Relayer/indexer outage degrades convenience, not correctness or fund recovery.

Kill conditions:

- A primary route requires a mock-data switch or application database as truth.
- Confidential input reaches application logs, analytics, relayer, or indexer.

## G8 — Release candidate

Pass criteria:

- Clean install, compile, all tests, lint, typecheck, build, scans, deployment
  verification, evidence validation, and live read checks pass.
- All high/critical risks are closed or explicitly accepted where acceptance is allowed.
- Documentation, public claims, manifests, generated bindings, and verified sources agree.
- No stop-ship condition remains and the worktree is clean.

Kill conditions:

- Any privacy/custody gate is waived, any secret is detected, or clean reproduction fails.

## Failure protocol

When a gate fails:

1. Record a sanitized minimal reproduction and affected assumptions.
2. Mark downstream work blocked; do not introduce a hidden mock or trusted shortcut.
3. Evaluate at most the documented alternatives in the source/assumption register.
4. If an alternative changes trust, custody, privacy, or public interfaces, create an ADR.
5. Re-run the complete gate, not only the previously failing assertion.
