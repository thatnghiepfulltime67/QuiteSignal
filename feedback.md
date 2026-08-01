# iExec Nox feedback

QuietSignal integrates the pinned iExec Nox packages on Ethereum Sepolia. This
feedback is based on the repository's reproducible feasibility and lifecycle
work, not on a mock implementation. The detailed, sanitized report is in
[`docs/operations/nox-feedback.md`](docs/operations/nox-feedback.md).

## Environment

- Network: Ethereum Sepolia (`chainId 11155111`)
- Nox protocol contracts: `@iexec-nox/nox-protocol-contracts@0.2.4`
- Confidential contracts: `@iexec-nox/nox-confidential-contracts@0.2.2`
- Handle client: `@iexec-nox/handle@0.1.0-beta.13`
- Reproduction commands: `npm run test:nox:sepolia -- --dry-run`, the named
  Sepolia work-item runners in `package.json`, and the read-only evidence
  verifiers documented in [`docs/verification.md`](docs/verification.md).

## Findings and impact

The integration exposed seven actionable findings: an Ethers runtime dependency
for the Viem-only Handle import, delayed public-decrypt availability, caller-bound
external-input proofs, missing transient access on ERC-7984 callback values, the
need for encrypted intent binding, and two wrapper transient-ACL requirements.
The final FND-04 resolution uses caller-bound encrypted intent, atomic mismatch
refund, and transaction-scoped ACL. F-001 through F-007 contain the exact
reproduction, expected/actual behavior, impact, workaround, and upstream context.

No private keys, wallet signatures, confidential plaintext, raw handles, proofs,
or unsanitized traces are included in this report.
