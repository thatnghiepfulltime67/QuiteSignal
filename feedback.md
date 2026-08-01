# iExec Nox integration feedback

## Executive summary

QuietSignal used iExec Nox to build a confidential participation layer for an
open prediction-market workflow on Ethereum Sepolia. Participants encrypt their
stake and probability forecast in the browser. The contracts compute confidential
YES/NO allocations, enforce owner-scoped access, reveal only a threshold-protected
cohort aggregate, and derive an owner-only payout and Brier score. The public price
feed and its contracts remain unchanged.

Nox provided the primitives needed for this design: externally encrypted inputs,
operations over encrypted integers and booleans, persistent and transient ACLs,
public decryption with proofs, and confidential ERC-7984-style asset flows. The
main integration cost was not the encrypted arithmetic itself. It was understanding
the exact caller, handle owner, consumer, ACL, callback, and gateway-timing rules at
every boundary.

Our overall assessment is positive: the current packages are capable of supporting
a real, non-mock Sepolia lifecycle. The developer experience would improve
substantially with a tested package compatibility matrix, end-to-end ACL recipes,
typed gateway errors, and first-class helpers for delayed handle availability.

This report is based on implementation and sanitized Sepolia evidence, not only on
documentation review. It deliberately contains no private keys, wallet signatures,
confidential plaintext, raw encrypted handles, proofs, calldata, or RPC secrets.

## Tested environment

| Component                               | Version or value                                   |
| --------------------------------------- | -------------------------------------------------- |
| Network                                 | Ethereum Sepolia (`chainId 11155111`)              |
| Node.js                                 | `24.18.0`                                          |
| npm                                     | `11.16.0`                                          |
| Solidity                                | `0.8.35`, EVM target `cancun`, IR pipeline enabled |
| Hardhat                                 | `3.11.1` during findings; `3.12.0` release lock    |
| `@iexec-nox/nox-protocol-contracts`     | `0.2.4`                                            |
| `@iexec-nox/nox-confidential-contracts` | `0.2.2`                                            |
| `@iexec-nox/handle`                     | `0.1.0-beta.13`                                    |
| Primary client stack                    | Viem `2.55.10`                                     |

The versions are pinned in `package.json` and `package-lock.json`. The repository
also checks the Sepolia chain ID, the live Nox deployment mapping, and runtime
bytecode before a named write flow can run. Hardhat `3.12.0` replaced `3.11.1` during
release hardening to resolve its vulnerable `adm-zip` dependency; the Nox findings
below retain the versions active when each case was reproduced.

## How QuietSignal uses Nox

The integration exercises more than a single encrypted input or arithmetic demo:

1. The wallet encrypts `stake` and `probabilityBps` for a specific application
   contract on Sepolia.
2. The owner submits the encrypted inputs because Nox input proofs are bound to the
   application caller.
3. The pool imports both values, clamps the probability, and derives confidential
   YES and NO allocations.
4. Confidential collateral is transferred through the unchanged wrapper. The pool
   compares the encrypted balance delta with a pre-registered encrypted intent so
   an unrelated transfer cannot be mistaken for the user's stake.
5. The wrapper receives transient access only to the encrypted callback result or
   amount that it must consume in the same transaction.
6. Individual stake, probability, allocation, payout, refund, and score values stay
   owner-scoped. Only the cohort YES/NO aggregate is eligible for public decryption,
   and only after the minimum cohort size is reached.
7. The aggregate proof is bound to the pool and lifecycle request. Replay,
   substitution, wrong-context, and premature-finalization cases are rejected.
8. Settlement reads an unchanged public Chainlink price-feed interface. Nox remains
   responsible for confidential accounting while the public protocol remains
   independently composable.

This lifecycle was developed through isolated feasibility gates and then exercised
through production-shaped contracts. The relevant summaries are
`evidence/reports/G1-summary.md`, `G2-summary.md`, and `G3-summary.md`; later G5 and
G6 artifacts cover the complete protocol and multi-user lifecycle.

## What worked well

### Encrypted computation is expressive enough for protocol logic

The Nox Solidity types supported the operations required by the product: bounds
checks, selection, addition, subtraction, multiplication, division, equality,
absolute difference, and Brier-score arithmetic. We could keep the individual
forecast and collateral accounting encrypted while publishing only protocol-level
facts.

The strongest property was composability at the contract boundary. QuietSignal did
not need to modify the public price-feed protocol. The adapter reads public data,
while Nox confines private accounting to the pool.

### ACL primitives can express least privilege

Persistent viewer access, persistent contract compute access, and transaction-only
access are distinct needs in a confidential application. Nox exposed primitives
for all three. Once the correct consumer was identified, `allowTransient` made it
possible to authorize the unchanged wrapper for exactly one callback result or
transfer amount without granting continuing access.

We verified owner-only viewing, cross-transaction contract computation, transient
access expiry, unrelated-account rejection, wrong-contract rejection, replay
rejection, and restricted public-decryption scope on Sepolia.

### Public-decryption proofs support permissionless progress

Proof-gated public decryption allowed lifecycle finalization to be permissionless.
An operator can submit a proof for the allowed aggregate or amount-free equality
boolean without learning or choosing the confidential result. Binding the proof to
the expected encrypted handle and lifecycle request prevented a keeper from
substituting a different value.

### Confidential token contracts are reusable

The inherited ERC20-to-ERC7984 wrapper could remain unchanged. Its encrypted
transfer, callback, atomic refund, unwrap, and rewrap behavior were sufficient for
non-custodial recovery after the receiving contract implemented the required intent
and ACL controls.

### Sepolia behavior was reproducible enough to investigate failures

Runtime bytecode checks, deterministic scripts, transaction receipts, and read-only
verifiers made it possible to distinguish application defects from stale fixtures,
ACL mistakes, and gateway synchronization delays. That was important because an ACL
error can otherwise look like a generic transaction failure.

## Detailed findings

### F-001 — The Viem Handle client entrypoint requires Ethers at runtime

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/handle@0.1.0-beta.13`; Sepolia dry-run
- **Reproduction:** Initialize the documented Viem Handle client in a workspace
  that installs Viem but does not install Ethers.
- **Expected:** The Viem implementation initializes with only its documented
  Viem-side runtime dependencies.
- **Actual:** The package entrypoint eagerly resolves `EthersBlockchainService`,
  causing Node module resolution to fail when `ethers` is absent.
- **Impact:** A Viem-only application fails before it can encrypt an input. The
  failure appears unrelated to the selected client implementation.
- **Workaround used:** Pin `ethers@6.17.0` as an explicit workspace dependency.
- **Suggested improvement:** Split Ethers and Viem entrypoints, lazy-load the
  unselected implementation, or declare Ethers as an explicit required peer with a
  startup error that names the missing package and compatible version.

### F-002 — Public-decryption availability can exceed the SDK retry window

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/handle@0.1.0-beta.13`; Ethereum Sepolia
- **Reproduction:** Complete an encrypted computation and immediately request the
  resulting public boolean through `publicDecrypt`.
- **Expected:** A value produced by a confirmed transaction becomes available
  within the SDK's default retry window, or the SDK reports a typed pending state.
- **Actual:** One valid computation exhausted the retry window; the same result
  became available to a read-only probe shortly afterwards.
- **Impact:** Applications can report a valid operation as failed and may prompt a
  user to repeat a transaction that does not need repeating.
- **Workaround used:** Add a bounded outer retry and re-read the existing
  bytecode-matched deployment instead of resubmitting the write.
- **Suggested improvement:** Provide `waitForHandleIndexing` or an equivalent helper
  with configurable timeout/backoff, abort support, and distinct `pending`,
  `unavailable`, `invalid proof`, and transport errors.

### F-003 — External-input proofs are bound to the application caller

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/nox-protocol-contracts@0.2.4` and
  `@iexec-nox/handle@0.1.0-beta.13`; Ethereum Sepolia
- **Reproduction:** Actor A encrypts an external input for an application contract;
  actor B submits the contract call that imports it.
- **Expected:** Documentation and types make the proof owner/caller relationship
  explicit before transaction simulation.
- **Actual:** Sepolia simulation reverts with Nox `InvalidProof` because
  `Compute.validateInputProof` checks the proof owner against the caller of the
  importing application function.
- **Impact:** A conventional relayer cannot directly submit an owner-bound encrypted
  input. This changes account-abstraction, sponsored-transaction, and relayer
  designs.
- **Workaround used:** The same wallet encrypts and submits the input. Relayers are
  limited to permissionless public lifecycle actions that do not import a user's
  confidential input.
- **Suggested improvement:** Add a prominent caller-binding section with examples
  for EOA submission, smart accounts, delegated execution, and intentionally
  supported meta-transaction patterns. The client could also expose the expected
  proof owner as a typed field.

### F-004 — The ERC-7984 callback amount is not compute-accessible to the receiver

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/nox-confidential-contracts@0.2.2` and
  `@iexec-nox/nox-protocol-contracts@0.2.4`; Ethereum Sepolia
- **Reproduction:** Call `confidentialTransferAndCall` and perform a Nox operation
  on the callback's encrypted `amount` in the receiving contract.
- **Expected:** A callback parameter intended for receiver logic is usable by that
  receiver during the callback, or the API states that it is an opaque identifier
  without receiver compute access.
- **Actual:** Gas simulation reverts with `MissingTransientAccess`. The wrapper
  updates the receiver's confidential balance but does not grant the receiver
  compute access to the callback amount handle.
- **Impact:** A receiver cannot safely treat the callback argument as its encrypted
  stake record. A plaintext fallback would violate the product's privacy model.
- **Workaround used:** Read the receiver's permitted confidential wrapper balance
  and derive the encrypted delta from a pre-callback snapshot.
- **Suggested improvement:** Document ACL ownership for every callback parameter.
  If compatible with the security model, grant receiver-scoped transient compute
  access to the callback amount; otherwise provide an official balance-delta recipe.

### F-005 — Balance-delta accounting needs encrypted intent binding

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/nox-confidential-contracts@0.2.2` and
  `@iexec-nox/nox-protocol-contracts@0.2.4`; Ethereum Sepolia
- **Reproduction:** Record the receiver's entire post-callback confidential balance
  as the new stake after an unrelated transfer has already reached that receiver.
- **Expected:** Only the transfer associated with the current callback can become
  the recorded position.
- **Actual:** Because the callback amount is not receiver-computable, using only the
  aggregate receiver balance can conflate an earlier transfer with the current
  stake.
- **Impact:** Collateral and position accounting can diverge even though every
  individual confidential transfer succeeds.
- **Workaround used:** Register a caller-bound encrypted expected stake and snapshot
  the pre-transfer balance. During the callback, compare encrypted
  `postBalance - preBalance` with the encrypted intent. Return only the encrypted
  equality result so the unchanged wrapper atomically refunds a mismatch.
- **Suggested improvement:** Publish a canonical receive-intent pattern for
  ERC-7984 callbacks, including replay protection, pre-balance capture, equality
  proof, mismatch refund, timeout cancellation, and direct-transfer contamination.

### F-006 — The wrapper needs transient access to consume the callback result

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/nox-confidential-contracts@0.2.2` and
  `@iexec-nox/nox-protocol-contracts@0.2.4`; Ethereum Sepolia
- **Reproduction:** Return a receiver-computed encrypted acceptance boolean from
  `onConfidentialTransferReceived` without granting access to the wrapper.
- **Expected:** The callback contract can return a decision value that the wrapper
  is authorized to consume, or the required grant is explicit in the interface
  documentation.
- **Actual:** Simulation reverts with Nox `NotAllowed` when the wrapper consumes the
  returned boolean after the callback.
- **Impact:** An otherwise correct encrypted accept/refund branch fails at the end
  of the transaction.
- **Workaround used:** After verifying that `msg.sender` is the configured wrapper,
  call `Nox.allowTransient` for the encrypted equality boolean immediately before
  returning it.
- **Suggested improvement:** Include an official callback implementation that
  illustrates producer-to-consumer ACL transfer and explains why persistent access
  is unnecessary and undesirable.

### F-007 — The wrapper needs transient access to consume receiver-held amounts

- **Date:** 2026-07-30
- **Package/network:** `@iexec-nox/nox-confidential-contracts@0.2.2` and
  `@iexec-nox/nox-protocol-contracts@0.2.4`; Ethereum Sepolia
- **Reproduction:** A receiver calls wrapper `confidentialTransfer` or `unwrap` with
  a receiver-derived encrypted amount that is accessible only to the receiver.
- **Expected:** The wrapper can consume the supplied amount, or the API makes the
  required caller-to-wrapper grant explicit.
- **Actual:** Simulation reverts with Nox `NotAllowed` when the wrapper attempts to
  update balances or burn the encrypted amount.
- **Impact:** Confidential collateral can become operationally stuck in an
  application contract whose immutable bytecode omitted the grant. One isolated
  pre-fix test deployment demonstrated this failure and was excluded from all later
  product evidence.
- **Workaround used:** Grant the configured wrapper transient access immediately
  before each confidential transfer or unwrap that consumes a receiver-held amount.
- **Suggested improvement:** Document the required ACL transition beside every
  wrapper function signature and add a preflight helper or custom error that names
  the missing consumer permission.

## Cross-cutting developer-experience feedback

### 1. Publish a version compatibility matrix

The Nox packages, Handle SDK, Hardhat, Solidity, EVM target, Viem/Ethers versions,
and supported Node releases form one runtime system. A tested matrix would prevent
builders from discovering compatibility only after compilation or module-loading
failures. Each release should identify supported Sepolia protocol addresses and the
date or block at which those bindings were verified.

### 2. Make handle provenance and ACL requirements visible in the API

For every handle-producing operation, documentation should answer four questions:

- Who initially has compute access?
- Who has viewer access?
- Which downstream contract consumes the handle?
- Does that consumer need persistent or transient access?

A compact ACL table for `fromExternal`, arithmetic results, token balances,
callback arguments, callback return values, transfers, unwraps, and public
decryption would have prevented most of the failed integration attempts described
above.

### 3. Add complete recipes, not only primitive examples

Small arithmetic examples are useful for first contact, but protocol builders also
need production-shaped recipes. The highest-value additions would be:

- owner-bound encrypted input with replay-safe application context;
- ERC-7984 receive intent, exact-delta validation, and atomic refund;
- transient ACL handoff between an application and an unchanged wrapper;
- delayed public-decryption polling without transaction replay;
- permissionless aggregate finalization and timeout recovery;
- smart-account and sponsored-transaction constraints.

Each recipe should include the negative cases and funds-recovery behavior, not only
the successful transaction.

### 4. Return typed, actionable gateway errors

Applications need to distinguish indexing delay, invalid proof, wrong application,
wrong chain, missing ACL, unsupported encrypted type, gateway outage, and permanent
failure. Stable error codes with retryability metadata would produce safer UI states
and reduce accidental duplicate submissions.

### 5. Improve observability without exposing confidential material

Debugging confidential flows is unusually difficult because the safest logs omit
the values developers would normally inspect. Tooling could expose sanitized facts
such as operation ID, chain ID, application address, encrypted type, ACL principal
category, gateway stage, and retry recommendation without printing handles, proofs,
calldata, or plaintext.

### 6. Document liveness and recovery as part of the security model

Gateway indexing and public-decryption availability are asynchronous operational
dependencies. Documentation should state expected timing, retry limits, expiry
behavior, and recovery actions. Examples should clearly separate a read retry from
a transaction retry so users are not asked to resubmit successful writes.

## Recommended priorities for iExec

| Priority | Recommendation                                                     | Why it matters                                                         |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| P0       | Publish the package/runtime/Sepolia compatibility matrix           | Prevents setup failures and stale network assumptions                  |
| P0       | Add canonical ACL-flow tables and ERC-7984 callback recipes        | Prevents failed transactions and potentially stuck confidential assets |
| P0       | Add typed gateway states and a configurable indexing wait helper   | Prevents false failures and duplicate user transactions                |
| P1       | Document caller-bound input proofs for relayers and smart accounts | Makes transaction architecture predictable before implementation       |
| P1       | Add ACL-aware preflight diagnostics and clearer custom errors      | Shortens debugging without leaking confidential values                 |
| P1       | Ship complete lifecycle and recovery examples on Sepolia           | Helps teams move from proof of concept to deployable protocol          |
| P2       | Provide sanitized tracing and support-bundle tooling               | Improves support quality while preserving the privacy boundary         |

## Scope and limitations of this feedback

This report directly evaluates the Nox Solidity contracts, confidential-contract
package, Handle client, public-decryption gateway behavior, and Sepolia deployment
used by QuietSignal. We did not rely on the confidential smart-contract wizard or
the Nox Hardhat starter/plugin for the final product, so we do not rate their user
experience here.

Passing integration tests does not remove the protocol's documented trust
assumptions. Nox gateway/TEE behavior remains an external trust and liveness input;
Sepolia RPC providers can limit historical reads; and public transaction membership
and timing are not anonymous. QuietSignal's privacy claim is limited to the
confidential input and owner-scoped output boundary verified by the named evidence.

## Reproduction and evidence

Read-only and offline entry points:

```sh
npm ci
npm run doctor
npm run check:offline
npm run check:sepolia:read
npm run verify:evidence
```

Named Sepolia write runners are listed in `package.json`. They require an explicitly
configured disposable Sepolia wallet and must pass the repository spend-ledger
preflight before submitting a transaction. Setup, verification, risk, and recovery
details are in:

- `docs/setup-sepolia.md`
- `docs/verification.md`
- `docs/security.md`
- `docs/runbooks/recovery.md`
- `docs/plans/evidence-ledger.md`
- `docs/operations/nox-feedback.md`

The linked operations report preserves the chronological findings. This root
`feedback.md` is the standalone competition submission document.
