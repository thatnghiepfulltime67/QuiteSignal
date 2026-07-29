# Protocol specification

## Contract topology

### `QuietSignalFactory`

Deploys one pool per immutable market configuration. It validates non-zero addresses,
supported outcome count, deadline bounds, `kMin`, adapter compatibility, and unique
configuration salt. A deployed pool starts in `OPEN` with one immutable epoch id and
deadline. The factory never holds funds and has no lifecycle authority.

### `QuietSignalPool`

Owns confidential accounting, epoch state, collateral custody, aggregate disclosure,
settlement, refund, and owner-only score receipts. Configuration is immutable after
deployment. The pool has no upgrade proxy in the MVP; a new version deploys a new pool.

### `IMarketAdapter`

```solidity
interface IMarketAdapter {
    function collateral() external view returns (address);
    function executeBatch(
        uint256 amountYes,
        uint256 amountNo,
        uint256 minYes,
        uint256 minNo
    ) external returns (uint256 acquiredYes, uint256 acquiredNo);
    function resolution() external view returns (bool resolved, uint8 winner);
    function redeem() external returns (uint256 redeemedCollateral);
}
```

An adapter instance is bound to one public market and is permissionless. It cannot
custody confidential handles and must return public collateral/outcome assets to the
caller within the same transaction. The pool checks balances before and after every
adapter call rather than trusting returned values alone.

## Storage model

```text
PoolConfig
  collateral, confidentialCollateral, adapter, kMin,
  commitDuration, aggregateTimeout, recoveryDelay

Epoch (one per pool)
  state, deadline, participantCount, aggregateRequestId, unwrapRequestId,
  encryptedTotal, encryptedYes, encryptedNo,
  publicYes, publicNo, acquiredYes, acquiredNo, winner, pot

Position[owner]
  committed, claimed, refunded,
  encryptedStake, encryptedProbabilityBps,
  encryptedYesAllocation, encryptedNoAllocation, encryptedScoreBps
```

All encrypted fields are opaque handles. Boolean lifecycle flags and participant
membership are public because transaction senders are already public. The MVP does
not reuse a pool across epochs, preventing cross-round accounting and settlement
state from becoming coupled.

## State machine

```text
[factory deployment] → OPEN
OPEN → AGGREGATE_PENDING | REFUNDABLE
AGGREGATE_PENDING → UNWRAP_PENDING | REFUNDABLE
UNWRAP_PENDING → EXECUTED | REFUNDABLE
EXECUTED → SETTLED
SETTLED → SETTLED       (individual claims)
REFUNDABLE → REFUNDABLE (individual refunds)
```

No transition moves backward. Individual claim/refund flags are monotonic.

## Transitions and guards

| Function | Required state and guards | Result |
|---|---|---|
| `commitSignal` | `OPEN`, before deadline, one commit/address, valid bound proofs | Pull encrypted stake; update position and aggregates |
| `closeEpoch` | Deadline reached | Below k: `REFUNDABLE`; otherwise `AGGREGATE_PENDING` |
| `requestAggregateDecrypt` | `AGGREGATE_PENDING`, request not created | Public-decrypt YES/NO aggregate handles only |
| `finalizeAggregate` | Matching request context and valid proof | Store public totals, request total unwrap, enter `UNWRAP_PENDING` |
| `finalizeExecution` | Matching unwrap proof; conservation and slippage checks | Atomically finalize unwrap and call adapter; enter `EXECUTED` |
| `recoverUnwrap` | `UNWRAP_PENDING`, recovery delay elapsed, valid unwrap proof | Finalize, rewrap all released collateral, enter `REFUNDABLE` |
| `cancelBeforeUnwrap` | `AGGREGATE_PENDING`, timeout elapsed | Enter `REFUNDABLE`; revealable aggregate remains public |
| `settle` | `EXECUTED`, adapter reports resolved | Redeem, verify balance delta, wrap pot, store winner; enter `SETTLED` |
| `materializeScore` | `SETTLED`, caller committed | Create/update owner-only encrypted Brier score |
| `claim` | `SETTLED`, caller committed and not claimed/refunded | Confidential payout once |
| `refund` | `REFUNDABLE`, caller committed and not claimed/refunded | Confidential stake return once |

`recoverUnwrap` requires the same proof whose absence caused the liveness failure.
It protects against adapter/slippage failure, not total gateway unavailability.

## Signal math

The client submits encrypted `stake` and `probabilityBps`. The pool clamps probability
without revealing whether clamping occurred:

```text
p = select(probabilityBps <= 10_000, probabilityBps, 10_000)
yesAllocation = stake × p / 10_000
noAllocation = stake - yesAllocation
```

The pool pulls exactly `stake` confidential collateral. The confidential arithmetic
and token ACL sequence are Phase 0 feasibility gates on Sepolia.

## Settlement and score math

If YES wins, `winningAllocation = encryptedYesAllocation`; otherwise it is the NO
allocation. Public rate values are `rateNum = redeemedPot` and
`rateDen = publicWinningAggregate`. `rateDen` must be non-zero.

```text
payout = winningAllocation × rateNum / rateDen
error = abs(p - outcomeBps)
brierLossBps = error² / 10_000
scoreBps = 10_000 - brierLossBps
```

All divisions round down. Therefore the sum of payouts cannot exceed the pot.
Rounding dust and unclaimed funds remain in the pool in the MVP; there is no admin
sweep path. A future immutable expiry policy requires a separate decision record.

## Normative invariants

- **I1 Input conservation:** derived YES + NO allocation equals encrypted stake.
- **I2 Epoch conservation:** aggregate YES + NO equals the encrypted collateral pulled.
- **I3 Disclosure scope:** no owner position, probability, stake, score, payout, or refund handle is publicly decrypted.
- **I4 Execution bound:** `publicYes + publicNo == releasedCollateral` before adapter execution.
- **I5 Balance-delta integrity:** acquired positions and redeemed collateral are verified from on-chain balance deltas.
- **I6 Payout bound:** sum of claims is at most the redeemed pot.
- **I7 Replay safety:** every proof binds `(chainId, pool, epochId, requestId)` and is consumed once.
- **I8 State safety:** state and per-owner terminal flags are monotonic and mutually exclusive.
- **I9 Integration integrity:** adapter, target addresses, target code hashes, and ABI hashes match the deployment manifest.
- **I10 ACL minimality:** only the pool has persistent compute authority; owners receive viewer rights only.

## Stable error taxonomy

`InvalidConfiguration`, `InvalidState`, `CommitWindowClosed`, `AlreadyCommitted`,
`KThresholdNotMet`, `ProofContextMismatch`, `ProofAlreadyConsumed`,
`ConservationViolation`, `SlippageExceeded`, `ResolutionPending`, `ZeroWinningPool`,
`AlreadyClaimed`, `AlreadyRefunded`, and `RecoveryNotReady`.
