# Sepolia spend ledger

The project began with a `0.5 ETH` gas allowance on Ethereum Sepolia. This is one
shared allowance across all phases; there are no per-phase limits.

On 2026-07-30, the user authorized one additional `0.5 ETH` of remaining gas for
this workspace after confirming the funded test wallet balance. The append-only
ledger is the authoritative current cap: `888104896476698447 wei` cumulative gas,
leaving `0.5 ETH` after receipts recorded through that authorization point.

## Rules

- Every write asserts chain id `11155111` and requires `CONFIRM_SEPOLIA_WRITE=yes`.
- A dry run shows the action, estimated maximum fee, and remaining allowance.
- Actual gas cost is recorded from the confirmed receipt.
- Failed and replaced transactions still count when they consume gas.
- Actor funding and transaction value are shown separately from gas cost.
- Stop before the next transaction could take cumulative gas above the current
  ledger cap.
- When the allowance is nearly exhausted, report usage and the next estimate to the
  user. Only the user may authorize a higher allowance; record the authorization
  date, new cap, and basis in this document before the next write.
- Never record private keys, mnemonics, signatures, RPC credentials, confidential
  inputs, handles, proofs, calldata, or environment dumps.

## Planned artifact

```text
evidence/sepolia/spend-ledger.json
```

Each entry contains only the work-item ID, phase, source commit, sender address,
transaction hash, block number, gas used, effective gas price, actual gas cost, and
UTC timestamp. `npm run budget:status` validates the ledger and prints cumulative
gas used and remaining allowance without exposing secrets.
