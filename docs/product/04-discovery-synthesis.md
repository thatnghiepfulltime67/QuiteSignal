# Product rationale and scope boundaries

## Product thesis

Open prediction markets benefit from informed participation, but transparent
positions create social, professional, and trading costs. QuietSignal supplies a
confidential participation boundary while preserving a public, auditable aggregate.

## Product kernel

- Individual probability and stake stay confidential.
- A cohort aggregate becomes public only after a minimum-participant gate.
- The aggregate is executed through a narrow adapter to an unchanged open protocol.
- Owners can inspect their position, payout, and forecast score privately.
- An independent verifier checks conservation and execution without user plaintext.

## Explicit scope boundaries

- Membership, transaction timing, gas, market identity, and aggregate totals are public.
- `kMin` counts distinct addresses; it is not Sybil resistance and does not provide anonymity.
- The relayer improves liveness but holds no exclusive role, funds, or plaintext.
- Pre-execution cancellation can refund. Post-execution resolution depends on the market oracle.
- Private scoring is per epoch in the MVP; portable credentials are future work.

## Why one binary market

One complete lifecycle is easier to audit and demonstrate than several partial
integrations. Internally, outcome allocation is derived from an encrypted probability,
but the MVP exposes two outcomes only. The adapter boundary permits future protocols
without coupling them to confidential accounting.

## Product versus implementation

| Product requirement | MVP implementation | Extension point |
|---|---|---|
| Confidential signal | Nox encrypted stake and probability | Alternative attested compute backend |
| Useful public output | Deadline-based cohort aggregate | Threshold-triggered rolling aggregate |
| Open-protocol integration | Immutable adapter configuration | Additional adapter implementation |
| Non-custodial lifecycle | On-chain confidential pool | Equivalent account-abstraction escrow |
| Failure recovery | State-specific timeout paths | Governance-defined recovery policy |
