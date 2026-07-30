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
| G3   | `passed`  | Sepolia write and read           | `evidence/offline/G3/FND-05-BELOW-K.json`, `evidence/sepolia/G3/FND-05-BELOW-K.json`, `evidence/offline/G3/FND-05-TIMEOUT.json`, `evidence/sepolia/G3/FND-05-TIMEOUT.json`, `evidence/offline/G3/FND-05-RECOVERY.json`, `evidence/sepolia/G3/FND-05-RECOVERY.json`, `evidence/{offline,sepolia}/G3/FND-05.json`, `evidence/reports/G3-summary.md` | `ed38e6c`, `4a370c0`, `ae591ca` and this verification slice | `11155111` / `11379845–11380573` | FND-05A and FND-05B terminal fixtures are recorded in their artifacts; corrected FND-05C fixture `0x927a2dcb37d6605364a2385fccb1dfc1aa63f41c`, wrapper `0xfe835271300bff1578e52891b9f86e316b4ca3bb`, recovery spike `0x5625f911df84ec43740b036095559e1a9b83a07a`, and context peer `0x072f336b3926559623e2491abec74deb4c5603c6` | Below-k non-disclosure, threshold YES/NO-only disclosure, proof-context/replay/substitution rejection, pre-unwrap timeout, delayed permissionless rewrap recovery, terminal one-time refunds, runtime/binding checks, and receipt-ledger verification passed. | G3 passed. G4 adapter feasibility is next. |
| G4   | `passed` | Sepolia write and read            | Historical: `evidence/offline/G4/FND-06-TARGET-DISCOVERY.json`, `evidence/sepolia/G4/FND-06-TARGET-DISCOVERY.json`, `evidence/reports/G4-adapter-feasibility.md`; passed: `evidence/{offline,sepolia}/G4/FND-06-RESOLUTION.json`, `evidence/reports/G4-resolution-feasibility.md` | `e2f142c`, `da1f122`, and this evidence slice | `11155111` / `11380852–11380856` | Chainlink ETH/USD proxy `0x694AA1769357215DE4FAC081bf1f309aDC325306`; four zero-custody spikes `0x954ea2eee31377b694fa947e1e9203d841c42c2e`, `0x7d3ac54ef34823a1f2c0dc2759822a540017bdfd`, `0x918bddffbe32758732fc2c4d61744084486063e7`, and `0xe3b5f1aa2a8d36f2ea8d995caae45c50d03ba885` | Source/license and target runtime/ABI metadata, valid historical round, template/runtime binding, immutable YES/NO outcomes, invalid config, stale/premature rejection, no caller result input, value rejection, zero balances, and independent historical verifier passed. | Original external-market candidates remain historical rejections. ADR-017 zero-custody public resolution is passed; P1 may begin. |
| G5   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G6   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G7   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |
| G8   | `not_run` | —                                | —                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                           | —                                | —                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                              | —                                                                                                                                   |

### G5 partial history

PK-03A is a completed G5 component, not G5 itself. The source commit `4ef78df`
deployed four zero-custody Chainlink adapters before its runner failed to create the
missing G5 evidence directories. A follow-up source commit redundantly deployed a
second stale/premature pair, completed the full read-only post-deployment checks,
and wrote `PK-03A-ADAPTER` as the passed component artifact. The append-only
`PK-03A-ADAPTER-PARTIAL` artifacts and spend ledger retain all six receipts and the
zero-balance recovery conclusion. G5 remains `not_run` until the complete protocol
lifecycle suite and verifier report pass.

PK-03B is a completed G5 component, not G5 itself. Source commit `d0a125d`
deployed a fresh immutable adapter, permissionless factory, and deterministic pool
shell at Sepolia blocks `11381154` through `11381156`; read verification completed
at block `11381157`. `evidence/{offline,sepolia}/G5/PK-03B-FACTORY.json` records the
runtime bindings, deterministic pool id/address, immutable configuration, initial
`OPEN` epoch, all named configuration rejections, zero native balances, and absence
of any confidential callback or transfer. G5 remains `not_run` until the complete
confidential lifecycle and verifier suite pass.

PK-04 partial history: Source commit `9d986fb` recorded three successful Sepolia
deployments before the runner entered its later custody branches: valueless fixture
`0x9e2d1b5c8de8a774de20c76402e0ca05acf3b0da`, unchanged wrapper
`0x3aede623df09d33c1f33a5c46953920b6ac10a50`, and zero-custody adapter
`0x8bd72fb95ad3312b6c71420831f422dc4d39a875`. It then deployed factory
`0xda40842629be6da6087640e64253ec222ced89c9`, accepted pool
`0x1caab9d1f4182d9791ccccef56e8f4ebbaf5b57f`, and a single encrypted commitment
at blocks `11381269` through `11381278`; that pool's collateral is confidential pool
custody. Mismatch and timeout evidence is absent, so these receipts are partial
spend history only until the bounded resume completes its named custody cases.

### G3 completion history

The G3 row is `passed`. The historical FND-05C detail below is superseded by the latest
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

The fresh corrected fixture is `Open` with two accepted members after setup and
commitments at blocks `11380443` through `11380463`; its recovery spike is
`0x5625f911df84ec43740b036095559e1a9b83a07a`. A sanitized local `TypeError` stopped
the initial runner before close, aggregate request, proof handling, unwrap, recovery,
or refunds. The committed resume dry run verifies the fixture, wrapper, recovery
spike, and no-custody context peer still match the corrected runtime and exact
resumable state. This partial fixture remains excluded from G3 evidence until its
terminal sequence completes.

The corrected fixture then reached `UNWRAP_PENDING` at block `11380493` after valid
aggregate finalization. A replayed proof reverted at block `11380495` and early
permissionless unwrap recovery reverted at block `11380496`. Its remaining funds are
at the documented wrapper burn-pending location. A sanitized local observation
`TypeError` stopped before the delayed recovery, without a new custody transition.
The next committed resume accepts only this state and completes delayed recovery,
rewrap, and both refunds without replaying setup or aggregate proof checks.

The bounded terminal resume completed delayed permissionless unwrap finalization
and rewrap at block `11380523`, then both confidential owner refunds at blocks
`11380524` and `11380527`; the two duplicate-refund attempts reverted at blocks
`11380526` and `11380528`. The corrected fixture is terminal `Refundable`, reports
the YES/NO/total ACL tuple `true,true,false`, measured released collateral `100`,
zero public spike balance, and confidential pool custody. The local secondary
recovery record is absent. `npm run verify:evidence -- G3` independently passed at
block `11380652`, validating all three terminal slice artifacts, historical runtime
hashes and corrected runtime templates/bindings, 47 receipt statuses and their
spend-ledger entries, terminal state reads, and source commit reachability.
Sanitized FND-05C and combined G3 artifacts now complete the gate.

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
