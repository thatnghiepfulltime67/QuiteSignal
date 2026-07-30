# Source and assumption register

Last reviewed: 2026-07-30

## Competition sources

- The normalized challenge brief is preserved at
  [`01-competition-source/docs/original/user-provided-challenge-brief-normalized.md`](../../01-competition-source/docs/original/user-provided-challenge-brief-normalized.md).
- Technical and submission context is preserved at
  [`01-competition-source/docs/original/discord-context-extract.md`](../../01-competition-source/docs/original/discord-context-extract.md).
- These user-provided snapshots are not independent archives. Official rules and
  deadlines must be checked again during final release preparation.

## Official technical sources

- [iExec documentation](https://docs.iex.ec/) describes Nox confidential computation.
- [Nox npm organization](https://www.npmjs.com/org/iexec-nox?activeTab=packages)
  is the release source for the handle SDK, protocol contracts, confidential
  contracts, and supported development tooling. Package presence does not prove
  Sepolia compatibility; P0 pins exact versions and verifies live behavior.

## Assumptions requiring P0 evidence

| Assumption                                             | Verification                         | Decision if false                        |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------- |
| Sepolia protocol mapping is current                    | Pinned SDK source and live bytecode  | Stop deployment and update config        |
| Owner viewer ACL survives settlement                   | Cross-transaction live test          | Remove private score or redesign receipt |
| Aggregate public decrypt is reliable                   | Multi-user Sepolia spike             | Reject the batching model                |
| Confidential collateral can cross the adapter boundary | Exact unwrap/proof conservation test | Select a supported asset boundary        |
| Target protocol is deployable and callable             | Minimal adapter test                 | Select another open protocol             |

## FND-06 target discovery

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
public market target. The target-protocol assumption is therefore false under the
current Ethereum Sepolia-only constraint; P0 remains blocked.

## FND-01 verified toolchain baseline

Verified on 2026-07-30 from the official npm release metadata and the committed
lockfile:

- Node.js `24.18.0` and npm `11.16.0`;
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

The baseline contains no critical npm advisory. Its current high-severity Hardhat
transitive advisory is tracked as R-16 and must be re-evaluated before G8.

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
