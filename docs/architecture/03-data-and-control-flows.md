# Data and control flows

## Contract components

| Component                  | Responsibility                                                                          | Authority                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `QuietSignalFactory`       | Validate immutable configuration and deploy pools                                       | No custody or lifecycle role                                |
| `QuietSignalPool`          | Confidential ledger, epoch state, custody, payout, score receipt                        | Owns pool handles; no oracle authority                      |
| `IResolutionAdapter`       | Normalize an immutable binary condition from a public feed                              | Permissionless; zero asset custody and no outcome-writing authority |
| Confidential asset wrapper | Move between confidential and public collateral                                         | External protocol dependency                                |

The MVP deployment unit is one pool, one objective public condition, and one epoch. Creating a
new cohort deploys a new pool through the factory. This deliberately removes
cross-epoch ledgers and shared settlement state from the protocol kernel.

## Commit data flow

1. The browser creates `stake` and `probabilityBps` handles bound to `(chainId, pool)`.
2. `commitSignal` imports both proofs exactly once, clamps probability to `10_000`,
   derives exact confidential allocations, and records one bounded encrypted intent.
3. The owner calls the unchanged collateral's `confidentialTransferAndCall`; the pool
   derives the received amount from its pre/post confidential balance delta and returns
   only an encrypted equality result to the wrapper with transient access.
4. Anyone finalizes a true amount-free acceptance proof. Only then does the pool update
   owner ledgers and epoch aggregates and grant owner viewer rights. A false proof or
   elapsed commit timeout clears the intent; timeout returns only conditionally-held
   encrypted collateral.

One address can commit once per epoch. The participant counter measures distinct
addresses, not economic uniqueness. The MVP makes no Sybil-resistance claim; a
credential or bond policy is a future, separate module.

## Aggregate and resolution flow

1. After deadline, `closeEpoch` chooses `REFUNDABLE` below k or `AGGREGATE_PENDING`.
2. Only YES/NO aggregate handles are marked for public decryption.
3. A permissionless actor submits the aggregate proof bound to the epoch request id.
4. The pool stores the proof-verified public YES and NO totals and enters
   `RESOLUTION_PENDING`; collateral remains in confidential custody.
5. A permissionless actor calls the adapter after the immutable observation time.
6. The adapter reads the immutable Chainlink feed, rejects invalid or stale data, and
   returns a binary result only from the configured threshold comparison.

The adapter cannot receive collateral, write an outcome, or access confidential
handles. If it rejects an invalid or stale feed round, the state remains
`RESOLUTION_PENDING`. Once the immutable resolution grace deadline elapses without a
valid result, anyone can enter the confidential refund path. The earlier Phase 0
unwrap/recovery evidence remains a proven asset-boundary capability, but no longer
belongs to the MVP product execution path.

## Settlement and private score

For public result `y ∈ {0, 10_000}` and owner-only clamped forecast `p`:

```text
errorBps = abs(p - y)
brierLossBps = errorBps² / 10_000
scoreBps = 10_000 - brierLossBps
```

The score is computed as an encrypted handle and grants viewer rights to the owner
only. Payout is based on the owner's encrypted allocation to the winning outcome and
the public rate `aggregateCollateral / aggregateWinningAllocation`. Division
denominators are checked as public non-zero values before confidential arithmetic.

## State-specific recovery

| State               | Funds location          | Recovery                                              |
| ------------------- | ----------------------- | ----------------------------------------------------- |
| `OPEN`              | Confidential pool       | Refund only after deadline/cancellation policy        |
| `COMMIT_PENDING`    | Owner custody or encrypted callback outcome pending | Permissionless proof finalization, rejection, or commit-timeout return |
| `AGGREGATE_PENDING` | Confidential pool       | Timeout to `REFUNDABLE`                               |
| `RESOLUTION_PENDING` | Confidential pool      | Valid fresh feed result or grace-timeout refund       |
| `SETTLED`           | Confidential payout pot | Owner claims once; dust handled by immutable policy   |
| `REFUNDABLE`        | Confidential pool       | Owner refund once                                     |

## ACL matrix

| Handle class               |                    Pool admin |             Owner viewer | Token transient |         Public decrypt |
| -------------------------- | ----------------------------: | -----------------------: | --------------: | ---------------------: |
| Imported stake/probability |   Required during computation |                       No |              No |                  Never |
| Owner position/score       |                      Required |                      Yes |              No |                  Never |
| Epoch aggregates           |                      Required |                       No |              No |           After k only |
| Transfer/payout/refund     |                      Required | Recipient after transfer |    For one call |                  Never |

Every ACL grant is explicit in code and asserted by integration tests. No module may
grant persistent admin rights to a user, relayer, indexer, adapter, or keeper.
