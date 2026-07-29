# Sepolia spend ledger

The project may freely use an initial `0.5 ETH` gas allowance on Ethereum Sepolia.
This is one shared allowance across all phases; there are no per-phase limits.

## Rules

- Every write asserts chain id `11155111` and requires `CONFIRM_SEPOLIA_WRITE=yes`.
- A dry run shows the action, estimated maximum fee, and remaining allowance.
- Actual gas cost is recorded from the confirmed receipt.
- Failed and replaced transactions still count when they consume gas.
- Actor funding and transaction value are shown separately from gas cost.
- Stop before the next transaction could take cumulative gas above `0.5 ETH`.
- When the allowance is nearly exhausted, report usage and the next estimate to the
  user. Only the user may authorize a higher allowance.
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
