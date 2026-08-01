# Usage

## Primary journey

1. Open `/markets` and connect a wallet on Ethereum Sepolia.
2. Select a verified market and review its deadline, threshold, collateral, and
   immutable resolution condition.
3. Enter a forecast as a percentage and a collateral amount. The browser validates
   the draft, encrypts both values through the Nox client, and sends the owner-bound
   transaction after an explicit wallet approval.
4. Wait for the receipt. Submitted, confirmed, retryable, and terminal states are
   distinct; refreshes re-read the chain instead of trusting a browser cache.
5. When the epoch closes, only the k-gated aggregate needed by the public adapter is
   revealed. Individual position, amount, and score remain owner-only.
6. Resolve the immutable binary market condition, then open `/position` to view the
   connected owner's forecast, collateral, and score when materialized.

## Privacy boundary

The dApp is confidential, not anonymous. Public observers can see membership,
timing, pool configuration, public transactions, and aggregate results once the
threshold is met. They cannot decrypt an owner's position or amount through the
documented owner-only path. The design is not Sybil resistance and does not hide
network metadata or wallet identity.

## Recovery

If automation or an indexer is unavailable, correctness and recovery remain
permissionless. Use the action shown from direct contract state, wait for the
documented timeout where required, and never paste encrypted material or proof
data into support channels. See [`runbooks/recovery.md`](runbooks/recovery.md).
