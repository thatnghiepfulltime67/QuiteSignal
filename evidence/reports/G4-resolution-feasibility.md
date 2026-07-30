# G4 public-resolution feasibility report

Status: passed

## Scope

ADR-017 replaces external conditional-market execution, slippage handling, external
redemption, and third-party market custody with one unchanged public price-feed
resolution dependency. This report records only feasibility evidence for that
boundary. It does not claim that the price feed independently verifies real-world
truth, nor that the P1 product lifecycle has already been built.

## Selected target

- Network: Ethereum Sepolia (`11155111`)
- Target: Chainlink ETH/USD proxy `0x694AA1769357215DE4FAC081bf1f309aDC325306`
- Proxy runtime hash at verification: `0x9190afba2a699a9627d64ed68c7cc60e4005a8830b33183c4413b4e1a93b9ccd`
- ABI metadata: 8 decimals and `ETH / USD`
- Historical verification block: `11380856`
- Target source/provenance: official [Chainlink Data Feeds documentation](https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum) and the public [Chainlink source repository](https://github.com/smartcontractkit/chainlink)

The selected proxy is unchanged. Its public runtime, ABI response shape, and
historical round are recorded in the sanitized G4 evidence. The target never receives
pool or spike collateral.

## Sepolia smoke

The isolated `PriceFeedResolutionSpike` has immutable target, target runtime hash,
comparison, threshold, observation time, and maximum feed age. It has no payable
entry point, owner, upgrade entry point, token, Nox handle, or result-writing
function. Four fresh deployments completed at blocks `11380852` through `11380856`:

| Scenario | Result                                                             |
| -------- | ------------------------------------------------------------------ |
| `yes`    | A positive live feed answer satisfied immutable threshold `1`.     |
| `no`     | The same live feed answer failed immutable threshold `int256.max`. |
| `stale`  | Maximum feed age `1` rejected the real historical round.           |
| `future` | An observation time one hour ahead rejected resolution.            |

The runner also confirmed zero-target and zero-age configuration reverts, a
read-only zero-input resolution surface, target runtime binding, rejected an ETH
value transfer, and verified zero balances for every spike. Receipts and runtime
hashes are in `evidence/sepolia/G4/FND-06-RESOLUTION.json`.

The first pre-fix deployment at block `11380820` is documented in FND-06B. It has
zero collateral and is excluded from the passed evidence after its runner compared
unmasked Solidity immutable bytes. The corrected terminal evidence uses only the
four fresh deployments above.

## Independent verification

`npm run verify:g4:evidence` rechecks the committed source reachability, equal
offline/Sepolia artifacts, source runtime template, target runtime and historical
round, deployment receipts, immutable target configuration, both threshold results,
historical stale and premature reverts, value rejection, and zero balances. It passed
at the recorded historical block without a signer or write.

## Remaining P1 obligations

P1 must bind this target and condition in the immutable pool configuration, keep
collateral in confidential custody, derive payout from the proof-verified aggregate,
reject a stale or invalid result, and implement the permissionless
resolution-grace refund. Those are product requirements, not conclusions of this
feasibility spike.
