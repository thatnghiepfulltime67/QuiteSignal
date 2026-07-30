# PK-03A partial Sepolia adapter run

Status: `incomplete`; this is not G5 evidence.

The confirmed adapter runner at source commit `4ef78df` recorded two successful
immutable, zero-custody deployments before ending without a final evidence result.
The spend ledger records both receipts. Read-only follow-up confirmed their Chainlink
target/runtime binding, thresholds, and zero ETH balance. Neither adapter can hold
collateral, so no funds recovery action exists or is needed.

The follow-up must reuse these exact `yes` and `no` deployments, deploy only fresh
`stale` and `premature` cases, run the complete post-deployment checks, and create a
new passed PK-03A artifact. It must not count this partial record as completion or
repeat the two completed deployments.
