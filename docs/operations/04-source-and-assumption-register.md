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
  contracts, and Hardhat plugin.
- [Nox Hardhat plugin](https://www.npmjs.com/package/@iexec-nox/nox-hardhat-plugin)
  provides the preferred local integration stack for ACL and decryption tests.

## Assumptions requiring P0 evidence

| Assumption | Verification | Decision if false |
|---|---|---|
| Sepolia protocol mapping is current | Pinned SDK source and live bytecode | Stop deployment and update config |
| Owner viewer ACL survives settlement | Cross-transaction live test | Remove private score or redesign receipt |
| Aggregate public decrypt is reliable | Multi-user Sepolia spike | Reject the batching model |
| Confidential collateral can cross the adapter boundary | Exact unwrap/proof conservation test | Select a supported asset boundary |
| Target protocol is deployable and callable | Minimal adapter test | Select another open protocol |

Package versions remain unspecified until P0 creates the verified lockfile.
