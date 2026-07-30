# QuietSignal — Executive brief

## One sentence

QuietSignal lets informed people contribute to private forecast pools without
revealing their probability forecast or how much conviction they committed.

## Problem

On-chain markets expose wallet, side, size, and timing. For sensitive questions
(policy, corporate risk, or geopolitics), well-informed participants self-censor
because their position can be copied, profiled, or associated with their career.
The market loses precisely the information it needs most.

## Product

A privacy-preserving forecast pool with an objective public resolution source:

- The browser encrypts stake and a probability forecast with Nox.
- The contract accepts fixed-shape encrypted handles and keeps owner-scoped ledgers.
- After a minimum cohort is reached, only aggregate handles are publicly decrypted.
- An unchanged public price-feed adapter resolves one immutable binary condition;
  collateral never leaves the pool for an external market.
- After resolution, payout and a personal Brier score remain confidential.

## Differentiation

QuietSignal does not require an exchange or a trusted result operator. It lets a
cohort collect sensitive information while retaining an auditable public aggregate.
It also adds private reputation: forecast quality is computed from encrypted data,
while observers see aggregate calibration rather than a wallet-linked leaderboard.

## MVP commitment

Binary market, one collateral token, epoch batching, k-threshold gate, aggregate-
only disclosure, private claim, private Brier-score receipt, one public-resolution
adapter, and a real Ethereum Sepolia frontend flow.

## MVP non-goals

No full decentralized oracle, cross-chain support, hidden membership, absolute
anonymity claims, or protocol token.
