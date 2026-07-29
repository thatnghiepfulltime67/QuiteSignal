# QuietSignal — Executive brief

## One sentence

QuietSignal lets informed people contribute to open prediction markets without
revealing their probability forecast or how much conviction they committed.

## Problem

On-chain markets expose wallet, side, size, and timing. For sensitive questions
(policy, corporate risk, or geopolitics), well-informed participants self-censor
because their position can be copied, profiled, or associated with their career.
The market loses precisely the information it needs most.

## Product

A privacy layer over an existing public market:

- The browser encrypts stake and a probability forecast with Nox.
- The contract accepts fixed-shape encrypted handles and keeps owner-scoped ledgers.
- After a minimum cohort is reached, only aggregate handles are publicly decrypted
  and batch-routed through an unchanged market adapter.
- After resolution, payout and a personal Brier score remain confidential.

## Differentiation

QuietSignal does not create another exchange. It lets an open market collect
sensitive information while retaining composability. It also adds private
reputation: forecast quality is computed from encrypted data, while the public
market sees aggregate calibration rather than a wallet-linked leaderboard.

## MVP commitment

Binary market, one collateral token, epoch batching, k-threshold gate, aggregate-
only disclosure, private claim, private Brier-score receipt, one public-market
adapter, and a real Ethereum Sepolia frontend flow.

## MVP non-goals

No full decentralized oracle, cross-chain support, hidden membership, absolute
anonymity claims, or protocol token.
