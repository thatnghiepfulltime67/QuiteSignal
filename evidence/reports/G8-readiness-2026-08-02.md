# G8 release-candidate readiness report

Date: 2026-08-02 (Asia/Ho_Chi_Minh)

Status: **not passed — operator-scoped release items remain**

This is a sanitized run record. It contains no wallet credentials, confidential
plaintext, encrypted handles, proofs, signatures, RPC credentials, or raw traces.

## Environment

- Candidate checkpoint: `5896376`
- Node: `v24.18.0`
- npm: `11.16.0`
- Hardhat: `3.12.0`
- Chain: Ethereum Sepolia (`11155111`)
- Spend ledger: 715 entries and within the committed allowance

## Resolved blockers

1. The canonical deployment verifier passed at Sepolia block `11397936` through an
   archive-capable public RPC. It verified runtime hashes, immutable pool bindings,
   the historical deployment epoch, five successful receipts, factory binding,
   collateral interface, adapter/feed configuration, current feed round, and zero
   adapter native custody.
2. Both Hardhat declarations were upgraded from `3.11.1` to `3.12.0`. The resolved
   lockfile uses `adm-zip@0.6.0`; `npm ci`, `npm audit`, compile, interface tests, and
   the license inventory now report zero vulnerabilities or missing licenses.
3. The active web source passed 53 web tests, root typecheck, Solidity compilation,
   14 interface tests, verifier/SDK/automation/indexer suites, production build,
   secret scan, and the G3 live-evidence verifier under the exact Node/npm toolchain.
4. The project owner explicitly confirmed that the complete production browser
   matrix passed with real user-controlled Sepolia wallets, including primary,
   recovery/refund, wrong-owner, reconnect, degraded-service, accessibility,
   responsive, and route paths. P3 and G7 record that scope as `user_confirmed`.
5. A fresh local clone of candidate `5896376` passed exact-toolchain `npm ci`, the
   complete offline gate, secret/history scan, 53 web tests, 14 interface tests, and
   the production web build. The offline gate now compiles Hardhat artifacts before
   typechecking, and `T-REL-04-01` prevents the clean-checkout ordering regression.

## Current production state

The public alias <https://quitesignal.vercel.app> serves the payout-enabled web asset
and returns the application on its direct routes. Vercel deployment
`dpl_A7wBNzYPWuqHGx4dqUyGorXwSNtm` is Ready. Two later CLI deployment attempts,
`dpl_33uPj5emLcaUUJTzkt87nqSnShEt` and
`dpl_45Kt4qAEAeUov5CsfKHoZw8jekx6`, were still reported as `UNKNOWN` and are not used
as release evidence.

## Remaining release items

1. G7 remains `user_confirmed`, not `passed`. The operator attestation now covers the
   complete browser matrix, but Plan policy requires independently replayable
   evidence before an attestation can become a formal gate pass.
2. The final source worktree contains the untracked local file
   `ops/scripts/patch-node.mjs`. It is excluded from Vercel uploads but must be either
   intentionally retained as a reviewed source file or removed by its owner before a
   clean-worktree G8 claim.
3. The ready production deployment predates the final dependency and documentation
   commits. A new Ready deployment from the final clean checkpoint, followed by route
   health checks, remains required for source-to-production release attribution.

## Decision

G8 is not marked passed. The archive-capable RPC, dependency advisory, and clean-clone
reproduction blockers are closed; the remaining actions require the local-file
decision, a Ready deployment of the final checkpoint, and independent G7 evidence.
Competition submission drafts remain under the ignored `dorahack/` directory.
