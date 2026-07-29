# Requirement, invariant, and evidence traceability

No requirement is complete until every referenced test family passes and the named
gate evidence is recorded. Test IDs are stable prefixes; implementations may add
suffixes but cannot silently rename or remove a required family.

## Functional requirements

| Requirement | Contract/module owner | State/function boundary | Invariants | Required test families | Evidence gate |
|---|---|---|---|---|---|
| FR-01 Create pool | Factory, config | deploy → `OPEN` | I8, I9 | `T-FACTORY-*`, `T-CONFIG-*` | G4, G5, G6 |
| FR-02 Commit signal | Pool, Nox client, confidential token | `OPEN.commitSignal` | I1, I2, I7, I10 | `T-COMMIT-*`, `T-ACL-*`, `T-ASSET-PULL-*` | G1, G2, G5, G6 |
| FR-03 Cohort gate | Pool | `OPEN.closeEpoch` | I3, I8 | `T-K-GATE-*`, `T-BELOW-K-REFUND-*` | G3, G5, G6 |
| FR-04 Batch execution | Pool, adapter | aggregate → unwrap → `EXECUTED` | I2, I4, I5, I7, I9 | `T-AGGREGATE-*`, `T-UNWRAP-*`, `T-ADAPTER-*`, `T-SLIPPAGE-*` | G2–G6 |
| FR-05 Settlement | Pool, adapter | `EXECUTED.settle` | I5, I6, I8, I9 | `T-RESOLUTION-*`, `T-REDEEM-*`, `T-PAYOUT-BOUND-*` | G4–G6 |
| FR-06 Private view | Pool, Nox client, web | owner decrypt position | I3, I10 | `T-VIEWER-*`, `T-UNAUTHORIZED-DECRYPT-*`, `T-WEB-POSITION-*` | G1, G5–G7 |
| FR-07 Refund/recovery | Pool, relayer | timeout/recovery → `REFUNDABLE` | I2, I3, I7, I8, I10 | `T-TIMEOUT-*`, `T-RECOVER-UNWRAP-*`, `T-REFUND-*` | G2, G3, G5–G7 |
| FR-08 Independent audit | Verifier, config | public chain → report | I1–I10 observable subset | `T-VERIFIER-MUTATION-*`, `T-MANIFEST-*`, `T-EVIDENCE-*` | G5–G8 |
| FR-09 Private score | Pool, Nox client, web | `SETTLED.materializeScore` | I3, I8, I10 | `T-BRIER-MATH-*`, `T-SCORE-ACL-*`, `T-WEB-SCORE-*` | G1, G5–G7 |

## Non-functional requirements

| Requirement | Owner | Required checks | Risks | Gate |
|---|---|---|---|---|
| NFR-01 State safety | Domain, contracts | transition map, invalid-state tests, replay, idempotency, model equivalence | R-05, R-08 | G5 |
| NFR-02 Typed SDK | Nox client | strict typecheck, branded-type compile tests, encoding vectors, decimal boundaries | R-01, R-03 | G0, G6 |
| NFR-03 Accessible UX | Web | keyboard, screen reader, mobile, reconnect, retry, clear privacy/recovery copy | R-10, R-12 | G7, G8 |
| NFR-04 Plaintext exclusion | All apps/CI | schema rejection, structured-log tests, secret/plaintext scan, analytics audit | R-09 | every gate |
| NFR-05 Reproducible release | Config, operations | frozen install, code/ABI hash sync, source verification, evidence validation | R-01, R-10 | G0, G6, G8 |

## Privacy claims

| Privacy claim | Enforced by | Required tests | Public evidence |
|---|---|---|---|
| P1 No plaintext confidential input in public/application surfaces | Schema boundaries, encrypted calldata, logging policy | `T-NO-PLAINTEXT-*`, secret/log scans | G6 sanitized transaction/function-shape report |
| P2 Aggregate equals accepted encrypted inputs | Pool accumulation, unwrap conservation, verifier | `T-CONSERVATION-*`, reference-model properties | G5 model report, G6 aggregate/balance deltas |
| P3 Public decrypt scope is aggregate/protocol-only | Explicit ACL sites and static rule | `T-PUBLIC-DECRYPT-SCOPE-*`, grep/AST policy | G1 ACL report, G6 unauthorized checks |
| P4 Adapter spend equals released collateral | Balance deltas and exact equality guard | `T-EXECUTION-BOUND-*`, malicious adapter return tests | G4/G6 receipts and verifier output |
| P5 Claims/refunds do not exceed custody | Floor math, one-time flags, token balance | `T-PAYOUT-BOUND-*`, `T-REFUND-BOUND-*`, fuzz | G5 invariant report, G6 pot/claim report |
| P6 Owner-only viewer rights | Pool-only compute authority, explicit owner viewer | `T-ACL-MATRIX-*`, cross-transaction viewer tests | G1/G6 access checks |
| P7 Score remains owner-only | Encrypted Brier math and viewer ACL | `T-BRIER-MATH-*`, `T-SCORE-ACL-*` | G1 arithmetic/ACL, G6 owner-view test |

## Protocol invariants

| Invariant | Primary assertion | Reference oracle | Negative mutation | Evidence |
|---|---|---|---|---|
| I1 Input conservation | YES + NO allocation = stake | Domain bigint model | Off-by-one division/allocation mutation | G5 invariant report |
| I2 Epoch conservation | Aggregate allocation = confidential collateral pulled | Domain sum + token delta | Dropped/duplicated commit mutation | G5/G6 verifier |
| I3 Disclosure scope | No owner-shaped public decrypt | ACL event/static policy | Inject owner-handle reveal call | G1/G5 ACL report |
| I4 Execution bound | Public aggregate = released collateral | Underlying balance delta | Keeper substitutes amount | G5/G6 verifier |
| I5 Balance-delta integrity | Acquired/redeemed values match observed deltas | Token/outcome balances | Adapter lies in return value | G4/G5/G6 |
| I6 Payout bound | Sum payouts ≤ pot | Bigint floor model | Round-up or duplicate claim | G5 fuzz/G6 pot report |
| I7 Replay safety | Context-bound request consumed once | Request-id set model | Reuse proof across pool/epoch | G3/G5/G6 |
| I8 State safety | Monotonic state and terminal owner flags | Explicit transition table | Backward/claim-refund transition | G5 transition report |
| I9 Integration integrity | Target/adapter code + ABI match manifest | RPC runtime code hash | Wrong address/stale binding | G4/G6/G8 manifest check |
| I10 ACL minimality | Pool persistent authority; owner viewer only | ACL matrix | Grant keeper/token persistent access | G1/G5/G6 |

## Evidence naming

Evidence files use:

```text
<gate>-<work-item>-<requirement-or-invariant>-<environment>.json
```

Example shape: `G5-P1-EXEC-03-I4-local.json`. Names describe evidence only; they
must not contain wallet addresses, handles, proofs, or confidential values.
