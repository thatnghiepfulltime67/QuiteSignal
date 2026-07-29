# G1 confidential computation and ACL summary

Status: `passed`

FND-02 passed the isolated encrypted arithmetic feasibility check on Ethereum
Sepolia. The deployed harness runtime matches the compiled artifact. Ten required
vectors produced 33 expected public feasibility booleans; malformed proof, wrong
application context, wrong encrypted type, and uninitialized-handle calls were
rejected. The shared Sepolia preflight also rejected a probe address with no Nox
runtime code.

The two confirmed transactions consumed `4673595722586902` wei of the committed
gas allowance, leaving `495326404277413098` wei. The harness has no asset custody.
Evidence records public receipt hashes and bytecode hashes only; it contains no
confidential inputs, handles, proofs, calldata, signatures, or environment values.

FND-03 then passed direct Sepolia verification with two bytecode-matched ACL spikes
and a bytecode-matched transient recipient. The primary spike retained persistent
compute authority across transactions; the owner retained viewer-only authority;
unrelated, keeper, adapter, token, and transient-recipient compute attempts failed.
The owner-shaped handle could not be public-decrypted, while only the isolated
persistence and transient equality booleans were public-decrypted. Replay,
cross-spike, cross-chain, wrong-type, and uninitialized-input checks also failed as
required.

The eight confirmed FND-02 and FND-03 transactions consumed
`6681697863388837` wei of the committed gas allowance, leaving
`493318302136611163` wei. Every feasibility harness has no asset custody.
F-002 records the observed Nox gateway synchronization delay; F-003 records the
required owner/caller input-proof binding. G1 is passed. FND-04 must prove the
confidential-asset lifecycle before G2 can pass.
