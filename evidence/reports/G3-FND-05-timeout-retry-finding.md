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

The ninth fresh attempt from source commit `7fb9f7a` stopped intentionally after
setup at blocks `11379777` through `11379786`, before any confidential commitment,
Nox request, aggregate-state transition, or recovery action. It deployed fixture
`0xf5f5fc79772431696a99a5d6aa1c47804f90a771`, unchanged wrapper
`0x50aa1fa64f3b41b7a89de895f101ff1d8358a755`, and isolated below-k, timeout, and
recovery spikes `0xeb4546c180911f088dff19b0c9471601f0b11d96`,
`0x4440bbcd29f088521bbb9355c1e46156b76b2fdc`, and
`0xc91afc510d8ef06c980e6b115f1914dcf60720b3`. The writes are limited to those
deployments, deterministic fixture preparation, and bounded gas funding for an
unused secondary actor. No spike received confidential collateral and no actor
submitted a confidential input. The unused, ignored actor recovery record was
deleted. This setup is excluded from G3 evidence; its public receipts remain in the
append-only spend ledger. The next implementation replaces the monolithic runner
with terminal, independently recoverable Sepolia evidence slices.

The first FND-05A below-k slice execution began from source commit `2a05bbe` and
then continued while source documentation was being recorded. It deployed fixture
`0x25084db2acfd1c400e59d65d02310430996bb3e1`, unchanged wrapper
`0x05ec79b891619657e30aad419b8a080c8dca6a15`, and below-k spike
`0xdb9b227c90614ca0a17554bd8fc4ba2e634bf2e7` at blocks `11379845` through
`11379847`. At blocks `11379849` through `11379856` it minted and wrapped only
deterministic fixture collateral, registered and finalized one encrypted member,
and recorded a real reverted early `closeEpoch` transaction at block `11379857`.

The execution did not retain an active runner through its bounded deadline wait, so
it made no close or refund write. A read at the recorded spike confirms `Open` state,
one finalized participant, `PoolConfidentialCustody` for that member's fixture
collateral, and no aggregate-decrypt access. The fixture is not terminal and cannot
count as FND-05A evidence. Its deterministic collateral has a known location and is
recoverable without a secondary actor: a resume command must close below k after the
already reached deadline and refund the same owner exactly once before any fresh
fixture is started.

The bounded FND-05A resume from `496f9ea` completed at blocks `11379884` through
`11379888`: it closed below k, confirmed no aggregate public-decrypt access, refunded
the one owner, rejected the duplicate refund, and verified the owner's confidential
balance against the deterministic fixture baseline without recording the value.
Runtime/template verification passed. The terminal evidence is
`evidence/offline/G3/FND-05-BELOW-K.json` and
`evidence/sepolia/G3/FND-05-BELOW-K.json`. This completes FND-05A only; FND-05B and
FND-05C remain required for G3.

The first FND-05B execution from `9740e9a` deployed fixture
`0xeb9a2aaf8575ae74c3b613e22482dfaa0ddf62ba`, unchanged wrapper
`0x3f6b508f63a015933b62540f661017f8559424c0`, and its one threshold timeout spike
`0x6af71d5b9427d5f07e6cf5a939ff07a60a6eff45` at blocks `11379937` through
`11379939`. It prepared deterministic fixture collateral and finalized two
independently signed encrypted commitments at blocks `11379940` through `11379953`.
The runner ended before the commitment deadline without a close, aggregate request,
timeout cancellation, or refund write. A read confirms `Open` state, two
participants, `PoolConfidentialCustody`, and no aggregate public-decrypt access.
The ignored secondary-actor recovery record remains solely for this fixture. This is
non-terminal and excluded from FND-05B evidence. A resume must close after the
deadline, prove exactly YES/NO aggregate disclosure and early cancellation rejection,
then retain the actor record until a terminal timeout cancellation and both refunds.

The bounded advance command from `8bdd012` completed at blocks `11379975` through
`11379978`: it closed the threshold epoch, granted public-decrypt access to exactly
the YES and NO aggregates, and recorded a reverted early cancellation. The spike is
now `AGGREGATE_PENDING`; its timeout has elapsed and the secondary recovery record
remains locally retained. The next action is the existing permissionless cancellation
and two owner refunds. The first recovery invocation was correctly stopped by the
clean-source guard because these advance receipts were not yet committed; it sent no
recovery write.

The terminal recovery completed at blocks `11380016` through `11380018`: a
permissionless secondary caller cancelled the expired aggregate-pending epoch, then
the deployer and secondary owner each refunded once. The runner verified both owner
balances locally and deleted the ignored secondary-actor record. The append-only
ledger labels these three recovery receipts `FND-05` because the historical recovery
command predates the FND-05B split; their fixture, source commit, senders, and report
context bind them unambiguously to FND-05B. This is evidence, not a hidden relabel.

The first independent FND-05C execution from `62aecd6` created a fresh fixture,
unchanged wrapper, recovery spike, and no-custody proof-context peer at blocks
`11380070` through `11380073`. It prepared deterministic test collateral and
finalized two independently signing confidential commitments through block
`11380086`, then exited before the close deadline and without an aggregate request,
proof finalization, unwrap, recovery, or refund. A post-exit Ethereum Sepolia read
confirmed the recovery spike remains `Open` with two participants and no aggregate
public-decrypt access; the peer is `Open` with zero participants. No aggregate
plaintext, handle, proof, calldata, or local actor material was recorded. This
fixture is excluded from FND-05C evidence. The ignored actor record is retained so a
dedicated resume command can complete this exact fixture terminally before another
FND-05C fixture is considered.

The first FND-05C resume from `f1b1026` verified that fixture's exact `Open`
two-member state, but its shared runner still performed generic fixture setup before
entering the resume state machine. It minted, wrapped, and distributed additional
deterministic fixture collateral at blocks `11380114` through `11380119`, then
stopped during the existing-owner commitment preflight without submitting a
recovery-spike transaction. The spike remains `Open` with no aggregate request or
public-decrypt access. The additional valueless collateral is confined to the
wrapper and changes only the local test-owner baselines; it is not pool or product
custody. This unsuccessful resume is excluded from evidence. The correction skips
all setup writes and derives each refund baseline from the observed owner balance
plus its recorded committed stake before completing this same fixture.

The corrected FND-05C resume from `5116871` made no setup write. At blocks
`11380145` and `11380146`, it closed the already-expired epoch and requested
aggregate disclosure. A read confirms the expected YES/NO-only public-decrypt scope.
At blocks `11380148` and `11380149`, cross-pool and wrong-chain
`finalizeAggregate` calls reverted on Ethereum Sepolia. The process stopped before
the remaining wrong-epoch, substituted-value, valid-proof, unwrap, delayed recovery,
and terminal refund checks. The spike is `AGGREGATE_PENDING` and its ignored actor
record remains local. This is a resumable partial proof sequence, not FND-05C gate
evidence; the next runner revision continues only the outstanding state-machine
operations.
