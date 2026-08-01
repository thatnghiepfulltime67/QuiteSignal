# G8 release-candidate readiness report

Date: 2026-08-02 (Asia/Ho_Chi_Minh)

Status: **failed — release blockers remain**

This is a sanitized run record. It contains no wallet credentials, confidential
plaintext, encrypted handles, proofs, signatures, RPC credentials, or raw traces.

## Environment

- Source checkpoint: `361a2eb`
- Node: `v24.18.0`
- npm: `11.16.0`
- Chain: Ethereum Sepolia (`11155111`)
- Spend ledger: 714 entries, within the committed allowance

## Checks that passed

| Check | Result |
|---|---|
| `npm run doctor` | Pass; pinned Nox runtime and public Sepolia preflight |
| `npm run check:sepolia:read` | Pass; doctor and budget status within allowance |
| `npm run check:offline` | Pass; format, lint, compile, verifier/SDK/automation/indexer tests, secret scan |
| `npm run test:web` | Pass; 51 tests |
| `npm run test:interfaces` | Pass; 14 tests |
| `npm run build:web` | Pass |
| `npm run verify:evidence` | Pass; G3 read verifier, 47 receipts, 3 recovery slices |
| `npm run scan:secrets` | Pass; tracked files/history clear |
| clean `git archive` → `npm ci` → `npm run compile` → `npm run build:web` | Pass; ignored Hardhat artifacts are now generated before typecheck |
| Vercel production deployment | Pass; `dpl_CUfq8iUNjK1VBbFFZcPeX32Gwf7p` is Ready and `/`, `/markets`, `/portfolio`, `/self-test`, `/position` return HTTP 200 |

## Blockers

1. `npm run verify:protocol:sepolia -- --manifest=deployments/sepolia/quiet-signal.json`
   did not complete against the configured public RPC because the historical
   `eth_call` requires archive access and the provider returned “Archive requests
   require a personal token”. A provider with Sepolia archive support is required
   before deployment verification can be marked passed.
2. `npm run scan:dependencies` reports two high-severity `adm-zip` advisories through
   Hardhat `3.11.1` (R-16). The gate allows a high-risk acceptance only with explicit
   owner approval; no such acceptance is recorded here. No critical advisory was
   reported.
3. G7 is `user_confirmed`, not an independent `passed` gate. The attestation covers
   the owner-operated primary journey with two real wallets only; it does not prove
   recovery, wrong-owner ACL, accessibility, or the complete browser matrix.
4. The worktree is not clean because it contains unrelated user changes in
   `docs/operations/05-local-e2e-video-demo.md` and the untracked user script
   `ops/scripts/patch-node.mjs`. G8 requires a clean source checkpoint.

## Decision

G8 remains failed and P4 must not be marked complete. The next release attempt is
read-only until an archive-capable Sepolia RPC is configured, R-16 is closed or
explicitly accepted by the owner, the missing G7 evidence scope is recorded, and
the final source tree is clean. The competition submission pack is prepared locally
under the ignored `dorahack/` directory; publishing the video, X post, Discord
message, and DoraHacks form remains an owner account action.
