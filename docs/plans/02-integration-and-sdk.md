# P2 — Integration and SDK

## Prerequisite

P1 is complete.

## Tasks

- [ ] Implement the immutable public-market adapter selected in P0.
- [ ] Implement branded SDK types and decimal-safe input normalization.
- [ ] Implement encryption, domain binding, transaction preparation, and owner decryption.
- [ ] Implement public read client and independent verifier package.
- [ ] Implement permissionless relayer jobs with opaque payload schemas and redacted logs.
- [ ] Deploy a clean Sepolia environment and record the manifest.
- [ ] Run a multi-user signal → aggregate → execute → settle → score/claim lifecycle.
- [ ] Run k-failure, timeout, recovery, replay, and slippage scenarios on Sepolia.

## Verification

- SDK test vectors and ABI compatibility tests.
- Adapter target code-hash checks.
- Clean-environment deployment and read-only verifier run.
- No confidential plaintext in relayer inputs or logs.

## Exit criteria

A third party can reproduce the Sepolia lifecycle using documented commands and
verify I1–I10 from public evidence without privileged access.
