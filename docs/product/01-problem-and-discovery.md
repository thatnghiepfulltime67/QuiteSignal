# Problem, insight, and user flow

## Jobs to be done

| Actor | Job | Current pain | Desired result |
|---|---|---|---|
| Informed forecaster | Contribute a timely signal | Position is observable and copyable | Signal counts without linking identity to position |
| Market operator | Attract high-quality information | Participation is broad but informed users abstain | Aggregate is useful and independently auditable |
| Auditor | Verify the system did not cheat | Plaintext cannot be inspected safely | Recompute invariants from chain data and public aggregates |
| Winner | Receive payout and learn personal score | A public claim reveals the position | Decrypt and claim privately; disclose only by choice |

## Product insight

Privacy is useful only if the public output remains useful. Therefore the system
does not hide everything: market price, epoch membership, and aggregate output
remain public; direction, amount, exact forecast, and personal score remain
confidential.

## Primary user flow

1. The user selects a market and reviews deadline and k-threshold.
2. The user enters a probability and stake. The client validates the range and
   encrypts both values for the same pool.
3. The user signs approval/operator authorization and `commitSignal`; calldata
   contains handles and proofs only.
4. The UI shows a sealed status and never infers content from events.
5. After the deadline, a keeper closes the epoch. If k is not reached, the epoch
   enters refund; no aggregate is revealed.
6. A keeper public-decrypts aggregate handles and submits proofs. The contract
   checks that aggregate plaintext equals the collateral actually released, then
   batches into the public market adapter.
7. The oracle publishes the result. The contract fixes a payout rate and computes
   an owner-only Brier score from the encrypted probability.
8. The user opens the position card, decrypts their position and score, and claims
   a confidential payout.

## Failure flows required in UX

- k not reached: explain why and offer refund; never reveal aggregates.
- Gateway timeout: keep encrypted payload local and retry idempotently.
- Keeper offline: lifecycle calls remain permissionless; timeout refund exists.
- Slippage: the batch reverts atomically and the epoch becomes refundable.
- Oracle pending: show pending status and disable claim.
