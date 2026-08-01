# P1 — Protocol kernel

Status: `complete`

## Objective

Implement a Sepolia-tested protocol whose state, custody, ACL, recovery, payout,
and owner-only score behavior satisfies I1–I10 without plaintext shadow accounting.

## Prerequisites

- P0 is complete and G0–G4 are passed.
- Nox asset/ACL patterns and the immutable public resolution dependency are recorded.
- Domain paths and production interfaces follow the documented adapter boundary.

## Completed work-item register

| ID    | Delivered outcome                                              | Primary checks                                                       | Intended commit                               |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| PK-01 | Pure state, transition, payout, and score reference model      | transition, boundary, and property vectors                           | `feat: add protocol reference model`          |
| PK-02 | Stable pool, factory, adapter, event, and error interfaces     | ABI, selector, event, and encrypted-input-shape checks               | `feat: define protocol interfaces and events` |
| PK-03 | Immutable zero-custody adapter and deterministic pool factory  | runtime, configuration, CREATE2, and rejection checks                | `feat: add immutable pool factory`            |
| PK-04 | Owner-bound confidential forecast and exact collateral custody | proof, ACL, callback-delta, replay, duplicate, and timeout checks    | `feat: add confidential signal custody`       |
| PK-05 | Cohort gate, encrypted aggregate, and proof-bound finalization | below-k, disclosure scope, request binding, and replay checks        | `feat: add k gated aggregate lifecycle`       |
| PK-06 | Public price-feed settlement and bounded recovery              | stale/incomplete round, wrong target, grace, and zero-custody checks | `feat: add bounded resolution and recovery`   |
| PK-07 | Owner-only score, confidential payout, claim, and refund       | conservation, rounding, duplicate, and claim/refund conflict checks  | `feat: add private settlement and score`      |
| PK-08 | Independent manifest and public invariant verifier             | runtime, binding, receipt, state, and mutation rejection             | `feat: add independent protocol verifier`     |
| PK-09 | Combined adversarial and invariant evidence gate               | I1–I10, model vectors, static checks, and sanitized aggregation      | `test: close protocol correctness gate`       |

## Acceptance and negative coverage

- One pool owns one market and one epoch with immutable timings and bindings.
- Confidential collateral remains in the documented pool/wrapper state until an
  owner terminal action returns it.
- Only k-gated aggregate YES/NO values may become public; owner positions, scores,
  payouts, and refunds remain owner-viewable.
- Lifecycle actions are permissionless where documented and cannot bypass deadline,
  timeout, proof-context, feed-freshness, replay, or terminal-state guards.
- Claims and refunds are one-time, mutually exclusive, and bounded by custody.
- The public adapter cannot receive collateral or write a caller-selected result.

## Verification

- `npm run test:model`
- `npm run test:unit`
- `npm run test:contracts:sepolia -- <case>`
- `npm run test:nox:sepolia -- <case>`
- `npm run test:adversarial:sepolia -- <case>`
- `npm run verify:g5:evidence`
- `git diff --check`

## Evidence and recovery

The passed G5 aggregate and named component artifacts live under
`evidence/{offline,sepolia}/G5/`. Failed calls preserve contract state atomically;
timeout and grace paths lead to the documented confidential owner recovery routes.

## Completion decision

P1 is complete and G5 passed with protocol, custody, privacy, lifecycle, payout,
recovery, adversarial, and independent-verifier evidence.
