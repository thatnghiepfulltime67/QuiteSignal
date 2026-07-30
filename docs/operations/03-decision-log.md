# Architecture decision log

## ADR-001 — Aggregate-only disclosure

**Status:** Accepted

Per-user probability, stake, allocation, payout, and score remain encrypted. Only
cohort aggregates are public after the k-gate.

## ADR-002 — Adapter over unchanged public protocol

**Status:** Accepted

The pool talks to a narrow `IMarketAdapter`. The integration does not modify the
target protocol, and all target addresses and code hashes are recorded.

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
