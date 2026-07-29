# G1 confidential computation and ACL summary

Status: `running`

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

G1 is not passed. FND-03 must still prove persistent handle authority, owner-only
viewer access, unauthorized access failure, and aggregate-only public-decrypt scope
directly on Sepolia. F-002 records the observed Nox gateway synchronization delay;
the verification runner now uses a bounded retry and rechecks runtime bytecode
before verifying an existing harness.
