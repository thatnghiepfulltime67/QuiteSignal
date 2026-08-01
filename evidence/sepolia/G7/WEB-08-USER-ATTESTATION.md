# G7 operator attestation

Status: `user_confirmed`

Attestation date: 2026-08-02 (Asia/Ho_Chi_Minh)

Attestor: QuietSignal project owner, confirmed in the active workspace conversation.

Deployment under test: https://quitesignal.vercel.app

Vercel deployment: `dpl_A7wBNzYPWuqHGx4dqUyGorXwSNtm`

Source attribution: the production alias served the payout-enabled web assets from
the current web source. The Vercel deployment has no Git commit attribution, so this
attestation does not assert an exact deployment commit.

## Confirmed scope

The operator confirmed that the complete production browser test matrix passed on
the deployed application using real user-controlled Ethereum Sepolia wallets. The
confirmed scope includes:

- the two-wallet primary success journey, including test-asset preparation,
  browser-local encrypted signal submission, lifecycle progression, aggregate and
  resolution observation, owner-only reveal, score materialization, and claim;
- below-threshold refund and timeout/recovery branches;
- wrong-owner access denial and masked private state;
- reload, wallet reconnect, account-change, and chain-change behavior;
- RPC, indexer, relayer, and gateway degraded-state handling, including documented
  direct-read and permissionless recovery paths; and
- keyboard, screen-reader, responsive-layout, and production-route checks.

This attestation records the operator's confirmation only. It contains no wallet
addresses, transaction signatures, private keys, confidential plaintext, raw Nox
handles, proofs, or unsanitized browser traces.

## Attestation boundary

This is the project owner's dated attestation, not an independently replayable
browser trace or verifier report. In accordance with the execution plan, it remains
`user_confirmed` and does not by itself convert G7 into an independent `passed`
gate. Automated web checks, existing Sepolia receipts, and public deployment reads
remain separate supporting evidence.
