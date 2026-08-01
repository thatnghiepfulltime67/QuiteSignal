# Source and assumption register

Last reviewed: 2026-08-02

## Official technical sources

- [iExec documentation](https://docs.iex.ec/) describes Nox confidential computation.
- [Nox npm organization](https://www.npmjs.com/org/iexec-nox?activeTab=packages)
  is the release source for the handle SDK, protocol contracts, confidential
  contracts, and supported development tooling. Package presence does not prove
  Sepolia compatibility; P0 pins exact versions and verifies live behavior.

## Assumptions requiring P0 evidence

| Assumption                                           | Verification                          | Decision if false                         |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| Sepolia protocol mapping is current                  | Pinned SDK source and live bytecode   | Stop deployment and update config         |
| Owner viewer ACL survives settlement                 | Cross-transaction live test           | Remove private score or redesign receipt  |
| Aggregate public decrypt is reliable                 | Multi-user Sepolia spike              | Reject the batching model                 |
| Confidential collateral remains in pool custody      | Exact pull/payout/refund conservation | Stop if a third party receives collateral |
| Target feed is callable and objectively normalizable | Minimal resolution-adapter test       | Select another open protocol              |

## FND-06A original target discovery

The official [Gnosis Conditional Tokens repository](https://github.com/gnosis/conditional-tokens-contracts)
documents LGPL-3.0 source and deployments on Ethereum mainnet, xDai, and Rinkeby;
it does not document an Ethereum Sepolia deployment. The official [Uniswap v3
deployment index](https://developers.uniswap.org/docs/protocols/v3/deployments)
does not list Ethereum Sepolia and describes exchange contracts rather than binary
conditional resolution/redemption. Both candidates therefore fail at least one
mandatory G4 dimension.

The official [UMA Optimistic Oracle documentation](https://docs.uma.xyz/developers/optimistic-oracle/getting-started)
supports a public Sepolia testnet flow, and its [prediction-market
documentation](https://docs.uma.xyz/developers/optimistic-oracle-v3/prediction-market)
is a separate example. The live Sepolia oracle address and runtime are recorded in
the FND-06A artifact. Official network guidance describes Sepolia as testnet-only
without a DVM. This is insufficient to prove deterministic disputed resolution,
aggregate market execution with price slippage, or redemption against an unchanged
public market target. The original target-protocol assumption was false under the
prior external-market definition. This historical result remains evidence for
ADR-016; it is superseded for active work by the user-authorized ADR-017 boundary.

## FND-06B direct price-feed resolution

ADR-017 evaluates the canonical Chainlink ETH/USD price-feed proxy at
`0x694AA1769357215DE4FAC081bf1f309aDC325306` on Ethereum Sepolia. Chainlink's
official [Data Feeds documentation](https://docs.chain.link/data-feeds) describes
the proxy/aggregator integration model, and the official
[Chainlink repository](https://github.com/smartcontractkit/chainlink) provides the
open target implementation source. FND-06B must independently verify the proxy's
runtime code hash, ABI response shape, pair metadata, decimals, positive current
answer, complete round, and freshness on Sepolia. This entry does not assert that
the target has passed G4.

The target is an explicit external oracle dependency, not a custody protocol. A
QuietSignal pool will bind a feed address, comparison direction, threshold,
observation-not-before timestamp, maximum feed age, and resolution grace deadline
immutably. The pool never transfers collateral to the proxy. A stale or invalid feed
round must prevent settlement and eventually reach the pool's confidential refund
path; it cannot be replaced by an operator-selected outcome.

FND-06B passed at Ethereum Sepolia blocks `11380852` through `11380856`. The target
proxy runtime hash was
`0x9190afba2a699a9627d64ed68c7cc60e4005a8830b33183c4413b4e1a93b9ccd`; the observed
historical round had 8 decimals, description `ETH / USD`, a positive answer, a
complete round id, and an update age of 816 seconds. Four immutable no-custody
spikes proved both threshold outcomes and the stale, premature, invalid-config, and
value-transfer negative cases. `npm run verify:g4:evidence` independently rechecks
that record. This proves integration feasibility only; P1 still must prove product
state, confidential payout, and resolution-grace refund behavior.

## FND-01 verified toolchain baseline

Verified on 2026-07-30 from the official npm release metadata and the committed
lockfile:

- Node.js `24.18.0` and npm `11.16.0`;
- Vite `8.2.0` as a pinned build-only dependency for the browser workspace;
- `@iexec-nox/nox-protocol-contracts@0.2.4`;
- `@iexec-nox/nox-confidential-contracts@0.2.2`;
- `@iexec-nox/handle@0.1.0-beta.13`;
- Hardhat `3.11.1`, Solidity `0.8.35` with the Cancún EVM target and `viaIR`,
  Ethers `6.17.0`, TypeScript `6.0.2`, Viem `2.55.10`, Prettier `3.9.6`, and
  `prettier-plugin-solidity@2.3.1`.

The Nox protocol SDK maps Ethereum Sepolia (`11155111`) to
`0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`. The committed doctor command
rechecks the chain ID and confirms that this address has runtime code without
printing RPC configuration values.

The original feasibility baseline contained no critical npm advisory and retained a
high-severity Hardhat transitive advisory as R-16. Release hardening upgraded both
workspace declarations to Hardhat `3.12.0` on 2026-08-02. That release uses
`adm-zip@0.6.0`; exact-toolchain clean install, compile, interface tests, license
inventory, and `npm audit` passed with zero vulnerabilities. Historical evidence keeps
the version used when it was produced and is not rewritten.

## Browser public-read transport

The browser's wallet-free lifecycle view uses the public Ethereum Sepolia JSON-RPC
endpoint `https://ethereum-sepolia-rpc.publicnode.com`, already used by the
repository's read-only doctor fallback. It is not a source of protocol truth, a
custody provider, a signer, an indexer, or a confidential-data service: the browser
queries only the manifest-bound pool's public `config` and `epoch` views. ADR-022 and
R-24 record the availability and IP/public-query metadata limitation. The browser
must show a retryable degraded state on transport failure and must not replace a
failed read with a fixture or static lifecycle claim.

After an explicit wallet connection, global market discovery also uses that existing
EIP-1193 provider to read only the manifest-bound factory's public `PoolCreated` logs,
blocks, bytecode, mappings, and immutable configurations. This avoids adding a hosted
indexer or another runtime endpoint. Provider log retention and range limits are
operational assumptions, so the browser chunks requests, revalidates every candidate,
preserves the static verified registry on failure, and never claims a failed scan is
complete. ADR-035 and R-27 define this boundary.

## FND-02 verified arithmetic feasibility

The isolated arithmetic spike passed direct Ethereum Sepolia verification for the
pinned Nox runtime. The encrypted vector batch covered clamp, allocation,
absolute-difference, square, and Brier-score comparisons without committed
plaintext or asset custody. Public decryption was limited to test equality and
safety booleans. This result does not prove persistent ACL behavior; FND-03 remains
the required G1 follow-up.

## FND-03 verified ACL feasibility

The isolated ACL spike passed direct Ethereum Sepolia verification for persistent
pool-only compute authority, owner viewer-only decryption across transactions, and
one-transaction transient recipient access. The owner-shaped derived handle could
not be public-decrypted; unauthorized wallet, keeper, adapter, token, and transient
recipient compute attempts were rejected. The runner also rejected replayed,
cross-spike, cross-chain, wrong-type, and uninitialized encrypted inputs. F-003
records the mandatory proof-owner/application-caller binding. This result has no
asset custody and does not replace the required FND-04 asset-lifecycle feasibility
evidence.

## FND-04 verified confidential-asset feasibility

The isolated FND-04 Sepolia run proved that the unchanged wrapper can complete an
intent-bound encrypted pull, atomic refund for a mismatched encrypted intent,
one-time owner return, unwrap proof finalization, measured public balance delta,
delayed rewrap, and terminal read-only verification. The callback amount is not
receiver-computable (F-004), so the receiver uses a caller-bound encrypted intent
and post-transfer delta. The wrapper receives only transient access to the callback
equality boolean (F-006) and a held amount while consuming it (F-007). Amount-free
acceptance proof, owner-balance non-disclosure, replay rejection, and recovery all
passed on Sepolia. G2 is passed; R-17 must be reapplied to the P1 product contract.

F-007 records one isolated, valueless fixture residue at
`0x5a6cd68e2ee9aef073e7f95354fa9d0b7d7cb210`: a pre-fix feasibility spike
accepted fixture collateral but cannot call the wrapper without the subsequently
identified transient ACL grant. It is not a product contract, has no external value,
and is excluded from all future runs. The live runner snapshots the remaining owner
balance in memory and proves subsequent conservation relative to that baseline.
