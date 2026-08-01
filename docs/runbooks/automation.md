# Automation runbook

Automation is a liveness convenience, not a custody or correctness dependency.
The runner reads only public manifest-bound state and selects at most one safe
permissionless action.

## Safe operation

```sh
npm run doctor
npm run budget:status
npm run run:automation:sepolia -- --dry-run
npm run verify:automation:sepolia
```

Before write mode, confirm Sepolia, a clean source tree, the canonical manifest,
the action's current eligibility, gas estimate, and remaining spend allowance.
Record the receipt and re-read state after the transaction. Stop if the action is
no longer eligible, the runtime hash differs, or the ledger would exceed its cap.

## Failure handling

On timeout, duplicate, dropped, or replaced transactions, stop the loop, inspect
the receipt, and re-run the public action selector. Do not add a privileged keeper,
store owner-only values, or retry an action selected from stale cached state.
