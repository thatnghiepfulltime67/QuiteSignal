# P1 — Protocol kernel

## Prerequisite

P0 is complete and accepted.

## Tasks

- [ ] Implement immutable pool configuration and factory validation.
- [ ] Implement the single-epoch state machine and stable error taxonomy.
- [ ] Implement encrypted signal import, clamping, allocation, ledger, and custody.
- [ ] Implement k-gated aggregate request and proof finalization.
- [ ] Implement unwrap, atomic adapter execution, and delayed rewrap recovery.
- [ ] Implement resolution, redemption, confidential payout, refund, and private score.
- [ ] Implement independent verifier inputs and deployment-manifest schema.
- [ ] Add unit, integration, fuzz, invariant, replay, ACL, and recovery tests.

## Verification

- Every transition and forbidden transition is tested.
- I1–I10 have named tests and independent verifier coverage where observable.
- All stop-ship conditions are automated where possible.
- Full local commit → aggregate → execute → settle → score/claim and refund paths pass.

## Commit rule

Commit each contract boundary, state transition group, and test group separately.
Do not combine adapter code, pool accounting, and frontend work.

## Exit criteria

The local protocol lifecycle passes through the official Nox stack with no
undocumented authority, funds location, or recovery state.
