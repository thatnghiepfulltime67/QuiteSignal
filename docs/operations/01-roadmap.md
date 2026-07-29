# Delivery roadmap

This document describes strategic sequencing. Task status and executable slices are
owned by [`Plan.md`](../../Plan.md) and the files under [`docs/plans/`](../plans/README.md).

## Phase 0 — Feasibility gates

Exit criteria:

- Pin and inspect current Nox package versions and Sepolia addresses.
- Prove external input encryption, owner viewer ACL, aggregate public decrypt,
  confidential token transfer, and cross-transaction handle reuse on Sepolia.
- Confirm the public market adapter can execute and settle without modifying the
  target protocol.
- Record failures and workarounds in `nox-feedback.md`.

No product implementation proceeds if any load-bearing primitive fails without a
safe alternative.

## Phase 1 — Protocol kernel

- Implement pure epoch state machine and error taxonomy.
- Implement pool, adapter interface, deterministic test adapter, and token boundary.
- Add invariants I1–I10, property tests, fuzz tests, and the official Nox Hardhat integration stack.
- Build read-only verifier before the frontend.

Exit: full local commit → aggregate → execute → settle → claim/refund cycle passes.

## Phase 2 — Real integration and SDK

- Implement one immutable public-market adapter.
- Build typed SDK and browser Nox client.
- Deploy test contracts, seed a multi-user Sepolia epoch, and verify invariants.
- Commit deployment manifest, ABI hashes, and transaction evidence.

Exit: repeatable Sepolia e2e from a clean environment.

## Phase 3 — Product UX

- Build market, sealed commit, epoch, private position, and verifier routes.
- Add privacy legend, progressive transaction states, recovery UX, and a11y.
- Ensure the primary flow contains no mock data or privileged backend dependency.

Exit: an unfamiliar tester completes the flow with only the README.

## Phase 4 — Release hardening

- Source-verify contracts; run security, dependency, secret, and license scans.
- Freeze a verification epoch and back up read-only evidence.
- Finish the feedback report, deployment guide, and release checklist.

Exit: every active scoring row in `02-competition-fit.md` links to public evidence.

## Stretch scope after MVP

N-outcome forecast vectors, oracle decentralization, selective-disclosure expertise
credentials, cohort-policy plugins, and multi-market calibration. Stretch work must
not destabilize the binary-market release path.
