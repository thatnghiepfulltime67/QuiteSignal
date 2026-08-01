# Recovery runbook

This runbook is permissionless and public-state driven. Never use confidential
plaintext or a private backend to recover funds.

| Condition | Detect | Funds location | Safe action | Forbidden action |
|---|---|---|---|---|
| Aggregate request stalled before unwrap | public epoch remains aggregate-pending | confidential pool custody | wait for the bounded timeout, then call the documented permissionless timeout path | reveal owner handles or invent totals |
| Unwrap requested but automation unavailable | request is public and past its grace window | wrapper/unwrap request, then owner confidential custody | permissionlessly finalize when the proof is available, or use the timeout recovery after grace | retry with substituted proof/plaintext |
| Resolution pending | feed round is incomplete/stale or grace not elapsed | pool confidential custody | refresh public state; settle only the immutable condition or use refund after grace | submit caller-supplied outcome |
| Relayer duplicate/race/outage | receipt is missing or action already advanced | unchanged contract custody | re-read state and submit at most the single eligible action | send duplicate actions from a backend loop |
| RPC/Nox gateway degraded | bounded read/encryption retry exhausted | on-chain state unchanged | switch to a trusted Sepolia RPC or retry later; preserve the wallet session | paste encrypted material into support |
| Replacement/dropped transaction or account/network change | wallet reports replacement, rejection, or wrong chain | funds remain in contract unless receipt succeeded | inspect the receipt, reconnect the correct Sepolia account, and resubmit only an eligible action | treat a pending request as final |
| Manifest or target code mismatch | verifier rejects runtime/configuration | canonical deployment unchanged | stop the release and investigate the source/target revision | edit the manifest or bypass verification |

Capture only chain id, public contract addresses, receipt hashes, block numbers,
and sanitized error codes. Escalate any unknown funds location or privacy failure as
a stop-ship incident.
