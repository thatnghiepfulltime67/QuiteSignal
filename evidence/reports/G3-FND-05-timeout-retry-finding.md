# G3 FND-05 timeout retry finding

Status: `open; G3 remains running`

The first FND-05 run deployed an isolated Ethereum Sepolia fixture, an unchanged
inherited Nox ERC20-to-ERC7984 wrapper, and three aggregate lifecycle spikes at
blocks `11378261` through `11378266`. It passed the below-k branch through one
confidential refund. Its timeout branch accepted two independently signing fixture
members, closed at threshold, and marked only the YES/NO aggregate handles publicly
decryptable.

The harness configured a 45-second aggregate timeout. On the live network that
window elapsed before the negative `cancelBeforeUnwrap` call was evaluated: the
call was valid instead of reverting, so the runner correctly stopped rather than
claiming an early-timeout rejection. No cancellation or refund transaction was
sent for that timeout spike. This is a test-window design error, not evidence that
the contract bypasses its timeout guard.

The isolated timeout spike
`0x4fdeb45b1e6ff87cd60c71967ced0e78b32d7414` remains in `AGGREGATE_PENDING` with
only deterministic valueless fixture collateral in confidential custody. The
deployer's portion remains owner-refund-recoverable after permissionless timeout
cancellation. The second test actor's process-local key was intentionally never
printed or stored, and the failed process ended before that actor could refund; its
fixture portion is therefore excluded permanently. There is no product asset,
customer key, or production deployment at these addresses, and none of these
contracts may be reused by a retry.

The first retry increased the timeout, but exposed the deeper cause: the harness
started that timeout at the commit deadline rather than when the epoch entered
`AGGREGATE_PENDING`. A multi-user live sequence can therefore consume the entire
window before any aggregate request. The retry stopped at `AGGREGATE_PENDING` before
executing cancellation or refund. The correction records the aggregate-pending entry
time on-chain and starts the timeout there, matching the documented state machine.

The current retry's secondary actor key is retained only in a local ignored,
owner-readable recovery record. A dedicated recovery run will cancel its legacy
timeout spike and return both deterministic fixture stakes before the fresh retry is
started. The record is deleted only after terminal refunds are verified and is never
included in Git, evidence, logs, or chat.

Legacy recovery completed on Ethereum Sepolia at blocks `11378407` through
`11378410`. A permissionless caller cancelled the second attempt's timeout spike,
then both recorded owners refunded their deterministic fixture stakes. The recovery
runner decrypted each resulting owner balance locally, verified the planned terminal
balances, and deleted the ignored secondary-actor recovery record only after those
checks passed. The three receipts are recorded in the append-only spend ledger. The
first attempt's separately documented process-local-key residue remains excluded;
the recovered second attempt has no remaining fixture custody.

The third fresh attempt was stopped before cancellation or refunds after its
aggregate request. Its source change had not reached the generated artifact because
Hardhat's incremental build reported no Solidity work, so the deployed harness
retained the prior timeout behavior. The compile command now forces every Solidity
rebuild. The third attempt's independent test actor recovery record remains local
and ignored, enabling its legacy timeout spike to be cancelled and both fixture
stakes to be returned before another fresh attempt starts.

The third-attempt legacy recovery completed at blocks `11378471` through
`11378474` using the same permissionless cancellation and owner-refund checks. Its
local secondary-actor recovery record was deleted only after both terminal owner
balances were verified. The third attempt has no remaining fixture custody.
