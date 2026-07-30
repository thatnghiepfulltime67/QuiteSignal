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

The fourth fresh attempt from source commit `cc2b438` used the forced Solidity
build and deployed fixture `0x504e30b11860d5c85efc2f098b03582e1710067e`, unchanged
wrapper `0x574bdcd473425c78c0b68c5d5a0a8feb3943937e`, and isolated spikes
`0x6f0bdbc7cb469a056a8137a426117ec2f857510f`,
`0x22a27c2794f3a5f7420e4257bfa4124bb44cc224`, and
`0xb4b65e4accb462f71343d70fce5560aba264523c` at blocks `11378485` through
`11378526`. The below-k branch completed and refunded. The timeout spike has two
accepted fixture members, entered `AGGREGATE_PENDING` at timestamp `1785365568`,
and exposes exactly its YES/NO aggregates; it has neither a cancellation nor a
refund receipt. The runner did not emit a terminal result after the aggregate
request, so its early-timeout rejection is deliberately not counted as G3 evidence.

The retained, ignored secondary-actor recovery record permits a dedicated recovery
to cancel the now-expired timeout spike and return both deterministic fixture
stakes. The recovery must complete and be documented before a staged fresh run is
attempted. This attempt remains excluded from gate evidence; it contains no product
asset or customer custody.

That recovery completed at blocks `11379485` through `11379488`. A permissionless
secondary actor cancelled the expired timeout, then the deployer and secondary owner
each refunded once. Local owner decryption verified the planned terminal fixture
balances without recording plaintext or handles. The ignored recovery record was
deleted only after that check. The fourth attempt therefore has no remaining fixture
custody and remains excluded from G3 evidence because it was non-terminal.

The fifth fresh attempt from source commit `1d1c69f` deployed fixture
`0x58efcb66dce89743b2ecf293b0ea12450a286524`, unchanged wrapper
`0x37e364e0d521425b2caf07336e7e1448d248288e`, and timeout spike
`0x056d4605f541f7f9d374372c59bccc93bda3c750` at blocks `11379507` through
`11379548`. It completed the below-k refund and committed two independent threshold
members. The epoch entered aggregate pending at timestamp `1785378192` and requested
aggregate disclosure, but the RPC `eth_call` that was intended to observe an early
timeout revert did not return. No cancellation or refund write was sent. A later
read found the same spike still aggregate pending after its timeout; therefore this
is a runner RPC-observation failure, not a contract result.

The next runner revision will use a bounded, real Sepolia transaction that must
produce a `reverted` receipt before the timeout instead of an unbounded simulation.
The fifth fixture will first be recovered with the retained ignored actor record;
both its deterministic stakes remain recoverable and no product custody is present.

The fifth-attempt recovery completed at blocks `11379571` through `11379574`.
It cancelled permissionlessly, completed both one-time confidential refunds, checked
the two terminal owner balances locally with bounded gateway retries, and deleted
the ignored recovery record. The fifth fixture has no remaining custody and remains
excluded from G3 evidence.

The runner now bounds RPC observation calls and treats a transport failure as a test
failure rather than a negative assertion. Its next early-timeout check will send a
fixed-gas Sepolia transaction that must have a `reverted` receipt before the timeout;
the failed transaction cost is recorded in the spend ledger. This gives a stronger
chain-native result without treating RPC availability as protocol evidence.

The sixth fresh attempt from source commit `ecefae9` deployed fixture
`0x33f1dbbbb5d8d2ca5ad5bfde9ebed26bc47b3402`, unchanged wrapper
`0xe9d3c7d76ed48272f363517349dba7acc43a6b06`, and below-k spike
`0x4378f7fbb7f2f2c3a06b2398901efa09a52b6e71` at blocks `11379587` through
`11379611`. It completed the below-k deadline, verified no aggregate access by
read-only state, and returned the sole committed stake. The runner was then stopped
before a threshold commitment because the remaining negative checks still used RPC
simulation. This attempt is excluded from G3 evidence. Its independent actor never
committed; its ignored local key was deleted without being printed or recorded.

The next runner revision records every contract-state negative assertion as a
bounded Sepolia transaction with an expected-revert receipt. Nox gateway decryption
denials remain an off-chain observation, but are bounded and fail the run if the
gateway does not return a result; no transport timeout is accepted as evidence.

The seventh fresh attempt from source commit `715bef5` deployed fixture
`0x4b317e2379456b26bbe68767e05a6707f7341380`, unchanged wrapper
`0xdad15c2ec05442ca55f6834a05865265fb6e028f`, and timeout spike
`0xc2e11c9358110b0a840d3c342629d912ddad299b` at blocks `11379629` through
`11379667`. It completed the below-k path and recorded real expected-revert receipts
for early close, duplicate refund, and early timeout cancellation. The timeout spike
entered aggregate pending at `1785379632`, but the runner's block polling retained a
cached value after the on-chain timeout elapsed. No cancellation or timeout refund
was sent. This is a runner cache defect, not a protocol outcome; the fixture remains
recoverable through its retained ignored actor record and is excluded from G3.

The seventh-attempt recovery completed at blocks `11379685` through `11379687`.
It cancelled permissionlessly, refunded both owners once, verified the terminal
confidential balances locally, and deleted the ignored actor record. The fixture has
no remaining contract custody and remains excluded from G3 evidence.

The public feasibility client now disables response caching. Every lifecycle wait
must therefore observe a fresh Ethereum Sepolia block timestamp; an unavailable RPC
response remains a failing observation rather than a pass condition.

The eighth fresh attempt from source commit `5d719a7` deployed fixture
`0x7030020b8def6ec1525139cab662a726b7eec68d`, unchanged wrapper
`0xba9f988ecc52947537dcbebe9435d74bc7194cd6`, and timeout spike
`0xfb9be2653c1d3cb183ab6d1917d7a20f825acb57` at blocks `11379697` through
`11379735`. It completed the below-k path and recorded early close, duplicate refund,
and early timeout expected-revert receipts. The Viem lifecycle polling loop again did
not advance after the state-entry timeout elapsed, despite disabled cache. No timeout
cancellation or refund was sent. This is an orchestration defect; the fixture is
recoverable with its ignored actor record and excluded from G3 evidence.

The eighth-attempt recovery completed at blocks `11379758` through `11379760`.
It cancelled permissionlessly, refunded both owners, verified terminal confidential
balances locally, and deleted the ignored actor record. The fixture has no remaining
contract custody and remains excluded from G3 evidence.

Lifecycle waits now use bounded direct `eth_getBlockByNumber("latest")` requests
before and after a timestamp-derived wait. This avoids client-cache and polling-loop
semantics; an unavailable or malformed RPC response fails the run.
