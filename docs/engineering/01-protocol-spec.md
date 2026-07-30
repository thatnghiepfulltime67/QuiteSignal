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

### `IResolutionAdapter`

```solidity
interface IResolutionAdapter {
  function target() external view returns (address);
  function targetRuntimeCodeHash() external view returns (bytes32);
  function greaterOrEqual() external view returns (bool);
  function threshold() external view returns (int256);
  function observationNotBefore() external view returns (uint256);
  function maximumFeedAge() external view returns (uint256);
  function resolution()
    external
    view
    returns (uint8 winner, uint80 roundId, int256 answer, uint256 updatedAt);
}
```

An adapter instance is bound to one public price-feed condition and is
permissionless. It cannot custody confidential handles or assets, has no
asset-receiving function, and cannot write an outcome. `resolution` reads the
unchanged target and reverts unless the immutable observation time, complete-round,
positive-answer, and maximum-age checks succeed. The pool never trusts a
caller-supplied result.

The stable ABI lives in `contracts/interfaces`. `IQuietSignalFactory` creates one
pool from `PoolConfig` and a deployment salt; `IQuietSignalPool` accepts encrypted
Nox external handles plus their proofs for `commitSignal`, a request id plus proof
for aggregate finalization, and no input at all for `settle`. `IQuietSignalErrors`
is the single custom-error ABI. The pinned Nox `IERC7984` interface is imported as
the confidential-collateral standard and is not copied locally.

## Storage model

```text
PoolConfig
  confidentialCollateral, resolutionAdapter, kMin,
  commitDuration, aggregateTimeout, resolutionGrace

Epoch (one per pool)
  state, deadline, participantCount, aggregateRequestId,
  encryptedTotal, encryptedYes, encryptedNo,
  publicYes, publicNo, winner, settledRoundId, settledAnswer

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
AGGREGATE_PENDING → RESOLUTION_PENDING | REFUNDABLE
RESOLUTION_PENDING → SETTLED | REFUNDABLE
SETTLED → SETTLED       (individual claims)
REFUNDABLE → REFUNDABLE (individual refunds)
```

No transition moves backward. Individual claim/refund flags are monotonic.

## Transitions and guards

| Function                  | Required state and guards                                               | Result                                                                |
| ------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `commitSignal`            | `OPEN`, before deadline, one commit/address, valid bound proofs         | Pull encrypted stake; update position and aggregates                  |
| `closeEpoch`              | Deadline reached                                                        | Below k: `REFUNDABLE`; otherwise `AGGREGATE_PENDING`                  |
| `requestAggregateDecrypt` | `AGGREGATE_PENDING`, request not created                                | Public-decrypt YES/NO aggregate handles only                          |
| `finalizeAggregate`       | Matching request context and valid proof                                | Store public totals, enter `RESOLUTION_PENDING`                         |
| `cancelBeforeResolution`  | `AGGREGATE_PENDING`, aggregate timeout elapsed from entry to that state | Enter `REFUNDABLE`; revealable aggregate remains public               |
| `settle`                  | `RESOLUTION_PENDING`, adapter gives valid fresh resolution and selected aggregate is non-zero | Store result context and winner; enter `SETTLED` |
| `cancelAfterResolutionGrace` | `RESOLUTION_PENDING`, grace elapsed                                  | Enter `REFUNDABLE`; collateral never left pool custody                 |
| `materializeScore`        | `SETTLED`, caller committed                                             | Create/update owner-only encrypted Brier score                        |
| `claim`                   | `SETTLED`, caller committed and not claimed/refunded                    | Confidential payout once                                              |
| `refund`                  | `REFUNDABLE`, caller committed and not claimed/refunded                 | Confidential stake return once                                        |

The Phase 0 unwrap/rewrap evidence remains valid for the confidential asset
boundary, but the MVP does not unwrap aggregate collateral. Invalid, stale, or
unavailable price-feed data is handled by the permissionless resolution-grace refund
path rather than a target-side recovery call. A valid round selecting a zero
winning aggregate also leaves the epoch `RESOLUTION_PENDING`; it cannot invent a
payout denominator and reaches the same permissionless grace refund.

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
allocation. Public rate values are `rateNum = publicYes + publicNo` and
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
- **I4 Aggregate/payout binding:** the public aggregate rate derives only from the
  proof-verified YES/NO totals; no target call can change custody or spend.
- **I5 Resolution integrity:** the immutable adapter target and condition yield a
  complete, positive, fresh feed round and a caller-independent binary winner.
- **I6 Payout bound:** sum of claims is at most confidential collateral held by the pool.
- **I7 Replay safety:** every proof binds `(chainId, pool, epochId, requestId)` and is consumed once.
- **I8 State safety:** state and per-owner terminal flags are monotonic and mutually exclusive.
- **I9 Integration integrity:** adapter, target addresses, target code hashes, and ABI hashes match the deployment manifest.
- **I10 ACL minimality:** only the pool has persistent compute authority; owners receive viewer rights only.

## Stable error taxonomy

`InvalidConfiguration`, `InvalidState`, `CommitWindowClosed`, `AlreadyCommitted`,
`AggregateRequestMissing`, `DuplicateAggregateRequest`, `ProofContextMismatch`,
`ProofAlreadyConsumed`, `ConservationViolation`, `InvalidFeedRound`,
`InvalidResolutionAdapter`, `ResolutionNotReady`, `ResolutionGraceNotElapsed`,
`ZeroWinningPool`, `AlreadyClaimed`, `AlreadyRefunded`, `TerminalActionConflict`,
`UnauthorizedCollateral`, `PoolAlreadyExists`, and `NativeValueNotAccepted`.
