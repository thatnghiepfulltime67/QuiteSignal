# Product specification (MVP)

## Concepts

- **Market**: one binary price condition with collateral and an immutable
  public-resolution adapter.
- **Epoch**: the single signal-collection window owned by one pool. A new cohort
  or market deploys a new pool; the MVP has no cross-epoch accounting.
- **Signal**: `(stake, probabilityBps, salt)` encrypted client-side. The contract
  clamps `probabilityBps` to `[0, 10_000]` and derives encrypted YES/NO allocations.
- **Cohort**: commits in an epoch; sender is public, payload is confidential.
- **Score receipt**: an owner-scoped encrypted handle for payout and calibration score.

## Functional requirements

| ID | Requirement | Acceptance |
|---|---|---|
| FR-01 | Create pool | Factory deploys one immutable market/epoch pool in `OPEN` with deadline and `kMin` |
| FR-02 | Commit signal | User commits encrypted stake and probability; no plaintext |
| FR-03 | Cohort gate | No aggregate public decryption below `kMin` |
| FR-04 | Aggregate finalization | Only aggregate plaintext is published after the k-gate; collateral stays confidential |
| FR-05 | Settlement | Immutable public feed condition selects winner; payout cannot exceed pool collateral |
| FR-06 | Private view | Owner decrypts position and score; ACL is owner-scoped |
| FR-07 | Refund | Aggregate/proof timeout, invalid feed, or keeper failure cannot lock funds indefinitely |
| FR-08 | Audit | Verifier recomputes conservation, disclosure, resolution, and payout bounds |
| FR-09 | Private score | Owner receives a Brier score derived from their encrypted forecast |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Contract transitions are explicit, guarded, monotonic, and idempotent where retry is allowed |
| NFR-02 | Framework-independent TypeScript SDK has branded types and test vectors for every encoding |
| NFR-03 | Frontend is mobile-friendly, keyboard navigable, and exposes clear transaction/recovery states |
| NFR-04 | No confidential plaintext enters application servers, relayer, indexer, CI, analytics, or committed logs |
| NFR-05 | Every release includes a manifest, ABI/code hashes, reproducible metadata, and sanitized evidence |

## MVP verification metrics

- Four participants submit fixed-shape commits.
- The aggregate is correct, but the verifier cannot identify who chose which side.
- A winner decrypts payout and score privately.
- A judge runs one read-only verifier command and sees all invariants pass.
