# PK-03A partial Sepolia adapter run

Status: `superseded`; this report is not G5 evidence.

The confirmed adapter runner at source commit `4ef78df` recorded all four
immutable, zero-custody deployments before ending without a final evidence result
because the G5 evidence directories did not exist. The spend ledger records every
receipt. Read-only follow-up confirmed the Chainlink target/runtime binding,
thresholds, and zero ETH balance. Neither adapter can hold collateral, so no funds
recovery action exists or is needed.

The resume runner redundantly created a fresh `stale` and `premature` pair and then
completed the full post-deployment check. The passed `PK-03A-ADAPTER` artifacts use
the initial `yes`/`no` pair and that follow-up negative pair. The original negative
pair remains documented as a harmless redundant, zero-custody test deployment. No
partial record counted as completion.
