# Evidence ledger

This ledger records proof that gates passed. It must never contain confidential
plaintext, raw handles, proofs, private RPC credentials, wallet signatures, keys,
seed phrases, environment dumps, or unsanitized terminal history.

## Ledger

| Gate | Status    | Environment                      | Evidence artifact                                                                                      | Commit                          | Chain/block                      | Public tx/address references                                                                                                                                                                                              | Verified checks                                                                                                                         | Notes                                                                              |
| ---- | --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| G0   | `passed`  | offline / Sepolia read           | `evidence/offline/G0/FND-01.json`, `evidence/reports/G0-summary.md`                                    | `6f562e2`                       | `11155111` / `11377462`          | NoxCompute `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`                                                                                                                                                                   | Frozen installs ×2, compile, format, secret/dependency scans, budget validation, Sepolia read preflight                                 | No write; R-16 remains open for G8 closure                                         |
| G1   | `running` | offline / Sepolia write and read | `evidence/offline/G1/FND-02.json`, `evidence/sepolia/G1/FND-02.json`, `evidence/reports/G1-summary.md` | `bd3217a`, `a7c66c3`, `02365db` | `11155111` / `11377593–11377636` | ArithmeticSpike `0x8dfb2d7d7a2608ee7cd78983fbe28cce00e1d4a4`; deployment `0x9bf895222f2e1e3374b320875eba5fb4415157783cf6e015874d96ac8e275e64`; batch `0x17df72de7da39cb3c33f8b09541740cf262e76828c94da08fd69ca1f052a3f9e` | Model, compile, bounded dry-run, encrypted write receipts, bytecode-matched verify-only, missing-runtime preflight, offline/read checks | FND-02 passed; FND-03 ACL/persistence remains before G1 can pass; no asset custody |
| G2   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G3   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G4   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G5   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G6   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G7   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |
| G8   | `not_run` | —                                | —                                                                                                      | —                               | —                                | —                                                                                                                                                                                                                         | —                                                                                                                                       | —                                                                                  |

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
├── offline/<gate>/<work-item>.json
├── sepolia/<gate>/<work-item>.json
└── reports/<gate>-summary.md
```

Machine-readable JSON uses a versioned schema from `modules/config`. Reports may
summarize JSON but cannot replace it. Transaction receipts are referenced by hash,
not copied with raw confidential call data.

Sepolia write evidence references the append-only budget records defined in
[`sepolia-spend-ledger.md`](sepolia-spend-ledger.md). Gate evidence and spend evidence
are separate artifacts and both are required after a write.

## Review rule

The implementer records evidence; a separate verifier command validates schema,
chain id, code hashes, referenced receipts, and commit reachability. A checkbox or
screenshot alone is not gate evidence.
