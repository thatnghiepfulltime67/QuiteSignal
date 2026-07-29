# Evidence ledger

This ledger records proof that gates passed. It must never contain confidential
plaintext, raw handles, proofs, private RPC credentials, wallet signatures, keys,
seed phrases, environment dumps, or unsanitized terminal history.

## Ledger

| Gate | Status | Environment | Evidence artifact | Commit | Chain/block | Public tx/address references | Verified checks | Notes |
|---|---|---|---|---|---|---|---|---|
| G0 | `not_run` | — | — | — | — | — | — | — |
| G1 | `not_run` | — | — | — | — | — | — | — |
| G2 | `not_run` | — | — | — | — | — | — | — |
| G3 | `not_run` | — | — | — | — | — | — | — |
| G4 | `not_run` | — | — | — | — | — | — | — |
| G5 | `not_run` | — | — | — | — | — | — | — |
| G6 | `not_run` | — | — | — | — | — | — | — |
| G7 | `not_run` | — | — | — | — | — | — | — |
| G8 | `not_run` | — | — | — | — | — | — | — |

## Evidence artifact contract

Each evidence artifact must include:

- gate and work-item IDs;
- UTC timestamp, chain id, block range, commit, and exact package versions;
- public contract addresses and transaction hashes where safe;
- command name and sanitized result summary;
- expected versus observed behavior;
- invariant/requirement IDs covered;
- known limitations and follow-up issue IDs;
- independent reproduction instructions.

## Storage layout

```text
evidence/
├── local/<gate>/<work-item>.json
├── sepolia/<gate>/<work-item>.json
└── reports/<gate>-summary.md
```

Machine-readable JSON uses a versioned schema from `packages/config`. Reports may
summarize JSON but cannot replace it. Transaction receipts are referenced by hash,
not copied with raw confidential call data.

## Review rule

The implementer records evidence; a separate verifier command validates schema,
chain id, code hashes, referenced receipts, and commit reachability. A checkbox or
screenshot alone is not gate evidence.
