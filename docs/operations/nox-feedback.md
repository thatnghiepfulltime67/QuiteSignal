# Nox integration feedback

This report is intentionally empty until implementation begins. Each finding must
include date, exact package version, network, minimal reproduction, expected and
actual behavior, user impact, workaround, and upstream issue or support link.

## Finding template

### F-XXX — Title

- Date:
- Package/network:
- Reproduction:
- Expected:
- Actual:
- Impact:
- Workaround:
- Upstream reference:

Do not include keys, confidential plaintext, handles, proofs, or wallet signatures.

### F-001 — Viem-only Handle client import requires Ethers runtime dependency

- Date: 2026-07-30
- Package/network: `@iexec-nox/handle@0.1.0-beta.13`, Ethereum Sepolia dry-run
- Reproduction: Run `npm run test:nox:sepolia -- FND-02 --dry-run` with only the
  documented Viem dependency installed.
- Expected: A Viem Handle client can initialize without resolving the Ethers-only
  implementation.
- Actual: The package entrypoint eagerly imports `EthersBlockchainService`, and
  Node fails module resolution because `ethers` is not installed.
- Impact: A Viem-only test or application cannot initialize the Handle SDK.
- Workaround: Pin `ethers@6.17.0` as an explicit workspace development dependency.
- Upstream reference: Package source entrypoint and README in the pinned npm release.

### F-002 — Public decryption may arrive after the SDK's default retry window

- Date: 2026-07-30
- Package/network: `@iexec-nox/handle@0.1.0-beta.13`, Ethereum Sepolia
- Reproduction: Run the FND-02 encrypted batch, then request its public boolean
  assertions immediately after the transaction receipt.
- Expected: A completed Sepolia computation is available to `publicDecrypt` within
  the SDK's retry window.
- Actual: The first request exhausted that window; the same public assertion became
  available to a sanitized read-only probe shortly afterwards.
- Impact: A valid feasibility run can be reported as failed before gateway sync
  completes.
- Workaround: The FND-02 runner uses a bounded outer retry and can read-only verify
  an existing harness only when its runtime bytecode matches the compiled artifact.
- Upstream reference: `publicDecrypt.ts` retry configuration in the pinned package.

### F-003 — External input proof owner must be the application caller

- Date: 2026-07-30
- Package/network: `@iexec-nox/nox-protocol-contracts@0.2.4` and
  `@iexec-nox/handle@0.1.0-beta.13`, Ethereum Sepolia
- Reproduction: Encrypt an external input with test actor A for an isolated
  application, then submit its import transaction from distinct test actor B.
- Expected: The proof binding must make the permitted submitter explicit and reject
  a mismatched owner/caller relationship.
- Actual: Sepolia simulation reverted with Nox `InvalidProof` before state change.
  The pinned Compute implementation verifies the proof owner against the caller of
  the importing application function.
- Impact: A relayer cannot directly submit an owner-bound encrypted input on the
  owner's behalf. Product flows must have the owner submit the import transaction,
  or use an explicitly designed protocol flow that preserves the required binding.
- Workaround: The FND-03 harness encrypts and submits the owner input from the same
  throwaway account, then separately proves the owner has viewer-only access to the
  derived handle. The production design remains subject to the same constraint.
- Upstream reference: `Compute.validateInputProof` in the pinned Nox contracts.

### F-004 — ERC-7984 callback amount lacks receiver compute access

- Date: 2026-07-30
- Package/network: `@iexec-nox/nox-confidential-contracts@0.2.2` and
  `@iexec-nox/nox-protocol-contracts@0.2.4`, Ethereum Sepolia
- Reproduction: Wrap isolated fixture collateral, then call
  `confidentialTransferAndCall` with an encrypted amount to a receiver that performs
  a Nox operation on the callback's `amount` handle.
- Expected: The documented callback amount is accessible to the receiver during the
  callback.
- Actual: Sepolia gas simulation reverted with the receiver's
  `MissingTransientAccess` error. The wrapper updates the recipient's confidential
  balance before the callback, but does not grant compute access to the callback
  `amount` handle.
- Impact: A pool cannot use the callback argument itself as its encrypted stake
  record. Treating it as usable would fail live and could tempt an unsafe plaintext
  fallback.
- Workaround: The receiver reads its confidential wrapper balance, for which the
  wrapper grants recipient access, and derives the received encrypted delta from its
  prior balance. This remains subject to the complete FND-04 Sepolia lifecycle test.
- Upstream reference: `ERC7984Base._transferAndCall` and
  `ERC7984Utils.checkOnTransferReceived` in the pinned package.
