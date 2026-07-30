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
| FR-04 Aggregate finalization | Pool | aggregate → `RESOLUTION_PENDING` | I2, I4, I7, I9 | `T-AGGREGATE-*`, `T-RESOLUTION-PENDING-*` | G3–G6 |
| FR-05 Settlement | Pool, resolution adapter | `RESOLUTION_PENDING.settle` | I5, I6, I8, I9 | `T-RESOLUTION-*`, `T-FEED-FRESHNESS-*`, `T-PAYOUT-BOUND-*` | G4–G6 |
| FR-06 Private view | Pool, Nox client, web | owner decrypt position | I3, I10 | `T-VIEWER-*`, `T-UNAUTHORIZED-DECRYPT-*`, `T-WEB-POSITION-*` | G1, G5–G7 |
| FR-07 Refund/recovery | Pool, relayer | timeout/grace → `REFUNDABLE` | I2, I3, I7, I8, I10 | `T-TIMEOUT-*`, `T-ZERO-WINNER-*`, `T-RESOLUTION-GRACE-*`, `T-REFUND-*` | G2, G3, G5–G7 |
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
| P2 Aggregate equals accepted encrypted inputs | Pool accumulation, proof verification, verifier | `T-CONSERVATION-*`, reference-model properties | G5 model report, G6 aggregate evidence |
| P3 Public decrypt scope is aggregate/protocol-only | Explicit ACL sites and static rule | `T-PUBLIC-DECRYPT-SCOPE-*`, grep/AST policy | G1 ACL report, G6 unauthorized checks |
| P4 Resolution cannot move collateral | Zero-custody adapter surface and immutable pool configuration | `T-ZERO-CUSTODY-*`, `T-RESOLUTION-CONDITION-*` | G4/G6 receipts and verifier output |
| P5 Claims/refunds do not exceed custody | Floor math, one-time flags, token balance | `T-PAYOUT-BOUND-*`, `T-REFUND-BOUND-*`, fuzz | G5 invariant report, G6 pot/claim report |
| P6 Owner-only viewer rights | Pool-only compute authority, explicit owner viewer | `T-ACL-MATRIX-*`, cross-transaction viewer tests | G1/G6 access checks |
| P7 Score remains owner-only | Encrypted Brier math and viewer ACL | `T-BRIER-MATH-*`, `T-SCORE-ACL-*` | G1 arithmetic/ACL, G6 owner-view test |

## Protocol invariants

| Invariant | Primary assertion | Reference oracle | Negative mutation | Evidence |
|---|---|---|---|---|
| I1 Input conservation | YES + NO allocation = stake | Domain bigint model | Off-by-one division/allocation mutation | G5 invariant report |
| I2 Epoch conservation | Aggregate allocation = confidential collateral pulled | Domain sum + token delta | Dropped/duplicated commit mutation | G5/G6 verifier |
| I3 Disclosure scope | No owner-shaped public decrypt | ACL event/static policy | Inject owner-handle reveal call | G1/G5 ACL report |
| I4 Aggregate/payout binding | Rate derives only from proof-verified aggregates | Aggregate proof and domain model | Keeper substitutes rate input | G5/G6 verifier |
| I5 Resolution integrity | Immutable adapter returns only a fresh valid target round | Target ABI/runtime and round fields | Stale, incomplete, wrong-target, or caller-result mutation | G4/G5/G6 |
| I6 Payout bound | Sum payouts ≤ confidential pool collateral | Bigint floor model | Round-up or duplicate claim | G5 fuzz/G6 pot report |
| I7 Replay safety | Context-bound request consumed once | Request-id set model | Reuse proof across pool/epoch | G3/G5/G6 |
| I8 State safety | Monotonic state and terminal owner flags | Explicit transition table | Backward/claim-refund transition | G5 transition report |
| I9 Integration integrity | Target/adapter code + ABI match manifest | RPC runtime code hash | Wrong address/stale binding | G4/G6/G8 manifest check |
| I10 ACL minimality | Pool persistent authority; owner viewer only | ACL matrix | Grant keeper/token persistent access | G1/G5/G6 |

## PK-01 reference-model coverage

The following pure-model tests establish the TypeScript oracle only. They are not
contract, Nox, ACL, or Sepolia evidence and do not advance G5 by themselves.

| Test family | Coverage | Invariants/requirements |
|---|---|---|
| `T-DOMAIN-PK01-01` | Allocation clamp, floor arithmetic, Brier endpoints | I1, FR-09 |
| `T-DOMAIN-PK01-02` | Invalid config, owner, deadline, duplicate, early/empty close | I8, FR-01–FR-03 |
| `T-DOMAIN-PK01-03` | Success lifecycle, floor payout dust, one-time claim | I1, I2, I6, I8, FR-05 |
| `T-DOMAIN-PK01-04` | Below-k and aggregate-timeout refunds | I2, I8, FR-03, FR-07 |
| `T-DOMAIN-PK01-05` | Request binding, premature/stale/incomplete round, zero-winner grace recovery | I4, I5, I7, I8, FR-04, FR-05, FR-07 |
| `T-DOMAIN-PK01-06` | 1,000 deterministic conservation, payout-bound, and terminal-flag vectors | I1, I2, I6, I8 |

## PK-02 ABI coverage

`T-ABI-PK02-*` is static/offline ABI compatibility coverage only. It cannot prove
contract behavior, Nox ACL, confidential asset handling, or Sepolia lifecycle
requirements.

| Test family | Coverage | Invariants/requirements |
|---|---|---|
| `T-ABI-PK02-01` | Pool selectors; encrypted commit shape; proof-only aggregate finalization; input-free settlement | P1, I4, I5, I7 |
| `T-ABI-PK02-02` | Factory selectors; read-only zero-custody adapter; no duplicate ERC-7984 ABI or payable adapter entry | P4, I5, I9 |
| `T-ABI-PK02-03` | Event topics and absence of confidential event fields | P1, P3, P7, I3 |
| `T-ABI-PK02-04` | Common custom-error selectors | I7, I8, I9 |

## Evidence naming

Evidence files use:

```text
<gate>-<work-item>-<requirement-or-invariant>-<environment>.json
```

Example shape: `G5-P1-EXEC-03-I4-offline.json`. Names describe evidence only; they
must not contain wallet addresses, handles, proofs, or confidential values.
