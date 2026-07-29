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

**Status:** Accepted with FND-04 feasibility gate

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
for the callback transaction only; no persistent wrapper compute authority is allowed.
