# Architecture decision log

## ADR-001 — Aggregate-only disclosure

**Status:** Accepted

Per-user probability, stake, allocation, payout, and score remain encrypted. Only
cohort aggregates are public after the k-gate.

## ADR-002 — Adapter over unchanged public protocol

**Status:** Accepted

The pool talks to a narrow adapter. The integration does not modify the target
protocol, and all target addresses and code hashes are recorded. ADR-017 narrows
the MVP adapter to public result normalization and explicitly forbids it from
receiving collateral.

## ADR-003 — Binary first

**Status:** Accepted

Binary outcomes keep privacy and settlement math auditable. Additional outcomes
require a new reviewed interface and are outside the MVP.

## ADR-004 — Permissionless lifecycle, optional relayer

**Status:** Accepted

The relayer holds no secrets, funds, or exclusive role. Safe lifecycle transitions
are permissionless and retryable.

## ADR-005 — Private Brier-score receipt

**Status:** Accepted with feasibility gate

The owner-only score is derived from encrypted probability and public outcome. It
ships only if P0 proves the arithmetic and ACL behavior on Sepolia.

## ADR-006 — Independent verifier

**Status:** Accepted

Verifier logic does not import internal accounting helpers. It reconstructs I1–I10
from public chain data and documented proof outputs.

## ADR-007 — No application-backend plaintext

**Status:** Accepted

Plaintext may exist only in the browser and attested Nox boundary. Relayer and
indexer schemas cannot represent confidential input fields.

## ADR-008 — Sepolia-only contract validation

**Status:** Accepted

Every contract, Nox, ACL, confidential-asset, adapter, lifecycle, recovery, and
browser acceptance test runs on Ethereum Sepolia. Offline execution is limited to
pure reference models, schemas, static checks, and deterministic data validation.
No local blockchain result is accepted as contract or privacy evidence.

## ADR-009 — Encrypted probability as canonical input

**Status:** Accepted with feasibility gate

The pool derives YES/NO allocations from encrypted stake and probability basis
points. This gives scoring a precise input and separates client input from execution.

## ADR-010 — No administrative sweep

**Status:** Accepted

Rounding dust and unclaimed payouts remain in the pool for the MVP. Any expiry or
treasury policy requires a new immutable pool version and decision record.

## ADR-011 — npm workspaces and functional repository zones

**Status:** Accepted

The repository uses npm workspaces with `apps/` for user-facing applications,
`services/` for optional long-running automation/read models, `modules/` for reusable
protocol/domain/client/verifier/config code, and `ops/` for non-runtime orchestration.
Exact Node/npm versions are pinned by G0. Cross-workspace imports use declared exports;
deep relative imports and circular dependencies are forbidden.

## ADR-012 — Derive received confidential collateral from recipient balance

**Status:** Accepted

The pinned ERC-7984 wrapper updates the recipient confidential balance before its
transfer callback but does not grant the callback receiver compute access to the
callback `amount` handle. A pool must therefore snapshot its permitted confidential
balance and derive the received encrypted delta from the post-transfer recipient
balance; it must not use the callback argument or introduce a plaintext amount.
This preserves the wrapper's real ACL behavior and has no backend or relayer trust
role. The decision is valid only if FND-04 proves the flow, exact balance delta,
recovery rewrap, and unauthorized cases on Ethereum Sepolia. F-005 further requires
the delta to be bound to a caller-registered encrypted intent and confirmed only by
an amount-free equality proof; the wrapper must refund a mismatch atomically. F-006
requires the receiver to grant the verified wrapper transient access to that result
for the callback transaction only; F-007 applies the same transaction-scoped grant
to a receiver-held amount immediately before wrapper transfer or unwrap. No persistent
wrapper compute authority is allowed.

## ADR-013 — Independent terminal evidence slices for aggregate feasibility

**Status:** Accepted

G3 retains the same Sepolia requirements: confidential commitments, aggregate-only
disclosure, context-bound proof handling, timeout refunds, delayed unwrap, and
rewrap recovery. The earlier single runner coupled those independent conclusions
into one long live execution. A transport or observation failure late in that run
repeated completed setup, increased testnet spend, and left a non-terminal fixture
to recover before any next observation.

G3 therefore uses three independent, fresh-fixture Sepolia evidence slices: below-k
close and refund; threshold aggregate disclosure with pre-unwrap timeout and
refund; and proof binding with delayed unwrap finalization and rewrap recovery.
Each slice must finish in a terminal funds location, write its own sanitized
machine-readable evidence, and delete an unused or fully recovered secondary-actor
record. A read-only verifier combines only completed slice artifacts into the G3
conclusion; no partial run can satisfy a different slice.

This is a verification-orchestration simplification, not a protocol change. It does
not change product trust, custody, privacy, lifecycle semantics, or public
interfaces. Shared implementation helpers may be used, but no live result may be
reused across fixtures. Future delivery simplifications follow the same rule: retain
all non-negotiable properties and record a material architecture decision before
implementation.

## ADR-014 — Sanitized live finalization failure classifier

**Status:** Accepted with feasibility gate

When an existing Sepolia aggregate fixture has a valid gateway proof but its real
permissionless finalization reverts without an RPC-exposed reason, an isolated probe
may call that same finalization once and catch its revert. The probe records only a
fixed error-class enum and its own public address; it must not emit, store, return,
or persist proof bytes, encrypted handles, plaintext, calldata, signatures, keys, or
RPC configuration. It receives no custody and no privilege: the target transition is
already permissionless, and a caught failure reverts the target subcall completely.

This is diagnostic instrumentation, not a substitute path. If the target succeeds,
it makes the same real transition as a direct finalization and normal delayed
recovery, rewrap, and refund requirements remain. If it fails, its classification
only informs the next real correction; it cannot pass G3 or relax privacy, custody,
ACL, proof-context, or recovery requirements.

## ADR-015 — Wrapper-owned unwrap request ACL

**Status:** Accepted

The unchanged wrapper creates the encrypted unwrap-request handle during
`unwrap`. Nox grants the wrapper transient access to that newly produced handle in
the transaction, but the calling recovery spike does not receive that access merely
because the wrapper returns the handle. The spike must therefore store the handle for
later use by the wrapper without attempting `Nox.allowThis` on it. Calling that ACL
mutation is invalid and reverts with `NoxUnauthorizedSender`.

The recovery spike retains authority only over its aggregate amount, for which it
grants the wrapper transaction-scoped access immediately before `unwrap`. The
wrapper remains the sole contract that validates the later public unwrap proof. This
removes an invalid permission mutation without granting any new persistent access,
changing custody, or exposing a confidential value. Pre-fix fixtures are recovered
through their existing timeout and refund path and are excluded from post-fix gate
evidence.

## ADR-016 — Retain the original G4 target stop condition

**Status:** Accepted

G4 target discovery found no unchanged public conditional-market protocol that
satisfies every required dimension on Ethereum Sepolia. The documented
conditional-token target lacks a Sepolia deployment. The documented exchange target
lacks both a Sepolia deployment and binary resolution/redemption. The public
Sepolia optimistic-oracle target is not a complete market and its testnet
configuration does not prove deterministic disputed resolution.

The project will not deploy a copied target, simulate a protocol, add a trusted
resolver, or claim that an undisputed oracle assertion is equivalent to complete
market settlement. This preserves the existing trust, custody, privacy, state, and
public-interface commitments. P0 is blocked until a new source-proven target is
available on Ethereum Sepolia or the user explicitly authorizes a revised G4
acceptance boundary and a new decision record.

## ADR-017 — Direct public price-feed settlement

**Status:** Accepted with feasibility gate

The user authorized removal of non-core conditional-market requirements on
2026-07-30. The MVP retains its privacy, custody, recovery, and Sepolia-only
requirements, but replaces external AMM execution, slippage handling, external
redemption, and third-party market custody with a direct public resolution adapter.

Each immutable pool configures one unchanged canonical Chainlink ETH/USD price-feed
proxy on Ethereum Sepolia, one comparison direction, one integer threshold, one
observation-not-before timestamp, and one maximum feed age. The adapter reads the
feed and returns a binary result only when the answer is positive, the round is
complete, and its update time is within the immutable age bound. A pool can settle
only after its configured observation time. The pool continues to own all
confidential collateral; the target receives no pool assets and has no authority
over pool state, Nox handles, payout handles, or recovery.

The public aggregate remains the k-gated product output. Once a valid objective
outcome is available, the pool selects each participant's confidential YES or NO
allocation and applies the public rate `aggregateCollateral / winningAggregate`.
Claims therefore remain confidential and cannot exceed collateral already held by
the pool. If the feed does not provide a valid round before an immutable resolution
grace deadline, the pool enters the documented confidential refund path. No owner,
backend, relayer, indexer, or adapter may choose the result.

This is a material state, custody, and public-interface change. FND-06B must prove
the target's source/license provenance, Sepolia runtime, ABI, current round shape,
positive/negative threshold behavior, stale-round rejection, and zero-custody
boundary before G4 can pass. FND-06B passed direct Sepolia smoke evidence at blocks
`11380852` through `11380856` and independent historical read-only verification at
block `11380856`. Product implementation may begin. The external oracle remains an
explicit public trust dependency; QuietSignal makes no claim that it independently
verifies the feed.

## ADR-018 — Intent-bound two-step confidential commit

**Status:** Accepted with PK-04 Sepolia gate

The pre-PK-04 pool ABI is insufficient for real ERC-7984 custody. Nox input proofs
are owner-submitter bound, while the unchanged wrapper invokes the receiver callback
only after it updates the receiver's confidential balance and does not grant compute
access to the callback amount. A single atomic `commitSignal` cannot safely import
owner inputs, prove the exact callback delta, and expose the amount-free acceptance
proof without a false acceptance or a plaintext/trusted shortcut.

The production pool therefore uses a bounded two-step operation. The owner first
calls `commitSignal` before the epoch deadline; it imports the encrypted stake and
probability, clamps and allocates them, records one pending intent and confidential
pre-transfer balance snapshot, and starts immutable `commitTimeout`. The same owner
then invokes the unchanged collateral's `confidentialTransferAndCall`. The pool
derives the encrypted balance delta, compares it with the pending stake, and returns
the encrypted acceptance result to the wrapper with transient access only. Anyone
may finalize a true acceptance proof into an owner-viewable position and aggregates,
clear a false proof, or after timeout clear an uncalled intent or return only the
conditionally-held encrypted amount to the owner.

The public ABI adds finalization and pending-timeout methods, a public pending-status
view, pending lifecycle events and errors, and immutable `commitTimeout`. This is a
deliberate public-interface, custody, and state-transition change. It preserves
owner-submitter proof binding, exact encrypted transfer matching, atomic wrapper
refund on mismatch, no persistent wrapper ACL, aggregate-only public decryption,
and permissionless recovery. One pending transfer is allowed per pool at a time; this
MVP serialization bounds callback balance-delta ambiguity without a trusted queue or
plaintext accounting.

## ADR-019 — Two proof-only aggregate finalization inputs

**Status:** Accepted before PK-05 implementation

The initial stable interface described `finalizeAggregate(requestId, aggregateProof)`.
That shape cannot prove both encrypted YES and NO aggregates with Nox: public
decryption validates a proof against exactly one encrypted handle. Treating one proof
as evidence for two handles would accept an unverified value; instead publicly
decrypting the confidential total would expand disclosure beyond the protocol's
privacy claim.

`finalizeAggregate` therefore accepts the request id plus separate `yesProof` and
`noProof`, and still accepts no caller-supplied plaintext aggregate. The pool
validates each proof against its own immutable aggregate handle, stores the two
resulting public totals, and consumes the request atomically. The request id remains
the replay/context boundary. This narrow public-ABI correction reduces ambiguity and
preserves the intended public disclosure: aggregate YES and NO only.

After a request exists, the pool may expose those two opaque aggregate handles via a
read-only disclosure view. This does not create an additional disclosure: the exact
same handles have already been permitted for public decryption, and no owner,
position, total-collateral, payout, or refund handle is returned.

## ADR-020 — Product-named canonical collateral wrapper

**Status:** Accepted

P0 and P1 Sepolia evidence uses a wrapper explicitly named for feasibility work.
The canonical product deployment instead uses `QuietSignalConfidentialCollateral`,
a minimal product-named subclass of the same pinned
`ERC20ToERC7984Wrapper` implementation. The constructor only supplies token
metadata and the underlying ERC-20 address.

This decision changes deployment identity and user-facing token metadata, not the
confidential-asset implementation, custody model, transfer callback, Nox ACL model,
or public ERC-7984 interface. The wrapper has no owner, upgrade, mint, sweep,
resolver, or backend role. Historical P0/P1 fixtures are retained as evidence and
are not silently relabeled as product deployment evidence. DEP-01 must record the
new artifact/runtime hashes and independently verify interface support before the
canonical manifest is published.

## ADR-021 — Browser-native web shell with build-only tooling

**Status:** Accepted

The web product will use a small TypeScript single-page application built with a
pinned Vite development dependency. It uses browser-standard DOM APIs and the
EIP-1193 provider interface rather than adding a UI framework, analytics, hosted
backend, wallet-custody SDK, or application database.

Vite is a build/development tool only and receives no runtime authority, user
plaintext, wallet credential, Nox material, or chain-writing role. The browser loads
the canonical public manifest as an asset and validates it before use; addresses are
not copied into application source. Wallet connection is initiated explicitly by the
user and the shell persists neither account nor provider state. Later signal and
owner flows remain browser-local and must preserve the existing Nox and wallet trust
boundaries.

This adds a limited supply-chain dependency, tracked as R-23. The lockfile,
license/advisory scan, source boundary tests, and real Sepolia browser evidence are
required before release. It changes presentation/build architecture only; it adds no
custody, protocol authority, privacy claim, contract state transition, or public
contract interface.

## ADR-022 — Direct read-only Sepolia transport for public lifecycle facts

**Status:** Accepted

The web application may read the canonical pool's public config and epoch through a
single documented Ethereum Sepolia JSON-RPC endpoint when no wallet is connected.
This removes the wallet-provider dependency from public lifecycle visibility without
introducing an indexer, backend, signer, cache, or alternative source of protocol
truth. The response is treated as an availability convenience only: the browser reads
the immutable pool directly, validates the canonical manifest first, and labels a
transport failure as degraded rather than substituting static state.

The endpoint observes the browser IP address and public pool request. It receives no
wallet address, signature, plaintext, raw confidential handle, proof, or transaction
payload from this read path. Wallet-connected and confidential operations retain
their existing explicit EIP-1193/Nox paths. This does not change custody, Nox ACL,
contract state, or public contract interface; it introduces an external availability
and metadata-linkability risk tracked as R-24. Users can still use an independent
public explorer or their own wallet provider if the direct endpoint is unavailable.

## ADR-023 — Append-only canonical deployment revisions

**Status:** Accepted

An immutable pool epoch can expire before the real-browser release journey is
completed. The original DEP-01 manifest remains immutable G6 historical evidence and
must never be overwritten. A replacement product epoch therefore uses an explicitly
named append-only deployment revision with its own manifest, receipts, runtime
verification, budget-ledger entries, and evidence. The browser may follow one small
active-release pointer only after that revision has passed the same public manifest
verification; the pointer contains no secret, wallet, confidential input, or mutable
protocol state.

This preserves independent reproducibility of DEP-01 while allowing the product to
operate against a currently open immutable pool. The release pointer is not a
trusted backend or authority: browser operations still validate the selected
manifest, read contract state directly, and rely solely on immutable contract code.
Each revision has a fresh deterministic deployment plan and native-gas budget guard.
The old deployment remains visible and its refund state is not relabelled as current
product success. This changes release artifact selection, but not custody, privacy,
Nox ACL, contract interfaces, or protocol state transitions.

## ADR-024 — User-controlled valueless test-asset preparation

**Status:** Accepted before WEB-09 implementation

The canonical release already deploys a manifest-recorded, valueless Sepolia ERC-20
whose permissionless `mint(to, amount)` function exists solely for testing, and an
immutable 1:1 confidential wrapper bound to that underlying token. The web may expose
an explicit participant setup flow that calls this existing faucet, grants the
wrapper an exact selected allowance, and calls `wrap(to, amount)` from the connected
user wallet. The manifest parser must bind both contracts and the browser must verify
the wrapper's public `underlying()` value before enabling any asset action.

Each write remains a separate user-approved EIP-1193 transaction and is considered
complete only after a successful Sepolia receipt. The application has no faucet key,
admin role, relayer, backend, native-gas source, allowance escalation, or custody.
Public faucet balance and allowance may be read normally; confidential balance may
be decrypted only for the connected owner after an explicit session action and must
not be logged, persisted, placed in a URL, or included in evidence. The test token is
always described as valueless and testnet-only.

This changes the public web journey and makes the existing asset custody transition
usable, but it does not change a contract ABI, trust the application with assets, or
weaken Nox ACL. An unavailable or expired canonical pool disables signal submission;
the faucet must never be presented as sufficient readiness without native Sepolia gas,
confirmed wrapping, and an open chain-derived commit window. R-26 tracks confusion,
unbounded test minting, allowance, and stale-release risks.

## ADR-025 — Browser-created permissionless self-test market

**Status:** Accepted before WEB-10 implementation

The canonical deployment may expire before a user is ready to exercise the full
browser journey. The existing `QuietSignalFactory` is permissionless and a new cohort
is explicitly represented by a new one-epoch pool. WEB-10 may therefore let a
connected Sepolia wallet deploy a new immutable `ChainlinkPriceFeedResolutionAdapter`
and call the verified canonical factory's `createPool` with the canonical confidential
wrapper, an automatically derived future deadline, k=2, and the fixed public ETH/USD
condition. This reuses the audited contracts and does not deploy a new faucet, wrapper,
factory, backend, relayer, or privileged role.

The browser reads the current block before deriving the fixed 25-minute commit window
and 35-minute adapter observation boundary. It generates a fresh salt locally,
requires a successful receipt for the adapter before factory creation, then re-reads
the created pool configuration. The resulting pool is a user-created public test
market held only in memory for the browser session; it never changes the canonical
manifest or active-release pointer and must never be called canonical, G6, or G7
evidence. Refreshing clears the session state rather than persisting a wallet or
private value.

The user explicitly approves both gas-paying transactions. The adapter has no asset
receiving function or Nox access, the factory never holds collateral, and the pool
retains the immutable custody/recovery model. R-27 tracks cost, session loss, stale
configuration, and confusion between an independently user-created pool and a
published canonical release.
