# Evidence ledger

This ledger records proof that gates passed. It must never contain confidential
plaintext, raw handles, proofs, private RPC credentials, wallet signatures, keys,
seed phrases, environment dumps, or unsanitized terminal history.

## Ledger

| Gate | Status    | Environment                      | Evidence artifact                                                                                                                                                                                                                 | Commit                                                                                                                                                                                                                                                      | Chain/block                      | Public tx/address references                                                                                                                                                                                                                                                                                                                             | Verified checks                                                                                                                                                                                                | Notes                                                                                                                               |
| ---- | --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| G0   | `passed`  | offline / Sepolia read           | `evidence/offline/G0/FND-01.json`, `evidence/reports/G0-summary.md`                                                                                                                                                               | `6f562e2`                                                                                                                                                                                                                                                   | `11155111` / `11377462`          | NoxCompute `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`                                                                                                                                                                                                                                                                                                  | Frozen installs ×2, compile, format, secret/dependency scans, budget validation, Sepolia read preflight                                                                                                        | No write; R-16 remains open for G8 closure                                                                                          |
| G1   | `passed`  | offline / Sepolia write and read | `evidence/offline/G1/FND-02.json`, `evidence/sepolia/G1/FND-02.json`, `evidence/offline/G1/FND-03.json`, `evidence/sepolia/G1/FND-03.json`, `evidence/reports/G1-summary.md`, `evidence/reports/G1-FND-03-input-proof-finding.md` | `bd3217a`, `a7c66c3`, `02365db`, `21acef7`, `ee243ec`, `f13bfb6`, `09cecd5`                                                                                                                                                                                 | `11155111` / `11377593–11377822` | ArithmeticSpike `0x8dfb2d7d7a2608ee7cd78983fbe28cce00e1d4a4`; FND-03 spikes `0x28a969018975fb40aed0bfa98f6d1c3023b6a7da`, `0xe6acccbddd77c9bcd7e7286f837d70c4e9b77222`, `0x9ff509452e3acd6c01a9b1238214f94f75df86a3`                                                                                                                                     | Arithmetic model and encrypted vectors; ACL runtime matching; persistent compute; owner viewer-only decrypt; transient expiry; cross-spike, cross-chain, type, replay, and unauthorized access rejection       | G1 passed. All feasibility contracts have no asset custody; F-003 constrains future owner-input submission flows.                   |
| G2   | `passed`  | Sepolia write and read           | `evidence/offline/G2/FND-04.json`, `evidence/sepolia/G2/FND-04.json`, `evidence/reports/G2-summary.md`, `evidence/reports/G2-FND-04-callback-acl-finding.md`                                                                      | `9272afb`, `8b22d20`, `d717cd3`, `580bd4d`                                                                                                                                                                                                                  | `11155111` / `11378127–11378163` | Fixture `0x6b086f12ed4b928583d0d7fd6b5fb4de78109a8a`; wrapper `0x8b4fe02e95401e93ba99e63baee01eea0b4b3b17`; spikes `0x95641e6ce307ad326c204f693cab7fc3c6a66f62`, `0xa06356982e89d4dc81f4c1191e864ee99d5b90c8`, `0x42387ac03ee2aa8a8ec0aac355e67bf76506704a`                                                                                              | Runtime/template and binding checks; matching intent acceptance; atomic mismatch refund; scoped ACL; one-time return; unwrap, proof finalization, rewrap, recovery, replay and invalid-state rejections        | G2 passed. A separately documented pre-fix valueless fixture residue is excluded from all production or future feasibility custody. |
| G3   | `running` | Sepolia write and read           | `evidence/offline/G3/FND-05-BELOW-K.json`, `evidence/sepolia/G3/FND-05-BELOW-K.json`, `evidence/offline/G3/FND-05-TIMEOUT.json`, `evidence/sepolia/G3/FND-05-TIMEOUT.json`, `evidence/reports/G3-FND-05-timeout-retry-finding.md` | `e4ad2bf`, `2ce876f`, `e721a91`, `76756cc`, `294640a`, `cc2b438`, `8dc7283`, `1d1c69f`, `9d3e5fb`, `ecefae9`, `715bef5`, `354bb2d`, `5d719a7`, `3220b80`, `7fb9f7a`, `2a05bbe`, `117cbaf`, `496f9ea`, `9740e9a`, `8bdd012`, `c4dc363`, `62aecd6`, `f1b1026` | `11155111` / `11378261–11380119` | Earlier fixture locations are recorded in the report; terminal FND-05A and FND-05B fixtures; non-terminal FND-05C fixture `0x60a87c453107ac0ead37940b727baa58c51949fc`, wrapper `0x8290cb8fb05e3873f744eb8c2ce5a5c7395e27a2`, recovery spike `0xbc1e525dedfa10eefb416ea89e6aef8cd4039878`, and context peer `0x9fddf9c438f005ab5eb0122522117fee9d7dbcf4` | FND-05A and FND-05B passed. FND-05C remains `Open` with two finalized members and no aggregate disclosure; a faulty resume added deterministic wrapper collateral but made no recovery-spike state transition. | Correct and resume the recorded FND-05C fixture; proof-context and delayed rewrap recovery remain required.                         |
| G4   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G5   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G6   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G7   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G8   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |

### G3 active checkpoint

The G3 row remains `running`. Its FND-05C detail is superseded by the latest
append-only ledger entries from `5116871`: the recorded recovery spike is
`AGGREGATE_PENDING` after successful `closeEpoch` and
`requestAggregateDecrypt` at blocks `11380145` and `11380146`; cross-pool and
wrong-chain `finalizeAggregate` receipts reverted at blocks `11380148` and
`11380149`. The fixture is not terminal and remains excluded from G3 evidence until
the remaining proof, delayed rewrap, and refund checks complete.

The next three append-only records from `08bae1f` at blocks `11380176`, `11380177`,
and `11380179` are the real wrong-context reverts for the same FND-05C spike. They
do not change its `AGGREGATE_PENDING` state and do not by themselves complete any
remaining FND-05C requirement.

The subsequent `9f928f0` retry added only repeated expected-revert receipts and
left the spike `AGGREGATE_PENDING`. A local ignored marker reports an
`EstimateGasExecutionError` before the valid finalization broadcast. This is not
contract or Nox evidence; the valid finalization must use the next committed bounded
fixed-gas path and obtain a successful Sepolia receipt.

The `6a9b6a6` retry broadcast its fixed-gas valid finalization and reverted after
318301 gas, so it is not an out-of-gas result. The subsequent serialized retry from
`35aadab` repeated the expected context and substituted-plaintext reverts at blocks
`11380260` through `11380263`; its valid finalization again reverted after 318301
gas at block `11380264`. The fixture remains `AGGREGATE_PENDING`.

A read-only Sepolia diagnostic then verified that freshly retrieved YES and NO proofs
each validate directly in Nox Compute, decode to a 32-byte result, and match the
declared aggregate. It also confirmed the recovery spike has persistent access to
the aggregate amount and the wrapper has persistent access to its balance. The
configured public RPC does not return the nested revert selector. ADR-014 therefore
authorizes one sanitized on-chain classifier call before any more repeated proof
attempts; its result cannot count as FND-05C completion.

The classifier deployment at block `11380349` and its single target call at block
`11380351` produced `NoxUnauthorizedSender` while preserving
`AGGREGATE_PENDING`. ADR-015 identifies the invalid post-unwrap ACL mutation: the
wrapper creates the unwrap-request handle, so the recovery spike cannot grant itself
access to it. The corrected source removes that call. The pre-fix fixture is excluded
from post-fix evidence. Its timeout cancellation and both owner refunds succeeded at
blocks `11380418` through `11380420`; the terminal read at block `11380433` found
`Refundable` state and confidential owner custody, and the local secondary recovery
record was deleted. The cleanup artifact is
`evidence/sepolia/G3/FND-05C-STALE-FIXTURE-RECOVERY.json`. A fresh corrected fixture
must now complete all FND-05C requirements.

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
