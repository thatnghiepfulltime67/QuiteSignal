# Product specification (MVP)

## Concepts

- **Market**: a binary question with condition, collateral, and adapter.
- **Epoch**: the single signal-collection window owned by one pool. A new cohort
  or market deploys a new pool; the MVP has no cross-epoch accounting.
- **Signal**: `(stake, probabilityBps, salt)` encrypted client-side. The contract
  clamps `probabilityBps` to `[0, 10_000]` and derives encrypted YES/NO allocations.
- **Cohort**: commits in an epoch; sender is public, payload is confidential.
- **Score receipt**: an owner-scoped encrypted handle for payout and calibration score.

## Functional requirements

| ID | Requirement | Acceptance |
|---|---|---|
| FR-01 | Open epoch | Operator opens an epoch with deadline and `kMin` |
| FR-02 | Commit signal | User commits encrypted stake and probability; no plaintext |
| FR-03 | Cohort gate | No aggregate public decryption below `kMin` |
| FR-04 | Batch execution | Only aggregate plaintext is routed through the adapter |
| FR-05 | Settlement | Oracle result selects winner; payout cannot exceed pot |
| FR-06 | Private view | Owner decrypts position and score; ACL is owner-scoped |
| FR-07 | Refund | Timeout, slippage, or keeper failure cannot lock funds indefinitely |
| FR-08 | Audit | Verifier recomputes conservation, disclosure, and execution bounds |
| FR-09 | Private score | Owner receives a Brier score derived from their encrypted forecast |

## Non-functional requirements

- Explicit, guarded, idempotent contract transitions.
- Framework-independent TypeScript SDK with test vectors for every encoding.
- Mobile-friendly, keyboard-navigable frontend with clear transaction states.
- No plaintext in browser, relayer, CI, or analytics logs.
- Every release includes a deployment manifest, ABI checksum, and reproducible-build metadata.

## MVP verification metrics

- Four participants submit fixed-shape commits.
- The aggregate is correct, but the verifier cannot identify who chose which side.
- A winner decrypts payout and score privately.
- A judge runs one read-only verifier command and sees all invariants pass.
