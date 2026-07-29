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
