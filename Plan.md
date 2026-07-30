# QuietSignal execution plan

Status values: `not_started`, `in_progress`, `blocked`, `complete`.

## 1. Objective

Deliver a reproducible, privacy-honest Ethereum Sepolia application that accepts
encrypted stake and probability, reveals only a k-gated aggregate, executes through
an unchanged open protocol, and returns owner-only payout and Brier score.

This plan is an execution contract. A task is not complete because code exists; it
is complete only when its artifact, checks, evidence, documentation, and commit are
all present.

## 2. Source-of-truth order

When documents disagree, resolve them in this order:

1. Security stop-ship conditions and accepted architecture decisions.
2. Protocol and privacy specifications.
3. This master plan and its gate register.
4. The active work package.
5. Implementation notes and convenience scripts.

Any conflict that changes custody, privacy, trust, state, or a public interface must
be resolved by an ADR before code changes.

## 2.1 Adaptive delivery and controlled simplification

This plan is a delivery baseline, not an assertion that its initial architecture is
optimal. The implementer may proactively simplify, replace, or reorder an
implementation approach when that change makes the product more usable, operable,
secure, recoverable, or straightforward to verify. Prefer the smallest design that
preserves the product objective and produces stronger, more reproducible evidence.

This authority never permits weakening a gate, replacing a failed Sepolia
requirement with a mock, adding hidden trust or custody, or overstating a privacy
claim. Before implementation, record material changes in the active work package
and decision log; create an ADR when they alter trust, custody, privacy, state
transitions, or a public interface. Update the plan, risks, traceability, and
evidence requirements in the same independently reviewable slice.

## 3. Critical path

```text
P0 Foundation/feasibility
 └─ G0 toolchain lock
 └─ G1 Nox compute + ACL
 └─ G2 confidential asset lifecycle
 └─ G3 aggregate proof + recovery
 └─ G4 public-protocol adapter
      ↓ explicit approval
P1 Protocol kernel ── G5 Sepolia protocol correctness
      ↓
P2 Integration/SDK ── G6 live Sepolia protocol evidence
      ↓
P3 Web/read model ─── G7 real user journey
      ↓
P4 Hardening ──────── G8 release candidate
```

No downstream package may hide or compensate for a failed upstream gate.

## 4. Work-package register

| ID  | Work package                                                              | Status        | Required gates | Exit gate                                                           |
| --- | ------------------------------------------------------------------------- | ------------- | -------------- | ------------------------------------------------------------------- |
| P0  | [Foundation and feasibility](docs/plans/00-foundation-and-feasibility.md) | `in_progress` | G0–G4          | Load-bearing primitives proven on Sepolia; pure models pass offline |
| P1  | [Protocol kernel](docs/plans/01-protocol-kernel.md)                       | `not_started` | G0–G4          | G5: Sepolia contract lifecycle and I1–I10 pass                      |
| P2  | [Integration and SDK](docs/plans/02-integration-and-sdk.md)               | `not_started` | G5             | G6: repeatable multi-user Sepolia lifecycle                         |
| P3  | [Web and read model](docs/plans/03-web-and-read-model.md)                 | `not_started` | G6             | G7: real primary flow without mock state                            |
| P4  | [Sepolia hardening](docs/plans/04-sepolia-hardening.md)                   | `not_started` | G7             | G8: clean-environment release verification                          |

Only one work package and one independently reviewable slice may be `in_progress`.
P0 requires explicit acceptance before product implementation starts.

## 5. Planning control documents

- [Gate register and kill conditions](docs/plans/gates-and-kill-conditions.md)
- [Deliverables and build order](docs/plans/deliverables-and-build-order.md)
- [Verification command matrix](docs/plans/verification-matrix.md)
- [Requirement traceability](docs/plans/traceability-matrix.md)
- [Evidence ledger](docs/plans/evidence-ledger.md)
- [Sepolia spend ledger contract](docs/plans/sepolia-spend-ledger.md)
- [Sepolia environment and wallet safety](docs/setup-sepolia.md)
- [Work-package rules](docs/plans/README.md)

## 6. Definition of Ready for a work item

A work item may start only when it has:

- a stable ID and one-sentence outcome;
- satisfied prerequisite gates;
- exact files/modules it may create or change;
- acceptance criteria and negative cases;
- relevant invariants, privacy impact, and funds-location impact;
- commands/checks that will verify it;
- sanitized evidence destination;
- rollback or failure-recovery statement;
- intended Conventional Commit message.

## 7. Definition of Done for a work item

A work item is complete only when:

- implementation and tests satisfy its acceptance criteria;
- relevant narrow checks and package gate pass;
- no confidential material is present in diff, logs, fixtures, or evidence;
- affected specs, risks, ADRs, generated bindings, and manifests are synchronized;
- evidence is recorded with commit, chain, contract, and transaction context;
- `git diff --check` passes;
- the slice is committed independently and the work-package status is updated.

## 8. Global non-negotiable gates

- No plaintext confidential input in calldata, events, storage, application logs,
  analytics, fixtures, screenshots, or committed artifacts.
- Funds location and recovery behavior are known for every state.
- P1–P7 and I1–I10 have named tests and traceable evidence.
- Target protocol addresses, runtime code hashes, ABI hashes, and deployment inputs
  are recorded and independently verifiable.
- Every load-bearing Nox/ACL/asset behavior is proven directly on Sepolia.
- Cumulative Sepolia gas remains within the current user-authorized 0.5 ETH allowance.
- The primary application path reads real chain state and has no mock branch.
- No privileged backend, keeper, indexer, or relayer is required for correctness.

## 9. Scope controls

- MVP: one pool, one market, one epoch, binary outcome, one collateral boundary,
  one adapter, owner-only score, permissionless lifecycle.
- Stretch work cannot begin before G8.
- Do not add upgrades, cross-chain behavior, portable credentials, multiple market
  adapters, administrative sweeping, or write-enabled agent integrations to the MVP.
- A feasibility kill condition stops dependent work; it is not converted into a
  hidden mock, trusted backend, or weakened privacy claim.

## 10. Progress protocol

At the end of every slice:

1. Update the active task checkbox and gate evidence.
2. Record checks actually run, not checks merely intended.
3. Commit only the active concern.
4. Leave the worktree coherent and report unrelated user changes separately.

## 11. Deferred until G8

Submission media, recording scripts, social posts, and presentation choreography.
Competition source material remains preserved but is not an active workstream.
