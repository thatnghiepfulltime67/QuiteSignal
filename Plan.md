# QuietSignal implementation plan

Status values: `not_started`, `in_progress`, `blocked`, `complete`.

## Objective

Deliver a reproducible, privacy-honest Sepolia application that accepts encrypted
stake and probability, reveals only a k-gated aggregate, executes through an open-
protocol adapter, and returns owner-only payout and Brier score.

## Active scope

| ID | Work package | Status | Exit gate |
|---|---|---|---|
| P0 | [Foundation and feasibility](docs/plans/00-foundation-and-feasibility.md) | `not_started` | Load-bearing Nox and adapter primitives proven |
| P1 | [Protocol kernel](docs/plans/01-protocol-kernel.md) | `not_started` | Local lifecycle and I1–I10 pass |
| P2 | [Integration and SDK](docs/plans/02-integration-and-sdk.md) | `not_started` | Repeatable multi-user Sepolia lifecycle |
| P3 | [Web and read model](docs/plans/03-web-and-read-model.md) | `not_started` | Real primary flow usable without mock state |
| P4 | [Sepolia hardening](docs/plans/04-sepolia-hardening.md) | `not_started` | Clean-environment release verification passes |

Only one work package may be `in_progress` at a time. P0 must be completed and
explicitly accepted before product implementation begins.

## Global gates

- No plaintext confidential input in calldata, events, storage, application logs,
  analytics, fixtures, screenshots, or committed artifacts.
- Funds location and recovery behavior are known for every state.
- P1–P7 and I1–I10 have traceable tests and evidence.
- The adapter target, code hashes, ABI hashes, addresses, and deployment inputs are recorded.
- The official local Nox stack and a real Sepolia path agree on ACL behavior.
- The primary application path reads real chain state and contains no mock branch.

## Execution rule

For each checkbox in a work package:

1. Make the smallest coherent change.
2. Run its listed verification.
3. Update the plan and affected specification.
4. Create a small commit before starting the next independent item.

## Deferred until P4 is complete

Submission media, recording scripts, social posts, and presentation choreography.
Competition source material remains preserved, but it is not an active workstream.
