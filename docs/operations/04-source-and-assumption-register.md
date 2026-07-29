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

| Assumption | Verification | Decision if false |
|---|---|---|
| Sepolia protocol mapping is current | Pinned SDK source and live bytecode | Stop deployment and update config |
| Owner viewer ACL survives settlement | Cross-transaction live test | Remove private score or redesign receipt |
| Aggregate public decrypt is reliable | Multi-user Sepolia spike | Reject the batching model |
| Confidential collateral can cross the adapter boundary | Exact unwrap/proof conservation test | Select a supported asset boundary |
| Target protocol is deployable and callable | Minimal adapter test | Select another open protocol |

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
