# G2 confidential asset lifecycle summary

Status: `passed`

FND-04 passed direct Ethereum Sepolia verification using an unchanged inherited Nox
ERC20-to-ERC7984 wrapper and three bytecode-matched isolated lifecycle spikes. The
receiver registers a caller-bound encrypted expected stake, snapshots its permitted
wrapper balance, derives the encrypted delta during callback, and returns encrypted
delta equality to the wrapper. A mismatch is refunded atomically by the wrapper;
only the equality boolean is public-decryptable for state acceptance.

The final run verified direct return, mismatch rejection, delayed unwrap recovery,
proof-gated finalization, measured public balance delta, rewrap, and recovered owner
return. It completed 13 lifecycle and 18 negative assertions, then a read-only
verification matched five runtime templates and terminal states. No confidential
amount, raw handle, proof, calldata, signature, or environment value is in evidence.

The final sixteen receipts used `7829785950956647` wei. The Sepolia spend ledger
totals `33843100191692968` wei, leaving `466156899808307032` wei of the committed
allowance. An earlier pre-fix isolated spike retains valueless fixture collateral
because its immutable bytecode lacks a later-discovered transient ACL grant. Its
public address and exclusion are recorded in F-007; it is not a product custody
state and is not reused.

G2 is passed. FND-05 must now prove aggregate disclosure and recovery semantics
before G3 can pass.
