# P0 — Foundation and feasibility

Status: `not_started`

## Objective

Replace every load-bearing technical assumption with reproducible local and Sepolia
evidence before production modules are created.

## Prerequisites

- Product, privacy, protocol, and architecture documents are internally consistent.
- No application implementation has started.
- A throwaway Sepolia wallet strategy and evidence-sanitization policy are approved.

## Work-item register

| ID | Outcome | Planned artifacts | Checks/evidence | Gate | Intended commit |
|---|---|---|---|---|---|
| FND-01 | Reproducible toolchain | Root workspace, lockfile, doctor, local Nox health | Frozen install ×2, compile smoke, license/advisory capture | G0 | `build: pin verified workspace toolchain` |
| FND-02 | Encrypted signal math proven | Isolated arithmetic spike/tests | Clamp, allocation, abs, square, Brier, boundary vectors local + Sepolia | G1 | `test: prove encrypted signal arithmetic` |
| FND-03 | ACL lifecycle proven | Isolated ACL spike/tests | Context binding, persistent handle, viewer-only, unauthorized, public scope | G1 | `test: prove handle binding and acl lifecycle` |
| FND-04 | Asset lifecycle proven | Isolated confidential-asset spike/tests | Pull, payout, refund, unwrap, finalize, rewrap, replay | G2 | `test: prove confidential asset recovery` |
| FND-05 | Aggregate/recovery proven | Isolated cohort/aggregate spike | Below-k, aggregate-only reveal, proof binding, timeout, rewrap | G3 | `test: prove aggregate disclosure and recovery` |
| FND-06 | Public protocol selected | Decision matrix + minimal adapter spike | License, unchanged target, code hash, execution, slippage, redemption | G4 | `test: prove open protocol adapter boundary` |
| FND-07 | Feasibility decision recorded | Evidence JSON/reports, feedback, risks, ADR updates | Evidence validator and full G0–G4 review | G0–G4 | `docs: record feasibility gates and decisions` |

Only one FND item may be in progress. Each item must be committed before the next
item begins; feasibility spikes never share a commit with production contracts.

## FND-01 — Toolchain lock

Definition of Ready:

- Official Nox package requirements and local plugin prerequisites have been inspected.
- Candidate Node/npm/Hardhat/Solidity versions are listed with sources.

Acceptance:

- Exact direct versions are pinned; transitive versions are frozen by lockfile.
- `npm run doctor` prints versions and public health only, never secret values.
- Clean frozen install succeeds twice and local Nox hello-world is deterministic.
- `.gitignore` rejects environment files, wallet material, local evidence, and caches.

Failure action: apply G0 kill conditions. Do not create application workspaces.

## FND-02 — Confidential arithmetic

Required vectors:

- `p = 0, 1, 4_999, 5_000, 9_999, 10_000, 10_001, max(type)`;
- stake `0, 1, rounding boundary, typical amount, maximum approved test amount`;
- YES/NO allocation conservation for every vector;
- Brier scores for both outcomes, including exact endpoints and rounding;
- overflow/underflow behavior and division-by-zero guards.

Acceptance: official local stack and minimal Sepolia cases match a pure bigint model.

## FND-03 — ACL and persistence

Required actors: pool, owner, unrelated wallet, confidential token, keeper, adapter.

Acceptance:

- Pool retains only the authority required for future computation.
- Owner receives viewer rights to derived position/score handles, not compute authority.
- Token access is transient and expires with the call/transaction semantics proved.
- Keeper/adapter/unrelated wallet access fails.
- Cross-pool, cross-chain, cross-request, and replayed inputs fail.
- Only aggregate/protocol-required handles can enter public-decrypt flow.

## FND-04 — Confidential asset lifecycle

Acceptance:

- Stake pull moves exactly the encrypted stake and cannot be redirected.
- Payout/refund reaches only the caller/recorded owner once.
- Unwrap proof releases exactly the burned amount measured by balance delta.
- Delayed finalize-and-rewrap returns all released collateral to confidential custody.
- Duplicate proof, stale proof, wrong recipient, and missing transient ACL fail.

## FND-05 — Aggregate and recovery

Acceptance:

- Below-k closes without public-decrypt permission and refunds remain possible.
- At/above-k marks only aggregate YES/NO handles public.
- Proof is bound to `(chainId, pool, epochId, requestId)` and consumed once.
- Substitute aggregate plaintext fails conservation.
- Timeout before unwrap and delayed recovery after unwrap have known funds locations.

## FND-06 — Adapter selection

Selection scorecard:

| Dimension | Weight | Minimum |
|---|---:|---|
| Unchanged open-source protocol and license clarity | 20 | Pass |
| Sepolia deployability/availability | 15 | Pass |
| Atomic spend/slippage bound | 20 | Pass |
| Deterministic resolution/redemption | 15 | Pass |
| No between-call adapter custody | 15 | Pass |
| Verifiable runtime bytecode/provenance | 10 | Pass |
| Demo/read-model clarity | 5 | ≥3/5 |

Document all candidates evaluated, but implement only the selected adapter. A target
that misses any minimum is rejected even if its aggregate score is highest.

## Required evidence

```text
evidence/local/G0-G4/
evidence/sepolia/G1-G4/
evidence/reports/G0-G4-summary.md
docs/operations/nox-feedback.md
docs/operations/02-risk-register.md
docs/operations/03-decision-log.md
```

## Exit checklist

- [ ] G0 passed: frozen toolchain and official local Nox stack are reproducible.
- [ ] G1 passed: arithmetic, context binding, ACL, and persistence agree locally/live.
- [ ] G2 passed: confidential asset success and recovery conserve funds.
- [ ] G3 passed: aggregate-only disclosure and proof/recovery semantics pass.
- [ ] G4 passed: one unchanged public protocol and adapter boundary are selected.
- [ ] Evidence ledger contains validated, sanitized records for G0–G4.
- [ ] All P0 findings, risks, and architecture consequences are documented.
- [ ] User explicitly approves transition to P1.

## Exit decision

`PASS`: mark P0 complete and begin P1.

`REDESIGN`: update architecture/ADR, reset affected gates to `not_run`, and repeat.

`STOP`: mark P0 blocked; do not hide the failure with mocks or trusted services.
