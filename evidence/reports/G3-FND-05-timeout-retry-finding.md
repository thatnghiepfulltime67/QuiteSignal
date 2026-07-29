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

The retry increases the aggregate timeout enough to make the negative case stable
on Sepolia and stores the generated secondary test key only in a local ignored,
owner-readable recovery record until both owner refunds are verified. The record is
deleted on terminal success and is never included in Git, evidence, logs, or chat.
