# Evidence ledger

This ledger records proof that gates passed. It must never contain confidential
plaintext, raw handles, proofs, private RPC credentials, wallet signatures, keys,
seed phrases, environment dumps, or unsanitized terminal history.

## Ledger

| Gate | Status           | Environment                             | Evidence artifact                                                                                                                                                                                                                                                                                                                                 | Commit                                                                      | Chain/block                                                        | Public tx/address references                                                                                                                                                                                                                                                                                                    | Verified checks                                                                                                                                                                                                                                                             | Notes                                                                                                                                         |
| ---- | ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| G0   | `passed`         | offline / Sepolia read                  | `evidence/offline/G0/FND-01.json`, `evidence/reports/G0-summary.md`                                                                                                                                                                                                                                                                               | `6f562e2`                                                                   | `11155111` / `11377462`                                            | NoxCompute `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`                                                                                                                                                                                                                                                                         | Frozen installs ×2, compile, format, secret/dependency scans, budget validation, Sepolia read preflight                                                                                                                                                                     | No write; R-16 remains open for G8 closure                                                                                                    |
| G1   | `passed`         | offline / Sepolia write and read        | `evidence/offline/G1/FND-02.json`, `evidence/sepolia/G1/FND-02.json`, `evidence/offline/G1/FND-03.json`, `evidence/sepolia/G1/FND-03.json`, `evidence/reports/G1-summary.md`, `evidence/reports/G1-FND-03-input-proof-finding.md`                                                                                                                 | `bd3217a`, `a7c66c3`, `02365db`, `21acef7`, `ee243ec`, `f13bfb6`, `09cecd5` | `11155111` / `11377593–11377822`                                   | ArithmeticSpike `0x8dfb2d7d7a2608ee7cd78983fbe28cce00e1d4a4`; FND-03 spikes `0x28a969018975fb40aed0bfa98f6d1c3023b6a7da`, `0xe6acccbddd77c9bcd7e7286f837d70c4e9b77222`, `0x9ff509452e3acd6c01a9b1238214f94f75df86a3`                                                                                                            | Arithmetic model and encrypted vectors; ACL runtime matching; persistent compute; owner viewer-only decrypt; transient expiry; cross-spike, cross-chain, type, replay, and unauthorized access rejection                                                                    | G1 passed. All feasibility contracts have no asset custody; F-003 constrains future owner-input submission flows.                             |
| G2   | `passed`         | Sepolia write and read                  | `evidence/offline/G2/FND-04.json`, `evidence/sepolia/G2/FND-04.json`, `evidence/reports/G2-summary.md`, `evidence/reports/G2-FND-04-callback-acl-finding.md`                                                                                                                                                                                      | `9272afb`, `8b22d20`, `d717cd3`, `580bd4d`                                  | `11155111` / `11378127–11378163`                                   | Fixture `0x6b086f12ed4b928583d0d7fd6b5fb4de78109a8a`; wrapper `0x8b4fe02e95401e93ba99e63baee01eea0b4b3b17`; spikes `0x95641e6ce307ad326c204f693cab7fc3c6a66f62`, `0xa06356982e89d4dc81f4c1191e864ee99d5b90c8`, `0x42387ac03ee2aa8a8ec0aac355e67bf76506704a`                                                                     | Runtime/template and binding checks; matching intent acceptance; atomic mismatch refund; scoped ACL; one-time return; unwrap, proof finalization, rewrap, recovery, replay and invalid-state rejections                                                                     | G2 passed. A separately documented pre-fix valueless fixture residue is excluded from all production or future feasibility custody.           |
| G3   | `passed`         | Sepolia write and read                  | `evidence/offline/G3/FND-05-BELOW-K.json`, `evidence/sepolia/G3/FND-05-BELOW-K.json`, `evidence/offline/G3/FND-05-TIMEOUT.json`, `evidence/sepolia/G3/FND-05-TIMEOUT.json`, `evidence/offline/G3/FND-05-RECOVERY.json`, `evidence/sepolia/G3/FND-05-RECOVERY.json`, `evidence/{offline,sepolia}/G3/FND-05.json`, `evidence/reports/G3-summary.md` | `ed38e6c`, `4a370c0`, `ae591ca` and this verification slice                 | `11155111` / `11379845–11380573`                                   | FND-05A and FND-05B terminal fixtures are recorded in their artifacts; corrected FND-05C fixture `0x927a2dcb37d6605364a2385fccb1dfc1aa63f41c`, wrapper `0xfe835271300bff1578e52891b9f86e316b4ca3bb`, recovery spike `0x5625f911df84ec43740b036095559e1a9b83a07a`, and context peer `0x072f336b3926559623e2491abec74deb4c5603c6` | Below-k non-disclosure, threshold YES/NO-only disclosure, proof-context/replay/substitution rejection, pre-unwrap timeout, delayed permissionless rewrap recovery, terminal one-time refunds, runtime/binding checks, and receipt-ledger verification passed.               | G3 passed. G4 adapter feasibility is next.                                                                                                    |
| G4   | `passed`         | Sepolia write and read                  | Historical: `evidence/offline/G4/FND-06-TARGET-DISCOVERY.json`, `evidence/sepolia/G4/FND-06-TARGET-DISCOVERY.json`, `evidence/reports/G4-adapter-feasibility.md`; passed: `evidence/{offline,sepolia}/G4/FND-06-RESOLUTION.json`, `evidence/reports/G4-resolution-feasibility.md`                                                                 | `e2f142c`, `da1f122`, and this evidence slice                               | `11155111` / `11380852–11380856`                                   | Chainlink ETH/USD proxy `0x694AA1769357215DE4FAC081bf1f309aDC325306`; four zero-custody spikes `0x954ea2eee31377b694fa947e1e9203d841c42c2e`, `0x7d3ac54ef34823a1f2c0dc2759822a540017bdfd`, `0x918bddffbe32758732fc2c4d61744084486063e7`, and `0xe3b5f1aa2a8d36f2ea8d995caae45c50d03ba885`                                       | Source/license and target runtime/ABI metadata, valid historical round, template/runtime binding, immutable YES/NO outcomes, invalid config, stale/premature rejection, no caller result input, value rejection, zero balances, and independent historical verifier passed. | Original external-market candidates remain historical rejections. ADR-017 zero-custody public resolution is passed; P1 may begin.             |
| G5   | `passed`         | offline / Sepolia write and read        | `evidence/{offline,sepolia}/G5/PK-03A-ADAPTER.json`, `PK-03B-FACTORY.json`, `PK-04-COMMIT.json`, `PK-05-AGGREGATE.json`, `PK-06-RESOLUTION.json`, `PK-07-TERMINALS.json`, `PK-08-VERIFIER.json`, and `G5-PROTOCOL.json`                                                                                                                           | `a41bebe` and named component commits                                       | `11155111` / `11381157–11382884`                                   | PK-07 fixture `0x9a1a3b3e99954caa92e2a498523d93cbb38178b6`, claim pool `0xBb7624e1b84d3BEEbccA0BaA0b4DC6B9c149139d`, refund pool `0xb30241600205771BBE9BdB9e621c4B7B33759908`                                                                                                                                                   | Seven independent named component reports, 10,000 deterministic model vectors, live invalid-state rejection, immutable adapter settlement, terminal confidential transfers, runtime/binding/receipt checks, and combined mutation-safe verification                         | G5 passed; reports retain public facts only.                                                                                                  |
| G6   | `passed`         | offline aggregation of Sepolia evidence | `evidence/sepolia/G6/G6-PROTOCOL.json` and its sixteen named G6 component artifacts                                                                                                                                                                                                                                                               | `c16a2c3` and this evidence slice                                           | `11155111` / `11382930–11383785`                                   | Canonical deployment, LIVE-01, LIVE-02, and AUT-01 public pool/receipt references are retained in the component artifacts                                                                                                                                                                                                       | Exact artifact set and work-item binding; all-true component checks; reachable source commits; sanitized schema; settled two-owner lifecycle; below-k and timeout recovery; public relayer action sequence                                                                  | Read-only aggregation; no new chain write. P2 is complete and P3 may begin.                                                                   |
| G7   | `user_confirmed` | web-live / operator attestation         | `evidence/sepolia/G7/WEB-08-USER-ATTESTATION.md`                                                                                                                                                                                                                                                                                                  | `2373a42`                                                                   | Sepolia / production deployment `dpl_BuKoH6mKTf6ZybFCe7aKPszMfRM4` | Production frontend `https://quitesignal.vercel.app`                                                                                                                                                                                                                                                                            | User-confirmed primary E2E journey with two real Sepolia wallets; sanitized attestation only                                                                                                                                                                                | This is not an independent verifier report and does not claim recovery, wrong-owner ACL, or accessibility coverage beyond the attested scope. |
| G8   | `failed`         | Node 24.18 / Sepolia read               | `evidence/reports/G8-readiness-2026-08-02.md`                                                                                                                                                                                                                                                                                                     | `5896376` and this readiness update                                         | `11155111` / verifier block `11397936`                             | Canonical deployment and Ready production frontend; no new chain write                                                                                                                                                                                                                                                          | Clean-clone install/offline/web/interfaces/build, archive deployment verification, zero-vulnerability dependency scan, evidence verification, and secret scan passed                                                                                                        | Archive RPC, R-16, and clean reproduction are resolved. Final checkpoint deployment and the unattested browser-recovery scope remain open.    |

### G6 component history

SDK-02 is a completed G6 component, not G6 itself. Source commit `a50feb6` added a
Sepolia-only Nox confidential-input smoke and the named execution emitted
`evidence/{offline,sepolia}/G6/SDK-02-CLIENT.json` for pool
`0xbb7624e1b84d3beebcca0baa0b4dc6b9c149139d`. It confirms real Nox input creation,
pool/request context binding, and serialization rejection without persisting a
confidential value, raw encrypted material, credential, or signature. The passed
G6 aggregation includes this component.

SDK-03 is a completed G6 component, not G6 itself. The SDK transaction client
submitted one real encrypted commit to pool
`0x390E27a689bA7c3fC2aa003984b8A923B43A79C1` at block `11382992`; the missing
callback then reached the permissionless no-custody expiry at block `11383000`.
`evidence/{offline,sepolia}/G6/SDK-03-TRANSACTION-CLIENT.json` independently checks
the compiled runtime (with immutable references normalized), public reader result,
pending-clear event, final OPEN/no-participant state, and receipt references. A
duplicate expiry attempt reverted after the successful expiry and remains recorded
in the spend ledger. Three initial SDK-03 runner entries retain the pre-fix `P1`
phase field, but their immutable work-item ID, source commit, pool receipts, and this
record establish them as P2 setup; the runner now records SDK-03 writes as P2 without
rewriting the append-only history. The passed G6 aggregation includes this component.

DEP-01 is a completed G6 component, not G6 itself. The canonical deployment is
recorded in `deployments/sepolia/quiet-signal.json` and five append-only DEP-01
spend-ledger receipts at blocks `11383118`–`11383123`. The independent verifier
report `evidence/sepolia/G6/DEP-01-DEPLOYMENT.json` passed at block `11383137`: it
verified five observed runtimes, the product wrapper/pool and adapter/pool immutable
bindings, all five successful deployment receipts, and the empty initial epoch at
the manifest's explicit deployment block `11383123`. The manifest verifier's
historical epoch mode prevents normal future lifecycle transitions from invalidating
this deployment baseline. The passed G6 aggregation includes this component.

VER-01 is a completed G6 component, not G6 itself. The public release verifier
source commit `9ca7114` and report
`evidence/sepolia/G6/VER-01-PUBLIC-VERIFIER.json` passed at block `11383180` against
the canonical manifest. In addition to baseline runtime/binding/receipt checks, it
verified factory pool-id/address derivation, ERC-7984 collateral interface support,
immutable adapter/feed configuration, a current valid feed round, and zero adapter
native balance. Its mutation suite rejects factory, collateral, and stale-feed
substitutions without modelling confidential input. The passed G6 aggregation
includes this component.

AUT-01 is a completed G6 component. Source commit `ebdbe73` added the transient
public-result boundary: values and gateway attestations never enter logs or storage,
while the verified calldata encoder may consume them in memory. The fresh AUT-01
pool used the existing wrapper/factory and a new immutable observation adapter. Its
runner submitted exactly one close, aggregate request, and aggregate finalization at
blocks `11383756`, `11383761`, and `11383764`. The read-only
`evidence/sepolia/G6/AUT-01-RELAYER.json` binds each receipt to its frozen selector,
checks success, and observes the two-participant 25/15 public aggregate in
`RESOLUTION_PENDING`. The passed G6 aggregation verifies this component with every
other required P2 component.

IDX-01 is a completed G6 component, not G6 itself. Source commit `1531353` added a
public-event-only mapper and a manifest/runtime-bound read rebuild. The named Sepolia
read at finalized block `11383298` replayed the canonical pool's `EpochOpened` and
below-threshold `EpochClosed` events into a `REFUNDABLE` projection. Its sanitized
checkpoint binds the manifest fingerprint and block hash in
`evidence/sepolia/G6/IDX-01-READ-MODEL.json`. The reducer/reader has no signer,
asset operation, confidential schema, or owner event storage. The passed G6
aggregation includes this component.

LIVE-01 has a completed fresh success execution and public manifest-verifier slice,
not a G6 pass. Its two-owner pool `0xc900494624d7A785503104e7f98bb5C54Df950DB`
has 22 append-only P2 receipts. The generated manifest and independent verifier
report, `evidence/sepolia/G6/LIVE-01-MANIFEST.json` and
`evidence/sepolia/G6/LIVE-01-VERIFIER.json`, passed with the historical initial
epoch at block `11383347` and verification at `11383443`. IDX-01 replayed this
exact manifest into a settled two-participant projection at finalized block
`11383447` in `evidence/sepolia/G6/LIVE-01-READ-MODEL.json`. The separate recovery
family and remaining P2 components remain pending.

LIVE-02 has a completed fresh recovery execution component, not a G6 pass. The
below-k pool `0x53f14f513519e4247E6443fe042495Ebb1839A6F` reached a one-participant
refund terminal path, while the timeout pool
`0x7C7E4428767520A99B2bfb4f196B5558c64efEC8` reached aggregate pending with two
participants, elapsed its immutable timeout, and returned both participants through
the contract terminal path. The public manifests, independent historical verifiers,
and finalized indexer replays are recorded as
`evidence/sepolia/G6/LIVE-02-{BELOW-K,TIMEOUT}-{MANIFEST,VERIFIER,READ-MODEL}.json`.
The below-k projection has one participant and no aggregate request; the timeout
projection retains its aggregate request, has two participants, zero public totals,
and is `refundable` after two state-gated terminal events. The direct read-only
selector/state report `evidence/sepolia/G6/LIVE-02-RECOVERY.json` passed at block
`11383657`: it proves that below-k had no aggregate request, while timeout used one
aggregate request, one cancellation after eligibility, and two terminal receipts.
The passed G6 aggregation includes both recovery cases and their independent
historical/current verification artifacts.

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

PK-04 is now a completed G5 component. Source commits `edc1e60` through `be918fb`
staged one Sepolia write at a time, then `be918fb` read and recorded
`evidence/{offline,sepolia}/G5/PK-04-COMMIT.json` at block `11381565`. The artifact
binds fixture `0x6ddec1152764df0e18ac7de3eecf51a78b3a508d`, unchanged wrapper
`0xf578b307c50950d8bb20bedb827033e9549dcc44`, adapter
`0x5656a86dcb5a52651c441b6ebaf215762953db02`, factory
`0xbf2729bca968f6d91822568a0939706cc66535d8`, and the four accepted/mismatch/
uncalled/callback-timeout pools. It verifies compiled runtime templates, all 22
successful receipts and ledger entries, strict callback boundary rejections, final
owner viewer ACL, terminal confidential conservation, recovery terminal states, and
zero native balances without storing confidential values, handles, or proofs. G5
remains `not_run` until PK-05 through PK-09 and the protocol verifier pass.

PK-05 is a completed G5 component. `evidence/{offline,sepolia}/G5/PK-05-AGGREGATE.json`
records two fresh Sepolia pools and independent verification at block `11381707`:
below-k reached `REFUNDABLE` with no aggregate request or totals, while the
two-member threshold pool proof-finalized only aggregate YES/NO into
`RESOLUTION_PENDING`. The verifier checks 24 successful ledger receipts, pool
bindings, disclosure rejection below k, request context, and zero native balances.

PK-08 is a completed G5 component. The independent public-only verifier passed its
PK-06 fixture manifest at Sepolia blocks `11382600` and `11382602`, recorded as
`evidence/{offline,sepolia}/G5/PK-08-VERIFIER.json`. It re-read seven runtime hashes,
three immutable pool bindings and public epochs, and four successful receipts. Its
offline mutation suite rejects wrong-chain, sensitive-field, missing/stale-runtime,
wrong-binding, wrong-epoch, and failed-receipt inputs. The fixture is not the future
canonical release manifest; PK-08 does not advance G5 until all remaining protocol
components and the combined G5 verifier pass.

G5 completion: PK-07's fresh short fixture passed terminal verification at block
`11382884`; no legacy long-window fixture is included. The completed combined
verifier read all seven named component artifacts and emitted
`evidence/sepolia/G5/G5-PROTOCOL.json` with 65 passing public checks. Its mutation
tests reject missing, failed, wrong-work-item, wrong-chain, and sensitive-field
components. `npm run test:model` also passed the required 10,000 deterministic
domain vectors. G5 is therefore `passed`.

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
