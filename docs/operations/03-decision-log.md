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

## ADR-008 — Official local Nox stack

**Status:** Accepted

ACL and decryption evidence uses the official Nox Hardhat integration stack. Pure
fakes are limited to domain tests.

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
