# Data and control flows

## Contract components

| Component | Responsibility | Authority |
|---|---|---|
| `QuietSignalFactory` | Validate immutable configuration and deploy pools | No custody or lifecycle role |
| `QuietSignalPool` | Confidential ledger, epoch state, custody, payout, score receipt | Owns pool handles; no oracle authority |
| `IMarketAdapter` | Convert public aggregate into protocol calls, normalize resolution, and redeem outcomes | Permissionless; returns all assets to the caller atomically |
| Confidential asset wrapper | Move between confidential and public collateral | External protocol dependency |

The MVP deployment unit is one pool, one public market, and one epoch. Creating a
new cohort deploys a new pool through the factory. This deliberately removes
cross-epoch ledgers and shared settlement state from the protocol kernel.

## Commit data flow

1. The browser creates `stake` and `probabilityBps` handles bound to `(chainId, pool)`.
2. `commitSignal` imports both proofs exactly once and clamps probability to `10_000`
   using confidential comparison/select operations.
3. The pool derives `yesAllocation = stake × p / 10_000` and
   `noAllocation = stake - yesAllocation` inside confidential computation.
4. The pool updates owner ledgers and epoch aggregates, grants owner viewer rights,
   and grants the confidential token only transient access to the transfer handle.
5. The token pulls exactly `stake`; the pool never receives plaintext user values.

One address can commit once per epoch. The participant counter measures distinct
addresses, not economic uniqueness. The MVP makes no Sybil-resistance claim; a
credential or bond policy is a future, separate module.

## Aggregate and execution flow

1. After deadline, `closeEpoch` chooses `REFUNDABLE` below k or `AGGREGATE_PENDING`.
2. Only YES/NO aggregate handles are marked for public decryption.
3. A permissionless actor submits the aggregate proof bound to the epoch request id.
4. The pool requests unwrap of the encrypted total and enters `UNWRAP_PENDING`.
5. A permissionless actor submits the unwrap proof and slippage bounds.
6. In one atomic transaction the pool finalizes unwrap, verifies
   `publicYes + publicNo == releasedCollateral`, and calls the adapter.

If adapter execution reverts, the entire finalization transaction reverts and the
epoch remains `UNWRAP_PENDING`. After a recovery delay, `recoverUnwrap` finalizes the
same proof, rewraps the released collateral, and enters `REFUNDABLE`. If the Nox
proof service never produces a valid unwrap proof, recovery is unavailable; this is
an explicit protocol-liveness dependency and a stop-ship feasibility gate.

## Settlement and private score

For public result `y ∈ {0, 10_000}` and owner-only clamped forecast `p`:

```text
errorBps = abs(p - y)
brierLossBps = errorBps² / 10_000
scoreBps = 10_000 - brierLossBps
```

The score is computed as an encrypted handle and grants viewer rights to the owner
only. Payout is based on the owner's encrypted allocation to the winning outcome and
the public rate `redeemedPot / aggregateWinningAllocation`. Division denominators are
checked as public non-zero values before confidential arithmetic.

## State-specific recovery

| State | Funds location | Recovery |
|---|---|---|
| `OPEN` | Confidential pool | Refund only after deadline/cancellation policy |
| `AGGREGATE_PENDING` | Confidential pool | Timeout to `REFUNDABLE` |
| `UNWRAP_PENDING` | Burn pending proof | Finalize and execute, or delayed finalize-and-rewrap |
| `EXECUTED` | Public market positions | Await normalized resolution; no original-stake refund |
| `SETTLED` | Confidential payout pot | Owner claims once; dust handled by immutable policy |
| `REFUNDABLE` | Confidential pool | Owner refund once |

## ACL matrix

| Handle class | Pool admin | Owner viewer | Token transient | Public decrypt |
|---|---:|---:|---:|---:|
| Imported stake/probability | Required during computation | No | No | Never |
| Owner position/score | Required | Yes | No | Never |
| Epoch aggregates | Required | No | No | After k only |
| Transfer/payout/refund | Required | Recipient after transfer | For one call | Never |
| Unwrap request/burn | Required as protocol requires | No | For unwrap only | Protocol-required only |

Every ACL grant is explicit in code and asserted by integration tests. No module may
grant persistent admin rights to a user, relayer, indexer, adapter, or keeper.
