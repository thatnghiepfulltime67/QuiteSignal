# Work-package operating rules

This directory converts architecture into independently reviewable implementation
slices. [`Plan.md`](../../Plan.md) owns critical path and package status; each phase
file owns work-item tasks, dependencies, checks, evidence, and exit decisions.

## Required work-package structure

Every phase document must contain:

1. stable phase ID, status, and one measurable objective;
2. prerequisites expressed as passed gates/artifacts, not calendar assumptions;
3. work-item register with stable IDs and intended commit messages;
4. dependency graph or explicit sequence;
5. acceptance and mandatory negative cases;
6. verification commands/test families;
7. sanitized evidence outputs;
8. exit checklist and stop conditions.

## Required work-item contract

Before a work item becomes `in_progress`, record:

```text
ID:
Outcome:
Status:
Prerequisite gates:
Files/modules allowed:
Acceptance criteria:
Negative cases:
Privacy/custody impact:
Funds location/recovery impact:
Commands/checks:
Evidence path:
Intended commit:
Rollback/failure action:
```

If a field is unknown, the item is not ready. Split the item if its allowed files,
checks, or commit cannot be reviewed as one concern.

## Status rules

- Only one phase and one work item may be `in_progress`.
- `blocked` names the failing gate, reproduction, and required decision/change.
- `complete` requires a commit hash, passing checks, and validated evidence reference.
- A checkbox is never evidence by itself.
- Downstream items remain `not_started` until all prerequisite gates pass.

## ID namespaces

| Prefix | Scope |
|---|---|
| `FND-*` | Toolchain and feasibility |
| `PK-*` | Protocol kernel |
| `INT-*` | Public protocol integration |
| `SDK-*` | Confidential/public client SDK |
| `VER-*` | Independent verification |
| `AUT-*` | Permissionless automation |
| `IDX-*` | Public read model |
| `DEP-*` | Deployment and manifests |
| `LIVE-*` | Live Sepolia cases |
| `WEB-*` | Product application |
| `REL-*` | Hardening and release |

## Commit rules

- One independently reviewable concern per commit.
- Do not combine a refactor with behavior unless inseparable for correctness.
- Tests and affected docs ship with the behavior they verify.
- Stage only active-slice files; preserve unrelated user changes.
- Run `git diff --check` before commit and the active work item's narrow checks.
- Record broader gate checks when closing the work item/phase.

## Gate/evidence rules

- Gates and kill conditions are defined in
  [`gates-and-kill-conditions.md`](gates-and-kill-conditions.md).
- Required commands and suites are in [`verification-matrix.md`](verification-matrix.md).
- Requirements/invariants are mapped in [`traceability-matrix.md`](traceability-matrix.md).
- Evidence is recorded in [`evidence-ledger.md`](evidence-ledger.md).
- Every Sepolia write follows the budget and reconciliation contract in
  [`sepolia-spend-ledger.md`](sepolia-spend-ledger.md).
- File outputs and dependency order are in
  [`deliverables-and-build-order.md`](deliverables-and-build-order.md).

## Scope rule

No stretch feature, media/presentation work, additional adapter, upgrade system,
cross-chain behavior, or administrative sweep enters the active plan before G8.
